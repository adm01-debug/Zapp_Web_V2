-- team_chat_media_path_sender_conversation
-- Rollback: restaura o estado anterior à migration: derruba o CHECK novo e a tabela de apoio,
-- Rollback: devolvendo antes o media_bucket das linhas que a reconciliação havia anulado.
-- Rollback (SQL executável, na ordem):
--   alter table public.team_messages drop constraint if exists team_messages_media_path_matches_sender_conversation;
--   do $$ begin if exists (select 1 from pg_trigger where tgrelid = 'public.team_messages'::regclass and tgname = 'update_team_messages_updated_at' and not tgisinternal) then execute 'alter table public.team_messages disable trigger update_team_messages_updated_at'; end if; end $$;
--   update public.team_messages m set media_bucket = rb.media_bucket, media_path = rb.media_path, media_type = rb.media_type from public.team_chat_media_acl_r2_db_020_rb rb where m.id = rb.message_id;
--   do $$ begin if exists (select 1 from pg_trigger where tgrelid = 'public.team_messages'::regclass and tgname = 'update_team_messages_updated_at' and not tgisinternal) then execute 'alter table public.team_messages enable trigger update_team_messages_updated_at'; end if; end $$;
--   drop table if exists public.team_chat_media_acl_r2_db_020_rb;
--
-- R2-DB-020 (P1) — parte que ainda FALTAVA no HEAD. A metade de ACL do R2-DB-020 já
-- entrou por 20261007010651 (TC-001/#54): a policy de SELECT de team-chat-files passou a
-- derivar a autorização de storage.objects.name (qualificação explícita, sem o vetor
-- profiles.name) e da identidade canônica current_profile_id, preservando admin/supervisor
-- e a leitura legítima por membro da conversa. O que ficou de fora foi a outra metade do
-- pedido: a PERSISTÊNCIA de team_messages.media_path não era vinculada ao remetente nem
-- à própria conversa — qualquer caminho era aceito, então uma linha podia reivindicar um
-- objeto de conversa/perfil alheio.
--
-- Esta migration NÃO toca em policy, GRANT, papel nem ACL (essas partes já estão no HEAD);
-- só acrescenta o vínculo de dados, com transição segura para dado legado.
--
-- CONTRATO (decisão fechada): a chave canônica de mídia é
-- <profile_id>/<conversation_id>/<nome-opaco>
-- Quando media_bucket='team-chat-files', media_path precisa ter 1º segmento = sender_id
-- (perfil remetente) e 2º segmento = conversation_id (a própria conversa), com o nome
-- opaco não vazio. A comparação é texto com texto (sender_id::text / conversation_id::text):
-- caminho curto/malformado NEGA pelo CHECK, nunca vira erro de cast (não castamos o path
-- a uuid).
--
-- ESTRATÉGIA DE TRANSIÇÃO (segura sem assumir tabela vazia):
-- 1) CHECK entra NOT VALID: não falha por linha preexistente e já passa a valer para todo
--    INSERT/UPDATE daqui pra frente.
-- 2) Tabela de apoio _rb guarda o locator ANTIGO (media_bucket/media_path/media_type) das
--    linhas que a reconciliação mexer, para o Rollback devolver DADO (não só a constraint).
--    Nasce com RLS ligada e sem GRANT para PUBLIC/anon/authenticated: só o dono (a migration) lê.
-- 3) Reconciliação EXPLÍCITA do legado, determinística e não destrutiva do conteúdo:
--    anula o locator (media_bucket/media_path/media_type) das linhas que reivindicam
--    team-chat-files mas não satisfazem a chave canônica (media_path nulo, 1º segmento <>
--    sender_id, 2º segmento <> conversation_id ou 3º segmento vazio), sem tocar no conteúdo
--    da mensagem. Anular os três campos é obrigatório porque os CHECKs do contrato de locator
--    (team_messages_media_consistency, de 20261007010651) exigem bucket/path/type juntos ou
--    todos nulos; guardamos os três na tabela de apoio para o rollback devolver o dado. O
--    objeto no formato antigo <auth_uid>/... continua acessível pela policy vigente (que
--    preserva o ramo auth.uid), então não se retira leitura de ninguém; a linha apenas para
--    de reivindicar um arquivo do bucket fora da chave canônica.
--    EFEITO COLATERAL TRATADO: o gatilho BEFORE UPDATE update_team_messages_updated_at
--    regravaria updated_at de TODA linha reconciliada; ele é suspenso só dentro desta
--    transação (DISABLE/ENABLE em volta do UPDATE) para não reescrever a data das
--    mensagens antigas — provado no teste.
-- 4) VALIDATE CONSTRAINT: varredura integral que PROVA que a tabela ficou limpa, sem
--    depender de qualquer contagem prévia; se sobrar violação, a migration falha aqui de
--    forma explícita.

alter table public.team_messages
  drop constraint if exists team_messages_media_path_matches_sender_conversation;

alter table public.team_messages
  add constraint team_messages_media_path_matches_sender_conversation check (
    media_bucket is distinct from 'team-chat-files'
    or (
      media_path is not null
      and split_part(media_path, '/', 1) = sender_id::text
      and split_part(media_path, '/', 2) = conversation_id::text
      and split_part(media_path, '/', 3) <> ''
    )
  ) not valid;

create table if not exists public.team_chat_media_acl_r2_db_020_rb (
  message_id uuid primary key,
  media_bucket text,
  media_path text,
  media_type text,
  recorded_at timestamptz not null default now()
);

-- 20261009172324 já pode ter criado a tabela com só media_bucket.
-- IF NOT EXISTS na tabela não acrescenta as colunas do backup ampliado.
alter table public.team_chat_media_acl_r2_db_020_rb
  add column if not exists media_path text,
  add column if not exists media_type text;

alter table public.team_chat_media_acl_r2_db_020_rb enable row level security;

revoke all on public.team_chat_media_acl_r2_db_020_rb from public, anon, authenticated;

insert into public.team_chat_media_acl_r2_db_020_rb (message_id, media_bucket, media_path, media_type)
select m.id, m.media_bucket, m.media_path, m.media_type
from public.team_messages m
where m.media_bucket = 'team-chat-files'
  and not (
    m.media_path is not null
    and split_part(m.media_path, '/', 1) = m.sender_id::text
    and split_part(m.media_path, '/', 2) = m.conversation_id::text
    and split_part(m.media_path, '/', 3) <> ''
  )
on conflict (message_id) do nothing;

do $$
begin
  if exists (
    select 1 from pg_trigger
    where tgrelid = 'public.team_messages'::regclass
      and tgname = 'update_team_messages_updated_at'
      and not tgisinternal
  ) then
    execute 'alter table public.team_messages disable trigger update_team_messages_updated_at';
  end if;
end $$;

update public.team_messages
set media_bucket = null,
    media_path = null,
    media_type = null
where media_bucket = 'team-chat-files'
  and not (
    media_path is not null
    and split_part(media_path, '/', 1) = sender_id::text
    and split_part(media_path, '/', 2) = conversation_id::text
    and split_part(media_path, '/', 3) <> ''
  );

do $$
begin
  if exists (
    select 1 from pg_trigger
    where tgrelid = 'public.team_messages'::regclass
      and tgname = 'update_team_messages_updated_at'
      and not tgisinternal
  ) then
    execute 'alter table public.team_messages enable trigger update_team_messages_updated_at';
  end if;
end $$;

alter table public.team_messages
  validate constraint team_messages_media_path_matches_sender_conversation;
