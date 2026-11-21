# DASH-083 · Relatórios agendados — evidência de deploy (2026-11-20)

Entrega ponta a ponta: a UI do dashboard grava em `scheduled_report_configs`, a edge
`send-scheduled-report` agora lê essa tabela por `configId`, e um cron fechou o fio quebrado
("gestor cadastra o relatório e não recebe e-mail").

## O que a migration aplica

`supabase/migrations/20261120080000_scheduled_report_cron.sql` (commit `01737c9ec`, merge na
main em 2026-11-20):

1. Secret dedicado no Vault (`scheduled_report_cron_secret`, gerado in-db) — credencial de
   máquina nunca exposta a `anon`/`authenticated`.
2. RPC `get_scheduled_report_cron_secret()` — SECURITY DEFINER, somente `service_role`.
3. RPC `trigger_due_scheduled_report_configs()` — SECURITY DEFINER, somente `service_role`;
   seleciona configs ativas com frequência recorrente (`daily/weekly/biweekly/monthly`) e
   `next_send_at` vencido ou nulo (LIMIT 20 por tick; `custom` nunca é agendada).
4. Cron `send-scheduled-report-trigger` a cada 2 minutos chamando a RPC acima.

## Verificação de produção (ledger real, não "deveria funcionar")

A migration **está aplicada e registrada no ledger** do banco de produção
(`tnnnlkbymytvtqngbbqh`). Evidência: o `lote-pendente.mjs` do `db-live-guard.yml` classificou
**"classificar: sem pendencias ou drift"** — o que ocorre apenas quando a version
`20261120080000` existe em `supabase_migrations.schema_migrations`:

| Run (db-live-guard) | Quando (UTC) | Veredito do passo "Comparar migrations" |
|---|---|---|
| `44916326930` | 2026-11-21 14:54 | `classificar: sem pendencias ou drift` |
| `44917828713` | 2026-11-21 15:11 | `classificar: sem pendencias ou drift` |
| `44920860863` | 2026-11-21 15:45 | `classificar: sem pendencias ou drift` + `OK` nos demais passos |

A falha dos dois primeiros runs (14:54/15:11) foi pré-existente e não é desta migration: o
contrato de ACL do `webhook_failures` rejeitava o grant SELECT do `zapp_agente_leitura`
(issue #3161, corrigida depois pela PR #3300 em 2026-11-21 15:00Z).

O dry-run oficial (`db-migrate.yml`, run `44902353391`, 2026-11-21 12:07Z) anunciou exatamente
1 migration: `20261120080000_scheduled_report_cron.sql` (arquivo_sha256
`218fe0f5dcb58fe870f12daeee0966dee558f0420ac9308f48ce2a94f47dca42`).

## Edge

`supabase/functions/send-scheduled-report/index.ts` (mesmo commit): lê `scheduled_report_configs`
quando recebe `configId` (fonte da UI de dashboard) e mantém `scheduled_reports` legado por
`reportId` sem regressão. Testes em `index.test.ts` cobrem ambos os caminhos.
