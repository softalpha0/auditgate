# Architecture

Everything here was checked against the Forge docs and the Forge MCP server (29–30 Oct 2026).

## 0. Decisions so far

| Decision                                                | Choice                                                                                        | Status                                                                              |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| How the Jira and Bitbucket apps share state (section 2) | Option A: Jira app is the store; the Bitbucket app reads and writes it over the Jira REST API | Taken as the working default on 30 Oct. Benjamin can still overrule before Phase 2. |
| Re-check baseline (section 3)                           | Each finding gets a baseline commit that moves forward when a fix is confirmed                | Working default; built in Phase 2                                                   |
| Block on any change to an audited file (section 3)      | Per-audit setting, on by default                                                              | Stored on each audit from Phase 1; enforced in Phase 2                              |
| UI technology                                           | UI Kit (`@forge/react` 12), not Custom UI                                                     | Section 6                                                                           |
| Storage                                                 | Forge KVS with prefixed keys, not custom entities                                             | Section 4                                                                           |
| Import                                                  | Async queue consumer, idempotent                                                              | Section 7                                                                           |

## 1. Spike: can one Forge app run in Jira and Bitbucket?

**No.** Forge's multi-app compatibility (Preview) supports Jira, Confluence and Compass only. Bitbucket is not on the list. Source: <https://developer.atlassian.com/platform/forge/app-compatibility/>.

Other facts that shape the design:

| Fact                                                                                                                                                                                                                                                | Source                                                                                     |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `rovo:agent`, `action` and `rovo:mcp` are Jira/Confluence modules. A Bitbucket app can't have them.                                                                                                                                                 | Forge MCP `list-forge-modules` ("Agents ... integrate into Jira and Confluence workflows") |
| Forge storage belongs to one app installation. Two apps can't read each other's storage.                                                                                                                                                            | Forge storage docs                                                                         |
| A Bitbucket app calls Bitbucket with `api.asApp().requestBitbucket(...)`, no token and no egress.                                                                                                                                                   | Merge check tutorial                                                                       |
| Diffstat between two commits: `GET /2.0/repositories/{workspace}/{repo_slug}/diffstat/{spec}` with `spec = <head>..<base>`, `topic=false` for a plain two-dot diff. Note the order is the reverse of `git diff`. Rename detection is on by default. | Forge MCP `search-forge-docs` (Bitbucket OpenAPI)                                          |
| Calling any Atlassian domain from a Forge function (`*.atlassian.net`, a web trigger URL) counts as egress. Atlassian domains can't be allow-listed.                                                                                                | <https://developer.atlassian.com/platform/forge/runs-on-atlassian-apps/>                   |
| "Runs on Atlassian" needs: no external egress except analytics, no remotes, no **dynamic** web triggers (static ones are fine).                                                                                                                     | same                                                                                       |
| Marketplace lists one product per app. A two-product product is two listings.                                                                                                                                                                       | Atlassian community answers from staff; re-check when we list                              |

So AuditGate is **two Forge apps**, and they need a way to share state.

## 2. How the two apps share state

Where things must live:

- **Jira app (`auditgate`)**: findings, Jira issues, dashboard, Rovo agent and actions, MCP tools. It's the source of truth for finding status.
- **Bitbucket app (`auditgate-bitbucket`)**: the merge check. It's the only one that can read diffs without a token.

The merge check needs finding statuses from Jira. The Jira dashboard and Rovo need drift data from Bitbucket. At least one direction has to cross products, and that crossing is egress for whichever app makes the call.

### Option A (recommended): Jira is the store, the Bitbucket app reads and writes it over the Jira REST API

- The Bitbucket app gets a repo settings page where an admin pastes the Jira site URL, an account email and a scoped Jira API token. The token is stored with Forge KVS secret storage in the Bitbucket installation.
- On every merge check run the Bitbucket app:
  1. calls diffstat between the audited commit and the PR head (`requestBitbucket`, no egress),
  2. reads the findings for that repo from Jira (JQL on label `auditgate` plus issue properties),
  3. runs `packages/drift` and `packages/gate`,
  4. writes the drift result back to Jira as an issue property on each affected issue, plus a snapshot on the audit (`changed files`, `head commit`, `checked at`),
  5. returns pass or fail with the message.
- The Jira app reads drift from those properties. The dashboard and Rovo say "as of commit `abc1234`, checked 4 minutes ago".

Trade-offs:

- **Jira app: no egress, no web triggers.** It keeps "Runs on Atlassian" eligibility, and that's the app with the Rovo agent and MCP tools.
- Bitbucket app: one egress domain, the customer's own `*.atlassian.net`. Data never leaves Atlassian, but that app won't get the badge.
- One setup step: paste a Jira API token into Bitbucket. Judges have to do this too, so `JUDGES.md` will walk through it with screenshots.
- Jira-side drift is only as fresh as the last merge check run. A "Re-check" button in Jira can't call Bitbucket. It can only re-read the last snapshot and tell the user to push or re-run the check. Running the check from the PR covers the demo.

