# R2-INB-003 — Mensagens interativas (botões/listas)

- **Estado**: NÃO IMPLEMENTADO
- **Prioridade**: P2
- **Anexo**: 06 · **Seção**: 3.11 Reauditoria Inbox R2-INB (64 achados, 03/10) — funcionalidades que viraram "retirada honesta"

## Descrição e origem

Mensagens interativas (botões/listas).

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/06-inbox-arquivos-design.md` (3.11 Reauditoria Inbox R2-INB (64 achados, 03/10) — funcionalidades que viraram "retirada honesta").

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): NÃO IMPLEMENTADO.
- **Planejado**: Envio real
- **Existe hoje** (evidência da auditoria): useChatPanelHandlers.ts:419-422 lança ENVIO_INTERATIVO_INDISPONIVEL; :424-426 clique em botão só toast
- **Falta**: Transporte pela Evolution GO
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

UI

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Construtor visível que não envia

## Dependências

Evolution GO

## Critério de aceite

- Envio real
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).