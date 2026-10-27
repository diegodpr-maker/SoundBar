-- Uses disposable fixtures only. No persistent accounts or data are changed.
begin;
do $$
declare a uuid:=gen_random_uuid();b uuid:=gen_random_uuid();pending_user uuid:=gen_random_uuid();
 p1 uuid:=gen_random_uuid();p2 uuid:=gen_random_uuid();p3 uuid:=gen_random_uuid();p4 uuid:=gen_random_uuid();other_p uuid:=gen_random_uuid();
 stamp timestamptz; failed boolean;
begin
 insert into auth.users(id,email,raw_user_meta_data,email_confirmed_at)
 values(a,a||'@example.invalid','{}',now()),(b,b||'@example.invalid','{}',now()),(pending_user,pending_user||'@example.invalid','{}',now());
 insert into public.sb_profiles(id,display_name) values(a,'Playlist order A'),(b,'Playlist order B'),(pending_user,'Pending fixture');
 update public.sb_account_access set status='approved' where user_id in(a,b);
 perform set_config('request.jwt.claim.sub',b::text,true);
 insert into public.sb_playlists(id,user_id,name) values(other_p,b,'Other owner');
 perform set_config('request.jwt.claim.sub',a::text,true);
 execute 'set local role authenticated';
 insert into public.sb_playlists(id,name) values(p1,'First'),(p2,'Second'),(p3,'Third');
 if (select array_agg(position order by position) from public.sb_playlists) is distinct from array[0,1,2] then raise exception 'Append failed';end if;
 select updated_at into stamp from public.sb_playlists where id=p1;
 perform public.sb_reorder_playlists(array[p3,p1,p2]);
 if (select array_agg(id order by position) from public.sb_playlists) is distinct from array[p3,p1,p2] then raise exception 'Reorder not persisted';end if;
 if (select updated_at from public.sb_playlists where id=p1) is distinct from stamp then raise exception 'Order changed content timestamp';end if;
 if (select name from public.sb_playlists where id=p1)<>'First' then raise exception 'Playlist content changed';end if;
 failed:=false;begin perform public.sb_reorder_playlists(array[p1,p1,p2]);exception when raise_exception then failed:=true;end;if not failed then raise exception 'Duplicate accepted';end if;
 failed:=false;begin perform public.sb_reorder_playlists(array[p1,p2]);exception when raise_exception then failed:=true;end;if not failed then raise exception 'Partial order accepted';end if;
 failed:=false;begin perform public.sb_reorder_playlists(array[p1,p2,other_p]);exception when raise_exception then failed:=true;end;if not failed then raise exception 'Other owner ID accepted';end if;
 failed:=false;begin perform public.sb_reorder_playlists(array[p1,p2,null]::uuid[]);exception when raise_exception then failed:=true;end;if not failed then raise exception 'NULL accepted';end if;
 if (select array_agg(id order by position) from public.sb_playlists) is distinct from array[p3,p1,p2] then raise exception 'Invalid input changed order';end if;
 insert into public.sb_playlists(id,name,position) values(p4,'Appended',0);
 if (select position from public.sb_playlists where id=p4)<>3 then raise exception 'New playlist did not append';end if;
 delete from public.sb_playlists where id=p2;
 perform public.sb_reorder_playlists(array[p4,p1,p3]);
 perform set_config('request.jwt.claim.sub',b::text,true);
 perform public.sb_reorder_playlists(array[other_p]);
 if (select count(*) from public.sb_playlists)<>1 then raise exception 'Other tenant visible';end if;
 perform set_config('request.jwt.claim.sub',pending_user::text,true);
 begin perform public.sb_reorder_playlists(array[]::uuid[]);raise exception 'Pending user accepted';exception when insufficient_privilege then null;end;
 execute 'reset role';
 if (select array_agg(id order by position) from public.sb_playlists where user_id=a) is distinct from array[p4,p1,p3] then raise exception 'Other tenant reorder changed data';end if;
 perform set_config('request.jwt.claim.sub','',true);execute 'set local role anon';
 begin perform public.sb_reorder_playlists(array[]::uuid[]);raise exception 'Anonymous caller accepted';exception when insufficient_privilege then null;end;
 execute 'reset role';
end $$;
rollback;
