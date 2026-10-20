-- contacts_presence
-- Rollback: remove as 3 colunas aditivas de presenca em public.contacts (nao ha policy, grant nem dado novo).
-- Rollback (SQL executavel, na ordem):
--   alter table public.contacts drop column if exists last_seen_at;
--   alter table public.contacts drop column if exists presence_updated_at;
--   alter table public.contacts drop column if exists presence_status;
--
-- Presenca REAL do contato (R2-INB-030 removeu o "Online" FIXO e falso; mostrar o
-- sinal verdadeiro vindo do WhatsApp e permitido). O webhook da Evolution GO ja
-- entrega `presence.update` com online/offline (evolution-go-adapter.ts), mas o
-- handler (evolution-webhook-handlers.ts:handlePresenceUpdate) descartava esses
-- estados. As colunas abaixo guardam o que o evento informa:
--   presence_status     -> 'online' | 'offline' (null = nunca informado, o front
--                          mantem o estado NEUTRO; nunca afirma o que nao sabe);
--   presence_updated_at -> instante do ultimo evento de presenca (o front so mostra
--                          "Online" se for recente);
--   last_seen_at        -> instante em que o contato passou de online para offline
--                          ("visto por ultimo").
--
-- Natureza: ADITIVA e IDEMPOTENTE (colunas nullable + `add column if not exists`).
-- Sem backfill e sem tocar dado existente. O CHECK so restringe os valores que o
-- proprio handler escreve. A RLS/GRANT sao herdados da tabela `contacts` (coluna
-- nova nao cria superficie de acesso propria), entao nao ha policy nem grant novos.

alter table public.contacts
  add column if not exists presence_status text
    check (presence_status in ('online', 'offline')),
  add column if not exists presence_updated_at timestamptz,
  add column if not exists last_seen_at timestamptz;
