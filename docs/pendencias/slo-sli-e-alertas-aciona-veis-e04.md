# E-04 — SLO/SLI e alertas acionáveis

- **Estado**: PARCIAL
- **Prioridade**: P2
- **Anexo**: 08 · **Seção**: 3.10 Engenharia (100 etapas Cline, REFACTORING_REPORT, ADRs, audit_report)

## Descrição e origem

SLO/SLI e alertas acionáveis.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/08-legado-e-codigo.md` (3.10 Engenharia (100 etapas Cline, REFACTORING_REPORT, ADRs, audit_report)).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): PARCIAL.
- **Planejado**: etapa 077
- **Existe hoje** (evidência da auditoria): docs/runbooks/slo.md (próprio doc admite ausência de monitor externo) + issues automáticas do db-live-guard
- **Falta**: alertas por SLO
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

jobs

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Queda descoberta pelo cliente

## Dependências

Nenhuma registrada.

## Critério de aceite

- etapa 077
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).