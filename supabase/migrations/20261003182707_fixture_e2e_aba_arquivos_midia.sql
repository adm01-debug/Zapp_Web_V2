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
-- O OBJETO (nao e criado por SQL): precisa existir em
-- whatsapp-media/04dff4dc-c6b1-4283-ac22-bd8639804759/e2e-files-tab-1791054089114.png — PNG 1x1
-- SINTETICO de 70 bytes (nenhum dado de cliente). O PRIMEIRO SEGMENTO DO CAMINHO E O `contact_id`
-- DE PROPOSITO: e o LOCATOR CANONICO exigido pela ACL fail-closed dos buckets privados de midia
-- (R2-DB-022 B1, migration 20261006175251_r2_db_022_storage_acl.sql): as policies de SELECT de
-- storage.objects autorizam por `(storage.foldername(name))[1]` igual a um contato visivel ao
-- usuario (public.is_contact_visible_to_user), mais admin/supervisor. O caminho ANTIGO desta
-- fixture (primeiro segmento = 5b6f6f71-..., que nao e contato) deixou de ser legivel: ele so
-- funcionava pela policy removida "whatsapp media readable via visible message" (20261003142707),
-- que autorizava por messages.media_url — referencia reassociavel, removida pelo R2-DB-022 B1. Por
-- isso o UPDATE abaixo normaliza o locator da linha (inclusive da que ja foi seedada antes).
--
-- POR QUE O CONTATO SEEDADO: `04dff4dc-c6b1-4283-ac22-bd8639804759` ([E2E] Contato de teste - nao
-- apagar) e o contato fixo dos specs logados (e2e/fixtures/e2e-contact.ts). O objeto fica na pasta
-- DELE, que e o unico locator que a ACL nova autoriza para o usuario do teste.
--
-- COMO REPRODUZIR LOCALMENTE (banco LOCAL, usuario sintetico; sem sessao salva e sem credencial
-- real — regra R1):
--   node e2e/fixtures/seed-files-tab.mjs          (cria usuario/contato/objeto canonico no stack local)
--   npx playwright test e2e/files-tab.spec.ts --no-deps (mede assinatura, download e fail-closed)
-- O spec cria e baixa o objeto LEGADO com service role local antes de exigir a negativa do
-- usuario sintetico; assim ausencia de objeto e bloqueio por ACL nao se confundem.
-- Medido no banco local como o usuario do teste: sign + GET no path canonico = HTTP 200
-- (image/png, 70 bytes); no path antigo existente = negado. Religando de volta a policy
-- removida, o path antigo volta a 200 — era so ela que o liberava.
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
  70,
  now()
where not exists (
  select 1 from public.messages
   where contact_id = '04dff4dc-c6b1-4283-ac22-bd8639804759'::uuid
     and media_filename = 'e2e-files-tab.png'
);

-- Locator CANONICO (R2-DB-022 B1): move o 1o segmento do path para o contato seedado.
-- Idempotente quando ESTA migration ainda vai rodar (versao ausente do ledger): se o insert
-- acima pular porque a linha ja existe no path antigo, este UPDATE corrige a linha na mesma
-- aplicacao. Em base onde esta versao ja foi registrada no ledger, editar este arquivo NAO
-- reexecuta o UPDATE; linha que permaneceu no path antigo exige passo operacional controlado
-- ou uma migration nova.
-- O gatilho update_messages_updated_at e desligado so durante este backfill para o ajuste
-- de locator nao parecer uma nova mensagem/edicao de conversa.
do $$
begin
  execute 'alter table public.messages disable trigger update_messages_updated_at';

  update public.messages
     set media_url = replace(
           media_url,
           '/whatsapp-media/5b6f6f71-916f-4537-9638-647485aba7db/',
           '/whatsapp-media/04dff4dc-c6b1-4283-ac22-bd8639804759/'
         )
   where contact_id = '04dff4dc-c6b1-4283-ac22-bd8639804759'::uuid
     and media_filename = 'e2e-files-tab.png'
     and media_url like '%/whatsapp-media/5b6f6f71-916f-4537-9638-647485aba7db/%';

  execute 'alter table public.messages enable trigger update_messages_updated_at';
exception
  when others then
    execute 'alter table public.messages enable trigger update_messages_updated_at';
    raise;
end $$;
