Especialista: iris (area-front-componentes)

## Motivo do [retomar] — resolvido: o pedido já está no código atual (concluí)

O cartão veio porque a branch da tarefa conflitava com `dia/2026-10-14`. O workspace foi aberto já sobre a ponta
atual do dia, o arquivo do cartão é IDÊNTICO ao da ponta e o pedido do cartão está atendido no código ATUAL.
Portanto: nenhum código a trazer, nenhum conflito a resolver, nenhum arquivo de código tocado — fechei sem commit
de código, exatamente como o cartão manda para o caso "já foi corrigido".

- workspace: branch `v2/rulevalueinput-timeout-5s-261016025374f3`, commit-base `d723a90107` = ponta de
  `dia/2026-10-16` (`git for-each-ref --sort=-refname refs/heads/dia/` → `dia/2026-10-16 d723a90107`).
- `git diff dia/2026-10-16 HEAD~1 --stat` → VAZIO; `git status --short` → VAZIO antes do commit do relato.
- `git merge-base --is-ancestor 9ec2c74b363 dia/2026-10-14` → SIM (o fix já entrou no dia).
- O único commit desta entrega é o do relato (`git diff --stat dia/2026-10-16 HEAD` → `.tmp/relato.md`).
- Trabalho anterior citado pelo cartão (branch `v2/rulevalueinput-timeout-5s-261013004171a3`, `fc4ebe63f`):
  `git show --stat fc4ebe63f` → `.tmp/relato.md | 1 +` — era só uma linha de relato, sem código para cherry-pickar.

## Causa raiz do defeito do pedido original — e onde ela já está corrigida

`findBy*` do Testing Library espera por condição com teto de 1000 ms (padrão da lib). Sob carga, a montagem da árvore
TalkX inteira passa desse teto e o teste estourava com "Unable to find role=button name 'Novo segmento'". O arquivo
traz as duas defesas pedidas no PASSO 2, mais o isolamento entre os casos:

- `src/components/talkx/__tests__/RuleValueInput.test.tsx:94` — `vi.setConfig({ testTimeout: 20000 })` (o `it` com teto de 20000 ms).
- `src/components/talkx/__tests__/RuleValueInput.test.tsx:95` — `const ESPERA_MOUNT = { timeout: 15000 }`, aplicado nos
  `findByRole` de mount (`:109`, `:111`, `:112`).
- `src/components/talkx/__tests__/RuleValueInput.test.tsx:140-142` — `afterEach` limpa a rota
  (`window.history.replaceState(null, '', '/')`), o isolamento entre os casos.
- `src/test/setup.ts:152` — `configure({ asyncUtilTimeout: 5000 })`; `vitest.config.ts:15` — `testTimeout: 15000`.

Quem trouxe isso: commit `9ec2c74b363` ("test(talkx): prova estável da correção (RuleValueInput) — 3 verdes +
zapp-verify", 13/10/2026), confirmado ancestral de `dia/2026-10-14`.

## Asserção original intacta (Lead score e Risco de churn desabilitados)

`src/components/talkx/__tests__/RuleValueInput.test.tsx:238-242` — o caso `"em breve": Lead score e Risco de churn
ficam desabilitados no catálogo` mantém `expect(leadScore).toBeDisabled()`, `expect(risco).toBeDisabled()`,
`toHaveTextContent('em breve')` nos dois e `expect(screen.queryByLabelText('Valor da condição')).toBeNull()` depois
do clique. Sem `skip`/`only` e sem asserção afrouxada: o arquivo do cartão não aparece no `git diff --stat` desta
entrega, ou seja, o teste provado aqui é o mesmo que já estava no dia.

## Prova — comandos rodados agora, com a linha de resultado

verde (3 execuções seguidas, um vitest por vez):

    $ npx vitest run src/components/talkx/__tests__/RuleValueInput.test.tsx
    run1  Test Files 1 passed (1); Tests 10 passed (10)  — Duration 10.30s
    run2  Test Files 1 passed (1); Tests 10 passed (10)  — Duration  8.62s
    run3  Test Files 1 passed (1); Tests 10 passed (10)  — Duration  9.15s

verde sob carga (três vitest do MESMO arquivo simultâneos, o cenário do cartão):

    $ printf '1\n2\n3\n' | xargs -P 3 -I% npx vitest run src/components/talkx/__tests__/RuleValueInput.test.tsx \
        --reporter=json --outputFile=/tmp/rvc-%.json
    run1 success=True; tests 10; passed 10; failed 0
    run2 success=True; tests 10; passed 10; failed 0
    run3 success=True; tests 10; passed 10; failed 0

verificação do dia:

    $ zapp-verify . --rapido
    OK db_guard 0s | OK tipos 326s | OK lint 0s | OK migrations 1s
    VERIFY: VERDE SEM BANCO (327s)

## Varredura (PASSO 4 do cartão) — outros testes da mesma pasta com o mesmo risco

Todos em `src/components/talkx/__tests__/`, montam a árvore TalkX pesada (`TalkXView`) e não têm teto maior nem
`vi.setConfig`; a contagem é de `findBy*` que param no `asyncUtilTimeout` de 5 s (`src/test/setup.ts:152`):

- `TalkXView.route.test.tsx` — 27 `findBy*` na View real (maior risco da pasta).
- `TalkXView.templates.test.tsx` — 7 `findBy*`.
- `TalkXView.carregamento.test.tsx` — 6 `findBy*`.
- `TalkXView.whatsapp-band.test.tsx` — 4 `findBy*`.
- `TalkXView.ajuda-teclado.test.tsx` — 3 `findBy*`.
- `TalkXView.section-error-boundary.test.tsx` — 2 `findBy*`.
- `TalkXOverview.states.test.tsx` — monta a View sem `findBy*` (risco baixo).

`RuleValueInput.test.tsx` é o único arquivo da pasta com teto maior hoje. O PASSO 4 manda corrigir só quando a
mudança é de 1 linha; nos seis acima o teto entra caso a caso, junto da revisão dos `findBy` de cada um, então a
lista acima é a entrega do passo e o assunto segue registrado em comentário neste cartão para virar cartão próprio.

## Escopo

`git diff --stat dia/2026-10-16 HEAD` = `.tmp/relato.md` (1 arquivo, o relato). Nenhum arquivo de
`src/components/talkx/**`, nenhum `src/test/**`, nenhum `vitest.config.ts` foi tocado nesta entrega.