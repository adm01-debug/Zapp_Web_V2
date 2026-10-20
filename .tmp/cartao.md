Task t_1f2f0909: fix(a11y): temporizadores com limpeza no unmount, skip link sem varredura permanente e sem <nav> vazio
  status:    running
  assignee:  iris
  workspace: scratch @ C:\Users\Joaquim Ataides\AppData\Local\hermes\kanban\boards\zapp-web-v2\workspaces\t_1f2f0909
  max-retries: 2 (default)
  created:   2026-10-13 08:20 by claude
  started:   2026-10-13 17:37

Body:
ESPECIALISTA DA ÁREA: iris (telas e componentes). Abra a skill de área do seu perfil antes de editar. A PRIMEIRA LINHA do `.tmp/relato.md` deve ser EXATAMENTE `Especialista: iris`; o relato diz o que mudou, o comando de verificação rodado e a linha de resultado (ex.: `Test Files 3 passed, Tests 27 passed`), sem 'parcial'.
CONTEXTO: segunda passada da auditoria de paridade V3 -> V2 do doc `docs/estado/13-components-ui.md` (primitivos de UI). A 1ª passada gerou os cartões UI-01..UI-10 (SectionErrorBoundary por seção, saneamento do chart, textos de a11y em pt-BR, robustez de dialog/skip-link/timers, banner Supabase, QuickPeek, PhoneInput, paleta, testes de reações): NÃO refaça o que eles cobrem. Relatórios: `docs/audits/AUDITORIA_PARIDADE_V3_DOC_13_2026-10-13_*.md` (enquanto não integrados: `~/hermes-workspaces/.assets/paridade-ui2/`). A V3 é só REFERÊNCIA (`~/projetos/Zapp_Web_V3`, leia com `git -C ~/projetos/Zapp_Web_V3 show origin/main:<caminho>`); a V2 costuma estar melhor: NÃO devolva o que ela já faz melhor e NÃO copie arquivos inteiros (tokens e estruturas diferem): porte o COMPORTAMENTO. FORA DE ESCOPO (decisões do dono): tags/etiquetas (função excluída), exportar/importar/baixar/copiar/imprimir dados novos, edição em massa de contatos, página /design-system, scroll-fade. Os achados foram CONFERIDOS no código da cópia viva da V2 em 13/10/2026, que NÃO contém cartões `done` ainda não integrados (inclusive UI-01..UI-10): antes de editar, procure cartões irmãos em `~/hermes-workspaces/.v2-fila/*.json` e no quadro; se algo já estiver feito, prove no relato em vez de refazer. Confirme a lacuna no código atual antes de mexer.
REGRAS: o cartão compila e passa sozinho (`zapp-verify . --rapido` verde); atualize ou crie testes dos arquivos que tocar e liste-os no relato; sem dependência nova; sem migration nem Edge Function; texto de interface em pt-BR; nada novo que exporte, baixe, copie ou imprima dados; sem log de telefone, token ou texto de mensagem; movimento só em transform/opacity respeitando reduzir movimento; cores só tokens do sistema; mexa SOMENTE nos arquivos listados (se precisar de outro, diga no relato por quê).

PROBLEMA (evidência conferida)
O cartão UI-04 já corrige skip-link (tabindex), `offline-indicator`, `visually-hidden` e timers: leia o trabalho dele na fila e faça só o que sobrar. Pendências conferidas na V2: `ui/skip-link.tsx:93` `setInterval(detect,1500)` permanente em toda a sessão (trocar por `MutationObserver`/mudança de rota) e `<nav>` vazio quando não há alvo; `ui/command-palette.tsx:127-128` `setTimeout(0)` sem clear; `ui/micro-interactions/buttons.tsx:65` ripple sem clear; `ui/offline-indicator.tsx:91` timeout de 3 s no handler sem clear; `ui/quick-peek.tsx:34` guarda o timer em `useState` (re-render a cada hover) sem cleanup no unmount (o UI-06 vai ligá-lo à lista). Contextos sem `useMemo`: `ToggleGroup`, `Form*`. Relatórios: U4-12, U2-08/U2-09/U2-11/U2-13, U3-18.

O QUE FAZER
1. Guarde cada id em `useRef` e limpe no retorno do efeito/unmount; `quick-peek` com timer em ref.
2. Skip link: `MutationObserver` (ou rota) no lugar do intervalo; sem `<nav>` quando não há alvo.
3. `useMemo` nos valores de contexto de `ToggleGroup` e `Form*`.
4. Testes com `vi.useFakeTimers`: após unmount `vi.getTimerCount()` é 0 e não há aviso de estado em componente desmontado.

ARQUIVOS QUE PODE TOCAR
- src/components/ui/skip-link.tsx
- src/components/ui/command-palette.tsx (só os timers)
- src/components/ui/micro-interactions/buttons.tsx
- src/components/ui/offline-indicator.tsx
- src/components/ui/quick-peek.tsx
- src/components/ui/toggle-group.tsx
- src/components/ui/form.tsx
- testes

CRITÉRIO DE PRONTO
1. Nenhum timer pendente após unmount nos 6 componentes (teste).
2. Sem setInterval permanente no skip link.
3. `zapp-verify . --rapido` verde.


