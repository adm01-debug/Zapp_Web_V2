# IA-021 — Sentimento com o mesmo significado em todo lugar

- **Estado**: PARCIAL
- **Prioridade**: P2
- **Anexo**: 02 · **Seção**: 3.1 Plano IA 200 etapas — itens pendentes

## Descrição e origem

Sentimento com o mesmo significado em todo lugar.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/02-ia-dashboard.md` (3.1 Plano IA 200 etapas — itens pendentes).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): PARCIAL.
- **Planejado**: Vocabulário canônico em análise, contato, churn, alerta e CRM
- **Existe hoje** (evidência da auditoria): Normalização em useAIStats.ts:84-95, useRecentSentimentAlerts.ts:35-60; CRMAutoSync manda ao CRM positive/negative/neutral por palavra-chave (src/components/inbox/CRMAutoSync.tsx:29-44) e neutral fixo (:110)
- **Falta**: Sync do CRM usar a análise canônica
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

UI

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

CRM recebe sentimento "chutado" por palavra-chave

## Dependências

Nenhuma registrada.

## Critério de aceite

- Vocabulário canônico em análise, contato, churn, alerta e CRM
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).