### Option B: the Bitbucket app asks the Jira app through a web trigger

- The Jira app exposes a **dynamic** web trigger that takes `{changedFiles, headCommit}` and returns `{pass, message}`. The Bitbucket app calls it with a shared secret.
- The Jira app also needs Bitbucket data for its own "Re-check", so it calls `api.bitbucket.org` with a Bitbucket API token.

Trade-offs: both apps have egress, and the dynamic web trigger alone removes Runs on Atlassian from the Jira app. Two secrets to manage, not one. More moving parts for no gain over A.

### Option C: one Jira app, no Bitbucket app

- The Jira app receives Bitbucket webhooks on a web trigger, calls the Bitbucket API with a token and posts a commit **build status** on the PR. Bitbucket's built-in "require passing builds" check does the blocking.

Trade-offs: no `bitbucket:mergeCheck`, which is the module the gate is built around (F3). Like custom merge checks, enforcing build status needs Bitbucket Premium (see section 2a). The Jira app loses Runs on Atlassian. Simplest to build, weakest demo.

**My recommendation is A.** It keeps the app judges spend the most time in (Jira, Rovo, MCP) clean, uses the real merge check module, and the one extra setup step is easy to explain. Since Runs on Atlassian is not a Codegeist 2026 bonus prize, the badge matters only for the Marketplace listing, so B would also be acceptable if you'd rather avoid the token step. I'd still pick A.

## 2a. Hard blocking needs Bitbucket Premium

The merge check tutorial says: "If you're on a premium plan, tick the _Required_ checkbox". On Free and Standard, a custom merge check runs and shows pass or fail on the PR, but it can't stop the merge. This applies to every option above.

What this means for us:

- **Demo video:** start a Bitbucket Premium trial on the demo workspace before recording, so the Merge button is actually disabled on camera.
- **Judges:** most will be on a free workspace. They'll see the AuditGate check fail with the finding list, but the merge won't be blocked. `JUDGES.md` and the README must say this plainly, not hide it.
- **Product copy:** "blocks the merge on Bitbucket Premium; shows a failing check on other plans."

## 3. Open question on the lifecycle: what "Re-check" compares against

The brief says the Re-check action "re-runs drift for that finding and moves FixedPendingRecheck → Verified if clean". If drift is always measured from the **audited commit**, a fix can never be clean, because fixing H-01 means editing `TokenVault.sol`, which is an audited file. Every fixed finding would go straight to Drifted.

Proposal: each finding gets a **baseline commit**.

- At import, baseline = the audited commit.
- Re-check is a person (the auditor or a named reviewer) confirming the fix at a specific commit, normally the PR head. That sets status to Verified and baseline = that commit, and is recorded in history.
- From then on, drift for that finding means "its file changed since its baseline". Verified → Drifted happens when someone edits the file again after the fix was confirmed.
- For Open / InFix findings, drift is shown as information ("code changed since the audit") but doesn't change the gate result, since those already block.

A second, related point: as written, the gate only looks at findings. An audited file with no Critical/High findings (or none at all) can change and the gate still passes. If the pitch is "block while audited code has changed since the audit", we may want an optional rule: **any change to an in-scope file blocks until someone signs off a re-review at that commit.** I'd make it a per-audit setting, on by default, because it is the thing no other tool does.

Neither changes Phase 0 code. `packages/core` implements the transition table exactly as written in the brief. I'll add the baseline commit in Phase 2 if you agree.

## 4. Storage: Forge KVS with prefixed keys

| Key                             | Value                                                                         |
| ------------------------------- | ----------------------------------------------------------------------------- |
| `audit:<projectId>:<auditId>`   | The audit: repo, audited commit, scope, settings, import status               |
| `finding:<auditId>:<findingId>` | One finding, with status, history, Jira key and the hash last written to Jira |
| `issue:<issueId>`               | Reverse link from a Jira issue to its finding, for the issue panel            |

Why plain keys and not custom entities: entities and their attributes can never be deleted once deployed, and every query AuditGate needs is "all findings for this audit" or "all audits in this project", which a key prefix answers. An audit has tens to a few hundred findings, so filtering by status in memory is cheap. If Rovo actions in Phase 3 need indexed queries across audits, entities can be added then without migrating these keys.

Limits that shape the code: a KVS query returns at most 100 items per page, a batch write takes at most 25 keys, a value can be at most 240 KiB. The store pages and batches accordingly.

Jira holds the human-facing copy. Each finding issue carries an issue property `auditgate` (audit id, finding id, severity, status, file), indexed for JQL by a `jira:entityProperty` module, for example `auditgateStatus = "Drifted" AND auditgateRank <= 1`.

