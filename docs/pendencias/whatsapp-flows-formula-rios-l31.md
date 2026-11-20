# L-31 — WhatsApp Flows (formulários)

- **Estado**: PARCIAL
- **Prioridade**: P3
- **Anexo**: 08 · **Seção**: 3.7 Integrações e telas-fachada

## Descrição e origem

WhatsApp Flows (formulários).

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/08-legado-e-codigo.md` (3.7 Integrações e telas-fachada).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): PARCIAL.
- **Planejado**: FORGOTTEN #8, CSF 42
- **Existe hoje** (evidência da auditoria): Builder só grava JSON (src/components/whatsapp-flows/WhatsAppFlowsBuilder.tsx:86,115); sem publicar/enviar/receber; está no grupo principal, sem aviso de demo
- **Falta**: publicação na Meta + envio
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

integrações, UI

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Tela promete formulário que o cliente nunca vê

## Dependências

L-32

## Critério de aceite

- FORGOTTEN #8, CSF 42
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).