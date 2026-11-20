# L-11 — Campanhas Clássicas (envio em massa)

- **Estado**: PARCIAL
- **Prioridade**: P1
- **Anexo**: 08 · **Seção**: 3.2 Automação, chatbot e atendimento automático

## Descrição e origem

Campanhas Clássicas (envio em massa).

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/08-legado-e-codigo.md` (3.2 Automação, chatbot e atendimento automático).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): PARCIAL.
- **Planejado**: FORGOTTEN #1, CSF 35; Talk X é outro subsistema
- **Existe hoje** (evidência da auditoria): "Iniciar" só muda campaigns.status para sending (src/components/campaigns/CampaignsView.tsx:175); campaign_contacts sem consumidor em 82 Edges; talkx-scheduler lê talkx_campaigns, não campaigns (supabase/functions/talkx-scheduler/index.ts:148,166)
- **Falta**: motor de envio ou remover a tela (já há Talk X)
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

banco, functions, UI, jobs

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Campanha aparece "enviando" para sempre e ninguém recebe

## Dependências

decisão de produto (manter só Talk X?)

## Critério de aceite

- FORGOTTEN #1, CSF 35; Talk X é outro subsistema
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).