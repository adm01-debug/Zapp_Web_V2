Especialista: Íris (area-front-componentes)

## O que mudou e por quê
Esta é uma RETOMADA: a entrega do pedido original já existia (branch `v2/pagamentos-remover-modulo-26101016534368`, commit 430802478) e a [refazer] t_dc033852 já havia diagnosticado e corrigido a causa da falha na verificação. Reproduzi a falha por inteiro e trouxe os dois commits para o workspace novo, sobre `dia/2026-10-11`:
- `git cherry-pick 45d9c525e` (== 430802478): remove `src/components/payments/` (PaymentLinksView.tsx) e `src/hooks/payments/` (usePaymentLinks.ts), tira a entrada `'payments': Views.PaymentLinksView` de `src/pages/ViewRouter.tsx`, o lazy-load em `src/pages/lazyViews.ts`, o item "Pagamentos" de `src/services/navigation.service.ts` e ajusta `src/services/__tests__/navigation.service.test.ts` (a entrada esperada de pagamentos saiu; nenhum `it.skip` foi criado).
- `git cherry-pick 3c896eb11`: correção da CAUSA da falha — o espelho do CI `node: docs/DB-INVENTORY.md cobre o catálogo do banco, sem mentir` (`scripts/ci/db-inventory-doc.unit.mjs`). Com o módulo removido, `docs/DB-INVENTORY.md` ainda marcava `payment_links` como `ativo` e apontava o consumidor `src/hooks/payments/usePaymentLinks.ts`, que deixa de existir. O commit muda a linha da tabela para `parcial` e troca o consumidor morto pelo único que resta (`scripts/db-audit/global-guards-regression.test.mjs`), e alinha `docs/COMPLETE_SYSTEM_FEATURES.md`. Não houve mudança de código nesta etapa: só o documento-espelho que o CI confere.

## Prova
- vermelho antes (só o cherry-pick do código, sem a correção do espelho): `node --test scripts/ci/db-inventory-doc.unit.mjs` → `ℹ pass 14  ℹ fail 1` com `AssertionError: "payment_links" está como "ativo", mas o repositório diz "parcial"; "payment_links" lista "src/hooks/payments/usePaymentLinks.ts", que não existe no repositório`.
- verde depois (com a correção): `node --test scripts/ci/db-inventory-doc.unit.mjs` → `ℹ pass 15  ℹ fail 0`.
- suíte completa (o comando que o cartão pede): `zapp-verify full .` → `Test Files  1215 passed (1215)` / `Tests  11037 passed | 25 expected fail | 14 todo (11076)` e `VERIFY: VERDE SEM BANCO (994s)`; `OK dependencias/db_guard/tipos/lint/migrations/testes/build`.
- critério 4 no comando exato: `zapp-verify . --rapido` → `VERIFY: VERDE SEM BANCO (11s)`.

## Critério de pronto
1. "Pagamentos" fora do menu e das rotas: `git grep -ni "pagamentos\|'payments'\|"payments"" -- src/services/navigation.service.ts src/pages/ViewRouter.tsx src/pages/lazyViews.ts` → sem resultado (exit 1).
2. `git grep -rn "PaymentLinksView\|usePaymentLinks" -- src` → sem resultado (exit 1).
3. Nenhum teste quebrado no resto da suíte: `zapp-verify full .` verde (acima); nenhum `it.skip`/`test.skip` novo.
4. `zapp-verify . --rapido` verde (acima).

## O que NÃO fiz e por quê
- Não mexi em `payment_links` (banco) nem em `meta_capi_events`/"Meta CAPI" nem no "Calendário": fora de escopo, como o pedido original determina.
- Não criei teste novo de comportamento da remoção: o cartão pede remoção e que a suíte não quebre; a prova de que o espelho do CI voltou a bater é o próprio teste do CI (`db-inventory-doc.unit.mjs`) que eu fiz vermelho→verde.
- Ajustei `docs/DB-INVENTORY.md` e `docs/COMPLETE_SYSTEM_FEATURES.md`, que não estão na lista "ARQUIVOS QUE PODE TOCAR" do pedido original: são exatamente a correção que o próprio corpo da retomada aponta como causa da falha ("quebra o ESPELHO DO CI… correção em t_dc033852"). Sem esse ajuste o CI volta a reprovar.
