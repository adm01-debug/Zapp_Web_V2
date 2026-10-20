Task t_659cc180: fix(hooks): adiar conversa para próxima semana (domingo errado) e falha visível
  status:    running
  assignee:  hugo
  workspace: scratch @ C:\Users\Joaquim Ataides\AppData\Local\hermes\kanban\boards\zapp-web-v2\workspaces\t_659cc180
  max-retries: 2 (default)
  created:   2026-10-11 10:19 by claude
  started:   2026-10-11 10:30

Body:
ESPECIALISTA DA ÁREA: hugo (hooks, estado e dados no front). Abra a skill de área do seu perfil antes de editar. Comece o relato com a linha `Especialista: hugo`.
Origem: auditoria de paridade V3 -> V2 (docs/audits/AUDITORIA_PARIDADE_V3_CHAT_UI_PARTE1_2026-10-11.md) e decisão do Joaquim em 11/10/2026 (achado da auditoria funda do documento 08-chat-1; relatório em docs/audits/AUDITORIA_PARIDADE_V3_CHAT_UI_PARTE2_COMPORTAMENTO_2026-10-11.md). Antes de mexer, confira no código ATUAL (dia/2026-10-11) o que já existe; reaproveite o que houver e relate. Se o defeito/lacuna já estiver resolvido, escreva isso em .tmp/relato.md com a prova e feche sem commit de código.

PROBLEMA
FATOS (confirmados): src/hooks/chat/useConversationActions.ts:187 calcula `case 'nextweek': setHours(addDays(now, 7 - now.getDay() + 1), 9)`. No domingo (getDay()=0) soma 8 dias e cai na segunda DEPOIS da próxima; os minutos e segundos ficam como a hora atual (09:37 em vez de 09:00). A V3 define 'próxima semana' como a próxima segunda-feira às 09:00 em ponto, e se hoje é segunda vai para +7. O mesmo cálculo alimenta a opção do menu em src/components/inbox/VirtualizedRealtimeList.tsx:51. Além disso, o snooze faz delete e depois insert sem atomicidade (se o insert falha o adiamento anterior some) e só trata `if (!error)`, sem aviso de erro.

O QUE FAZER
1. Criar src/hooks/chat/snoozeDurations.ts com `snoozeDurationToDate(duration, now)` puro e testável: 1h, 3h, tomorrow = amanhã 09:00:00, nextweek = próxima segunda 09:00:00 (domingo -> +1, segunda -> +7, sexta -> +3 etc.), zerando minutos, segundos e milissegundos.
2. Usar a função em useConversationActions.ts e em qualquer outro ponto que calcule 'próxima semana' para adiar conversa (confira VirtualizedRealtimeList.tsx e o comando /snooze). NÃO mexer na opção 'Próxima semana' do módulo de tarefas (QuickAdd), que é outra regra.
3. Tornar o adiamento atômico: um único upsert (ou RPC existente) em vez de delete + insert, de modo que a falha preserve o adiamento anterior.
4. Avisar erro: toast destrutivo claro quando a gravação falha; `/snooze` sem argumento avisa 'Informe o período: 1h, 3h, amanha ou semana' em vez de não fazer nada.
5. Testes de snoozeDurations cobrindo domingo, segunda, sexta e a virada de mês, mais o caso de erro de gravação.

ARQUIVOS QUE PODE TOCAR
- src/hooks/chat/snoozeDurations.ts (novo)
- src/hooks/chat/useConversationActions.ts
- src/components/inbox/VirtualizedRealtimeList.tsx (somente o que consumir a função)
- src/hooks/chat/__tests__/
- src/components/inbox/chat/useChatPanelHandlers.ts (somente a linha do comando /snooze)

CRITÉRIO DE PRONTO
1. Domingo -> segunda 09:00:00 do dia seguinte; segunda -> +7; hora sempre 09:00:00.
2. Erro de gravação visível e adiamento anterior preservado.
3. zapp-verify . --rapido verde.


Comments (1):
  [2026-10-11 10:38] hugo: Achado fora do escopo (trilha de banco): `conversation_snoozes` não tem índice único em `(contact_id, snoozed_by)` nem policy de UPDATE — por isso não dá para usar `upsert ... onConflict` nem UPDATE para gravar o adiamento de forma atômica. A entrega preserva o adiamento anterior com insert-antes-do-delete (sem migration). Recomendo um cartão de banco para adicionar `UNIQUE (contact_id, snoozed_by)` (com `DELETE` das duplicatas legadas antes), o que permitiria o upsert de verdade e garantiria 1 linha por par sem depender da ordem das duas escritas.

Events (13):
  [2026-10-11 10:19] created {'assignee': 'hugo', 'status': 'ready', 'parents': [], 'creator_task_id': None, 'tenant': None, 'workspace_kind': 'scratch', 'workspace_path': None, 'branch_name': None, 'project_id': None, 'skills': None, 'goal_mode': None, 'model_override': None, 'provider_override': None}
  [2026-10-11 10:28] reprioritized {'priority': 9}
  [2026-10-11 10:30] [run 10137] claimed {'lock': 'Joaquim:15012', 'expires': 1791726347, 'run_id': 10137}
  [2026-10-11 10:30] [run 10137] spawned {'pid': 8680, 'started_at': '|179172544802'}
  [2026-10-11 10:30] [run 10137] heartbeat
  [2026-10-11 10:31] [run 10137] heartbeat
  [2026-10-11 10:32] [run 10137] heartbeat
  [2026-10-11 10:33] [run 10137] heartbeat
  [2026-10-11 10:35] [run 10137] heartbeat
  [2026-10-11 10:36] [run 10137] heartbeat
  [2026-10-11 10:37] [run 10137] heartbeat
  [2026-10-11 10:38] [run 10137] heartbeat
  [2026-10-11 10:38] commented {'author': 'hugo', 'len': 554}

Runs (1):
  #10137 running      @hugo  active  2026-10-11 10:30
