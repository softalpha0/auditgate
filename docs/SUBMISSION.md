# Devpost submission

Rewritten 20 Nov 2026 from what runs on softalpha-dev and the auditgate-demo Bitbucket workspace. Every section is ready to paste. Brackets mark the three things that don't exist yet: the video, the Bitbucket install link and the Marketplace listing. Facts about Nomad come from `RESEARCH.md`.

## Project name

AuditGate

## Tagline (Devpost "elevator pitch", 200 characters max)

Smart contract audit findings become Jira issues, and a Bitbucket merge check blocks pull requests that change audited code while serious findings are open.

## Category and bonus prizes

- Category: Apps for Specialized Industries (finance and Web3)
- Bonus prizes: Best Agents, Best app with Atlassian MCP, Best Marketplace published app

## Inspiration

Nomad's token bridge was audited in June 2022. Two months later it lost about $190 million through code that, according to the auditor, was changed after the audit began (Zellic, Quantstamp).

This gap has a name: audit drift. The code that ships is not the code that was reviewed. An audit arrives as a PDF. Someone copies the findings into tickets by hand. The code keeps changing. A fix review checks that the findings were fixed. Nobody checks what else changed in the audited files before release.

We wanted the audit to stay attached to the code until release, inside the tools teams already use to ship.

## What it does

AuditGate is two Forge apps that work together: one in Jira, one in Bitbucket.

1. **Import.** Upload a Markdown audit report, Slither JSON or Aderyn JSON. Each finding becomes a Jira issue with its severity, priority, description, recommendation and a link to the exact lines at the audited commit. Re-importing a newer report updates the existing issues instead of duplicating them.
2. **Track.** Each issue has an AuditGate panel with the finding's status and history: Open, In fix, Fixed (awaiting re-check), Verified, Drifted, Accepted risk. Accepting a risk needs a written reason and a named approver.
3. **Check a change.** Paste the output of `git diff --name-status` into the AuditGate tab. It lists which audited files changed since the audited commit, which findings they touch, and whether the release would be blocked.
4. **Block the merge.** The Bitbucket merge check runs on every push to a pull request and on merge. It reads the repository's findings from Jira and compares the pull request with the audited commit. It fails while a Critical or High finding is open or drifted, or while an audited file changed without a re-review. The message names every blocking finding and its Jira issue. On a real pull request it said:

   > Blocked by AuditGate: 4 open (C-01, H-01, H-02, H-03), 1 audited file changed without re-review (src/TokenVault.sol). Jira: C-01 KAN-12, H-01 KAN-13, H-02 KAN-14, H-03 KAN-15. Compared with 16b9a19 ("Vault v2 audit").

5. **Clear the gate.** A project admin signs off a re-review at a specific commit, normally the head of the pull request. Findings marked fixed become Verified, and the merge check passes for exactly that commit if no Critical or High finding is still open. The next commit that touches audited code needs a new sign-off.
6. **Rovo agent.** An AuditGate agent with four read-only actions: release readiness, open findings, one finding's details and history, and drift for a list of changed files. It answers only from action results and cites Jira keys.
7. **MCP tools.** The same four actions are exposed as `rovo:mcp` tools for Rovo Studio agents and outside MCP clients, with an open-source `skill.md` that teaches an agent when to use them.

## How we built it

- **Two Forge apps**, because one Forge app can't span Jira and Bitbucket. The Jira app uses `jira:projectPage`, `jira:issuePanel`, `jira:entityProperty`, a queue `consumer`, `rovo:agent`, `action` and `rovo:mcp`. The Bitbucket app uses `bitbucket:mergeCheck` and `bitbucket:repoSettingsMenuPage`.
- **Shared logic in plain TypeScript packages:** report parsers, drift, the gate, and the Jira mapping. Both apps run the same gate code, so "Check a change" in Jira and the merge check in Bitbucket always agree. 211 tests, run against real Slither and Aderyn output from a demo Foundry repo with 11 planted bugs, each proved by a test.
- **Imports run on a Forge queue.** Up to 50 issues per bulk call, ordered by severity so C-01 gets the first issue number. Retries are safe: before creating anything, the job adopts issues Jira already created.
- **Signed finding data.** The Bitbucket app can only read Jira, not the Jira app's storage, so each issue carries its finding as an indexed issue property. Anyone who can edit an issue can edit its properties, so the Jira app signs each one with HMAC-SHA256. The merge check fails if any signature doesn't match. Editing an issue property by hand can't open the gate.
- **Least access.** The Jira app has no egress and qualifies for Runs on Atlassian. The Bitbucket app calls one host, `api.atlassian.com`, with a scoped API token that only needs `read:jira-work`. It writes to Jira only if an admin turns on recording drift, and then only a signed `auditgate-drift` property that the issue panel shows and JQL can search.
- CI validates both manifests and bundles both apps with the Forge CLI's own tooling on every push.

