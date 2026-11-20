# PAR-077 — Roteador sticky + round-robin + skills

- **Estado**: PARCIAL
- **Prioridade**: P2
- **Anexo**: 05 · **Seção**: 3.4 Filas, SLA, War Room e Distribuição

## Descrição e origem

Roteador sticky + round-robin + skills.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/05-tarefas-catalogo-mapa-go.md` (3.4 Filas, SLA, War Room e Distribuição).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): PARCIAL.
- **Planejado**: ticket-router, sticky_assignments, queue_routing_rules
- **Existe hoje** (evidência da auditoria): Só skill_based_assign manual (src/components/settings/SkillBasedRoutingSettings.tsx:129)
- **Falta**: Roteador automático
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

UI

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Igual a DIST-1

## Dependências

Nenhuma registrada.

## Critério de aceite

- ticket-router, sticky_assignments, queue_routing_rules
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).