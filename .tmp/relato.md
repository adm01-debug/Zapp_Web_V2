Especialista: iris (area-front-componentes)

## Motivo do [retomar] e como resolvi (concluí)

O cartão veio porque a branch da tarefa conflitava com `dia/2026-10-14` e o trabalho não podia se perder.
Não havia conflito a resolver nem código a trazer: o workspace foi aberto já sobre a ponta atual do dia e o
pedido do cartão está resolvido no código ATUAL. Concluí sem commit de código, como o cartão manda.

- workspace: branch `v2/rulevalueinput-timeout-5s-261016025374f3` @ `d723a90107`, que é a ponta de
  `dia/2026-10-16` (`git for-each-ref --sort=-refname refs/heads/dia/` → `dia/2026-10-16 d723a90107`).
- `git diff dia/2026-10-16 HEAD` → VAZIO; `git diff dia/2026-10-16 HEAD -- src/components/talkx/__tests__/RuleValueInput.test.tsx`
  → VAZIO (o arquivo do cartão é IDÊNTICO ao da ponta do dia); `git status --short` → VAZIO (nada pendente).
- `git merge-base --is-ancestor 9ec2c74b363 dia/2026-10-14` → SIM.
- O trabalho anterior (branch `v2/rulevalueinput-timeout-5s-261013004171a3`, `fc4ebe63f`) era só a linha de
  relato (`git show --stat fc4ebe63f` → `.tmp/relato.md | 1 +`): não havia código para cherry-pickar.

## Causa raiz do defeito do pedido original (já corrigida no código atual)

`findBy*` do Testing Library espera por condição com teto de 1000 ms (padrão da lib). Sob carga, a montagem da
árvore TalkX inteira passa desse teto e o teste estourava com "Unable to find role=button name 'Novo segmento'".
O arquivo já traz as duas defesas que o cartão pede, mais o isolamento entre os casos:

- `src/components/talkx/__tests__/RuleValueInput.test.tsx:94` — `vi.setConfig({ testTimeout: 20000 })` (o `it` com teto de 20000 ms).
- `src/components/talkx/__tests__/RuleValueInput.test.tsx:95` — `const ESPERA_MOUNT = { timeout: 15000 }`, usado nos
  `findByRole` de mount (`:109`, `:111`, `:112`).
- `src/components/talkx/__tests__/RuleValueInput.test.tsx:140-142` — `afterEach` limpa a rota
  (`window.history.replaceState(null, '', '/')`), o isolamento entre os casos.
- `src/test/setup.ts:152` — `configure({ asyncUtilTimeout: 5000 })`; `vitest.config.ts:15` — `testTimeout: 15000`.

Quem trouxe isso: commit `9ec2c74b363` ("test(talkx): prova estável da correção (RuleValueInput) — 3 verdes +
zapp-verify", 13/10/2026), ancestral de `dia/2026-10-14`.

## Asserção original intacta (Lead score e Risco de churn desabilitados)

`src/components/talkx/__tests__/RuleValueInput.test.tsx:238-242` — o caso `"em breve": Lead score e Risco de churn
ficam desabilitados no catálogo` segue com `expect(leadScore).toBeDisabled()`, `expect(risco).toBeDisabled()`,
`toHaveTextContent('em breve')` nos dois e `expect(screen.queryByLabelText('Valor da condição')).toBeNull()` depois do
clique. Nenhum `skip`/`only` novo: o arquivo do cartão não aparece em `git diff` (diff vazio), ou seja, nada foi
afrouxado nesta entrega.

## Prova (rodado agora neste workspace)

Três execuções seguidas, um vitest por vez:

    for i in 1 2 3; do npx vitest run src/components/talkx/__tests__/RuleValueInput.test.tsx; done
    run1  Test Files  1 passed (1)   Tests  10 passed (10)   Duration  10.30s  (tests 4.16s)
    run2  Test Files  1 passed (1)   Tests  10 passed (10)   Duration   8.62s  (tests 3.93s)
    run3  Test Files  1 passed (1)   Tests  10 passed (10)   Duration   9.15s  (tests 3.64s)

Sob carga (três vitest do MESMO arquivo ao mesmo tempo, o cenário do cartão):

    printf '1\n2\n3\n' | xargs -P 3 -I% npx vitest run src/components/talkx/__tests__/RuleValueInput.test.tsx \
      --reporter=json --outputFile=/tmp/rvc-%.json
    run1 success=True  tests=10  passed=10  failed=0
    run2 success=True  tests=10  passed=10  failed=0
    run3 success=True  tests=10  passed=10  failed=0

Verificação do dia:

    zapp-verify . --rapido
    OK db_guard 0s / OK tipos 326s / OK lint 0s / OK migrations 1s
    VERIFY: VERDE SEM BANCO (327s)

## Varredura — outros testes da mesma pasta com o mesmo risco (render pesado + teto padrão de 5 s)

Todos em `src/components/talkx/__tests__/`, montam a árvore TalkX pesada (`TalkXView`) e NÃO têm teto maior nem
`vi.setConfig`: contados os `findBy*` que param no `asyncUtilTimeout` de 5 s de `src/test/setup.ts:152`:

- `TalkXView.route.test.tsx` — 27 `findBy*` na View real, sem teto maior (maior risco da pasta).
- `TalkXView.templates.test.tsx` — 7 `findBy*`.
- `TalkXView.carregamento.test.tsx` — 6 `findBy*`.
- `TalkXView.whatsapp-band.test.tsx` — 4 `findBy*`.
- `TalkXView.ajuda-teclado.test.tsx` — 3 `findBy*`.
- `TalkXView.section-error-boundary.test.tsx` — 2 `findBy*`.
- `TalkXOverview.states.test.tsx` — monta a View mas não usa `findBy*` (risco baixo).

Único arquivo da pasta com teto maior hoje: o próprio `RuleValueInput.test.tsx`. Não corrigi os da lista: o cartão
manda corrigir só se a mudança for de 1 linha e o teto desses seis exige revisar os `findBy` de cada caso — fica
como cartão próprio (registrado no comentário deste cartão).

## O que NÃO fiz e por quê

- Nenhum commit de código: o defeito já está corrigido no código atual (`git diff dia/2026-10-16 HEAD` vazio) e o
  cartão manda fechar sem commit de código nesse caso.
- Nada de `skip`/`only` e nenhuma asserção afrouxada: o arquivo do cartão não está em `git diff`.
- Não criei cartão novo a partir daqui (o achado da varredura ficou em comentário, para o coordenador decidir).