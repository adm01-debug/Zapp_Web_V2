Especialista: iris

## O que mudou e por quê (refazer 1 — só o apontado; resto mantido como está)
- `src/components/connections/ConnectionsHealthIndicator.tsx` (l.22, l.135-141): `mountedRef` agora zera de verdade no desmontar via `useEffect` com cleanup (`return () => { mountedRef.current = false; }`), exatamente o trecho que a recusa indicou. Nada mais no componente foi tocado: sem listener global de teclado (regra 2 do cartão), sem dependência nova (regra d), popover continua o Radix com `side="right" align="start"` e `AnimatePresence` com `initial={false}` sob movimento reduzido.
- `src/components/connections/__tests__/ConnectionsHealthIndicator.test.tsx` (l.372-465): +4 testes `[refazer]`, nenhum existente removido, pulado ou afrouxado (os 19 anteriores passam intactos).
- `src/components/layout/Sidebar.tsx` e seu teste: intocados (o teste da Sidebar usa marcador mockado do indicador; 17 testes passam).

## Pontos do revisor
- Ponto 1 (mountedRef nunca virava `false`): resolvido — `ConnectionsHealthIndicator.tsx` l.135-141. Teste: `[refazer] desmonta com reconexão pendente sem atualizar estado depois` (l.430): reconexão pendente + `unmount()` + resolve → nenhum aviso some, nenhum erro `act`/`unmounted` no console, mais asserção de contrato `mountedRef.current = false` no fonte (mesmo padrão do "contrato de fonte" já existente neste arquivo). Nota honesta: a parte comportamental é verde por construção no React 19 (setState pós-desmontagem vira no-op silencioso); a prova da correção é o cleanup, que a asserção de contrato cobre — ela falhava antes da correção.
- Ponto 2 (Enter abrindo o popover e Esc fechando com foco de volta, sem teste): resolvido sem mudar código — o caminho já era todo nativo do Radix e estava correto, faltava a prova. Testes: `[refazer] Enter com foco no gatilho abre o popover` (l.372: gatilho é `<button type="button">` habilitado, recebe foco, tecla Enter despachada sem intercepção e o clique-ação-padrão abre o popover) e `[refazer] Esc fecha o popover e devolve o foco ao gatilho` (l.405: `keyDown Escape` no `role="dialog"` fecha e `trigger()` recupera o foco — caminho real do Radix, sem mock de popover). Bônus pedido no ponto ("se couber"): `[refazer] com movimento reduzido, o popover abre sem deslocamento` (l.419: item da lista com `style.transform` em `['', 'none']`). Nota honesta: o jsdom não implementa a ativação nativa de botão por Enter e o projeto não tem `@testing-library/user-event` (dependência nova proibida pela regra (d)), por isso o teste do Enter despacha a tecla real e em seguida o clique que o navegador emitiria como ação padrão — o caminho JS (zero handlers, regra 2 do cartão) é o que o código possui.

## Prova (saída real dos comandos, nada à mão)
- Vermelho antes (só testes novos, sem a correção): `npx vitest run src/components/connections/__tests__/ConnectionsHealthIndicator.test.tsx -t "refazer"` → `Tests 2 failed | 19 skipped` (FAIL em `aria-disabled` inexistente na primeira versão e no contrato `mountedRef.current = false`; o Enter puro por `keyDown`/`keyUp` também não abre no jsdom — limitação documentada no teste final).
- Verde depois: `npx vitest run src/components/connections/__tests__/ConnectionsHealthIndicator.test.tsx src/components/layout/__tests__/Sidebar.test.tsx` → `Test Files 2 passed (2); Tests 40 passed (40)` (23 do indicador + 17 da Sidebar).
- Tipos: `npx tsc -b --force` → saída vazia, exit 0.
- Lint: `npx eslint` nos 2 arquivos do diff → limpo, exit 0.
- `zapp-verify . --rapido` → `VERIFY: VERDE SEM BANCO (14s)` (OK db_guard/tipos/lint/migrations; AVISO banco_local esperado sem nome de conjunto — o diff não tem migration).

## Arquivos (saída colada de `git diff --name-only`, sem contar de cabeça)
src/components/connections/ConnectionsHealthIndicator.tsx
src/components/connections/__tests__/ConnectionsHealthIndicator.test.tsx

`git diff --stat`: 2 files changed, 110 insertions(+), 4 deletions(-). Sem migration, sem DDL, sem Edge, sem dependência nova.

## O que NÃO fiz e por quê
- Sem `cherry-pick`: o workspace já continha os commits da entrega anterior (`c01bf34eed` + relato); meu diff é só o de cima, conferido contra o título — nada de outro cartão.
- Não alterei o gatilho do popover: cheguei a aplicar `type/disabled/aria-disabled` no `PopoverTrigger`, mas a leitura do cartão mostrou que o ponto 2 real é cobertura de teclado (Enter/Esc), não o trigger — reverti para manter o resto como está.
- Não re-rodei a suite Deno: o `--rapido` não a roda; meu diff é só front (tsx/teste), sem Edge.
