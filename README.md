# Next.js RAG Agent - Biography Workflow

A minimal Next.js application demonstrating a single-path RAG (Retrieval-Augmented Generation) biography workflow using the AI SDK, DurableAgent workflow steps, and Supabase for persistence.

## Overview

This application implements a complete 9-step workflow for generating and managing AI-powered biographical descriptions:

1. **User initiates workflow** - User indicates they want to send a link via email
2. **Email input** - UI displays a field for entering the recipient's email
3. **Form link sent** - System sends an email to the recipient with a unique form link
4. **Recipient fills form** - Recipient clicks link and fills out their information
5. **RAG-backed AI generation** - System retrieves relevant biography guidance and generates a biographical description using AI
6. **Pending approval** - Description appears on user's dashboard for review
7. **Review page** - User clicks to view full description with approve/disapprove options
8. **Approval flow** - If approved, system sends biography to recipient via email
9. **Disapproval flow** - If disapproved, system sends feedback to recipient

## Architecture

### Key Technologies

- **Next.js 16** - React framework with App Router
- **AI SDK v5** - For AI text generation (biography creation)
- **DurableAgent / WDK-style steps** - Workflow definition kept in sync with the API route flow
- **Supabase** - PostgreSQL database for persistent workflow storage
- **TypeScript** - Type-safe development
- **Tailwind CSS v4** - Styling
- **shadcn/ui** - UI component library

### Project Structure

```
proxy.ts # Issues the signed demo_session cookie on every request
vercel.json # Cron schedule for the demo-data expiry sweep

app/
├── page.tsx # User landing page (Steps 1-2, 6)
├── form/[workflowId]/
│ ├── page.tsx # Recipient form page (Step 4)
│ └── success/page.tsx # Form submission success
├── review/[workflowId]/page.tsx # Biography review (Step 7)
├── biography/[workflowId]/page.tsx # Approved biography view
└── api/
├── cron/
│ └── expire-demo-data/route.ts # Deletes workflows older than 48 hours
└── workflows/
├── create/route.ts # Create workflow (Step 3)
├── list/route.ts # List this session's workflows (Step 6)
├── [workflowId]/
│ ├── submit/route.ts # Submit form (Step 4-5)
│ ├── approve/route.ts # Approve biography (Step 8)
│ ├── disapprove/route.ts # Disapprove biography (Step 9)
│ └── delete/route.ts # Delete workflow and cascade its related rows

components/
├── email-form.tsx # Email input form
├── workflow-list.tsx # Workflow status cards
├── recipient-form.tsx # Information collection form
├── biography-review.tsx # Review and approval interface
└── ui/ # shadcn/ui components

lib/
├── biography-generation.ts # RAG retrieval, prompt construction, compiled-input artifact, and generation
├── biography-generation.test.ts # Eval harness: invariance/sensitivity suites for retrieval + artifact fingerprinting
├── demo-session.ts # Signs and verifies the demo_session cookie (Web Crypto, runs in the proxy)
├── demo-session-server.ts # Reads the session in route handlers and Server Components
├── validation.ts # zod schemas and length caps for every request body
├── rate-limit.ts # Per-session burst window for create and submit
├── api-errors.ts # Keeps Supabase error detail out of production responses
├── workflow-types.ts # TypeScript types for workflow
├── workflow-store.ts # Supabase-backed state management, scoped by session
├── email-service.ts # Email sending (simulated)
└── supabase/
└── server.ts # Server-only Supabase client (service_role); there is no browser client

scripts/
├── 001_create_workflows_table.sql # Database schema setup
├── 002_move_tables_to_rag_demo_schema.sql # Moves tables into the rag_demo schema
├── 003_secure_rag_demo_schema.sql # Grants service_role access and enables RLS
├── 004_add_generation_artifacts_table.sql # Adds workflow_generation_artifacts (compiled-input artifact storage)
└── 005_add_session_scoping.sql # Adds workflows.session_id and clears pre-scoping rows
```

### Database Schema

