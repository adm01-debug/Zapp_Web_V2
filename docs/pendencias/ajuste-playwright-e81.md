# E81 — Ajuste Playwright

- **Estado**: NÃO IMPLEMENTADO
- **Prioridade**: P3
- **Anexo**: 07 · **Seção**: 3.1 PLANO_GITHUB_ACTIONS_100_ETAPAS_2026-10-01 (vigente)

## Descrição e origem

Ajuste Playwright.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/07-infra-ci-banco-governanca.md` (3.1 PLANO_GITHUB_ACTIONS_100_ETAPAS_2026-10-01 (vigente)).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): NÃO IMPLEMENTADO.
- **Planejado**: retries 2 só logados, trace retain-on-failure, video off
- **Existe hoje** (evidência da auditoria): playwright.config.ts:29,33,37 retries 1 / workers 1 / trace on-first-retry
- **Falta**: Ajustar após medição
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

jobs

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Flaky e tempo do E2E

## Dependências

Nenhuma registrada.

## Critério de aceite

- retries 2 só logados, trace retain-on-failure, video off
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).