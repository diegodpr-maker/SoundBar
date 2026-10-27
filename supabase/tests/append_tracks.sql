-- Real database regression, with approved client roles. All fixtures are rolled back.
begin;
do $$
declare a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid(); p uuid:=gen_random_uuid(); other_p uuid:=gen_random_uuid();
 t1 uuid:=gen_random_uuid();t2 uuid:=gen_random_uuid();t3 uuid:=gen_random_uuid();t4 uuid:=gen_random_uuid();
 t5 uuid:=gen_random_uuid();t6 uuid:=gen_random_uuid();other_track uuid:=gen_random_uuid();sample text;
begin
 insert into auth.users(id,email,raw_user_meta_data,email_confirmed_at)
 values(a,a||'@example.invalid','{}',now()),(b,b||'@example.invalid','{}',now());
 insert into public.sb_profiles(id,display_name) values(a,'Append A'),(b,'Append B');
 update public.sb_account_access set status='approved' where user_id in(a,b);
 perform set_config('request.jwt.claim.sub',a::text,true);
 insert into public.sb_playlists(id,user_id,name) values(p,a,'Append regression'),(other_p,a,'Independent playlist');
 select id into sample from public.sb_library_tracks where active order by id limit 1;
 if sample is null then raise exception 'Active library fixture required';end if;
 execute 'set local role authenticated';
 insert into public.sb_tracks(id,playlist_id,name,audio_path)
 values(t1,p,'Upload 1',a||'/'||t1||'.mp3'),(t2,p,'Upload 2',a||'/'||t2||'.mp3');
 if (select array_agg(position order by position) from public.sb_tracks where playlist_id=p) is distinct from array[0,1] then raise exception 'Initial append failed';end if;
 perform public.sb_reorder_tracks(p,array[t2,t1]);
 insert into public.sb_tracks(id,playlist_id,name,sample_id) values(t3,p,'Library track',sample);
 if (select array_agg(id order by position) from public.sb_tracks where playlist_id=p) is distinct from array[t2,t1,t3] then raise exception 'Library inserted before existing tracks';end if;
 insert into public.sb_tracks(id,playlist_id,name,audio_path,position)
 values(t4,p,'Upload with stale position',a||'/'||t4||'.mp3',0);
 if (select array_agg(id order by position) from public.sb_tracks where playlist_id=p) is distinct from array[t2,t1,t3,t4] then raise exception 'Upload not appended';end if;
 -- Deletions leave gaps: the next position must use MAX, rather than COUNT.
 delete from public.sb_tracks where id=t1;
 insert into public.sb_tracks(id,playlist_id,name,audio_path) values(t5,p,'After deletion',a||'/'||t5||'.mp3');
 if (select position from public.sb_tracks where id=t5) is distinct from 4 then raise exception 'Gap handling failed';end if;
 -- Dragging is still authoritative; subsequent additions follow that new order.
 perform public.sb_reorder_tracks(p,array[t5,t3,t2,t4]);
 insert into public.sb_tracks(id,playlist_id,name,sample_id) values(t6,p,'After second reorder',sample);
 if (select array_agg(id order by position) from public.sb_tracks where playlist_id=p) is distinct from array[t5,t3,t2,t4,t6] then raise exception 'Reordered playlist not preserved';end if;
 insert into public.sb_tracks(id,playlist_id,name,audio_path) values(other_track,other_p,'Other playlist',a||'/'||other_track||'.mp3');
 if (select position from public.sb_tracks where id=other_track) is distinct from 0 then raise exception 'Position leaked across playlists';end if;
 perform set_config('request.jwt.claim.sub',b::text,true);
 begin
  insert into public.sb_tracks(playlist_id,name,audio_path) values(p,'Forbidden',b||'/forbidden.mp3');
  raise exception 'Cross-tenant insert accepted';
 exception when insufficient_privilege then null;end;
 if (select count(*) from public.sb_tracks where playlist_id=p)<>0 then raise exception 'Other owner can read playlist';end if;
 execute 'reset role';
end $$;
rollback;
