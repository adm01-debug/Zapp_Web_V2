# L-29 — n8n (hub de integrações)

- **Estado**: PARCIAL
- **Prioridade**: P3
- **Anexo**: 08 · **Seção**: 3.7 Integrações e telas-fachada

## Descrição e origem

n8n (hub de integrações).

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/08-legado-e-codigo.md` (3.7 Integrações e telas-fachada).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): PARCIAL.
- **Planejado**: FORGOTTEN #5
- **Existe hoje** (evidência da auditoria): "Funcionalidade em demonstração" (src/components/integrations/N8nIntegrationView.tsx:104,136; IntegrationsHub.tsx:21-22)
- **Falta**: persistência real de webhooks/workflows
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

banco, UI

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Automação externa só por fora do app

## Dependências

Nenhuma registrada.

## Critério de aceite

- FORGOTTEN #5
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).