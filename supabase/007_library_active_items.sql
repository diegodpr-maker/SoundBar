begin;
create function public.sb_check_library_item() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if tg_op='UPDATE' and new.sample_id is not distinct from old.sample_id then return new;end if;
 if new.sample_id is not null and not exists(select 1 from public.sb_library_tracks where id=new.sample_id and active) then raise exception 'Este item foi retirado da biblioteca.';end if;
 return new;
end;$$;
revoke all on function public.sb_check_library_item() from public,anon,authenticated;
create trigger sb_track_library_active before insert or update of sample_id on public.sb_tracks for each row execute function public.sb_check_library_item();
commit;
