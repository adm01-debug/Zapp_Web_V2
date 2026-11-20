# X057 — Vários segmentos por campanha

- **Estado**: PARCIAL
- **Prioridade**: P1
- **Anexo**: 01 · **Seção**: 3.7 Talk X — Fase 6 · Capacidades novas do motor (X057–X076: 1 concluído, 19 pendentes)

## Descrição e origem

Vários segmentos por campanha.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/01-talkx-multiplix.md` (3.7 Talk X — Fase 6 · Capacidades novas do motor (X057–X076: 1 concluído, 19 pendentes)).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): PARCIAL.
- **Planejado**: segment_ids[] no rascunho, dedupe no snapshot
- **Existe hoje** (evidência da auditoria): Só estrutura (20261002641230_talkx_v4_x057_segmentos.sql); useCampaignEditor.ts:339 guarda 1 segmentId; useTalkXSegments.ts:246 manda p_segment_ids: null
- **Falta**: RPC + snapshot + wizard
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

UI

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Campanha só atinge 1 segmento

## Dependências

Nenhuma registrada.

## Critério de aceite

- segment_ids[] no rascunho, dedupe no snapshot
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).