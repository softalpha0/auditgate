# Codegeist 2026 rules, decoded

Source: the official rules at <https://codegeist2026.devpost.com/rules> and the overview page, read on 2 Nov 2026. If anything here disagrees with the official rules, the official rules win. Re-read them before submitting.

## Key dates

| What                  | When                                               |
| --------------------- | -------------------------------------------------- |
| Submission period     | 27 Oct 2026, 09:00 PT to **22 Dec 2026, 12:00 PT** |
| Our target submission | **Mon 21 Dec 2026**, a full day early              |
| Judging               | 5 Jan to 3 Feb 2027                                |
| Winners announced     | Around 15 Feb 2027                                 |

## Things that can get us disqualified

| Rule                                                                                                                                                          | Where we stand                                                                                  |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Age of majority where you live                                                                                                                                | **Benjamin to confirm**                                                                         |
| Not a resident of an excluded country (Brazil, Quebec, Russia, Belarus, Crimea, Cuba, Iran, North Korea, Syria, Sudan, Myanmar, or any OFAC-sanctioned place) | **Benjamin to confirm**                                                                         |
| Not employed by Atlassian, Devpost or a judge's company, and no close family there                                                                            | **Benjamin to confirm**                                                                         |
| New project, or existing project rebuilt on Forge after 27 Oct                                                                                                | OK. First commit was 29 Oct.                                                                    |
| Built with Forge, with a manifest and at least one Forge module                                                                                               | OK                                                                                              |
| Original work, solely owned by us                                                                                                                             | OK. Open-source libraries are allowed if their licences are followed.                           |
| No financial or preferential support from Atlassian or Devpost for this project                                                                               | OK                                                                                              |
| Third-party APIs and data used within their terms                                                                                                             | OK. Slither (AGPL-3.0) and Aderyn are run by the user, not bundled. We only parse their output. |
| Video has no third-party trademarks or copyrighted music without permission                                                                                   | Use royalty-free music or none. Don't show other companies' logos.                              |
| All materials in English                                                                                                                                      | OK                                                                                              |

The rules say nothing about AI-assisted coding. Disclosing it in the README costs nothing, so we will.

## What we must submit

- [ ] Installation link judges can use (Forge "start sharing your app")
- [ ] Detailed instructions for every configuration step and every integration a judge has to set up (this covers the Bitbucket app, its token, and enabling custom merge checks)
- [ ] Demo video: **under 5 minutes, but everything that matters inside the first 3**, public on YouTube, showing the app working
- [ ] Text description of features and functionality
- [ ] Explanation of how the project meets the main technology requirement (Forge, plus Jira, Bitbucket and Rovo)
- [ ] Category: Apps for Specialized Industries
- [ ] Bonus prizes selected, each with its own write-up
- [ ] Marketplace listing link or Marketplace review ticket link (for the Marketplace bonus)

## How we're judged

Stage one is pass/fail: does the project fit the theme and really use the required tools? Stage two scores five criteria, **each worth 20%**.

| Criterion                    | What the rules actually ask                                                                                              | What earns a high score for us                                                                                                                                                          | Status                                                            |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Technological implementation | Thorough, skilful use of Forge and at least one product. Working and non-trivial.                                        | Three products working together (Jira, Bitbucket, Rovo), a real merge check, a queue-based import that doesn't duplicate issues, tests and CI                                           | Built for Jira and tested. Not deployed yet. Bitbucket not built. |
| Design                       | A complete, coherent product experience, not a technical proof of concept                                                | One clear journey from report to blocked PR to sign-off. Empty, loading and error states. Native Jira look.                                                                             | Jira screens written. Not yet seen on a real site.                |
| Potential impact             | A credible, specific case for a real problem and a real audience, and the demo shows the solution addresses it           | Sourced incidents (Nomad), quotes from real Web3 developers or auditors, a clear user (a protocol team after an audit)                                                                  | **Weakest. No user evidence yet.** See `USER_INTERVIEWS.md`.      |
| Innovation                   | Creative, and different from existing concepts                                                                           | Audit trail apps record what happened. Zellic's tracker checks deployed code after the fact. AuditGate stops drifted code **before it merges**, inside the tools the team already uses. | Good, as long as we say it plainly and back it up.                |
| Presentation                 | The video shows the project working end to end, says the problem, who it's for and why it matters, and is easy to follow | A 3-minute video that opens with Nomad and shows a PR being blocked by 1:30                                                                                                             | **Not started.** Draft in `VIDEO_SCRIPT.md`.                      |

## Bonus prizes we're entering

| Prize                           | Requirement in the rules                                                                                                                  | Our plan                                                                        |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Best Agents                     | A Forge app with `rovo:agent`, `rovo:agentConnector`, or reusable `rovo:skill` and `action` modules that other agents can call as tools   | `rovo:agent` plus actions (Phase 3)                                             |
| Best app with Atlassian MCP     | Exposes tools through the Atlassian MCP server with `rovo:mcp`. Can be combined with open-source `skill.md` files for third-party agents. | `rovo:mcp` with the read-only actions, plus an open-source `skill.md` (Phase 4) |
| Best Marketplace published app  | Published or submitted for listing. Give the listing link or the review ticket link.                                                      | Submit the listing by 7 Dec (Phase 5)                                           |
| Best Teamwork Graph integration | Connects data into the graph or consumes the Teamwork Graph API                                                                           | Stretch only                                                                    |

There's no Runs on Atlassian prize this year. The Jira app is still designed to qualify, because the badge helps the Marketplace listing.

## Questions to ask the organizers

Ask in the Codegeist forum on the Atlassian Developer Community, or in the Devpost discussion tab, before Phase 2 starts:

1. AuditGate is two Forge apps, because Forge can't put Jira and Bitbucket in one app. **Can one submission include two installation links**, one for the Jira app and one for the Bitbucket app?
2. Hard-blocking a merge with a custom merge check needs Bitbucket Premium. Will judges' test environments have Premium? If not, is a failing (not blocking) check on a free workspace acceptable, with the hard block shown in the video?
3. For the Marketplace bonus, can the listed app be a separate registration from the app we share with judges by installation link? Once an app is submitted for listing, it can't be shared by link any more.
4. For the MCP bonus, is a custom agent in Rovo Studio using our tools enough, or do judges expect to see a third-party client such as Claude Code?
