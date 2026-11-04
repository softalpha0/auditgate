# Plan

The working plan for AuditGate, following the Hackathon 101 method: goals, problem, MVP, journeys, risks, schedule. Update it when something changes; the build log records what happened, this page says what's next.

## 1. Goals we control

1. Submit a complete, working entry by **Mon 21 Dec**, a day before the deadline.
2. Every feature in the video works on a fresh developer site, installed from our install link by someone who isn't us.
3. Enter the main category plus three bonus prizes (Agents, MCP, Marketplace), each backed by real use, not a token module.

Winning isn't on the list because we can't control it. These three goals make it more likely.

## 2. The problem, tested

| Question                                   | Answer                                                                                                                                                                                                                     |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Who exactly has it?                        | A Web3 protocol team of 3 to 15 developers who have paid for an audit and keep shipping code afterwards. The person who feels it most is the tech lead who signs off releases.                                             |
| How painful is it?                         | Audits cost tens of thousands of dollars. If audited code changes before release, the audit no longer covers what ships. Nomad lost about $190M through code changed after its audit began (`RESEARCH.md`).                |
| How do they deal with it today?            | Copy findings from a PDF into tickets by hand, track status in a spreadsheet or GitHub issues, and rely on memory to know whether audited files changed. Zellic's tracker checks deployed code, but only after deployment. |
| What's our angle?                          | It's in the tools the team already uses (Jira and Bitbucket), and it catches drift **before merge**, not after deployment.                                                                                                 |
| Can we build a convincing version in time? | Yes. The Jira half is written and tested. The Bitbucket merge check is the main remaining risk and gets de-risked first (section 6).                                                                                       |

Still missing: confirmation from real people. See `USER_INTERVIEWS.md`.

## 3. Done statement

> A protocol team uploads its audit report and every finding becomes a Jira issue; when a pull request changes an audited file or leaves a Critical or High finding unresolved, the Bitbucket merge check fails and names the findings; the Rovo agent answers "Is this release safe to ship?" from the same data.

If that works end to end on a fresh site, the MVP is done. Everything else is extra.

## 4. Features, sorted (MoSCoW)

**Must have**

- F1 Import: Markdown, Slither and Aderyn reports into Jira issues, with re-import that never duplicates. _Built, not yet deployed._
- F1 Issue panel: severity, status, source link, status actions, history. _Built, not yet deployed._
- F2 Drift: changed audited files since the baseline commit, and the findings they affect. _Logic built and tested._
- F3 Gate: Bitbucket merge check that fails with finding keys, and passes when clean. _Logic built; Bitbucket app not built._
- F4 Rovo agent with read-only actions: release readiness, open findings, what changed. _Not started._
- Install link and judge instructions that work on a fresh site.
- 3-minute video, README, Devpost description.

**Should have**

- Re-check: confirm a fix at a commit, which moves the finding's baseline forward and sets it to Verified.
- F5 MCP: `rovo:mcp` exposing the read-only actions, plus an open-source `skill.md`. Cheap once F4's actions exist.
- F6 Dashboard: four stat tiles, drift panel, sign-off button. Builds on the existing audit page.
- Marketplace listing submitted, with landing page, privacy and terms pages.
- **"Check a change" panel in Jira**: paste a list of changed files (or `git diff --name-status` output) and see the drift and gate result without Bitbucket. This lets judges test F2 and F3 even if they don't set up Bitbucket. _Built 4 Nov._

**Could have**

- `update-finding-status` Rovo action with confirmation
- Landing page animation and before/after drift visual
- Teamwork Graph connector

**Won't have (for now)**

- PDF import
- Line-level drift (file-level is stricter and honest; line numbers move with every edit)
- GitHub or GitLab support
- Multi-repo audits

## 5. User journeys

**Journey A: import (the audit arrives)**

1. Tech lead opens AuditGate in the Jira project.
2. Uploads the auditor's Markdown report. Sees "11 findings: 1 Critical, 3 High…" before anything is created.
3. Fills in repo and audited commit (prefilled from the report where possible), clicks Create.
4. Watches the issues appear. The gate shows "blocked: 4 open".

**Journey B: fix and gate (the team ships)**

1. Developer opens H-01, clicks Start fix, opens a PR that fixes the reentrancy.
2. The merge check fails: "Blocked by AuditGate: 1 awaiting re-check (H-01), 2 open (H-02, H-03)…".
3. The developer also edited `RewardsDistributor.sol`. The check names it: "1 audited file changed without re-review".
4. The auditor (or lead) re-checks H-01 at the PR head and signs off the re-review. The check passes once the Criticals and Highs are closed.

**Journey C: ask (the release meeting)**

1. Lead asks Rovo "Is v2 safe to ship?"
2. Agent answers with the gate result, the blocking Jira keys, and what changed since the audit, citing keys and the commit it checked.

## 6. Risks, riskiest first

