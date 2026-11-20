# L-33 — Templates WhatsApp com aprovação oficial

- **Estado**: PARCIAL
- **Prioridade**: P3
- **Anexo**: 08 · **Seção**: 3.7 Integrações e telas-fachada

## Descrição e origem

Templates WhatsApp com aprovação oficial.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/08-legado-e-codigo.md` (3.7 Integrações e telas-fachada).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): PARCIAL.
- **Planejado**: CSF 13.8, 15
- **Existe hoje** (evidência da auditoria): Status é "do cadastro local", sem retorno da Meta (src/hooks/integrations/useWhatsAppTemplates.ts:36-40)
- **Falta**: sync com Meta
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

integrações, UI

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

"Aprovado" na tela não é aprovação real

## Dependências

L-32

## Critério de aceite

- CSF 13.8, 15
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).