The application uses five Supabase tables, all in the `rag_demo` schema. RLS is
enabled on all five with no policies for `anon`/`authenticated` — only the
server-side client (using `SUPABASE_SECRET_KEY`, which authenticates as
`service_role` and bypasses RLS) can read or write them. There is no
client-side Supabase access anywhere in this app.

**workflows** - Main workflow state and metadata

- `id` (TEXT): Unique workflow identifier
- `recipient_email` (TEXT): Recipient's email address
- `initiated_by_email` (TEXT): User who created the workflow
- `status` (TEXT): Current workflow state
- `created_at`, `updated_at` (TIMESTAMP): Timestamps

**workflow_recipients** - Recipient information from forms

- `workflow_id` (TEXT): References workflows table
- `full_name`, `email`, `occupation` (TEXT): Basic info
- `skills` (JSONB): Array of skills
- `bio_context` (TEXT): Biography context
- `submitted_at` (TIMESTAMP): Submission time

**workflow_biographies** - AI-generated biographies

- `workflow_id` (TEXT): References workflows table
- `biography_text` (TEXT): Generated biography
- `approved` (BOOLEAN): Approval status
- `rejection_reason` (TEXT): Reason if rejected
- `generated_at`, `reviewed_at` (TIMESTAMP): Timestamps

**bio_reference_documents** - Retrieved context for RAG generation

- `id` (TEXT): Stable document identifier
- `title` (TEXT): Reference document title
- `category` (TEXT): Role or topic category
- `content` (TEXT): Writing guidance retrieved during generation
- `created_at` (TIMESTAMP): Timestamp

**workflow_generation_artifacts** - Compiled-input artifacts for each generation run

- `id` (TEXT): Stable artifact identifier
- `workflow_id` (TEXT): References workflows table
- `compiler_version`, `prompt_version` (TEXT): Retrieval/packing and prompt template versions
- `model_name` (TEXT), `model_params` (JSONB): Model and inference parameters used
- `compiled_input` (JSONB): Recipient input, retrieved references, and final prompt text
- `fingerprint` (TEXT): SHA-256 hash of the compiled input, for replay/diffing
- `created_at` (TIMESTAMP): Timestamp

