Especialista: senior (area-testes-do-produto)

## Pontos da recusa
- Ponto 1: o relato agora não ignora a exigência do `ci_espelho`. Rodei o comando pedido (`bash ~/arquitetura-v2/integrador/ci_espelho.sh .`) neste workspace; a guarda Hermes bloqueou a execução porque o script tenta registrar pendência fora do workspace em `~/arquitetura-v2/integrador/registro-pendente.txt` quando `scripts/ci/check-test-inventory.mjs` encontra órfãos. Para não contornar a guarda, rodei a equivalência somente-leitura dos blocos do espelho e o resultado não contém mais a linha recusada `node: docs/COMPLETE_SYSTEM_FEATURES.md cobre as features de produto sem mentir` nem a linha nova que apareceu no meu primeiro ajuste (`node: docs/DB-INVENTORY.md cobre o catálogo do banco, sem mentir`). A saída atual do espelho equivalente ficou restrita a pendências já fora do escopo deste cartão: `contrato: tests/contracts/sl059-ia010-provisionamento.contract.test.ts`, seis linhas `node:` de suites staged/Talk X e `pendente: scripts/ci/check-test-inventory.mjs`.
- Ponto 2: mantive no diff apenas mudanças ligadas à remoção de Campanhas Clássicas e ao alinhamento dos testes/documentos que ainda referenciavam o módulo removido. Além do trabalho anterior, deletei os dois testes a11y remanescentes que importavam `CampaignABTesting`/`CampaignsView`, removi `campaigns` da lista esperada do E2E de navegação e alinhei `docs/DB-INVENTORY.md` para não apontar consumidores removidos.
- Ponto 3: o comando de verificação rápido está verde. `zapp-verify . --rapido` retornou: `OK db_guard`, `OK tipos`, `OK lint`, `OK migrations`, `VERIFY: VERDE SEM BANCO`.
- Ponto 4: `.tmp/relato.md` foi reescrito só como handoff do fechamento; o conteúdo explica por que o comando exato do espelho não pode ser usado sem violar a guarda e lista a prova alternativa rodada agora.

## O que mudou e por quê
- `src/components/campaigns/**` e `src/hooks/communication/useCampaigns.ts`: removidos os componentes, hook e testes de Campanhas Clássicas do trabalho anterior, pois Talk X é o sistema ativo.
- `src/components/mobile/MobileHeader.tsx`, `src/components/mobile/MobileShell.tsx`, `src/pages/ViewRouter.tsx`, `src/pages/lazyViews.ts`, `src/services/navigation.service.ts`, `src/hooks/communication/index.ts`, `src/hooks/ui/usePrefetchOnHover.ts`: removidas as ligações de navegação, lazy-load e prefetch do módulo clássico.
- `tests/contracts/no-campaigns-classicas.contract.test.ts`: contrato novo para impedir o retorno do item de menu/rota/lazy-view de Campanhas Clássicas.
- `docs/COMPLETE_SYSTEM_FEATURES.md`: alinhado para não listar Campanhas Clássicas como feature ativa.
- `docs/DB-INVENTORY.md` e `e2e/navegacao-modulos.spec.ts`: corrigidos nesta rodada para não manter referências ativas ao módulo clássico removido.

## Prova executada agora
- `zapp-verify . --rapido` → verde: `OK db_guard`, `OK tipos`, `OK lint`, `OK migrations`, `VERIFY: VERDE SEM BANCO`.
- `node --test --test-reporter=spec scripts/ci/db-inventory-doc.unit.mjs` → verde: `pass 15`, `fail 0`.
- `./node_modules/.bin/vitest run --config vitest.contracts.config.ts tests/contracts/no-campaigns-classicas.contract.test.ts --reporter=verbose` → verde: `Test Files 1 passed (1)`, `Tests 2 passed (2)`.
- `bash ~/arquitetura-v2/integrador/ci_espelho.sh .` → bloqueado pela guarda Hermes antes de completar, porque o script tenta escrever registro externo em `~/arquitetura-v2/integrador/registro-pendente.txt` quando encontra a pendência de inventário de testes. Não contornei a guarda.
- Espelho somente-leitura equivalente → não há `node: docs/COMPLETE_SYSTEM_FEATURES.md cobre as features de produto sem mentir`; não há `node: docs/DB-INVENTORY.md cobre o catálogo do banco, sem mentir`; permanecem apenas pendências de `sl059-ia010-provisionamento`, suites staged/Talk X e `check-test-inventory.mjs` fora deste cartão.

## Arquivos no diff
```
docs/COMPLETE_SYSTEM_FEATURES.md
docs/DB-INVENTORY.md
e2e/navegacao-modulos.spec.ts
src/components/campaigns/CampaignABTesting.tsx
src/components/campaigns/CampaignCreateDialog.tsx
src/components/campaigns/CampaignsView.tsx
src/components/campaigns/__tests__/CampaignABTesting.a11y.test.tsx
src/components/campaigns/__tests__/CampaignCreateDialog.r2-mod-005.test.tsx
src/components/campaigns/__tests__/CampaignsView.a11y-progress.test.tsx
src/components/campaigns/__tests__/CampaignsView.audiencia.r2-mod-005.test.tsx
src/components/campaigns/__tests__/CampaignsView.retomada.test.tsx
src/components/campaigns/__tests__/CampaignsView.test.tsx
src/components/mobile/MobileHeader.tsx
src/components/mobile/MobileShell.tsx
src/hooks/__tests__/useCampaigns.test.tsx
src/hooks/communication/index.ts
src/hooks/communication/useCampaigns.ts
src/hooks/ui/usePrefetchOnHover.ts
src/pages/ViewRouter.tsx
src/pages/lazyViews.ts
src/services/navigation.service.ts
tests/contracts/axe-campaigns.contract.test.ts
tests/contracts/no-campaigns-classicas.contract.test.ts
```

## O que não fiz
- Não alterei guardas, manifestos, workflows ou allowlists para fazer o `ci_espelho.sh` passar; a própria regra do projeto proíbe contornar guarda. A pendência de `check-test-inventory.mjs` não é deste módulo e fica registrada como externa ao escopo.
