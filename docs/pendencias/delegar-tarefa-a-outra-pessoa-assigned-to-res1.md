# RES-1 — Delegar tarefa a outra pessoa (assigned_to)

- **Estado**: NÃO IMPLEMENTADO
- **Prioridade**: P2
- **Anexo**: 05 · **Seção**: 3.1 Tarefas — Plano de Finalização (100) e resíduos

## Descrição e origem

Delegar tarefa a outra pessoa (assigned_to).

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/05-tarefas-catalogo-mapa-go.md` (3.1 Tarefas — Plano de Finalização (100) e resíduos).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): NÃO IMPLEMENTADO.
- **Planejado**: Delegação (backlog v2)
- **Existe hoje** (evidência da auditoria): Trigger força assigned_to := created_by (MODULO_TAREFAS_QUADRO_DASHBOARD.md:286)
- **Falta**: UI e regra de delegação
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

banco, UI

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

O supervisor não consegue passar tarefa para um atendente

## Dependências

decisão de produto

## Critério de aceite

- Delegação (backlog v2)
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).