# RES-4 — Resíduos técnicos

- **Estado**: PARCIAL
- **Prioridade**: P3
- **Anexo**: 05 · **Seção**: 3.1 Tarefas — Plano de Finalização (100) e resíduos

## Descrição e origem

Resíduos técnicos.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/05-tarefas-catalogo-mapa-go.md` (3.1 Tarefas — Plano de Finalização (100) e resíduos).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): PARCIAL.
- **Planejado**: Limpeza da auditoria de 29/09
- **Existe hoje** (evidência da auditoria): update() ignora status; WIP contado no global; sem índice em completed_at/position; import Filter morto (src/components/tasks/TasksModule.tsx:3); alias useMyWorkItemsBadge sem consumidor (src/hooks/tasks/useMyWorkItems.ts:715)
- **Falta**: Limpeza
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

UI

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Nenhum visível ao usuário

## Dependências

Nenhuma registrada.

## Critério de aceite

- Limpeza da auditoria de 29/09
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).