Latest summary:
Infra congelada: falta o marcador de modo V2 (~/.local/libexec/hermes-guard/MODO_V2), então hermes-tarefa-iniciar sai com exit 75 "CONGELADO" e não abre workspace (nem cria a branch). Não é defeito do cartão: nenhum workspace novo nasceu em ~/hermes-workspaces/Zapp_Web_V2 desde 10:45 (o diretório da guarda mudou nesse horário) e outros agentes registraram o mesmo exit 75. O marcador é infra do dono (Claude/Joaquim) — não crio/altero arquivo da guarda nem contorno o bloqueio. Pedido de decisão registrado: 20261014-113310-5702-sem-tarefa (restaurar MODO_V2). Assim que o marcador voltar, o cartão abre o workspace e segue normalmente.

Comments (3):
  [2026-10-14 11:33] iris: Bloqueio de infraestrutura (não do cartão): o workspace não abre.

Evidência (14/10/2026):
- `hermes-tarefa-iniciar Zapp_Web_V2 ...` → exit 75, stderr: "CONGELADO: o modo V1 (push/PR/merge/migration/deploy por tarefa) está suspenso pela Arquitetura V2."
- Causa: o portão de modo exige `~/.local/libexec/hermes-guard/MODO_V2` presente junto de `CONGELADO`; o marcador MODO_V2 está AUSENTE (`[ -e .../MODO_V2 ]` → ausente) e o diretório da guarda tem mtime 14/10 10:45 (foi nesse instante que o arquivo sumiu).
- Confirmação por fora: todos os workspaces de `~/hermes-workspaces/Zapp_Web_V2/` têm birth ≤ 10:28 (nenhum nasceu depois de 10:45) e `.decisoes/` recebeu dezenas de pedidos "sem-tarefa" entre 11:27 e 11:31 de outros agentes com o MESMO exit 75. Ou seja, a fábrica inteira está congelada, não é defeito do cartão.
- O dono do marcador é do Claude/Joaquim (a guarda é infra do dono) — eu não crio/altero arquivo da guarda nem contorno o bloqueio.

Registrei `hermes-pedir-decisao` pedindo a restauração do marcador. Assim que MODO_V2 voltar eu abro o workspace, implemento e fecho normalmente.
  [2026-10-15 14:14] default: UNBLOCK: guarda restaurada (MODO_V2 voltou): retomar a abertura/fechamento do cartao
  [2026-10-15 17:45] iris: Achados fora do escopo deste cartão (não corrigidos aqui, arquivo não está em ARQUIVOS QUE PODE TOCAR):

1. `src/components/ui/accessible-toast.tsx:158` — `setInterval` sem limpeza no caminho do arquivo (não verifiquei unmount).
2. `src/components/ui/motion/effects.tsx:89` — `setInterval` de efeito de digitação (tem `clearInterval` no fim da digitação, mas não no unmount).
3. Temporizadores internos de biblioteca, medidos: `<Dialog>` do Radix aberto deixa 2 pendentes após o unmount (medido com `<Dialog open>` puro: montado 2 / desmontado 2) e o `motion.button` do framer-motion deixa 1 (medido com o botão montado e sem clique). Por isso os testes da paleta aberta e do ripple do botão isolam o temporizador do cartão pela queda/linha de base da contagem. `src/components/ui/dialog.tsx` está fora da lista do cartão.

Events (93):
  [2026-10-15 17:29] [run 18600] heartbeat
  [2026-10-15 17:30] [run 18600] heartbeat
  [2026-10-15 17:31] [run 18600] heartbeat
  [2026-10-15 17:32] [run 18600] heartbeat
  [2026-10-15 17:33] [run 18600] heartbeat
  [2026-10-15 17:34] [run 18600] heartbeat
  [2026-10-15 17:35] [run 18600] heartbeat
  [2026-10-15 17:36] [run 18600] heartbeat
  [2026-10-15 17:37] [run 18600] heartbeat
  [2026-10-15 17:38] [run 18600] heartbeat
  [2026-10-15 17:39] [run 18600] heartbeat
  [2026-10-15 17:40] [run 18600] heartbeat
  [2026-10-15 17:41] [run 18600] heartbeat
  [2026-10-15 17:42] [run 18600] heartbeat
  [2026-10-15 17:43] [run 18600] heartbeat
  [2026-10-15 17:44] [run 18600] heartbeat
  [2026-10-15 17:45] [run 18600] heartbeat
  [2026-10-15 17:45] commented {'author': 'iris', 'len': 822}
  [2026-10-15 17:46] [run 18600] heartbeat
  [2026-10-15 17:47] [run 18600] heartbeat

Runs (6):
  #14536 rate_limited @iris  45s  2026-10-13 17:37
        ! pid 43288 exited rate-limited (quota wall) — requeued without counting a failure
  #15044 rate_limited @iris  70s  2026-10-13 17:53
        ! pid 12660 exited rate-limited (quota wall) — requeued without counting a failure
  #15712 rate_limited @iris  56s  2026-10-13 18:16
        ! pid 37744 exited rate-limited (quota wall) — requeued without counting a failure
  #16070 rate_limited @iris  41s  2026-10-13 18:28
        ! pid 35428 exited rate-limited (quota wall) — requeued without counting a failure
  #16600 blocked      @iris  529s  2026-10-14 11:24
        → Infra congelada: falta o marcador de modo V2 (~/.local/libexec/hermes-guard/MODO_V2), então hermes-tarefa-iniciar sai com exit 75 "CONGELADO" e não abre workspa
  #18600 running      @iris  active  2026-10-15 16:49
