# Inventário — Crons (pg_cron)

**Data**: 2026-10-24 | Total de jobs ativos: 24

## Jobs com falhas nos últimos 30 dias

| Job | Total runs 30d | Falhas | % Falha |
|-----|---------------|--------|----------|
| talkx-scheduler-1min | 43.071 | 4.007 | **9,3%** |
| tasks-notify-due | ~21.000 | 1.524 | ~7,3% |
| ai-jobs-tick-1min | ~21.000 | 1.173 | ~5,6% |

## Jobs que fazem chamadas HTTP (pg_net)

- `talkx-scheduler-1min` → edge `talkx-scheduler`
- `ai-jobs-tick-1min` → edge `ai-jobs-worker`
- `crm-sync-worker` (agendamento, desarmado)

## Gestão de segredos nos crons

- Todos os jobs HTTP usam `vault.decrypted_secrets` para ler secrets — correto
- Nenhum segredo hardcoded encontrado nos comandos de cron
- `sicoob_service_role_key` no vault (nome suspeito para uma service_role key — revisar)

## Funções alvo dos crons

Verificadas:
- `trigger_talkx_engine_tick()` — 20.004 chamadas, média 967ms, total ~5,4h de CPU
- `trigger_pending_multiplix_dispatches()` — chamada por cron
- `tasks-notify-due` — alvo não verificado diretamente

## Observações

1. `talkx-scheduler-1min` com 9,3% de falha é o principal problema operacional
2. O volume de 20.004 chamadas do `trigger_talkx_engine_tick` é compatível com 1x/min em ~14 dias
3. `crm-sync-worker` está com schedule comentado e `vars.CRM_SYNC_WORKER_ENABLED` desligado — intencional
