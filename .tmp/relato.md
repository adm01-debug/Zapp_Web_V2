Especialista: worker (sql) (area-sql-banco)

## O que mudou e por quê
- Cherry-pick da entrega do t_74b04330 (fid 26101022034b24): os 3 commits da branch da entrega, na ordem
  `34d28aa08`, `8c57417a3`, `3e83d2e68` (o `3e83d2e68` sozinho só traz 5 linhas de teto de loop — ele
  depende dos 2 commits anteriores que criam a migration de 891 linhas; por isso o intervalo
  `34d28aa08^..3e83d2e68`, não o commit solto). Resultado: `e5aff764f`, `e4550eb8d`, `9ef70ef18`.
- `scripts/db-audit/known-violations.json`: removida a chave `rpc:talkx_campaign_window_open:supabase/functions/talkx-scheduler/index.ts`
  do baseline `known`. Causa da quebra do espelho: a migration `20261011000003_20261010_talkx_campaigns_dnd_weekdays.sql`
  agora CRIA `public.talkx_campaign_window_open`, então o alvo passa a existir na projeção forward-only do
  `supabase-usage-guard.mjs`; o call-site em `supabase/functions/talkx-scheduler/index.ts` deixa de ser violação
  e a entrada do ratchet fica obsoleta → o guard falha pedindo a remoção (“Entradas obsoletas no baseline”).
  O próprio `_comment` do arquivo já mandava remover esta chave assim que a migration entrasse em `dia/`
  (NOTA 2026-10-11, t_7457095e). A entrada foi movida para `_resolvido` e a NOTA retirada do `_comment`.
  Nenhuma asserção do guard foi afrouxada: só a linha obsoleta saiu; a outra chave de baseline
  (`rpc:set_default_whatsapp_connection`) continua em `known` e continua sendo violação contada.

## Prova
- vermelho antes (guarda sem a correção): `node scripts/db-audit/supabase-usage-guard.mjs` →
  `Entradas obsoletas no baseline (a violacao sumiu - remova-as): rpc:talkx_campaign_window_open:supabase/functions/talkx-scheduler/index.ts` → `EXIT=1`
- verde depois (mesmo comando): `node scripts/db-audit/supabase-usage-guard.mjs` →
  `Violacoes totais: 1 | no baseline: 1 | novas: 0` / `OK: nenhuma violacao nova.` → `EXIT=0`
- etapa de guardas do espelho (as mesmas 6 do ci_espelho.sh), item do cartão verde:
  `node scripts/db-audit/supabase-usage-guard.mjs` → `rc=0` (os outros: workflow-pins 0, pr-workflow-secrets 0,
  e2e-artifact-secrets 0; check-test-inventory rc=1 e implicit-any rc=2 por causas pré-existentes/ambientais —
  este último é “TypeScript local nao encontrado” com o `node_modules` do workspace, não é do diff)
- `zapp-verify . --rapido` → `OK db_guard / tipos / lint / migrations` e `VERIFY: VERDE SEM BANCO (98s)` → `EXIT=0`
- teste unitário do próprio guard: `scripts/ci/supabase-usage-guard-forward-projection.unit.mjs` — passou (não aparece
  em nenhum `not ok`)

## O que NÃO fiz e por quê
- Não rodei o wrapper `bash ~/arquitetura-v2/integrador/ci_espelho.sh .`: a guarda do Hermes bloqueia
  executar/copiar esse arquivo (HERMES-GUARD, “mexer nas guardas/ferramentas do Hermes é proibido”). Repliquei
  os passos do espelho à mão (os 6 scripts de guarda + `node --test` dos `.unit.mjs/.test.mjs` + `vitest` de
  contratos). Os `not ok` que apareceram em `node --test` (lint-ratchet `--staged` e talkx-scheduler-contract)
  e o `contrato: tests/contracts/sl059-ia010-provisionamento.contract.test.ts` não têm relação com o meu diff
  (que só toca `known-violations.json` e a migration do cherry-pick) e já reprovam na base — nenhum deles lê o
  baseline de violações.
- Não alterei a migration nem a edge function: a causa era só a entrada obsoleta do baseline.
- SHA da ponta: `d54d86c1c` (branch `v2/refazer-talkx-campaign-window-cast-jsonb-26101117058513`).

CONCLUÍ.
