# E-10 — Eliminar componentes duplicados

- **Estado**: PARCIAL
- **Prioridade**: P3
- **Anexo**: 08 · **Seção**: 3.10 Engenharia (100 etapas Cline, REFACTORING_REPORT, ADRs, audit_report)

## Descrição e origem

Eliminar componentes duplicados.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/08-legado-e-codigo.md` (3.10 Engenharia (100 etapas Cline, REFACTORING_REPORT, ADRs, audit_report)).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): PARCIAL.
- **Planejado**: REFACTORING #5
- **Existe hoje** (evidência da auditoria): Persistem pares MetricComparison, TrendIndicator, MiniSparkline (raiz × metrics/), FloatingParticles (dashboard × voice), ConversationHeatmap e ScheduledReportsManager (dashboard × reports; o de reports é órfão), BulkActionsBar (raiz órfão × contacts)
- **Falta**: remover cópias
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

UI, jobs

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Baixo

## Dependências

Nenhuma registrada.

## Critério de aceite

- REFACTORING #5
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).