# X051 — Fluxo único pausar/retomar/cancelar nas 5 telas

- **Estado**: PARCIAL
- **Prioridade**: P2
- **Anexo**: 01 · **Seção**: 3.6 Talk X — Fase 5 · Kit, estados, modais, navegação (X042–X056: 6 concluídos, 9 pendentes)

## Descrição e origem

Fluxo único pausar/retomar/cancelar nas 5 telas.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/01-talkx-multiplix.md` (3.6 Talk X — Fase 5 · Kit, estados, modais, navegação (X042–X056: 6 concluídos, 9 pendentes)).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): PARCIAL.
- **Planejado**: useTalkXLifecycle em todas
- **Existe hoje** (evidência da auditoria): Usado só em TalkXCampaignScheduled.tsx:107 e TalkXLiveMonitor.tsx:30
- **Falta**: Visão geral, Andamento, Pausada
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

UI, jobs

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Regras diferentes conforme a tela

## Dependências

X024/X025

## Critério de aceite

- useTalkXLifecycle em todas
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).