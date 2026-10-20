Task t_da168acd: fix(inbox): "Arquivar" tem uma só semântica em todas as telas e a conversa arquivada aparece na aba Arquivadas
  status:    running
  assignee:  hugo
  workspace: scratch @ C:\Users\Joaquim Ataides\AppData\Local\hermes\kanban\boards\zapp-web-v2\workspaces\t_da168acd
  max-retries: 2 (default)
  created:   2026-10-13 08:17 by claude
  started:   2026-10-13 16:35

Body:
ESPECIALISTA DA ÁREA: hugo (hooks, estado e dados no front). Abra a skill de área do seu perfil antes de editar. A PRIMEIRA LINHA do `.tmp/relato.md` deve ser EXATAMENTE `Especialista: hugo`; o relato diz o que mudou, o comando de verificação rodado e a linha de resultado (ex.: `Test Files 3 passed, Tests 27 passed`), sem 'parcial'.
CONTEXTO: segunda passada da auditoria de paridade V3 -> V2 do doc `docs/estado/06-features-inbox-hooks.md` (inbox: serviços, hooks e utils). Plano e relatórios: `~/arquitetura-v2/paridade-06/achados_*.md` (cópia para agentes em `~/hermes-workspaces/.assets/paridade-06/`). A V3 é só REFERÊNCIA (`~/projetos/Zapp_Web_V3`, leia com `git -C ~/projetos/Zapp_Web_V3 show origin/main:<caminho>`); a V2 costuma estar melhor: NÃO devolva o que a V2 já faz melhor. FORA DE ESCOPO (decisões do dono): tags/etiquetas de contato ou conversa (função excluída), exportar/importar/edição em massa de contatos, ciclo de vida de negócios, SLA de Resolução, webhook externo de alerta, persistir QR no navegador. Os achados abaixo foram CONFERIDOS no código da cópia viva da V2 em 13/10/2026 (leitores + conferência do Claude em migrations e código); o BANCO REAL não foi consultado: confira no banco LOCAL o que o cartão mandar. A cópia lida não tem cartões `done` ainda não integrados: antes de editar, procure cartões irmãos em `~/hermes-workspaces/.v2-fila/*.json` e no quadro e, se algo já estiver feito, prove no relato em vez de refazer.
REGRAS: o cartão compila e passa sozinho (`zapp-verify . --rapido` verde); atualize ou crie testes dos arquivos que tocar e liste-os no relato; sem dependência nova; migrations só ADITIVAS, com `-- Rollback:` completo no topo, `SET search_path` e grants explícitos, e PROVA no banco LOCAL com o papel real (agent/supervisor/admin/anon/service_role) mostrando o que passa e o que é negado; NADA vai para produção (quem aplica é o Joaquim). Texto de interface em pt-BR; nada novo que exporte, baixe, copie ou imprima dados; sem log de telefone, token ou texto de mensagem; efeitos sutis respeitando reduzir movimento; cores só as do sistema.

COORDENAÇÃO: toca os mesmos arquivos do PH-01 do doc 07 (t_70d06027), RS1 e PD-71/72. Antes de editar, liste esses cartões e o estado deles no quadro.

PROBLEMA (evidência conferida)
A V2 tem três semânticas de arquivar. `archiveContact` (`src/hooks/chat/useConversationActions.ts:248`, usado em `ConversationListSidebar.tsx:68`, `RealtimeInboxView.tsx:371` e `ContactDetails.tsx:74`) só faz `contacts.update({ assigned_to: null })`. A aba Arquivadas lê `conversation_status === 'archived'` (`src/hooks/inbox/chipCounts.ts:77`), que só é gravado por `useChatPanelHandlers.ts:534` (cabeçalho do chat) e `src/hooks/inbox/useBulkActions.ts:138`. Resultado: arquivar pela lista ou pelo painel de detalhes tira o responsável, mas a conversa NÃO vai para Arquivadas. Existem dois hooks de lote com semânticas diferentes (`useBulkActions` e `useInboxBulkActions`). O comentário de `ContactDetails.tsx:66-69` cita 'decisão do dono em 06/10, cartão #241: zera assigned_to' — essa decisão é anterior à aba Arquivadas por status persistido e produz o defeito acima. O cartão PH-01 do doc 07 (t_70d06027, `bulkArchive`) afirma que o arquivar unitário 'já arquiva certo': isso é falso para `archiveContact`.