See [Eval Workflow and the Compiled-Input Artifact](#eval-workflow-and-the-compiled-input-artifact) below.

### Workflow State Management

The application uses Supabase (PostgreSQL) for persistent storage:

- **Durable**: Workflows persist across server restarts
- **Scalable**: Supports multiple server instances
- **Queryable**: Full SQL query capabilities
- **Real-time**: Can add Supabase real-time subscriptions

The active demo UI has one execution path:

1. The operator creates a workflow and sends the mock form-link email from `POST /api/workflows/create`.
2. The recipient submits `/form/[workflowId]`, which calls `POST /api/workflows/[workflowId]/submit`.
3. The submit route stores recipient data, retrieves `bio_reference_documents`, enhances the prompt, generates the biography, saves it, and marks the workflow pending review.
4. The operator approves or disapproves from `/review/[workflowId]`.
5. The approval route sends the approved biography through the shared mock email service, or the disapproval route sends feedback through that same service.

The DurableAgent-oriented workflow definition in `app/workflows/biography-workflow.ts` is kept aligned with that path by calling the same `lib/biography-generation.ts` module used by the submit API route. That prevents the workflow step from bypassing reference retrieval or using a different generation prompt.

## Getting Started

### Prerequisites

- Node.js 18+
- npm, pnpm, or yarn
- Supabase project

### Installation

```bash

# Install dependencies

npm install

# Run database migrations

In Supabase dashboard, use the Scripts runner to execute, in order:
scripts/001_create_workflows_table.sql
scripts/002_move_tables_to_rag_demo_schema.sql
scripts/003_secure_rag_demo_schema.sql
scripts/004_add_generation_artifacts_table.sql
scripts/005_add_session_scoping.sql

# Then add `rag_demo` to Project Settings > Data API > Exposed schemas

# Run development server

npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to see the application.

### Environment Variables

The following environment variables are required:

```env
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=your-project-url
SUPABASE_SECRET_KEY=your-secret-key

# PostgreSQL Direct Connection (auto-configured)
POSTGRES_URL=your-postgres-url

# Application Configuration
NEXT_PUBLIC_APP_URL=http://localhost:3000  # Or your deployment URL

# Demo session signing key. Any long random string.
DEMO_SESSION_SECRET=your-random-secret

# Required for the expiry cron. Vercel generates this when you add a cron job.
CRON_SECRET=your-cron-secret
```

`SUPABASE_SECRET_KEY` is the newer-format secret key (Project Settings > API
Keys > Secret keys), not the legacy `SUPABASE_SERVICE_ROLE_KEY` JWT. It
authenticates as `service_role` and is required — RLS on `rag_demo` denies
everything else. There's no anon/publishable key in this app; nothing reads
Supabase from the browser.

`DEMO_SESSION_SECRET` signs the `demo_session` cookie. When it is unset the app
derives a key from `SUPABASE_SECRET_KEY` and logs a warning, so a deployment
that predates this variable keeps working. Set it anyway: without it, rotating
the Supabase key silently logs every visitor out of their own workflows.

`CRON_SECRET` guards `/api/cron/expire-demo-data`. That route deletes data, so
it refuses to run at all when the variable is missing rather than running
unauthenticated.

## Usage

### 1. Set Up Database

Before first use, run the database migrations in order:

1. Run `scripts/001_create_workflows_table.sql` — creates all tables with proper indexes and triggers (in `public`)
2. Run `scripts/002_move_tables_to_rag_demo_schema.sql` — moves those tables into a dedicated `rag_demo` schema
3. Run `scripts/003_secure_rag_demo_schema.sql` — grants `service_role` access and enables RLS so the tables aren't publicly readable/writable
4. Run `scripts/004_add_generation_artifacts_table.sql` — adds `workflow_generation_artifacts` for the compiled-input artifact (see [Eval Workflow and the Compiled-Input Artifact](#eval-workflow-and-the-compiled-input-artifact))
5. Run `scripts/005_add_session_scoping.sql` — adds `workflows.session_id` and deletes any rows created before scoping existed (see [Demo security model](#demo-security-model))
6. In the Supabase dashboard, add `rag_demo` to the exposed schemas (Project Settings > Data API > Exposed schemas) so PostgREST can serve it

On an existing deployment, run migration 005 and ship the matching code
together. `session_id` is `NOT NULL` with no default, so an older build's
insert fails rather than writing a workflow nobody owns. That is the safe
direction to fail, but it does break workflow creation for however long the two
are out of step.

### 2. Create a New Workflow

1. Enter a recipient's email address in the form
2. Click "Send Link"
3. System creates workflow and "sends" email (logged to console)
4. Workflow is now stored in Supabase and persists across page reloads

### 3. Recipient Fills Form

1. Navigate to `/form/[workflowId]` (copy from console or workflow card)
2. Fill out biographical information:
   - Name, occupation, years of experience
   - Skills (add multiple)
   - Achievements and interests
3. Submit form
4. Data is saved to Supabase, reference documents are retrieved, and the biography is generated before the success page is shown

### 4. AI Biography Generation

- System retrieves relevant biography reference documents from Supabase based on the submitted occupation and skills
- Retrieved context is inserted into the generation prompt
- System automatically generates biography using AI SDK
- Biography is saved to Supabase
- Status updates to "Pending Your Approval"

## RAG Implementation

This demo implements a lightweight RAG path without vector search. The `bio_reference_documents` table acts as the external knowledge source. When a recipient submits their form, the submit API retrieves relevant reference documents, ranks them against the submitted occupation and skills, and augments the model prompt with the best matches before generating the biography.

The submit API route and DurableAgent workflow step both use `lib/biography-generation.ts` for retrieval, prompt construction, and AI generation. If you need to verify retrieval during a run, watch the server logs for `Biography generation - Retrieved biography references:` followed by the selected document titles.

For a production-grade RAG system, this could be extended with embeddings, Supabase `pgvector`, document ingestion, and similarity search.

## Eval Workflow and the Compiled-Input Artifact

This demo implements two ideas from
[Treat eval as a release workflow, not a benchmark report](https://cataluma.com/blog/llm-eval-shipping-workflows):

**Compiled-input artifact boundary** ("Recommendation: create a compiled-input
artifact boundary"). `buildCompiledInput` in `lib/biography-generation.ts`
compiles the retrieved references and prompt into a single versioned,
fingerprinted object before it reaches the model. `generateBiography`
returns that artifact, and `saveGenerationArtifact` in `lib/workflow-store.ts`
persists it to `workflow_generation_artifacts` (schema:
`scripts/004_add_generation_artifacts_table.sql`). This is the replay
boundary the article describes: if a biography regresses, you can diff the
stored `compiled_input` to tell whether retrieval/packing changed or the
model behaved differently on the same input.

**Versioning the full input contract** ("Version the full input contract").
`RETRIEVAL_COMPILER_VERSION`, `PROMPT_TEMPLATE_VERSION`, and `MODEL_NAME` are
explicit constants in `lib/biography-generation.ts` rather than inline
literals, so a change to ranking, packing, the prompt template, or the model
is a version bump that shows up in every stored artifact.

**Invariance and sensitivity suites** ("Add invariance and sensitivity
suites"). `lib/biography-generation.test.ts` is a small eval harness over the
retrieval/ranking compiler:

- *Invariance:* reordering the source rows returned from Supabase must not
  change which references are selected or their relative order. Postgres
  doesn't guarantee row order without `ORDER BY`, so this catches a real
  `row_order_shuffle` class of bug. Earlier versions of `retrieveBiographyReferences`
  had no tie-break on equal-scored documents, so a row-order change could
  silently reorder a reference the model saw, or under `slice(0, 3)`, drop one.
- *Sensitivity:* adding a document that matches the query must surface it,
  and removing the only match must trigger the general-guidance fallback
  rather than an empty context block.

Run the suite with:

```bash
pnpm test        # single run
pnpm test:watch  # watch mode
```

### 5. Review and Approve/Disapprove

1. Click "Review Biography" on the workflow card
2. Review generated biography and recipient information
3. Either:
   - **Approve**: Sends biography to recipient
   - **Disapprove**: Provide reason, sends feedback to recipient
4. Decision is persisted in Supabase

## Email System

The application simulates email sending by logging to the console. In production, integrate with:

- **Resend** - Modern email API (recommended)
- **SendGrid** - Enterprise email service
- **AWS SES** - AWS email service

All email content is generated in `lib/email-service.ts`.

Example production implementation:

```typescript
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function sendEmail(payload: EmailPayload) {
  await resend.emails.send({
    from: "noreply@yourdomain.com",
    to: payload.to,
    subject: payload.subject,
    html: payload.body,
  });
}
```

## AI Configuration

The application uses AI SDK v5 with the Vercel AI Gateway:

- **Default model**: `openai/gpt-5-mini`
- **Biography generation**: 2000 max output tokens, temperature 0.7
- **Automatic retries**: Built into Workflow steps
- **No API key required**: Uses Vercel AI Gateway by default

The 2000 is not headroom for a longer biography. `gpt-5-mini` is a reasoning
model, so `maxOutputTokens` covers hidden reasoning tokens as well as visible
text. At 500 the output truncated mid-sentence, and after the `ai` 7.x upgrade
raised reasoning-token usage for the same prompt, reasoning consumed the entire
budget and generations came back empty.

To use a different model or provider:

```typescript
import { generateText } from "ai";

const { text } = await generateText({
  model: "anthropic/claude-sonnet-4.5", // Or any supported model
  prompt: "Your prompt here",
});
```

## Supabase Integration

### Client Types

The application uses a single Supabase client type:

**Server Client** (`lib/supabase/server.ts`)

- Used in Server Components, Server Actions, and Route Handlers
- Authenticates as `service_role` via `SUPABASE_SECRET_KEY`, bypassing RLS
- Always create new instance per request (Fluid compute compatible)

There is no browser client. Client Components never talk to Supabase
directly — they call the `app/api/workflows/*` route handlers, which use the
server client above. `rag_demo` tables have RLS enabled with no
anon/authenticated policies, so a direct browser client would have no access
anyway.

### Database Operations

All workflow operations in `lib/workflow-store.ts`:

Anything a visitor can reach takes a `sessionId` and filters on it. The
parameter is required rather than optional, so a call site that forgets it
fails to compile instead of quietly reading every row.

```typescript
// Create workflow, owned by this session
const workflowId = await createWorkflow(recipientEmail, sessionId);

// Get workflow with all related data, if this session owns it
const workflow = await getWorkflow(workflowId, sessionId);

// Count this session's workflows (backs the durable rate limit)
const count = await countWorkflowsForSession(sessionId);

// Update status
await updateWorkflowStatus(workflowId, "pending_approval");

// Save recipient info
await saveRecipientInfo(workflowId, recipientInfo);

// Save biography
await saveBiography(workflowId, biographyText);

// Approve/reject
await approveBiography(workflowId);
await rejectBiography(workflowId, reason);

// Delete, scoped to the owning session. Returns false when nothing matched.
const deleted = await deleteWorkflow(workflowId, sessionId);
```

### Schema Migrations

To modify the schema:

1. Create a new file: `scripts/006_your_migration.sql`
2. Write SQL migration code
3. Run via Supabase SQL Editor
4. Never edit executed scripts - always create new ones

## Demo security model

This app is deployed publicly with no login, and that is the design constraint
rather than an oversight. There is no identity to check, so the limits have to
sit on what any one visitor can reach and how much they can spend.

### Session scoping

Every visitor gets a signed, httpOnly `demo_session`
cookie, issued in `proxy.ts`. Workflows record the session that created them in
`workflows.session_id`, and the list, form, review, biography, submit, approve,
disapprove, and delete paths all filter on it. Each filter is in the SQL rather
than in a check preceding the query, so a workflow owned by another visitor is
reported the same way as one that does not exist, and no window opens between
proving ownership and writing.

Because the `service_role` client bypasses RLS, that one column is what enforces
the boundary. RLS protects the tables from the outside; it has nothing to say
about the app's own key.

### Input validation

Request bodies are parsed against zod schemas with hard
length caps in `lib/validation.ts`: 100 characters for name and occupation, ten
skills of 50 characters, 1000 for achievements, 500 for interests. The caps
carry more weight than the type checking does. `buildBiographyPrompt` inlines
those fields, so an uncapped request can build a prompt of any size it likes.

### Rate limits

`create` and `submit` are the two routes that cost money. Each
session gets a burst window from `lib/rate-limit.ts` plus a durable ceiling of
20 workflows, counted in the database. Submitting a workflow that already has a
biography returns 409, so one workflow id cannot be replayed for repeated
generations. The burst window lives in instance memory and resets on a cold
start. The row counts do not.

None of this stops someone who discards their cookie between requests: a fresh
session gets a fresh allowance. That is the unavoidable shape of rate limiting
without accounts, and it is why the gateway budget below is the actual ceiling
rather than a nice-to-have.

### Prompt handling

Recipient-supplied text sits below an explicit delimiter,
under an instruction to treat everything after it as data, and delimiter markers
inside the submitted text are stripped. That lowers the odds of a successful
injection without removing them, which is why the approval gate matters: no
generated text reaches the biography page until a person clicks approve.

### Data expiry

A daily cron deletes workflows older than 48 hours, which is
also the session cookie lifetime, so a visitor's session and their data run out
together.

### Gateway budget

The ceiling on total model spend belongs at the AI Gateway, as
a project-scoped budget with a daily refresh period instead of the monthly
default. A daily cap turns a runaway script into a bad afternoon rather than a
monthly bill, and requests are rejected with HTTP 402 once it trips. That is
dashboard configuration, so it is not in this repository and has to be set on
the project directly.

## Production Considerations

### 1. Authentication

Add user authentication to secure the application:

```typescript
// Using Supabase Auth
import { createClient } from "@/lib/supabase/server";

const supabase = await createClient();
const {
  data: { user },
} = await supabase.auth.getUser();

if (!user) {
  redirect("/auth/login");
}
```

### 2. Row Level Security (RLS)

Enable RLS to protect workflow data:

```sql
ALTER TABLE workflows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own workflows"
  ON workflows FOR SELECT
  USING (auth.email() = initiated_by_email);

CREATE POLICY "Users can update their own workflows"
  ON workflows FOR UPDATE
  USING (auth.email() = initiated_by_email);
```

### 3. Background Jobs

For larger workloads, move biography generation out of the request/response path with a queue or background job. Keep the same flow boundaries: form submission stores recipient data, one generation worker retrieves reference documents and saves the biography, then approval/disapproval routes send the mock or production email.

### 4. Error Handling

Add comprehensive monitoring:

- **Sentry** for error tracking
- **Vercel Observability** for workflow monitoring
- **Supabase logging** for database operations
- **Retry logic** for failed steps

### 5. Security Checklist

What the demo already does, described in [Demo security model](#demo-security-model):

- RLS enabled on all tables, with no `anon` or `authenticated` policies
- Every request body validated and length-capped
- Rate limits on the two routes that call the model
- Secrets in environment variables, read only on the server
- Error detail suppressed in production responses

What a production deployment still needs:

- Real authentication, replacing the per-visitor session cookie
- Explicit CSRF tokens on the state-changing routes. The session cookie is
  `SameSite=Lax`, so a cross-site POST does not carry it, but that is a
  side effect rather than a defense anyone chose
- Supabase email confirmation
- A signed, single-use link token for the recipient, so the form does not depend
  on the operator's session

## Troubleshooting

### Database Connection Issues

If you encounter database errors:

1. **Check environment variables**: Ensure all Supabase env vars are set
2. **Verify migrations**: Run `scripts/001_create_workflows_table.sql` then `scripts/002_move_tables_to_rag_demo_schema.sql`
3. **Check Supabase dashboard**: Verify tables exist in the `rag_demo` schema and that `rag_demo` is listed under Exposed schemas

### "Workflow Not Found" Error

If you see "Workflow Not Found":

1. **Verify database**: Check if workflow exists in Supabase dashboard
2. **Check workflow ID**: Ensure you're using the correct ID
3. **Review console logs**: Look for database errors

### AI Generation Failures

If biography generation fails:

1. **Check AI SDK**: Verify AI SDK is configured correctly
2. **Review console logs**: Look for API errors
3. **Check rate limits**: Ensure you're within API limits

### Performance Optimization

For large-scale deployments:

1. **Add database indexes**: Already included in migration script
2. **Implement caching**: Use Vercel KV or Redis for frequently accessed data
3. **Optimize queries**: Use Supabase's query optimization tools
4. **Enable connection pooling**: Already configured via `POSTGRES_URL`

## Development Tips

### Viewing Database Content

In Supabase dashboard:

```sql
-- View all workflows
SELECT * FROM workflows ORDER BY created_at DESC;

-- View workflow with all related data
SELECT
  w.*,
  r.full_name as recipient_name,
  b.biography_text
FROM workflows w
LEFT JOIN workflow_recipients r ON r.workflow_id = w.id
LEFT JOIN workflow_biographies b ON b.workflow_id = w.id;
```

### Testing the Complete Flow

1. Create workflow from home page
2. Copy workflow ID from console or alert
3. Navigate to `/form/{workflow-id}`
4. Submit form with test data
5. Return to home page
6. Wait for AI generation to complete
7. Click "Review Biography"
8. Approve or disapprove

### Resetting Data

To clear all workflows:

```sql
-- Cascade delete removes related records
DELETE FROM workflows;
```

## License

MIT
