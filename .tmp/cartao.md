Task t_a6049cc7: fix(a11y): movimento reduzido vale para o framer-motion no app inteiro (MotionConfig na raiz) e nas ilustrações que nunca param
  status:    running
  assignee:  iris
  workspace: scratch @ C:\Users\Joaquim Ataides\AppData\Local\hermes\kanban\boards\zapp-web-v2\workspaces\t_a6049cc7
  max-retries: 2 (default)
  created:   2026-10-13 08:20 by claude
  started:   2026-10-13 16:52
  children:  t_5b60e125, t_a0562af3

Body:
ESPECIALISTA DA ÁREA: iris (telas e componentes). Abra a skill de área do seu perfil antes de editar. A PRIMEIRA LINHA do `.tmp/relato.md` deve ser EXATAMENTE `Especialista: iris`; o relato diz o que mudou, o comando de verificação rodado e a linha de resultado (ex.: `Test Files 3 passed, Tests 27 passed`), sem 'parcial'.
CONTEXTO: segunda passada da auditoria de paridade V3 -> V2 do doc `docs/estado/13-components-ui.md` (primitivos de UI). A 1ª passada gerou os cartões UI-01..UI-10 (SectionErrorBoundary por seção, saneamento do chart, textos de a11y em pt-BR, robustez de dialog/skip-link/timers, banner Supabase, QuickPeek, PhoneInput, paleta, testes de reações): NÃO refaça o que eles cobrem. Relatórios: `docs/audits/AUDITORIA_PARIDADE_V3_DOC_13_2026-10-13_*.md` (enquanto não integrados: `~/hermes-workspaces/.assets/paridade-ui2/`). A V3 é só REFERÊNCIA (`~/projetos/Zapp_Web_V3`, leia com `git -C ~/projetos/Zapp_Web_V3 show origin/main:<caminho>`); a V2 costuma estar melhor: NÃO devolva o que ela já faz melhor e NÃO copie arquivos inteiros (tokens e estruturas diferem): porte o COMPORTAMENTO. FORA DE ESCOPO (decisões do dono): tags/etiquetas (função excluída), exportar/importar/baixar/copiar/imprimir dados novos, edição em massa de contatos, página /design-system, scroll-fade. Os achados foram CONFERIDOS no código da cópia viva da V2 em 13/10/2026, que NÃO contém cartões `done` ainda não integrados (inclusive UI-01..UI-10): antes de editar, procure cartões irmãos em `~/hermes-workspaces/.v2-fila/*.json` e no quadro; se algo já estiver feito, prove no relato em vez de refazer. Confirme a lacuna no código atual antes de mexer.
REGRAS: o cartão compila e passa sozinho (`zapp-verify . --rapido` verde); atualize ou crie testes dos arquivos que tocar e liste-os no relato; sem dependência nova; sem migration nem Edge Function; texto de interface em pt-BR; nada novo que exporte, baixe, copie ou imprima dados; sem log de telefone, token ou texto de mensagem; movimento só em transform/opacity respeitando reduzir movimento; cores só tokens do sistema; mexa SOMENTE nos arquivos listados (se precisar de outro, diga no relato por quê).

PROBLEMA (evidência conferida)
A regra CSS global de `prefers-reduced-motion` não alcança o framer-motion (JS). 350 arquivos da V2 importam `framer-motion`; só `components/contacts/ContactsView.tsx:122` tem `<MotionConfig reducedMotion="user">`. As 13 ilustrações de `ui/empty-state-illustrations.tsx` e o badge de `GenericEmptyState` têm loops infinitos (`repeat: Infinity`) sem checar `useReducedMotion`. `AnimatedCounter` (`ui/motion`) usa `prevRef` como objeto novo a cada render e anima sempre do zero. Relatórios: U4-14, U2-17, U2-07, U3-02.

