# L-27 — Meta Conversions API

- **Estado**: PARCIAL
- **Prioridade**: P3
- **Anexo**: 08 · **Seção**: 3.7 Integrações e telas-fachada

## Descrição e origem

Meta Conversions API.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/08-legado-e-codigo.md` (3.7 Integrações e telas-fachada).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): PARCIAL.
- **Planejado**: FORGOTTEN #10, CSF 44
- **Existe hoje** (evidência da auditoria): Grava meta_capi_events (src/hooks/integrations/useMetaCAPIData.ts:23); "envio para a Meta… ainda não foi implementado" (src/components/meta-capi/MetaCAPIView.tsx:58-60)
- **Falta**: envio ao Graph API + sent_to_meta
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

banco, functions, UI

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Sem atribuição de anúncios

## Dependências

Pixel/token Meta

## Critério de aceite

- FORGOTTEN #10, CSF 44
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).