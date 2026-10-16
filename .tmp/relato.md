Especialista: worker (sql) (area-sql-banco)

# [retomar] fixture do talkx-monitor-panel (N-117) — conferência na ponta atual: nada a corrigir, fecho SEM commit de código

## O que a conferência no código ATUAL mostrou
O pedido original é corrigir a fixture de `scripts/db-audit/talkx-monitor-panel.test.sh` para a
RPC `public.talkx_monitor_panel(...)` ler a view `talkx_engine_health`. Na ponta do dia
(`dia/2026-10-15`, este workspace) **nem o teste, nem a RPC, nem a migration existem** — logo o
defeito não é reproduzível aqui e não há fixture para corrigir.

## Prova (comandos colados, rodados agora neste workspace)
- `git ls-files scripts/db-audit/ | grep -c "monitor-panel"` → `0`
  (o arquivo do escopo não está na ponta; a branch anterior é a única que o tem)
- `ls supabase/migrations/ | grep -ci "monitor_panel\|engine_health"` → `0`
- `git grep -c talkx_monitor_panel -- supabase | wc -l` → `0` (nenhum arquivo em `supabase/`)
- `grep -c "talkx-monitor-panel" .github/workflows/db-guard.yml` → `0` (nunca foi registrado no CI)
- `src/components/talkx/tracking/talkxHealth.ts:4-5` registra isso em texto: "worker vindo de
  `health.worker_state` da RPC `talkx_monitor_panel`. Essa RPC ainda NÃO existe
  (`git grep talkx_monitor_panel -- supabase` = 0)"
- o próprio teste anterior declara a dependência em `scripts/db-audit/talkx-monitor-panel.test.sh:15-16`:
  `supabase/migrations/20261010060000_talkx_monitor_panel.sql` e
  `.../20261010085230_talkx_monitor_panel_engine_health.sql` — nenhuma das duas na ponta. Sem elas o
  teste para em `FAIL: migration ausente` (é o que o relato anterior já registrava).

FAIXA DO PAI: nenhum commit trazido por cherry-pick. O diff da branch anterior é só
`A scripts/db-audit/talkx-monitor-panel.test.sh` + `.tmp/relato.md`; trouxe-la agora criaria um
`.test.sh` órfão no inventário do CI.

## Por que NÃO commitei o teste antigo
`node scripts/ci/check-test-inventory.mjs` → `Total: 6 teste(s) órfão(s)`; um
`scripts/db-audit/talkx-monitor-panel.test.sh` viraria o 7º órfão (não há glob para `.test.sh`, só
citação nominal no workflow), e `.github/workflows/db-guard.yml` está fora do HARD SCOPE do cartão
(arquivo do dono do workflow). Um teste que não pode rodar nem registrar-se é exatamente o
"quebra o ESPELHO DO CI" anotado no motivo da retirada. Não criei `supabase/tests/*.sql` alternativo:
o cartão fixa o arquivo e o objeto testado (a RPC) não existe para ser exercitado.

## Prova de que a superfície equivalente na ponta está coberta e verde
- `bash scripts/db-audit/talkx-engine-health.test.sh` (registrado em `db-guard.yml:769`) → todos os
  `[PASS]`, terminando em `[OK] Talk X X033 + P2 #119: log por destinatario (sem telefone/texto,
  expurgo 30d), view de saude security_invoker, alertas com deduplicacao por tipo/campanha e
  fechamento automatico; cron_degraded abre com 1 job startup timeout na execucao mais recente ou
  >=5 falhas seguidas (...) e fecha sozinho.`

## O que NÃO fiz e por quê
- NÃO trouxe os commits da branch anterior: os dois arquivos de migration que o teste exige
  (`20261010060000_*`, `20261010085230_*`) não estão na ponta e são fora do escopo; sem eles o teste
  não roda e vira órfão no CI.
- NÃO editei a RPC, a migration nem `db-guard.yml`/`check-test-inventory.mjs` (fora do HARD SCOPE).
- NÃO restaurei cobertura no lugar: o objeto do pedido (RPC `talkx_monitor_panel`) não existe.

## Encaminhamento (para o dono do cartão / próximo cartão)
Este trabalho só volta a ter objeto quando entrar na ponta o cartão do painel (X140 / N-117 motor
health) com as migrations `20261010060000_talkx_monitor_panel.sql` e
`20261010085230_talkx_monitor_panel_engine_health.sql` e, junto, o registro do teste no workflow
(dono do `db-guard.yml`). Até lá, o correto é não reabrir este cartão.
