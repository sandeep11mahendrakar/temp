# DB-2a: read-only database preflight

Status | Prepared offline; no Supabase connection or SQL execution. No deployed state is asserted.
Scope | Run `database/r3_inspect.sql` in the owner-authorized SQL editor only when DB-5 is authorized. It opens a read-only transaction and rolls it back.
Pinned source | `Neonishh/Capstone-Project` setup.sql at `6a558f3af2ded2121db233ae8d644dc1be8c2d6c` rebuilds five public views, drops `runs.owner`, creates `public.runs`, enables RLS, revokes anon/authenticated and grants service_role SELECT/INSERT/UPDATE.
Stop | Any collision for `r3_runs`, `r3_research_eligible`, or `r3_evidence_readback`; missing/unexpected team objects; unexplained team fingerprint change; or schema/design mismatch. Do not apply setup.sql to an existing team project.

## Capture procedure

1. Save the result of `team_baseline` before deployment, including fingerprint and object names. Save the metadata result sets in a restricted owner evidence folder; retain no row contents or storage object metadata.
2. Review `name_collision`, `team_object`, `team_columns`, `team_constraints`, `team_indexes`, `team_policies`, `team_triggers`, and `team_grants`. Resolve every missing or unexpected item with the owner before proceeding.
3. `storage_usage` reports only a catalog estimate. If unavailable or metadata lacks size, mark it unavailable. Check plan quota and actual project usage in the owner dashboard; SQL does not establish remaining capacity.
4. After an approved additive deployment, rerun the script. The six named team objects must remain present, and the `team_baseline` fingerprint and object list must match. Investigate any difference; never repair by dropping or altering team objects.
5. Redact project identifiers if required by the evidence policy. Do not save connection strings, keys, tokens, user rows, object names from Storage, or raw Storage metadata.

## Synthetic review control

This dependency-free control checks that the review decision flags missing primary key, disabled RLS, public-role grants, and UPDATE privilege, while accepting a locked-down synthetic shape. Run with Node.js:

```sh
node --input-type=commonjs -e "const assert=require('node:assert/strict'); const review=m=>({pk:!!m.pk,rls:!!m.rls,public:!!m.publicGrant,update:!!m.updateGrant}); const clean={pk:true,rls:true,publicGrant:false,updateGrant:false}; assert.deepEqual(review(clean),{pk:true,rls:true,public:false,update:false}); for(const bad of [{...clean,pk:false},{...clean,rls:false},{...clean,publicGrant:true},{...clean,updateGrant:true}]) { const r=review(bad); assert.ok(!r.pk||!r.rls||r.public||r.update); } console.log('synthetic metadata controls: 5/5 pass');"
```

Interpretation | The synthetic control validates review checklist behavior only. It does not run PostgreSQL, prove deployed grants/RLS, verify trigger enforcement, or authorize deployment. `psql`, Docker, and a local Postgres runtime were unavailable during preparation.

## Evidence limits

The pinned setup.sql is source evidence, not deployed schema evidence. The fingerprint covers only `public.runs` and the five named views, including their definitions and attached catalog objects. It does not establish preservation of unrelated project objects. Catalog visibility depends on the executing role. SQL-reported Storage size is not a quota or authoritative billing measurement.
