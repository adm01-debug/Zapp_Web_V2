-- Migration 20261003182707 — fixture de midia privada para o spec e2e/files-tab.spec.ts (etapa 49
-- do PLANO_REDESIGN_ARQUIVOS_CHAT_PANEL_50_ETAPAS, PR I).
--
-- POR QUE AQUI (e nao por script/gateway): o gateway do Zapp V2 e SOMENTE-LEITURA por trava
-- tecnica — qualquer statement que nao comece com select/with/table/values/show/explain e
-- bloqueado ("Escrita no banco do Zapp Web V2 so por migration versionada em supabase/migrations/ +
-- hermes-db-migrar"). O plano de 50 etapas autoriza esta fixture na Decisao D4 (DML, nao DDL;
-- "nao remover depois"). A migration e o caminho sancionado: versionada, registrada no ledger e
-- idempotente.
--
-- O OBJETO (nao e criado por SQL): whatsapp-media/5b6f6f71-916f-4537-9638-647485aba7db/
-- e2e-files-tab-1791054089114.png — PNG 1x1 SINTETICO (nenhum dado de cliente), subido pelo
-- proprio usuario de QA na pasta de um contato dele, porque a policy de INSERT de storage.objects
-- exige que o PRIMEIRO segmento do caminho seja um contato do usuario que grava. Reproduzir com:
-- `node e2e/fixtures/seed-files-tab.mjs` (ver e2e/README.md). Medido: GET anonimo nesse objeto
-- responde HTTP 400 — o bucket e privado, entao o teste exercita a assinatura de URL da etapa 10.
--
-- POR QUE O CONTATO SEEDADO: o spec roda no projeto `chromium-authenticated` como o usuario de CI
-- (`aaa9b766-3b72-403d-95ad-f9cd7301ebca`), dono do contato
-- `04dff4dc-c6b1-4283-ac22-bd8639804759` ([E2E] Contato de teste - nao apagar). A leitura do objeto
-- por ele nao depende de posse do primeiro segmento: depende da policy aditiva
-- "whatsapp media readable via visible message" (migration 20261003142707), que libera o SELECT
-- quando existe linha VISIVEL em public.messages apontando para o objeto — e esta linha e
-- exatamente isso, numa conversa dele.
--
-- CLASSE: aditiva (DML com `where`) — aplicada na hora, no banco canonico, por hermes-db-migrar.
--
-- rollback: delete from public.messages where contact_id = '04dff4dc-c6b1-4283-ac22-bd8639804759'::uuid and media_filename = 'e2e-files-tab.png';

insert into public.messages (
  contact_id, sender, content, message_type,
  media_url, media_type, media_mimetype, media_filename, media_size, created_at
)
select
  '04dff4dc-c6b1-4283-ac22-bd8639804759'::uuid,
  'contact',
  '[Imagem] fixture E2E da aba Arquivos (etapa 49; nao remover)',
  'image',
  'https://tnnnlkbymytvtqngbbqh.supabase.co/storage/v1/object/public/whatsapp-media/5b6f6f71-916f-4537-9638-647485aba7db/e2e-files-tab-1791054089114.png',
  'image',
  'image/png',
  'e2e-files-tab.png',
  68,
  now()
where not exists (
  select 1 from public.messages
   where contact_id = '04dff4dc-c6b1-4283-ac22-bd8639804759'::uuid
     and media_filename = 'e2e-files-tab.png'
);
