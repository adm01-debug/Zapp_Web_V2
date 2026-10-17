-- prefixo_reconcilia_janela_talkx_e_team_chat_media_rb
-- Rollback: devolve o nome antigo a public.talkx_campaign_window_open (a versao boolean criada depois desta sai) e derruba media_path/media_type de public.team_chat_media_acl_r2_db_020_rb; nos conjuntos em que a migration foi no-op, o rollback tambem e no-op.
-- Rollback (SQL executável, na ordem):
--   do $$ begin if to_regprocedure('public.talkx_campaign_window_open_legado(uuid, timestamptz)') is not null then drop function if exists public.talkx_campaign_window_open(uuid, timestamptz); alter function public.talkx_campaign_window_open_legado(uuid, timestamptz) rename to talkx_campaign_window_open; end if; end $$;
--   alter table if exists public.team_chat_media_acl_r2_db_020_rb drop column if exists media_path, drop column if exists media_type;
--
-- AF4-2 (causa-raiz das 2 falhas de REPOSITORIO do replay de origin/main). Medido em 17/10/2026
-- com scripts/db-audit/replay-local.sh sobre o conjunto de origin/main (imagem fixa por digest,
-- papel supabase_admin): 1022 ok, 24 falhas de 1046; 20 esperadas no allowlist / 4 INESPERADAS.
-- Das 4 inesperadas, 2 sao objeto de SERVICO do Supabase que o bootstrap do replay nao cria
-- (realtime.messages, auth.sessions) e 2 sao do REPOSITORIO, tratadas aqui:
--
--   * 20261011003008_talkx_n102c_window_open.sql
--       -> ERROR: cannot change return type of existing function
--   * 20261012192938_team_chat_media_path_sender_conversation.sql
--       -> ERROR: column "media_path" of relation "team_chat_media_acl_r2_db_020_rb" does not exist
--
-- POR QUE UMA MIGRATION NOVA E NAO EDICAO DOS ARQUIVOS: migration publicada e imutavel (regra 7).
--
-- POR QUE UM PREFIXO (timestamp ANTERIOR ao dos dois arquivos que falham): as duas falhas sao de
-- ORDEM/CONFLITO com objetos que JA EXISTEM quando o arquivo quebrado roda. Corrigir depois do
-- arquivo quebrado nao muda o resultado dele (mesma causa que o allowlist do replay classifica
-- como "ordem-idempotencia"). O prefixo roda depois de quem CRIA o objeto e antes de quem quebra:
-- para o CASO 1 isso e a janela 20261011000003 < 20261011000004 < 20261011003008; para o CASO 2,
-- 20261009172324 < 20261011000004 < 20261012192938. Os dois intervalos contem 20261011000004.
--
-- CASO 1 (retorno) — 20261011000003 (20261010_talkx_campaigns_dnd_weekdays) criou
--   public.talkx_campaign_window_open(uuid, timestamptz) RETURNS TABLE(allowed boolean, reason
--   text, next_window timestamptz). A 20261011003008 faz CREATE OR REPLACE com RETURNS boolean:
--   o PostgreSQL recusa mudar o tipo de retorno (42P13), porque CREATE OR REPLACE casa por
--   nome + tipos dos argumentos, nao pelo retorno.
--   Correcao: RENOMEAR a funcao existente libera o NOME sem apagar a definicao anterior nem a ACL
--   dela — um DROP perderia as duas e o rollback nao teria como devolve-las de forma fiel (a regra
--   do rollback recusa "recrie a partir de outro arquivo"). Depois do rename a 20261011003008 cria
--   a versao boolean, que e o contrato REAL do chamador: supabase/functions/talkx-scheduler/index.ts
--   exige `windowOpen === true` (uma funcao RETURNS TABLE devolveria array e a campanha nunca
--   enviaria), e e o que a 20261013085500 pressupoe ao deixar EXECUTE so para service_role.
--   A funcao renomeada permanece como vestigio SO no conjunto em que ela existe; a ACL anterior
--   dela (EXECUTE para authenticated, com a checagem de papel X014 no corpo) fica INTOCADA de
--   proposito: mudar GRANT/ACL nao e pedido deste cartao. Em producao o objeto nunca existiu
--   (a versao 20261011000003 nao esta no ledger do canonico, medido na FOTO-AG4b de 17/10).
--   Decisao de remover o vestigio na origem (DROP no arquivo de origin/main) fica com o dono
--   desses arquivos; registrado no cartao.
--
-- CASO 2 (colunas) — 20261009172324_team_chat_media_acl_r2_db_020.sql, versao ANTIGA do mesmo
--   assunto R2-DB-020 e ausente do ledger do canonico, criou
--   public.team_chat_media_acl_r2_db_020_rb (message_id, media_bucket, recorded_at). A
--   20261012192938 assume (message_id, media_bucket, media_path, media_type, recorded_at) e usa
--   CREATE TABLE IF NOT EXISTS — no-op sobre a tabela que ja existe — e o INSERT seguinte cai em
--   coluna inexistente (42703).
--   Correcao: acrescentar as 2 colunas de texto NULAS (mesma forma do CREATE da 20261012192938)
--   destrava o INSERT sem tocar em dado, policy nem GRANT. NAO regrava linha nenhuma: o gatilho
--   update_team_messages_updated_at fica fora de alcance (nenhum UPDATE/INSERT nesta migration).
--   Em producao a 20261009172324 nunca foi aplicada, entao la a 20261012192938 criou a tabela ja
--   com as 4 colunas — e por isso passou no canonico.
--
-- Nos conjuntos em que os objetos NAO existem (ex.: a copia do dia, que nao tem nenhuma das duas
-- versoes conflitantes), esta migration e no-op: cada passo tem guarda (to_regprocedure/to_regclass)
-- e nao executa DDL cego. Efeito colateral: nenhum — nao muda GRANT, policy, papel, dado nem trigger.
-- Sem BEGIN/COMMIT: o ledger aplica cada migration em transacao propria.

