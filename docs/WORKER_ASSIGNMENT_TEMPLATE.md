# Worker assignment

**Task/row:** <ID and title>  
**Mode:** Implement | Investigate  
**Owner:** <worker/session>  
**Status/authorization:** <current board state and explicit assignment>

## Goal

<One observable outcome>

## Authoritative context

- Board directive and row: <path + ID>
- Latest relevant intercom: <timestamp/entry>
- Prior evidence/failure: <paths and short description>

## Scope

- Allowed files: <exact paths>
- Out of scope: <related but unassigned files/work>

## Acceptance

1. <behavior/result>
2. <required checks and expected evidence>
3. <required report or artifact>

## Restrictions

Preserve dirty work. Respect row ownership, locks, live-run HOLDER, USER-* gates, stop lists, and current pause orders. No secrets in output. No push, deletion, or unrelated cleanup. Do not update shared coordination records unless explicitly assigned.

## Return

Changed paths and diff summary; exact commands and observed results; numeric tests added per file when required; evidence paths; unresolved issues; next action. Separate attempted, completed, and verified work.

