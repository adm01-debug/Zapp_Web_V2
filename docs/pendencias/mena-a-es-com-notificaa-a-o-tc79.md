# TC-79 — Menções com notificação

- **Estado**: PARCIAL
- **Prioridade**: P2
- **Anexo**: 03 · **Seção**: 3.4 Team Chat — plano F (F01–F100), com equivalência TC e achados da reconciliação

## Descrição e origem

Menções com notificação.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/03-telefonia-teamchat.md` (3.4 Team Chat — plano F (F01–F100), com equivalência TC e achados da reconciliação).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): PARCIAL.
- **Planejado**: Autocomplete de membros + notify_team_mentions
- **Existe hoje** (evidência da auditoria): TeamChatInputArea.tsx:10,136 usa o MentionAutocomplete do inbox; RPC de notificação inexistente
- **Falta**: RPC + lista de membros
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

banco, functions

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Mencionado não é avisado

## Dependências

F47

## Critério de aceite

- Autocomplete de membros + notify_team_mentions
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).