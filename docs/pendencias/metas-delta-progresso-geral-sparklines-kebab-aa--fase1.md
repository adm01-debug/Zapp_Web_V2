# FASE1 — Metas: delta "Progresso Geral", sparklines, kebab "Ações"

- **Estado**: PARCIAL
- **Prioridade**: P3
- **Anexo**: 02 · **Seção**: 3.6 Redesign Dashboard Abas (7 fases)

## Descrição e origem

Metas: delta "Progresso Geral", sparklines, kebab "Ações".

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/02-ia-dashboard.md` (3.6 Redesign Dashboard Abas (7 fases)).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): PARCIAL.
- **Planejado**: KPIs com delta e barras
- **Existe hoje** (evidência da auditoria): delta={null}, bars={null} (src/components/dashboard/GoalsDashboard.tsx:54-55)
- **Falta**: Snapshot de período anterior; menu de ações
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

UI

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Metas sem tendência

## Dependências

Série histórica

## Critério de aceite

- KPIs com delta e barras
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).