Especialista: senior (area-front-hooks)

## Pontos da recusa

Ponto 1: a entrega anterior trazia 97.630 caracteres e apagava o módulo inteiro. Corrigi reduzindo o refazer ao que é necessário para tirar Campanhas Clássicas do app roteado e manter documentação/inventário sincronizados com o CI.
- `src/pages/ViewRouter.tsx` e `src/pages/lazyViews.ts`: retirei a rota pública `campaigns`.
- `src/services/navigation.service.ts`, `src/components/mobile/MobileHeader.tsx`, `src/components/mobile/MobileShell.tsx`, `src/hooks/ui/usePrefetchOnHover.ts` e `src/hooks/communication/index.ts`: retirei menu, atalhos, prefetch e export que levavam para `campaigns`.
- `e2e/navegacao-modulos.spec.ts`: ajustei a lista esperada porque o pedido original retira esse módulo; a cobertura ficou no contrato novo `tests/contracts/no-campaigns-classicas.contract.test.ts`, que falha se menu, rota, prefetch, FAB móvel, barrel export ou registro voltarem a expor `campaigns`.
- `FEATURE_REGISTRY.md` e `docs/COMPLETE_SYSTEM_FEATURES.md`: sincronizei o inventário para o estado real; Talk X é a rota ativa de Campanhas e o registro deixou de listar `campaigns`.
- Escopo deliberadamente pequeno: os arquivos legados de `src/components/campaigns/**` seguem fora do app roteado, evitando repetir o diff enorme recusado.

Teste que prova:
- Vermelho antes: `bunx vitest run --config vitest.contracts.config.ts tests/contracts/no-campaigns-classicas.contract.test.ts` com o código antigo → `Test Files 1 failed (1); Tests 2 failed (2)` em `.tmp/no-campaigns-red-final.log`.
- Verde depois: o mesmo comando → `Test Files 1 passed (1); Tests 2 passed (2)`.

## Arquivos do diff

.tmp/relato.md
FEATURE_REGISTRY.md
docs/COMPLETE_SYSTEM_FEATURES.md
e2e/navegacao-modulos.spec.ts
src/components/mobile/MobileHeader.tsx
src/components/mobile/MobileShell.tsx
src/hooks/communication/index.ts
src/hooks/ui/usePrefetchOnHover.ts
src/pages/ViewRouter.tsx
src/pages/lazyViews.ts
src/services/navigation.service.ts
tests/contracts/no-campaigns-classicas.contract.test.ts

## Verificações executadas com resultado limpo

- `git diff --stat dia/2026-10-11...HEAD` → 12 files changed, 68 insertions(+), 32 deletions(-).
- `git diff dia/2026-10-11...HEAD | wc -c` → 15748.
- `git diff --check dia/2026-10-11...HEAD` → saída vazia.
- `bunx vitest run --config vitest.contracts.config.ts tests/contracts/no-campaigns-classicas.contract.test.ts` → `Test Files 1 passed (1); Tests 2 passed (2)`.
- `node --test scripts/ci/docs-estado-registry-convention.unit.mjs` → `tests 11; pass 11; fail 0`.
- `node --test scripts/ci/complete-system-features-doc.unit.mjs` → `tests 7; pass 7; fail 0`.
