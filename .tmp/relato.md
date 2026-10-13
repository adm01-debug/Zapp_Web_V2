Especialista: Edgar (area-edge-api)

## O que mudou e por quê

Cartão `[refazer]`: a entrega do pai (t_f534a210, branch da entrega @ 41782aaca) quebra o
espelho do CI no item `contrato: tests/contracts/requireauth-network-policy.contract.test.ts`
quando empilhada sobre a ponta do dia. Parti da entrega por cherry-pick (commits `a1fc5fe75`,
`4ec8af77a`, `41782aaca`), sem recomeçar.

Causa: a entrega acrescentou, em `supabase/functions/_shared/validation.ts`, a leitura de
`profiles.is_active` dentro de `requireAuth` (R2-AUTH-004), DEPOIS da política de rede e ANTES
de devolver `{ userId }`. A entrega atualizou os testes de Deno das Edges (stub de `fetch` para
`profiles?select=is_active`), mas deixou desalinhado o contrato de vitest: os testes do caminho
permitido injetam `getUser` + `policyRpc` e NÃO injetam `getProfileActive`, então o `requireAuth`
caía no client `service_role` real, indisponível offline, e devolvia 503 no lugar de `{ userId }`.

Correção (só o teste do contrato, sem afrouxar asserção):

- `tests/contracts/requireauth-network-policy.contract.test.ts`: novo helper `activeProfile()`
  que injeta um lookup fake de `profiles.is_active` = ativo e registra os `user_id` consultados.
  Injetado em `getProfileActive` nos três testes que chegam ao caminho permitido (devolve
  `{ userId }`, orçamento default da RPC e orçamento sobreposto). No teste "preserva o caminho
  permitido" acrescentei a asserção `expect(profile.calls).toEqual(['user-1'])`, que prova que a
  trava lê o perfil pelo `user_id` autenticado — nenhuma asserção existente foi relaxada.

Nenhuma linha de produção mudou; o diff é exclusivamente o teste do contrato.

## Prova

- vermelho antes (entrega empilhada, sem a minha mudança):
  `npx vitest run --config vitest.contracts.config.ts requireauth-network-policy`
  → `Tests  1 failed | 15 passed (16)` — erro:
  `expected Response { status: 503, ... } to deeply equal { userId: 'user-1' }`
  (linha 164, no teste "preserva o caminho permitido").
- verde depois:
  `./node_modules/.bin/vitest run --config vitest.contracts.config.ts --reporter=dot`
  → `Test Files  89 passed (89)` ; `Tests  1379 passed (1379)`.
- `zapp-verify . --rapido` → `VERIFY: VERDE SEM BANCO (142s)`.
- sha da correção: `dbd630b84` (cherry-pick da entrega: `a1fc5fe75` `4ec8af77a` `41782aaca`).

## O que NÃO fiz e por quê

- Não rodei `ci_espelho.sh`: o `HERMES-GUARD` bloqueia a execução do script (classifica
  `~/arquitetura-v2/integrador/ci_espelho.sh` como ferramenta do Hermes) — relatei o bloqueio em
  vez de contornar. Rodei exatamente o passo que o espelho usa para contratos
  (`vitest run --config vitest.contracts.config.ts --reporter=dot`, com o grep de `FAIL`), que é o
  item do cartão, e ele sai sem nenhum `FAIL`.
- Não toquei em produção, RPC, policy nem em `validation.ts`. Não afrouxei asserção alguma.