O QUE FAZER
1. DECISÃO ADOTADA (o Joaquim pode vetar): arquivar = `conversation_status: 'archived'` (+ `updated_at`), SEM mexer em `assigned_to`; desarquivar/desfazer restaura o status anterior lido antes. Registre a decisão no relato e atualize o comentário de `ContactDetails.tsx:66-69` (remova a referência a zerar `assigned_to`).
2. Crie UM helper/hook canônico de arquivar/desarquivar (unitário e em lote, uma só escrita agrupada por valor anterior) e faça `archiveContact`, `ContactDetails`, `ConversationListSidebar`, `RealtimeInboxView`, o cabeçalho (`useChatPanelHandlers.ts:534`) e os dois hooks de lote usarem o mesmo. Se o PH-01 do doc 07 (t_70d06027) já tiver integrado ou estiver no quadro, REUTILIZE o trabalho dele e prove no relato; não duplique.
3. Confirme que, depois de arquivar por qualquer caminho, a conversa some da lista aberta, o contador da aba Arquivadas sobe e o desfazer devolve o estado anterior. Mensagem nova do cliente numa arquivada segue o que o PD-71 (reabrir) definir: não implemente reabertura aqui.
4. Atualize/crie os testes que exigiam `assigned_to: null` (`src/hooks/chat/__tests__/useConversationActions.test.ts:176-204`, `useInboxBulkActions.test.ts`), provando os 3 caminhos (lista, detalhes, lote) e o desfazer.

ARQUIVOS QUE PODE TOCAR
- src/hooks/chat/useConversationActions.ts
- src/hooks/inbox/useInboxBulkActions.ts
- src/hooks/inbox/useBulkActions.ts
- src/components/inbox/ContactDetails.tsx
- src/components/inbox/ConversationListSidebar.tsx
- src/components/inbox/RealtimeInboxView.tsx
- src/components/inbox/chat/useChatPanelHandlers.ts
- testes dos arquivos tocados

CRITÉRIO DE PRONTO
1. Os três caminhos de arquivar gravam o mesmo estado e a conversa aparece em Arquivadas.
2. Desfazer restaura o status anterior.
3. Um só helper; teste prova lista, detalhes e lote.
4. `zapp-verify . --rapido` verde.


Latest summary:
Fábrica CONGELADA: `MODO_V2` não existe em ~/.local/libexec/hermes-guard/, então `hermes-tarefa-iniciar` recusa (exit 75) e não é possível abrir workspace (proibido criar à mão). Sem workspace não há trabalho, teste nem relato. Mesmo bloqueio já atingiu t_d70e5685 hoje. Só o Joaquim descongela (recriar MODO_V2). Decisão registrada: 20261014-110734-2f0b-sem-tarefa.

Comments (2):
  [2026-10-14 11:08] hugo: Parado pela CONGELAMENTO da fábrica — não é falha deste cartão.

- `hermes-tarefa-iniciar Zapp_Web_V2 arquivar-semantica-unica` (workdir `/home/joaquim_ataides/projetos/Zapp_Web_V2`) devolveu `exit 75`: `CONGELADO: o modo V1 ... está suspenso pela Arquitetura V2`.
- Causa checada: `/home/joaquim_ataides/.local/libexec/hermes-guard/MODO_V2` **não existe**; ao mesmo tempo `CONGELADO` está presente. O script `hermes-tarefa-iniciar` (linhas 5–10) bloqueia quando `HERMES_AGENT=1` + `CONGELADO` + `MODO_V2` ausente.
- Sem workspace não há arquivo para editar, teste para rodar nem relato para fechar (o fluxo proíbe criar workspace à mão).
- O mesmo congelamento atingiu outros cartões hoje: `t_d70e5685` [semisenior] está bloqueado há ~20 min com o mesmo motivo (registro na análise da fábrica de 11:06).
- Não contornei a guarda (regra 07–08/10: nunca contornar bloqueio da guarda; ESTOP só o Joaquim retoma).
- Decisão registrada: `hermes-pedir-decisao` → `20261014-110734-2f0b-sem-tarefa` (o slug sai "sem-tarefa" porque a decisão é registrada pela raiz de um workspace, e eu não tenho workspace).

Retomar: recriar `MODO_V2` (descongelar) ou devolver o cartão com essa instrução explícita.
  [2026-10-15 14:14] default: UNBLOCK: guarda restaurada (MODO_V2 voltou): retomar a abertura/fechamento do cartao

