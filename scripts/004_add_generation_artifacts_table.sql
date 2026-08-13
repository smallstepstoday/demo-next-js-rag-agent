-- ============================================================================
-- MIGRATION: Add workflow_generation_artifacts table
-- ============================================================================
-- Implements the "compiled-input artifact" boundary described in
-- https://cataluma.com/blog/llm-eval-shipping-workflows
-- ("Recommendation: create a compiled-input artifact boundary").
--
-- Every biography generation run compiles retrieval + packing + templating
-- into a single artifact before it reaches the model (see
-- lib/biography-generation.ts buildCompiledInput). This table persists that
-- artifact — compiler/prompt/model versions, the retrieved references, the
-- exact prompt text, and a content fingerprint — so a later regression can
-- be traced to "the compiler produced different input" versus "the model
-- behaved differently on the same input," instead of re-running prod to
-- guess what was actually sent.
--
-- Follows the same security model as 003_secure_rag_demo_schema.sql: lives
-- directly in rag_demo, RLS enabled with no anon/authenticated policies, and
-- only the server-side service_role client can read or write it.
-- ============================================================================

CREATE TABLE IF NOT EXISTS rag_demo.workflow_generation_artifacts (
  id TEXT PRIMARY KEY,

  -- References the workflow this generation run belongs to
  workflow_id TEXT NOT NULL REFERENCES rag_demo.workflows(id) ON DELETE CASCADE,

  -- Versions of the retrieval/packing compiler and the prompt template that
  -- produced this artifact (lib/biography-generation.ts
  -- RETRIEVAL_COMPILER_VERSION / PROMPT_TEMPLATE_VERSION)
  compiler_version TEXT NOT NULL,
  prompt_version TEXT NOT NULL,

  -- Model name and inference parameters used for this run
  model_name TEXT NOT NULL,
  model_params JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- The compiled input itself: recipient input, retrieved references, and
  -- the final prompt text sent to the model
  compiled_input JSONB NOT NULL,

  -- SHA-256 fingerprint of the compiled input, for replay/diffing without
  -- re-serializing the JSONB column
  fingerprint TEXT NOT NULL,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_workflow_generation_artifacts_workflow_id
  ON rag_demo.workflow_generation_artifacts(workflow_id);

CREATE INDEX IF NOT EXISTS idx_workflow_generation_artifacts_fingerprint
  ON rag_demo.workflow_generation_artifacts(fingerprint);

ALTER TABLE rag_demo.workflow_generation_artifacts ENABLE ROW LEVEL SECURITY;

GRANT ALL ON TABLE rag_demo.workflow_generation_artifacts TO service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA rag_demo
GRANT ALL ON TABLES TO service_role;

REVOKE ALL ON TABLE rag_demo.workflow_generation_artifacts FROM anon, authenticated;
