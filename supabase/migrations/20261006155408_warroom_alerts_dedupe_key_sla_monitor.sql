-- warroom_alerts_dedupe_key_sla_monitor
-- Rollback: drop index if exists public.ux_warroom_alerts_dedupe_key; alter table public.warroom_alerts drop column if exists dedupe_key;
--
-- R2-MOD-074 (P2) — o monitor de SLA do War Room (src/hooks/business/useWarRoomAlerts.ts)
-- recriava o mesmo alerta sem parar: decidia pela CONTAGEM de violações contra a contagem de
-- alertas visíveis numa consulta limitada a 50 linhas de APRESENTAÇÃO, e o INSERT não tinha
-- chave de idempotência. Acima de 50 violações a condição voltava a ser verdadeira a cada
-- republicação da página e cada cliente criava outro alerta do mesmo incidente (som + push).
--
-- Classe: aditiva / contrato de dados — uma coluna nova NULLABLE e um índice único PARCIAL,
-- sem DROP/TRUNCATE/RENAME de objeto vivo nem DML; tudo `if not exists`.
-- O índice é parcial (`where dedupe_key is not null`) para deixar todo o histórico já existente
-- (chave NULA) fora da constraint: nenhuma linha antiga entra no índice e não há colisão com o
-- legado. Só a linha gravada com uma intenção estável
-- (`sla-monitor:v1:<hash do conjunto de conversas violadas>`) fica sob a constraint, então o
-- INSERT repetido ou concorrente recebe 23505 — o hook trata como "já representado" e não cria
-- novo alerta, som nem notificação. Alerta dispensado (is_read = true) continua ocupando a
-- chave: incidente já encerrado pelo operador não volta a alertar.

alter table public.warroom_alerts add column if not exists dedupe_key text;

create unique index if not exists ux_warroom_alerts_dedupe_key
  on public.warroom_alerts (dedupe_key)
  where dedupe_key is not null;

comment on column public.warroom_alerts.dedupe_key is
  'R2-MOD-074: chave idempotente do incidente que originou o alerta (ux_warroom_alerts_dedupe_key, unico parcial). Reexecucao do mesmo incidente cai em 23505 e nao gera novo alerta.';
