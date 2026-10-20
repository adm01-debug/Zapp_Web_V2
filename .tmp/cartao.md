Task t_0438f11e: fix(admin): erros e vazios visíveis no painel de usuários e senha mínima alinhada
  status:    running
  assignee:  worker
  workspace: scratch @ C:\Users\Joaquim Ataides\AppData\Local\hermes\kanban\boards\zapp-web-v2\workspaces\t_0438f11e
  max-retries: 2 (default)
  created:   2026-10-12 10:37 by claude
  started:   2026-10-12 21:56
  children:  t_672cd537

Body:
ESPECIALISTA DA ÁREA: hugo (hooks, estado e dados no front). Abra a skill de área do seu perfil antes de editar. A PRIMEIRA LINHA do `.tmp/relato.md` deve ser EXATAMENTE `Especialista: hugo`; o relato diz o que mudou, o comando de verificação rodado e a linha de resultado (ex.: `Test Files 3 passed, Tests 27 passed`), sem 'parcial'.
CONTEXTO: auditoria de paridade V3 -> V2 dos docs docs/estado 04 a 16 (auth, admin, inbox, settings, contacts, connections/dashboard) (plano em `docs/plans/PLANO_PARIDADE_V3_DOCS_04_A_16_2026-10-12.md`; enquanto não integrado: `~/hermes-workspaces/.assets/paridade-docs/`). A V3 é só REFERÊNCIA (repositório em `~/projetos/Zapp_Web_V3`, leia com `git -C ~/projetos/Zapp_Web_V3 show origin/main:<caminho>`); a V2 costuma estar melhor: NÃO devolva o que a V2 já faz melhor. FORA DE ESCOPO (decisões do dono): tags/etiquetas de contato ou conversa (função excluída do sistema), exportar/importar/edição em massa, ciclo de vida de negócios (criar/editar/ganhar/perder deal), SLA de Resolução, webhook externo de alerta, persistir QR no navegador. Os achados abaixo foram CONFERIDOS no código da branch viva e no banco real em 12/10/2026; antes de editar, confirme no código ATUAL (a branch do dia muda) e, se algo já estiver feito, prove no relato.
REGRAS: o cartão compila e passa sozinho (`zapp-verify . --rapido` verde); atualize ou crie testes dos arquivos que tocar e liste-os no relato; sem dependência nova; migrations só ADITIVAS, com `-- Rollback:` completo no topo, `SET search_path` e grants explícitos, e PROVA no banco LOCAL com o papel real (agent/anon/service_role) mostrando o que passa e o que é negado; NADA vai para produção (quem aplica é o Joaquim). Texto de interface em pt-BR; nada novo que exporte, baixe, copie ou imprima dados; sem log de telefone, token ou texto de mensagem.

PROBLEMA (evidência conferida)
`useAdminData.ts fetchData` só trata `if (profiles && roles)`: erro de consulta some e a lista fica vazia sem mensagem; auditoria sem filtro de data nem paginação; `handleCreateUser` exige 6 caracteres e a Edge 8 (e `PasswordStrengthMeter` existe sem uso aqui).

O QUE FAZER
1. Toast/estado de erro, `isLoading`, filtro de data e paginação na auditoria; senha mínima 8 com `PasswordStrengthMeter`; testes.

ARQUIVOS QUE PODE TOCAR
- src/components/admin/useAdminData.ts
- testes

CRITÉRIO DE PRONTO
1. Erro nunca vira lista vazia silenciosa.
2. Senha mínima igual à da Edge.
3. `zapp-verify . --rapido` verde.


Events (14):
  [2026-10-12 10:37] created {'assignee': 'hugo', 'status': 'ready', 'parents': [], 'creator_task_id': None, 'tenant': None, 'workspace_kind': 'scratch', 'workspace_path': None, 'branch_name': None, 'project_id': None, 'skills': None, 'goal_mode': None, 'model_override': None, 'provider_override': None}
  [2026-10-12 15:34] assigned {'assignee': 'worker', 'from': 'hugo'}
  [2026-10-12 15:37] reprioritized {'priority': 1}
  [2026-10-12 21:50] reprioritized {'priority': 9}
  [2026-10-12 21:56] [run 11535] claimed {'lock': 'Joaquim:17672', 'expires': 1791853900, 'run_id': 11535}
  [2026-10-12 21:56] [run 11535] spawned {'pid': 32804, 'started_at': '|179185300011'}
  [2026-10-12 21:56] [run 11535] heartbeat
  [2026-10-12 21:57] [run 11535] heartbeat
  [2026-10-12 21:58] [run 11535] heartbeat
  [2026-10-12 21:59] [run 11535] heartbeat
  [2026-10-12 22:00] [run 11535] heartbeat
  [2026-10-12 22:01] [run 11535] heartbeat
  [2026-10-12 22:02] [run 11535] heartbeat
  [2026-10-12 22:03] [run 11535] heartbeat

Runs (1):
  #11535 running      @worker  active  2026-10-12 21:56
