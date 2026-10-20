Task t_bd1c2989: [retomar] fix(a11y): nome e papel acessivel nos 6 controles sem nome
  status:    running
  assignee:  iris
  workspace: scratch @ C:\Users\Joaquim Ataides\AppData\Local\hermes\kanban\boards\zapp-web-v2\workspaces\t_bd1c2989
  max-retries: 2 (default)
  created:   2026-10-12 22:05 by claude
  started:   2026-10-13 16:31

Body:
RETOMAR (entrega parada na fila do integrador, resgatada em 12/10). Esta entrega NÃO entrou e o trabalho não pode se perder.

SITUAÇÃO: estado 'conflito', conflita hoje com dia/2026-10-12.
MOTIVO REGISTRADO: marcado pelo Claude em 12/10: aprovado, mas CONFLITA com a ponta de dia/2026-10-12; segue para retomada por rebase

O QUE FAZER: CONFLITA com a ponta atual de dia/2026-10-12: traga a ponta atual para o workspace (merge/rebase), resolva os conflitos PRESERVANDO o que já entrou nela. Antes de mexer, confira no código ATUAL se o defeito do pedido ainda existe; se já foi corrigido, escreva isso em .tmp/relato.md com a prova e feche sem commit de código.

TRABALHO ANTERIOR (aproveite, não recomece): branch `v2/a11y-nome-papel-6-pontos-2610101800fbc9` (commit 06f9a6747) no repositório; no workspace novo traga os commits com `git cherry-pick` e ajuste só o necessário.

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

Feche com hermes-tarefa-fechar "<tipo>(<escopo>): <título>" .tmp/relato.md, dizendo como resolveu o motivo acima. REGRAS: nenhuma informação sai do sistema; só cores/tokens existentes; sem DDL/Edge/dependência nova salvo se o pedido original exigia.

Events (462):
  [2026-10-13 18:26] respawn_guarded {'reason': 'rate_limit_cooldown'}
  [2026-10-13 18:27] respawn_guarded {'reason': 'rate_limit_cooldown'}
  [2026-10-13 18:27] respawn_guarded {'reason': 'rate_limit_cooldown'}
  [2026-10-13 18:27] respawn_guarded {'reason': 'rate_limit_cooldown'}
  [2026-10-13 18:27] respawn_guarded {'reason': 'rate_limit_cooldown'}
  [2026-10-13 18:27] respawn_guarded {'reason': 'rate_limit_cooldown'}
  [2026-10-13 18:28] respawn_guarded {'reason': 'rate_limit_cooldown'}
  [2026-10-13 18:28] respawn_guarded {'reason': 'rate_limit_cooldown'}
  [2026-10-13 18:28] respawn_guarded {'reason': 'rate_limit_cooldown'}
  [2026-10-13 18:29] respawn_guarded {'reason': 'rate_limit_cooldown'}
  [2026-10-13 19:18] [run 16135] claimed {'lock': 'Joaquim:41912', 'expires': 1791930814, 'run_id': 16135}
  [2026-10-13 19:18] [run 16135] spawned {'pid': 44184, 'started_at': '|179192991459'}
  [2026-10-13 19:18] [run 16135] heartbeat
  [2026-10-13 19:19] [run 16135] heartbeat
  [2026-10-13 19:20] [run 16135] heartbeat
  [2026-10-13 19:21] [run 16135] heartbeat
  [2026-10-13 19:22] [run 16135] heartbeat
  [2026-10-13 19:23] [run 16135] heartbeat
  [2026-10-13 19:24] [run 16135] heartbeat
  [2026-10-13 19:25] [run 16135] heartbeat

Runs (22):
  #12650 rate_limited @iris  33s  2026-10-13 16:31
        ! pid 10712 exited rate-limited (quota wall) — requeued without counting a failure
  #12770 rate_limited @iris  37s  2026-10-13 16:37
        ! pid 28980 exited rate-limited (quota wall) — requeued without counting a failure
  #12920 rate_limited @iris  34s  2026-10-13 16:43
        ! pid 44264 exited rate-limited (quota wall) — requeued without counting a failure
  #13089 rate_limited @iris  22s  2026-10-13 16:48
        ! pid 33024 exited rate-limited (quota wall) — requeued without counting a failure
  #13260 rate_limited @iris  33s  2026-10-13 16:54
        ! pid 23352 exited rate-limited (quota wall) — requeued without counting a failure
  #13434 rate_limited @iris  37s  2026-10-13 16:59
        ! pid 18764 exited rate-limited (quota wall) — requeued without counting a failure
  #13589 rate_limited @iris  45s  2026-10-13 17:05
        ! pid 33164 exited rate-limited (quota wall) — requeued without counting a failure
  #13772 rate_limited @iris  34s  2026-10-13 17:11
        ! pid 43812 exited rate-limited (quota wall) — requeued without counting a failure
  #13948 rate_limited @iris  23s  2026-10-13 17:17
        ! pid 31884 exited rate-limited (quota wall) — requeued without counting a failure
  #14105 rate_limited @iris  23s  2026-10-13 17:23
        ! pid 42468 exited rate-limited (quota wall) — requeued without counting a failure
  #14290 rate_limited @iris  47s  2026-10-13 17:29
        ! pid 42820 exited rate-limited (quota wall) — requeued without counting a failure
  #14465 rate_limited @iris  36s  2026-10-13 17:35
        ! pid 43080 exited rate-limited (quota wall) — requeued without counting a failure
  #14644 rate_limited @iris  35s  2026-10-13 17:40
        ! pid 31968 exited rate-limited (quota wall) — requeued without counting a failure
  #14810 rate_limited @iris  24s  2026-10-13 17:46
        ! pid 39736 exited rate-limited (quota wall) — requeued without counting a failure
  #14998 rate_limited @iris  34s  2026-10-13 17:52
        ! pid 8420 exited rate-limited (quota wall) — requeued without counting a failure
  #15165 rate_limited @iris  34s  2026-10-13 17:58
        ! pid 10464 exited rate-limited (quota wall) — requeued without counting a failure
  #15330 rate_limited @iris  23s  2026-10-13 18:03
        ! pid 30764 exited rate-limited (quota wall) — requeued without counting a failure
  #15477 rate_limited @iris  23s  2026-10-13 18:09
        ! pid 25964 exited rate-limited (quota wall) — requeued without counting a failure
  #15641 rate_limited @iris  22s  2026-10-13 18:14
        ! pid 22204 exited rate-limited (quota wall) — requeued without counting a failure
  #15807 rate_limited @iris  35s  2026-10-13 18:20
        ! pid 29420 exited rate-limited (quota wall) — requeued without counting a failure
  #15980 rate_limited @iris  35s  2026-10-13 18:25
        ! pid 1616 exited rate-limited (quota wall) — requeued without counting a failure
  #16135 running      @iris  active  2026-10-13 19:18

ESPECIALISTA DA ÁREA: iris (telas e componentes). A PRIMEIRA LINHA do `.tmp/relato.md` deve ser EXATAMENTE `Especialista: iris`; o relato diz o que mudou, o comando de verificação rodado e a linha de resultado.
[linha reposta pelo worker: o cartão [retomar] foi gerado em 12/10, antes do modelo de 13/10 que inclui esta instrução; sem ela o fechar 13/10 aborta no grep de 'EXATAMENTE .Especialista' (set -o pipefail)]
