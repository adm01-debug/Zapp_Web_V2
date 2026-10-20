Task t_90dcdcc8: fix(a11y): nome/papel acessível faltando (6 pontos)
  status:    running
  assignee:  iris
  workspace: scratch @ C:\Users\Joaquim Ataides\AppData\Local\hermes\kanban\boards\zapp-web-v2\workspaces\t_90dcdcc8
  max-retries: 2 (default)
  created:   2026-10-10 17:19 by user
  started:   2026-10-10 18:00

Body:
PROBLEMA (achado da auditoria de UX de 10/10) — acessibilidade: elementos interativos sem
nome/papel acessível, ou impossíveis de operar só com teclado.

1. `src/components/connections/ConnectionCard.tsx:139` — botão "mais opções"
   (`MoreVertical`) sem `aria-label`, leitor de tela só anuncia "botão".
2. `src/components/groups/GroupsView.tsx:217-220` — card de grupo selecionável pra
   broadcast é uma `Card`/div sem `role="button"`/`tabIndex`/`onKeyDown` — impossível
   selecionar só com teclado.
3. `src/components/docs/SystemFeaturesView.tsx:81` — cabeçalho de seção clicável
   (expandir/recolher) sem `role`/`tabIndex`/`onKeyDown` (padrão certo já existe no
   mesmo grupo de telas: `PresetCard.tsx`, em ThemeCustomizer).
4. `src/components/inbox/conversation-list/StatusChips.tsx:66` — botões de filtro
   (Todas/Não lidas/etc) sem `role="tablist"`/`role="tab"`/`aria-selected`, apesar de
   funcionarem como filtro de seleção única (padrão certo já existe no mesmo tipo de
   componente: `TeamConversationList.tsx:104-119`).
5. `src/components/chatbot/ChatbotFlowsView.tsx:239-250` — botões só-ícone (editar/
   duplicar/excluir) sem `aria-label` (padrão certo: `AutomationCard.tsx` equivalente já
   rotula os três).
6. `src/components/catalog/ExternalProductManagement.tsx:920-924` — botões de
   alternância Grade/Lista só com `title` (tooltip), sem `aria-pressed`.

O QUE FAZER
Pra cada um: aplicar o padrão de acessibilidade já correto no componente irmão citado
(copiar, não inventar). Resumo: `aria-label` nos botões só-ícone, `role="button"`+
`tabIndex={0}`+handler de Enter/Espaço nos cards clicáveis que não são `<button>`,
`role="tablist"`/`"tab"`/`aria-selected` nos grupos de filtro de seleção única,
`aria-pressed` nos toggles Grade/Lista.

ARQUIVOS QUE PODE TOCAR
Os 6 arquivos citados acima.

CRITÉRIO DE PRONTO
1. Todo elemento interativo citado tem nome/papel acessível correto.
2. Os 2 itens de "card clicável sem teclado" (GroupsView, SystemFeaturesView) funcionam
   por Tab+Enter/Espaço.
3. zapp-verify . --rapido verde.


Events (12):
  [2026-10-10 17:19] created {'assignee': 'iris', 'status': 'ready', 'parents': [], 'creator_task_id': None, 'tenant': None, 'workspace_kind': 'scratch', 'workspace_path': None, 'branch_name': None, 'project_id': None, 'skills': None, 'goal_mode': None, 'model_override': None, 'provider_override': None}
  [2026-10-10 17:21] reprioritized {'priority': 5}
  [2026-10-10 18:00] [run 9879] claimed {'lock': 'Joaquim:16708', 'expires': 1791666933, 'run_id': 9879}
  [2026-10-10 18:00] [run 9879] spawned {'pid': 16176, 'started_at': '|179166603320'}
  [2026-10-10 18:00] [run 9879] heartbeat
  [2026-10-10 18:01] [run 9879] heartbeat
  [2026-10-10 18:02] [run 9879] heartbeat
  [2026-10-10 18:03] [run 9879] heartbeat
  [2026-10-10 18:04] [run 9879] heartbeat
  [2026-10-10 18:05] [run 9879] heartbeat
  [2026-10-10 18:06] [run 9879] heartbeat
  [2026-10-10 18:07] [run 9879] heartbeat

Runs (1):
  #9879 running      @iris  active  2026-10-10 18:00