O QUE FAZER
1. Envolva a árvore em `<MotionConfig reducedMotion="user">` em `src/providers/AppProviders.tsx` (confirme o local certo) e remova o do ContactsView.
2. Nas ilustrações e no badge pulsante: com movimento reduzido, estado estático (sem loop).
3. Corrija `AnimatedCounter` (valor anterior em `useRef` estável; anima do valor anterior ao novo) e `Typewriter` (mostra o texto completo no modo reduzido; `onComplete` em ref para não reiniciar o efeito).
4. Testes: com `matchMedia('(prefers-reduced-motion: reduce)')` verdadeiro não há animação contínua; um único `MotionConfig` na raiz; AnimatedCounter não reinicia ao re-renderizar com o mesmo valor.

ARQUIVOS QUE PODE TOCAR
- src/providers/AppProviders.tsx
- src/components/contacts/ContactsView.tsx (só remover o MotionConfig)
- src/components/ui/empty-state-illustrations.tsx
- src/components/ui/GenericEmptyState.tsx
- src/components/ui/motion/effects.tsx
- testes

CRITÉRIO DE PRONTO
1. 1 MotionConfig na raiz.
2. Nenhum loop infinito com reduzir movimento.
3. Testes de contador e typewriter verdes.
4. `zapp-verify . --rapido` verde.


Latest summary:
Guarda de infra congela o início: `hermes-tarefa-iniciar Zapp_Web_V2 a11y-motionconfig-raiz-illustracoes` devolve exit 75 ("CONGELADO: o modo V1 está suspenso") e não imprime WORKSPACE=. Conferido agora: /home/joaquim_ataides/.local/libexec/hermes-guard/CONGELADO EXISTE e MODO_V2 FALTA (dir do guard mexido hoje 10:45). Sem workspace não há onde editar; nenhum arquivo tocado, nenhum diff. Relato gravado em .tmp/relato.md (1ª linha `Especialista: iris`). Falta apenas a guarda liberar o ciclo V2 (criar MODO_V2) — não contornei a guarda e não repeti o comando. O trabalho é pequeno e já está mapeado no relato.

Comments (6):
  [2026-10-14 11:29] default: [supervisor] REINICIAR: Sem diff e sem nenhuma edição: o agente travou em `hermes-tarefa-iniciar` (exit 75) e passou o log investigando guard/ESTOP e o kanban.db fora do escopo, enquanto a sessão anterior morreu por falta de créditos no OpenRouter.
ORIENTAÇÃO: Não investigue o hermes-guard, o ESTOP nem o kanban.db: isso está fora do cartão. Rode `hermes-tarefa-iniciar` uma única vez; se voltar exit 75, escreva em `.tmp/relato.md` (primeira linha `Especialista: iris`) que o início foi bloqueado e pare, sem repetir o comando. Se iniciar, abra a skill da iris, confirme a lacuna em `src/providers/AppProviders.tsx`, `ui/empty-state-illustrations.tsx`, `GenericEmptyState` e `ui/motion` (AnimatedCounter) e faça os itens 1 a 3. Depois rode `zapp-verify . --rapido` e liste os testes tocados no relato. Antes de reiniciar, confira também se o provedor tem créditos, senão o novo agente cai no mesmo erro.
  [2026-10-14 11:29] iris: Especialista: iris (telas e componentes)

BLOQUEIO DE INFRA/GUARDA — não consegui abrir workspace.

Passo 2 do fluxo (`hermes-tarefa-iniciar Zapp_Web_V2 a11y-motionconfig-raiz-illustracoes`) devolve:

    CONGELADO: o modo V1 (push/PR/merge/migration/deploy por tarefa) está suspenso pela Arquitetura V2.
    Não tente contornar. Estacione: deixe o trabalho no workspace, registre o estado com hermes-pedir-decisao e pare.
    exit_code=75

