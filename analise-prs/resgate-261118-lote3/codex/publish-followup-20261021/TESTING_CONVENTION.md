# TESTING_CONVENTION.md — onde cada teste mora e como ele roda

Convenção de testes do Zapp Web V2 na ponta do dia `dia/2026-10-08`. O objetivo é
responder, para qualquer teste novo, **onde ele mora e qual comando o executa** — sem
descobrir isso lendo o `package.json` e o `ci.yml`.

Há **cinco camadas**. Cada uma tem seu runner, seu diretório e seu motivo de existir.

## 1. Testes de unidade/componente do app — `src/`

* Moram em `src/`, como `*.test.ts(x)`/`*.spec.ts(x)` perto do código ou em
  `src/**/__tests__/` (exemplo real: `src/adapters/__tests__/evolutionAdapter.test.ts`
  cobre `src/adapters/evolutionAdapter.ts`).
* Runner: **Vitest** com ambiente `jsdom` e `setupFiles: ['./src/test/setup.ts']`
  (`vitest.config.ts`, `include: ['src/**/*.{test,spec}.{ts,tsx}']`, `testTimeout: 15000`).
* Comando: `bun run test` (alias de `vitest run`). Cobertura: `bun run test:coverage`
  (pisos em `vitest.config.ts`; ratchet — o piso só sobe).
* É esta a suíte que o portão local da fábrica (`zapp-verify`, sem `--rapido`) executa,
  via `zapp-db-guard run -- bun run test`.

## 2. Contratos das Edge Functions — `tests/contracts/`

* Todo arquivo do diretório é `*.test.ts` (predomina o sufixo
  `*.contract.test.ts`).
* Runner: **Vitest em `environment: 'node'`**, por uma config própria,
  `vitest.contracts.config.ts` (`include: ['tests/contracts/**/*.test.ts']`). A config
  existe também para reescrever o import Deno `https://esm.sh/zod@3.23.8` do
  `_shared/schemas.ts` para o alias `zod3` — o fonte continua igual e o Deno em produção
  segue resolvendo a URL.
* Comando: `bun run test:contracts` (alias de
  `vitest run --config vitest.contracts.config.ts`).
* Vive fora de `src/` de propósito: contrato do servidor roda em Node, não em jsdom.

## 3. Testes Deno das próprias edges — `supabase/functions/**/*.test.ts`

* Moram dentro da pasta da edge (`supabase/functions/<edge>/index.test.ts`) e importam o
  handler direto.
* Runner: **Deno**, com a config `scripts/ci/deno.json` e lock próprio.
* Execução manual da suíte completa (não é um gate do CI mínimo atual):
  `deno test --config scripts/ci/deno.json --frozen --allow-env --allow-read --allow-net=127.0.0.1 $(git ls-files 'supabase/functions/**/*.test.ts')`.
* No CI mínimo, o job `Node CI Scripts` instala Deno 2.9.5 e executa
  `node --test scripts/ci/*.unit.mjs scripts/vercel/*.unit.mjs`. A guarda
  `scripts/ci/edge-coverage-authz.unit.mjs` invoca Deno para testar somente os cinco
  arquivos de autorização listados nela e recalcular a régua de cobertura. O CI mínimo
  não executa todos os testes de Edge nem `deno check`.

## 4. Guardas de CI e de deploy — `scripts/**/*.unit.mjs`

* Moram em `scripts/ci/`, `scripts/vercel/`, `scripts/edge-deploy/`, `scripts/talkx/`, `scripts/db-audit/`
  (as suites extras seguem padrão próprio; em `db-audit` há também contratos `.test.mjs`).
* Runner: **`node:test`** (nativo), sem framework. Predomina `*.unit.mjs`, mas a CI
  mínima **não** roda os contratos `.test.mjs` de `scripts/db-audit/`.
* CI mínima, job "Node CI Scripts":
  `node --test scripts/ci/*.unit.mjs scripts/vercel/*.unit.mjs`.
* CI do banco, workflow `db-guard.yml`: roda
  `node --test scripts/db-audit/*.test.mjs` e os testes SQL/Docker declarados
  individualmente nesse workflow. Não confundir os dois gates.
* Guarda de documentação entra aqui: quando um doc afirma algo do código, o teste lê os
  dois lados e falha se divergirem (ex.: `scripts/ci/dashboard-readme-drift.unit.mjs`).
* Rodar um só: `node --test scripts/ci/<arquivo>.unit.mjs` ou `node --test scripts/vercel/<arquivo>.unit.mjs`.

## 5. E2E no navegador — `e2e/`

* Moram em `e2e/`, specs `*.spec.ts`; fixtures e helpers em `e2e/fixtures/` e `e2e/support/`.
* Runner: **Playwright** (`playwright.config.ts`; `bun run test:e2e`).
* **Regra R1 (obrigatória):** E2E autenticado roda SÓ contra o **banco local**, com usuário
  sintético criado localmente. É proibido usar a URL/credencial de produção, reaproveitar
  `e2e/.auth/*` de outra sessão, rodar o projeto `chromium-authenticated` fora disso, ou
  subir o app com `--mode production`. Fixture "real" de produção não é fixture.
* **Quarentena com prazo:** um spec quebrado e adiado entra em `e2e/quarantine.js`, com
  `spec`, `motivo`, `issue` e `prazo` (`AAAA-MM-DD`). O verificador
  `scripts/ci/check-quarantine.mjs` recusa item sem forma completa e **derruba o CI** quando
  o prazo vence. Quarentena sem prazo é `skip` com outro nome.

## Regras de nome e de escolha

| Quero testar | Onde crio | Runner |
|---|---|---|
| Lógica/componente do app | `src/…/<arquivo>.test.ts(x)` ou `src/…/__tests__/` | Vitest (jsdom) |
| Contrato de handler de Edge | `tests/contracts/<assunto>.contract.test.ts` | Vitest (node) |
| Handler Deno no próprio runtime | `supabase/functions/<edge>/index.test.ts` | Deno |
| Guarda de CI, doc ou deploy | `scripts/<área>/<nome>.unit.mjs` | `node --test` |
| Fluxo no navegador | `e2e/<fluxo>.spec.ts` | Playwright |

* Nome do arquivo diz o que ele é: `.test.ts`/`.spec.ts` = suíte de código;
  `.unit.mjs` = guarda executável de CI. Em scripts, o passo da CI varre
  `scripts/ci/*.unit.mjs` e `scripts/vercel/*.unit.mjs` no gate mínimo; os gates
  de deploy e banco têm comandos próprios, declarados nos workflows correspondentes.
* Teste que prova correção de defeito nasce **vermelho** e fica verde com a correção; teste
  que não falha sem a correção não prova nada.
* Nada de produção: nenhuma camada acima aponta para banco, edge ou segredo de produção.
  Dado de cliente não entra em fixture — use amostra sintética.

## Portão local (fora do repositório)

`zapp-verify <cópia>` roda, nesta ordem: trava contra produção, `db_guard`, tipos
(`typecheck-ratchet`), lint (`lint-ratchet`), migrations (`check-migration-drift`) e — só
sem `--rapido` — `bun run test` e `bun run build`. `zapp-verify . --rapido` é a checagem a
cada edição; ele **pula** unidade e build, então não substitui a suíte completa.

As camadas 3, 4 e 5 **não** entram no `zapp-verify`. O CI mínimo (`.github/workflows/ci.yml`)
roda as guardas Node, incluindo a medição Deno restrita de autorização; não executa a suíte
Deno completa. O E2E tem job próprio, com os projetos e ambiente definidos no workflow.
