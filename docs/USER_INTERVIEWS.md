# User interviews

"Potential impact" is 20% of the score, and it asks for a credible case for a real audience. Right now our case rests on published sources only. Three to five short conversations with real people will change that, and one good quote opens the video.

Owner: Benjamin. Target: **5 conversations by Sun 15 Nov.** 20 minutes each is enough.

## Who to talk to

Any of these, in order of value:

1. A developer or lead at a protocol that has had an audit in the last two years
2. An auditor or audit-contest participant (Code4rena wardens, Sherlock Watsons, Cantina, CodeHawks)
3. A Solidity developer who has shipped to mainnet

Where to find them: your own network first, then X (search "audit report" and reply to people who just published one), the Code4rena, Sherlock and Cyfrin Discords, r/ethdev and r/solidity. Say who you are and that it's for a hackathon project; don't sell.

## Message to send

> Hi, I'm building a small tool for Atlassian's Codegeist hackathon. It turns smart-contract audit findings into Jira tickets and blocks a merge in Bitbucket when audited code changes after the audit. Could I ask you five quick questions about how your team handles audit findings? 15 minutes on a call or in chat. No pitch, I just want to get the problem right.

## The questions

Ask them in this order. Listen more than you talk, and ask "can you tell me about the last time that happened?" whenever an answer is general.

1. After your last audit, how did the findings get from the report into your team's to-do list? Who did it, and how long did it take?
2. Did any code change between the audited commit and what you deployed? How did you decide whether it needed another review?
3. How did you track which findings were fixed, acknowledged, or still open when you shipped?
4. Has a finding ever been missed, or a fix ever introduced a new problem? What happened?
5. If a merge check had blocked the release because an audited file changed, would that have helped or got in the way? Why?

Optional, if they're interested: show them the demo audit page and ask what's confusing.

## Log

Write each conversation down the same day. Get permission before quoting anyone by name; otherwise quote by role ("a protocol lead at a DeFi lending team").

| #   | Date | Role | Team size | Key quote (verbatim) | What they do today | Would AuditGate help? | Can we quote them by name? |
| --- | ---- | ---- | --------- | -------------------- | ------------------ | --------------------- | -------------------------- |
| 1   |      |      |           |                      |                    |                       |                            |
| 2   |      |      |           |                      |                    |                       |                            |
| 3   |      |      |           |                      |                    |                       |                            |
| 4   |      |      |           |                      |                    |                       |                            |
| 5   |      |      |           |                      |                    |                       |                            |

## What to do with the answers

- Put the strongest quote in the first 20 seconds of the video and in the Devpost "Inspiration" section.
- If two or more people describe the same pain we didn't plan for, tell me. It may change the MVP.
- If nobody cares about drift, tell me that too. It's better to learn it now than from the judges.
