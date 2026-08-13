// Eval harness for the RAG context compiler in this file (retrieval,
// ranking, packing, templating, and the compiled-input artifact).
//
// https://cataluma.com/blog/llm-eval-shipping-workflows
//
// This suite deliberately does not call generateBiography/generateText —
// per "Absolute scores matter, but most release bugs are introduced by a
// change" and "Watch for false confidence from evaluator models", the
// highest-value tests here are on the deterministic compiler layer
// (retrieveBiographyReferences, buildCompiledInput), not on live model
// output.

import { describe, expect, it } from "vitest";
import {
  buildCompiledInput,
  retrieveBiographyReferences,
  type BioReferenceDocument,
  type BiographyGenerationInput,
} from "./biography-generation";

// Fixture reference docs, mirroring scripts/001_create_workflows_table.sql's
// seed data. Section: "Build a task-set that mirrors product traffic" —
// these stand in for real bio_reference_documents rows.
const REFERENCE_DOCS: BioReferenceDocument[] = [
  {
    title: "Executive biography guidance",
    category: "executive",
    content:
      "Executive biographies should lead with scope of responsibility, strategic impact, leadership style, and measurable business outcomes.",
  },
  {
    title: "Engineering biography guidance",
    category: "engineering",
    content:
      "Engineering biographies should emphasize technical depth, systems built, collaboration across teams, product impact, and practical problem solving.",
  },
  {
    title: "Design biography guidance",
    category: "design",
    content:
      "Design biographies should highlight user-centered thinking, product craft, research or prototyping strengths, cross-functional collaboration.",
  },
  {
    title: "Founder biography guidance",
    category: "founder",
    content:
      "Founder biographies should connect the person's background to the problem they are solving, describe company-building experience.",
  },
  {
    title: "General professional biography guidance",
    category: "general",
    content:
      "A strong professional biography opens with the person's current role, summarizes relevant experience, includes a few concrete strengths.",
  },
];

// Minimal fake of the Supabase chain retrieveBiographyReferences uses:
// .from("bio_reference_documents").select(...).limit(20)
function fakeSupabase(rows: BioReferenceDocument[]) {
  return {
    from: () => ({
      select: () => ({
        limit: async () => ({ data: rows, error: null }),
      }),
    }),
  } as unknown as Parameters<typeof retrieveBiographyReferences>[0];
}

const engineeringInput: Pick<BiographyGenerationInput, "occupation" | "skills"> = {
  occupation: "Software Engineer",
  skills: ["TypeScript", "React"],
};

describe("retrieveBiographyReferences — invariance suite", () => {
  // Task labeled by failure mode: wrong context ordering. Postgres does not
  // guarantee row order without ORDER BY, so a compiler that isn't stable
  // under row-order changes will non-deterministically send different
  // reference docs to the model between otherwise-identical runs.
  // Section: "Add invariance and sensitivity suites" — row_order_shuffle
  it("selects the same top references regardless of source row order", async () => {
    const forward = await retrieveBiographyReferences(
      fakeSupabase(REFERENCE_DOCS),
      engineeringInput,
    );
    const shuffled = await retrieveBiographyReferences(
      fakeSupabase([...REFERENCE_DOCS].reverse()),
      engineeringInput,
    );

    expect(shuffled.map((d) => d.title)).toEqual(forward.map((d) => d.title));
  });

  // Same failure mode, but with two documents that score an exact tie.
  // Array.prototype.sort is stable, so without an explicit tie-break the
  // relative order of tied documents is whatever order the rows arrived
  // in — reversing the source rows silently reverses which document leads
  // in the prompt. This is the row_order_shuffle case that actually
  // exercises the bug: the earlier test above has no scoring ties, so it
  // stays green even without the tie-break fix.
  it("keeps tied-score documents in a stable order regardless of source row order", async () => {
    const tiedDocs: BioReferenceDocument[] = [
      {
        title: "Alpha guidance",
        category: "alpha",
        content: "shared keyword appears here",
      },
      {
        title: "Beta guidance",
        category: "beta",
        content: "shared keyword appears here",
      },
    ];
    const tiedInput: Pick<BiographyGenerationInput, "occupation" | "skills"> = {
      occupation: "shared",
      skills: ["keyword"],
    };

    const forward = await retrieveBiographyReferences(
      fakeSupabase(tiedDocs),
      tiedInput,
    );
    const reversed = await retrieveBiographyReferences(
      fakeSupabase([...tiedDocs].reverse()),
      tiedInput,
    );

    expect(reversed.map((d) => d.title)).toEqual(forward.map((d) => d.title));
  });
});

describe("retrieveBiographyReferences — sensitivity suite", () => {
  // Task labeled by failure mode: missing context. A relevant doc that
  // matches the occupation/skills should surface in the results.
  // Section: "Add invariance and sensitivity suites" — one relevant row
  it("surfaces a newly added document that matches the query", async () => {
    const withoutMatch = await retrieveBiographyReferences(
      fakeSupabase(REFERENCE_DOCS.filter((d) => d.category !== "engineering")),
      engineeringInput,
    );
    expect(withoutMatch.some((d) => d.category === "engineering")).toBe(false);

    const withMatch = await retrieveBiographyReferences(
      fakeSupabase(REFERENCE_DOCS),
      engineeringInput,
    );
    expect(withMatch.some((d) => d.category === "engineering")).toBe(true);
  });

  // Task labeled by failure mode: missing context / fallback path. When no
  // document matches, the compiler should fall back to the general-category
  // doc rather than sending an empty context block to the model.
  it("falls back to the general-category document when nothing matches", async () => {
    const noMatchInput: Pick<BiographyGenerationInput, "occupation" | "skills"> = {
      occupation: "Astronaut",
      skills: ["Orbital mechanics"],
    };

    const references = await retrieveBiographyReferences(
      fakeSupabase(REFERENCE_DOCS),
      noMatchInput,
    );

    expect(references).toHaveLength(1);
    expect(references[0].category).toBe("general");
  });
});

describe("buildCompiledInput — versioned artifact", () => {
  const input: BiographyGenerationInput = {
    name: "Ada Lovelace",
    occupation: "Software Engineer",
    yearsOfExperience: 8,
    skills: ["TypeScript", "React"],
    achievements: "Shipped several products",
    interests: "Mathematics",
  };

  // Section: "Version the full input contract" — the same recipient input
  // and references must compile to the same fingerprint, so a fingerprint
  // change in CI reliably signals an actual input-contract change.
  it("is deterministic for identical input", () => {
    const first = buildCompiledInput(input, REFERENCE_DOCS.slice(0, 2));
    const second = buildCompiledInput(input, REFERENCE_DOCS.slice(0, 2));

    expect(second.fingerprint).toBe(first.fingerprint);
  });

  // Task labeled by failure mode: context-path drift. Different retrieved
  // references must change the fingerprint, since they change what the
  // model actually sees.
  it("changes fingerprint when the retrieved references change", () => {
    const withEngineering = buildCompiledInput(input, [REFERENCE_DOCS[1]]);
    const withDesign = buildCompiledInput(input, [REFERENCE_DOCS[2]]);

    expect(withEngineering.fingerprint).not.toBe(withDesign.fingerprint);
  });

  it("stamps the compiler, prompt, and model versions onto the artifact", () => {
    const compiled = buildCompiledInput(input, REFERENCE_DOCS.slice(0, 1));

    expect(compiled.compilerVersion).toBeTruthy();
    expect(compiled.promptVersion).toBeTruthy();
    expect(compiled.modelName).toBeTruthy();
  });
});
