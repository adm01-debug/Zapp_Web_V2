Especialista: worker (testes) (area-testes-do-produto)

## Arquivos no diff (5 arquivos, 1 de teste)
Cartão pediu só scripts/db-audit/talkx-monitor-panel.test.sh. Os outros 4 e o porquê de cada:
- scripts/db-audit/talkx-monitor-panel.test.sh — o alvo (1 arquivo de teste, o pedido do cartão).
- supabase/migrations/20261010060000_talkx_monitor_panel.sql — trazido verbatim do X140: sem ele o teste nem aplica a migration (a base do dia não tem o arquivo). NÃO editei o conteúdo; copiei do commit d4c4ee3a52 (a versão corrigida do X140, com o gatilho desligado na transação e o NULL negado).
- supabase/migrations/20261010085230_talkx_monitor_panel_engine_health.sql — trazido verbatim do cartão pai t_e295a21f (commit 0c1e0797e0), sem alteração. O cartão pressupõe esta migration "já aplicada"; ela não está na branch do dia.
- scripts/ci/check-test-inventory.mjs — o teste .test.sh novo ficaria órfão no CI; entrou na ALLOWLIST com justificativa (o passo de YAML é do dono do workflow, agente não edita workflow).
- .tmp/relato.md — este relato (já era versionado na base).

## O que mudou no teste e por quê
1. Fixture: `metric_rate` da view public.talkx_engine_health passou a `numeric` (era `double precision`), espelhando a view real (migration 20261003242707_talkx_log_saude_alertas.sql, linhas 285-286: metric_count bigint, metric_rate numeric).
2. Fixture: adicionei o gatilho de produção `update_talkx_recipients_updated_at` (public.update_updated_at_column + BEFORE UPDATE em talkx_recipients). Sem ele a migration corrigida do X140 não aplica — o `ALTER TABLE ... DISABLE TRIGGER` falha com "trigger does not exist".
3. Caso (10): além de reaplicar a migration do monitor, reaplica também a do engine health — a do monitor recria a função com o corpo anterior (sem o bloco motor) e zerava o caso (11).
4. Caso (12) novo: prova que o backfill de failed_at não regrava updated_at (a conferência do juiz sobre o gatilho).

## Causa real do vermelho (medida, não suposta)
A view de fixture NÃO era o motivo: ela já expunha as seis colunas que o RPC lê. O vermelho vinha do caso (10): reaplicava só a migration do monitor (20261010060000), cujo corpo da função NÃO tem o bloco motor; o caso (11) media então uma função revertida, o JSON saía sem a chave `motor` e as cinco asserções do critério ficavam vazias.

## Conferência do juiz (gatilho BEFORE UPDATE no backfill)
A migration que trago já desliga SÓ esse gatilho, dentro da transação:
  linha 23 (antes do UPDATE):  ALTER TABLE public.talkx_recipients DISABLE TRIGGER update_talkx_recipients_updated_at;
  linha 29 (depois do UPDATE): ALTER TABLE public.talkx_recipients ENABLE TRIGGER update_talkx_recipients_updated_at;
E o caso (12) prova pelo teste: os 6 failed da campanha C entram com `updated_at` sentinela 2001-01-01; depois do backfill (e do replay do caso 10) `updated_at` continua o sentinela e `failed_at` veio dele.

## Prova
- vermelho antes (sem as minhas mudanças, com a migration 20261010085230 do pai):
  `bash scripts/db-audit/talkx-monitor-panel.test.sh` -> `FAIL: motor.stalled_campaign [esperado: true | obtido: ]` (EXIT=1)
- mutação A (motor, só a produção): no bloco motor da migration 20261010085230 troquei `'stalled_campaign', EXISTS (...)` por `'stalled_campaign', FALSE` ->
  `FAIL: motor.stalled_campaign [esperado: true | obtido: false]` (EXIT=1)
- mutação B (gatilho, só a produção): removi o `DISABLE TRIGGER` da migration 20261010060000 ->
  `FAIL: backfill preservou updated_at (campanha C) [esperado: 0 | obtido: 6]` (EXIT=1)
- verde depois: `bash scripts/db-audit/talkx-monitor-panel.test.sh` ->
  `PASS: (11) bloco motor presente em health com stalled_campaign=true, stale_lease=true, outcome_unknown_24h=3, failure_rate_15m=0.12, cron_status=ok`
  `PASS: (12) backfill de failed_at preserva updated_at (gatilho da tabela desligado so na transacao)`
  `PASS: todos os 21 casos medidos` (EXIT=0, zero FAIL). Saída completa em .tmp/test-green.txt.
- inventário: `node scripts/ci/check-test-inventory.mjs` não cita mais o meu teste; restam 4 órfãos pré-existentes da base (department-invite-contract-audit-vocabulary, talkx-conversion-defaults, team-chat-media-contract, team-direct-conversation-race) — não são regressão deste cartão.

## O que NÃO fiz e por quê
- Não alterei o RPC nem as migrations (trouxe verbatim quem já as entregou).
- Não enfraqueci, pulei nem aumentei timeout de asserção; as 5 do critério continuam medindo a view.
- Dependência registrada: depende de t_e295a21f (N-117) e do X140, que seguem sem integração na branch do dia.
