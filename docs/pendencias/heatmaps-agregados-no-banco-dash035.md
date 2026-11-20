# DASH-035 — Heatmaps agregados no banco

- **Estado**: NÃO IMPLEMENTADO
- **Prioridade**: P1
- **Anexo**: 02 · **Seção**: 3.4 Plano Dashboard 100 etapas (vigente) — itens pendentes

## Descrição e origem

Heatmaps agregados no banco.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/02-ia-dashboard.md` (3.4 Plano Dashboard 100 etapas (vigente) — itens pendentes).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): NÃO IMPLEMENTADO.
- **Planejado**: Buckets dia/hora no servidor
- **Existe hoje** (evidência da auditoria): ActivityHeatmap.tsx:63 lê messages cru 90–365 dias (corta em 1.000 linhas)
- **Falta**: RPC de buckets
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

banco

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Mapa de calor anual mostra só 1.000 mensagens

## Dependências

Nenhuma registrada.

## Critério de aceite

- Buckets dia/hora no servidor
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).