## Challenges we ran into

- **One product, two apps.** Forge apps can't span Jira and Bitbucket or share storage. We made Jira the single source of truth and had the Bitbucket app read it over the REST API with a read-only token.
- **Trusting data anyone can edit.** Issue properties are editable by any user with edit rights. Signing them, and failing the check on any bad signature, closed that hole.
- **Measuring "fixed" against the right commit.** Every fix changes an audited file, so measured from the audit commit, a fix always looks like drift. A fixed finding counts as Verified only after someone confirms it, and AuditGate blocks unreviewed changes to audited files on purpose.
- **Jira projects differ.** On our team-managed test project, Priority was missing from both the create screen and the edit metadata, yet Jira accepted it on edit. We found this by checking the live issues through the Atlassian MCP server, then fixed the import to set priority after creating and to fall back to Jira's standard priorities.
- **Platform details that only show up live.** Forge's `route` helper rejects `..` inside a parameter, which Bitbucket's diff API needs. A settings page resolver gets the workspace and repository IDs but not the page URL. Hard blocking needs Bitbucket Premium; on other plans the check shows a fail but can't stop the merge.

## Accomplishments that we're proud of

- A real pull request in Bitbucket, blocked by findings that live in Jira, with each Jira issue named in the message.
- The full loop runs on Atlassian sites: report to Jira issues, issue panel and status history, release gate, merge check.
- A tamper-evident link between two Forge apps, without giving the Bitbucket app write access to anything.
- 211 automated tests, and CI that builds both Forge apps with the Forge CLI's own tooling.

## What we learned

- Forge's Bitbucket support is strong enough for a real release gate: merge check triggers, repository settings pages and encrypted storage.
- Test on a real site early. Two of our bugs, the hidden Priority field and the settings page context, only showed up on live sites, and both were found and fixed the same day.
- The Atlassian MCP server is a good debugging tool. It let us read issue properties and edit metadata directly, without screenshots.

## What's next

- Writing drift results back to Jira from the merge check.
- Comparing deployed bytecode with the audited commit after deployment.
- GitHub and GitLab support.

## How it meets the main technology requirement

AuditGate is built entirely on Forge. The Jira app adds a project page (`jira:projectPage`), an issue panel (`jira:issuePanel`), searchable finding data (`jira:entityProperty`), a background import queue (`consumer`), a Rovo agent with four actions (`rovo:agent`, `action`), and the same actions as MCP tools (`rovo:mcp`). The Bitbucket app adds a custom merge check (`bitbucket:mergeCheck`) and a repository settings page (`bitbucket:repoSettingsMenuPage`). Both use UI Kit and Forge storage.

## Bonus prize write-ups

**Best Agents.** The app ships a `rovo:agent`, four `action` modules and a `rovo:skill` (`auditgate-release-check`) that tells the agent which action to use and how to read its results. The AuditGate agent answers release questions from live data: "Is the latest release safe to ship?", "Summarize open audit findings by severity", "What changed since the audit?", "Who owns H-03?". Its four actions are read-only, check that the user can browse the project before answering, and return small, plain results. The prompt tells the agent to answer only from action results, to cite Jira keys, and never to call a finding Verified. When a question needs the list of changed files, the agent asks for it and gives the exact `git diff` command.

**Best app with Atlassian MCP.** The four actions are exposed through `rovo:mcp`, so Rovo Studio agents and outside MCP clients can ask the same questions. The repository includes `skills/auditgate/SKILL.md`, which tells an agent when to call each tool. We also used the Atlassian MCP server during the build, to read issue properties and edit metadata on the live site. That is how we found and fixed the priority bug.

**Best Marketplace published app.** [Listing or review ticket link]

## Installation and testing

Short version of `docs/JUDGES.md` and `docs/BITBUCKET.md`:

1. Install AuditGate in Jira with the link below.
2. In a Jira project, open the AuditGate tab, click New audit and upload `demo/reports/vault-v2-audit.md` from the repository. It creates 11 issues.
3. Open any issue to see the AuditGate panel. Use "Check a change" on the audit page to see the gate without Bitbucket.
4. For the merge check, install AuditGate for Bitbucket on a shared workspace, then follow `docs/BITBUCKET.md`.

