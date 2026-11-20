# X068 — Previsões no servidor (ETA, risco, sobreposição)

- **Estado**: NÃO IMPLEMENTADO
- **Prioridade**: P2
- **Anexo**: 01 · **Seção**: 3.7 Talk X — Fase 6 · Capacidades novas do motor (X057–X076: 1 concluído, 19 pendentes)

## Descrição e origem

Previsões no servidor (ETA, risco, sobreposição).

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/01-talkx-multiplix.md` (3.7 Talk X — Fase 6 · Capacidades novas do motor (X057–X076: 1 concluído, 19 pendentes)).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): NÃO IMPLEMENTADO.
- **Planejado**: talkx_campaign_forecast
- **Existe hoje** (evidência da auditoria): Nada; monitor passa forecast: null (TalkXLiveMonitor.tsx:176)
- **Falta**: RPC
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

jobs

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Sem previsão de término

## Dependências

X016

## Critério de aceite

- talkx_campaign_forecast
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).