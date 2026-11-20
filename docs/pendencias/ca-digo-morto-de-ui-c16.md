# C-16 — Código morto de UI

- **Estado**: PARCIAL
- **Prioridade**: P3
- **Anexo**: 08 · **Seção**: 5. Achados fora dos planos (varredura de código)

## Descrição e origem

Código morto de UI.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/08-legado-e-codigo.md` (5. Achados fora dos planos (varredura de código)).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): PARCIAL.
- **Planejado**: —
- **Existe hoje** (evidência da auditoria): 70 arquivos sem importador, entre eles inbox/{LinkPreview,SentimentIndicator,AIToolsPopover,MessageContextMenu,MessagePreview,SpeedSelector,SwipeableListItem,TemplatesWithVariables}.tsx, inbox/chat/{index.ts,ChatHeaderToolbar.tsx} (logo ChatHeader também morto), dashboard/{DraggableWidgetContainer,SatisfactionAgentRanking,MetricComparison,TrendIndicator,MetricComponents}.tsx, gamification/AchievementDetailDialog.tsx, a11y/KeyboardNavigation.tsx, effects/{ParallaxContainer,ScrollEffects}.tsx, reports/ScheduledReportsManager.tsx, tasks/useMyTasks.ts, 10 ui/ (form, menubar, pagination, resizable, sidebar…), 17 barris hooks//index.ts
- **Falta**: limpeza
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

banco, UI, jobs

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Confunde quem audita ("existe componente" ≠ funcionalidade)

## Dependências

Nenhuma registrada.

## Critério de aceite

- —
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).