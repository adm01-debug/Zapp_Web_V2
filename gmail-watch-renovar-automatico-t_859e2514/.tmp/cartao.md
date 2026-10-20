Task t_e5f0a946: fix(gmail): renovar a assinatura de notificações (watch) antes de expirar
  status:    running
  assignee:  edgar
  workspace: scratch @ C:\Users\Joaquim Ataides\AppData\Local\hermes\kanban\boards\zapp-web-v2\workspaces\t_e5f0a946
  max-retries: 2 (default)
  created:   2026-10-12 11:23 by claude
  started:   2026-10-13 00:17

Body:
ESPECIALISTA DA ÁREA: edgar (Edge Functions). Abra a skill de área do seu perfil antes de editar. A PRIMEIRA LINHA do `.tmp/relato.md` deve ser EXATAMENTE `Especialista: edgar`; o relato diz o que mudou, o comando de verificação rodado e a linha de resultado (ex.: `Test Files 3 passed, Tests 27 passed`), sem 'parcial'.
CONTEXTO: auditoria de paridade V3 -> V2 dos docs docs/estado 10 a 12 e 17 a 40 (inbox components, team-chat, security/queues, layout/talkx, email/voice, shared, hooks, integrations, services, lib, backend, infra, testes) (plano em `docs/plans/PLANO_PARIDADE_V3_DOCS_10_A_40_2026-10-12.md`; enquanto não integrado: `~/hermes-workspaces/.assets/paridade-resto/`). A V3 é só REFERÊNCIA (repositório em `~/projetos/Zapp_Web_V3`, leia com `git -C ~/projetos/Zapp_Web_V3 show origin/main:<caminho>`); a V2 costuma estar melhor: NÃO devolva o que a V2 já faz melhor. FORA DE ESCOPO (decisões do dono): tags/etiquetas de contato ou conversa (função excluída do sistema), exportar/importar/edição em massa, ciclo de vida de negócios (criar/editar/ganhar/perder deal), SLA de Resolução, webhook externo de alerta, persistir QR no navegador. Os achados abaixo foram CONFERIDOS no código da branch viva e no banco real em 12/10/2026; antes de editar, confirme no código ATUAL (a branch do dia muda) e, se algo já estiver feito, prove no relato.
REGRAS: o cartão compila e passa sozinho (`zapp-verify . --rapido` verde); atualize ou crie testes dos arquivos que tocar e liste-os no relato; sem dependência nova; migrations só ADITIVAS, com `-- Rollback:` completo no topo, `SET search_path` e grants explícitos, e PROVA no banco LOCAL com o papel real (agent/anon/service_role) mostrando o que passa e o que é negado; NADA vai para produção (quem aplica é o Joaquim). Texto de interface em pt-BR; nada novo que exporte, baixe, copie ou imprima dados; sem log de telefone, token ou texto de mensagem.

PROBLEMA (evidência conferida)
`gmail-sync` tem `setup-watch` (`index.ts:184-198`) mas só é chamado manualmente; o watch do Gmail expira em 7 dias. O polling do `gmail-cron-sync` cobre a perda do push, então a lacuna é leve.

O QUE FAZER
1. Renovação automática (no cron do Gmail, a cada 24 h por conta, idempotente) com registro do vencimento; testes Deno.

ARQUIVOS QUE PODE TOCAR
- supabase/functions/gmail-cron-sync/index.ts
- supabase/functions/gmail-sync/index.ts
- testes

CRITÉRIO DE PRONTO
1. Watch nunca expira em silêncio.
2. `zapp-verify . --rapido` verde.


Events (17):
  [2026-10-12 11:23] created {'assignee': 'edgar', 'status': 'ready', 'parents': [], 'creator_task_id': None, 'tenant': None, 'workspace_kind': 'scratch', 'workspace_path': None, 'branch_name': None, 'project_id': None, 'skills': None, 'goal_mode': None, 'model_override': None, 'provider_override': None}
  [2026-10-12 18:34] assigned {'assignee': 'worker', 'from': 'edgar'}
  [2026-10-12 18:37] reprioritized {'priority': 1}
  [2026-10-12 19:40] assigned {'assignee': 'edgar', 'from': 'worker'}
  [2026-10-12 19:41] reprioritized {'priority': 5}
  [2026-10-13 00:17] reprioritized {'priority': 9}
  [2026-10-13 00:17] [run 11821] claimed {'lock': 'Joaquim:32040', 'expires': 1791862337, 'run_id': 11821}
  [2026-10-13 00:17] [run 11821] spawned {'pid': 17152, 'started_at': '|179186143783'}
  [2026-10-13 00:17] [run 11821] heartbeat
  [2026-10-13 00:18] [run 11821] heartbeat
  [2026-10-13 00:19] [run 11821] heartbeat
  [2026-10-13 00:20] [run 11821] heartbeat
  [2026-10-13 00:21] [run 11821] heartbeat
  [2026-10-13 00:22] [run 11821] heartbeat
  [2026-10-13 00:23] [run 11821] heartbeat
  [2026-10-13 00:24] [run 11821] heartbeat
  [2026-10-13 00:25] [run 11821] heartbeat

Runs (1):
  #11821 running      @edgar  active  2026-10-13 00:17
