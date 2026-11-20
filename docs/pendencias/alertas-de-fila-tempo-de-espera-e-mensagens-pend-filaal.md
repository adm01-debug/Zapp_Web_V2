# FILA-AL — Alertas de fila "tempo de espera" e "mensagens pendentes"

- **Estado**: PARCIAL
- **Prioridade**: P2
- **Anexo**: 05 · **Seção**: 3.4 Filas, SLA, War Room e Distribuição

## Descrição e origem

Alertas de fila "tempo de espera" e "mensagens pendentes".

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/05-tarefas-catalogo-mapa-go.md` (3.4 Filas, SLA, War Room e Distribuição).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): PARCIAL.
- **Planejado**: 4 tipos de QueueAlert
- **Existe hoje** (evidência da auditoria): Metas configuráveis (QueueGoalsDialog.tsx:134,202), mas só waiting_contacts e assignment_rate são calculados (src/components/queues/QueuesView.tsx:33-50)
- **Falta**: Calcular os outros 2
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

banco, UI, jobs

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Meta de espera configurada não gera alerta

## Dependências

Nenhuma registrada.

## Critério de aceite

- 4 tipos de QueueAlert
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).