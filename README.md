# AuditGate

**AuditGate turns smart-contract audit findings into Jira work and blocks a Bitbucket merge while any serious finding is open, or while audited code has changed since the audit.**

[![CI](https://github.com/softalpha0/auditgate/actions/workflows/ci.yml/badge.svg)](https://github.com/softalpha0/auditgate/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

Built for Atlassian Codegeist 2026, category Apps for Specialized Industries.

> Work in progress. This README grows with each phase. The build log is in [`docs/BUILD_LOG.md`](docs/BUILD_LOG.md).

## The problem

A team pays $20k to $200k for an audit and gets a PDF. Someone copies the findings into tickets by hand and misses a few. The code keeps changing after the audit, so the team ships code the auditor never read.

## What it does (planned)

|                     |                                                                                                                                                        |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Import findings** | Slither JSON, Aderyn JSON or a Markdown audit report become Jira issues. Re-importing updates them instead of creating duplicates.                     |
| **Drift check**     | AuditGate stores the commit the auditor reviewed. For any PR, it lists the audited files that changed since then and marks their findings **Drifted**. |
| **Release gate**    | A Bitbucket merge check fails while a Critical or High finding is open or drifted, and names the findings.                                             |
| **Rovo agent**      | Answers "Is this release safe to ship?" and "What changed since the audit?" from AuditGate data.                                                       |
| **MCP tools**       | The same answers as MCP tools for Rovo Studio and third-party clients.                                                                                 |
| **Audit dashboard** | Counts, drift list and a sign-off that records who signed and at which commit.                                                                         |

## Project layout

```
apps/
  forge/     The Jira app (UI Kit): project page, issue panel, import queue
packages/    Pure TypeScript logic with tests
  core/      Data model and finding lifecycle
  parsers/   Slither JSON, Aderyn JSON, Markdown report -> findings
  drift/     Changed audited files and the findings they affect
  gate/      Findings + drift -> merge check verdict and message
  jira/      Findings -> Jira issue fields, Markdown -> ADF, re-import merging
scripts/     forge-check.cjs: validate the manifest and bundle the app offline
demo/
  contracts/ Foundry project with planted bugs (pushed to Bitbucket for the demo)
  reports/   Real Slither and Aderyn output, plus a Markdown audit report
docs/        Architecture, build log, setup steps
evidence/    Test output, screenshots and logs
```

## Status

| Works today (tested, not yet deployed)                                                     | In progress              |
| ------------------------------------------------------------------------------------------ | ------------------------ |
| Import Markdown, Slither and Aderyn reports into Jira issues; re-import without duplicates | Bitbucket merge check    |
| Issue panel: severity, status actions, accepted risk with approver, history                | Rovo agent and MCP tools |
| Audit page with the release gate result                                                    | Dashboard and sign-off   |
| Check a change: paste changed files, see drift and the gate result                         | Marketplace listing      |

**[Install AuditGate for Jira](https://developer.atlassian.com/console/install/dc6e5d7c-6f3b-4766-af94-425ef105f7a4?signature=AYABeP9N1I0PHoOKkBdvJQWPZhgAAAADAAdhd3Mta21zAEthcm46YXdzOmttczp1cy13ZXN0LTI6NzA5NTg3ODM1MjQzOmtleS83MDVlZDY3MC1mNTdjLTQxYjUtOWY5Yi1lM2YyZGNjMTQ2ZTcAuAECAQB4CxqLTo9l4lqXuFjNim1xJM%2Bp%2F3TVP9xHS2BrU5DRRucBotNKxLyvp9Uqo9XPMjPVxgAAAH4wfAYJKoZIhvcNAQcGoG8wbQIBADBoBgkqhkiG9w0BBwEwHgYJYIZIAWUDBAEuMBEEDEGXfNCm%2ByvcXd0ZlgIBEIA7B0dqL8NGa5tlvgi%2B0LO1ZPNUy8VV1My7exrT4JAo4bqRw1Xq25OyE8OFA6pX%2BYSv%2BrhYxe%2BnlmfN0TcAB2F3cy1rbXMAS2Fybjphd3M6a21zOmV1LXdlc3QtMTo3MDk1ODc4MzUyNDM6a2V5LzQ2MzBjZTZiLTAwYzMtNGRlMi04NzdiLTYyN2UyMDYwZTVjYwC4AQICAHi9bVMAkme4qVQX1fQHo6ePw3H40A7cGfz7yrmSfBWMXgGKBlPlYBd7PCc%2B00etVIhaAAAAfjB8BgkqhkiG9w0BBwagbzBtAgEAMGgGCSqGSIb3DQEHATAeBglghkgBZQMEAS4wEQQMLsGKG4GMoJzNUf0uAgEQgDvXSTHzusftEU1%2Fxc1h8G12xoybvWP49PgV7HC6T6Uk%2B%2B1yykpE6Z9CnMPD5pAbFtXyp%2F0DUbPklKmmIgAHYXdzLWttcwBLYXJuOmF3czprbXM6dXMtZWFzdC0xOjcwOTU4NzgzNTI0MzprZXkvNmMxMjBiYTAtNGNkNS00OTg1LWI4MmUtNDBhMDQ5NTJjYzU3ALgBAgIAeDYASx0XCjkny4iLV6vz%2BKtEGSGT6kdt0QRpkn6D%2FlVEAQyqKkk8behv5Fp0hSgBqSUAAAB%2BMHwGCSqGSIb3DQEHBqBvMG0CAQAwaAYJKoZIhvcNAQcBMB4GCWCGSAFlAwQBLjARBAwvgp3UqfQOepZkyggCARCAO1LcWluC9oJ2CnkT0CgGtGeVJ9kkL3wrrRciufzhMxeIFs0MDeH55KZh132JXagog1NeSxu8%2FgM6KdKWAgAAAAAMAAAQAAAAAAAAAAAAAAAAAKkTrw1mExz%2B8wtnWEqTph3%2F%2F%2F%2F%2FAAAAAQAAAAAAAAAAAAAAAQAAADLi35T5rYapU0iwGGqkQyi8%2BAUlF%2B5lBQ%2FmmkEpG%2FjKhme%2BG3YLqCbmm87aRjEVCucVW7uiSKAo2qAwTVL6lOb0I3o%3D&product=jira)** · Test steps for judges: [`docs/JUDGES.md`](docs/JUDGES.md)

## Run it yourself

```powershell
corepack enable
pnpm install
pnpm check
```

`pnpm check` runs lint, format check, typecheck and tests.

## License

MIT. See [LICENSE](LICENSE).