do $$
begin
  if to_regprocedure('public.talkx_campaign_window_open_legado(uuid, timestamptz)') is not null then
    raise notice 'prefixo-af4-2: ja reconciliado (vestigio talkx_campaign_window_open_legado existe); nada a fazer';
    return;
  end if;

  if to_regprocedure('public.talkx_campaign_window_open(uuid, timestamptz)') is null then
    raise notice 'prefixo-af4-2: talkx_campaign_window_open ausente nesta pilha; nada a liberar';
    return;
  end if;

  if pg_get_function_result(to_regprocedure('public.talkx_campaign_window_open(uuid, timestamptz)')) = 'boolean' then
    raise notice 'prefixo-af4-2: talkx_campaign_window_open ja retorna boolean; nada a fazer';
    return;
  end if;

  alter function public.talkx_campaign_window_open(uuid, timestamptz)
    rename to talkx_campaign_window_open_legado;
  raise notice 'prefixo-af4-2: talkx_campaign_window_open renomeada para talkx_campaign_window_open_legado';
end $$;

do $$
begin
  if to_regclass('public.team_chat_media_acl_r2_db_020_rb') is null then
    raise notice 'prefixo-af4-2: team_chat_media_acl_r2_db_020_rb ausente nesta pilha (a 20261012192938 a cria com as 4 colunas); nada a fazer';
    return;
  end if;

  if exists (
    select 1 from pg_attribute a
    where a.attrelid = to_regclass('public.team_chat_media_acl_r2_db_020_rb')
      and a.attname = 'media_path'
      and a.attnum > 0
      and not a.attisdropped
  ) then
    raise notice 'prefixo-af4-2: team_chat_media_acl_r2_db_020_rb ja tem media_path; nada a fazer';
    return;
  end if;

  alter table public.team_chat_media_acl_r2_db_020_rb
    add column media_path text,
    add column media_type text;
  raise notice 'prefixo-af4-2: media_path/media_type acrescentadas a team_chat_media_acl_r2_db_020_rb';
end $$;
