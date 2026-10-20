Task t_971ad0d8: fix(inbox): a seleção em lote acompanha o filtro: nada age sobre conversa que o usuário não vê
  status:    running
  assignee:  hugo
  workspace: scratch @ C:\Users\Joaquim Ataides\AppData\Local\hermes\kanban\boards\zapp-web-v2\workspaces\t_971ad0d8
  max-retries: 2 (default)
  created:   2026-10-13 07:49 by claude
  started:   2026-10-13 12:25
  parents:   t_2901d317
  children:  t_4399fba9, t_51f95ddb

Body:
ESPECIALISTA DA ÁREA: hugo (hooks, estado e dados no front). Abra a skill de área do seu perfil antes de editar. A PRIMEIRA LINHA do `.tmp/relato.md` deve ser EXATAMENTE `Especialista: hugo`; o relato diz o que mudou, o comando de verificação rodado e a linha de resultado (ex.: `Test Files 3 passed, Tests 27 passed`), sem 'parcial'.
CONTEXTO: segunda passada da auditoria de paridade V3 -> V2 do doc docs/estado/06-features-inbox-hooks.md (hooks do inbox) (plano em `docs/plans/PLANO_PARIDADE_V3_HOOKS_INBOX_PASSADA2_2026-10-13.md`; enquanto não integrado: `~/hermes-workspaces/.assets/paridade-docs/`). A V3 é só REFERÊNCIA (repositório em `~/projetos/Zapp_Web_V3`, leia com `git -C ~/projetos/Zapp_Web_V3 show origin/main:<caminho>`); a V2 costuma estar melhor: NÃO devolva o que a V2 já faz melhor. FORA DE ESCOPO (decisões do dono): tags/etiquetas de contato ou conversa (função excluída do sistema), exportar/importar/edição em massa, ciclo de vida de negócios (criar/editar/ganhar/perder deal), SLA de Resolução, webhook externo de alerta, persistir QR no navegador. Os achados abaixo foram CONFERIDOS no código da branch viva e no banco real em 13/10/2026; antes de editar, confirme no código ATUAL (a branch do dia muda) e, se algo já estiver feito, prove no relato.
REGRAS: o cartão compila e passa sozinho (`zapp-verify . --rapido` verde); atualize ou crie testes dos arquivos que tocar e liste-os no relato; sem dependência nova; migrations só ADITIVAS, com `-- Rollback:` completo no topo, `SET search_path` e grants explícitos, e PROVA no banco LOCAL com o papel real (agent/anon/service_role) mostrando o que passa e o que é negado; NADA vai para produção (quem aplica é o Joaquim). Texto de interface em pt-BR; nada novo que exporte, baixe, copie ou imprima dados; sem log de telefone, token ou texto de mensagem.

DEPENDÊNCIA: este cartão parte do trabalho dos cartões pai, que podem estar done mas NÃO integrados. Se o que eles fazem não estiver no seu workspace, ache o commit em `~/hermes-workspaces/.v2-fila/*.json` (campo `cartao` = id do pai) e traga a FAIXA inteira: `git cherry-pick --empty=drop $(git rev-list --reverse --no-merges <base_dia do JSON do pai>..<sha do pai>)`; se `git merge-base --is-ancestor <sha> HEAD` já for verdade, não traga. Só bloqueie se houver conflito que você não resolva, dizendo o arquivo.

PROBLEMA (evidência conferida)
`src/hooks/inbox/useInboxBulkActions.ts:~14,43-48`: `selectedIds` é um `Set` que nunca é podado; `filteredConversations` só é lido por `selectAll`. Trocar de chip, fila, tipo ou busca mantém a seleção e Arquivar/Marcar lido/Transferir agem sobre conversas que o usuário não vê mais, com o contador contando todas. A V3 tinha o mesmo defeito. PD-84/PD-85 tratam a contagem do resultado e o fechamento do diálogo, não isto.

O QUE FAZER
1. Pode a seleção (interseção por id) quando `filteredConversations` muda, OU limpe ao trocar de chip/filtro; se mantiver, o toolbar diz 'N selecionadas (M fora da lista atual)'.
2. `selectAll` seleciona só o filtrado (documente em comentário curto).
3. Teste.

ARQUIVOS QUE PODE TOCAR
- src/hooks/inbox/useInboxBulkActions.ts
- src/hooks/inbox/__tests__/

CRITÉRIO DE PRONTO
1. Ação em lote só atinge o que está visível (teste).
2. `zapp-verify . --rapido` verde.


Events (19):
  [2026-10-13 07:49] created {'assignee': 'hugo', 'status': 'ready', 'parents': ['t_2901d317'], 'creator_task_id': None, 'tenant': None, 'workspace_kind': 'scratch', 'workspace_path': None, 'branch_name': None, 'project_id': None, 'skills': None, 'goal_mode': None, 'model_override': None, 'provider_override': None}
  [2026-10-13 07:50] reprioritized {'priority': 5}
  [2026-10-13 12:20] reprioritized {'priority': 9}
  [2026-10-13 12:25] [run 12497] claimed {'lock': 'Joaquim:28972', 'expires': 1791906006, 'run_id': 12497}
  [2026-10-13 12:25] [run 12497] spawned {'pid': 30348, 'started_at': '|179190510650'}
  [2026-10-13 12:25] [run 12497] heartbeat
  [2026-10-13 12:26] [run 12497] heartbeat
  [2026-10-13 12:27] [run 12497] heartbeat
  [2026-10-13 12:28] [run 12497] heartbeat
  [2026-10-13 12:29] [run 12497] heartbeat
  [2026-10-13 12:30] [run 12497] heartbeat
  [2026-10-13 12:32] [run 12497] heartbeat
  [2026-10-13 12:33] [run 12497] heartbeat
  [2026-10-13 12:34] [run 12497] heartbeat
  [2026-10-13 12:35] [run 12497] heartbeat
  [2026-10-13 12:36] [run 12497] heartbeat
  [2026-10-13 12:37] [run 12497] heartbeat
  [2026-10-13 12:38] [run 12497] heartbeat
  [2026-10-13 12:39] [run 12497] heartbeat

Runs (1):
  #12497 running      @hugo  active  2026-10-13 12:25
