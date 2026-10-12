Especialista: worker (hooks) — executado por Íris (area-front-componentes)

## O que mudou e por quê
- Nenhum arquivo de código foi alterado (diff vazio). O cartão manda: "se já estiver resolvida, escreva a prova (comando + saída) em .tmp/relato.md e feche SEM commit de código".
- Conferi o defeito na ponta ATUAL (dia/2026-10-12): a dívida de typecheck/implicit-any NÃO existe mais. Os dois pontos do commit anterior (`v2/sl-140-2610082108e72b` @ 9393b5b66) já foram reescritos/limpos na ponta por outros cartões, então não houve cherry-pick nem rebase de código.

Arquivos citados pelo pedido (ThemeCustomizer, PresetCard, presets.ts, contact.service.ts): limpos — o ratchet de implicit-any é repo-wide e devolve 0, e `tsc -b --force` fecha com rc 0. Não toquei em nenhum deles.

Situação dos dois arquivos que o commit antigo ajustava, no código ATUAL:
- src/hooks/calls/__tests__/useTerminoRemoto.test.tsx: linhas 143-144 já trazem as anotações `(linha: unknown[])` no `.filter`/`.map` de `warnSpy.mock.calls` (os 2 TS7006 que o commit antigo corrigia).
- src/components/settings/theme/__tests__/presets.test.ts: linhas 381-388 já leem `gradient-success` via `diversity.light as unknown as Record<string, string>` (os 2 TS2551 do `tsconfig.strict.json`).

## Prova
- vermelho antes: dívida RECONHECIDA apenas no commit antigo (9393b5b66, 08/10). Na ponta atual não há vermelho a reproduzir; o valor a provar é que os gates já estão verdes.
- verde depois (ponta atual, rodado agora no workspace):
  - `node scripts/ci/implicit-any-ratchet.mjs` → `implicit-any errors: 0 (baseline: 0)` (rc 0)
  - `node scripts/ci/typecheck-ratchet.mjs` → `Typecheck ratchet: baseline=0, atual=0, removidas=0, novas=0` + `OK: nenhum novo erro de tipo foi introduzido.` (rc 0)
  - `bun run typecheck` (`tsc -b --force`) → rc 0
  - `npx vitest run src/components/settings/theme/__tests__/presets.test.ts src/hooks/calls/__tests__/useTerminoRemoto.test.tsx` → `Test Files 2 passed (2); Tests 119 passed (119)`

## Como resolvi o motivo do [retomar]
- Conflito com dia/2026-10-12: não havia alteração de código a rebasear, porque o defeito já está fechado na ponta atual. Preservei integralmente o que entrou nela (diff vazio) e fecho sem commit.

## O que NÃO fiz e por quê
- Não cherry-piquei 9393b5b66: suas duas mudanças já estão superadas na ponta (os arquivos foram reescritos por cartões posteriores). Aplicar o commit antigo reintroduziria texto conflitante sem necessidade.
- Não criei teste novo: não há comportamento novo; a prova é o próprio gate de CI (implicit-any-ratchet + typecheck-ratchet + tsc) verde na ponta.

## Critério de pronto
- Lacuna provada como já resolvida com os gates e os testes acima; `zapp-verify . --rapido` roda no fechar.