Causa exata, verificada agora no host:
- `test -e /home/joaquim_ataides/.local/libexec/hermes-guard/CONGELADO` -> existe (de 2026-10-04T11:22:18-03:00)
- `test -e /home/joaquim_ataides/.local/libexec/hermes-guard/MODO_V2` -> FALTA (o marcador que descongela o ciclo V2)
- O script `/home/joaquim_ataides/.local/bin/hermes-tarefa-iniciar` (linhas 5-10) só sai do ciclo V1 quando `MODO_V2` existe; sem ele todo `hermes-tarefa-iniciar` sai 75, inclusive `--help`.

Também conferido:
- `~/hermes-workspaces/.por-cartao/t_a6049cc7` não existe (nenhum workspace criado antes para este cartão)
- `git worktree list` no repo de referência não tem nenhum worktree deste cartão
- Casa com a triagem do coordenador no cartão t_d5094301: "t_6eeeeca9 tem bloqueio legítimo de infra/guarda (CONGELADO presente, MODO_V2 ausente, exit 75, sem workspace)"

Não contornei a guarda: não criei `MODO_V2`, não criei worktree à mão e não usei o workspace scratch do Windows (caminho `$HERMES_KANBAN_WORKSPACE` dá exit 126 no WSL). O histórico de runs deste cartão mostra o mesmo exit 75 sendo classificado como "rate-limited" pelo dispatcher (runs 14524, 14722, 14963, 15229, 15541, 15888, 16079) — ou seja, não é quota, é o congelamento.

O trabalho está pronto para começar assim que `MODO_V2` voltar: o cartão é claro (MotionConfig na raiz em src/providers/AppProviders.tsx, remoção em ContactsView, loops infinitos de empty-state-illustrations/GenericEmptyState, AnimatedCounter e Typewriter).
  [2026-10-14 11:30] iris: Especialista: iris

Nota para quem pegar este cartão no próximo dispatch: esta run (run_id 16589) foi reclamada manualmente
(`manual_reclaim`, pid 11880) e o cartão voltou para `ready` — por isso o `kanban_block` não fecha mais a
partir daqui. Estado desta run: nenhuma edição, nenhum diff.

Relato desta run gravado em:
`C:\Users\Joaquim Ataides\AppData\Local\hermes\kanban\boards\zapp-web-v2\workspaces\t_a6049cc7\.tmp\relato.md`
(primeira linha `Especialista: iris`).

Conteúdo resumido: `hermes-tarefa-iniciar Zapp_Web_V2 a11y-motionconfig-raiz-illustracoes` rodado uma única
vez devolveu exit 75 ("CONGELADO: o modo V1 ... está suspenso pela Arquitetura V2") e não imprimiu
`WORKSPACE=`; sem workspace não houve onde editar. Nada foi tocado no repositório.
  [2026-10-14 11:34] iris: Especialista: iris

Run 16621 (14/10 11:32 -03): `hermes-tarefa-iniciar Zapp_Web_V2 a11y-motionconfig-raiz-illustracoes` rodado uma única vez, exit 75 ("CONGELADO...") e sem linha `WORKSPACE=`. Marcadores conferidos agora: CONGELADO existe, MODO_V2 falta. Nenhum arquivo tocado, nenhum diff.

Relato gravado (primeira linha `Especialista: iris`):
`C:\Users\Joaquim Ataides\AppData\Local\hermes\kanban\boards\zapp-web-v2\workspaces\t_a6049cc7\.tmp\relato.md`

Paro aqui conforme a orientação do supervisor (não repetir o comando, não contornar a guarda).
  [2026-10-15 14:11] default: UNBLOCK: desbloqueio em lote: estava preso por infra (MODO_V2 ausente na guarda, exit 75), flag reposta em 15/10
  [2026-10-15 17:26] iris: Escopo: além dos 5 arquivos do cartão + testes, o diff cria **src/components/ui/empty-state-illustration-art.tsx** (novo). É indispensável e proposital: para o módulo que exporta o mapa `illustrations` passar na regra da casa `react-refresh/only-export-components`, o desenho das 13 ilustrações (que agora usa `useReducedMotion`) saiu para um módulo só de componentes — mesma separação de `src/lib/chunkReload.ts` / `src/lib/catalogShared.ts`. Sem o arquivo novo o lint acusa 13 avisos e o ratchet do pre-commit (baseline 0) reprova o commit. Nenhum consumidor mudou: `empty-state.tsx` e `empty-states.tsx` continuam lendo `illustrations[...]`.

