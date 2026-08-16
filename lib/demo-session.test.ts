// Tests for the demo session cookie.
//
// The service_role client bypasses RLS, so `workflows.session_id` is the only
// thing separating one visitor's workflows from another's. That makes the
// signature on this cookie the boundary the whole scoping scheme rests on —
// forge a cookie and you own someone else's records. Worth testing directly.

import { beforeAll, describe, expect, it } from "vitest";
import { createDemoSession, readDemoSessionId } from "./demo-session";

beforeAll(() => {
  process.env.DEMO_SESSION_SECRET = "test-secret-for-vitest";
});

describe("createDemoSession", () => {
  it("mints a 32-character hex id with a signature attached", async () => {
    const { id, value } = await createDemoSession();

    expect(id).toMatch(/^[0-9a-f]{32}$/);
    expect(value.startsWith(`${id}.`)).toBe(true);
    expect(value.length).toBeGreaterThan(id.length + 1);
  });

  it("does not repeat ids", async () => {
    const ids = new Set<string>();
    for (let i = 0; i < 50; i++) {
      ids.add((await createDemoSession()).id);
    }

    expect(ids.size).toBe(50);
  });
});

describe("readDemoSessionId", () => {
  it("round-trips a cookie it minted", async () => {
    const { id, value } = await createDemoSession();

    expect(await readDemoSessionId(value)).toBe(id);
  });

  // The attack this exists to stop: name someone else's session id and hand it
  // back without a valid signature.
  it("rejects an id presented with no signature", async () => {
    const { id } = await createDemoSession();

    expect(await readDemoSessionId(id)).toBeNull();
    expect(await readDemoSessionId(`${id}.`)).toBeNull();
    expect(await readDemoSessionId(`${id}.not-a-signature`)).toBeNull();
  });

  it("rejects a valid signature paired with a different id", async () => {
    const first = await createDemoSession();
    const second = await createDemoSession();
    const firstSignature = first.value.slice(first.value.lastIndexOf(".") + 1);

    expect(await readDemoSessionId(`${second.id}.${firstSignature}`)).toBeNull();
  });

  it("rejects a tampered signature of the right length", async () => {
    const { value } = await createDemoSession();
    const separator = value.lastIndexOf(".");
    const id = value.slice(0, separator);
    const signature = value.slice(separator + 1);

    // Flip one character, keeping the length identical so the early
    // length check in safeEqual is not what does the rejecting.
    const flipped =
      (signature[0] === "A" ? "B" : "A") + signature.slice(1);

    expect(await readDemoSessionId(`${id}.${flipped}`)).toBeNull();
  });

  // The id format check runs before the hash, and it is also what guarantees
  // no cookie can present a value the app treats specially.
  it("rejects ids that are not the minted shape", async () => {
    expect(await readDemoSessionId("system.whatever")).toBeNull();
    expect(await readDemoSessionId("../../etc/passwd.sig")).toBeNull();
    expect(await readDemoSessionId("ABCDEF0123456789abcdef0123456789.x")).toBeNull();
  });

  it("rejects empty and malformed values", async () => {
    expect(await readDemoSessionId(undefined)).toBeNull();
    expect(await readDemoSessionId(null)).toBeNull();
    expect(await readDemoSessionId("")).toBeNull();
    expect(await readDemoSessionId(".")).toBeNull();
    expect(await readDemoSessionId("nodothere")).toBeNull();
  });
});
