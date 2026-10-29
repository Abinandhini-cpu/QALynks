# QALynks

QA management platform. Module 1, Test Case Management, is implemented. Requirements, Bug Management, Test Execution, Reports and Settings appear in the sidebar as planned items only.

Module 2 adds AI test case generation from pasted requirement text (see [AI test case generation](#ai-test-case-generation)). It needs an API key. Manual test case management works without one.

## Stack

| Area     | Choice                                        | Reason                                                                       |
| -------- | --------------------------------------------- | ---------------------------------------------------------------------------- |
| Language | TypeScript (strict), Node 22                  | Matches the Engineering stack list. One language across the repo.            |
| Frontend | React 19, Vite, React Router, TanStack Query  | A single-page app is enough for an authenticated tool. No UI kit dependency. |
| Backend  | Fastify 5, Zod                                | Small and fast. Validation schemas are shared with the frontend.             |
| Database | SQLite (better-sqlite3), SQL migrations       | Runs locally with no paid service and no Docker.                             |
| Tests    | Vitest, Testing Library, Playwright           | Unit, API integration, component and end-to-end coverage.                    |
| Quality  | ESLint, Prettier, `tsc --strict`, `npm audit` | Run together with `npm run check`.                                           |

Layout, a modular monolith in an npm workspace:

```
apps/api            Fastify API: routes, services, repositories, migrations
apps/web            React app
packages/shared     Zod schemas, constants and types used by both apps
e2e                 Playwright specs
```

API layers: `routes` (HTTP and validation) calls `services` (business rules, CSV, duplicates), which call `repositories` (parameterised SQL only).

SQLite is the local default. All SQL lives in `apps/api/src/repositories` and `apps/api/migrations`, so moving to PostgreSQL for a hosted deployment is a contained change.

## Prerequisites

- Node.js 22.5 or newer and npm 10
- Git
- For end-to-end tests only: Microsoft Edge or Google Chrome installed

## Setup and run

```bash
npm install
npm run db:migrate
npm run db:seed
npm run dev
```

- Web app: http://127.0.0.1:5173
- API: http://127.0.0.1:3001 (the web app proxies `/api` to it)

`db:seed` adds 10 sample test cases and does nothing if data already exists. The server also applies pending migrations on start, so `db:migrate` is optional.

Data lives in `apps/api/data/qalynks.db` and persists across restarts.

Reset local data (deletes the database file, then migrates and seeds):

```bash
npm run db:reset
```

Configuration is by environment variable. Defaults work without a `.env` file. Copy `.env.example` to `.env` to override `PORT`, `HOST`, `DATABASE_PATH` or `LOG_LEVEL`. Never commit `.env`.

## Commands

| Command                 | What it does                                                         |
| ----------------------- | -------------------------------------------------------------------- |
| `npm run dev`           | API and web app with reload                                          |
| `npm run build`         | Type check and production build of the web app                       |
| `npm test`              | All unit and integration tests                                       |
| `npm run test:coverage` | Tests with coverage; fails below 80% lines, statements and functions |
| `npm run e2e`           | Browser tests against a separate seeded database (`data/e2e.db`)     |
| `npm run lint`          | ESLint                                                               |
| `npm run format:check`  | Prettier check (`npm run format` fixes)                              |
| `npm run typecheck`     | TypeScript in every workspace                                        |
| `npm run audit:deps`    | `npm audit` at high severity                                         |
| `npm run check`         | Format, lint, types, coverage tests and audit                        |

To run end-to-end tests in Chrome instead of Edge: `E2E_BROWSER_CHANNEL=chrome npm run e2e`.

## Features

- Dashboard with totals, status, priority and type breakdowns, and recent changes.
- Test case list with search by ID or title, filters for priority, type, status and module, sortable columns, pagination, and total and filtered counts. The state is kept in the URL.
- Create, view, edit and delete, with ordered steps, tags and field-level validation on the client and the server.
- Server-generated IDs (`TC-0001`, `TC-0002`, and so on) from a database sequence. IDs are never reused.
- Duplicate warning on save when a normalised title already exists.
- CSV import and export.
- AI test case generation from requirement text, with review before saving.

## Decisions

### Deletion

Deletion is soft. Deleting sets `deleted_at`; the row, its steps and tags stay in the database. Deleted test cases are excluded from the list, search, export, counts, duplicate checks and the detail view, and return 404. The ID stays reserved. There is no restore screen yet.

### Versions and audit

Each test case has `created_at`, `updated_at` and a `revision` counter that increases on every edit. Steps and tags are normalised tables. A future `test_case_versions` table can store a snapshot per revision without changing the current schema.

### Duplicates

Titles are normalised (case folded, punctuation removed, whitespace collapsed) and stored. A match on the normalised title is a possible duplicate. A match that also has the same normalised module is flagged "same module". The create and edit form warns and offers "Save anyway". Nothing is merged or deleted automatically.

### Security controls in place

- All SQL is parameterised. Sort columns come from a fixed allowlist. `LIKE` wildcards in search are escaped.
- Every request body and query is validated by Zod on the server. Database `CHECK` and foreign key constraints back this up.
- Error responses use generic messages for unexpected failures; details are logged server-side only.
- `@fastify/helmet` sets security headers. React escapes all rendered text.
- CSV export prefixes cells starting with `=`, `+`, `-`, `@`, tab or carriage return with a single quote. Import reverses this so exports re-import unchanged.
- Import is limited to 1 MB and 1000 rows, and malformed files are rejected with a clear message.
- The server binds to `127.0.0.1` by default.

### Not in this version

- **No authentication or roles.** Anyone who can reach the server can read and change data. Run it on a trusted machine only. Do not expose it to a network until auth is added.
- No rate limiting, no CORS configuration (the browser app uses a same-origin proxy), no Excel import.
- No production server for the built web app. `npm run build` outputs `apps/web/dist`; serving it and the API together is not set up.
- The API runs through `tsx`; there is no compiled production bundle.
- Git hooks and CI workflows are not included. See [Project status](#project-status).

## CSV format

Export columns: `id,title,description,preconditions,steps,expected_result,priority,test_type,module,tags,status,created_at,updated_at`. Export respects the current search, filters and sort, and the file opens in Excel (UTF-8 with BOM).

Import requires these columns: `title`, `priority`, `test_type`, `status`. Optional: `description`, `preconditions`, `steps`, `expected_result`, `module`, `tags`. Header names are case-insensitive, and spaces or hyphens count as underscores. Other columns, such as `id`, are ignored. New IDs are always assigned by the server.

- `priority`: Critical, High, Medium, Low
- `test_type`: Functional, Regression, Smoke, Integration, UI, Performance, Security
- `status`: Draft, Ready, Deprecated
- `steps`: one step per line, written as `action :: expected result` (the expected part is optional). The text `::` is reserved as the separator.
- `tags`: separated by semicolons. Tags cannot contain commas or semicolons.

Behaviour:

- Valid rows are imported in one transaction. Invalid rows are reported by spreadsheet row number (the header is row 1) with a message per column.
- A row whose normalised title and module match an existing test case, or an earlier row in the same file, is skipped and reported as a duplicate. Re-importing the same file creates nothing new.
- A file with missing required columns, no data rows, malformed quoting, more than 1000 rows or more than 1 MB is rejected as a whole.

The import page has a downloadable template.

The CSV format does not yet include the newer `test_data` and `actual_result` fields. Exports omit them, and imports leave them blank.

## API summary

| Method and path                                   | Purpose                                                                           |
| ------------------------------------------------- | --------------------------------------------------------------------------------- |
| `GET /api/test-cases`                             | List. Query: `q, priority, testType, status, module, sort, order, page, pageSize` |
| `POST /api/test-cases`                            | Create. Returns the record and any possible duplicates                            |
| `POST /api/test-cases/bulk`                       | Create several test cases, all or nothing                                         |
| `GET /api/ai/status`, `POST /api/ai/generate`     | AI configuration status; analyse a requirement and return cases without saving    |
| `GET/PUT/DELETE /api/test-cases/:code`            | Read, replace, soft delete                                                        |
| `POST /api/test-cases/duplicates`                 | Check a title and module                                                          |
| `GET /api/test-cases/export.csv`                  | Export with the same filters as the list                                          |
| `POST /api/test-cases/import`                     | Import. Body is the CSV text, `Content-Type: text/csv`                            |
| `GET /api/summary`, `/api/modules`, `/api/health` | Dashboard data, module names, health check                                        |

## AI test case generation

Open **Test Cases, Generate from requirement** (`/test-cases/generate`). Paste requirement text (user stories, acceptance criteria, BRD or functional requirements). Plain text only: there is no file, PDF or DOCX upload yet.

One submission runs the whole workflow with no approval step in between:

1. The server sends the text to the configured AI model, which analyses the requirement (features, business rules, acceptance criteria, validations, dependencies, error scenarios) and lists ambiguities, missing information, contradictions and assumptions.
2. The same call returns the test cases (positive, negative, boundary, edge, validation, business-rule and error-handling scenarios where the requirement supports them).
3. The page shows the analysis next to the generated cases. You tick the cases to keep, edit or remove the rest, and save. **Nothing is saved until you approve it, and no case is selected by default.**

### The seven columns

| Column          | Source and mapping to the existing model                                                                                                                                              |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TC ID           | `code`. Assigned by the existing database sequence when you save (`TC-0001`...). Shown as "Assigned on save" during review, because reserving IDs for unsaved cases would leave gaps. |
| Module          | `module`. Left empty and flagged "Module needs review" when the requirement does not name one.                                                                                        |
| Summary         | `title`                                                                                                                                                                               |
| Steps           | Ordered `steps` (one action per step)                                                                                                                                                 |
| Test Data       | `testData` (new field). Unspecified values are marked `[Not specified: ...]`, never invented.                                                                                         |
| Expected Result | `expectedResult`. Cases whose expected result the requirement does not define are flagged for clarification.                                                                          |
| Actual Result   | `actualResult` (new field). Always blank for generated cases.                                                                                                                         |

The table shows exactly these seven columns in this order. Controls (approve checkbox, Edit, Remove) sit inside the cells. Scenario type, priority, test type, source reference and flags appear as badges under the summary. They are review metadata, not columns.

Saved cases use the normal model and the normal bulk create (`POST /api/test-cases/bulk`, all or nothing). They are saved with status `Draft`, the tags `ai-generated` and the scenario type, and a description that records the source and any open clarification. They then work with the existing list, search, edit, export and delete.

### Data model change

Migration `002_test_data_actual_result.sql` adds `test_data` and `actual_result` to `test_cases`, both `NOT NULL DEFAULT ''`. Existing rows get empty values, and manual create and edit accept the fields as optional. Nothing else changed.

### Configuration

Set these in `.env` (never commit it) or the server environment, then restart the API:

| Variable                     | Default                       | Purpose                                                               |
| ---------------------------- | ----------------------------- | --------------------------------------------------------------------- |
| `ANTHROPIC_API_KEY`          | none                          | Required for generation. Server-side only; never sent to the browser. |
| `AI_MODEL`                   | `claude-sonnet-5-5`           | Model ID                                                              |
| `AI_TIMEOUT_MS`              | `120000`                      | Provider call timeout                                                 |
| `AI_MAX_REQUESTS_PER_MINUTE` | `10`                          | Local cap on generation requests, to limit spend                      |
| `ANTHROPIC_BASE_URL`         | `https://api.anthropic.com`   | Override for a proxy or gateway                                       |
| `AI_PROVIDER`                | `anthropic` when a key is set | `anthropic`, or `mock` for tests only                                 |

Without a key the page explains that AI is not configured and disables the form. Everything else works as before. The requirement text is sent to the AI provider, so do not paste confidential material unless your provider terms allow it.

### How it is built

- `apps/api/src/ai/provider.ts`: the `LlmProvider` interface. `anthropic.ts` implements it with the Anthropic Messages API and a forced tool call for structured output. To add another vendor, implement the interface and register it in `factory.ts`.
- `generator.ts` validates the model output against a Zod schema before anything is shown or saved. It trims and de-duplicates cases, forces Actual Result to blank, marks missing test data, flags unclear modules and expected results, and flags cases that resemble existing ones.
- The requirement is sent inside delimiters, and the prompt tells the model to treat it as data and never to invent business rules.
- Failures map to clear API errors: not configured (503), rate limited (429 with `Retry-After`), timeout (504), provider error (502), invalid response (502). Provider detail and keys stay in server logs only.

### Testing without a paid API

All automated tests mock the provider, so no key or network call is needed. `AI_PROVIDER=mock` selects a built-in provider that returns fixed sample cases. It is used by the browser tests, is labelled "Test provider active" in the UI, and the server refuses it when `NODE_ENV=production`. It is not AI.

**Live generation has not been exercised in this repository.** Set a real key and try it with your own requirement before relying on it.

### Limits

Requirement text: 20 to 20,000 characters. At most 60 generated cases per request, and 100 cases per save. Generated cases that have not been saved are lost if you leave the page.

## Manual verification

Start the app with `npm run dev`, then open http://127.0.0.1:5173.

1. **Create.** Test Cases, New test case. Submit empty to see the validation message. Enter a title, add two steps, add tags, choose a priority, and save. A success message appears and the detail page opens with a new `TC-` ID.
2. **View.** Check the steps are in order, with tags, status, priority, timestamps and revision shown.
3. **Edit.** Choose Edit, change the title, and save. The ID and created time stay the same, and the updated time and revision change.
4. **Search and filter.** On the list, search for a word from a title or an ID such as `TC-0003`. Combine with the priority, type, status and module filters. Sort by clicking headers. The count line shows "filtered of total".
5. **Duplicate warning.** Create a test case titled `login with valid credentials` in module `Authentication`. A warning lists the seeded case. Choose Keep editing.
6. **Export.** Apply a filter, then choose Export CSV. The download contains only the filtered rows.
7. **Import.** Choose Import CSV, download the template, add a row and upload it. Add a blank-title row to see a row-level error. Upload the same file again to see duplicates skipped.
8. **Delete.** On the list or detail page choose Delete. A confirmation dialog appears; Cancel keeps the record. Confirm to delete. The record disappears from the list and search.
9. **Persistence.** Stop the server with Ctrl+C, run `npm run dev` again, and confirm the data is still there.

## Extending

- **More AI input and providers.** File, PDF and DOCX input would extract text and then call the same `AiGenerationService.generate`. Another vendor is one class implementing `LlmProvider` plus a case in `factory.ts`.
- **Requirements and traceability.** Add `requirements` and `requirement_test_cases` tables with a new migration. Reference test cases by `id`.
- **Version history.** Add a `test_case_versions` table written inside `TestCaseRepository.update`.
- **Authentication.** Register an auth hook in `apps/api/src/app.ts` before the routes.

## Project status

This repository has no project `CLAUDE.md`, and the Engineering templates named in the workspace rules were not available when this module was built: `PROJECT_CLAUDE_TEMPLATE.md`, `hooks-templates/`, `ci-templates/` and the `jm-ts-commons` library. Because of that:

- No git hooks or CI workflow were created. They must come from the approved templates.
- No commons library was used. Candidates for the reusability log: the `normalizeText` helper, the CSV escape and parse helpers, the SQLite migration runner, and the `ConfirmDialog` and toast components.
- Branch and commit conventions need a ticket ID format that works without Jira. This is unresolved, so no branch was created and nothing was committed.
