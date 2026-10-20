Task t_6b581677: fix(a11y): nomes acessíveis nos botões de ícone de mobile e inbox (reduz a linha de base do UK-13a)
  status:    running
  assignee:  iris
  workspace: scratch @ C:\Users\Joaquim Ataides\AppData\Local\hermes\kanban\boards\zapp-web-v2\workspaces\t_6b581677
  max-retries: 2 (default)
  created:   2026-10-13 08:21 by claude
  started:   2026-10-13 17:53
  parents:   t_9d25b0a2

Body:
ESPECIALISTA DA ÁREA: iris (telas e componentes). Abra a skill de área do seu perfil antes de editar. A PRIMEIRA LINHA do `.tmp/relato.md` deve ser EXATAMENTE `Especialista: iris`; o relato diz o que mudou, o comando de verificação rodado e a linha de resultado (ex.: `Test Files 3 passed, Tests 27 passed`), sem 'parcial'.
CONTEXTO: segunda passada da auditoria de paridade V3 -> V2 do doc `docs/estado/13-components-ui.md` (primitivos de UI). A 1ª passada gerou os cartões UI-01..UI-10 (SectionErrorBoundary por seção, saneamento do chart, textos de a11y em pt-BR, robustez de dialog/skip-link/timers, banner Supabase, QuickPeek, PhoneInput, paleta, testes de reações): NÃO refaça o que eles cobrem. Relatórios: `docs/audits/AUDITORIA_PARIDADE_V3_DOC_13_2026-10-13_*.md` (enquanto não integrados: `~/hermes-workspaces/.assets/paridade-ui2/`). A V3 é só REFERÊNCIA (`~/projetos/Zapp_Web_V3`, leia com `git -C ~/projetos/Zapp_Web_V3 show origin/main:<caminho>`); a V2 costuma estar melhor: NÃO devolva o que ela já faz melhor e NÃO copie arquivos inteiros (tokens e estruturas diferem): porte o COMPORTAMENTO. FORA DE ESCOPO (decisões do dono): tags/etiquetas (função excluída), exportar/importar/baixar/copiar/imprimir dados novos, edição em massa de contatos, página /design-system, scroll-fade. Os achados foram CONFERIDOS no código da cópia viva da V2 em 13/10/2026, que NÃO contém cartões `done` ainda não integrados (inclusive UI-01..UI-10): antes de editar, procure cartões irmãos em `~/hermes-workspaces/.v2-fila/*.json` e no quadro; se algo já estiver feito, prove no relato em vez de refazer. Confirme a lacuna no código atual antes de mexer.
REGRAS: o cartão compila e passa sozinho (`zapp-verify . --rapido` verde); atualize ou crie testes dos arquivos que tocar e liste-os no relato; sem dependência nova; sem migration nem Edge Function; texto de interface em pt-BR; nada novo que exporte, baixe, copie ou imprima dados; sem log de telefone, token ou texto de mensagem; movimento só em transform/opacity respeitando reduzir movimento; cores só tokens do sistema; mexa SOMENTE nos arquivos listados (se precisar de outro, diga no relato por quê).

PROBLEMA (evidência conferida)
Continuação do UK-13a: os botões de ícone sem nome acessível, começando pelas pastas `src/components/mobile/` e `src/components/inbox/` (maior uso). Texto em pt-BR, específico ('Fechar painel', não 'Botão').

O QUE FAZER
1. Leia a linha de base `src/__tests__/a11y/icon-buttons-baseline.json` (entregue pelo UK-13a; se ainda não integrada, rode a mesma busca e registre a contagem).
2. Corrija todas as ocorrências de `mobile/` e `inbox/` e remova-as da linha de base.
3. Não altere comportamento nem layout.

