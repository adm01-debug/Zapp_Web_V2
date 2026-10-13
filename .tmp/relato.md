Especialista: worker (testes) (area-testes-do-produto)

## O que mudou e por quê
- scripts/db-audit/talkx-monitor-panel.test.sh:
  1. a fixture view public.talkx_engine_health passou a usar `numeric` em metric_rate (antes `double precision`), espelhando a view real: a migration 20261003242707_talkx_log_saude_alertas.sql (linhas 285-286) declara `metric_count bigint` e `metric_rate numeric`. As colunas kind/observed_at/status/return_message já eram text/timestamptz.
  2. o caso (10) "migration replayavel" agora reaplica TAMBÉM a migration do engine health.

## Causa real do vermelho (medida, não suposta)
A view de fixture NÃO era o motivo: ela já expunha as seis colunas que o RPC lê (kind, observed_at, metric_count, metric_rate, status, return_message). O vermelho vinha do caso (10): ele reaplicava só a migration do monitor (20261010060000), cujo corpo da função NÃO tem o bloco motor; com isso o caso (11) media uma função já revertida, o JSON saía sem a chave `motor` e as cinco asserções ficavam vazias. A correção reaplica a migration do engine (20261010085230) antes do caso (11) — sem tocar em nenhuma asserção.

## Prova
- vermelho antes (sem as minhas mudanças, com a migration 20261010085230 do cartão pai):
  `bash scripts/db-audit/talkx-monitor-panel.test.sh` → `FAIL: motor.stalled_campaign [esperado: true | obtido: ]` (EXIT=1)
- mutação (só a produção): no bloco motor da migration 20261010085230 troquei `'stalled_campaign', EXISTS (...)` por `'stalled_campaign', FALSE` e rodei de novo →
  `FAIL: motor.stalled_campaign [esperado: true | obtido: false]` (EXIT=1); restaurei depois o arquivo do pai, byte-idêntico.
- verde depois: `bash scripts/db-audit/talkx-monitor-panel.test.sh` →
  `PASS: (11) bloco motor presente em health com stalled_campaign=true, stale_lease=true, outcome_unknown_24h=3, failure_rate_15m=0.12, cron_status=ok`
  `PASS: todos os 20 casos medidos` (EXIT=0, zero FAIL). Saída completa em .tmp/test-green.txt.

## Dependência do cartão pai (t_e295a21f · N-117)
O cartão pressupõe a migration 20261010085230 "já aplicada"; ela não está na branch do dia — só existe em commits não integrados. Trago para a base, verbatim, o que o pai entregou, sem alterar nenhum dos dois arquivos:
- supabase/migrations/20261010060000_talkx_monitor_panel.sql (X140, branch v2/n101-talkx-monitor-panel-2610100525f714)
- supabase/migrations/20261010085230_talkx_monitor_panel_engine_health.sql (commit 0c1e0797e0 do pai)
Commit separado: `chore(db): traz migrations do monitor panel (X140) e engine health (N-117) para a base do teste`.
REGISTRO NO INVENTÁRIO: scripts/db-audit/talkx-monitor-panel.test.sh entrou na ALLOWLIST de scripts/ci/check-test-inventory.mjs (com justificativa; o passo de YAML fica para o dono do workflow). `node scripts/ci/check-test-inventory.mjs` agora NÃO cita mais o meu teste; restam 4 órfãos pré-existentes da base (department-invite-contract-audit-vocabulary, talkx-conversion-defaults, team-chat-media-contract, team-direct-conversation-race) — não são regressão deste cartão.

## O que NÃO fiz e por quê
- Não alterei o RPC nem as migrations (só as trouxe verbatim do pai).
- Não enfraqueci, pulei nem aumentei timeout de nenhuma asserção; as 5 do critério continuam medindo a view.
