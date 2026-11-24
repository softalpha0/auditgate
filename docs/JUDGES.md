# Testing AuditGate (for judges)

About 10 minutes. You need a Jira Cloud site where you're an admin. A free developer site from <https://go.atlassian.com/cloud-dev> works.

## 1. Install

1. Open the install link: [**Install AuditGate for Jira**](https://developer.atlassian.com/console/install/dc6e5d7c-6f3b-4766-af94-425ef105f7a4?signature=AYABeP9N1I0PHoOKkBdvJQWPZhgAAAADAAdhd3Mta21zAEthcm46YXdzOmttczp1cy13ZXN0LTI6NzA5NTg3ODM1MjQzOmtleS83MDVlZDY3MC1mNTdjLTQxYjUtOWY5Yi1lM2YyZGNjMTQ2ZTcAuAECAQB4CxqLTo9l4lqXuFjNim1xJM%2Bp%2F3TVP9xHS2BrU5DRRucBotNKxLyvp9Uqo9XPMjPVxgAAAH4wfAYJKoZIhvcNAQcGoG8wbQIBADBoBgkqhkiG9w0BBwEwHgYJYIZIAWUDBAEuMBEEDEGXfNCm%2ByvcXd0ZlgIBEIA7B0dqL8NGa5tlvgi%2B0LO1ZPNUy8VV1My7exrT4JAo4bqRw1Xq25OyE8OFA6pX%2BYSv%2BrhYxe%2BnlmfN0TcAB2F3cy1rbXMAS2Fybjphd3M6a21zOmV1LXdlc3QtMTo3MDk1ODc4MzUyNDM6a2V5LzQ2MzBjZTZiLTAwYzMtNGRlMi04NzdiLTYyN2UyMDYwZTVjYwC4AQICAHi9bVMAkme4qVQX1fQHo6ePw3H40A7cGfz7yrmSfBWMXgGKBlPlYBd7PCc%2B00etVIhaAAAAfjB8BgkqhkiG9w0BBwagbzBtAgEAMGgGCSqGSIb3DQEHATAeBglghkgBZQMEAS4wEQQMLsGKG4GMoJzNUf0uAgEQgDvXSTHzusftEU1%2Fxc1h8G12xoybvWP49PgV7HC6T6Uk%2B%2B1yykpE6Z9CnMPD5pAbFtXyp%2F0DUbPklKmmIgAHYXdzLWttcwBLYXJuOmF3czprbXM6dXMtZWFzdC0xOjcwOTU4NzgzNTI0MzprZXkvNmMxMjBiYTAtNGNkNS00OTg1LWI4MmUtNDBhMDQ5NTJjYzU3ALgBAgIAeDYASx0XCjkny4iLV6vz%2BKtEGSGT6kdt0QRpkn6D%2FlVEAQyqKkk8behv5Fp0hSgBqSUAAAB%2BMHwGCSqGSIb3DQEHBqBvMG0CAQAwaAYJKoZIhvcNAQcBMB4GCWCGSAFlAwQBLjARBAwvgp3UqfQOepZkyggCARCAO1LcWluC9oJ2CnkT0CgGtGeVJ9kkL3wrrRciufzhMxeIFs0MDeH55KZh132JXagog1NeSxu8%2FgM6KdKWAgAAAAAMAAAQAAAAAAAAAAAAAAAAAKkTrw1mExz%2B8wtnWEqTph3%2F%2F%2F%2F%2FAAAAAQAAAAAAAAAAAAAAAQAAADLi35T5rYapU0iwGGqkQyi8%2BAUlF%2B5lBQ%2FmmkEpG%2FjKhme%2BG3YLqCbmm87aRjEVCucVW7uiSKAo2qAwTVL6lOb0I3o%3D&product=jira)
2. Choose your site and **Jira**, then approve the permissions. AuditGate asks to read and create issues in projects you use it in, and to store its own data in Forge storage. It sends nothing outside your Atlassian site.

## 2. Create a project and import an audit

1. In Jira, create a project. Any template works. Example: name `Vault`, key `VAULT`.
2. Open the project and click **AuditGate** in the project navigation (or under **Apps**).
3. Click **New audit**.
4. Download the sample audit report: <https://raw.githubusercontent.com/softalpha0/auditgate/main/demo/reports/vault-v2-audit.md> (right-click, **Save as**). Upload it with the file picker, or open it, copy everything and use **Paste the report instead**.
5. You'll see "11 findings found" with the count by severity. Nothing has been created yet.
6. Fill in:
   - Bitbucket workspace: `auditgate-demo`
   - Repository: `vault-v2`
   - Audited commit: `16b9a19b8abb41043380cdb80719b67e949b7aa1` (the real commit in the public demo repo, so the source links on each issue open the audited lines)
   - Leave the scope and the toggle as they are.
7. Click **Create audit and 11 issues**. Within about 20 seconds the page shows all 11 issues, and the gate says **blocked**, because 1 Critical and 3 High findings are open.

## 3. Open a finding

Open any issue, for example `[C-01] Anyone can set the oracle price`. The **AuditGate finding** panel shows:

- severity, status and where the finding came from;
- a link to the exact lines at the audited commit;
- the recommendation;
- status actions: **Start fix**, **Mark as fixed**, **Accept risk** (needs a reason and an approver);
- full history.

Try **Start fix**, then **Mark as fixed**. Go back to the audit page: the gate message now says that finding is awaiting re-check.

## 4. Check a change (the drift check)

This shows what the release gate would say about a pull request, without setting up Bitbucket.

1. On the audit page, find **Check a change**.
2. Paste:

   ```
   M	src/RewardsDistributor.sol
   M	README.md
   ```

3. Click **Check**. AuditGate reports that `src/RewardsDistributor.sol` was in the audit scope and changed, names the findings in it (M-02, M-03, L-01), says `README.md` is out of scope, and blocks the release: an audited file changed without re-review.
   The **Fill in an example** button pastes these two lines for you.
4. Try a file with an accepted or verified Critical or High finding in it, such as `src/PriceOracle.sol` after accepting C-01's risk. The finding counts as **drifted**, because the code the risk was accepted for has changed.

## 5. Re-import

Upload the same report again under **Re-import the report**. AuditGate reports "Nothing changed since the last import" and creates no duplicates. Edit one finding's title in the file and re-import: only that issue updates.

## 6. The Bitbucket merge check

**See it without setting anything up.** Pull request #1 in the demo repo fixes H-01 and is blocked by AuditGate: <https://bitbucket.org/auditgate-demo/vault-v2/pull-requests/1>. In the right sidebar, click the **AuditGate** check under "Checks". The message reads:

> Blocked by AuditGate: 4 open (C-01, H-01, H-02, H-03), 1 audited file changed without re-review (src/TokenVault.sol). Jira: C-01 KAN-12, H-01 KAN-13, H-02 KAN-14, H-03 KAN-15. Compared with 16b9a19 ("Vault v2 audit").

**Run it yourself.** Install AuditGate for Bitbucket on a shared (team) workspace and follow [`BITBUCKET.md`](BITBUCKET.md), about 15 minutes. In short:

1. Push the demo contracts to a repo and create the audit in Jira with that commit.
2. In Jira, AuditGate tab, click **Connect Bitbucket** and copy the site ID and signing secret.
3. In the repo, **Repository settings** > **AuditGate**: paste them with your email and an API token that has only `read:jira-work`, then **Check and save**.
4. Turn on **Custom merge checks** for the workspace and add the AuditGate check to the repo.
5. Open a pull request that edits `src/TokenVault.sol`. The check fails and names the blocking findings.

The Bitbucket app reads Jira and never writes to it. It rejects finding data that has been edited by hand, because the Jira app signs it.

**Clear the gate.** In Jira, move C-01 and H-01 to H-03 to **Mark as fixed** (or accept a risk with a reason and an approver). Then, on the audit page, use **Re-review sign-off** with the pull request's head commit (in Bitbucket, the PR's latest commit, all 40 characters) and a note. Those findings become Verified. Push any small commit to the pull request, or click **Merge** to re-run the check: it passes for the signed-off commit and says the changes were signed off in a re-review.

## Known limitations

- In Bitbucket, a custom merge check can block a merge only on the Premium plan. On Free and Standard it runs and shows a failing check with the full message, but Bitbucket doesn't stop the merge.
- The check runs on new pushes to a pull request and on merge. A pull request opened from a branch that already existed gets its first result on the next push or merge attempt.
- Each new commit that touches audited code needs its own re-review sign-off. That is deliberate: a sign-off covers exactly the code someone reviewed.
- Supported report formats: Markdown in the template at `demo/reports/TEMPLATE.md`, Slither JSON, and Aderyn JSON. No PDF import.
