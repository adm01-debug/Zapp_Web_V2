# DASH-076 — Observado × estimado; metodologia

- **Estado**: NÃO IMPLEMENTADO
- **Prioridade**: P2
- **Anexo**: 02 · **Seção**: 3.4 Plano Dashboard 100 etapas (vigente) — itens pendentes

## Descrição e origem

Observado × estimado; metodologia.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/02-ia-dashboard.md` (3.4 Plano Dashboard 100 etapas (vigente) — itens pendentes).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): NÃO IMPLEMENTADO.
- **Planejado**: "Dados reais" = volumes reais; backtest
- **Existe hoje** (evidência da auditoria): "Real" = média de 7 dias (useDemandPrediction.ts:30-35)
- **Falta**: Séries reais + validação
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

banco

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

—

## Dependências

Nenhuma registrada.

## Critério de aceite

- "Dados reais" = volumes reais; backtest
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).