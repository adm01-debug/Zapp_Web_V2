-- 20260929860000_talkx_blacklist_origin_check_and_phone_active_unique
-- Etapa V05 do docs/talkx/PLANO_TALKX_V3_100_ETAPAS_2026-09-29.md.
-- (a 20260929850000 foi reservada por outro chat; esta e a proxima livre)
--
-- Dois objetos existiam SO no banco canonico (0 migrations, 0 ledger): o drift que o
-- check-migration-drift.mjs e o db-live-guard acusavam como "migrations vs ledger".
--   1) CHECK talkx_blacklist_origin_check aceitando 'auto_optout' — valor gravado pelo
--      webhook de opt-out automatico. Sem ele em migration, um banco recriado a partir
--      das migrations recusaria o insert do proprio codigo.
--   2) indice unico parcial talkx_blacklist_phone_active_unique em (phone)
--      WHERE phone IS NOT NULL AND removed_at IS NULL — impede duas supressoes ativas
--      do mesmo phone avulso (sem contact), sem bloquear a re-supressao depois da
--      remocao (era o furo do UNIQUE total em contact_id, corrigido na V07).
--
-- O SQL abaixo foi LIDO DO BANCO VIVO em 2026-09-30 (pg_get_constraintdef / pg_indexes)
-- e reescrito em forma idempotente, para: (a) ser no-op no canonico, onde os dois
-- objetos ja existem; (b) ser replayavel em `supabase db reset` e no PG17 descartavel
-- dos testes de contrato. O drop-if-exists antes do add e o que torna a repeticacao
-- segura (nao ha transacao explicita: o gateway ja aplica o arquivo em uma).
--
-- Classe: contrato (drop/add constraint) -> aplicada logo apos o merge e o deploy.

alter table public.talkx_blacklist
  drop constraint if exists talkx_blacklist_origin_check;

alter table public.talkx_blacklist
  add constraint talkx_blacklist_origin_check
  check (origin = any (array[
    'manual'::text,
    'optout'::text,
    'system'::text,
    'lgpd'::text,
    'list'::text,
    'auto_optout'::text
  ]));

create unique index if not exists talkx_blacklist_phone_active_unique
  on public.talkx_blacklist using btree (phone)
  where ((phone is not null) and (removed_at is null));
