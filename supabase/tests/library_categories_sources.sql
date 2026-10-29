begin;
do $$
declare item text:='categories-test-'||gen_random_uuid()::text; source text;
begin
 insert into public.sb_library_tracks(id,name,category,categories,object_path,audio_url,filename)
 values(item,'Synthetic catalogue fixture','A',array['A','B'],null,'https://sysmacom.com.br/musicas-harmony/Fixture/'||item||'.mp3','fixture.mp3');
 if not exists(select 1 from public.sb_library_tracks where id=item and categories=array['A','B']) then raise exception 'Categories missing';end if;
 begin update public.sb_library_tracks set categories=array[repeat('x',61)] where id=item;raise exception 'Oversized category accepted';exception when check_violation then null;end;
 begin update public.sb_library_tracks set categories=array[null::text] where id=item;raise exception 'NULL category accepted';exception when check_violation then null;end;
 begin update public.sb_library_tracks set categories=array[['A','B'],['C','D']] where id=item;raise exception 'Nested categories accepted';exception when check_violation then null;end;
 source:='https://sysmacom.com.br/musicas-harmony/Fixture/'||item||'-one.mp3';
 insert into soundbar_private.sb_library_sources(source_url,library_id,category,file_size,head_sha256,content_sha256)
 values(source,item,'A',100,repeat('a',64),repeat('b',64));
 insert into soundbar_private.sb_library_sources(source_url,library_id,category,file_size,head_sha256,content_sha256)
 values('https://sysmacom.com.br/musicas-harmony/Fixture/'||item||'-two.mp3',item,'B',100,repeat('a',64),repeat('b',64));
 begin
  insert into soundbar_private.sb_library_sources(source_url,library_id,category,file_size,head_sha256) values(source,item,'A',100,repeat('a',64));
  raise exception 'Repeated source accepted';
 exception when unique_violation then null;
 end;
 if (select count(*) from soundbar_private.sb_library_sources where library_id=item)<>2 then raise exception 'Aliases were not preserved';end if;
 update public.sb_library_tracks set active=false where id=item;
 if (select count(*) from soundbar_private.sb_library_sources where library_id=item)<>2 then raise exception 'Retired identity lost import history';end if;
end $$;
set local role authenticated;
do $$begin
 begin perform count(*) from soundbar_private.sb_library_sources;raise exception 'Client read private source history';exception when insufficient_privilege then null;end;
end $$;
set local role anon;
do $$begin
 begin perform count(*) from soundbar_private.sb_library_sources;raise exception 'Anonymous read private source history';exception when insufficient_privilege then null;end;
end $$;
reset role;
rollback;
