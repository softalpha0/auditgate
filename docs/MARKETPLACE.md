# Marketplace listing pack

Prepared 23 November 2026 for the "Best Marketplace published app" bonus prize. Images are in `docs/marketplace/`. Field names follow the Marketplace listing form; if a field has a shorter limit than the text here, trim from the end.

## Decisions only the owner can make

Publishing needs three things that are hard or impossible to undo. Read them before starting.

1. **A billing account on the Developer Space**, with billing consent. Atlassian requires it even for free apps.
2. **Accepting the Atlassian Marketplace Partner Agreement**, a legal contract.
3. **A public vendor profile.** Publishing the Developer Space makes its name and contact email public on the Marketplace. Atlassian's docs say a published Developer Space **can't be unpublished** (support can archive it on request).

Also decide:

- **Which app to list.** Listing the existing Jira app changes how judges install it: a Marketplace listing is installed from the Marketplace, not from the developer console link. To keep the judges' install link working during review, register a copy for the listing (step 3 below) and keep the current app for judging.
- **Free or paid.** List it as **free**. Paid listings need more setup and longer review.
- **Jira only, or both apps.** The Marketplace lists one product per app. Start with the Jira app; the Bitbucket app can follow as a second listing.

## Steps

1. **Developer Space settings.** In the developer console, open the Developer Space (currently "Auditgate"), then **Settings**. Check the space name: it becomes the public vendor name. Set up the billing account if asked.
2. **Make public on Marketplace.** In **Make public on Marketplace**, click **Review & publish**, read the Partner Agreement, then **Accept & publish**.
3. **Optional, recommended: a listing copy.** In `apps/forge`, copy `manifest.yml`, run `forge register` to get a new app ID named `AuditGate`, then `forge deploy -e production`. (Ask Claude for exact commands when you get here.)
4. **Create the listing.** In the developer console, open the app, go to **Distribution** or **Marketplace listing**, choose **Free**, and fill in the fields below.
5. **Submit for review**, then put the listing link (or the review ticket link) in the Devpost submission.

Review is done by people at Atlassian and can take days to weeks, so submit early.

## Listing fields

**App name:** AuditGate

**Tagline:** Track smart contract audit findings in Jira and block releases that ship unreviewed code.

**Summary:** Turn Slither, Aderyn and Markdown audit reports into Jira issues. Track each fix, see what changed since the audited commit, and gate releases until serious findings are fixed and changes are re-reviewed.

**Highlight 1: Audit reports become Jira issues**
Upload a Markdown audit report, Slither JSON or Aderyn JSON. Each finding becomes a Jira issue with its severity, priority, recommendation and a link to the exact lines at the audited commit. Re-importing updates issues instead of duplicating them.
Screenshot: `screenshot-2-findings.png`

**Highlight 2: A release gate that knows the audited commit**
AuditGate records the commit the auditor reviewed. The release gate stays blocked while a Critical or High finding is open, or while audited code changed without a re-review.
Screenshot: `screenshot-1-release-gate.png`

**Highlight 3: Every fix tracked, every risk approved**
The AuditGate panel on each issue keeps the finding's status and full history. Accepting a risk needs a written reason and a named approver. A re-review sign-off verifies fixes at a specific commit.
Screenshot: `screenshot-4-issue-panel.png`

**More details:**

Audits are expensive, and they cover one commit. After the audit, code keeps changing: fixes, refactors, last-minute features. This gap is called audit drift. In 2022, Nomad's bridge lost about $190 million through code that changed after its audit began.

AuditGate keeps the audit attached to the code until release.

- Import Slither, Aderyn or Markdown audit reports. Each finding becomes a Jira issue.
- See the release gate on the audit page: blocked or clear, and why.
- Paste the files changed in a branch to see which audited files and findings they touch.
- Track each finding: Open, In fix, Fixed, Verified, Drifted or Accepted risk.
- Sign off a re-review at a commit to verify fixes.
- Ask the AuditGate Rovo agent "Is this release safe to ship?" and get an answer that cites Jira issues.
- Pair it with AuditGate for Bitbucket to block the pull request itself.

AuditGate runs on Atlassian's Forge platform. The Jira app makes no outside network calls and qualifies for Runs on Atlassian. Source code: https://github.com/softalpha0/auditgate

**Category:** Security, then Project management (or the closest available).

**Keywords:** smart contract, audit, security, Web3, Solidity, release gate, Slither, Aderyn, Bitbucket, compliance

**Links:**

- Documentation: https://github.com/softalpha0/auditgate/blob/main/docs/JUDGES.md
- Support: https://github.com/softalpha0/auditgate/issues
- Privacy policy: https://github.com/softalpha0/auditgate/blob/main/docs/PRIVACY.md
- End user terms: https://github.com/softalpha0/auditgate/blob/main/docs/TERMS.md

**Images:**

- Logo: `logo-144.png` (144×144)
- Banner: `banner-1120x548.png` (1120×548)
- Screenshots: `screenshot-1` to `screenshot-5` (1840×900)

## Privacy and security answers

Answers to the usual Marketplace data and security questions, for the **Jira app**. They match `PRIVACY.md`.

| Question                                     | Answer                                                                                                                                                                         |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Does the app store data outside Atlassian?   | No. All data is in Forge hosted storage and the customer's Jira site.                                                                                                          |
| Does the app send data to external services? | No. No egress. It qualifies for Runs on Atlassian.                                                                                                                             |
| What end-user data is stored?                | Atlassian account IDs in finding history and sign-offs. No names or emails.                                                                                                    |
| What other data is stored?                   | Audit details, findings from the uploaded report, status history, re-review sign-offs, and a generated signing secret in Forge encrypted storage.                              |
| Data residency                               | Follows the customer's site, as provided by Forge.                                                                                                                             |
| Retention and deletion                       | Kept while installed. Forge deletes app storage after uninstall, per Atlassian's rules. Jira issues stay until the customer deletes them.                                      |
| Logging                                      | Unexpected errors are written to Forge app logs with the error message, which can include Jira's error text. The app doesn't log reports, findings or user details on purpose. |
| Authentication                               | Forge handles it. Resolvers check the user's own Jira permissions: browsing the project, creating issues, and Administer Projects for the signing secret and sign-offs.        |
| Third-party code                             | Open-source npm packages only (Forge SDKs, React). No third-party services.                                                                                                    |
| Security contact                             | https://github.com/softalpha0/auditgate/issues                                                                                                                                 |

For a later **Bitbucket app** listing, the differences are: one egress host (`api.atlassian.com`), and it stores one Atlassian account email and API token per connected repository in Forge encrypted storage. It does not qualify for Runs on Atlassian.
