-- ============================================================================
-- MIGRATION: Secure the rag_demo schema
-- ============================================================================
-- 001/002 granted schema usage and table privileges to `anon` and
-- `authenticated` only, and left RLS disabled. That combination let anyone
-- with the publishable/anon key read and write every row in these tables
-- directly through the Data API — including recipient PII in
-- workflow_recipients and arbitrary approve/reject writes to workflows.
--
-- The app never actually needs that: every real code path (app/api/workflows/*,
-- app/form/[workflowId]/page.tsx) already goes through lib/supabase/server.ts,
-- a server-only client. The old client-side hooks in lib/workflow-client.ts
-- were dead code and have been removed alongside this migration.
--
-- This migration:
-- 1. Grants schema/table access to `service_role` (never granted before —
--    the likely cause of the "Invalid request" error previously seen when
--    a privileged key was tried against this schema).
-- 2. Enables RLS on all 4 tables with no policies, so anon/authenticated
--    are denied by default. service_role bypasses RLS, so the app's
--    server-side client keeps working once it switches to SUPABASE_SECRET_KEY.
-- 3. Revokes the now-unnecessary anon/authenticated grants for defense in
--    depth (RLS alone already blocks them, but there's no reason to leave
--    the grants in place).
-- ============================================================================

GRANT USAGE ON SCHEMA rag_demo TO service_role;

GRANT ALL ON ALL TABLES IN SCHEMA rag_demo TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA rag_demo TO service_role;
GRANT ALL ON ALL ROUTINES IN SCHEMA rag_demo TO service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA rag_demo
GRANT ALL ON TABLES TO service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA rag_demo
GRANT ALL ON SEQUENCES TO service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA rag_demo
GRANT ALL ON ROUTINES TO service_role;

ALTER TABLE rag_demo.workflows ENABLE ROW LEVEL SECURITY;
ALTER TABLE rag_demo.workflow_recipients ENABLE ROW LEVEL SECURITY;
ALTER TABLE rag_demo.workflow_biographies ENABLE ROW LEVEL SECURITY;
ALTER TABLE rag_demo.bio_reference_documents ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON ALL TABLES IN SCHEMA rag_demo FROM anon, authenticated;
REVOKE ALL ON SCHEMA rag_demo FROM anon, authenticated;
