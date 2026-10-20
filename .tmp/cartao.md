Task t_6bd9e0eb: [retomar] fix(hooks): arquivar conversa grava o estado arquivada pela RPC (individual, em massa e no generico)
  status:    running
  assignee:  iris
  workspace: scratch @ C:\Users\Joaquim Ataides\AppData\Local\hermes\kanban\boards\zapp-web-v2\workspaces\t_6bd9e0eb
  max-retries: 2 (default)
  created:   2026-10-14 15:52 by claude
  started:   2026-10-14 17:58
  children:  t_7c074b31

Body:
RETOMAR (entrega parada na fila do integrador, resgatada em 14/10). Esta entrega NÃO entrou e o trabalho não pode se perder.

SITUAÇÃO: estado 'falhou', conflita hoje com dia/2026-10-14.
MOTIVO REGISTRADO: a branch da tarefa andou depois do fechar

O QUE FAZER: CONFLITA com a ponta atual de dia/2026-10-14: traga a ponta atual para o workspace (merge/rebase), resolva os conflitos PRESERVANDO o que já entrou nela. Antes de mexer, confira no código ATUAL se o defeito do pedido ainda existe; se já foi corrigido, escreva isso em .tmp/relato.md com a prova e feche sem commit de código.

TRABALHO ANTERIOR (aproveite, não recomece): branch `v2/arquivar-grava-estado-arquivada-rebase-26101301191d6d` (commit 9305240ff) no repositório; no workspace novo traga os commits com `git cherry-pick` e ajuste só o necessário.

PEDIDO ORIGINAL:
ESPECIALISTA DA ÁREA: hugo (hooks, estado e dados no front). Abra a skill de área do seu perfil antes de editar. Comece o relato com a linha `Especialista: hugo`.
Origem: pedido do Joaquim em 11/10/2026 (decisões: Arquivar passa a gravar o estado arquivada em ordem segura, e contadores dos chips pelo mesmo critério da lista) (plano: docs/plans/PLANO_ARQUIVAR_E_CONTADORES_2026-10-11.md). Antes de mexer, confira no código ATUAL (dia/2026-10-11) o que existe e reaproveite. Se já estiver feito, escreva isso em .tmp/relato.md com a prova e feche sem commit de código. Sem migration, sem Edge Function, sem dependência nova. Fique estritamente nos arquivos listados no cartão.

DEPENDÊNCIA: este cartão só começa depois dos cartões pai. Se o que eles criam não estiver no seu workspace, o pai ainda não integrou: localize o commit em ~/hermes-workspaces/.v2-fila/*.json (campo `cartao` igual ao id do pai), traga com git cherry-pick <sha> se `git merge-base --is-ancestor <sha> HEAD` falhar, e siga. Se não achar, bloqueie dizendo qual.

PROBLEMA
Hoje archiveContact (src/hooks/chat/useConversationActions.ts) e bulkArchive (src/hooks/inbox/useInboxBulkActions.ts) só fazem contacts.assigned_to = null, então a conversa nunca vira 'archived' e o chip Arquivadas (cartões B1/B2) fica sempre em 0. A RPC public.set_conversation_status(p_contact_id uuid, p_next text, p_reason text) já existe em produção (SECURITY DEFINER, executável por authenticated) e o ADR-005 manda que transições passem por ela; o front ainda não a chama em lugar nenhum. Decisão do Joaquim (11/10/2026): Arquivar passa a gravar o estado de verdade, DEPOIS que a reabertura automática (cartão E1) existir. Decisão de desenho: arquivar NÃO mexe em assigned_to (o estado 'archived' é a marca; ao reabrir a conversa volta ao mesmo responsável).

O QUE FAZER
1. Em archiveContact: troque o update de assigned_to por supabase.rpc('set_conversation_status', { p_contact_id, p_next: 'archived', p_reason: <texto curto sem dado pessoal> }). Confira a assinatura e quem pode chamar na migration/banco (a RPC valida papel e transição); trate erro com o toast existente 'Erro ao arquivar conversa'. O Desfazer vira set_conversation_status(contactId, 'open') (archived só volta para open na tabela de transições do ADR) e mantém o toast com Desfazer atual.
2. Em bulkArchive (useInboxBulkActions.ts): mesmo comportamento para N contatos, chamando a RPC por contato com concorrência limitada (ex.: 5 por vez); se alguns falharem, informe 'X arquivadas, Y falharam' e mantenha a seleção só dos que falharam; o Desfazer reabre as que foram arquivadas.
3. O ramo 'archive' do hook genérico src/hooks/inbox/useBulkActions.ts que grava conversation_status direto em contacts deve passar a usar a mesma RPC quando tableName === 'contacts' (as outras tabelas ficam como estão).
4. Confira todos os chamadores (ConversationListSidebar, RealtimeInboxView atalho Delete/Backspace, ContactDetails, ContactActionButtons, useChatPanelHandlers case 'archive', slash command) e garanta que todos passam pelas funções acima, nenhum grava status direto. Liste no relato todos os caminhos do mesmo defeito (git grep).
5. Com a conversa selecionada sendo arquivada, ela sai das listas abertas (o filtro já exclui archived): confirme que a tela não quebra e relate o que acontece com a conversa aberta no painel.
6. Testes em src/hooks/chat/__tests__/ e src/hooks/inbox/__tests__/ (ou onde já houver): chama a RPC com 'archived', não mexe em assigned_to, Desfazer chama 'open', erro mostra toast, bulk com falha parcial.

ARQUIVOS QUE PODE TOCAR
- src/hooks/chat/useConversationActions.ts
- src/hooks/inbox/useInboxBulkActions.ts
- src/hooks/inbox/useBulkActions.ts (só o ramo archive de contacts)
- testes dos três em src/hooks/**/__tests__/

