-- R3 DB-2a: read-only preflight for the existing Supabase project.
-- Run only in the owner-approved SQL editor after DB-5 is authorized.
-- Output contains catalog metadata and aggregate storage size, never run rows.
begin transaction read only;
set local statement_timeout = '15s';

-- Stop if the proposed table/view names already exist in any schema.
select 'name_collision' as section, n.nspname as schema_name,
       c.relname as object_name, c.relkind as object_kind
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where c.relname in ('r3_runs', 'r3_research_eligible', 'r3_evidence_readback')
order by 2, 3;

-- Presence and relation kind for the existing team table and views.
select 'team_object' as section, x.object_name,
       coalesce(c.relkind::text, 'MISSING') as object_kind,
       coalesce(c.relrowsecurity, false) as rls_enabled,
       coalesce(c.relforcerowsecurity, false) as rls_forced
from (values ('runs'), ('run_summary'), ('web_a_runs'), ('web_b_runs'),
             ('mobile_a_runs'), ('mobile_b_runs')) x(object_name)
left join pg_namespace n on n.nspname = 'public'
left join pg_class c on c.relnamespace = n.oid and c.relname = x.object_name
order by x.object_name;

-- Stable preservation fingerprint: team table/view definitions and attached
-- constraints, indexes, policies, triggers, and ACLs. Capture before/after.
with team as (
  select c.oid, c.relname, c.relkind, c.relrowsecurity, c.relforcerowsecurity,
         pg_get_userbyid(c.relowner) as owner_name,
         coalesce(c.relacl::text, '') as acl,
         case when c.relkind = 'v' then pg_get_viewdef(c.oid, true) else '' end as view_sql
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname in ('runs', 'run_summary', 'web_a_runs', 'web_b_runs',
                      'mobile_a_runs', 'mobile_b_runs')
), details as (
  select t.relname, jsonb_build_object(
    'kind', t.relkind, 'rls', t.relrowsecurity, 'force_rls', t.relforcerowsecurity,
    'owner', t.owner_name, 'acl', t.acl, 'view_sql', t.view_sql,
    'columns', (select jsonb_agg(jsonb_build_array(a.attnum,a.attname,
       format_type(a.atttypid,a.atttypmod),a.attnotnull,pg_get_expr(d.adbin,d.adrelid))
       order by a.attnum)
       from pg_attribute a left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum
       where a.attrelid=t.oid and a.attnum>0 and not a.attisdropped),
    'constraints', (select jsonb_agg(jsonb_build_array(conname,contype,pg_get_constraintdef(oid,true)) order by conname)
       from pg_constraint where conrelid=t.oid),
    'indexes', (select jsonb_agg(jsonb_build_array(indexrelid::regclass::text,pg_get_indexdef(indexrelid)) order by indexrelid::regclass::text)
       from pg_index where indrelid=t.oid),
    'policies', (select jsonb_agg(jsonb_build_array(polname,polcmd,polroles::text,polqual::text,polwithcheck::text) order by polname)
       from pg_policy where polrelid=t.oid),
    'triggers', (select jsonb_agg(jsonb_build_array(tgname,pg_get_triggerdef(oid,true)) order by tgname)
       from pg_trigger where tgrelid=t.oid and not tgisinternal)
  ) as definition
  from team t
)
select 'team_baseline' as section, count(*) as objects_found,
       md5(coalesce(string_agg(relname || ':' || definition::text, E'\n' order by relname), '')) as fingerprint,
       string_agg(relname, ', ' order by relname) as object_names
from details;

-- Columns, constraints, indexes, RLS policies, triggers and grants for the
-- team table and views; review for unexpected state before any deployment.
select 'team_columns' as section, c.relname as object_name, a.attnum,
       a.attname, format_type(a.atttypid,a.atttypmod) as data_type,
       a.attnotnull as not_null, pg_get_expr(d.adbin,d.adrelid) as default_expr
from pg_class c join pg_namespace n on n.oid=c.relnamespace
join pg_attribute a on a.attrelid=c.oid
left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum
where n.nspname='public' and c.relname='runs' and a.attnum>0 and not a.attisdropped
order by a.attnum;

select 'team_constraints' as section, conname, contype,
       pg_get_constraintdef(oid,true) as definition
from pg_constraint where conrelid=to_regclass('public.runs') order by conname;

select 'team_indexes' as section, indexrelid::regclass::text as index_name,
       pg_get_indexdef(indexrelid) as definition
from pg_index where indrelid=to_regclass('public.runs') order by index_name;

select 'team_policies' as section, c.relname as object_name, p.polname,
       p.polcmd, p.polroles::regrole[] as roles,
       pg_get_expr(p.polqual,p.polrelid) as using_expr,
       pg_get_expr(p.polwithcheck,p.polrelid) as check_expr
from pg_policy p join pg_class c on c.oid=p.polrelid
join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relname in
 ('runs','run_summary','web_a_runs','web_b_runs','mobile_a_runs','mobile_b_runs')
order by c.relname,p.polname;

select 'team_triggers' as section, c.relname as object_name, t.tgname,
       pg_get_triggerdef(t.oid,true) as definition
from pg_trigger t join pg_class c on c.oid=t.tgrelid
join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relname='runs' and not t.tgisinternal
order by t.tgname;

select 'team_grants' as section, table_name, grantee, privilege_type, is_grantable
from information_schema.role_table_grants
where table_schema='public' and table_name in
 ('runs','run_summary','web_a_runs','web_b_runs','mobile_a_runs','mobile_b_runs')
order by table_name,grantee,privilege_type;

-- Report counts/bytes only; never emit object names, bucket names, or metadata.
do $storage_usage$
declare object_count bigint; reported_bytes bigint;
begin
  if to_regclass('storage.objects') is null then
    raise notice 'storage_usage|UNAVAILABLE|objects=NA|reported_bytes=NA';
  else
    execute 'select count(*), coalesce(sum(case when (metadata->>''size'') ~ ''^[0-9]+$'' then (metadata->>''size'')::bigint else 0 end),0) from storage.objects'
      into object_count, reported_bytes;
    raise notice 'storage_usage|CATALOG_ESTIMATE|objects=%|reported_bytes=%', object_count, reported_bytes;
  end if;
end
$storage_usage$;

-- SQL catalogs cannot establish plan quota, remaining capacity, or actual
-- stored bytes when object metadata is absent. Confirm usage in owner dashboard.
select 'database_size' as section,
       pg_size_pretty(pg_database_size(current_database())) as current_database_size;
rollback;
