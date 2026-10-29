begin;
create table soundbar_private.sb_library_category_names (
 source_name text primary key check(char_length(trim(source_name)) between 1 and 60),
 display_name text not null check(char_length(trim(display_name)) between 1 and 60),
 updated_at timestamptz not null default now()
);
create index sb_library_category_names_display on soundbar_private.sb_library_category_names(display_name);
alter table soundbar_private.sb_library_category_names enable row level security;
revoke all on soundbar_private.sb_library_category_names from public,anon,authenticated;
grant all on soundbar_private.sb_library_category_names to service_role;
create policy sb_library_category_names_no_client on soundbar_private.sb_library_category_names for all to anon,authenticated using(false) with check(false);
create function soundbar_private.sb_rename_library_category(p_old text,p_new text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare affected integer;available integer;source_count integer;
begin
 if (select auth.uid()) is null or not (select soundbar_private.sb_is_admin()) then raise exception using errcode='42501',message='Acesso exclusivo do administrador.';end if;
 p_old:=pg_catalog.btrim(p_old);p_new:=pg_catalog.btrim(p_new);
 if p_old is null or p_new is null or char_length(p_old) not between 1 and 60 or char_length(p_new) not between 1 and 60 or p_old ~ '[[:cntrl:]]' or p_new ~ '[[:cntrl:]]' then raise exception using errcode='22023',message='Informe nomes de categoria com ate 60 caracteres.';end if;
 if p_old=p_new then raise exception using errcode='22023',message='Informe um nome diferente.';end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('harmony-cpanel-import',0));
 lock table public.sb_library_tracks in share row exclusive mode;
 if not exists(select 1 from public.sb_library_tracks l where l.category=p_old or p_old=any(l.categories)) then raise exception using errcode='P0002',message='Categoria nao encontrada. Atualize a lista.';end if;
 if exists(select 1 from public.sb_library_tracks l cross join lateral pg_catalog.unnest(array[l.category]||l.categories) c(label) where c.label<>p_old and pg_catalog.lower(pg_catalog.btrim(c.label))=pg_catalog.lower(p_new))
 or exists(select 1 from soundbar_private.sb_library_category_names n where pg_catalog.lower(n.source_name)=pg_catalog.lower(p_new) and n.display_name<>p_old and n.display_name<>p_new)
 then raise exception using errcode='23505',message='Este nome ja esta vinculado a outra categoria. Escolha outro.';end if;
 select count(*) into available from public.sb_library_tracks l where l.active and (l.category=p_old or p_old=any(l.categories));
 update public.sb_library_tracks l set
  category=case when l.category=p_old then p_new else l.category end,
  categories=(select pg_catalog.array_agg(label order by first_position) from (
   select label,min(position) as first_position from (
    select case when value=p_old then p_new else value end as label,position
    from pg_catalog.unnest(array[l.category]||l.categories) with ordinality as x(value,position)
   ) renamed group by label
  ) distinct_labels)
 where l.category=p_old or p_old=any(l.categories);
 get diagnostics affected=row_count;
 update soundbar_private.sb_library_sources set category=p_new where category=p_old;
 get diagnostics source_count=row_count;
 update soundbar_private.sb_library_category_names set display_name=p_new,updated_at=now() where display_name=p_old;
 insert into soundbar_private.sb_library_category_names(source_name,display_name) values(p_old,p_new)
 on conflict(source_name) do update set display_name=excluded.display_name,updated_at=now();
 return pg_catalog.jsonb_build_object('old_name',p_old,'new_name',p_new,'affected',affected,'active_affected',available,'sources_updated',source_count);
end $$;
revoke all on function soundbar_private.sb_rename_library_category(text,text) from public,anon;
grant execute on function soundbar_private.sb_rename_library_category(text,text) to authenticated;
create function public.sb_admin_rename_library_category(old_name text,new_name text) returns jsonb
language sql security invoker set search_path='' as $$ select soundbar_private.sb_rename_library_category($1,$2) $$;
revoke all on function public.sb_admin_rename_library_category(text,text) from public,anon;
grant execute on function public.sb_admin_rename_library_category(text,text) to authenticated;
notify pgrst,'reload schema';
commit;