CRITÉRIO DE PRONTO
1. Arquivar (individual, em massa, atalho, menu, slash) grava archived via RPC e o Desfazer reabre.
2. assigned_to intocado; erros tratados; testes dos casos acima.
3. zapp-verify . --rapido verde.

Feche com hermes-tarefa-fechar "<tipo>(<escopo>): <título>" .tmp/relato.md, dizendo como resolveu o motivo acima. REGRAS: nenhuma informação sai do sistema; só cores/tokens existentes; sem DDL/Edge/dependência nova salvo se o pedido original exigia.

Feche com hermes-tarefa-fechar "<tipo>(<escopo>): <título>" .tmp/relato.md, dizendo como resolveu o motivo acima. REGRAS: nenhuma informação sai do sistema; só cores/tokens existentes; sem DDL/Edge/dependência nova salvo se o pedido original exigia.

Latest summary:
Backend de terminal (SSH para o WSL) fora do ar: toda chamada devolve 'SSH connection to joaquim_ataides@localhost timed out' (exit -1, degraded). Testado 5x com comandos triviais (echo/true/hostname) e também read_file — todas falharam igual, então é o transporte, não o comando. Sem SSH não rodo `hermes-tarefa-iniciar` nem abro o workspace (git/teste/fechar impossíveis). Nada foi tocado no repositório. Ação humana: religar o sshd em localhost:2222 (WSL Ubuntu-24.04) e re-enfileirar; se o backend voltar, retomo do passo `hermes-tarefa-iniciar`.

Comments (5):
  [2026-10-14 18:01] iris: Bloqueio de ambiente — o ciclo V2 está CONGELADO agora.

O primeiro passo do fluxo (`hermes-tarefa-iniciar Zapp_Web_V2 arquivar-grava-estado-arquivada-rebase`) devolve exit 75:
  CONGELADO: o modo V1 (push/PR/merge/migration/deploy por tarefa) está suspenso pela Arquitetura V2.
  Não tente contornar. Estacione: deixe o trabalho no workspace, registre o estado com hermes-pedir-decisao e pare.

Causa medida (não é palpite):
  `stat -c '%n %s %y' ~/.local/libexec/hermes-guard/CONGELADO ~/.local/libexec/hermes-guard/MODO_V2`
  -> CONGELADO 125 bytes 2026-10-04 11:22  (presente)
  -> MODO_V2: No such file or directory  (AUSENTE)

A guarda dos scripts (hermes-tarefa-iniciar linha 5 e hermes-tarefa-fechar linha 5) exige CONGELADO presente E MODO_V2 presente para rodar local. Sem MODO_V2, TODO o ciclo de agente fica travado: não abre workspace, não fecha, não migra, não publica. Sem este arquivo o script cairia no modo V1 (fetch origin, cópia do .env de produção) — não executei essa via, é contornar a guarda.

Consequência para este cartão: não consigo criar o workspace (e não posso criar pasta de trabalho nem `git worktree` à mão). O cartão não tem workspace próprio; o workspace da entrega anterior é o do cartão t_56e8f367 (`.../arquivar-grava-estado-arquivada-rebase-26101301191d6d`, branch v2/arquivar-grava-estado-arquivada-rebase-26101301191d6d, BASE_DIA=dia/2026-10-13, PRONTO_SHA=9305240ff). Não mexi nele para não sujar worktree de outro cartão.

