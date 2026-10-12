Especialista: senior (area-edge-api)

## Refazer: motivo da recusa
Ponto 1: a entrega anterior criava a edge `recover-message-media`, mas deixava os inventários derivados fora de sincronia no empilhamento do CI: `ESTADO.md` não listava a edge e `supabase/deployment-manifest.json` ficava stale.

## O que mudei
- `ESTADO.md`: incluí `recover-message-media` como edge órfã (grupo E), atualizei o total do cabeçalho, o total por grupo, a linha da tabela e a lista de órfãs.
- `supabase/deployment-manifest.json`: regenerei pelo gerador oficial `node scripts/edge-deploy/generate-manifest.mjs`, acrescentando a função, o source file, os totais e o hash do manifesto.
- Mantive o código de produção e os testes da entrega anterior (`supabase/functions/recover-message-media/index.ts` e `index.test.ts`) sem mudança semântica.
- `ESTADO.md` e `supabase/deployment-manifest.json` não estavam na lista original de arquivos tocáveis, mas são indispensáveis para corrigir exatamente a recusa: a falha citada é o espelho do CI/inventário stale causado pela nova Edge Function.

## Prova por ponto
Ponto 1 — vermelho antes:
- `node --test scripts/ci/docs-estado-registry-convention.unit.mjs` no estado da entrega anterior falhou com:
  - `AssertionError [ERR_ASSERTION]: ESTADO.md não tem linha para a edge \`recover-message-media\` (rode a guarda de novo)`
  - `80 !== 81` em `total de edges do cabeçalho do ESTADO.md bate com a tabela`
- `node scripts/edge-deploy/generate-manifest.mjs --check` no estado da entrega anterior falhou com:
  - `Deployment manifest is stale: supabase/deployment-manifest.json. Run generate-manifest.mjs.`

Ponto 1 — verde depois:
- `node --test scripts/ci/docs-estado-registry-convention.unit.mjs` -> `tests 11`, `pass 11`, `fail 0`, `duration_ms 36586.685077`.
- `node scripts/edge-deploy/generate-manifest.mjs --check` -> `Edge manifest OK: 81 functions, 161 source files, sha256=9f7ef3cd192d2a993a85abcc467a927065fc95e7cae563b7315d0a238e038287`.
- `deno test --config scripts/ci/deno.json --frozen --allow-env --allow-read supabase/functions/recover-message-media/index.test.ts` -> verde.
- `zapp-verify full .` com a correção aplicada -> `VERIFY: VERDE SEM BANCO (942s) — o banco NÃO foi verificado; registros em /home/joaquim_ataides/.local/state/zapp-verify/7326c84ba336`.

Observação de reprodução do `full`: eu também reverti localmente apenas o commit de inventários (`git revert --no-commit e0bc3979f`) para tentar cumprir literalmente o vermelho via `zapp-verify full .`; neste runner local o comando retornou verde mesmo no estado sem a correção (`VERIFY: VERDE SEM BANCO (1632s)`). Por isso a falha foi reproduzida no espelho de CI específico citado na recusa (`scripts/ci/docs-estado-registry-convention.unit.mjs`) e no check do manifesto, e o `full` fica registrado como prova verde final.

## Arquivos no diff
```
.tmp/relato.md
ESTADO.md
supabase/deployment-manifest.json
supabase/functions/recover-message-media/index.test.ts
supabase/functions/recover-message-media/index.ts
```

## Fatos medidos do diff
- 5 arquivos no diff.
- 1 arquivo de teste no diff: `supabase/functions/recover-message-media/index.test.ts`.
- 14 casos de teste novos/alterados medidos pelo juiz automático do fechamento.

## Commits
```
84b5b3de7 fix(edge): trata falhas em recover-message-media
e0bc3979f fix(edge): sincroniza inventarios da recover-message-media
074dfbc4f chore(relato): documenta refazer recover-message-media
```

## Verificações executadas
- `node --test scripts/ci/docs-estado-registry-convention.unit.mjs` -> verde (`pass 11`, `fail 0`).
- `node scripts/edge-deploy/generate-manifest.mjs --check` -> verde (`Edge manifest OK: 81 functions, 161 source files`).
- `deno test --config scripts/ci/deno.json --frozen --allow-env --allow-read supabase/functions/recover-message-media/index.test.ts` -> verde.
- `zapp-verify full .` -> verde sem banco (`VERIFY: VERDE SEM BANCO (942s)`).
- `git diff --stat dia/2026-10-11...HEAD` -> 5 arquivos: `.tmp/relato.md`, `ESTADO.md`, `supabase/deployment-manifest.json`, `supabase/functions/recover-message-media/index.test.ts`, `supabase/functions/recover-message-media/index.ts`.

## O que não fiz
- Não alterei regras de negócio da edge além do commit anterior reaplicado por cherry-pick.
- Não mexi em banco, produção, deploy, push ou PR.
