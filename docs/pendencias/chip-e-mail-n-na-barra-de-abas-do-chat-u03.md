# U03 — Chip "E-mail (n)" na barra de abas do chat

- **Estado**: NÃO IMPLEMENTADO
- **Prioridade**: P1
- **Anexo**: 04 · **Seção**: 3.9 E-mail — alertas de não lido (U01–U12)

## Descrição e origem

Chip "E-mail (n)" na barra de abas do chat.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/04-contatos-crm-email.md` (3.9 E-mail — alertas de não lido (U01–U12)).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): NÃO IMPLEMENTADO.
- **Planejado**: Só quando > 0
- **Existe hoje** (evidência da auditoria): ConversationTabs.tsx sem e-mail; useContactUnreadEmails.ts:75 sem consumidor
- **Falta**: Ligar
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

integrações, UI

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Atendente não percebe que o cliente mandou e-mail enquanto conversa no WhatsApp

## Dependências

Nenhuma registrada.

## Critério de aceite

- Só quando > 0
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).