-- ============================================================================
-- MIGRATION: Scope workflows to a visitor session
-- ============================================================================
-- The app has no login, so until now every workflow belonged to everyone.
-- `GET /api/workflows/list` returned every record in the system, and the
-- approve, disapprove, and delete routes acted on any workflow id a caller
-- named. Workflow ids are not secret — the list route hands them out — so
-- reading the list and looping the delete was enough to destroy the demo.
--
-- Each visitor now gets a signed, httpOnly `demo_session` cookie (see
-- proxy.ts and lib/demo-session.ts). This migration adds the column that
-- ties a workflow to the session that created it. The routes filter and gate
-- on that column, so a visitor sees and acts on only their own workflows.
--
-- ORDER OF OPERATIONS
--   Run this migration and deploy the matching code together. `session_id` is
--   NOT NULL with no default, so an older build's INSERT — which does not send
--   the column — fails outright rather than writing a workflow nobody owns.
--   That is the safe direction, but it does mean the create route is broken
--   for the window between running this script and the deploy landing. Keep
--   that window short.
--
-- EXISTING ROWS
--   The pre-scoping rows are deleted. They are test records with placeholder
--   addresses, no session can claim them, and leaving them behind would mean
--   either a nullable column threaded through every filter or a sentinel value
--   that no visitor can ever see. The dashboard is empty until someone creates
--   a workflow. ON DELETE CASCADE removes the matching recipient, biography,
--   and generation-artifact rows.
--
-- Follows the security model of 003_secure_rag_demo_schema.sql and
-- 004_add_generation_artifacts_table.sql: the table stays in rag_demo, RLS
-- stays enabled with no anon/authenticated policies, and only the server-side
-- service_role client can reach it.
-- ============================================================================

-- Remove the pre-scoping rows. Cascades to workflow_recipients,
-- workflow_biographies, and workflow_generation_artifacts.
DELETE FROM rag_demo.workflows;

-- The visitor session that created this workflow: the 32-character hex id
-- minted by lib/demo-session.ts. Every row is written by a visitor request,
-- so there is no server-owned value to reserve.
ALTER TABLE rag_demo.workflows
  ADD COLUMN IF NOT EXISTS session_id TEXT NOT NULL;

-- Every list, approve, disapprove, and delete query now filters on this
-- column, so it carries the read path for the whole dashboard.
CREATE INDEX IF NOT EXISTS idx_workflows_session_id
  ON rag_demo.workflows(session_id);

-- Supports the 48-hour expiry sweep in
-- app/api/cron/expire-demo-data/route.ts.
CREATE INDEX IF NOT EXISTS idx_workflows_created_at
  ON rag_demo.workflows(created_at);
