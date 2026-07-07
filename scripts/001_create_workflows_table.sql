-- ============================================================================
-- WORKFLOW BIOGRAPHY GENERATOR - DATABASE SCHEMA
-- ============================================================================
-- This script creates the database structure for a multi-step RAG workflow
-- that collects recipient information, generates biographies using AI,
-- and manages approval workflows.
--
-- TABLES:
-- 1. workflows - Stores the main workflow state and metadata
-- 2. workflow_recipients - Stores recipient information collected via forms
-- 3. workflow_biographies - Stores AI-generated biographies awaiting approval
-- 4. bio_reference_documents - Stores retrievable writing guidance for RAG
-- ============================================================================

-- ----------------------------------------------------------------------------
-- TABLE: workflows
-- ----------------------------------------------------------------------------
-- Purpose: Tracks the overall state of each biography generation workflow
-- 
-- Workflow States (status column):
--   - 'pending_form': Initial state, waiting for recipient to fill out form
--   - 'form_submitted': Recipient submitted form, ready for AI generation
--   - 'generating': AI is actively generating the biography
--   - 'pending_review': Biography generated, awaiting user approval
--   - 'approved': User approved the biography, final email sent to recipient
--   - 'rejected': User rejected the biography
--   - 'error': An error occurred during processing
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS workflows (
  -- Unique identifier for the workflow (UUID format)
  id TEXT PRIMARY KEY,
  
  -- Email address of the recipient who will fill out the form
  recipient_email TEXT NOT NULL,
  
  -- Email address of the user who initiated the workflow
  -- (In a real app with auth, this would reference auth.users)
  initiated_by_email TEXT NOT NULL,
  
  -- Current state of the workflow (see states above)
  status TEXT NOT NULL DEFAULT 'pending_form',
  
  -- Timestamp when the workflow was created
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Timestamp of the last update to this workflow
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index on status for efficient filtering by workflow state
CREATE INDEX IF NOT EXISTS idx_workflows_status ON workflows(status);

-- Index on recipient_email for quick lookups when recipient accesses form
CREATE INDEX IF NOT EXISTS idx_workflows_recipient_email ON workflows(recipient_email);

-- ----------------------------------------------------------------------------
-- TABLE: workflow_recipients
-- ----------------------------------------------------------------------------
-- Purpose: Stores detailed information about recipients collected via forms
-- This is the data that will be used by the AI to generate biographies
--
-- Relationship: One-to-one with workflows table
-- Each workflow has exactly one recipient record (after form submission)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS workflow_recipients (
  -- References the parent workflow
  workflow_id TEXT PRIMARY KEY REFERENCES workflows(id) ON DELETE CASCADE,
  
  -- Basic personal information
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  
  -- Professional information
  occupation TEXT NOT NULL,
  company TEXT,
  
  -- Skills: stored as JSON array for flexibility
  -- Example: ["JavaScript", "React", "Node.js"]
  skills JSONB DEFAULT '[]'::jsonb,
  
  -- Biography context: recipient's personal narrative
  -- This is the key input for the AI biography generation
  bio_context TEXT NOT NULL,
  
  -- Timestamp when the form was submitted
  submitted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index on email for potential future recipient lookups
CREATE INDEX IF NOT EXISTS idx_workflow_recipients_email ON workflow_recipients(email);

-- ----------------------------------------------------------------------------
-- TABLE: workflow_biographies
-- ----------------------------------------------------------------------------
-- Purpose: Stores AI-generated biographies and their approval status
--
-- Relationship: One-to-one with workflows table
-- Each workflow has at most one biography record (after AI generation)
--
-- Note: In a more advanced system, you might store multiple versions
-- for revision history or A/B testing
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS workflow_biographies (
  -- References the parent workflow
  workflow_id TEXT PRIMARY KEY REFERENCES workflows(id) ON DELETE CASCADE,
  
  -- The AI-generated biography text
  -- This is what the user will review and potentially send to the recipient
  biography_text TEXT NOT NULL,
  
  -- When the AI generated this biography
  generated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- When the user reviewed the biography (NULL if not yet reviewed)
  reviewed_at TIMESTAMP WITH TIME ZONE,
  
  -- Whether the user approved or rejected the biography
  -- NULL = pending review, TRUE = approved, FALSE = rejected
  approved BOOLEAN,
  
  -- If rejected, stores the reason provided by the user
  -- This will be included in the rejection email to the recipient
  rejection_reason TEXT
);

-- ----------------------------------------------------------------------------
-- TABLE: bio_reference_documents
-- ----------------------------------------------------------------------------
-- Purpose: Stores external reference material retrieved at biography generation
-- time. These documents augment the prompt with role-specific writing guidance,
-- giving the app a minimal but real RAG path without requiring vector search.
--
-- Relationship: Independent knowledge base table queried during generation
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS bio_reference_documents (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  category TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bio_reference_documents_category
  ON bio_reference_documents(category);

INSERT INTO bio_reference_documents (id, title, category, content)
VALUES
  (
    'executive-bio-guidance',
    'Executive biography guidance',
    'executive',
    'Executive biographies should lead with scope of responsibility, strategic impact, leadership style, and measurable business outcomes. Keep the tone polished, concise, and credible.'
  ),
  (
    'engineering-bio-guidance',
    'Engineering biography guidance',
    'engineering',
    'Engineering biographies should emphasize technical depth, systems built, collaboration across teams, product impact, and practical problem solving. Use clear language that remains accessible to non-engineering readers.'
  ),
  (
    'design-bio-guidance',
    'Design biography guidance',
    'design',
    'Design biographies should highlight user-centered thinking, product craft, research or prototyping strengths, cross-functional collaboration, and the outcomes of design decisions.'
  ),
  (
    'founder-bio-guidance',
    'Founder biography guidance',
    'founder',
    'Founder biographies should connect the person''s background to the problem they are solving, describe company-building experience, and balance vision with concrete traction or operating details.'
  ),
  (
    'general-professional-bio-guidance',
    'General professional biography guidance',
    'general',
    'A strong professional biography opens with the person''s current role, summarizes relevant experience, includes a few concrete strengths or achievements, and ends with a human detail when appropriate.'
  )
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  content = EXCLUDED.content;

-- ============================================================================
-- HELPER FUNCTION: Update timestamp on workflow changes
-- ============================================================================
-- This function automatically updates the 'updated_at' timestamp whenever
-- a workflow record is modified, ensuring accurate tracking of changes
-- ============================================================================
CREATE OR REPLACE FUNCTION update_workflow_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  -- Set the updated_at timestamp to the current time
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create a trigger that calls the function before any UPDATE on workflows
DROP TRIGGER IF EXISTS trigger_update_workflow_timestamp ON workflows;
CREATE TRIGGER trigger_update_workflow_timestamp
  BEFORE UPDATE ON workflows
  FOR EACH ROW
  EXECUTE FUNCTION update_workflow_timestamp();

-- ============================================================================
-- DEMO SECURITY MODEL: Disable RLS
-- ============================================================================
-- This demo uses a server-side Supabase client configured with the anon key and
-- explicit table grants below. If RLS is enabled on an existing table, GRANTs are
-- not enough: Postgres still requires matching RLS policies and inserts fail with
-- "new row violates row-level security policy". Disable RLS here so re-running
-- this script restores the intended demo behavior.
-- ============================================================================

ALTER TABLE public.workflows DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.workflow_recipients DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.workflow_biographies DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.bio_reference_documents DISABLE ROW LEVEL SECURITY;

-- ============================================================================
-- PERMISSIONS: Grant access to anon and authenticated roles
-- ============================================================================
-- The Supabase JS client authenticates as the `anon` role when using the
-- anon key. Without explicit GRANTs, PostgREST returns "permission denied".
-- These GRANTs allow the application to perform full CRUD operations.
--
-- IMPORTANT: If the Supabase project is paused and restored, the tables are
-- lost but the roles persist. Re-running this entire script will recreate
-- tables AND re-apply permissions in one step.
-- ============================================================================

GRANT ALL ON TABLE public.workflows TO anon, authenticated;
GRANT ALL ON TABLE public.workflow_recipients TO anon, authenticated;
GRANT ALL ON TABLE public.workflow_biographies TO anon, authenticated;
GRANT ALL ON TABLE public.bio_reference_documents TO anon, authenticated;

-- ============================================================================
-- NOTES ON ROW LEVEL SECURITY (RLS)
-- ============================================================================
-- In a production application with user authentication, you would enable RLS:
--
-- ALTER TABLE workflows ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE workflow_recipients ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE workflow_biographies ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE bio_reference_documents ENABLE ROW LEVEL SECURITY;
--
-- And create policies like:
--
-- CREATE POLICY "Users can view their own workflows"
--   ON workflows FOR SELECT
--   USING (auth.email() = initiated_by_email);
--
-- CREATE POLICY "Users can update their own workflows"
--   ON workflows FOR UPDATE
--   USING (auth.email() = initiated_by_email);
--
-- For now, we're keeping it simple without authentication.
-- ============================================================================
