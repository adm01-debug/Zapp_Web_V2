Especialista: senior (area-testes-do-produto)

[refazer 1] reconcilia-instâncias-órfãs — corrige a quebra da régua N217 do CI

Causa raiz: o `deno test` que a régua N217 roda (COM type-check, sem
--no-check, Deno 2.9.5 igual ao CI) morria com 2 erros TS2339 em
`supabase/functions/_shared/__tests__/evolution-control-authz.test.ts`
(`.status` acessado na união `EvolutionAuthzDecision` sem narrowing).
Sem testes, sem coverage ("No coverage files found") → os 2 testes N217
falhavam. O erro da linha 90 já existia na base dia/2026-10-14; o da linha
102 (teste novo do reconcile-instances) acendeu com este cartão. A entrega
anterior usou `--no-check` manual e não viu.

Ponto 1 da recusa — N217 docs bate com medição fresca e segunda execução idêntica:
mudei `docs/audits/edge-functions-authz-coverage.md` regenerando com a
ferramenta oficial (`REGENERAR_EDGE_AUTHZ_COV=1 node
scripts/ci/edge-coverage-authz.unit.mjs`): evolution-control-authz.ts
137/137 → 134/134 (100%), Total 255/305 83.6% → 252/302 83.4%.
Teste que prova: `N217: docs bate com medição fresca e segunda execução é
idêntica` — antes ✖ (`deno coverage falhou: No coverage files found`),
depois ✔ (1017ms).

Ponto 2 da recusa — N217 medição do zero via deno agrega >= 50% e inclui os 5 helpers:
mudei `supabase/functions/_shared/__tests__/evolution-control-authz.test.ts`
(2 trechos, seguindo o narrowing que o próprio arquivo já usa):
(a) no teste "leituras SEM tela consumidora", troquei a ordem para
`assert(!denied.allowed)` antes de `assertEquals(denied.status, 403)`;
(b) no teste novo do reconcile-instances, `decideControlAuthz(false)` foi
para `const negado` + `assert(!negado.allowed)` antes do `.status`.
Zero mudança de runtime; nenhuma asserção removida ou afrouxada.
Teste que prova: `N217: medição do zero via deno agrega >= 50% e inclui os
5 helpers` — antes ✖ (mesmo erro de coverage), depois ✔ (1004ms).
Comando da recusa, direto: `deno test --config scripts/ci/deno.json
--frozen --allow-env --allow-read --allow-net=127.0.0.1
supabase/functions/_shared/__tests__/evolution-control-authz.test.ts` —
antes 2 erros TS2339 (linhas 90 e 102), depois 11 passed / 0 failed.

Observação do revisor (comentário impreciso): mudei o comentário de
`reconcile-instances` em
`supabase/functions/_shared/evolution-control-authz.ts` — dizia "mesmo
escopo de admin/supervisor de list-instances"; list-instances é READ.
Agora diz que, ao contrário de list-instances (read com consumidor no
front), reconcile enxerga TODAS as conexões e por isso fica em CONTROL.
Só comentário; prova: os 45 testes dos 5 arquivos da régua passam.

Não-regressão ao lado: `deno test` (com type-check) em
`supabase/functions/evolution-api/index.test.ts` → 32 passed / 0 failed.

Arquivos (diff contra a entrega recusada 963f135464; patch em ENTREGA.patch,
53 linhas, aplicar com `git apply` sobre o branch
v2/reconcilia-instancias-orfas-26101407070e2f):
- supabase/functions/_shared/__tests__/evolution-control-authz.test.ts
- supabase/functions/_shared/evolution-control-authz.ts (só comentário)
- docs/audits/edge-functions-authz-coverage.md (regenerado pela ferramenta)

Comandos e resultados reais (Deno 2.9.5, o mesmo do CI):
- `node --test scripts/ci/edge-coverage-authz.unit.mjs` no estado recusado:
  6 pass / 2 fail (os 2 N217 da recusa).
- Mesmo comando após o fix: 8 pass / 0 fail (rodado 2x, verde nas 2).
- `deno test` nos 5 arquivos da régua: 45 passed / 0 failed.
- `deno test` no handler evolution-api/index.test.ts: 32 passed / 0 failed.
- Não rodei `zapp-verify --rapido` (workspace parcial da era congelada, sem
  node_modules): o diff não toca código de runtime, migration, nem config de
  lint/tipos — só teste, comentário e docs regenerado; type-check real (deno,
  o mesmo do CI) passa.

Era congelada: sem commit e sem `hermes-tarefa-fechar`. Trabalho em
`~/hermes-workspaces/Zapp_Web_V2/_refazer1-t_de93c341-reconcilia-orfas/`
(ENTREGA.patch + este RELATO.md + .tmp/relato.md).
