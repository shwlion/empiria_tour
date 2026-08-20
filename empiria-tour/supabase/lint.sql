-- ===========================================================================
-- Empiria Tours — local stand-in for the Supabase database linter
-- ===========================================================================
-- Supabase runs these checks in Dashboard → Advisors (Security / Performance).
-- This file reproduces the rules that actually bite on this schema, so they can
-- be run in the SQL editor, in CI, or against a local Postgres before a
-- migration ships.
--
-- Two findings are EXPECTED and must not be "fixed":
--   * rls_enabled_no_policy on promotions, promotion_packages, booking_holds,
--     audit_log, email_templates — deny-all is the intent.
--   * unindexed_foreign_keys on the attribution columns (created_by,
--     updated_by, recorded_by, cancelled_by, room_type_id, block_id,
--     cancellation_policy_id) — no screen filters on them.
-- Anything else appearing here is a regression.
-- ===========================================================================

\echo '\n=== [SECURITY] rls_disabled_in_public — must be empty ==='
select tablename from pg_tables
 where schemaname = 'public' and not rowsecurity
 order by 1;

\echo '\n=== [SECURITY] rls_enabled_no_policy — expect exactly the 5 deny-all tables ==='
select t.tablename
  from pg_tables t
 where t.schemaname = 'public' and t.rowsecurity
   and not exists (select 1 from pg_policies p
                    where p.schemaname = 'public' and p.tablename = t.tablename)
 order by 1;

\echo '\n=== [SECURITY] security_definer_view — every view must say security_invoker = on ==='
select c.relname as view_name,
       coalesce((select option_value from pg_options_to_table(c.reloptions)
                  where option_name = 'security_invoker'), '!! NOT SET !!') as security_invoker
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relkind = 'v'
 order by 1;

\echo '\n=== [SECURITY] function_search_path_mutable — must be empty ==='
select p.proname
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) cfg
                    where cfg like 'search_path=%')
 order by 1;

\echo '\n=== [SECURITY] extension_in_public — must be empty ==='
select e.extname
  from pg_extension e join pg_namespace n on n.oid = e.extnamespace
 where n.nspname = 'public' and e.extname <> 'plpgsql';

\echo '\n=== [SECURITY] security_definer_function_executable — must be empty ==='
-- Any SECURITY DEFINER function in an exposed schema that anon or authenticated
-- can still EXECUTE is reachable as /rest/v1/rpc/<name>.
select p.proname,
       string_agg(r.rolname, ', ') as callable_by
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  cross join (values ('anon'), ('authenticated')) as r(rolname)
 where n.nspname = 'public'
   and p.prosecdef
   and pg_catalog.has_function_privilege(r.rolname, p.oid, 'EXECUTE')
   and exists (select 1 from pg_roles where rolname = r.rolname)
 group by p.proname
 order by 1;

\echo '\n=== [PERF] auth_rls_initplan — auth.uid() must be wrapped in (select ...) ==='
select tablename, policyname
  from pg_policies
 where schemaname = 'public'
   and (coalesce(qual,'') || coalesce(with_check,'')) ~ 'auth\.uid\(\)'
   and (coalesce(qual,'') || coalesce(with_check,'')) !~ '\(\s*SELECT\s+auth\.uid\(\)'
 order by 1, 2;

\echo '\n=== [PERF] unindexed_foreign_keys — expect only the attribution columns ==='
select c.conrelid::regclass::text as tbl,
       (select string_agg(a.attname, ', ' order by k.ord)
          from unnest(c.conkey) with ordinality k(attnum, ord)
          join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.attnum) as cols
  from pg_constraint c
 where c.contype = 'f'
   and c.connamespace = 'public'::regnamespace
   and not exists (
     select 1 from pg_index i
      where i.indrelid = c.conrelid
        and c.conkey[1] = (i.indkey::int2[])[0])
 order by 1, 2;

\echo '\n=== [PERF] multiple_permissive_policies — must be empty ==='
select tablename, cmd, count(*)
  from pg_policies
 where schemaname = 'public' and permissive = 'PERMISSIVE'
 group by 1, 2 having count(*) > 1
 order by 1;

\echo '\n=== [PERF] no_primary_key — must be empty ==='
select t.tablename from pg_tables t
 where t.schemaname = 'public'
   and not exists (select 1 from pg_constraint c
                    where c.conrelid = (quote_ident(t.tablename))::regclass
                      and c.contype = 'p')
 order by 1;