Events (137):
  [2026-10-15 17:08] [run 18589] heartbeat
  [2026-10-15 17:09] [run 18589] heartbeat
  [2026-10-15 17:10] [run 18589] heartbeat
  [2026-10-15 17:11] [run 18589] heartbeat
  [2026-10-15 17:12] [run 18589] heartbeat
  [2026-10-15 17:13] [run 18589] heartbeat
  [2026-10-15 17:14] [run 18589] heartbeat
  [2026-10-15 17:15] [run 18589] heartbeat
  [2026-10-15 17:16] [run 18589] heartbeat
  [2026-10-15 17:17] [run 18589] heartbeat
  [2026-10-15 17:18] [run 18589] heartbeat
  [2026-10-15 17:19] [run 18589] heartbeat
  [2026-10-15 17:21] [run 18589] heartbeat
  [2026-10-15 17:22] [run 18589] heartbeat
  [2026-10-15 17:23] [run 18589] heartbeat
  [2026-10-15 17:24] [run 18589] heartbeat
  [2026-10-15 17:25] [run 18589] heartbeat
  [2026-10-15 17:26] commented {'author': 'iris', 'len': 644}
  [2026-10-15 17:26] [run 18589] heartbeat
  [2026-10-15 17:27] [run 18589] heartbeat

Runs (15):
  #13202 rate_limited @iris  35s  2026-10-13 16:52
        ! pid 43448 exited rate-limited (quota wall) — requeued without counting a failure
  #13381 rate_limited @iris  36s  2026-10-13 16:58
        ! pid 44940 exited rate-limited (quota wall) — requeued without counting a failure
  #13763 rate_limited @iris  35s  2026-10-13 17:11
        ! pid 41428 exited rate-limited (quota wall) — requeued without counting a failure
  #13987 rate_limited @iris  34s  2026-10-13 17:18
        ! pid 36684 exited rate-limited (quota wall) — requeued without counting a failure
  #14277 rate_limited @iris  38s  2026-10-13 17:28
        ! pid 25396 exited rate-limited (quota wall) — requeued without counting a failure
  #14524 rate_limited @iris  57s  2026-10-13 17:36
        ! pid 26580 exited rate-limited (quota wall) — requeued without counting a failure
  #14722 rate_limited @iris  39s  2026-10-13 17:43
        ! pid 16668 exited rate-limited (quota wall) — requeued without counting a failure
  #14963 rate_limited @iris  22s  2026-10-13 17:51
        ! pid 42740 exited rate-limited (quota wall) — requeued without counting a failure
  #15229 rate_limited @iris  40s  2026-10-13 18:00
        ! pid 29584 exited rate-limited (quota wall) — requeued without counting a failure
  #15541 rate_limited @iris  43s  2026-10-13 18:11
        ! pid 30608 exited rate-limited (quota wall) — requeued without counting a failure
  #15888 rate_limited @iris  57s  2026-10-13 18:22
        ! pid 43660 exited rate-limited (quota wall) — requeued without counting a failure
  #16079 rate_limited @iris  36s  2026-10-13 18:28
        ! pid 19380 exited rate-limited (quota wall) — requeued without counting a failure
  #16589 reclaimed    @iris  465s  2026-10-14 11:21
        ! manual_reclaim lock=Joaquim:28864
  #16621 blocked      @iris  188s  2026-10-14 11:31
        → Guarda de infra congela o início: `hermes-tarefa-iniciar Zapp_Web_V2 a11y-motionconfig-raiz-illustracoes` devolve exit 75 ("CONGELADO: o modo V1 está suspenso")
  #18589 running      @iris  active  2026-10-15 16:34
