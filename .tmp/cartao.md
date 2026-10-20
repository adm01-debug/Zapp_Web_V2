Task t_74a3fd38: [refazer 2] feat(db): RPCs assumir_conversa e devolver_conversa_fila
  status:    running
  assignee:  senior
  workspace: scratch @ C:\Users\Joaquim Ataides\AppData\Local\hermes\kanban\boards\zapp-web-v2\workspaces\t_74a3fd38
  max-retries: 2 (default)
  created:   2026-10-11 11:42 by user
  started:   2026-10-11 14:56

Body:
REFAZER (rodada 2 de 2). A entrega anterior deste trabalho foi RECUSADA e nada entrou.

MOTIVO DA RECUSA: Os 3 pontos da recusa anterior foram resolvidos, mas o diff contradiz a REGRA ADICIONAL do cartão: assume_conversation barra 'resolved' com conversation_not_active, e o teste confirma esse erro, em vez de reabrir a conversa.

O QUE CORRIGIR: Ponto 1: resolvido (M1 assume C_TAKE, devolve, e o teste confere ok, assigned_to NULL, waiting, queue_id e 1 linha de auditoria). Ponto 2: resolvido (a MUTACAO D troca a barreira do dono e faz o contrato falhar no caso novo). Ponto 3: resolvido (a lista de casos do relato bate com o teste). Defeito que o diff mostra e falta corrigir: 1) Na migration, assume_conversation deve deixar de barrar 'resolved': assumir conversa 'resolved' a reabre (conversation_status='open', novo responsável, conversation_status_changed_at atualizado). A FSM permite resolved->open. Mantenha o bloqueio só para 'archived', se quiser, e registre isso no relato. A auditoria já grava previous_status='resolved', o que deixa o evento de reabertura registrado. 2) No teste checa_contrato, troque o caso 'assumir conversa encerrada (conversation_not_active)' sobre C_RES por dois casos: assumir C_RES (resolved) como admin retorna ok=true, status 'open' e assigned_to do admin, com a linha de auditoria mostrando previous_status='resolved'; assumir uma conversa já 'open' (ex.: C_TAKE ou C_WAIT) muda só o responsável e mantém 'open'. Ajuste o cabeçalho do teste ('encerrado -> conversation_not_active') e quaisquer asserções que dependam do C_RES permanecer resolved, como o 'devolver conversa encerrada', que usa C_RES depois do assumir e precisa de uma linha 'resolved' separada ou da ordem corrigida. 3) Atualize o relato para dizer como a REGRA ADICIONAL foi cumprida e liste só os casos que o teste executa de fato.

TRABALHO ANTERIOR (aproveite, não recomece): branch `v2/assume-return-conversation-261011112785a0` (commit 730ec6b20) no repositório; no workspace novo, traga os commits com `git cherry-pick` e corrija só o que foi apontado.

PEDIDO ORIGINAL:
ESPECIALISTA DA ÁREA: workersql (banco de dados, migrations e RLS). Abra a skill de área do seu perfil antes de editar. Comece o relato com a linha `Especialista: workersql`.
Origem: auditoria de paridade V3 -> V2 (docs/audits/AUDITORIA_PARIDADE_V3_CHAT_UI_PARTE1_2026-10-11.md) e decisão do Joaquim em 11/10/2026 (faixa C aprovada: tudo será implementado). Antes de mexer, confira no código ATUAL (dia/2026-10-11) o que já existe; reaproveite o que houver e relate. Se o defeito/lacuna já estiver resolvido, escreva isso em .tmp/relato.md com a prova e feche sem commit de código.

REGRAS DE BANCO: migration ADITIVA em supabase/migrations/ (timestamp posterior ao último). RLS ligada em toda tabela nova, com política explícita (nada de USING (true)). Funções SECURITY DEFINER com SET search_path = pg_catalog, public e checagem de auth.uid(); GRANT só ao papel necessário (REVOKE do público). Papéis: usar is_admin(), is_admin_or_supervisor() ou has_role(). Nenhum dado pessoal (telefone, texto de mensagem) em log ou auditoria. Siga o fluxo de banco do repositório (docs/hermes/FLUXO-HERMES.md, scripts/db-audit, db:guard, ledger de migrations) e atualize os tipos gerados no mesmo cartão. Teste de permissão obrigatório: quem pode, quem não pode e anônimo.

PROBLEMA
A conversa vive em contacts (assigned_to, queue_id, conversation_status). Há Transferir (TransferDialog) mas não existe 'Assumir' nem 'Devolver à fila' com checagem de permissão e auditoria (TicketActionsBar da V3). Decisão do Joaquim: criar assumir + devolver, SEM roteador sticky.

