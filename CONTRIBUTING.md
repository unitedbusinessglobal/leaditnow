# Contributing to LeadItNow

Every change (code, config, infra or docs) ships as one unit of work, in this order:

1. **Jira**: create or update the issue in the LeadItNow epics (Jira project [LDITNW](https://ainformatiq.atlassian.net/jira/software/projects/LDITNW/boards)); mark it Done if shipped, To Do if planned.
2. **CHANGELOG.md**: add a dated entry with the Jira issue key(s).
3. **MANUAL.md**: update it when users will see the change. Purely internal refactors are exempt from this step only.
4. **Commit and push**, referencing the issue key in the commit message.

## Branches and environments

| Branch | Environment | Who uses it |
| --- | --- | --- |
| `dev` | DEV | Developers |
| `qa` | QA/TEST | Testing |
| `uat` | UAT/DEMO | The Chennai team and demos |
| `main` | PROD | Live use |

Changes are merged DEV -> QA -> UAT -> PROD. Never commit secrets; use Vercel environment variables.

## Tests

`npm test` must pass before a merge. Add a test for every new signal rule, with a sample of the HTML or DNS record it matches and one it must not match.
