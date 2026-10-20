Task t_16329d3c: [refazer 1] fix(a11y): nome/papel acessível faltando (6 pontos)
  status:    running
  assignee:  semisenior
  workspace: scratch @ C:\Users\Joaquim Ataides\AppData\Local\hermes\kanban\boards\zapp-web-v2\workspaces\t_16329d3c
  max-retries: 2 (default)
  created:   2026-10-12 09:33 by user
  started:   2026-10-14 06:52

Body:
REFAZER (rodada 1 de 2). A entrega anterior deste trabalho foi RECUSADA e nada entrou.

MOTIVO DA RECUSA: marcado pelo Claude em 12/10: aprovado, mas CONFLITA com a ponta de dia/2026-10-12; segue para retomada por rebase

O QUE CORRIGIR: Traga dia/2026-10-10 atual para o workspace (merge/rebase), resolva o conflito preservando o que já entrou nela, rode o teste do cartão e `zapp-verify full .` e feche de novo.

TRABALHO ANTERIOR (aproveite, não recomece): branch `v2/a11y-nome-papel-6-pontos-2610101800fbc9` (commit 06f9a6747) no repositório; no workspace novo, traga os commits com `git cherry-pick` e corrija só o que foi apontado.

PEDIDO ORIGINAL:
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

Feche com hermes-tarefa-fechar "<tipo>(<escopo>): <título>" .tmp/relato.md, dizendo no relato como resolveu cada ponto da recusa.

Comments (2):
  [2026-10-12 09:40] default: [jev-entrada] pré-filtro de ação externa: \bmerge\b → RETIDO (pede ação fora do repositório local)
  [2026-10-12 09:46] default: [revisor-entrada] [jev-entrada] claude liberou → senior: Correção de acessibilidade em 6 componentes React do próprio repositório (aria-label, role, tabIndex, aria-pressed), mais rebase/resolução de conflito local; não toca ferramental da fábrica nem exige ação fora da máquina.

Events (51):
  [2026-10-14 07:12] [run 16365] heartbeat
  [2026-10-14 07:13] [run 16365] heartbeat
  [2026-10-14 07:14] [run 16365] heartbeat
  [2026-10-14 07:15] [run 16365] heartbeat
  [2026-10-14 07:16] [run 16365] heartbeat
  [2026-10-14 07:18] [run 16365] heartbeat
  [2026-10-14 07:19] [run 16365] heartbeat
  [2026-10-14 07:20] [run 16365] heartbeat
  [2026-10-14 07:21] [run 16365] heartbeat
  [2026-10-14 07:22] [run 16365] heartbeat
  [2026-10-14 07:23] [run 16365] heartbeat
  [2026-10-14 07:24] [run 16365] heartbeat
  [2026-10-14 07:25] [run 16365] heartbeat
  [2026-10-14 07:26] [run 16365] heartbeat
  [2026-10-14 07:27] [run 16365] heartbeat
  [2026-10-14 07:28] [run 16365] heartbeat
  [2026-10-14 07:29] [run 16365] heartbeat
  [2026-10-14 07:30] [run 16365] heartbeat
  [2026-10-14 07:31] [run 16365] heartbeat
  [2026-10-14 07:33] [run 16365] heartbeat

Runs (1):
  #16365 running      @semisenior  active  2026-10-14 06:52
