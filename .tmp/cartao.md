Task t_7f02d94c: fix(tarefas): abas do Quadro estreito com alvo de toque de 40px (etapa 099)
  status:    running
  assignee:  worker
  workspace: scratch @ C:\Users\Joaquim Ataides\AppData\Local\hermes\kanban\boards\zapp-web-v2\workspaces\t_7f02d94c
  max-retries: 2 (default)
  created:   2026-10-16 09:24 by iris
  started:   2026-10-16 14:08
  parents:   t_52e80bd2

Body:
Origem: divergência 1 do relatório de verificação independente `docs/tarefas/relatorio-verificacao-099-100.md` (cartão t_54a4bcc7), sobre a entrega da Etapa 099 (t_e840b070 @ 2f08c73ee), já enfileirada ao integrador.

DEFEITO DE PRODUTO: as abas de coluna do Quadro (só existem abaixo de 768 px, que é a tela de toque) usam `min-h-9` = 36 px:
- `src/components/tasks/board/TasksBoardMode.tsx:292` (`role="tab"`): `min-h-9 ...`
- `tailwind.config.ts:241` define `"9": "2.25rem"` = 36 px.
O plano (§5, linha 184) e as REGRAS DE TELA do cartão-mãe exigem "alvos de toque de pelo menos 40 px". O toggle irmão, no MESMO arquivo (linha 257), já usa `min-h-10 min-w-10` = 40 px. Esperado: ≥ 40 px. Observado: 36 px.

O QUE FAZER
- Trocar `min-h-9` por `min-h-10` (ou `min-h-10 min-w-10`) na classe das abas de coluna em `TasksBoardMode.tsx`, alinhando ao toggle irmão. Só isso: não mudar estrutura, tokens de cor nem layout.
- Atualizar/estender o teste próprio da 099 (`src/components/tasks/__tests__/quadroResponsivoAbas.test.tsx`) com um caso que PROVE o alvo de ≥ 40 px na aba (vermelho antes, verde depois).

ARQUIVOS QUE PODE TOCAR
- src/components/tasks/board/TasksBoardMode.tsx
- src/components/tasks/__tests__/quadroResponsivoAbas.test.tsx

DEPENDÊNCIA: a entrega da 099 está na fila do integrador (não integrada na branch do dia). Ache o commit em `~/hermes-workspaces/.v2-fila/*.json` (campo `cartao` = t_e840b070) e, se não estiver no seu workspace, traga a faixa pela base do próprio pai: `git cherry-pick --empty=drop $(git rev-list --reverse --no-merges <base_dia>..<sha>)`. Confira antes `git merge-base --is-ancestor <sha> HEAD` (se já integrado, não traga nada). Só bloqueie se houver conflito que você não resolva, dizendo o arquivo.

CRITÉRIO DE PRONTO
1. Abas de coluna com alvo ≥ 40 px (classe `min-h-10`), citando a linha no relato.
2. Teste próprio provando o alvo ≥ 40 px (nome do caso no relato; falha sem a correção).
3. `npx vitest run src/components/tasks` verde.
4. `zapp-verify . --rapido` verde.

Events (20):
  [2026-10-16 09:24] created {'assignee': 'worker', 'status': 'todo', 'parents': ['t_52e80bd2'], 'creator_task_id': 't_52e80bd2', 'tenant': None, 'workspace_kind': 'scratch', 'workspace_path': None, 'branch_name': None, 'project_id': None, 'skills': None, 'goal_mode': None, 'model_override': None, 'provider_override': None}
  [2026-10-16 09:24] dependency_wait {'reason': 'parent_not_done', 'parent': 't_52e80bd2'}
  [2026-10-16 09:31] promoted
  [2026-10-16 14:08] [run 19762] claimed {'lock': 'Joaquim:25096', 'expires': 1792171422, 'run_id': 19762}
  [2026-10-16 14:08] [run 19762] spawned {'pid': 50088, 'started_at': '|179217052213'}
  [2026-10-16 14:08] [run 19762] heartbeat
  [2026-10-16 14:09] [run 19762] heartbeat
  [2026-10-16 14:11] [run 19762] heartbeat
  [2026-10-16 14:12] [run 19762] heartbeat
  [2026-10-16 14:13] [run 19762] heartbeat
  [2026-10-16 14:14] [run 19762] heartbeat
  [2026-10-16 14:15] [run 19762] heartbeat
  [2026-10-16 14:16] [run 19762] heartbeat
  [2026-10-16 14:17] [run 19762] heartbeat
  [2026-10-16 14:18] [run 19762] heartbeat
  [2026-10-16 14:19] [run 19762] heartbeat
  [2026-10-16 14:20] [run 19762] heartbeat
  [2026-10-16 14:21] [run 19762] heartbeat
  [2026-10-16 14:22] [run 19762] heartbeat
  [2026-10-16 14:23] [run 19762] heartbeat

Runs (1):
  #19762 running      @worker  active  2026-10-16 14:08
