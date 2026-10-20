# DB-5 step0 runbook (offline dry-run only)

Local dry-run (PGlite or local Postgres):
1. Apply database/r3_companion.sql.
2. Run database/r3_companion_step0_negative.sql (expect all asserts pass, rollback).
3. Run database/r3_companion_step0_readback.sql (COUNT outputs: 1,2,2).
4. Run database/r3_companion_step0_rollback.sql (reverse order).
5. Re-run r3_companion.sql + rollback to confirm idempotent cleanup.

Exit criteria:
- anon/authenticated SELECT/INSERT/UPDATE/DELETE denied (insufficient_privilege).
- service_role INSERT passes; duplicate run_id => 1 row; hash conflict rejected.
- eligible view returns research ELIGIBLE rows only.
- UPDATE/DELETE rejected (SQLSTATE 55000).
- no team objects modified (six baseline objects remain).
- counts-only secret scan: AIza/service_role/sb_secret_/eyJ leaked values = 0.

Owner access application (H1/H2 required):
- Env-var names only: SUPABASE_URL, SUPABASE_SERVICE_KEY.
- Values never written, logged, committed, or pasted.
- Apply via owner shell/opencode only after H1/H2. No push.