# C-11 — Talk X: peças prontas não ligadas

- **Estado**: PARCIAL
- **Prioridade**: P2
- **Anexo**: 08 · **Seção**: 5. Achados fora dos planos (varredura de código)

## Descrição e origem

Talk X: peças prontas não ligadas.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/08-legado-e-codigo.md` (5. Achados fora dos planos (varredura de código)).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): PARCIAL.
- **Planejado**: Plano Talk X V4 (área 01)
- **Existe hoje** (evidência da auditoria): Só em testes: TalkXCampaignPaused.tsx (X156), TalkXInteractiveEditor.tsx (X096), TalkXMediaDropzone.tsx (X095), tracking/TalkXKeyMetricsCard.tsx, tracking/TalkXSentSummaryChart.tsx, useTalkXCampaignList.ts (X078), talkxCampaignDraft.ts; Edge talkx-ai (X076) sem chamador; RPCs talkx_upsert_link, talkx_delete_link, talkx_set_campaign_investment, talkx_segment_tags, talkx_campaign_pace sem uso; tabelas talkx_alerts, talkx_conversions, talkx_campaign_segments sem uso no app; filtro A9 desabilitado (TalkXAudienceFilters.tsx:279)
- **Falta**: ligação de UI
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

banco, functions

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Recursos de campanha (pausa, mídia, botões, links, ROI, IA) não chegam ao usuário

## Dependências

Nenhuma registrada.

## Critério de aceite

- Plano Talk X V4 (área 01)
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).