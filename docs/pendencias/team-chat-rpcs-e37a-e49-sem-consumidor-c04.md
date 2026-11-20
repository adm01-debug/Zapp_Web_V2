# C-04 — Team Chat: RPCs E37–E49 sem consumidor

- **Estado**: PARCIAL
- **Prioridade**: P3
- **Anexo**: 08 · **Seção**: 5. Achados fora dos planos (varredura de código)

## Descrição e origem

Team Chat: RPCs E37–E49 sem consumidor.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/08-legado-e-codigo.md` (5. Achados fora dos planos (varredura de código)).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): PARCIAL.
- **Planejado**: (plano Team Chat — área 03)
- **Existe hoje** (evidência da auditoria): get_team_inbox, get_team_messages_page, search_team_messages, toggle_team_reaction, mark_team_conversation_read, leave_team_group, remove_team_member, set_team_member_pref, set_team_member_role, transfer_team_conversation_department — 0 referências em src/functions; busca é feita só sobre mensagens carregadas (TeamChatPanel.tsx:106-115)
- **Falta**: migrar o front ou dropar
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

banco, RLS/permissões, functions

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Busca não acha mensagens antigas; superfície SQL exposta sem uso

## Dependências

Nenhuma registrada.

## Critério de aceite

- (plano Team Chat — área 03)
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).