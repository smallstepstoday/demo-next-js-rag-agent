import { generateText } from "ai";
import type { RecipientInfo } from "./workflow-types";
import type { createClient } from "./supabase/server";

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

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
};

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
    .sort((a, b) => b.score - a.score);

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
  const prompt = buildBiographyPrompt(input, references);

  console.log(
    "Biography generation - Retrieved biography references:",
    references.map((reference) => reference.title),
  );

  const { text } = await generateText({
    model: "openai/gpt-3.5-turbo",
    prompt,
    maxOutputTokens: 500,
    temperature: 0.7,
  });

  return {
    text,
    prompt,
    references,
  } satisfies BiographyGenerationResult;
}
