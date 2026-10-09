-- audit_logs_dedupe_key_webhook_elevenlabs
-- Rollback: drop index if exists public.ux_audit_logs_dedupe_key; alter table public.audit_logs drop column if exists dedupe_key;
--
-- IA-WEBHOOK-001 (P1) — dedupe do webhook assinado da ElevenLabs.
-- O webhook verificava assinatura/timestamp (IA-013), mas cada entrega válida
-- caía num novo INSERT em audit_logs: não havia nada no banco que impedisse o
-- mesmo evento de gerar vários registros (replay). Classe: aditiva / contrato
-- de dados — uma coluna nova NULLABLE e um índice único PARCIAL, sem
-- DROP/TRUNCATE/RENAME de objeto vivo nem DML; tudo `if not exists`.
--
-- Por que coluna + índice parcial (mesma postura da IA-047): a chave nasce
-- NULA para todo o histórico, então nenhuma linha antiga entra no índice e
-- não há risco de colisão com o legado. Só a linha gravada com uma intenção
-- estável (elevenlabs:<tipo>:<id do evento|sha256 do corpo>) fica sob a
-- constraint — o INSERT concorrente/repetido recebe 23505 e a edge responde
-- "duplicate" sem novo efeito.

alter table public.audit_logs add column if not exists dedupe_key text;

create unique index if not exists ux_audit_logs_dedupe_key
  on public.audit_logs (dedupe_key)
  where dedupe_key is not null;

comment on column public.audit_logs.dedupe_key is
  'IA-WEBHOOK-001: chave idempotente do evento de webhook (ux_audit_logs_dedupe_key: único parcial). Replay da mesma entrega cai em 23505 e não gera novo registro.';
