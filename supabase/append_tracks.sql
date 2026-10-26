-- Append every new track at the end, including uploads, library additions and imports.
-- Existing positions and the drag-to-reorder RPC are left intact.
begin;
create or replace function soundbar_private.sb_append_track_position()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
 if auth.uid() is null or new.user_id is distinct from auth.uid() then
  raise exception 'Conta inválida.' using errcode='42501';
 end if;
 -- Use the same profile-before-playlist lock order as the quota/import paths.
 perform 1 from public.sb_profiles where id=auth.uid() for update;
 if not found then raise exception 'Conta indisponível.' using errcode='42501';end if;
 -- Reordering takes this same lock: append cannot read a half-reordered playlist.
 perform 1 from public.sb_playlists
 where id=new.playlist_id and user_id=new.user_id for update;
 if not found then raise exception 'Playlist indisponível.' using errcode='42501';end if;
 select greatest(coalesce(max(t.position),-1),-1)+1 into new.position
 from public.sb_tracks t
 where t.playlist_id=new.playlist_id and t.user_id=new.user_id;
 return new;
end $$;
revoke all on function soundbar_private.sb_append_track_position() from public,anon,authenticated;
drop trigger if exists sb_track_append_position on public.sb_tracks;
create trigger sb_track_append_position before insert on public.sb_tracks
for each row execute function soundbar_private.sb_append_track_position();
commit;
