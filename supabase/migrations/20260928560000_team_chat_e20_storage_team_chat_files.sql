-- Recuperada do ledger (supabase_migrations.schema_migrations) em 2026-09-29.
-- Migration 20260928560000 foi aplicada em producao sem arquivo no repositorio (DDL fora do Git);
-- o SQL abaixo e identico ao registrado no ledger. Ver DB Live Guard:
-- scripts/db-audit/check-migration-drift.mjs

DROP POLICY IF EXISTS "Team chat files readable by owner admin or conversation member" ON storage.objects;

REVOKE UPDATE ON storage.objects FROM authenticated;

DROP POLICY IF EXISTS "Users can upload to own folder in team-chat-files" ON storage.objects;

CREATE POLICY team_chat_files_insert ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'team-chat-files' AND (storage.foldername(name))[1] = (public.current_profile_id())::text);

-- ROLLBACK (plano de ligacao 2610092251f295) — secao reversivel da migration 20260928560000,
-- no fim do arquivo e sem tocar no DDL acima (cabecalho de 5 linhas intocado).
-- Rollback: desfaz o DDL acima — dropa a policy criada, devolve o UPDATE a authenticated e recria as duas policies removidas.
-- Rollback (SQL executavel, na ordem):
--   drop policy if exists team_chat_files_insert on storage.objects;
--   grant update on storage.objects to authenticated;
--   create policy "Team chat files readable by owner admin or conversation member" on storage.objects for select to authenticated using (bucket_id = 'team-chat-files' and (storage.foldername(name))[1] = (public.current_profile_id())::text);
--   create policy "Users can upload to own folder in team-chat-files" on storage.objects for insert to authenticated with check (bucket_id = 'team-chat-files' and (storage.foldername(name))[1] = (public.current_profile_id())::text);
