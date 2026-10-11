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

## Pontos do revisor
- Ponto 1: parti do commit da entrega com `git cherry-pick 34d28aa08^..3e83d2e68` (os 3 commits da branch da
  entrega, na ordem; o `3e83d2e68` sozinho depende dos 2 anteriores) — viraram `e5aff764f`, `e4550eb8d`,
  `9ef70ef18`; não recomecei nada.
- Ponto 2: reproduzi sobre a ponta atual de `dia/2026-10-11` e a causa era a entrada obsoleta do baseline:
  `node scripts/db-audit/supabase-usage-guard.mjs` → `Entradas obsoletas no baseline ... rpc:talkx_campaign_window_open:supabase/functions/talkx-scheduler/index.ts` → `EXIT=1`.
  Corrigi em `scripts/db-audit/known-violations.json` (chave removida de `known`, movida para `_resolvido`),
  sem afrouxar asserção nenhuma; a outra chave de baseline continua em `known`.
- Ponto 3: provei o mesmo comando VERDE (`node scripts/db-audit/supabase-usage-guard.mjs` → `OK: nenhuma
  violacao nova.` → `EXIT=0`) e `zapp-verify . --rapido` → `VERIFY: VERDE SEM BANCO (98s)` → `EXIT=0`;
  sha da ponta `d54d86c1c`.

## Avisos do juiz automático (não são falha de verificação)
- “não achei teste no diff”: o teste é a própria guarda de CI, que é o item do cartão —
  `node scripts/db-audit/supabase-usage-guard.mjs` falha (EXIT=1) sobre a base com o pacote empilhado e passa
  (EXIT=0) depois da correção; remover uma entrada obsoleta de `known` não tem unidade para um teste novo, e o
  teste unitário da projeção da guarda (`scripts/ci/supabase-usage-guard-forward-projection.unit.mjs`) já existe e
  passou.
- “LOOP sem LIMIT nem teto por chamada” na migration do cherry-pick: não procede. Os 3 `LOOP` da migration têm
  teto explícito ANTES do `FOR` — linhas 48-51 (`jsonb_array_length(p_weekdays) > 32` → RAISE), 197-201
  (`jsonb_array_length(v_dnd_holidays) > 366` → RETURN) e 314-317 (`jsonb_array_length(... -> 'days') > 32` →
  v_invalid := true) — e o de feriados ainda tem `EXIT` no `IF v_holiday = v_today`. Esse teto veio da própria
  entrega (commits `e4550eb8d`/`9ef70ef18`); o aviso lê o `LOOP` e não o limite que o precede.

CONCLUÍ.
