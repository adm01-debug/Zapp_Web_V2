Task t_675d0cac: [refazer 1] feat(db): RPCs assumir_conversa e devolver_conversa_fila
  status:    running
  assignee:  senior
  workspace: scratch @ C:\Users\Joaquim Ataides\AppData\Local\hermes\kanban\boards\zapp-web-v2\workspaces\t_675d0cac
  max-retries: 2 (default)
  created:   2026-10-11 10:03 by user
  started:   2026-10-11 11:25

Body:
REFAZER (rodada 1 de 2). A entrega anterior deste trabalho foi RECUSADA e nada entrou.

MOTIVO DA RECUSA: A migration está correta e no escopo: é aditiva, tem Rollback real, SECURITY DEFINER com search_path, portão de auth.uid(), REVOKE de PUBLIC/anon com GRANT só a authenticated, UPDATE condicionado para a corrida e auditoria sem PII. Os dois arquivos fora da lista (o .test.sh e a entrada na ALLOWLIST) estão justificados no relato. Porém falta um teste que o cartão exige: devolver pelo responsável não-admin. O relato afirma essa cobertura ('devolver por dono/admin'), mas o diff não a mostra. Observações não bloqueantes: o registro no ledger de migrations não aparece no diff (presumo automático, a verificação posterior confirma); return_conversation_to_queue em contato sem dono e com status 'open' devolve 'open' sem mover para 'waiting', o que é aceitável como idempotência.

O QUE CORRIGIR: 1) Em checa_contrato, acrescente o caso que o cartão pede, 'devolver pelo responsável': um agente comum dono da conversa (ex.: M1 com C_TAKE, depois de assumir) chama return_conversation_to_queue como pref_m1 e recebe ok=true, assigned_to NULL, status 'waiting', queue_id mantida e 1 linha de auditoria. Hoje só o admin devolve, e o admin também é o dono depois do takeover, então o caminho 'dono não-admin' nunca roda. 2) Crie uma mutação (ou estenda uma existente) que troque 'v_contact.assigned_to <> v_profile_id AND NOT v_is_admin' por 'NOT v_is_admin' e prove que o contrato FALHA, cobrindo a barreira do dono. 3) Corrija o relato para que a lista de casos provados bata com o que o teste executa de fato (dono não-admin devolve; admin devolve; outro agente é negado).

TRABALHO ANTERIOR (aproveite, não recomece): branch `v2/assume-return-conversation-26101109368c30` (commit d45670117) no repositório; no workspace novo, traga os commits com `git cherry-pick` e corrija só o que foi apontado.

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

Comments (1):
  [2026-10-11 10:04] default: [jev-entrada] rota=complexo (conf 0.76 → coordenador, p_humano=0.03), faixa=migrations, injeção=0.29, ação externa=0.10 — REFAZER: complexo → senior

Events (15):
  [2026-10-11 10:03] created {'assignee': None, 'status': 'ready', 'parents': [], 'creator_task_id': None, 'tenant': None, 'workspace_kind': 'scratch', 'workspace_path': None, 'branch_name': None, 'project_id': None, 'skills': None, 'goal_mode': None, 'model_override': None, 'provider_override': None}
  [2026-10-11 10:04] commented {'author': 'default', 'len': 148}
  [2026-10-11 10:04] assigned {'assignee': 'senior', 'from': None}
  [2026-10-11 10:05] reprioritized {'priority': 1}
  [2026-10-11 11:25] reprioritized {'priority': 9}
  [2026-10-11 11:25] [run 10245] claimed {'lock': 'Joaquim:15012', 'expires': 1791729651, 'run_id': 10245}
  [2026-10-11 11:25] [run 10245] spawned {'pid': 15672, 'started_at': '|179172875185'}
  [2026-10-11 11:25] [run 10245] heartbeat
  [2026-10-11 11:27] [run 10245] heartbeat
  [2026-10-11 11:28] [run 10245] heartbeat
  [2026-10-11 11:29] [run 10245] heartbeat
  [2026-10-11 11:29] [run 10245] heartbeat {'note': 'Refazer 1: cherry-pick anterior OK (4 arquivos); adicionado caso dono não-admin + MUTACAO D; 1ª rodada do contrato verde, indo para prova registrada em log.'}
  [2026-10-11 11:30] [run 10245] heartbeat
  [2026-10-11 11:31] [run 10245] heartbeat
  [2026-10-11 11:32] [run 10245] heartbeat

Runs (1):
  #10245 running      @senior  active  2026-10-11 11:25
