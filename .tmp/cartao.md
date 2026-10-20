Task t_3d996237: fix(atalhos): a tela de atalhos não promete tecla sem executor (15 atalhos configuráveis sem efeito)
  status:    running
  assignee:  hugo
  workspace: scratch @ C:\Users\Joaquim Ataides\AppData\Local\hermes\kanban\boards\zapp-web-v2\workspaces\t_3d996237
  max-retries: 2 (default)
  created:   2026-10-13 08:22 by claude
  started:   2026-10-13 16:40

Body:
ESPECIALISTA DA ÁREA: hugo (hooks, estado e dados no front). Abra a skill de área do seu perfil antes de editar. A PRIMEIRA LINHA do `.tmp/relato.md` deve ser EXATAMENTE `Especialista: hugo`; o relato diz o que mudou, o comando de verificação rodado e a linha de resultado (ex.: `Test Files 3 passed, Tests 27 passed`), sem 'parcial'.
CONTEXTO: segunda passada da auditoria de paridade V3 -> V2 do doc `docs/estado/13-components-ui.md` (primitivos de UI). A 1ª passada gerou os cartões UI-01..UI-10 (SectionErrorBoundary por seção, saneamento do chart, textos de a11y em pt-BR, robustez de dialog/skip-link/timers, banner Supabase, QuickPeek, PhoneInput, paleta, testes de reações): NÃO refaça o que eles cobrem. Relatórios: `docs/audits/AUDITORIA_PARIDADE_V3_DOC_13_2026-10-13_*.md` (enquanto não integrados: `~/hermes-workspaces/.assets/paridade-ui2/`). A V3 é só REFERÊNCIA (`~/projetos/Zapp_Web_V3`, leia com `git -C ~/projetos/Zapp_Web_V3 show origin/main:<caminho>`); a V2 costuma estar melhor: NÃO devolva o que ela já faz melhor e NÃO copie arquivos inteiros (tokens e estruturas diferem): porte o COMPORTAMENTO. FORA DE ESCOPO (decisões do dono): tags/etiquetas (função excluída), exportar/importar/baixar/copiar/imprimir dados novos, edição em massa de contatos, página /design-system, scroll-fade. Os achados foram CONFERIDOS no código da cópia viva da V2 em 13/10/2026, que NÃO contém cartões `done` ainda não integrados (inclusive UI-01..UI-10): antes de editar, procure cartões irmãos em `~/hermes-workspaces/.v2-fila/*.json` e no quadro; se algo já estiver feito, prove no relato em vez de refazer. Confirme a lacuna no código atual antes de mexer.
REGRAS: o cartão compila e passa sozinho (`zapp-verify . --rapido` verde); atualize ou crie testes dos arquivos que tocar e liste-os no relato; sem dependência nova; sem migration nem Edge Function; texto de interface em pt-BR; nada novo que exporte, baixe, copie ou imprima dados; sem log de telefone, token ou texto de mensagem; movimento só em transform/opacity respeitando reduzir movimento; cores só tokens do sistema; mexa SOMENTE nos arquivos listados (se precisar de outro, diga no relato por quê).

PROBLEMA (evidência conferida)
`hooks/shortcuts/defaultShortcuts.ts` registra 25 atalhos configuráveis; nenhum código fora do registro/ajuda executa: `send-message`, `ai-suggestions`, `focus-input`, `emoji-picker`, `attach-file`, `next-conversation`, `prev-conversation`, `mark-resolved`, `transfer-chat`, `pin-conversation`, `mute-conversation`, `new-message`, `select-all`, `bulk-archive`; os eventos `toggle-theme`, `quick-compose`, `toggle-notifications` são despachados SEM ouvinte. Alguns funcionam por caminho fixo (Ctrl+Enter em `useChatKeyboardNavigation.ts:27`, Ctrl+N/A em `useContactsViewState.ts:54-61`, Ctrl+A em `RealtimeInboxView.tsx:193`). Resultado: Configurações > Atalhos permite trocar uma tecla que não faz nada. O cartão `t_41cbc83a` cobre só a formatação (Ctrl+B/I/E). Decisão E16: sem tecla global `M`. Relatório achados_1 U1-11.

O QUE FAZER
1. Para cada id sem executor, escolha: ligar a um executor real que já exista na tela (ex.: próxima/anterior conversa, marcar resolvida, fixar) OU marcar como 'somente informativo' e tirar da tela de rebind/ajuda. Registre no relato a decisão por id.
2. Teste que percorre `DEFAULT_SHORTCUTS` e falha se um id configurável não tiver executor registrado nem estiver na lista explícita 'somente informativo'.
3. Não capture teclas globalmente fora do escopo da tela (decisão E16).

ARQUIVOS QUE PODE TOCAR
- src/hooks/shortcuts/defaultShortcuts.ts e registro de ações
- telas de configuração e ajuda de atalhos (só o que listam)
- testes

CRITÉRIO DE PRONTO
1. Nenhum atalho editável sem efeito.
2. Teste de varredura verde.
3. `zapp-verify . --rapido` verde.


Latest summary:
Guarda da fábrica CONGELADA: falta o marcador ~/.local/libexec/hermes-guard/MODO_V2 (sumiu ~10:45) e hermes-tarefa-iniciar devolve CONGELADO/rc 75. Não foi possível abrir workspace (nem é permitido contornar a guarda). Decisão pedida em 20261014-113646-532a-sem-tarefa; detalhes em ~/.hermes/tmp/t_3d996237-congelado.md. Restaurar o marcador reabre o cartão para o hugo.

