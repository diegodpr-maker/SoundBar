begin;
do $$
declare a uuid:=gen_random_uuid();b uuid:=gen_random_uuid();p uuid:=gen_random_uuid();q uuid:=gen_random_uuid();target uuid:=gen_random_uuid();shared jsonb;doc jsonb;changed integer;
begin
 insert into auth.users(id,email,raw_user_meta_data) values(a,a||'@example.invalid','{}'),(b,b||'@example.invalid','{}');
 insert into public.sb_profiles(id,display_name) values(a,'Fader A'),(b,'Fader B');update public.sb_account_access set status='approved' where user_id in(a,b);
 perform set_config('request.jwt.claim.sub',a::text,true);execute 'set local role authenticated';
 insert into public.sb_playlists(id,user_id,name) values(p,a,'Event fader');
 if not exists(select 1 from public.sb_playlists where id=p and event_fade_enabled and event_fade_duration=2000) then raise exception 'Missing fader defaults';end if;
 update public.sb_playlists set event_fade_enabled=false,event_fade_duration=5000 where id=p;
 begin update public.sb_playlists set event_fade_duration=999 where id=p;raise exception 'Invalid duration accepted';exception when check_violation then null;end;
 shared:=public.sb_set_playlist_share(p,true,true);
 perform set_config('request.jwt.claim.sub',b::text,true);
 update public.sb_playlists set event_fade_duration=1000 where id=p;get diagnostics changed=row_count;if changed<>0 then raise exception 'Another account changed settings';end if;
 if exists(select 1 from public.sb_playlists where id=p) then raise exception 'Private playlist exposed';end if;
 doc:=public.sb_get_shared_playlist((shared->>'token')::uuid);
 if (doc->'playlist'->>'event_fade_enabled')::boolean or (doc->'playlist'->>'event_fade_duration')::integer<>5000 then raise exception 'Shared settings missing';end if;
 perform public.sb_import_shared_playlist((shared->>'token')::uuid,doc->>'revision',target,'[]');
 if not exists(select 1 from public.sb_playlists where id=target and user_id=b and not event_fade_enabled and event_fade_duration=5000) then raise exception 'Import lost fader settings';end if;
 insert into public.sb_playlists(id,user_id,name) values(q,b,'Other playlist');update public.sb_playlists set event_fade_duration=3000 where id=q;
 if (select event_fade_duration from public.sb_playlists where id=target)<>5000 then raise exception 'Playlist settings were not isolated';end if;
 execute 'reset role';
end$$;
rollback;
