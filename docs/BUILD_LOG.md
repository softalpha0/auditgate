# Build log

Codegeist 2026 deadline: **Tuesday 22 Dec 2026, 12:00 PT**. We aim to submit by **Mon 21 Dec**.

## Schedule

The live schedule, risks and self-score are in [`PLAN.md`](PLAN.md). Re-planned on 2 Nov after checking the project against _Hackathon 101_ ([`GUIDE_CHECK.md`](GUIDE_CHECK.md)): the Bitbucket spike moved to week 2, feature freeze is Thu 3 Dec, the video is 2:50.

## Week 1

### 29 Oct: Phase 0

Done:

- pnpm monorepo: TypeScript 6.0, ESLint 10 with `typescript-eslint`, Prettier, Vitest 5. GitHub Actions CI runs lint, format check, typecheck, tests, build, plus `forge build` and `forge test` for the demo contracts.
- `packages/core`: the data model from the brief and the finding lifecycle as a transition table. 31 tests.
- `demo/contracts`: Foundry project "vault-v2" with 11 planted findings (1 Critical, 3 High, 3 Medium, 3 Low, 1 Gas) across 3 in-scope contracts. 5 exploit tests prove C-01, H-01, H-02, M-01 and L-01. All pass.
- `demo/reports`: real output from Slither 0.11.6 (21 results) and Aderyn 0.6.8 (3 high, 8 low), a report template, and the full Markdown audit report.
- Spike: one Forge app can't cover Jira and Bitbucket. Options and a recommendation are in `ARCHITECTURE.md`.
- Docs checked against the brief. Differences are listed in `ARCHITECTURE.md` section 5.
- Evidence: `evidence/phase-0/` has the forge test, Slither, Aderyn and Vitest output.

Findings worth keeping for the pitch:

- Slither and Aderyn both miss C-01 and H-02 (missing access control). Tool output alone isn't an audit, which is why Markdown import matters.
- The two tools disagree on severity: Slither calls unchecked transfers High, Aderyn calls them Low. AuditGate keeps each tool's own rating and says where it came from.

Notes:

- The Forge MCP server (`https://mcp.atlassian.com/v1/forge/mcp`) answers without auth. I called it directly for module lists, doc search and API specs. The ADS MCP server and the Forge AI plugin skills aren't connected in this environment; I'll use the `atlassian-design-tokens` tool on the Forge MCP server for tokens.
- Custom merge checks block merges only on Bitbucket Premium. See `ARCHITECTURE.md` 2a.

Waiting on Benjamin:

- Decision on the state-sharing option (A, B or C) and on the baseline-commit proposal.
- Steps in `SETUP.md`: Forge login, dev site, Bitbucket workspace + demo repo push (send me the commit SHA), `forge create` x2, GitHub repo.

### 29 Oct (later): Phase 1 parsers, plus Phase 2 pure logic

Done:

- `packages/parsers`: Slither, Aderyn and Markdown parsers, plus format detection from content. Tested on the committed real outputs.
  - Slither: 21 of 21 results kept. Ids hash the detector and every element's position, so two unchecked transfers in the same function stay separate. Optimization maps to Gas.
  - Aderyn: one finding per issue per file (16 from the demo), because drift works per file. Aderyn has no Medium bucket; it ships High and Low only.
  - Markdown: all 11 findings from `vault-v2-audit.md`, the header (name, auditor, commit, scope), multiple locations, unknown fields kept in the description, code blocks ignored. Every problem becomes a plain-language warning, not a silent drop. A finding with no location is still imported, with a warning, because dropping a Critical finding is the exact failure AuditGate exists to stop.
  - Re-import is idempotent: same input gives the same ids, even with results in a different order. Markdown ids depend on the finding ID only, so editing a title updates the issue instead of making a new one.
- `packages/drift`: file-level drift with tests for unchanged, modified, renamed, deleted, re-added and out-of-scope files. Converts Bitbucket diffstat (statuses `added`, `removed`, `modified`, `renamed`, checked against the OpenAPI spec). Unknown statuses count as modified, which is the safe side.
- `packages/gate`: the gate rule from the brief, the merge check message, and an optional `blockOnUnreviewedChanges` rule for decision 3. A Verified or Accepted finding whose file changed counts as drifted even if the stored status hasn't caught up.
- One end-to-end test runs the real audit report through import, fix, drift and gate.
- 102 tests in total. Output in `evidence/phase-1/vitest.txt`.

Notes:

- The brief's sample merge message lists a drifted M-02. Under the gate rule, Medium findings never block, so the real message would leave it out. The code follows the rule.
- The baseline-commit question (ARCHITECTURE.md section 3) is still open. The drift package takes changes from any baseline, so either answer works without rewriting it.

Next, blocked on Benjamin: `forge create` for the Jira app, then the New audit form, bulk issue creation and the issue panel.

