begin;
create or replace function public.sb_reorder_tracks(target_playlist uuid, track_ids uuid[])
returns void language plpgsql security invoker set search_path = '' as $$
declare total integer;
begin
 if auth.uid() is null then raise exception 'Sessão necessária' using errcode='42501';end if;
 perform 1 from public.sb_playlists where id=target_playlist and user_id=auth.uid() for update;
 if not found then raise exception 'Playlist indisponível' using errcode='42501';end if;
 perform 1 from public.sb_tracks where playlist_id=target_playlist and user_id=auth.uid() for update;
 select count(*) into total from public.sb_tracks where playlist_id=target_playlist and user_id=auth.uid();
 if track_ids is null or cardinality(track_ids)<>total
 or (select count(distinct x) from unnest(track_ids) x)<>total
 or exists(select 1 from unnest(track_ids) x where not exists(select 1 from public.sb_tracks t where t.id=x and t.playlist_id=target_playlist and t.user_id=auth.uid()))
 then raise exception 'A playlist mudou. Atualize e tente novamente.';end if;
 update public.sb_tracks t set position=(s.n-1)::integer
 from unnest(track_ids) with ordinality s(id,n)
 where t.id=s.id and t.playlist_id=target_playlist and t.user_id=auth.uid();
end $$;
revoke all on function public.sb_reorder_tracks(uuid,uuid[]) from public,anon;
grant execute on function public.sb_reorder_tracks(uuid,uuid[]) to authenticated;
commit;
