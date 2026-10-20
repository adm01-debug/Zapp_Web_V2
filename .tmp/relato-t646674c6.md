Especialista: hugo
## O que mudou e por quê
- ESTADO.md:73: ancora de `create-user` de `src/components/admin/useAdminData.ts:256` para `:334` e `:341`. A entrega anterior trocou o fetch cru por `invokeEdge('create-user', body)` e a ancora ficou numa linha (`max_chats`) sem a edge, quebrando o ESPELHO DO CI. As linhas :334 (primeira chamada) e :341 (repeticao apos refresh de sessao) contem `await invokeEdge('create-user', body);` na ponta dia/2026-10-14 (o cartao RLS 9e98ea0e2, integrado depois, deslocou +4 em relacao ao workspace).
## Prova
- vermelho antes: `node --test scripts/ci/docs-estado-registry-convention.unit.mjs` → `not ok 2 - ESTADO.md cita só âncoras reais, e cada âncora contém a própria edge` (`# fail 2`)
- verde depois (cheque fiel a ponta: useAdminData.ts da ponta + ESTADO.md corrigido): mesmo comando → `ok 2 - ESTADO.md cita só âncoras reais, e cada âncora contém a própria edge` (`# pass 10`, `# fail 1`); arquivo do workspace restaurado em seguida (`git status` limpo)
- sem regressao de area: `npx vitest run src/components/admin/__tests__/useAdminDataCreateUser.test.ts` → `Test Files 1 passed (1)` `Tests 8 passed (8)`
- criterio de pronto 3: `zapp-verify . --rapido` → `VERIFY: VERDE SEM BANCO (12s)`, EXIT=0
- simulacao com a guarda reconhecendo `invokeEdge` (temporaria, revertida, fora do diff): 11/11 (`# pass 11`, `# fail 0`)
## Pontos da recusa
- Ponto 1 (ESPELHO DO CI, ancora): resolvido — ESTADO.md:73 agora cita `:334` e `:341`, linhas que contem `create-user` na ponta. Prova: `ok 2` acima.
## O que NAO fiz e por quê
- NAO alterei `scripts/ci/docs-estado-registry-convention.unit.mjs`: o item restante (`ESTADO.md publica o grupo...`, `grupo de create-user divergiu ... 'A' !== 'E'`) vem da guarda antiga nao reconhecer o wrapper `invokeEdge` que o pedido original manda usar; a correcao da guarda e do cartao irmao PE-16 (commit ceb1304bf0, nao integrado). Alterar guarda para passar e duplicar diff alheio e proibido.
- NAO recomecei o codigo: `useAdminData.ts` ja esta integrado em dia/2026-10-14 (66713e9510); so a ancora estava desalinhada.
## Arquivos do diff (entrega anterior...HEAD)
ESTADO.md