Comments (2):
  [2026-10-14 11:36] hugo: **Travado na ABERTURA do workspace — guarda CONGELADA (não é o cartão).**

Passo 2 (`hermes-tarefa-iniciar Zapp_Web_V2 atalhos-sem-executor`) devolve `CONGELADO ... exit 75`.

Diagnóstico medido (14/10 ~11:34):
- `hermes-tarefa-iniciar` congela quando existe `~/.local/libexec/hermes-guard/CONGELADO` E falta `~/.local/libexec/hermes-guard/MODO_V2`.
- CONGELADO existe (04/10 11:22). **MODO_V2 está ausente**; a mtime da pasta mudou às 10:45:15 — o marcador sumiu por volta das 10:45.
- A fábrica segue viva (último workspace aberto 10:39; fila do integrador recebeu arquivos 11:31). Só a **abertura de workspace novo** ficou bloqueada (nada novo após 10:45).
- Não burlei a guarda: não recriei o marcador nem abri worktree à mão.

O cartão irmão `t_38e58f50` (mesmo perfil) caiu na mesma parede às 11:15 e ficou `blocked (capability)`.

Pedido de decisão registrado: `20261014-113646-532a-sem-tarefa`. Detalhes em `~/.hermes/tmp/t_3d996237-congelado.md`.

Sem workspace não há onde editar/commitar — bloqueio o cartão até o marcador voltar.
  [2026-10-15 14:15] default: UNBLOCK: guarda restaurada (MODO_V2 voltou): retomar a abertura/fechamento do cartao

Events (163):
  [2026-10-15 18:26] [run 18630] heartbeat
  [2026-10-15 18:27] [run 18630] heartbeat
  [2026-10-15 18:28] [run 18630] heartbeat
  [2026-10-15 18:30] [run 18630] heartbeat
  [2026-10-15 18:31] [run 18630] heartbeat
  [2026-10-15 18:32] [run 18630] heartbeat
  [2026-10-15 18:33] [run 18630] heartbeat
  [2026-10-15 18:34] [run 18630] heartbeat
  [2026-10-15 18:35] [run 18630] heartbeat
  [2026-10-15 18:36] [run 18630] heartbeat
  [2026-10-15 18:37] [run 18630] heartbeat
  [2026-10-15 18:38] [run 18630] heartbeat
  [2026-10-15 18:39] [run 18630] heartbeat
  [2026-10-15 18:40] [run 18630] heartbeat
  [2026-10-15 18:41] [run 18630] heartbeat
  [2026-10-15 18:42] [run 18630] heartbeat
  [2026-10-15 18:43] [run 18630] heartbeat
  [2026-10-15 18:44] [run 18630] heartbeat
  [2026-10-15 18:45] [run 18630] heartbeat
  [2026-10-15 18:46] [run 18630] heartbeat

Runs (17):
  #12868 rate_limited @hugo  70s  2026-10-13 16:40
        ! pid 22664 exited rate-limited (quota wall) — requeued without counting a failure
  #13038 rate_limited @hugo  51s  2026-10-13 16:46
        ! pid 16440 exited rate-limited (quota wall) — requeued without counting a failure
  #13221 rate_limited @hugo  43s  2026-10-13 16:52
        ! pid 41948 exited rate-limited (quota wall) — requeued without counting a failure
  #13676 rate_limited @hugo  54s  2026-10-13 17:08
        ! pid 21224 exited rate-limited (quota wall) — requeued without counting a failure
  #13858 rate_limited @hugo  39s  2026-10-13 17:14
        ! pid 25256 exited rate-limited (quota wall) — requeued without counting a failure
  #14042 rate_limited @hugo  38s  2026-10-13 17:20
        ! pid 43672 exited rate-limited (quota wall) — requeued without counting a failure
  #14221 rate_limited @hugo  45s  2026-10-13 17:26
        ! pid 36276 exited rate-limited (quota wall) — requeued without counting a failure
  #14455 rate_limited @hugo  22s  2026-10-13 17:34
        ! pid 23396 exited rate-limited (quota wall) — requeued without counting a failure
  #14693 rate_limited @hugo  50s  2026-10-13 17:42
        ! pid 30380 exited rate-limited (quota wall) — requeued without counting a failure
  #14882 rate_limited @hugo  30s  2026-10-13 17:49
        ! pid 37924 exited rate-limited (quota wall) — requeued without counting a failure
  #15213 rate_limited @hugo  51s  2026-10-13 17:59
        ! pid 42680 exited rate-limited (quota wall) — requeued without counting a failure
  #15396 rate_limited @hugo  42s  2026-10-13 18:06
        ! pid 14224 exited rate-limited (quota wall) — requeued without counting a failure
  #15572 rate_limited @hugo  33s  2026-10-13 18:12
        ! pid 2472 exited rate-limited (quota wall) — requeued without counting a failure
  #15851 rate_limited @hugo  34s  2026-10-13 18:21
        ! pid 16044 exited rate-limited (quota wall) — requeued without counting a failure
  #16060 rate_limited @hugo  53s  2026-10-13 18:28
        ! pid 33932 exited rate-limited (quota wall) — requeued without counting a failure
  #16628 blocked      @hugo  210s  2026-10-14 11:33
        → Guarda da fábrica CONGELADA: falta o marcador ~/.local/libexec/hermes-guard/MODO_V2 (sumiu ~10:45) e hermes-tarefa-iniciar devolve CONGELADO/rc 75. Não foi poss
  #18630 running      @hugo  active  2026-10-15 17:55