Events (318):
  [2026-10-15 16:01] [run 18549] heartbeat
  [2026-10-15 16:02] [run 18549] heartbeat
  [2026-10-15 16:04] [run 18549] heartbeat
  [2026-10-15 16:05] [run 18549] heartbeat
  [2026-10-15 16:06] [run 18549] heartbeat
  [2026-10-15 16:07] [run 18549] heartbeat
  [2026-10-15 16:08] [run 18549] heartbeat
  [2026-10-15 16:09] [run 18549] heartbeat
  [2026-10-15 16:10] [run 18549] heartbeat
  [2026-10-15 16:11] [run 18549] heartbeat
  [2026-10-15 16:12] [run 18549] heartbeat
  [2026-10-15 16:13] [run 18549] heartbeat
  [2026-10-15 16:14] [run 18549] heartbeat
  [2026-10-15 16:15] [run 18549] heartbeat
  [2026-10-15 16:16] [run 18549] heartbeat
  [2026-10-15 16:17] [run 18549] heartbeat
  [2026-10-15 16:18] [run 18549] heartbeat
  [2026-10-15 16:19] [run 18549] heartbeat
  [2026-10-15 16:20] [run 18549] heartbeat
  [2026-10-15 16:21] [run 18549] heartbeat

Runs (22):
  #12734 rate_limited @hugo  39s  2026-10-13 16:35
        ! pid 28344 exited rate-limited (quota wall) — requeued without counting a failure
  #12906 rate_limited @hugo  33s  2026-10-13 16:42
        ! pid 34872 exited rate-limited (quota wall) — requeued without counting a failure
  #13064 rate_limited @hugo  34s  2026-10-13 16:48
        ! pid 27952 exited rate-limited (quota wall) — requeued without counting a failure
  #13254 rate_limited @hugo  34s  2026-10-13 16:54
        ! pid 30496 exited rate-limited (quota wall) — requeued without counting a failure
  #13429 rate_limited @hugo  36s  2026-10-13 16:59
        ! pid 42836 exited rate-limited (quota wall) — requeued without counting a failure
  #13584 rate_limited @hugo  46s  2026-10-13 17:05
        ! pid 42580 exited rate-limited (quota wall) — requeued without counting a failure
  #13757 rate_limited @hugo  36s  2026-10-13 17:11
        ! pid 29672 exited rate-limited (quota wall) — requeued without counting a failure
  #13936 rate_limited @hugo  23s  2026-10-13 17:17
        ! pid 29280 exited rate-limited (quota wall) — requeued without counting a failure
  #14104 rate_limited @hugo  34s  2026-10-13 17:22
        ! pid 34224 exited rate-limited (quota wall) — requeued without counting a failure
  #14276 rate_limited @hugo  38s  2026-10-13 17:28
        ! pid 26868 exited rate-limited (quota wall) — requeued without counting a failure
  #14451 rate_limited @hugo  33s  2026-10-13 17:34
        ! pid 10696 exited rate-limited (quota wall) — requeued without counting a failure
  #14621 rate_limited @hugo  34s  2026-10-13 17:40
        ! pid 25396 exited rate-limited (quota wall) — requeued without counting a failure
  #14796 rate_limited @hugo  35s  2026-10-13 17:46
        ! pid 31968 exited rate-limited (quota wall) — requeued without counting a failure
  #14977 rate_limited @hugo  22s  2026-10-13 17:51
        ! pid 27580 exited rate-limited (quota wall) — requeued without counting a failure
  #15134 rate_limited @hugo  34s  2026-10-13 17:57
        ! pid 38604 exited rate-limited (quota wall) — requeued without counting a failure
  #15310 rate_limited @hugo  34s  2026-10-13 18:02
        ! pid 37232 exited rate-limited (quota wall) — requeued without counting a failure
  #15494 rate_limited @hugo  36s  2026-10-13 18:09
        ! pid 23112 exited rate-limited (quota wall) — requeued without counting a failure
  #15661 rate_limited @hugo  33s  2026-10-13 18:15
        ! pid 22464 exited rate-limited (quota wall) — requeued without counting a failure
  #15839 rate_limited @hugo  33s  2026-10-13 18:20
        ! pid 42804 exited rate-limited (quota wall) — requeued without counting a failure
  #16013 rate_limited @hugo  35s  2026-10-13 18:26
        ! pid 30360 exited rate-limited (quota wall) — requeued without counting a failure
  #16533 blocked      @hugo  157s  2026-10-14 11:05
        → Fábrica CONGELADA: `MODO_V2` não existe em ~/.local/libexec/hermes-guard/, então `hermes-tarefa-iniciar` recusa (exit 75) e não é possível abrir workspace (proi
  #18549 running      @hugo  active  2026-10-15 15:38
