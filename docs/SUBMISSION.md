# Devpost submission (draft)

Draft started 2 Nov 2026 and refined weekly. Anything in [brackets] is waiting on something real: a link, a screenshot, an interview quote. Don't submit while any brackets remain. Every factual claim comes from `RESEARCH.md`.

## Project name and tagline

**AuditGate**

AuditGate helps Web3 teams ship the code their auditor actually reviewed, by turning audit findings into Jira work and blocking a Bitbucket merge when audited code changes.

## Category and bonus prizes

- Category: Apps for Specialized Industries (finance / Web3)
- Bonus: Best Agents, Best app with Atlassian MCP, Best Marketplace published app

## Inspiration

Nomad's token bridge was audited in June 2022. Two months later it lost about $190 million through code that, according to the auditor, changed after the audit began. Security researchers call this audit drift: the code that ships isn't the code that was reviewed.

Audits cost a lot and arrive as a PDF. Someone copies the findings into tickets by hand. Code keeps changing. A fix review checks whether the findings were fixed, not whether new code came in with the fixes. [Quote from a user interview.]

## What it does

1. **Import.** Upload a Markdown audit report, Slither JSON or Aderyn JSON. Each finding becomes a Jira issue with severity, location, recommendation and a link to the exact lines at the audited commit. Re-importing a newer report updates the issues instead of duplicating them.
2. **Track.** Each issue has an AuditGate panel showing severity, status and history. Accepting a risk needs a reason and a named approver.
3. **Drift check.** AuditGate stores the commit the auditor reviewed. For any pull request, it lists the audited files that changed since then and the findings they affect.
4. **Release gate.** A Bitbucket merge check fails while a Critical or High finding is open or drifted, or while an audited file changed without re-review, and names every finding that blocks it.
5. **Rovo agent.** Ask "Is this release safe to ship?" or "What changed since the audit?" and get an answer that cites Jira keys and the commit it checked.
6. **MCP tools.** The same read-only actions are available as MCP tools for Rovo Studio agents and third-party clients, with an open-source `skill.md`.

## How we built it

- Two Forge apps, because one Forge app can't span Jira and Bitbucket: a Jira app (UI Kit project page, issue panel, Rovo agent and actions, `rovo:mcp`) and a Bitbucket app (`bitbucket:mergeCheck`).
- All the logic (report parsers, drift, gate, Jira mapping) lives in plain TypeScript packages with [N] tests, run against real Slither and Aderyn output from a demo contract repo with 11 planted bugs.
- Imports run on a Forge queue: 50 issues per bulk call, the finding stored on each issue as an indexed property, and crash-safe retries that adopt issues Jira already created instead of duplicating them.
- Data stays in Forge storage and Jira. The Jira app has no egress.
- CI validates the manifest and bundles the app with the Forge CLI's own tooling on every push.

## Challenges

[Fill in from the build log. Candidates: Jira and Bitbucket can't share one Forge app or its storage; the merge check hard-blocks only on Bitbucket Premium; issue properties can be edited by any user, so AuditGate never trusts them; a "re-check" can't be measured from the audit commit, because every fix changes an audited file, so each finding gets its own baseline commit.]

## Accomplishments

[Fill in at the end. Keep it to things judges can verify.]

## What we learned

[Fill in at the end.]

## What's next

- Compare deployed bytecode with the audited commit after deployment
- GitHub and GitLab support
- Auditors confirming fixes directly in AuditGate

## How it meets the main technology requirement

[One paragraph: Forge apps on Jira, Bitbucket and Rovo, listing the modules: `jira:projectPage`, `jira:issuePanel`, `jira:entityProperty`, `consumer`, `bitbucket:mergeCheck`, `rovo:agent`, `action`, `rovo:mcp`.]

## Bonus prize write-ups

**Best Agents.** [What the agent does, its actions, the prompt rules (answers only from action results, always cites Jira keys, never marks a finding Verified without a drift check), and the 10-question test results.]

**Best app with Atlassian MCP.** [Which actions are exposed as tools, how a third-party client connects, and the `skill.md` link.]

**Best Marketplace published app.** [Listing or review ticket link.]

## Installation and testing

[Install links and a short version of `JUDGES.md`. Say plainly that the merge check blocks merges only on Bitbucket Premium and shows a failing check on other plans, and point judges to the "Check a change" panel if they don't set up Bitbucket.]

## Links

- Video: [YouTube link, public]
- Repository: [GitHub link]
- Landing page: [link]
- Install link (Jira): [link]
- Install link (Bitbucket): [link]
- Marketplace: [link]

## Built with

forge, jira, bitbucket, rovo, typescript, react, ui-kit, solidity, foundry, slither, aderyn

## AI use

Built with Claude Code as a coding assistant. Every feature was reviewed and tested before commit; tests and CI are in the repository.