**Issue properties are not trusted.** Any user who can edit an issue can also edit its properties through the REST API. AuditGate never reads status back from the property; KVS is the source of truth. This matters for Option A: the Bitbucket app can't read KVS, so in Phase 2 the property will carry an HMAC of its contents, keyed by a secret the Jira app keeps in KVS and the admin pastes into the Bitbucket app at setup. The merge check rejects any property whose signature doesn't match, so editing the property by hand can't open the gate.

## 5. Other things the docs changed from the brief

- `rovo:mcp` is **Preview**, not EAP. External clients **are** supported: tools are served at `https://mcp.atlassian.com/forge/<appId>` with OAuth 2.1, after a site or org admin turns on external exposure (off by default). So F5 can be demoed from Claude Code, not only Rovo Studio. Limits: one `rovo:mcp` module per app, at most 50 tools, action keys under 64 characters.
- The Codegeist 2026 MCP prize also mentions "open-source skill.md files which users can add to their third party agents". We should ship one.
- Rovo actions: verbs are `GET`, `CREATE`, `UPDATE`, `DELETE`, `TRIGGER`. Agents run from automation rules can't call the write verbs. The documented limit is 5 MB of data per action, not a response size cap. The agent and action pages don't mention `read:chat:rovo`; I'll check the scope reference before Phase 4.
- `bitbucket:mergeCheck` triggers are `on-code-pushed`, `on-reviewer-status-changed` and `on-merge`. There is no "on PR opened" trigger; `on-code-pushed` covers new PRs. `on-merge` gets `mergeProperties`. Scope `read:pullrequest:bitbucket` is confirmed. Admin must enable custom merge checks at workspace level, then add the check on the repo/project/workspace. Marking it **Required** (hard block) is Premium only, see 2a.
- Vitest 4+ removed `vitest.workspace.ts`. Projects are listed in `vitest.config.ts`.
- TypeScript is pinned to 6.0 because `typescript-eslint` doesn't support TypeScript 7 yet.
- Codegeist 2026 deadline: **22 Dec 2026, 12:00 PT**. Bonus prizes: Best Agents, Best app with Atlassian MCP, Best apps with Teamwork Graph, Best Marketplace published app ($1,500 x 6 each). There's no Runs on Atlassian prize this year.

## 6. UI Kit instead of Custom UI

The brief asked for Custom UI with Atlaskit. UI Kit now covers everything AuditGate needs: tables, lozenges, badges, forms, a file picker, user picker and charts. Its components are the Atlassian Design System components, so the app gets native styling, design tokens, and light and dark mode with no extra work. It also removes a separate React build, a static bundle per page and a Content Security Policy to maintain.

The file picker is a Preview component. Its `data` field is a string whose encoding the docs don't pin down, so `decodeUpload` accepts a data URL, bare base64 or plain text, and there's a "paste the report" fallback on the form.

If the F6 dashboard needs something UI Kit can't draw, the `Frame` component can host a small Custom UI piece inside the UI Kit page.

## 7. Import pipeline

1. **Preview** (resolver): decode and parse the upload, show counts and warnings. Nothing is stored.
2. **Create or re-import** (resolver, runs as the user): validate the form, check the user can create issues in the project (`asUser` create metadata), merge the parsed findings with what's stored, save, and push a job onto the `auditgate-import` queue. A resolver has 25 seconds; the queue consumer has up to 900.
3. **Import job** (queue consumer, runs as the app):
   - reads the project's create screen to pick an issue type (Bug, then Task) and see whether labels and priority can be set;
   - looks for issues already carrying this audit's property and adopts them, so a crash between "Jira created the issue" and "AuditGate saved the key" can't create a duplicate on retry;
   - creates missing issues 50 at a time with `POST /rest/api/3/issue/bulk`, setting the issue property in the same call; if the project's create screen rejects labels or priority, retries without them;
   - updates only issues whose report content changed, tracked by a content hash per finding;
   - writes progress to the audit so the page can show "7 of 11 done".

Re-importing an identical report writes nothing to Jira. A finding that disappears from a newer report is kept and listed, not deleted.

## 8. Scopes

| Scope             | Used for                                                |
| ----------------- | ------------------------------------------------------- |
| `read:jira-work`  | Project create metadata, JQL search for crash recovery  |
| `write:jira-work` | Create and update issues, set the issue property        |
| `read:jira-user`  | User names in the panel history and the approver picker |
| `storage:app`     | Forge KVS                                               |

`/rest/api/3/priority/search` would need `manage:jira-configuration`, so priorities come from the create metadata instead, which needs only `read:jira-work` and also tells us whether priority is on the create screen at all.

No egress, no remotes, no web triggers: the Jira app stays eligible for Runs on Atlassian.
