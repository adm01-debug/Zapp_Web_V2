# E62 — db-migrate enxuto

- **Estado**: PARCIAL
- **Prioridade**: P3
- **Anexo**: 07 · **Seção**: 3.1 PLANO_GITHUB_ACTIONS_100_ETAPAS_2026-10-01 (vigente)

## Descrição e origem

db-migrate enxuto.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/07-infra-ci-banco-governanca.md` (3.1 PLANO_GITHUB_ACTIONS_100_ETAPAS_2026-10-01 (vigente)).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): PARCIAL.
- **Planejado**: Workflow ~150 linhas
- **Existe hoje** (evidência da auditoria): db-migrate.yml = 1.510 linhas (12 contratos extraídos p/ run-runtime-contract.mjs)
- **Falta**: Decisão (b) completa sem perder as 17 validações
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

UI

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Manutenção cara do caminho de DDL em produção

## Dependências

decisão do dono

## Critério de aceite

- Workflow ~150 linhas
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).