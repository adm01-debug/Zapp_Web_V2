Task t_0819e1a9: [refazer 1] [retomar] fix(a11y): dica e rótulo no botão de acessibilidade da sidebar
  status:    running
  assignee:  senior
  workspace: scratch @ C:\Users\Joaquim Ataides\AppData\Local\hermes\kanban\boards\zapp-web-v2\workspaces\t_0819e1a9
  max-retries: 2 (default)
  created:   2026-10-12 08:35 by user
  started:   2026-10-12 18:05

Body:
REFAZER (rodada 1 de 2). A entrega anterior deste trabalho foi RECUSADA e nada entrou.

MOTIVO DA RECUSA: marcado pelo Claude em 12/10: aprovado, mas CONFLITA com a ponta de dia/2026-10-12; segue para retomada por rebase

O QUE CORRIGIR: Traga dia/2026-10-09 atual para o workspace (merge/rebase), resolva o conflito preservando o que já entrou nela, rode o teste do cartão e `zapp-verify full .` e feche de novo.

TRABALHO ANTERIOR (aproveite, não recomece): branch `v2/a11y-dica-botao-acessibilidade-2610090014499f` (commit cf28870d9) no repositório; no workspace novo, traga os commits com `git cherry-pick` e corrija só o que foi apontado.

PEDIDO ORIGINAL:
ESPECIALISTA DA ÁREA: worker (telas). Abra `area-front-componentes` com skill_view antes de editar qualquer arquivo. Depois abra também `afinar-telas`. Comece o relato com a linha `Especialista: worker (telas) (area-front-componentes)`.

PLANO: docs/plans/PLANO_CONTROLES_VOLUME_SIDEBAR_50_ETAPAS_2026-10-07.md

CONTEXTO MEDIDO (leia a seção 1 do plano): na sidebar, 'Controles rápidos', o alto-falante (volume dos ALERTAS, SoundVolumeControl) e o fone (volume das MÍDIAS, MediaVolumeToggle/MediaVolumeControl) só abrem o slider com CLIQUE LONGO (400 ms, useVolumeRocker.LONG_PRESS_MS); o clique comum só muda o mudo; ninguém sabe do slider; no toque o slider fecha ao soltar o dedo; 3 dos 6 botões não têm dica. O dono quer: uma forma CLARA de subir, abaixar e anular o som nos dois controles. NÃO quebre o que funciona: tecla M, setas ±5, Esc, persistência, os 67 testes existentes do volume e tests/contracts/media-volume-surfaces.contract.test.ts.

ETAPA S27 do plano (docs/plans/PLANO_CONTROLES_VOLUME_SIDEBAR_50_ETAPAS_2026-10-07.md), decisão D03.
O botão de acessibilidade da sidebar (ícone de círculo dividido; componente AccessibilitySettings — ache o arquivo com git grep 'export function AccessibilitySettings') NÃO tem dica ao passar o mouse (medido: nenhuma em 4 s; sem title nem aria-describedby). Adicione Tooltip no padrão do botão de tema vizinho: 'Acessibilidade — alto contraste, menos movimento, texto grande'. Confirme que o aria-label atual ('Configurações de acessibilidade') se mantém. Funciona com a sidebar recolhida (dica à direita).
Teste: dica aparece ao focar e ao passar o mouse; aria-label inalterado.
ARQUIVOS (SÓ estes): o arquivo do AccessibilitySettings e o teste dele (existente ou novo em __tests__). NÃO toque em Sidebar.tsx (outro cartão edita) nem nos arquivos de volume.
CRITÉRIO DE PRONTO: ver as etapas citadas e os testes verdes.

ENTREGA: no workspace do cartão (hermes-tarefa-iniciar). Confira no código atual que os pontos existem. Teste que prove a mudança (vermelho antes, verde depois). Liste no relato TODOS os caminhos do mesmo defeito (git grep) e confira `git diff --stat` contra o título antes do relato. Antes de fechar rode o juiz barato (jev-juiz pronto .tmp/relato.md). Verificação: zapp-verify . --rapido. Feche com hermes-tarefa-fechar "fix(a11y): dica e rótulo no botão de acessibilidade da sidebar" .tmp/relato.md.

Feche com hermes-tarefa-fechar "<tipo>(<escopo>): <título>" .tmp/relato.md, dizendo como resolveu o motivo acima. REGRAS: nenhuma informação sai do sistema; só cores/tokens existentes; sem DDL/Edge/dependência nova salvo se o pedido original exigia.

Feche com hermes-tarefa-fechar "<tipo>(<escopo>): <título>" .tmp/relato.md, dizendo no relato como resolveu cada ponto da recusa.

Comments (2):
  [2026-10-12 08:37] default: [jev-entrada] pré-filtro de ação externa: \bmerge\b → RETIDO (pede ação fora do repositório local)
  [2026-10-12 08:41] default: [revisor-entrada] [jev-entrada] claude liberou → senior: Correção de a11y em um componente (tooltip no AccessibilitySettings) com teste, mais rebase/resolução de conflito no repositório local; não toca ferramental da fábrica, chaves nem guardas, e nada sai da máquina.

Events (11):
  [2026-10-12 08:35] created {'assignee': None, 'status': 'ready', 'parents': [], 'creator_task_id': None, 'tenant': None, 'workspace_kind': 'scratch', 'workspace_path': None, 'branch_name': None, 'project_id': None, 'skills': None, 'goal_mode': None, 'model_override': None, 'provider_override': None}
  [2026-10-12 08:37] commented {'author': 'default', 'len': 98}
  [2026-10-12 08:41] commented {'author': 'default', 'len': 268}
  [2026-10-12 08:41] assigned {'assignee': 'senior', 'from': None}
  [2026-10-12 08:42] reprioritized {'priority': 1}
  [2026-10-12 18:02] reprioritized {'priority': 9}
  [2026-10-12 18:05] [run 11230] claimed {'lock': 'Joaquim:13636', 'expires': 1791840022, 'run_id': 11230}
  [2026-10-12 18:05] [run 11230] spawned {'pid': 14780, 'started_at': '|179183912300'}
  [2026-10-12 18:05] [run 11230] heartbeat
  [2026-10-12 18:06] [run 11230] heartbeat
  [2026-10-12 18:07] [run 11230] heartbeat

Runs (1):
  #11230 running      @senior  active  2026-10-12 18:05
