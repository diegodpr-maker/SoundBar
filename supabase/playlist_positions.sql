-- Persistent playlist order, scoped to the authenticated owner.
begin;
alter table public.sb_playlists add column if not exists position integer;
-- A position-only change should not change playlist content timestamps.
create or replace function public.sb_touch_playlist()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
 if (to_jsonb(new)-'position') is distinct from (to_jsonb(old)-'position') then
  new.updated_at=now();
 end if;
 return new;
end $$;
with ranked as (
 select id,(row_number() over(partition by user_id order by updated_at desc,created_at desc,id)-1)::integer as n
 from public.sb_playlists
)
update public.sb_playlists p set position=r.n from ranked r where p.id=r.id and p.position is null;
alter table public.sb_playlists alter column position set default 0;
alter table public.sb_playlists alter column position set not null;
alter table public.sb_playlists add constraint sb_playlists_position_nonnegative check(position>=0);
create index sb_playlists_owner_position_idx on public.sb_playlists(user_id,position,created_at,id);

create or replace function soundbar_private.sb_append_playlist_position()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
 if auth.uid() is null or new.user_id is distinct from auth.uid() then
  raise exception 'Conta inválida.' using errcode='42501';
 end if;
 -- Same lock order as playlist imports, quotas and private-track uploads.
 perform 1 from public.sb_profiles where id=auth.uid() for update;
 if not found then raise exception 'Conta indisponível.' using errcode='42501';end if;
 select greatest(coalesce(max(p.position),-1),-1)+1 into new.position
 from public.sb_playlists p where p.user_id=new.user_id;
 return new;
end $$;
revoke all on function soundbar_private.sb_append_playlist_position() from public,anon,authenticated;
create trigger sb_playlist_append_position before insert on public.sb_playlists
for each row execute function soundbar_private.sb_append_playlist_position();

create or replace function public.sb_reorder_playlists(playlist_ids uuid[])
returns void language plpgsql security invoker set search_path = '' as $$
declare total integer;
begin
 if auth.uid() is null or not soundbar_private.sb_is_approved() then
  raise exception 'Sessão necessária.' using errcode='42501';
 end if;
 perform 1 from public.sb_profiles where id=auth.uid() for update;
 if not found then raise exception 'Conta indisponível.' using errcode='42501';end if;
 perform 1 from public.sb_playlists where user_id=auth.uid() order by id for update;
 select count(*) into total from public.sb_playlists where user_id=auth.uid();
 if playlist_ids is null or cardinality(playlist_ids)>1000 or cardinality(playlist_ids)<>total
 or (array_ndims(playlist_ids) is not null and array_ndims(playlist_ids)<>1)
 or (select count(distinct x) from unnest(playlist_ids) x)<>total
 or exists(select 1 from unnest(playlist_ids) x where not exists(
  select 1 from public.sb_playlists p where p.id=x and p.user_id=auth.uid())) then
  raise exception 'Suas playlists mudaram. Atualize e tente novamente.';
 end if;
 update public.sb_playlists p set position=(s.n-1)::integer
 from unnest(playlist_ids) with ordinality s(id,n)
 where p.id=s.id and p.user_id=auth.uid();
end $$;
revoke all on function public.sb_reorder_playlists(uuid[]) from public,anon;
grant execute on function public.sb_reorder_playlists(uuid[]) to authenticated;
commit;
