Especialista: Íris (area-front-componentes)

## Motivo registrado (retomar) e como resolvi
A entrega anterior removeu o módulo corretamente, mas deixou dois inventários de documentação
citando os arquivos apagados — o que deixou vermelhos três testes de CI. Resolvi os três:

- `COMPLETE_SYSTEM_FEATURES.md não cita arquivo de código que não existe` —
  `docs/COMPLETE_SYSTEM_FEATURES.md` §40 ("Links de Pagamento") citava
  `src/components/payments/PaymentLinksView.tsx` e `src/hooks/payments/usePaymentLinks.ts`
  (ambos apagados no cartão). Reescrevi a seção (§40 continua existindo, é uma das 14 seções
  exigidas pela guarda) para registrar que o módulo foi removido em 2026-10-11 e que a rota
  `?view=payments` não existe mais. Nenhum token de arquivo inexistente sobra no trecho.
- `FEATURE_REGISTRY.md lista exatamente as views do ViewRouter` —
  `FEATURE_REGISTRY.md` ainda tinha a linha da view `payments` (removida do `ViewRouter`).
  Apaguei a linha e sincronizei o cabeçalho (55 → 54 views) e os totais (Full 43 → 42; total 55 → 54).
- `FEATURE_REGISTRY.md descreve componente, arquivo e classificação reais` —
  mesma linha `payments` apontava para componente/arquivo inexistentes; resolvido ao remover a linha.

Trouxe os dois commits anteriores por `git cherry-pick` (4efc86fa0 remoção do módulo; c992848d1
ajuste de `docs/DB-INVENTORY.md`) e ajustei só a documentação de inventário.

## O que mudou e por quê
- `src/components/payments/` (pasta) — apagada; era só CRUD de links que nunca processou pagamento.
- `src/hooks/payments/` (pasta) — apagada; hook exclusivo da tela removida.
- `src/pages/ViewRouter.tsx` — removida a entrada `'payments'`.
- `src/pages/lazyViews.ts` — removido o registro lazy do `PaymentLinksView`.
- `src/services/navigation.service.ts` — removido o item de menu "Pagamentos".
- `src/services/__tests__/navigation.service.test.ts` — atualizado o teste de navegação que esperava `payments`.
- `docs/DB-INVENTORY.md` — `payment_links` marcada como parcial (sem uso pelo front).
- `docs/COMPLETE_SYSTEM_FEATURES.md`, `FEATURE_REGISTRY.md` — inventários sincronizados com a remoção.

## Critério de pronto
1. "Pagamentos" fora do menu/rotas — `navigation.service.ts` e `ViewRouter.tsx` sem a entrada; teste de
   navegação ajustado.
2. `git grep -rn "PaymentLinksView\|usePaymentLinks" -- src` → sem ocorrência viva em `src`.
3. Nenhum teste virou `it.skip`: sobrou só a atualização do teste de navegação; o restante da suíte passou.
4. Verificação verde (abaixo).

## Prova
- vermelho antes: `node --test scripts/ci/complete-system-features-doc.unit.mjs scripts/ci/docs-estado-registry-convention.unit.mjs`
  → `✖ COMPLETE_SYSTEM_FEATURES.md não cita arquivo de código que não existe` (actual `['src/components/payments/PaymentLinksView.tsx','src/hooks/payments/usePaymentLinks.ts']`);
  `✖ FEATURE_REGISTRY.md lista exatamente as views do ViewRouter` (`55 !== 54`);
  `✖ FEATURE_REGISTRY.md descreve componente, arquivo e classificação reais` (`payments` está no registro mas não no ViewRouter).
- verde depois: `node --test scripts/ci/complete-system-features-doc.unit.mjs scripts/ci/docs-estado-registry-convention.unit.mjs`
  → `tests 18 / pass 18 / fail 0`.
- `zapp-verify full .` → `OK testes`, `OK build`, `VERIFY: VERDE SEM BANCO` (exit 0).

## O que NÃO fiz e por quê
- Não toquei na tabela `payment_links` nem em `meta_capi_events` (fora de escopo, decisão separada).
- Não toquei no módulo "Meta CAPI" nem no "Calendário" (fora de escopo).
- Referências históricas a `PaymentLinksView` em auditorias/reconciliation (datadas, sem guarda) ficaram como estão.
