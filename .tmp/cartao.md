Task t_b6d4802b: Auditar testes irmãos com render pesado e timeout padrão
  status:    running
  assignee:  worker
  workspace: scratch @ C:\Users\Joaquim Ataides\AppData\Local\hermes\kanban\boards\zapp-web-v2\workspaces\t_929fd1a5
  max-retries: 2 (default)
  created:   2026-10-13 01:23 by auto-decomposer
  started:   2026-10-13 01:25
  children:  t_929fd1a5

Body:
Objetivo: varrer `src/components/talkx/__tests__/` (e arquivos vizinhos que importem a árvore TalkX) procurando o MESMO padrão de risco: render pesado da árvore completa + `findBy*`/`waitFor` com timeout padrão de 5 s, sem `it(..., <timeout>)`.

Passos:
1. Liste todos os testes da pasta e identifique quais importam a árvore TalkX inteira (imports de componentes de topo/páginas).
2. Para cada um, registre: caminho, teste, uso de findBy/waitFor, timeout explícito (sim/não), e se há mock/leveza de montagem.
3. Classifique por risco (alto/médio/baixo) com base em peso do render e ausência de timeout.

Entregável: lista priorizada no relato final. NÃO corrija nada nesta tarefa — a correção só será feita se for de 1 linha e ficará a critério da tarefa de correção.

Critério de aceite: lista completa e priorizada dos testes com o mesmo risco, pronta para o relato.

Events (9):
  [2026-10-13 01:23] created {'by': 'auto-decomposer', 'from_decompose_of': 't_929fd1a5'}
  [2026-10-13 01:23] promoted
  [2026-10-13 01:24] reprioritized {'priority': 9}
  [2026-10-13 01:25] [run 11941] claimed {'lock': 'Joaquim:32040', 'expires': 1791866442, 'run_id': 11941}
  [2026-10-13 01:25] [run 11941] spawned {'pid': 24472, 'started_at': '|179186554251'}
  [2026-10-13 01:25] [run 11941] heartbeat
  [2026-10-13 01:26] [run 11941] heartbeat
  [2026-10-13 01:27] [run 11941] heartbeat
  [2026-10-13 01:29] [run 11941] heartbeat

Runs (1):
  #11941 running      @worker  active  2026-10-13 01:25
