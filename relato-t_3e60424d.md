Especialista: senior (area-testes-do-produto)

## Pontos da recusa

Ponto 1: quebra do ESPELHO DO CI em `FEATURE_REGISTRY.md descreve componente, arquivo e classificação reais`.
- O que mudei: apliquei por `git cherry-pick` o commit recusado `2dbb2cedb` e acrescentei a correção mínima em `FEATURE_REGISTRY.md`: removi a linha órfã da view `campaigns`, ajustei o cabeçalho para 54 views, o total para 54 e o total `Full` para 42. Não alterei a guarda `scripts/ci/docs-estado-registry-convention.unit.mjs` nem afrouxei nenhuma asserção.
- Prova vermelha sem a correção: reverti só `FEATURE_REGISTRY.md` para o estado do commit anterior e rodei `node --test scripts/ci/docs-estado-registry-convention.unit.mjs` → `red_status=1`; falhas: `55 !== 54` e ``campaigns` está no registro mas não no ViewRouter`.
- Prova verde com a correção: restaurei o patch e rodei o mesmo comando → `green_status=0`; `tests 11`, `pass 11`, `fail 0`.
- Prova do espelho: `/usr/bin/bash /home/joaquim_ataides/arquitetura-v2/integrador/ci_espelho.sh .` → exit code 0; a saída listou itens verdes e não voltou a acusar `FEATURE_REGISTRY.md descreve componente, arquivo e classificação reais`.
- Prova pedida no cartão: `zapp-verify full .` → `VERIFY: VERDE SEM BANCO (984s)`; antes disso, uma tentativa sem a correção excedeu o timeout da ferramenta sem produzir conclusão, por isso a reprodução vermelha limpa ficou no teste node exato que o `zapp-verify full` executa.

## Arquivos do diff (`git diff --name-only dia/2026-10-12...HEAD`)
FEATURE_REGISTRY.md
docs/COMPLETE_SYSTEM_FEATURES.md
docs/DB-INVENTORY.md
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

## Verificações executadas
- `node --test scripts/ci/docs-estado-registry-convention.unit.mjs` sem a correção em `FEATURE_REGISTRY.md` → `red_status=1`; `tests 11`, `pass 9`, `fail 2`.
- `node --test scripts/ci/docs-estado-registry-convention.unit.mjs` com a correção → `green_status=0`; `tests 11`, `pass 11`, `fail 0`.
- `/usr/bin/bash /home/joaquim_ataides/arquitetura-v2/integrador/ci_espelho.sh .` → exit code 0.
- `zapp-verify . --rapido` → `VERIFY: VERDE SEM BANCO (10s)`.
- `zapp-verify full .` → `VERIFY: VERDE SEM BANCO (984s)`.

## Autorrevisão
- Escopo: o segundo commit toca só `FEATURE_REGISTRY.md`; o restante veio do cherry-pick obrigatório do trabalho anterior `2dbb2cedb`.
- Diff total contra `dia/2026-10-12`: 23 arquivos, 52 inserções e 1696 deleções; tamanho medido `89022` caracteres, abaixo do limite de 90 mil.
- Não houve migration, alteração de tratamento de erro, escrita em banco, segredo, produção, export/import ou edição em massa.
- O contrato novo `tests/contracts/no-campaigns-classicas.contract.test.ts` permanece do trabalho anterior para cobrir a remoção do módulo clássico de campanhas.