Não contornei a guarda (nada de unset HERMES_AGENT, nada de tocar arquivos da guarda). Ação necessária (humana, só o Joaquim/Claude): restaurar o marcador ~/.local/libexec/hermes-guard/MODO_V2, e então re-enfileirar este cartão.
  [2026-10-14 20:19] coordenador: Coordenador (triagem sensor blk:t_6bd9e0eb): mantido bloqueado. Guarda verificada agora — CONGELADO presente, MODO_V2 ausente — desbloquear repetiria exit 75. Restaurar ~/.local/libexec/hermes-guard/MODO_V2 é ação humana (só Claude/Joaquim; agentes não tocam na guarda nem contornam). Re-enfileirar após restaurar. Decisão em ~/hermes-workspaces/.decisoes/2026-10-14-t_58fbd4f5-blk-t_6bd9e0eb.md. Especialista: coordenador.
  [2026-10-15 14:15] default: UNBLOCK: guarda restaurada (MODO_V2 voltou): retomar a abertura/fechamento do cartao
  [2026-10-16 03:13] iris: Bloqueio de ambiente (transiente) — backend de terminal FORA, não é a guarda.

O SSH para o WSL caiu: toda chamada de `terminal`, `read_file` e afins devolve
  `SSH connection to joaquim_ataides@localhost timed out` (reached exit -1, status "degraded").
Tentei 5 vezes, inclusive comandos triviais (`echo`, `true`, `hostname`) — todas as tentativas falharam igual, então não é o comando, é o transporte.

Consequência: não consigo rodar `hermes-tarefa-iniciar` (passo 1 do fluxo) e não abro o workspace. Sem terminal não há git, teste nem fechar. Nada foi tocado.

Diferença do bloqueio anterior: em 14/10 era o marcador da guarda (MODO_V2 ausente, exit 75). Agora a guarda não chega nem a ser consultada — o SSH cai antes. A ação humana aqui é religar o sshd em localhost:2222 (WSL Ubuntu-24.04) e re-enfileirar. Se o backend voltar nesta mesma execução, retomo do `hermes-tarefa-iniciar`.
  [2026-10-16 12:40] iris: Achado fora dos arquivos permitidos deste cartão (não corrigido aqui): `src/components/inbox/chat/useChatPanelHandlers.ts:527-543` (caminho do slash `/archive`) ainda arquiva por escrita direta — `.update({ conversation_status: 'archived', updated_at })` em `contacts`, sem passar pela RPC `set_conversation_status` (ADR-005). É a terceira implementação paralela da transição; o item 3 do cartão (`src/hooks/inbox/useBulkActions.ts` ramo archive) não se aplica mais porque esse arquivo foi removido em `1ad0af52c7` (chore(inbox): useBulkActions sem tabela arbitrária). Abri cartão filho para o ajuste.

Events (77):
  [2026-10-16 12:29] [run 19651] heartbeat
  [2026-10-16 12:30] [run 19651] heartbeat
  [2026-10-16 12:31] [run 19651] heartbeat
  [2026-10-16 12:32] [run 19651] heartbeat
  [2026-10-16 12:33] [run 19651] heartbeat
  [2026-10-16 12:34] [run 19651] heartbeat
  [2026-10-16 12:35] [run 19651] heartbeat
  [2026-10-16 12:36] [run 19651] heartbeat
  [2026-10-16 12:37] [run 19651] heartbeat
  [2026-10-16 12:38] [run 19651] heartbeat
  [2026-10-16 12:39] [run 19651] heartbeat
  [2026-10-16 12:40] commented {'author': 'iris', 'len': 601}
  [2026-10-16 12:40] [run 19651] heartbeat
  [2026-10-16 12:42] [run 19651] heartbeat
  [2026-10-16 12:43] [run 19651] heartbeat
  [2026-10-16 12:44] [run 19651] heartbeat
  [2026-10-16 12:45] [run 19651] heartbeat
  [2026-10-16 12:46] [run 19651] heartbeat
  [2026-10-16 12:47] [run 19651] heartbeat
  [2026-10-16 12:48] [run 19651] heartbeat

Runs (4):
  #17230 blocked      @iris  163s  2026-10-14 17:58
        → Ambiente congelado: `hermes-tarefa-iniciar` devolve exit 75 ("CONGELADO... MODO_V2"). Medido: ~/.local/libexec/hermes-guard/CONGELADO existe e MODO_V2 está AUSE
  #19308 rate_limited @iris  54s  2026-10-16 02:51
        ! pid 48872 exited rate-limited (quota wall) — requeued without counting a failure
  #19385 blocked      @iris  170s  2026-10-16 03:10
        → Backend de terminal (SSH para o WSL) fora do ar: toda chamada devolve 'SSH connection to joaquim_ataides@localhost timed out' (exit -1, degraded). Testado 5x co
  #19651 running      @iris  active  2026-10-16 12:01
