# DASH-063 — Série NPS no gráfico

- **Estado**: NÃO IMPLEMENTADO
- **Prioridade**: P2
- **Anexo**: 02 · **Seção**: 3.4 Plano Dashboard 100 etapas (vigente) — itens pendentes

## Descrição e origem

Série NPS no gráfico.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/02-ia-dashboard.md` (3.4 Plano Dashboard 100 etapas (vigente) — itens pendentes).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): NÃO IMPLEMENTADO.
- **Planejado**: Desenhar NPS no modo "CSAT e NPS"
- **Existe hoje** (evidência da auditoria): Só <Line dataKey="CSAT"> (SatisfactionMetrics.tsx:166); legenda mostra NPS (:173)
- **Falta**: Série NPS
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

UI

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Gestor escolhe "CSAT e NPS" e vê só CSAT

## Dependências

Nenhuma registrada.

## Critério de aceite

- Desenhar NPS no modo "CSAT e NPS"
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).