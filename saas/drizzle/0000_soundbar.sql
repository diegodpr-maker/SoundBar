CREATE TABLE profiles (user_id TEXT PRIMARY KEY NOT NULL, display_name TEXT NOT NULL DEFAULT '', bio TEXT NOT NULL DEFAULT '', accent TEXT NOT NULL DEFAULT '#b8f782', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
--> statement-breakpoint
CREATE TABLE workspaces (id TEXT PRIMARY KEY NOT NULL, owner_id TEXT NOT NULL UNIQUE, name TEXT NOT NULL DEFAULT 'Meu estúdio', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
--> statement-breakpoint
CREATE TABLE playlists (id TEXT PRIMARY KEY NOT NULL, tenant_id TEXT NOT NULL REFERENCES workspaces(id), name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', color TEXT NOT NULL DEFAULT '#b8f782', play_mode TEXT NOT NULL DEFAULT 'mix', loop INTEGER NOT NULL DEFAULT 0, retrigger TEXT NOT NULL DEFAULT 'stop', switch_mode TEXT NOT NULL DEFAULT 'stop', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE(id,tenant_id));
--> statement-breakpoint
CREATE INDEX playlists_tenant ON playlists(tenant_id);
--> statement-breakpoint
CREATE TABLE audio_files (id TEXT PRIMARY KEY NOT NULL, tenant_id TEXT NOT NULL REFERENCES workspaces(id), object_key TEXT NOT NULL UNIQUE, name TEXT NOT NULL, mime TEXT NOT NULL, size INTEGER NOT NULL, state TEXT NOT NULL DEFAULT 'uploading', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE(id,tenant_id));
--> statement-breakpoint
CREATE INDEX files_tenant ON audio_files(tenant_id);
--> statement-breakpoint
CREATE TABLE tracks (id TEXT PRIMARY KEY NOT NULL, tenant_id TEXT NOT NULL REFERENCES workspaces(id), playlist_id TEXT NOT NULL, name TEXT NOT NULL, color TEXT NOT NULL DEFAULT '#b8f782', audio_id TEXT, sample_id TEXT, position INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (playlist_id,tenant_id) REFERENCES playlists(id,tenant_id) ON DELETE CASCADE, FOREIGN KEY (audio_id,tenant_id) REFERENCES audio_files(id,tenant_id), CHECK ((audio_id IS NOT NULL AND sample_id IS NULL) OR (audio_id IS NULL AND sample_id IS NOT NULL)));
--> statement-breakpoint
CREATE INDEX tracks_tenant_playlist ON tracks(tenant_id,playlist_id);
