# IA-057 — Indicadores de saúde dos provedores

- **Estado**: PARCIAL
- **Prioridade**: P3
- **Anexo**: 02 · **Seção**: 3.1 Plano IA 200 etapas — itens pendentes

## Descrição e origem

Indicadores de saúde dos provedores.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/02-ia-dashboard.md` (3.1 Plano IA 200 etapas — itens pendentes).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): PARCIAL.
- **Planejado**: p50/p95, erros, disponibilidade e recuperação por provedor
- **Existe hoje** (evidência da auditoria): AIProviderHealthPanel.tsx:28,66,87-88 (p50/p95 sobre amostra de 50 chamadas/24 h)
- **Falta**: Visão por provedor e por fallback, amostra completa
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

integrações

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Saúde do provedor estimada por amostra pequena

## Dependências

Nenhuma registrada.

## Critério de aceite

- p50/p95, erros, disponibilidade e recuperação por provedor
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).