Task t_9d25b0a2: test(a11y): varredura automática de botão de ícone sem nome acessível (trava para não crescer)
  status:    running
  assignee:  workertestes
  workspace: scratch @ C:\Users\Joaquim Ataides\AppData\Local\hermes\kanban\boards\zapp-web-v2\workspaces\t_9d25b0a2
  max-retries: 2 (default)
  created:   2026-10-13 08:21 by claude
  started:   2026-10-13 13:35
  children:  t_6b581677

Body:
ESPECIALISTA DA ÁREA: workertestes (testes, e2e e regressão visual). Abra a skill de área do seu perfil antes de editar. A PRIMEIRA LINHA do `.tmp/relato.md` deve ser EXATAMENTE `Especialista: workertestes`; o relato diz o que mudou, o comando de verificação rodado e a linha de resultado (ex.: `Test Files 3 passed, Tests 27 passed`), sem 'parcial'.
CONTEXTO: segunda passada da auditoria de paridade V3 -> V2 do doc `docs/estado/13-components-ui.md` (primitivos de UI). A 1ª passada gerou os cartões UI-01..UI-10 (SectionErrorBoundary por seção, saneamento do chart, textos de a11y em pt-BR, robustez de dialog/skip-link/timers, banner Supabase, QuickPeek, PhoneInput, paleta, testes de reações): NÃO refaça o que eles cobrem. Relatórios: `docs/audits/AUDITORIA_PARIDADE_V3_DOC_13_2026-10-13_*.md` (enquanto não integrados: `~/hermes-workspaces/.assets/paridade-ui2/`). A V3 é só REFERÊNCIA (`~/projetos/Zapp_Web_V3`, leia com `git -C ~/projetos/Zapp_Web_V3 show origin/main:<caminho>`); a V2 costuma estar melhor: NÃO devolva o que ela já faz melhor e NÃO copie arquivos inteiros (tokens e estruturas diferem): porte o COMPORTAMENTO. FORA DE ESCOPO (decisões do dono): tags/etiquetas (função excluída), exportar/importar/baixar/copiar/imprimir dados novos, edição em massa de contatos, página /design-system, scroll-fade. Os achados foram CONFERIDOS no código da cópia viva da V2 em 13/10/2026, que NÃO contém cartões `done` ainda não integrados (inclusive UI-01..UI-10): antes de editar, procure cartões irmãos em `~/hermes-workspaces/.v2-fila/*.json` e no quadro; se algo já estiver feito, prove no relato em vez de refazer. Confirme a lacuna no código atual antes de mexer.
REGRAS: o cartão compila e passa sozinho (`zapp-verify . --rapido` verde); atualize ou crie testes dos arquivos que tocar e liste-os no relato; sem dependência nova; sem migration nem Edge Function; texto de interface em pt-BR; nada novo que exporte, baixe, copie ou imprima dados; sem log de telefone, token ou texto de mensagem; movimento só em transform/opacity respeitando reduzir movimento; cores só tokens do sistema; mexa SOMENTE nos arquivos listados (se precisar de outro, diga no relato por quê).

PROBLEMA (evidência conferida)
Estimativa por regex: ~35% dos `<Button size="icon">` da V2 (112 de 322, em 72 arquivos) estão sem `aria-label`, `title` ou `sr-only` (V3: 20%). Nem V2 nem V3 têm `eslint-plugin-jsx-a11y`. `IconButton` (`ui/icon-button.tsx:44`) já obriga `aria-label` pela tipagem, mas só 1 tela o usa. Relatório U3-19.

O QUE FAZER
1. Crie um teste vitest (sem dependência nova) que lê `src/**/*.tsx` e acha `<Button ... size="icon...">` e `<IconButton>` sem nome acessível (aria-label, aria-labelledby, title ou filho com `sr-only`), tratando atributos depois de `=>` corretamente (use o parser do TypeScript já instalado, não regex de primeiro `>`).
2. Grave a lista atual como linha de base (`src/__tests__/a11y/icon-buttons-baseline.json`); o teste FALHA se surgir ocorrência fora da linha de base e se a linha de base tiver entrada já corrigida (para ela só encolher).
3. No relato, a contagem exata por pasta, ordenada, para o cartão de correção UK-13b.

ARQUIVOS QUE PODE TOCAR
- src/__tests__/a11y/ (novo teste + linha de base)

CRITÉRIO DE PRONTO
1. Teste verde com a linha de base atual; falha ao adicionar um botão de ícone sem nome (prove com um caso sintético).
2. Contagem por pasta no relato.
3. `zapp-verify . --rapido` verde.


Events (11):
  [2026-10-13 08:21] created {'assignee': 'workertestes', 'status': 'ready', 'parents': [], 'creator_task_id': None, 'tenant': None, 'workspace_kind': 'scratch', 'workspace_path': None, 'branch_name': None, 'project_id': None, 'skills': None, 'goal_mode': None, 'model_override': None, 'provider_override': None}
  [2026-10-13 13:17] reprioritized {'priority': 9}
  [2026-10-13 13:35] [run 12532] claimed {'lock': 'Joaquim:28972', 'expires': 1791910207, 'run_id': 12532}
  [2026-10-13 13:35] [run 12532] spawned {'pid': 35812, 'started_at': '|179190930779'}
  [2026-10-13 13:35] [run 12532] heartbeat
  [2026-10-13 13:36] [run 12532] heartbeat
  [2026-10-13 13:37] [run 12532] heartbeat
  [2026-10-13 13:38] [run 12532] heartbeat
  [2026-10-13 13:39] [run 12532] heartbeat
  [2026-10-13 13:40] [run 12532] heartbeat
  [2026-10-13 13:41] [run 12532] heartbeat

Runs (1):
  #12532 running      @workertestes  active  2026-10-13 13:35
