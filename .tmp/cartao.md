Task t_38d66333: [SYNC20-21] Arvore de integracao: merge simulado dia x origin e decisao (F04)
  status:    running
  assignee:  complexo
  workspace: scratch @ C:\Users\Joaquim Ataides\AppData\Local\hermes\kanban\boards\zapp-web-v2\workspaces\t_38d66333
  max-retries: 2 (default)
  created:   2026-10-17 10:13 by senior
  started:   2026-10-17 10:13

Body:
Plano-sync F04 (Etapas 045-050, 091-095) - DECISAO DE ESTRATEGIA DA ARVORE FINAL. Contexto medido 17/10: dia d723a90107 x origin/main a9b4d6c6fb, merge-base 7a15852791, 1546/79 commits, 952 blobs diferentes, 905 origin-only, 39 HEAD-only. Tres medicoes independentes (SYNC20-05 iris, SYNC20-11 workertestes, SYNC20-06 hugo) provaram: resgate arquivo-a-arquivo da origin sobre a base dia NAO fecha verde (testes exigem producao+componentes+migrations juntos; fechos de 69-394 arquivos).

Sua missao (LOCAL, sem push/merge/aplicar nada):
1. Simulacao somente-leitura: git merge-tree (ou merge em branch descartavel local) dia x origin/main - contar conflitos por area (src/components, hooks, lib, pages, supabase/functions, migrations, scripts, docs) e por tipo (conteudo, add/add, modify/delete). NENHUM commit na dia nem na main.
2. Prototipo de arvore de integracao em branch local propria (a partir da dia): merge da origin, resolucao INICIAL so para medir (pode usar -X ours/theirs por area como experimento declarado, sem fingir que e a resolucao final), rodar typecheck + suite unitaria da arvore resultante e contar vermelhos por area vs os vermelhos conhecidos da main (98 TS, mocks) e do dia (0 TS).
3. Entregar doc de decisao: merge origin->dia e viavel? quantos conflitos reais exigem dono humano/area? qual a ordem de resolucao por area usando os mapas AG2 (c30ac98b7d), SYNC20-05/06/11? Comparar custo com a alternativa (re-corte por camadas) e RECOMENDAR um caminho com numeros.
4. Proibido: push, merge na dia/main, deletar branch, aplicar migration. Branch do prototipo fica local e nomeada como experimento.

Events (65):
  [2026-10-17 10:53] [run 19896] heartbeat
  [2026-10-17 10:53] [run 19896] heartbeat {'note': 'descobri e descartei 2a suite-base rodada por engano no cwd errado; suite do prototipo OURS relancada no diretorio certo. Limpado indice de artefatos .merge_file_* do merge-tree.'}
  [2026-10-17 10:54] [run 19896] heartbeat
  [2026-10-17 10:55] [run 19896] heartbeat
  [2026-10-17 10:56] [run 19896] heartbeat
  [2026-10-17 10:57] [run 19896] heartbeat
  [2026-10-17 10:58] [run 19896] heartbeat
  [2026-10-17 10:59] [run 19896] heartbeat
  [2026-10-17 11:00] [run 19896] heartbeat
  [2026-10-17 11:01] [run 19896] heartbeat
  [2026-10-17 11:02] [run 19896] heartbeat
  [2026-10-17 11:03] [run 19896] heartbeat
  [2026-10-17 11:04] [run 19896] heartbeat
  [2026-10-17 11:05] [run 19896] heartbeat
  [2026-10-17 11:06] [run 19896] heartbeat
  [2026-10-17 11:07] [run 19896] heartbeat
  [2026-10-17 11:08] [run 19896] heartbeat
  [2026-10-17 11:09] [run 19896] heartbeat
  [2026-10-17 11:10] [run 19896] heartbeat
  [2026-10-17 11:11] [run 19896] heartbeat

Runs (1):
  #19896 running      @complexo  active  2026-10-17 10:13
