Especialista: worker (testes) (area-testes-do-produto)

## Resultado: o defeito do pedido JÁ ESTÁ CORRIGIDO na ponta de dia/2026-10-12 — fecho SEM commit de código (como o cartão manda)

Antes de mexer, conferi o código ATUAL de dia/2026-10-12 (a ponta do meu workspace). Os dois
arquivos do cartão já têm, integrados, exatamente o que o PEDIDO ORIGINAL pedia:

- playwright.config.ts: existe o projeto hermético dedicado `chromium-telefonia`
  (`testMatch: /telefonia\.spec\.ts/`, `use: { ...devices['Desktop Chrome'], storageState:
  { cookies: [], origins: [] } }` — sessão salva VAZIA declarada no projeto, sem
  `dependencies: ['setup']`) e o projeto catch-all `chromium-authenticated` lista
  `telefonia\.spec\.ts` no `testIgnore` — a spec não roda no projeto que faz login REAL (guarda R1).
  Veio do commit 523255b95 (`test(e2e): telefonia hermética sem valor sensível no diff`), ancestral
  de HEAD, e o mesmo conteúdo do trabalho anterior que este cartão manda trazer.
- e2e/telefonia.spec.ts: a versão de HEAD é a do trabalho anterior já ADAPTADA e mais completa —
  mesma lista de testes (discador/botão bloqueado, número incompleto, E.164 com o nono, DDI +55,
  teclado e foco, histórico vazio, histórico semeado, ligar do painel) MAIS o ajuste ao C02
  (`fix(telefonia): isola diálogo de saída do app`, 09/10), que trocou o caminho antigo `?view=voip`
  pelo evento `zapp:start-call` real. O `afterEach` real contra rede proibida está lá (lê
  `ambienteAtual.registro.redeBarrada` e os sockets `.supabase.co` de TODO teste que monta ambiente),
  e a guarda de rede é genérica (`*.supabase.co`), sem o identificador do banco real no diff.

Ou seja: trazer o commit do trabalho anterior seria reintroduzir uma versão mais antiga (sem o C02)
por cima da que já entrou — o conflito registrado pelo Claude é justamente porque a entrega já está
na ponta. Por isso não commitei nada: `git diff --stat` está VAZIO e `git status --short` limpo.

Esta decisão substitui o limite de 1 arquivo do t_c294da87: o coordenador autorizou 2 arquivos
(spec + projeto dedicado no config) e é exatamente esse par que já está na ponta.

## Prova (executada agora, nesta ponta)

- 3 rodadas seguidas da spec pelo projeto DEDICADO `chromium-telefonia`
  (`npx playwright test --project=chromium-telefonia e2e/telefonia.spec.ts`), todas no MESMO comando do cartão:
  - rodada 1: `1 skipped` / `8 passed (39.6s)`
  - rodada 2: `1 skipped` / `8 passed (42.9s)`
  - rodada 3: `1 skipped` / `8 passed (55.2s)`
  (o `1 skipped` é o `test.fixme` do defeito fora do Brasil, listado abaixo — nenhuma rodada falhou.)
- `npx playwright test --list e2e/telefonia.spec.ts` → `Total: 27 tests in 1 file`; as 9 entradas
  `[... :190:3 ...]` da spec aparecem sob o projeto dedicado `chromium-telefonia` (e só sob os três
  projetos `*-telefonia`, nunca sob `chromium-authenticated`).
- `zapp-verify . --rapido` → `VERIFY: VERDE SEM BANCO (152s)` (db_guard, tipos, lint, migrations OK).
- CÓDIGO: `git diff --stat dia/2026-10-12 HEAD -- e2e/telefonia.spec.ts playwright.config.ts` → VAZIO
  (nenhuma mudança de código nesta entrega). O ÚNICO arquivo versionado por este branch é
  `.tmp/relato.md` — o relato do fechamento, arquivo de fábrica já versionado nesta ponta (mesmo
  padrão do commit do retomar do SL-092, `62230859b`): `git diff --stat dia/2026-10-12 HEAD` mostra
  só `.tmp/relato.md`. `git status --short` → limpo.

## test.fixme existentes na spec (1 de verdade, 0 test.skip)

- `e2e/telefonia.spec.ts:250` — `test.fixme('número fora do Brasil não é aceito (defeito medido: +1… vira +55)')`
  com o motivo escrito no corpo: `normalizeE164BR` (`src/lib/calls/phone.ts`) só conhece a forma
  brasileira e apresenta número dos EUA como `+55 (14) 15555-2671`; a spec NÃO pode ficar verde nesse
  caso enquanto o produto não decidir se disca fora do Brasil. É defeito de código de produto, fora
  dos arquivos permitidos — vira este `fixme` listado, como o cartão manda.
- `e2e/telefonia.spec.ts:116` — apenas MENÇÃO a `test.fixme` dentro do comentário do `afterEach`
  ("teste pulado não monta ambiente e não é conferido aqui"); não é um teste pulado.

## O que NÃO fiz e por quê

- Não commitei: o cartão manda "se já foi corrigido ... feche sem commit de código" e o diff de HEAD
  já contém o pedido inteiro.
- Não toquei em guarda R1, fixtures, código de produto, migrations nem outros testes.
- Não usei sessão salva, credencial real, fixture real, banco remoto, URL real ou chamada de telefonia.
