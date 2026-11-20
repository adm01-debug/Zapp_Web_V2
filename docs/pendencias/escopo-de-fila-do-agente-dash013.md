# DASH-013 — Escopo de fila do agente

- **Estado**: PARCIAL
- **Prioridade**: P1
- **Anexo**: 02 · **Seção**: 3.4 Plano Dashboard 100 etapas (vigente) — itens pendentes

## Descrição e origem

Escopo de fila do agente.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/02-ia-dashboard.md` (3.4 Plano Dashboard 100 etapas (vigente) — itens pendentes).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): PARCIAL.
- **Planejado**: Agente vê pendências não atribuídas das suas filas
- **Existe hoje** (evidência da auditoria): RPC filtra c.assigned_to = e.agent (20261006064630_.sql:57) e depois conta assigned_to IS NULL → "pendentes" do agente é sempre 0
- **Falta**: Separar escopo de fila do pessoal
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

banco, functions, jobs

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Agente não vê fila esperando

## Dependências

Nenhuma registrada.

## Critério de aceite

- Agente vê pendências não atribuídas das suas filas
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).