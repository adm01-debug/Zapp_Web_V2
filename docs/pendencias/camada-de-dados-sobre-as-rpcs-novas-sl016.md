# SL-016 — Camada de dados sobre as RPCs novas

- **Estado**: NÃO IMPLEMENTADO
- **Prioridade**: P1
- **Anexo**: 03 · **Seção**: 3.4 Team Chat — plano F (F01–F100), com equivalência TC e achados da reconciliação

## Descrição e origem

Camada de dados sobre as RPCs novas.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/03-telefonia-teamchat.md` (3.4 Team Chat — plano F (F01–F100), com equivalência TC e achados da reconciliação).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): NÃO IMPLEMENTADO.
- **Planejado**: get_team_inbox, get_team_messages_page, mark_team_conversation_read, reações por realtime, ticks por view
- **Existe hoje** (evidência da auditoria): Nenhuma RPC nova é chamada no front; useTeamConversations.ts:17-37 = 3 consultas + RPCs deprecated; useTeamMessages.ts:19-29 lê 200 msgs direto e grava recibos direto (:80-89, inclusive com aba oculta); useTeamMessageReactions.ts:52,89-92 direto
- **Falta**: Migrar hooks
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

banco, functions, UI

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Tick "lido" nunca aparece (nada grava team_messages.status='read'); risco de lentidão

## Dependências

Nenhuma registrada.

## Critério de aceite

- get_team_inbox, get_team_messages_page, mark_team_conversation_read, reações por realtime, ticks por view
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).