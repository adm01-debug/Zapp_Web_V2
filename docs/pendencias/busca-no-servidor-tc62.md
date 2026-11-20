# TC-62 — Busca no servidor

- **Estado**: PARCIAL
- **Prioridade**: P2
- **Anexo**: 03 · **Seção**: 3.4 Team Chat — plano F (F01–F100), com equivalência TC e achados da reconciliação

## Descrição e origem

Busca no servidor.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/03-telefonia-teamchat.md` (3.4 Team Chat — plano F (F01–F100), com equivalência TC e achados da reconciliação).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): PARCIAL.
- **Planejado**: search_team_messages, achar fora das 50 primeiras
- **Existe hoje** (evidência da auditoria): Busca local com debounce 400 ms só no que já carregou (useTeamChatPanel.ts:222-224)
- **Falta**: Usar RPC
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

UI

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Mensagem antiga não é encontrada

## Dependências

F42

## Critério de aceite

- search_team_messages, achar fora das 50 primeiras
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).