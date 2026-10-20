Task t_db5a2a7c: [refazer 2] test(tarefas): capturas Playwright da linha de base visual (etapa 003)
  status:    running
  assignee:  senior
  workspace: scratch @ C:\Users\Joaquim Ataides\AppData\Local\hermes\kanban\boards\zapp-web-v2\workspaces\t_db5a2a7c
  max-retries: 2 (default)
  created:   2026-10-12 10:47 by user
  started:   2026-10-14 12:23

Body:
REFAZER (rodada 2 de 2). A entrega anterior deste trabalho foi RECUSADA e nada entrou.

MOTIVO DA RECUSA: marcado pelo Claude em 12/10: aprovado, mas CONFLITA com a ponta de dia/2026-10-12; segue para retomada por rebase

O QUE CORRIGIR: Traga dia/2026-10-11 atual para o workspace (merge/rebase), resolva o conflito preservando o que já entrou nela, rode o teste do cartão e `zapp-verify full .` e feche de novo.

TRABALHO ANTERIOR (aproveite, não recomece): branch `v2/t-43cc5f04-26101121116511` (commit 01ab08e01) no repositório; no workspace novo, traga os commits com `git cherry-pick` e corrija só o que foi apontado.

PEDIDO ORIGINAL:
Etapa 003 do PLANO_TAREFAS_NIVEL_DESIGN_200_ETAPAS (cópia em ~/hermes-workspaces/.assets/tarefas/PLANO_TAREFAS_NIVEL_DESIGN_200_ETAPAS_2026-10-11.md). Carve-out do cartão t_2a2dac8a (que entregou as etapas 004 e 009).

OBJETIVO: capturas Playwright "antes" das 5 superfícies do módulo de Tarefas — Lista, Quadro, Agenda, painel de edição (WorkItemSheet) e QuickAdd — nos temas CLARO e ESCURO e nas larguras 360, 768 e 1280 px (30 imagens), na branch atual do dia, para medir a evolução e detectar regressão. Guardar as imagens FORA do repositório, em ~/hermes-workspaces/.assets/tarefas/linha-de-base-<AAAA-MM-DD>/.

DADOS: usar a semente local já entregue: `scripts/tarefas/seed-local-imagens.ts` (bun, banco local; ver docs/tarefas/LINHA_DE_BASE.md seção 1). Usuário sintético e2e.tarefas@example.com (senha no próprio script).

REGRAS (inegociáveis): R1 de E2E — só banco LOCAL, usuário sintético criado por mim; nada de produção, nada de e2e/.auth existente, nada de --mode production. Subir o dev server apontando para o banco local via VITE_ZAPP_LOCAL_SUPABASE_URL / VITE_ZAPP_LOCAL_SUPABASE_ANON_KEY (valores de `zapp-db-local env . <copia>`).

PROVA: as 30 imagens existem no diretório de assets + as saídas (caminhos e tamanhos) no relato. Se a captura for instável sob carga, registrar a taxa de falha medida.

MOTIVO DO CARVE-OUT: a lane de captura (dev server + login local + 30 telas) excede o orçamento de 60 min de um cartão worker.

Feche com hermes-tarefa-fechar "<tipo>(<escopo>): <título>" .tmp/relato.md, dizendo no relato como resolveu cada ponto da recusa.

Feche com hermes-tarefa-fechar "<tipo>(<escopo>): <título>" .tmp/relato.md, dizendo no relato como resolveu cada ponto da recusa.

Comments (3):
  [2026-10-12 10:49] default: [jev-entrada] pré-filtro de ação externa: \bmerge\b → RETIDO (pede ação fora do repositório local)
  [2026-10-12 10:51] default: [revisor-entrada] [jev-entrada] claude liberou → senior: Trabalho restrito ao repositório local: rebase/cherry-pick da branch anterior, resolver conflito, rodar testes de captura Playwright com banco local e usuário sintético, imagens gravadas em ~/hermes-workspaces/.assets (fora do repo, sem push/deploy). Não edita ferramental da fábrica nem mexe em chaves reais ou guardas.
  [2026-10-15 14:26] default: UNBLOCK: desbloqueio em lote: o modelo do perfil senior (openai-codex/gpt-5.5) voltou a responder (teste 15/10 13:55)

Events (39):
  [2026-10-15 22:36] [run 18780] claimed {'lock': 'Joaquim:38172', 'expires': 1792115489, 'run_id': 18780}
  [2026-10-15 22:36] [run 18780] spawned {'pid': 38424, 'started_at': '|179211458915'}
  [2026-10-15 22:36] [run 18780] heartbeat
  [2026-10-15 22:37] [run 18780] heartbeat
  [2026-10-15 22:38] [run 18780] heartbeat
  [2026-10-15 22:39] [run 18780] heartbeat
  [2026-10-15 22:40] [run 18780] heartbeat
  [2026-10-15 22:41] [run 18780] heartbeat
  [2026-10-15 22:42] [run 18780] heartbeat
  [2026-10-15 22:43] [run 18780] heartbeat
  [2026-10-15 22:44] [run 18780] heartbeat {'note': 'rebase na ponta dia/2026-10-11 feito (bb1a5209af); rodando a captura Playwright das 30 imagens'}
  [2026-10-15 22:44] [run 18780] heartbeat
  [2026-10-15 22:45] [run 18780] heartbeat
  [2026-10-15 22:46] [run 18780] heartbeat
  [2026-10-15 22:47] [run 18780] heartbeat
  [2026-10-15 22:48] [run 18780] heartbeat
  [2026-10-15 22:49] [run 18780] heartbeat
  [2026-10-15 22:50] [run 18780] heartbeat
  [2026-10-15 22:51] [run 18780] heartbeat
  [2026-10-15 22:52] [run 18780] heartbeat

Runs (3):
  #16866 crashed      @senior  34s  2026-10-14 12:23
        ! pid 26096 exited with code 1 Worker's last output: 't-5.5\' model is not supported when \x1b[0m\x1b[38;2;255;215;0m \x1b[0m \x1b[38;2;255;215;0m \x1b[0m\x1b[38;
  #16871 crashed      @senior  22s  2026-10-14 12:23
        ! pid 3548 exited with code 1 Worker's last output: 't-5.5\' model is not supported when \x1b[0m\x1b[38;2;255;215;0m \x1b[0m \x1b[38;2;255;215;0m \x1b[0m\x1b[38;2
  #18780 running      @senior  active  2026-10-15 22:36
