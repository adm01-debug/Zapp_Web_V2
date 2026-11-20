# DASH-073 — Alertas de IA por interface restrita

- **Estado**: NÃO IMPLEMENTADO
- **Prioridade**: P2
- **Anexo**: 02 · **Seção**: 3.4 Plano Dashboard 100 etapas (vigente) — itens pendentes

## Descrição e origem

Alertas de IA por interface restrita.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/02-ia-dashboard.md` (3.4 Plano Dashboard 100 etapas (vigente) — itens pendentes).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): NÃO IMPLEMENTADO.
- **Planejado**: Usar dashboard_sentiment_alerts
- **Existe hoje** (evidência da auditoria): Leitura direta de audit_logs, erro ignorado (useAIStats.ts:142-144)
- **Falta**: Trocar pela RPC
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

UI

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Falha vira "0 alertas"

## Dependências

Nenhuma registrada.

## Critério de aceite

- Usar dashboard_sentiment_alerts
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).