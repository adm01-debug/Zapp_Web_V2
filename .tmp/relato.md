Especialista: Íris (area-front-componentes) — cartão de acompanhamento da remoção do módulo de pagamentos (pai 430802478)

## O que mudou e por quê
- docs/DB-INVENTORY.md: a linha do objeto `payment_links` saiu de `ativo` (com 2 consumidores) para `parcial` (1 consumidor: `scripts/db-audit/global-guards-regression.test.mjs`). Depois da remoção do módulo, nenhum código de produto cita a tabela e o `src/hooks/payments/usePaymentLinks.ts` citado deixou de existir — a doc mentia nos três pontos que o teste acusa.
- docs/COMPLETE_SYSTEM_FEATURES.md: a seção 40 "Links de Pagamento" deixou de citar os arquivos removidos (`src/components/payments/PaymentLinksView.tsx` e `src/hooks/payments/usePaymentLinks.ts`) e a tela removida, mantendo o título da seção e registrando a remoção com a data.

## Prova
- vermelho antes: `node --test --test-reporter=tap scripts/ci/db-inventory-doc.unit.mjs` → `not ok 3 - docs/DB-INVENTORY.md cobre o catálogo do banco, sem mentir` / `"payment_links" está como "ativo", mas o repositório diz "parcial"` + `lista "src/hooks/payments/usePaymentLinks.ts", que não existe no repositório`
- vermelho antes: `node --test --test-reporter=tap scripts/ci/complete-system-features-doc.unit.mjs` → `not ok 7 - COMPLETE_SYSTEM_FEATURES.md não cita arquivo de código que não existe` / `o documento cita arquivos que não existem: src/components/payments/PaymentLinksView.tsx, src/hooks/payments/usePaymentLinks.ts`
- verde depois: `node --test --test-reporter=tap scripts/ci/db-inventory-doc.unit.mjs scripts/ci/complete-system-features-doc.unit.mjs` → `# pass 22` `# fail 0`
- verde depois: `zapp-verify . --rapido` → `VERIFY: VERDE SEM BANCO (87s)`
- verde depois: `npx vitest run src/services/__tests__/navigation.service.test.ts` → `Test Files 1 passed (1); Tests 15 passed (15)` (confere que o empilhamento do pai segue verde)

## Pontos do revisor
- Ponto 1: a entrega do pai (430802478) deixou o ESPELHO DO CI reprovando `node: docs/DB-INVENTORY.md cobre o catálogo do banco, sem mentir`, por apontar `payment_links` como `ativo` e citar `usePaymentLinks.ts`, removido. Corrigido em `docs/DB-INVENTORY.md` (status `parcial`, consumidor existente). A mesma remoção derrubava `COMPLETE_SYSTEM_FEATURES.md não cita arquivo de código que não existe` (seção 40 citava os dois arquivos removidos): corrigido no mesmo commit. Nenhuma asserção de teste foi tocada.

## O que NÃO fiz e por quê
- Não rodei `~/arquitetura-v2/integrador/ci_espelho.sh`: a guarda bloqueia executar script de `~/arquitetura-v2` a partir deste workspace (`HERMES-GUARD: mexer nas guardas/ferramentas do Hermes…`). Rodei o mesmo comando `node --test` do espelho direto (linha dos testes node do espião).
- Restam 8 falhas nesse comando, todas anteriores/ambientais e sem ligação com a entrega (`grep -c 'payment|ViewRouter|lazyViews|navigation.service'` = 0 nos três arquivos): 6 do `scripts/ci/lint-ratchet.unit.mjs` porque a guarda bloqueia o `git init` que o próprio fixture do teste roda (`HERMES-GUARD (git): git init é proibido nesta sessão`), e 2 do contrato `scripts/db-audit/talkx-schedule-timezone-contract.test.mjs` (janela de entrega do Talk X, assunto de outra área). Nenhuma nasceu deste diff.
- Não toquei nos documentos históricos de auditoria que ainda citam o módulo (`docs/audits/…`, `docs/plans/…`, `docs/handoffs/…`, relatórios datados e JSONs de reconciliação): são recortes datados, fora do escopo do título e não cobertos por guarda de CI. Registrado em comentário no cartão.
