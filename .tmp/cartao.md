Task t_7bd13b76: [refazer 1] fix(hooks): adiar conversa para próxima semana (domingo errado) e falha visível
  status:    running
  assignee:  senior
  workspace: scratch @ C:\Users\Joaquim Ataides\AppData\Local\hermes\kanban\boards\zapp-web-v2\workspaces\t_7bd13b76
  max-retries: 2 (default)
  created:   2026-10-11 10:52 by user
  started:   2026-10-11 13:19

Body:
REFAZER (rodada 1 de 2). A entrega anterior deste trabalho foi RECUSADA e nada entrou.

MOTIVO DA RECUSA: A função snoozeDurationToDate está correta (domingo→+1, segunda→+7, sexta→+3, 09:00:00.000) e tem testes. Mas a nova gravação regride o comportamento anterior: remove só a primeira linha antiga e ignora o erro do delete.

O QUE CORRIGIR: 1) Em useConversationActions.ts o select devolve todas as linhas do par (contact_id, snoozed_by), e não há índice único, então podem existir várias. O código guarda só `anteriores?.[0]?.id` e apaga uma só, enquanto o delete original removia todas. Guarde todos os ids e apague com `.in('id', ids)` depois do insert aceito. 2) O resultado do delete pós-insert é descartado. Se ele falhar, ficam duas linhas, e uma antiga com vencimento mais tarde pode manter a conversa adiada além do novo prazo. Trate `error` do delete: avise com toast ou reverta de forma explícita, e não mostre sucesso silencioso com estado inconsistente. 3) Acrescente teste com 2+ linhas anteriores (todas removidas após o insert) e teste com falha no delete.

TRABALHO ANTERIOR (aproveite, não recomece): branch `v2/adiar-conversa-proxima-semana-2610111031b795` (commit cb8700801) no repositório; no workspace novo, traga os commits com `git cherry-pick` e corrija só o que foi apontado.

PEDIDO ORIGINAL:
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

Feche com hermes-tarefa-fechar "<tipo>(<escopo>): <título>" .tmp/relato.md, dizendo no relato como resolveu cada ponto da recusa.

Comments (1):
  [2026-10-11 10:52] default: [jev-entrada] rota=complexo (conf 0.89 → coordenador, p_humano=0.01), faixa=hooks, injeção=0.25, ação externa=0.07 — REFAZER: complexo → senior

Events (17):
  [2026-10-11 10:52] created {'assignee': None, 'status': 'ready', 'parents': [], 'creator_task_id': None, 'tenant': None, 'workspace_kind': 'scratch', 'workspace_path': None, 'branch_name': None, 'project_id': None, 'skills': None, 'goal_mode': None, 'model_override': None, 'provider_override': None}
  [2026-10-11 10:52] commented {'author': 'default', 'len': 143}
  [2026-10-11 10:52] assigned {'assignee': 'senior', 'from': None}
  [2026-10-11 10:53] reprioritized {'priority': 1}
  [2026-10-11 13:17] reprioritized {'priority': 9}
  [2026-10-11 13:19] [run 10313] claimed {'lock': 'Joaquim:15012', 'expires': 1791736445, 'run_id': 10313}
  [2026-10-11 13:19] [run 10313] spawned {'pid': 17372, 'started_at': '|179173554550'}
  [2026-10-11 13:19] [run 10313] heartbeat
  [2026-10-11 13:20] [run 10313] heartbeat
  [2026-10-11 13:21] [run 10313] heartbeat
  [2026-10-11 13:22] [run 10313] heartbeat
  [2026-10-11 13:23] [run 10313] heartbeat
  [2026-10-11 13:24] [run 10313] heartbeat
  [2026-10-11 13:25] [run 10313] heartbeat
  [2026-10-11 13:26] [run 10313] heartbeat
  [2026-10-11 13:27] [run 10313] heartbeat
  [2026-10-11 13:28] [run 10313] heartbeat

Runs (1):
  #10313 running      @senior  active  2026-10-11 13:19
