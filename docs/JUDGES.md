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
   - Audited commit: `3f1c2a9e0b7d4c6a8e5f1b2c3d4e5f6a7b8c9d0e`
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

## Known limitations

- **[Until the Bitbucket app ships]** The Bitbucket merge check that blocks a real pull request is in progress. **Check a change** uses the same drift and gate logic.
- In Bitbucket, a custom merge check can block a merge only on the Premium plan. On other plans, it shows a failing check.
- Supported report formats: Markdown in the template at `demo/reports/TEMPLATE.md`, Slither JSON, and Aderyn JSON. No PDF import.
