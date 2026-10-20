-- Migration 20261003192707 — SEGUNDA midia privada na fixture da aba Arquivos (etapa 47 do
-- PLANO_REDESIGN_ARQUIVOS_CHAT_PANEL_50_ETAPAS, PR I).
--
-- POR QUE: o aceite da etapa 47 pede o fluxo "localizar -> selecionar 2 -> abrir detalhes -> fechar"
-- SO POR TECLADO. Com uma unica midia no contato seedado, "selecionar 2" nao e executavel — medido na
-- sonda da etapa 47 (a barra mostrou "Selecionar todos (1 visiveis)"). Esta migration acrescenta a
-- segunda linha para que o aceite seja cumprido literalmente.
--
-- RELACAO COM A 20261003182707: aquela criou a PRIMEIRA linha (media_filename = 'e2e-files-tab.png').
-- Esta cria a segunda, com nome distinto para o cartao ser identificavel no spec. As duas apontam
-- para o MESMO objeto sintetico (PNG 1x1, nenhum dado de cliente) — atalho de fixture declarado: o
-- que a etapa 47 mede e a INTERACAO (selecionar 2 itens), nao a unicidade do arquivo. O objeto e
-- privado (GET anonimo responde HTTP 400) e a leitura pelo usuario depende da policy aditiva
-- "whatsapp media readable via visible message" (migration 20261003142707), que libera o SELECT
-- quando existe linha VISIVEL em public.messages apontando para o objeto.
--
-- NAO REMOVER: o plano (Decisao D4) mantem estas linhas em producao de proposito.
--
-- CLASSE: aditiva (DML com `where`) — aplicada na hora, no banco canonico, por hermes-db-migrar.
--
-- rollback: delete from public.messages where contact_id = '04dff4dc-c6b1-4283-ac22-bd8639804759'::uuid and media_filename = 'e2e-files-tab-2.png';

insert into public.messages (
  contact_id, sender, content, message_type,
  media_url, media_type, media_mimetype, media_filename, media_size, created_at
)
select
  '04dff4dc-c6b1-4283-ac22-bd8639804759'::uuid,
  'contact',
  '[Imagem] segunda midia da fixture E2E da aba Arquivos (etapa 47; nao remover)',
  'image',
  'https://tnnnlkbymytvtqngbbqh.supabase.co/storage/v1/object/public/whatsapp-media/5b6f6f71-916f-4537-9638-647485aba7db/e2e-files-tab-1791054089114.png',
  'image',
  'image/png',
  'e2e-files-tab-2.png',
  68,
  now() - interval '1 minute'
where not exists (
  select 1 from public.messages
   where contact_id = '04dff4dc-c6b1-4283-ac22-bd8639804759'::uuid
     and media_filename = 'e2e-files-tab-2.png'
);