The merge check blocks merges only on Bitbucket Premium. On Free and Standard it runs and shows a failing check with the full message, but Bitbucket doesn't stop the merge.

## Links

- Video: [YouTube link, public]
- Repository: https://github.com/softalpha0/auditgate
- Install link (Jira): https://developer.atlassian.com/console/install/dc6e5d7c-6f3b-4766-af94-425ef105f7a4?signature=AYABeP9N1I0PHoOKkBdvJQWPZhgAAAADAAdhd3Mta21zAEthcm46YXdzOmttczp1cy13ZXN0LTI6NzA5NTg3ODM1MjQzOmtleS83MDVlZDY3MC1mNTdjLTQxYjUtOWY5Yi1lM2YyZGNjMTQ2ZTcAuAECAQB4CxqLTo9l4lqXuFjNim1xJM%2Bp%2F3TVP9xHS2BrU5DRRucBotNKxLyvp9Uqo9XPMjPVxgAAAH4wfAYJKoZIhvcNAQcGoG8wbQIBADBoBgkqhkiG9w0BBwEwHgYJYIZIAWUDBAEuMBEEDEGXfNCm%2ByvcXd0ZlgIBEIA7B0dqL8NGa5tlvgi%2B0LO1ZPNUy8VV1My7exrT4JAo4bqRw1Xq25OyE8OFA6pX%2BYSv%2BrhYxe%2BnlmfN0TcAB2F3cy1rbXMAS2Fybjphd3M6a21zOmV1LXdlc3QtMTo3MDk1ODc4MzUyNDM6a2V5LzQ2MzBjZTZiLTAwYzMtNGRlMi04NzdiLTYyN2UyMDYwZTVjYwC4AQICAHi9bVMAkme4qVQX1fQHo6ePw3H40A7cGfz7yrmSfBWMXgGKBlPlYBd7PCc%2B00etVIhaAAAAfjB8BgkqhkiG9w0BBwagbzBtAgEAMGgGCSqGSIb3DQEHATAeBglghkgBZQMEAS4wEQQMLsGKG4GMoJzNUf0uAgEQgDvXSTHzusftEU1%2Fxc1h8G12xoybvWP49PgV7HC6T6Uk%2B%2B1yykpE6Z9CnMPD5pAbFtXyp%2F0DUbPklKmmIgAHYXdzLWttcwBLYXJuOmF3czprbXM6dXMtZWFzdC0xOjcwOTU4NzgzNTI0MzprZXkvNmMxMjBiYTAtNGNkNS00OTg1LWI4MmUtNDBhMDQ5NTJjYzU3ALgBAgIAeDYASx0XCjkny4iLV6vz%2BKtEGSGT6kdt0QRpkn6D%2FlVEAQyqKkk8behv5Fp0hSgBqSUAAAB%2BMHwGCSqGSIb3DQEHBqBvMG0CAQAwaAYJKoZIhvcNAQcBMB4GCWCGSAFlAwQBLjARBAwvgp3UqfQOepZkyggCARCAO1LcWluC9oJ2CnkT0CgGtGeVJ9kkL3wrrRciufzhMxeIFs0MDeH55KZh132JXagog1NeSxu8%2FgM6KdKWAgAAAAAMAAAQAAAAAAAAAAAAAAAAAKkTrw1mExz%2B8wtnWEqTph3%2F%2F%2F%2F%2FAAAAAQAAAAAAAAAAAAAAAQAAADLi35T5rYapU0iwGGqkQyi8%2BAUlF%2B5lBQ%2FmmkEpG%2FjKhme%2BG3YLqCbmm87aRjEVCucVW7uiSKAo2qAwTVL6lOb0I3o%3D&product=jira
- Install link (Bitbucket): [link from the developer console, see below]
- Marketplace: [link]

## Built with

forge, jira, bitbucket, rovo, mcp, typescript, react, ui-kit, node.js, solidity, foundry, slither, aderyn

## AI use

Built with Claude Code as a coding assistant. Every change was reviewed, tested and deployed by the author. The tests and CI are in the repository.

## Before submitting: get the Bitbucket install link

1. Open <https://developer.atlassian.com/console/myapps/8c28da68-7ae4-4c36-ac6f-1499fee85676/manage/distribution>
2. Click **Edit**, set sharing to on, fill in the required fields (vendor name, privacy policy and terms links from `docs/PRIVACY.md` and `docs/TERMS.md`), and save.
3. Copy the installation link and paste it into the Links section above.
