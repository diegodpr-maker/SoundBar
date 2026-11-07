begin;
do $$
declare target text; actor text;
begin
 foreach target in array array['sb_error_events','sb_playlist_share_grants'] loop
  if not exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname=target and c.relrowsecurity) then raise exception 'Missing RLS on %',target; end if;
  if not exists(select 1 from pg_policies p where p.schemaname='public' and p.tablename=target and p.permissive='RESTRICTIVE' and p.qual='false' and p.with_check='false' and p.roles @> array['anon','authenticated']::name[]) then raise exception 'Missing explicit client denial on %',target; end if;
  foreach actor in array array['anon','authenticated'] loop
   if has_table_privilege(actor,'public.'||target,'SELECT,INSERT,UPDATE,DELETE') then raise exception 'Unexpected client grant for % on %',actor,target; end if;
  end loop;
  if not has_table_privilege('service_role','public.'||target,'SELECT,INSERT,UPDATE,DELETE') then raise exception 'Server grants changed on %',target; end if;
 end loop;
end $$;
set local role service_role;
select count(*) >= 0 as server_error_access_preserved from public.sb_error_events;
select count(*) >= 0 as server_share_access_preserved from public.sb_playlist_share_grants;
reset role;
rollback;
