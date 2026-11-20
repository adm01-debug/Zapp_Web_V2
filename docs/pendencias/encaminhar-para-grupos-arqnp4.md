# ARQ-NP4 — Encaminhar para grupos

- **Estado**: NÃO IMPLEMENTADO
- **Prioridade**: P2
- **Anexo**: 06 · **Seção**: 3.1 Arquivos — redesign 50 etapas (01/10) e "Próximos passos"

## Descrição e origem

Encaminhar para grupos.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/06-inbox-arquivos-design.md` (3.1 Arquivos — redesign 50 etapas (01/10) e "Próximos passos").

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): NÃO IMPLEMENTADO.
- **Planejado**: Caminho de envio para whatsapp_groups
- **Existe hoje** (evidência da auditoria): useChatPanelHandlers.ts:254 falha "ainda não é suportado"; ForwardMessageDialog.tsx:47 targets='all' por padrão e ChatDialogs.tsx:72 não passa targets → aba Grupos aparece no chat
- **Falta**: Criar transporte ou esconder a aba Grupos no chat
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

integrações, UI

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Operador escolhe grupo e só recebe erro

## Dependências

RPC enqueue_outbound_message só aceita contato

## Critério de aceite

- Caminho de envio para whatsapp_groups
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).