### 30 Oct: Phase 1, the Jira app

Went ahead with the recommended defaults on the three open decisions (Option A, baseline commits, per-audit strict mode on by default) so the work wasn't blocked. All three can still change before Phase 2; nothing built so far depends on Option A.

Done:

- `apps/forge`: the AuditGate Jira app, UI Kit.
  - Project page: list of audits with their gate state; **New audit** form with file upload or paste, a preview of what the report contains before anything is created, fields prefilled from the report header; audit page with severity counts, gate message, findings table linked to the source at the audited commit and to each Jira issue, live import progress, and **Re-import**.
  - Issue panel, shown only on AuditGate issues: severity and status, source links at the audited commit, recommendation, the status actions a person may take (Start fix, Mark as fixed, Accept risk with reason and approver), and full history.
  - Import runs on a Forge queue consumer: bulk create in batches of 50 with the finding stored as an issue property in the same call; only changed findings are updated on re-import; a retry after a crash adopts issues Jira already created instead of duplicating them; labels and priority are dropped and retried if the project's create screen rejects them.
  - Issue property `auditgate` indexed for JQL: `auditgateStatus`, `auditgateSeverity`, `auditgateRank`, `auditgateFinding`, `auditgateAudit`, `auditgateFile`.
- `packages/jira`: findings to Jira fields, a Markdown to ADF converter for descriptions, source links to Bitbucket at the audited commit, re-import merging by content hash.
- `parsers`: `decodeUpload` for the file picker's data (data URL, base64 or plain text) with a 350 KB cap.
- `scripts/forge-check.cjs`: validates the manifest and bundles the backend and both UI entries with the Forge CLI's own validator and webpack config. Needs no login, so it runs in CI as a new job.
- 146 tests (was 102). Service tests run the whole import, re-import, crash recovery and panel flow against in-memory fakes of Jira and storage.

Verified here (evidence in `evidence/phase-1/`):

- Manifest valid and app bundles under Forge CLI 15.0.0 (`forge-check.txt`). I confirmed the validator catches errors by feeding it a broken manifest.
- The bundle check caught a real deploy blocker before you hit it: `noEmit` in the app's `tsconfig.json` made Forge's TypeScript loader emit nothing. Fixed.

Not verified yet, needs your Atlassian login:

- `forge register`, `forge deploy`, `forge install`, and the app running on a real site. The first real run is the next step (SETUP.md step 6).
- Whether the UI Kit file picker's `data` is base64 or text in practice. Both are handled, and paste is the fallback.

Notes:

- UI Kit instead of Custom UI. Reasons in ARCHITECTURE.md section 6.
- Found while reading the docs: any user who can edit an issue can edit its properties through the REST API. AuditGate never trusts the property; KVS is the source of truth. For Option A, the Bitbucket app will verify an HMAC on the property (ARCHITECTURE.md section 4).

## Week 2

### 2 Nov: checked against Hackathon 101

Went through the guide chapter by chapter (`GUIDE_CHECK.md`) and re-read the official rules.

Added:

- `RULES.md`: decoded rules, submission checklist, judging criteria mapped to our status, bonus requirements, four questions for the organizers.
- `RESEARCH.md`: sourced evidence. Zellic calls the problem "audit drift"; Nomad lost about $190M through code changed after its audit began; Quantstamp and Hashlock on audit scope and fix reviews; competitors (Zellic's tracker works after deployment, AuditGate before merge); patterns in Codegeist 2025 winners.
- `PLAN.md`: goals, five-question test, done statement, MoSCoW, three user journeys, risks ranked, schedule planned backwards, self-score, parking lot.
- `USER_INTERVIEWS.md`: script and log for 5 conversations by 15 Nov.
- `SUBMISSION.md` and `VIDEO_SCRIPT.md`: early drafts.
- `AGENTS.md` at the repo root, and `.env.example`.

Changed:

- Video target is 2:50, because judges don't have to watch past 3:00.
- Bitbucket spike (R2) moved to this week; it's the riskiest unbuilt part.
- New Should-have: a "Check a change" panel so judges can test drift and the gate without Bitbucket.
- Block on unreviewed changes stays on by default, backed by a published fix-review statement.

Self-score today: technical 5, design 4, impact 4, innovation 7, presentation 1. Weakest: presentation and impact.

### 4 Nov: Check a change, and a first-version submission plan

- `packages/drift`: `parseChangedFiles` reads `git diff --name-status` output or bare paths.
- Jira app: **Check a change** on the audit page. Paste changed files; see which audited files changed, the findings they affect, out-of-scope files, and what the release gate would say. Read-only. Uses the same drift and gate code the merge check will use.
- 154 tests (was 146). Manifest valid and app bundles under Forge CLI 15.0.0.
- `JUDGES.md`: test steps for the first version. `FAST_SUBMIT.md`: two-day path to a first Devpost submission, then keep editing until 21 Dec.
