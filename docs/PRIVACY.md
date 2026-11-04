# AuditGate privacy policy

Last updated: 4 November 2026

AuditGate is a Forge app for Jira. This page explains what data it handles. It applies to every version of AuditGate distributed by installation link or listed on the Atlassian Marketplace.

## Who we are

AuditGate is built and maintained by softalpha0 (GitHub: <https://github.com/softalpha0>). Contact: open an issue at <https://github.com/softalpha0/auditgate/issues>.

## What AuditGate stores

When someone in your Jira site uses AuditGate, it stores:

- **Audit details** you enter: audit name, auditor name, Bitbucket workspace and repository names, the audited commit hash, and the list of files in scope.
- **Findings** from the report you upload: IDs, severities, titles, descriptions, recommendations, file paths and line numbers.
- **Status history** for each finding: the Atlassian account ID of the person who changed it, the time, the old and new status, and any note, such as the reason and approver for an accepted risk.
- **Jira issues** created for each finding, with an issue property holding the finding's ID, severity and status.

The report file itself is not stored. AuditGate reads it, keeps the findings, and discards the file.

## Personal data

The only personal data AuditGate stores is Atlassian account IDs, in finding status history and as the approver of an accepted risk. It does not store names, email addresses or any other profile data; Jira shows names by looking up the account ID at display time.

## Where data is stored

All data stays on Atlassian's platform: in Forge hosted storage and in your Jira site. AuditGate sends no data to any server outside Atlassian. It has no analytics, no tracking, no third-party services and no external network access. Data residency follows your Jira site, as provided by Forge.

## Who can see it

People who can view the Jira project can see AuditGate's pages and panels for that project. AuditGate's developer cannot see your data.

## How long it is kept

Data is kept while AuditGate is installed. When an admin uninstalls the app, Forge deletes the app's stored data according to Atlassian's Forge data retention rules. Jira issues created by AuditGate remain in your Jira site until you delete them.

## Your rights

Because data stays in your Atlassian site, your site admin controls it. To have data removed, delete the relevant Jira issues and uninstall the app, or contact us at the address above.

## Changes

We will update this page if what AuditGate stores changes, and change the date at the top.
