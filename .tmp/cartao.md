Task t_a8569ebe: feat(hooks): useConversationTicketActions (assumir e devolver à fila)
  status:    running
  assignee:  hugo
  workspace: scratch @ C:\Users\Joaquim Ataides\AppData\Local\hermes\kanban\boards\zapp-web-v2\workspaces\t_a8569ebe
  max-retries: 2 (default)
  created:   2026-10-11 09:22 by claude
  started:   2026-10-11 10:01
  parents:   t_4e49a6dc
  children:  t_d4c64af1

Body:
ESPECIALISTA DA ÁREA: hugo (hooks, estado e dados no front). Abra a skill de área do seu perfil antes de editar. Comece o relato com a linha `Especialista: hugo`.
Origem: auditoria de paridade V3 -> V2 (docs/audits/AUDITORIA_PARIDADE_V3_CHAT_UI_PARTE1_2026-10-11.md) e decisão do Joaquim em 11/10/2026 (faixa C aprovada: tudo será implementado). Antes de mexer, confira no código ATUAL (dia/2026-10-11) o que já existe; reaproveite o que houver e relate. Se o defeito/lacuna já estiver resolvido, escreva isso em .tmp/relato.md com a prova e feche sem commit de código.

DEPENDÊNCIA: este cartão só começa depois dos cartões pai. Se ao abrir você não achar o que eles criam, o pai ainda não integrou: bloqueie dizendo qual.

PROBLEMA
A tela precisa chamar assume_conversation e return_conversation_to_queue e refletir o novo responsável sem recarregar.

O QUE FAZER
1. Criar useConversationTicketActions(contact) em src/hooks/inbox/ (ou na pasta de hooks de chat que o repositório usa): mutations assume e returnToQueue, atualização otimista do contato com rollback no erro, invalidação das queries de conversas/contatos.
2. Expor canAssume e canReturn calculados a partir do responsável atual, do usuário logado e do papel (hooks de papel já existentes), e o estado derivado: 'Aberta', 'Em atendimento por <nome>', 'Na fila'.
3. Traduzir os erros das RPCs (sem permissão, outro agente assumiu antes) em mensagens em português.
4. Testes: cada mutation, rollback no erro, regras de canAssume/canReturn por papel.

ARQUIVOS QUE PODE TOCAR
- src/hooks/inbox/useConversationTicketActions.ts (novo)
- src/hooks/inbox/__tests__/ (testes novos)

CRITÉRIO DE PRONTO
1. Hook com mutations e regras testadas.
2. zapp-verify . --rapido verde.


Events (21):
  [2026-10-11 09:22] dependency_wait {'reason': 'parent_not_done', 'parent': 't_4e49a6dc'}
  [2026-10-11 09:54] promoted
  [2026-10-11 10:00] reprioritized {'priority': 9}
  [2026-10-11 10:01] [run 10119] claimed {'lock': 'Joaquim:15012', 'expires': 1791724569, 'run_id': 10119}
  [2026-10-11 10:01] [run 10119] spawned {'pid': 644, 'started_at': '|179172366926'}
  [2026-10-11 10:01] [run 10119] heartbeat
  [2026-10-11 10:02] [run 10119] heartbeat
  [2026-10-11 10:03] [run 10119] heartbeat
  [2026-10-11 10:04] [run 10119] heartbeat
  [2026-10-11 10:05] [run 10119] heartbeat
  [2026-10-11 10:06] [run 10119] heartbeat
  [2026-10-11 10:07] [run 10119] heartbeat
  [2026-10-11 10:08] [run 10119] heartbeat
  [2026-10-11 10:09] [run 10119] heartbeat
  [2026-10-11 10:10] [run 10119] heartbeat
  [2026-10-11 10:11] [run 10119] heartbeat
  [2026-10-11 10:12] [run 10119] heartbeat
  [2026-10-11 10:13] [run 10119] heartbeat
  [2026-10-11 10:14] [run 10119] heartbeat
  [2026-10-11 10:15] [run 10119] heartbeat

Runs (1):
  #10119 running      @hugo  active  2026-10-11 10:01