O QUE FAZER
1. Primeiro leia os valores reais de contacts.conversation_status e como a inbox e o SLA os usam; mantenha a semântica existente.
2. public.assume_conversation(p_contact_id uuid): exige auth.uid(); quem pode: membro da fila do contato (queue_members) ou is_admin_or_supervisor(). Se já houver outro responsável, só is_admin_or_supervisor() assume por cima. Define assigned_to=auth.uid(), atualiza conversation_status e conversation_status_changed_at para o estado 'em atendimento' existente, grava audit_logs. Concorrência segura (UPDATE condicionado ao responsável esperado; perdeu a corrida = erro claro).
3. public.return_conversation_to_queue(p_contact_id uuid, p_reason text default null): só o responsável atual ou is_admin_or_supervisor(). Zera assigned_to, mantém queue_id, devolve o status ao estado 'na fila' existente, grava audit_logs com o motivo (sem texto de mensagem). Idempotente.
4. Retornar jsonb com o novo estado (assigned_to, queue_id, conversation_status).
5. Testes: membro da fila assume; não membro não assume; assumir por cima só supervisor; devolver pelo responsável; devolver por outro agente (nega); corrida entre dois agentes (só um vence); anônimo nada.

ARQUIVOS QUE PODE TOCAR
- supabase/migrations/<timestamp>_assume_return_conversation.sql
- testes de banco
- src/integrations/supabase/types.ts (gerado)

CRITÉRIO DE PRONTO
1. Duas RPCs criadas, restritas, auditadas e registradas no ledger.
2. Testes de permissão e de corrida verdes.
3. db:guard e zapp-verify . --rapido verde.

Feche com hermes-tarefa-fechar "<tipo>(<escopo>): <título>" .tmp/relato.md, dizendo no relato como resolveu cada ponto da recusa.

REGRA ADICIONAL (revisão do plano, 11/10): ao ASSUMIR, uma conversa 'resolved' volta ao estado 'em atendimento' (reatribuir após resolvida reabre o ticket) e o evento fica na auditoria; a V3 fazia essa auto-promoção. Cubra com teste: assumir conversa resolvida reabre; assumir conversa aberta não muda o estado além do responsável.

Feche com hermes-tarefa-fechar "<tipo>(<escopo>): <título>" .tmp/relato.md, dizendo no relato como resolveu cada ponto da recusa.

Comments (1):
  [2026-10-11 11:43] default: [jev-entrada] rota=complexo (conf 0.96 → automatico, p_humano=0.01), faixa=migrations, injeção=0.28, ação externa=0.12 — REFAZER: complexo → senior

Events (18):
  [2026-10-11 11:42] created {'assignee': None, 'status': 'ready', 'parents': [], 'creator_task_id': None, 'tenant': None, 'workspace_kind': 'scratch', 'workspace_path': None, 'branch_name': None, 'project_id': None, 'skills': None, 'goal_mode': None, 'model_override': None, 'provider_override': None}
  [2026-10-11 11:43] commented {'author': 'default', 'len': 147}
  [2026-10-11 11:43] assigned {'assignee': 'senior', 'from': None}
  [2026-10-11 11:44] reprioritized {'priority': 1}
  [2026-10-11 14:53] reprioritized {'priority': 9}
  [2026-10-11 14:56] [run 10404] claimed {'lock': 'Joaquim:13456', 'expires': 1791742300, 'run_id': 10404}
  [2026-10-11 14:56] [run 10404] spawned {'pid': 23708, 'started_at': '|179174140005'}
  [2026-10-11 14:56] [run 10404] heartbeat
  [2026-10-11 14:57] [run 10404] heartbeat
  [2026-10-11 14:58] [run 10404] heartbeat
  [2026-10-11 14:59] [run 10404] heartbeat
  [2026-10-11 15:00] [run 10404] heartbeat {'note': 'Refazer em andamento: corrigi a checagem de fila nas RPCs e estou rodando o contrato SQL em Postgres descartável.'}
  [2026-10-11 15:00] [run 10404] heartbeat
  [2026-10-11 15:01] [run 10404] heartbeat
  [2026-10-11 15:03] [run 10404] heartbeat
  [2026-10-11 15:04] [run 10404] heartbeat
  [2026-10-11 15:05] [run 10404] heartbeat
  [2026-10-11 15:06] [run 10404] heartbeat

Runs (1):
  #10404 running      @senior  active  2026-10-11 14:56
