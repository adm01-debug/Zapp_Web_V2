-- Recuperada do ledger (supabase_migrations.schema_migrations) em 2026-09-29.
-- Migration 20260928560000 foi aplicada em producao sem arquivo no repositorio (DDL fora do Git);
-- o SQL abaixo e identico ao registrado no ledger. Ver DB Live Guard:
-- scripts/db-audit/check-migration-drift.mjs

DROP POLICY IF EXISTS "Team chat files readable by owner admin or conversation member" ON storage.objects;

REVOKE UPDATE ON storage.objects FROM authenticated;

DROP POLICY IF EXISTS "Users can upload to own folder in team-chat-files" ON storage.objects;

CREATE POLICY team_chat_files_insert ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'team-chat-files' AND (storage.foldername(name))[1] = (public.current_profile_id())::text);
