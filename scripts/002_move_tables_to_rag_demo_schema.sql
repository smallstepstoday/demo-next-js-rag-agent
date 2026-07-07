-- ============================================================================
-- MIGRATION: Move workflow tables into the rag_demo schema
-- ============================================================================
-- The tables created by 001_create_workflows_table.sql live in `public`.
-- This migration relocates them into a dedicated `rag_demo` schema so the
-- demo's objects are namespaced separately from the default schema.
--
-- TABLES MOVED:
-- 1. workflows
-- 2. workflow_recipients
-- 3. workflow_biographies
-- 4. bio_reference_documents
--
-- NOTE: After running this script, add `rag_demo` to the Supabase project's
-- exposed schemas (Project Settings > Data API > Exposed schemas) so
-- PostgREST will serve it. This setting cannot be changed via SQL.
-- ============================================================================

CREATE SCHEMA IF NOT EXISTS rag_demo;

ALTER TABLE public.workflows SET SCHEMA rag_demo;
ALTER TABLE public.workflow_recipients SET SCHEMA rag_demo;
ALTER TABLE public.workflow_biographies SET SCHEMA rag_demo;
ALTER TABLE public.bio_reference_documents SET SCHEMA rag_demo;

ALTER FUNCTION public.update_workflow_timestamp() SET SCHEMA rag_demo;

-- ============================================================================
-- PERMISSIONS: Re-grant schema and table access after the move
-- ============================================================================
-- Table-level GRANTs and the RLS-disabled state travel with the table across
-- schemas, but PostgREST/the anon and authenticated roles also need USAGE on
-- the schema itself to reach anything inside it.
-- ============================================================================

GRANT USAGE ON SCHEMA rag_demo TO anon, authenticated;

GRANT ALL ON TABLE rag_demo.workflows TO anon, authenticated;
GRANT ALL ON TABLE rag_demo.workflow_recipients TO anon, authenticated;
GRANT ALL ON TABLE rag_demo.workflow_biographies TO anon, authenticated;
GRANT ALL ON TABLE rag_demo.bio_reference_documents TO anon, authenticated;
