# DASH-007 — Matriz de acesso aprovada

- **Estado**: PARCIAL
- **Prioridade**: P2
- **Anexo**: 02 · **Seção**: 3.4 Plano Dashboard 100 etapas (vigente) — itens pendentes

## Descrição e origem

Matriz de acesso aprovada.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/02-ia-dashboard.md` (3.4 Plano Dashboard 100 etapas (vigente) — itens pendentes).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): PARCIAL.
- **Planejado**: Incluir special_agent e perda de papel
- **Existe hoje** (evidência da auditoria): Matriz no README
- **Falta**: Aprovação + perda de papel
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

RLS/permissões, UI

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

—

## Dependências

Dono

## Critério de aceite

- Incluir special_agent e perda de papel
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).