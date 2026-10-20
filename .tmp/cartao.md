Task t_7055f245: fix(admin): adicionar e remover papel pela RPC, nunca por insert/delete direto
  status:    running
  assignee:  hugo
  workspace: scratch @ C:\Users\Joaquim Ataides\AppData\Local\hermes\kanban\boards\zapp-web-v2\workspaces\t_7055f245
  max-retries: 2 (default)
  created:   2026-10-12 10:36 by claude
  started:   2026-10-13 01:26
  parents:   t_911b61b1
  children:  t_277eeaa4

Body:
ESPECIALISTA DA ÁREA: hugo (hooks, estado e dados no front). Abra a skill de área do seu perfil antes de editar. A PRIMEIRA LINHA do `.tmp/relato.md` deve ser EXATAMENTE `Especialista: hugo`; o relato diz o que mudou, o comando de verificação rodado e a linha de resultado (ex.: `Test Files 3 passed, Tests 27 passed`), sem 'parcial'.
CONTEXTO: auditoria de paridade V3 -> V2 dos docs docs/estado 04 a 16 (auth, admin, inbox, settings, contacts, connections/dashboard) (plano em `docs/plans/PLANO_PARIDADE_V3_DOCS_04_A_16_2026-10-12.md`; enquanto não integrado: `~/hermes-workspaces/.assets/paridade-docs/`). A V3 é só REFERÊNCIA (repositório em `~/projetos/Zapp_Web_V3`, leia com `git -C ~/projetos/Zapp_Web_V3 show origin/main:<caminho>`); a V2 costuma estar melhor: NÃO devolva o que a V2 já faz melhor. FORA DE ESCOPO (decisões do dono): tags/etiquetas de contato ou conversa (função excluída do sistema), exportar/importar/edição em massa, ciclo de vida de negócios (criar/editar/ganhar/perder deal), SLA de Resolução, webhook externo de alerta, persistir QR no navegador. Os achados abaixo foram CONFERIDOS no código da branch viva e no banco real em 12/10/2026; antes de editar, confirme no código ATUAL (a branch do dia muda) e, se algo já estiver feito, prove no relato.
REGRAS: o cartão compila e passa sozinho (`zapp-verify . --rapido` verde); atualize ou crie testes dos arquivos que tocar e liste-os no relato; sem dependência nova; migrations só ADITIVAS, com `-- Rollback:` completo no topo, `SET search_path` e grants explícitos, e PROVA no banco LOCAL com o papel real (agent/anon/service_role) mostrando o que passa e o que é negado; NADA vai para produção (quem aplica é o Joaquim). Texto de interface em pt-BR; nada novo que exporte, baixe, copie ou imprima dados; sem log de telefone, token ou texto de mensagem.

DEPENDÊNCIA: este cartão parte do trabalho dos cartões pai, que podem estar done mas NÃO integrados. Se o que eles fazem não estiver no seu workspace, ache o commit em `~/hermes-workspaces/.v2-fila/*.json` (campo `cartao` = id do pai) e traga a FAIXA inteira: `git cherry-pick --empty=drop $(git rev-list --reverse --no-merges <base_dia do JSON do pai>..<sha do pai>)`; se `git merge-base --is-ancestor <sha> HEAD` já for verdade, não traga. Só bloqueie se houver conflito que você não resolva, dizendo o arquivo.

PROBLEMA (evidência conferida)
Ver PD-10. `useRolesPageState.ts` ainda escreve direto em `user_roles`.

O QUE FAZER
1. Troque as duas mutações pelas RPCs `admin_add_role`/`admin_remove_role`; mostre a mensagem de cada recusa (último admin, auto-remoção) em pt-BR; invalide o cache de papéis.
2. Testes: sucesso, último admin recusado, auto-remoção recusada.

ARQUIVOS QUE PODE TOCAR
- src/pages/admin/useRolesPageState.ts
- testes

CRITÉRIO DE PRONTO
1. Nenhuma escrita direta em `user_roles` no front.
2. Recusas explicadas.
3. `zapp-verify . --rapido` verde.


Events (12):
  [2026-10-12 10:36] created {'assignee': 'hugo', 'status': 'todo', 'parents': ['t_911b61b1'], 'creator_task_id': None, 'tenant': None, 'workspace_kind': 'scratch', 'workspace_path': None, 'branch_name': None, 'project_id': None, 'skills': None, 'goal_mode': None, 'model_override': None, 'provider_override': None}
  [2026-10-12 10:36] dependency_wait {'reason': 'parent_not_done', 'parent': 't_911b61b1'}
  [2026-10-13 01:25] promoted
  [2026-10-13 01:26] [run 11942] claimed {'lock': 'Joaquim:32040', 'expires': 1791866484, 'run_id': 11942}
  [2026-10-13 01:26] [run 11942] spawned {'pid': 26460, 'started_at': '|179186558454'}
  [2026-10-13 01:26] reprioritized {'priority': 5}
  [2026-10-13 01:26] [run 11942] heartbeat
  [2026-10-13 01:27] [run 11942] heartbeat
  [2026-10-13 01:28] [run 11942] heartbeat
  [2026-10-13 01:29] [run 11942] heartbeat
  [2026-10-13 01:30] [run 11942] heartbeat
  [2026-10-13 01:31] [run 11942] heartbeat

Runs (1):
  #11942 running      @hugo  active  2026-10-13 01:26
