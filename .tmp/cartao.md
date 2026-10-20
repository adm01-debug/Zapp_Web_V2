Task t_007f8fb0: fix(seguranca): anon com TRUNCATE/escrita em 17 tabelas de contatos/mensagens
  status:    running
  assignee:  workersql
  workspace: scratch @ C:\Users\Joaquim Ataides\AppData\Local\hermes\kanban\boards\zapp-web-v2\workspaces\t_007f8fb0
  max-retries: 2 (default)
  created:   2026-10-10 20:39 by user
  started:   2026-10-10 20:42

Body:
PROBLEMA (docs/audits/SEGURANCA_RLS_CONTATOS_MENSAGENS_2026-10-07.md, SEC-RLS_CONTATOS_MENSAGENS-05 — ainda real)
schema-manifest.json → relation_grants — 17 tabelas (conversation_events,
contact_custom_fields, message_reactions, scheduled_messages, etc. — lista exata no
relatório) ainda concedem SELECT/INSERT/UPDATE/DELETE/TRUNCATE/... a `anon`. Não é
explorável hoje via PostgREST (toda policy exige auth.uid()), mas TRUNCATE ignora RLS —
é defesa em profundidade, não correção de exploração ativa.

O QUE FAZER
REVOKE ALL PRIVILEGES das 17 tabelas (lista exata no relatório SEC-RLS_CONTATOS_
MENSAGENS-05) de `anon`, alinhando ao padrão já usado em contacts/messages/contact_notes.

ARQUIVOS QUE PODE TOCAR
- nova migration mecânica em supabase/migrations/

CRITÉRIO DE PRONTO
1. relation_grants (schema-manifest.json ou consulta equivalente) confirma zero
   privilégio de anon nas 17 tabelas.
2. Nenhuma tela legítima quebrou (todas usam auth, não anon).
3. zapp-verify . --rapido verde.


Events (18):
  [2026-10-10 20:39] created {'assignee': 'workersql', 'status': 'ready', 'parents': [], 'creator_task_id': None, 'tenant': None, 'workspace_kind': 'scratch', 'workspace_path': None, 'branch_name': None, 'project_id': None, 'skills': None, 'goal_mode': None, 'model_override': None, 'provider_override': None}
  [2026-10-10 20:40] reprioritized {'priority': 5}
  [2026-10-10 20:42] [run 10009] claimed {'lock': 'Joaquim:16708', 'expires': 1791676662, 'run_id': 10009}
  [2026-10-10 20:42] [run 10009] spawned {'pid': 20520, 'started_at': '|179167576226'}
  [2026-10-10 20:42] [run 10009] heartbeat
  [2026-10-10 20:43] [run 10009] heartbeat
  [2026-10-10 20:44] [run 10009] heartbeat
  [2026-10-10 20:45] [run 10009] heartbeat
  [2026-10-10 20:46] [run 10009] heartbeat
  [2026-10-10 20:47] [run 10009] heartbeat
  [2026-10-10 20:48] [run 10009] heartbeat
  [2026-10-10 20:49] [run 10009] heartbeat
  [2026-10-10 20:50] [run 10009] heartbeat
  [2026-10-10 20:51] [run 10009] heartbeat
  [2026-10-10 20:53] [run 10009] heartbeat
  [2026-10-10 20:54] [run 10009] heartbeat
  [2026-10-10 20:55] [run 10009] heartbeat
  [2026-10-10 20:56] [run 10009] heartbeat

Runs (1):
  #10009 running      @workersql  active  2026-10-10 20:42
