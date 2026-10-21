"""Exact SQL/parameter pair guard for the disconnected adapter interface.

Diagnostic SQL is compiled; caller SQL is never forwarded. The existing
controller manages role order and transaction state. This wrapper narrows
transport to its exact control statements, case specs, and fixed readbacks.
"""
from case_catalog import CASES, IDS, SOURCE_P59_EXPECTED, validate_cases
from executor_runtime import (BASELINE_SQL, FIXTURES_SQL, PREFIX_COUNT_SQL,
                              RETRY_STATE_SQL, READBACK_COUNT_SQL, PID_SQL,
                              PID_GONE_SQL, RLS_ALL_SQL)

CONTROL = frozenset((
    'BEGIN', 'BEGIN READ ONLY', 'ROLLBACK', 'SAVEPOINT ocdb_case',
    'ROLLBACK TO SAVEPOINT ocdb_case', 'RELEASE SAVEPOINT ocdb_case', 'RESET ROLE',
    "SET LOCAL statement_timeout='2500ms'", "SET LOCAL lock_timeout='2000ms'",
    "SET LOCAL idle_in_transaction_session_timeout='3000ms'",
    'SET LOCAL ROLE anon', 'SET LOCAL ROLE authenticated', 'SET LOCAL ROLE service_role',
))


class GuardedSession:
    def __init__(self, session, readonly=False):
        validate_cases(CASES, SOURCE_P59_EXPECTED)
        self.session = session
        self.readonly = readonly

    def execute(self, sql, params=()):
        params = tuple(params)
        allowed = sql in CONTROL and not params
        allowed |= sql in (BASELINE_SQL, PREFIX_COUNT_SQL, PID_SQL, RLS_ALL_SQL) and not params
        allowed |= sql in (FIXTURES_SQL, READBACK_COUNT_SQL) and params == (list(IDS),)
        allowed |= sql == RETRY_STATE_SQL and params == (IDS[0],)
        allowed |= sql == PID_GONE_SQL and len(params) == 1 and type(params[0]) is int and params[0] > 0
        allowed |= any(c.sql == sql and c.params == params for c in CASES)
        if self.readonly and (sql.startswith(('INSERT', 'UPDATE', 'DELETE', 'SET LOCAL ROLE')) or sql == 'BEGIN'):
            allowed = False
        if not allowed:
            raise ValueError('SQL_OR_PARAMS_NOT_ALLOWLISTED')
        return self.session.execute(sql, params)

    def close(self):
        return self.session.close()