| #   | Risk                                                                                                                  | Why it matters                                 | How we retire it                                                                                                                              | By               |
| --- | --------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| R1  | The Jira app has never run on a real site                                                                             | Everything depends on it                       | Benjamin deploys and installs it (SETUP.md step 6); I fix what breaks                                                                         | Sun 8 Nov        |
| R2  | The Bitbucket app can't call the Jira REST API from Forge (egress to the customer's `*.atlassian.net`, token storage) | Option A, and so the whole gate, depends on it | **Spike**: a minimal Bitbucket app with a merge check that reads one issue's AuditGate property over the Jira API and passes or fails on it   | Sun 8 Nov        |
| R3  | Judges can't set up two apps, or don't have Bitbucket Premium                                                         | A gate judges can't see scores nothing         | Ask organizers (RULES.md questions 1 and 2). Build the "Check a change" panel as a fallback. Write and test JUDGES.md on a second fresh site. | Ask by Wed 4 Nov |
| R4  | `rovo:mcp` external access doesn't work as documented (Preview)                                                       | MCP bonus                                      | Spike with one tool from Claude Code; fall back to Rovo Studio and say so                                                                     | Sun 22 Nov       |
| R5  | Marketplace submission needs things we don't have (partner profile, policies, security answers)                       | Marketplace bonus, and review takes time       | List requirements in week 4; submit by 7 Dec                                                                                                  | Mon 7 Dec        |
| R6  | No real-user evidence                                                                                                 | 20% of the score                               | `USER_INTERVIEWS.md`                                                                                                                          | Sun 15 Nov       |

## 7a. First submission (4–5 Nov)

Benjamin wants to submit now. Devpost allows edits until the deadline, so we submit a working first version (the Jira app, with Check a change) as soon as it has run on a real site, then keep improving the same submission. Steps: `FAST_SUBMIT.md`. Nothing goes in the video or description that doesn't work on a fresh site.

## 7. Schedule (planned backwards from 21 Dec)

| Week | Dates          | Focus                                                                                      | Done when                                                                                |
| ---- | -------------- | ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| 1    | 27 Oct – 2 Nov | Setup, parsers, Jira app written                                                           | Done. Not yet deployed.                                                                  |
| 2    | 3 – 9 Nov      | **R1 + R2**: deploy the Jira app; Bitbucket spike; ask the organizers; start interviews    | Jira app running on Benjamin's site with screenshots; spike proves or rules out Option A |
| 3    | 10 – 16 Nov    | F3 merge check, Re-check, "Check a change" panel; first production deploy and install link | A PR on `vault-v2` is blocked and then passes; install link tested on a second site      |
| 4    | 17 – 23 Nov    | F4 Rovo agent and actions; R4 MCP spike; Marketplace requirements list                     | 10 agent test questions pass                                                             |
| 5    | 24 – 30 Nov    | F5 MCP, F6 dashboard and sign-off, JUDGES.md                                               | Tools callable; a stranger follows JUDGES.md without help                                |
| 6    | 1 – 7 Dec      | **Feature freeze Thu 3 Dec.** Landing page, privacy, terms; Marketplace submitted          | Review ticket link saved in `evidence/`                                                  |
| 7    | 8 – 14 Dec     | Video, README, Devpost draft                                                               | Video under 3 minutes, uploaded unlisted                                                 |
| 8    | 15 – 21 Dec    | Fresh-site test, fixes, **submit Mon 21 Dec**                                              | Submitted, every link checked from another device                                        |

The 30-minute rule applies throughout: if one problem has eaten 30 minutes, start a fresh session, try a simpler way, ask in the forum, or cut it.

## 8. Self-score against the rubric (2 Nov)

Honest scores out of 10, to show where the time should go. Re-score every Sunday.

| Criterion                    | Score | Evidence                                                     | Biggest lift                               |
| ---------------------------- | ----- | ------------------------------------------------------------ | ------------------------------------------ |
| Technological implementation | 5     | Solid tested code, but nothing deployed and no Bitbucket yet | Deploy; build the merge check              |
| Design                       | 4     | Screens written to the guide, never seen on a real site      | Deploy, screenshot, review                 |
| Potential impact             | 4     | Sourced incidents only, no users                             | Interviews                                 |
| Innovation                   | 7     | Clear gap versus existing tools (RESEARCH.md)                | Say it in the first 30 seconds             |
| Presentation                 | 1     | Nothing yet                                                  | Video script drafted early, refined weekly |

Weakest areas: **presentation and impact**. Both are cheap to improve, so they get attention every week, not only in week 7.

## 9. Parking lot

Ideas that come up during the build go here, not into the code. They become the "What's next" section of the pitch.

- Bytecode check of the deployed contract against the audited commit, after deployment
- GitHub Actions and GitLab support
- Auditor portal: auditors confirm fixes directly
- Line-range drift as an advisory signal next to file-level drift
- Slack or email alert when a finding drifts
