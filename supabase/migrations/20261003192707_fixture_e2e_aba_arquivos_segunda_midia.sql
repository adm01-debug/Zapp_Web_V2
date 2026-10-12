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
-- para o MESMO objeto sintetico (PNG 1x1 de 70 bytes, nenhum dado de cliente) — atalho de fixture
-- declarado: o que a etapa 47 mede e a INTERACAO (selecionar 2 itens), nao a unicidade do arquivo.
--
-- LOCATOR CANONICO (nao ha mais dependencia de policy por media_url): o objeto vive em
-- whatsapp-media/04dff4dc-c6b1-4283-ac22-bd8639804759/e2e-files-tab-1791054089114.png — o primeiro
-- segmento e o `contact_id` do contato seedado, exatamente o que a ACL fail-closed dos buckets
-- privados de midia autoriza (R2-DB-022 B1, migration 20261006175251_r2_db_022_storage_acl.sql,
-- via public.is_contact_visible_to_user). O caminho ANTIGO (primeiro segmento = 5b6f6f71-..., que
-- nao e contato) NAO e legivel: ele so funcionava pela policy removida
-- "whatsapp media readable via visible message" (20261003142707), que autorizava por
-- messages.media_url. O UPDATE abaixo normaliza o locator (inclusive da linha ja seedada antes).
--
-- COMO REPRODUZIR LOCALMENTE (banco LOCAL, usuario sintetico; sem sessao salva e sem credencial
-- real — regra R1): `node e2e/fixtures/seed-files-tab.mjs` cria o objeto canonico e as duas
-- linhas no stack local; `npx playwright test e2e/files-tab.spec.ts --no-deps` mede assinatura,
-- download e fail-closed. O spec cria e baixa o objeto LEGADO com service role local antes de
-- exigir a negativa do usuario sintetico, para nao confundir ausencia de objeto com ACL.
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
  70,
  now() - interval '1 minute'
where not exists (
  select 1 from public.messages
   where contact_id = '04dff4dc-c6b1-4283-ac22-bd8639804759'::uuid
     and media_filename = 'e2e-files-tab-2.png'
);

-- Locator CANONICO (R2-DB-022 B1): mesmo ajuste da 20261003182707, para a segunda linha.
-- Idempotente quando ESTA migration ainda vai rodar (versao ausente do ledger): se a linha ja
-- existe no path antigo, este UPDATE corrige na mesma aplicacao. Em base onde esta versao ja
-- foi registrada no ledger, editar este arquivo NAO reexecuta o UPDATE; linha que permaneceu
-- no path antigo exige passo operacional controlado ou uma migration nova.
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
     and media_filename = 'e2e-files-tab-2.png'
     and media_url like '%/whatsapp-media/5b6f6f71-916f-4537-9638-647485aba7db/%';

  execute 'alter table public.messages enable trigger update_messages_updated_at';
exception
  when others then
    execute 'alter table public.messages enable trigger update_messages_updated_at';
    raise;
end $$;
