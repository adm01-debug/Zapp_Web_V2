# IA-058 — Alerta de consumo anômalo

- **Estado**: PARCIAL
- **Prioridade**: P1
- **Anexo**: 02 · **Seção**: 3.1 Plano IA 200 etapas — itens pendentes

## Descrição e origem

Alerta de consumo anômalo.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/02-ia-dashboard.md` (3.1 Plano IA 200 etapas — itens pendentes).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): PARCIAL.
- **Planejado**: Alerta deduplicado + bloqueio por capacidade
- **Existe hoje** (evidência da auditoria): Só docs/audits/PROJETO_IA058_ e tests/contracts/ia058-design-only.contract.test.ts; zero código
- **Falta**: Implementar sinais, incidente e bloqueio
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

UI

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Gasto descontrolado só aparece na fatura

## Dependências

Nenhuma registrada.

## Critério de aceite

- Alerta deduplicado + bloqueio por capacidade
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).