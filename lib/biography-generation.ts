import { generateText } from "ai";
import { createHash } from "node:crypto";
import type { RecipientInfo } from "./workflow-types";
import type { createClient } from "./supabase/server";

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

// Versions for the retrieval/packing compiler and the prompt template.
// Bump these when either changes so a regression can be attributed to a
// specific compiler or template revision instead of "the model got worse."
// https://cataluma.com/blog/llm-eval-shipping-workflows — "Version the full input contract"
export const RETRIEVAL_COMPILER_VERSION = "retrieval-v1";
export const PROMPT_TEMPLATE_VERSION = "prompt-v1";
export const MODEL_NAME = "openai/gpt-5-mini";
const MODEL_PARAMS = { maxOutputTokens: 500, temperature: 0.7 } as const;

export type BioReferenceDocument = {
  title: string;
  category: string;
  content: string;
};

export type BiographyGenerationInput = {
  name: string;
  occupation: string;
  yearsOfExperience: number;
  skills: string[];
  achievements?: string;
  interests?: string;
};

export type BiographyGenerationResult = {
  text: string;
  prompt: string;
  references: BioReferenceDocument[];
  compiledInput: CompiledInput;
};

// The compiled-input artifact: exactly what the model will consume after
// retrieval, ranking, and templating, plus the versions that produced it.
// This is the replay boundary — persisting it lets a regression be traced
// to "the compiler produced different input" versus "the model behaved
// differently on the same input."
// https://cataluma.com/blog/llm-eval-shipping-workflows — "Recommendation: create a compiled-input artifact boundary"
export type CompiledInput = {
  compilerVersion: string;
  promptVersion: string;
  modelName: string;
  modelParams: typeof MODEL_PARAMS;
  recipientInput: BiographyGenerationInput;
  references: BioReferenceDocument[];
  prompt: string;
  fingerprint: string;
};

// Deterministic stringify with sorted object keys, mirroring the
// `json.dumps(..., sort_keys=True)` fingerprinting approach in
// https://cataluma.com/blog/llm-eval-shipping-workflows, so key-order
// differences upstream never change the fingerprint.
function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
      a.localeCompare(b),
    );
    return `{${entries
      .map(([key, val]) => `${JSON.stringify(key)}:${stableStringify(val)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export function buildCompiledInput(
  input: BiographyGenerationInput,
  references: BioReferenceDocument[],
): CompiledInput {
  const prompt = buildBiographyPrompt(input, references);
  const fingerprint = createHash("sha256")
    .update(
      stableStringify({
        compilerVersion: RETRIEVAL_COMPILER_VERSION,
        promptVersion: PROMPT_TEMPLATE_VERSION,
        modelName: MODEL_NAME,
        modelParams: MODEL_PARAMS,
        recipientInput: input,
        references,
        prompt,
      }),
    )
    .digest("hex");

  return {
    compilerVersion: RETRIEVAL_COMPILER_VERSION,
    promptVersion: PROMPT_TEMPLATE_VERSION,
    modelName: MODEL_NAME,
    modelParams: MODEL_PARAMS,
    recipientInput: input,
    references,
    prompt,
    fingerprint,
  };
}

function normalizeSearchTerm(value: unknown) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function scoreReferenceDocument(
  document: BioReferenceDocument,
  searchTerms: string[],
) {
  const searchableText =
    `${document.title} ${document.category} ${document.content}`.toLowerCase();

  return searchTerms.reduce((score, term) => {
    return searchableText.includes(term) ? score + 1 : score;
  }, 0);
}

export function recipientInfoToBiographyInput(
  recipientInfo: RecipientInfo,
): BiographyGenerationInput {
  return {
    name: recipientInfo.name,
    occupation: recipientInfo.occupation,
    yearsOfExperience: recipientInfo.yearsOfExperience,
    skills: recipientInfo.skills,
    achievements: recipientInfo.achievements,
    interests: recipientInfo.interests,
  };
}

export async function retrieveBiographyReferences(
  supabase: SupabaseClient,
  input: Pick<BiographyGenerationInput, "occupation" | "skills">,
) {
  const { data, error } = await supabase
    .from("bio_reference_documents")
    .select("title, category, content")
    .limit(20);

  if (error) {
    console.error(
      "Biography generation - Error retrieving biography references:",
      error,
    );
    return [];
  }

  const searchTerms = [
    ...normalizeSearchTerm(input.occupation),
    ...(input.skills || []).flatMap((skill) => normalizeSearchTerm(skill)),
  ];

  const rankedReferences = ((data || []) as BioReferenceDocument[])
    .map((document) => ({
      document,
      score: scoreReferenceDocument(document, searchTerms),
    }))
    // Tie-break by title: Postgres doesn't guarantee row order without an
    // ORDER BY, so two equal-score documents could otherwise flip position
    // between runs and silently change which references reach the prompt.
    // https://cataluma.com/blog/llm-eval-shipping-workflows — "Add invariance and sensitivity suites" (row_order_shuffle)
    .sort(
      (a, b) => b.score - a.score || a.document.title.localeCompare(b.document.title),
    );

  const matches = rankedReferences.filter(({ score }) => score > 0).slice(0, 3);

  if (matches.length > 0) {
    return matches.map(({ document }) => document);
  }

  return rankedReferences
    .filter(({ document }) => document.category === "general")
    .slice(0, 1)
    .map(({ document }) => document);
}

export function buildBiographyPrompt(
  input: BiographyGenerationInput,
  references: BioReferenceDocument[],
) {
  const retrievedContext = references
    .map(
      (reference) =>
        `Title: ${reference.title}\nCategory: ${reference.category}\n${reference.content}`,
    )
    .join("\n\n");

  return `Use the retrieved reference material below to guide the biography's tone, structure, and emphasis.

Retrieved reference material:
${retrievedContext || "No matching reference material was found."}

Generate a concise and engaging professional biography for ${input.name}, who is a ${input.occupation} with ${input.yearsOfExperience} years of experience.

Skills: ${input.skills.join(", ")}.
Achievements: ${input.achievements || "None provided"}.
Interests: ${input.interests || "None provided"}.

Keep the biography under 300 words, make it professional yet personable, and do not mention the retrieved reference material directly.`;
}

export async function generateBiography(
  supabase: SupabaseClient,
  input: BiographyGenerationInput,
) {
  const references = await retrieveBiographyReferences(supabase, input);
  const compiledInput = buildCompiledInput(input, references);

  console.log(
    "Biography generation - Retrieved biography references:",
    references.map((reference) => reference.title),
  );
  console.log(
    "Biography generation - Compiled input fingerprint:",
    compiledInput.fingerprint,
  );

  const { text } = await generateText({
    model: compiledInput.modelName,
    prompt: compiledInput.prompt,
    maxOutputTokens: compiledInput.modelParams.maxOutputTokens,
    temperature: compiledInput.modelParams.temperature,
  });

  return {
    text,
    prompt: compiledInput.prompt,
    references,
    compiledInput,
  } satisfies BiographyGenerationResult;
}