ARQUIVOS QUE PODE TOCAR
- src/components/mobile/**
- src/components/inbox/** (só aria-label/title/sr-only)
- src/__tests__/a11y/icon-buttons-baseline.json

CRITÉRIO DE PRONTO
1. Zero ocorrências em mobile/ e inbox/ na varredura.
2. Linha de base menor e teste verde.
3. `zapp-verify . --rapido` verde.


Latest summary:
hermes-tarefa-iniciar congela com exit 75 (CONGELADO presente e MODO_V2 ausente em ~/.local/libexec/hermes-guard/, alterado 14/10 10:45). Sem workspace não consigo editar, testar nem fechar o cartão. Não contornei a guarda. Decisão pedida ao Joaquim: 20261014-113118-4c13-sem-tarefa. Falta: restaurar MODO_V2 (ou liberar o modo) e reiniciar o cartão.

Comments (2):
  [2026-10-14 11:31] iris: Sem workspace: `hermes-tarefa-iniciar Zapp_Web_V2 ...` saiu com exit 75 —

    CONGELADO: o modo V1 (push/PR/merge/migration/deploy por tarefa) está suspenso pela Arquitetura V2.

Causa real (conferida): o arquivo `/home/joaquim_ataides/.local/libexec/hermes-guard/MODO_V2` **não existe** (o diretório `hermes-guard` foi alterado hoje 14/10 às 10:45). Com `CONGELADO` presente e `MODO_V2` ausente, a guarda trava o `iniciar`/`fechar`. O último workspace criado com sucesso foi às 10:39 (ia-janela-limitada-422-periodo-2610141039aa5e); do 10:45 em diante outros cartões caíram no mesmo bloqueio (t_cca276de, t_4128d906).

Não contornei a guarda (não criei o MODO_V2 nem abri worktree à mão). Decisão pedida ao Joaquim: `hermes-pedir-decisao` → id `20261014-113118-4c13-sem-tarefa`. Sem workspace não há código, teste nem relato para este cartão.
  [2026-10-15 14:14] default: UNBLOCK: guarda restaurada (MODO_V2 voltou): retomar a abertura/fechamento do cartao

Events (32):
  [2026-10-14 11:31] commented {'author': 'iris', 'len': 844}
  [2026-10-14 11:31] [run 16608] blocked {'reason': 'hermes-tarefa-iniciar congela com exit 75 (CONGELADO presente e MODO_V2 ausente em ~/.local/libexec/hermes-guard/, alterado 14/10 10:45). Sem workspace não consigo editar, testar nem fechar o cartão. Não contornei a guarda. Decisão pedida ao Joaquim: 20261014-113118-4c13-sem-tarefa. Falta: restaurar MODO_V2 (ou liberar o modo) e reiniciar o cartão.', 'kind': 'capability', 'recurrences': 1, 'source_status': 'ready'}
  [2026-10-15 14:14] commented {'author': 'default', 'len': 84}
  [2026-10-15 14:14] unblocked
  [2026-10-15 17:27] [run 18611] claimed {'lock': 'Joaquim:38172', 'expires': 1792096936, 'run_id': 18611}
  [2026-10-15 17:27] [run 18611] spawned {'pid': 42536, 'started_at': '|179209603640'}
  [2026-10-15 17:27] [run 18611] heartbeat
  [2026-10-15 17:28] [run 18611] heartbeat
  [2026-10-15 17:29] [run 18611] heartbeat
  [2026-10-15 17:30] [run 18611] heartbeat
  [2026-10-15 17:31] [run 18611] heartbeat
  [2026-10-15 17:32] [run 18611] heartbeat
  [2026-10-15 17:33] [run 18611] heartbeat
  [2026-10-15 17:34] [run 18611] heartbeat
  [2026-10-15 17:35] [run 18611] heartbeat
  [2026-10-15 17:36] [run 18611] heartbeat
  [2026-10-15 17:37] [run 18611] heartbeat
  [2026-10-15 17:38] [run 18611] heartbeat
  [2026-10-15 17:39] [run 18611] heartbeat
  [2026-10-15 17:40] [run 18611] heartbeat

Runs (3):
  #15052 rate_limited @iris  58s  2026-10-13 17:53
        ! pid 10868 exited rate-limited (quota wall) — requeued without counting a failure
  #16608 blocked      @iris  165s  2026-10-14 11:28
        → hermes-tarefa-iniciar congela com exit 75 (CONGELADO presente e MODO_V2 ausente em ~/.local/libexec/hermes-guard/, alterado 14/10 10:45). Sem workspace não cons
  #18611 running      @iris  active  2026-10-15 17:27
