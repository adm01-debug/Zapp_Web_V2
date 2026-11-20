# C-01 — Team Chat: sair/renomear grupo e transferir departamento

- **Estado**: PARCIAL
- **Prioridade**: P2
- **Anexo**: 08 · **Seção**: 5. Achados fora dos planos (varredura de código)

## Descrição e origem

Team Chat: sair/renomear grupo e transferir departamento.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/08-legado-e-codigo.md` (5. Achados fora dos planos (varredura de código)).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): PARCIAL.
- **Planejado**: (sem plano nesta área; ver área 03)
- **Existe hoje** (evidência da auditoria): Header aceita onLeaveGroup/onRenameGroup/onTransfer (src/components/team-chat/TeamChatHeader.tsx:55-80,223-236) mas o painel não passa nenhum (TeamChatPanel.tsx:100-104); leaveMutation criado e não usado (useTeamChatPanel.ts:92); GroupManagementDialog.tsx e TransferConversationDialog.tsx sem importador
- **Falta**: ligar os handlers
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

UI

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Usuário não consegue sair de grupo nem transferir conversa

## Dependências

Nenhuma registrada.

## Critério de aceite

- (sem plano nesta área; ver área 03)
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).