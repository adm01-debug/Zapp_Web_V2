# L-36 — Stripe e Google Sheets no hub

- **Estado**: NÃO IMPLEMENTADO
- **Prioridade**: P3
- **Anexo**: 08 · **Seção**: 3.7 Integrações e telas-fachada

## Descrição e origem

Stripe e Google Sheets no hub.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/08-legado-e-codigo.md` (3.7 Integrações e telas-fachada).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): NÃO IMPLEMENTADO.
- **Planejado**: FORGOTTEN #5 ("Stripe coming soon", Google Sheets)
- **Existe hoje** (evidência da auditoria): Hub atual só tem n8n/Sentry (demo) e Bitrix24 (IntegrationsHub.tsx:15-41)
- **Falta**: — (ou retirar do doc)
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

UI

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Baixo

## Dependências

Nenhuma registrada.

## Critério de aceite

- FORGOTTEN #5 ("Stripe coming soon", Google Sheets)
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).