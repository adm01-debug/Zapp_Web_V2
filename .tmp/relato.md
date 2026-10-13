Especialista: complexo (area-front-hooks)
## O que mudou e por quê
- `src/components/talkx/__tests__/RuleValueInput.test.tsx`: isolamento de rota entre testes (afterEach restaura a URL, já estava no workspace) + folga de mount só neste teste (`vi.setConfig({ testTimeout: 20000 })` e `ESPERA_MOUNT = { timeout: 15000 }` nos `findBy` do mount; clique no filtro via `findByRole`). Motivo: duas causas combinadas — vazamento de `mode=new` na URL entre testes e mount da árvore TalkX inteira que pode passar de 5 s sob carga. Componente, `setup.ts` e asserções intactos.
## Prova
- vermelho antes: `npx vitest run src/components/talkx/__tests__/RuleValueInput.test.tsx` → `Unable to find ... 'Em breve'` com `asyncUtilTimeout: 5000` (erro do cartão).
- verde depois: `npx vitest run src/components/talkx/__tests__/RuleValueInput.test.tsx` → `Test Files 1 passed (1); Tests 5 passed (5)` — 3 vezes seguidas pelo executor Claude Code nesta sessão, mais 1 vez por mim agora.
- `zapp-verify . --rapido` → VERDE (db_guard, tipos, lint e migrations passaram; banco_local=AVISO, esperado pois o cartão só mexe em teste de front, sem migration).
## O que NÃO fiz e por quê
- Não toquei no componente nem no fluxo do construtor (restrição do cartão); não removi asserções; sem mock do componente sob teste.
- Código escrito pelo Claude Code (plano da casa); eu preparei o workspace, conferi o diff (só o arquivo do cartão) e a prova.
