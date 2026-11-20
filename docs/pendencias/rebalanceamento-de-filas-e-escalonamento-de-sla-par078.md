# PAR-078 — Rebalanceamento de filas e escalonamento de SLA

- **Estado**: NÃO IMPLEMENTADO
- **Prioridade**: P1
- **Anexo**: 05 · **Seção**: 3.4 Filas, SLA, War Room e Distribuição

## Descrição e origem

Rebalanceamento de filas e escalonamento de SLA.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/05-tarefas-catalogo-mapa-go.md` (3.4 Filas, SLA, War Room e Distribuição).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): NÃO IMPLEMENTADO.
- **Planejado**: Edge queue-rebalance, cron de 5 min, sla_history
- **Existe hoje** (evidência da auditoria): Só RPCs manuais reassign_absent_agents/reassign_overloaded_agents (src/hooks/crm/useAgentReassignment.ts:13,31)
- **Falta**: Automação
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

banco, functions, UI, jobs

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Ticket com SLA estourado não é redistribuído

## Dependências

Nenhuma registrada.

## Critério de aceite

- Edge queue-rebalance, cron de 5 min, sla_history
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).