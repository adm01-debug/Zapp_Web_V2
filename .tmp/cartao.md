Task t_6bcce858: feat(inbox): avisos de mensagem nova (som, notificação do navegador, toast) funcionam em qualquer tela do app, e só para as conversas do usuário
  status:    running
  assignee:  hugo
  workspace: scratch @ C:\Users\Joaquim Ataides\AppData\Local\hermes\kanban\boards\zapp-web-v2\workspaces\t_6bcce858
  max-retries: 2 (default)
  created:   2026-10-13 08:18 by claude
  started:   2026-10-13 16:36
  children:  t_0c6c3eff, t_3fd6b3a8

Body:
ESPECIALISTA DA ÁREA: hugo (hooks, estado e dados no front). Abra a skill de área do seu perfil antes de editar. A PRIMEIRA LINHA do `.tmp/relato.md` deve ser EXATAMENTE `Especialista: hugo`; o relato diz o que mudou, o comando de verificação rodado e a linha de resultado (ex.: `Test Files 3 passed, Tests 27 passed`), sem 'parcial'.
CONTEXTO: segunda passada da auditoria de paridade V3 -> V2 do doc `docs/estado/06-features-inbox-hooks.md` (inbox: serviços, hooks e utils). Plano e relatórios: `~/arquitetura-v2/paridade-06/achados_*.md` (cópia para agentes em `~/hermes-workspaces/.assets/paridade-06/`). A V3 é só REFERÊNCIA (`~/projetos/Zapp_Web_V3`, leia com `git -C ~/projetos/Zapp_Web_V3 show origin/main:<caminho>`); a V2 costuma estar melhor: NÃO devolva o que a V2 já faz melhor. FORA DE ESCOPO (decisões do dono): tags/etiquetas de contato ou conversa (função excluída), exportar/importar/edição em massa de contatos, ciclo de vida de negócios, SLA de Resolução, webhook externo de alerta, persistir QR no navegador. Os achados abaixo foram CONFERIDOS no código da cópia viva da V2 em 13/10/2026 (leitores + conferência do Claude em migrations e código); o BANCO REAL não foi consultado: confira no banco LOCAL o que o cartão mandar. A cópia lida não tem cartões `done` ainda não integrados: antes de editar, procure cartões irmãos em `~/hermes-workspaces/.v2-fila/*.json` e no quadro e, se algo já estiver feito, prove no relato em vez de refazer.
REGRAS: o cartão compila e passa sozinho (`zapp-verify . --rapido` verde); atualize ou crie testes dos arquivos que tocar e liste-os no relato; sem dependência nova; migrations só ADITIVAS, com `-- Rollback:` completo no topo, `SET search_path` e grants explícitos, e PROVA no banco LOCAL com o papel real (agent/supervisor/admin/anon/service_role) mostrando o que passa e o que é negado; NADA vai para produção (quem aplica é o Joaquim). Texto de interface em pt-BR; nada novo que exporte, baixe, copie ou imprima dados; sem log de telefone, token ou texto de mensagem; efeitos sutis respeitando reduzir movimento; cores só as do sistema.

COORDENAÇÃO: PH-44/45 e PE-30/31/32 mexem em notificações; leia-os e prove no relato o que já está feito. Não altere políticas de RLS neste cartão.

PROBLEMA (evidência conferida)
O único tratador de aviso é `useRealtimeNotifications`, montado dentro de `useRealtimeMessages` (`src/hooks/chat/useRealtimeMessages.ts:57`), que só roda em `RealtimeInboxView`; o `ViewRouter` (`src/pages/ViewRouter.tsx:94-195`) renderiza uma view por vez. Quem está em Dashboard, Contatos ou Tarefas não ouve nada. PE-30/31/32 cobrem só contador e título da aba; PH-44/45 (hooks06) só os caminhos de dentro do inbox. Além disso o aviso dispara para TODA mensagem de contato que a RLS deixa ler, e `contacts_select_policy` (`20260901200001_e23_default_queue_rls_policies.sql:59-67`) deixa todo membro da fila ler todos os contatos da fila: com 20 atendentes na mesma fila, cada um ouve a conversa de colegas.

O QUE FAZER
1. Crie um hook global montado no shell do app (junto ao provedor do `ViewRouter`/`AppShell`) que assina INSERT de `messages` (direção recebida) e dispara som/notificação/toast reutilizando `useRealtimeNotifications`/`notificationSounds` e o horário silencioso; no inbox NÃO duplique o aviso (um único dono: o global, ou o do inbox quando a conversa está aberta e visível).
2. DECISÃO ADOTADA (vetável): avisar só conversa própria (`assigned_to = eu`) ou sem responsável na fila do usuário; supervisor/admin com opção em Configurações de notificar também da equipe (padrão desligado). Conversa aberta na tela com a aba visível não avisa.
3. Respeite o horário silencioso, o som desligado nas configurações e `prefers-reduced-motion`; clique na notificação abre a conversa.
4. Sem log de telefone, token nem texto de mensagem. Testes de hook: tela fora do inbox avisa; inbox não duplica; colega de fila não avisa; supervisor com opção ligada avisa.

ARQUIVOS QUE PODE TOCAR
- src/hooks/chat/useRealtimeNotifications.ts
- src/hooks/chat/useRealtimeMessages.ts
- src/pages/ViewRouter.tsx ou o provedor de layout (confirme)
- src/hooks/ (novo hook global)
- testes

CRITÉRIO DE PRONTO
1. Aviso funciona fora do inbox e sem duplicar dentro dele.
2. Só conversas do usuário/sem dono; opção para supervisor.
3. Testes verdes.
4. `zapp-verify . --rapido` verde.


Latest summary:
Sem workspace: o marcador /home/joaquim_ataides/.local/libexec/hermes-guard/MODO_V2 foi removido (dir mtime 14/10 10:45) e hermes-tarefa-iniciar sai EXIT=75/CONGELADO nas 2 tentativas desta sessão — nenhum agente consegue abrir workspace desde 10:45 (último criado: id 2610141039). Os 19 runs anteriores deste cartão morreram no mesmo exit 75, rotulado como "rate-limited" e re-enfileirado, então o cartão gira em falso desde 13/10 17:32 sem chegar a um humano. Não recriei o MODO_V2 para não desligar a guarda. Decisão pedida ao Joaquim: DECISAO_ID=20261014-111329-2607-sem-tarefa (restaurar MODO_V2 ou manter o congelamento). Desbloquear quando o marcador voltar.

Comments (5):
  [2026-10-14 11:13] hugo: BLOQUEIO DE AMBIENTE (não é o cartão).

`hermes-tarefa-iniciar Zapp_Web_V2 avisos-mensagem-nova-global` roda do workdir `/home/joaquim_ataides/projetos/Zapp_Web_V2` e sai **EXIT=75 / CONGELADO** — testado 2x nesta sessão. O guard de `/home/joaquim_ataides/.local/libexec/hermes-guard/hermes-tarefa-iniciar` (linhas 5-10) exige o marcador `MODO_V2`, que **não existe mais** naquele diretório (só há `CONGELADO`; mtime do dir 14/10 10:45). Sem o marcador, todo agente com HERMES_AGENT=1 fica impedido de abrir/ fechar/mergear/migrar publicar — inclusive workspace.

Prova do momento do corte: o último workspace criado em `~/hermes-workspaces/Zapp_Web_V2` tem o id `...-2610141039...` (14/10 10:39); nenhum novo depois disso, enquanto os cartões meus fecharam até 09:59 de hoje. Não existe `~/hermes-workspaces/.por-cartao/t_6bcce858`.

Consequência para este cartão: os 19 runs anteriores dele terminaram com `exit_code: 75` — o mesmo código do CONGELADO, rotulado pelo dispatcher como "rate-limited (quota wall)" e re-enfileirado sem contar falha. Ou seja, o cartão gira em falso desde 13/10 17:32 sem nunca chegar a um humano. Não é quota do modelo; é a guarda congelada.

Não contornei a guarda e não recriei o marcador `MODO_V2` (seria desligar uma proteção). Decisão registrada em `hermes-pedir-decisao` → `DECISAO_ID=20261014-111329-2607-sem-tarefa`. Nada foi tocado no código: sem workspace, o trabalho dos itens 1-4 do cartão não é executável com prova (teste + `zapp-verify --rapido` + commit + `hermes-tarefa-fechar`).
  [2026-10-15 14:14] default: UNBLOCK: guarda restaurada (MODO_V2 voltou): retomar a abertura/fechamento do cartao
  [2026-10-15 16:29] hugo: Nota de escopo (registro, não é bloqueio) — o que ficou fora dos arquivos deste cartão:

1. **Toggle em Configurações para o supervisor** ("notificar também da equipe"): a preferência está implementada e persistida no hook novo (`src/hooks/realtime/incomingAlertScope.ts`: chave `zapp:avisos-equipe` + `setTeamAlertsEnabled`, padrão desligado, lida pela decisão de aviso). O **controle visual** ficaria em `src/components/settings/**`, que não está na lista de arquivos deste cartão (área de telas). Enquanto o toggle não existir, a chave fica no navegador e a preferência é off.
2. **"Sem dono na minha fila"**: a regra implementada em `shouldAlertIncomingMessage` avisa para conversa própria (assigned_to = meu profiles.id) ou **sem dono** (`assigned_to` nulo). Não restringi "sem dono" às filas do usuário porque isso exige ler `queue_members` (tabela que não é tocada por nenhum arquivo deste cartão) e o custo desse SELECT cairia em todo evento de mensagem. Se a regra desejada for "sem dono E na minha fila", é um cartão de fila/SQL.
3. **`onClick` da notificação de navegador** (`showBrowserNotification`): é o escopo do cartão filho PK-11 (t_3fd6b3a8, "clicar abre a conversa no tray") — não mexi para não colidir. O clique do aviso em tela (toast) abre a conversa neste cartão.
  [2026-10-15 17:16] hugo: Incidente de `refs/stash` (é GLOBAL entre worktrees) — aviso para quem for o dono:

Ao tentar comparar com a base eu rodei `git stash pop` sem ter stash próprio (meu trabalho já estava commitado), e o pop aplicou **no meu worktree** o stash de OUTRO agente: `src/hooks/chat/useRealtimeMessages.ts`, `src/hooks/inbox/useRealtimeInbox.ts` e `src/hooks/realtime/messageSender.ts` (o drop aconteceu junto).

Já devolvi: essas três alterações voltaram para a lista de stashes como `stash@{0}`, com a mensagem "worktree avisos-mensagem-nova-global-261015154459e9: stash de OUTRO agente (...) restaurado pelo pop acidental de 15/10 17:05". Meu commit `8fa66c7c6c` não contém esses arquivos. Dono: `git stash list` e recupere do `stash@{0}` (o conteúdo está íntegro, só perdeu a mensagem original).
  [2026-10-15 17:25] hugo: Follow-up (não feito, fora dos arquivos do cartão): "notificar também da equipe" para o supervisor.

Para a opção ser ligável faltam duas peças que não existem: (a) preferência persistida junto das outras de notificação (coluna em user_settings — trilha de banco) e (b) o interruptor no painel de notificações (worker telas). Sem elas, publicar o setter seria código morto (o juiz apontou isso e eu tirei do diff). A regra entregue fica com padrão NEGADO: sem dono avisa, minha avisa, de outro atendente não avisa. O seam está documentado em src/hooks/realtime/incomingAlertScope.ts:19-23.

Events (406):
  [2026-10-15 17:54] [run 18614] heartbeat
  [2026-10-15 17:55] [run 18614] heartbeat
  [2026-10-15 17:57] [run 18614] heartbeat
  [2026-10-15 17:58] [run 18614] heartbeat
  [2026-10-15 17:59] [run 18614] heartbeat
  [2026-10-15 18:00] [run 18614] heartbeat
  [2026-10-15 18:01] [run 18614] heartbeat
  [2026-10-15 18:02] [run 18614] heartbeat
  [2026-10-15 18:03] [run 18614] heartbeat
  [2026-10-15 18:04] [run 18614] heartbeat
  [2026-10-15 18:05] [run 18614] heartbeat
  [2026-10-15 18:06] [run 18614] heartbeat
  [2026-10-15 18:07] [run 18614] heartbeat
  [2026-10-15 18:08] [run 18614] heartbeat
  [2026-10-15 18:09] [run 18614] heartbeat
  [2026-10-15 18:10] [run 18614] heartbeat
  [2026-10-15 18:11] [run 18614] heartbeat
  [2026-10-15 18:12] [run 18614] heartbeat
  [2026-10-15 18:13] [run 18614] heartbeat
  [2026-10-15 18:14] [run 18614] heartbeat

Runs (22):
  #12747 rate_limited @hugo  33s  2026-10-13 16:36
        ! pid 42056 exited rate-limited (quota wall) — requeued without counting a failure
  #12919 rate_limited @hugo  34s  2026-10-13 16:42
        ! pid 21152 exited rate-limited (quota wall) — requeued without counting a failure
  #13085 rate_limited @hugo  44s  2026-10-13 16:48
        ! pid 41020 exited rate-limited (quota wall) — requeued without counting a failure
  #13290 rate_limited @hugo  24s  2026-10-13 16:55
        ! pid 44396 exited rate-limited (quota wall) — requeued without counting a failure
  #13499 rate_limited @hugo  34s  2026-10-13 17:02
        ! pid 18092 exited rate-limited (quota wall) — requeued without counting a failure
  #13654 rate_limited @hugo  46s  2026-10-13 17:07
        ! pid 36296 exited rate-limited (quota wall) — requeued without counting a failure
  #13837 rate_limited @hugo  34s  2026-10-13 17:13
        ! pid 8940 exited rate-limited (quota wall) — requeued without counting a failure
  #14025 rate_limited @hugo  54s  2026-10-13 17:19
        ! pid 19452 exited rate-limited (quota wall) — requeued without counting a failure
  #14205 rate_limited @hugo  36s  2026-10-13 17:26
        ! pid 43544 exited rate-limited (quota wall) — requeued without counting a failure
  #14377 rate_limited @hugo  38s  2026-10-13 17:32
        ! pid 42468 exited rate-limited (quota wall) — requeued without counting a failure
  #14556 rate_limited @hugo  37s  2026-10-13 17:37
        ! pid 29700 exited rate-limited (quota wall) — requeued without counting a failure
  #14716 rate_limited @hugo  39s  2026-10-13 17:43
        ! pid 9420 exited rate-limited (quota wall) — requeued without counting a failure
  #14917 rate_limited @hugo  34s  2026-10-13 17:50
        ! pid 44868 exited rate-limited (quota wall) — requeued without counting a failure
  #15130 rate_limited @hugo  46s  2026-10-13 17:56
        ! pid 19380 exited rate-limited (quota wall) — requeued without counting a failure
  #15318 rate_limited @hugo  34s  2026-10-13 18:03
        ! pid 41056 exited rate-limited (quota wall) — requeued without counting a failure
  #15521 rate_limited @hugo  24s  2026-10-13 18:10
        ! pid 29392 exited rate-limited (quota wall) — requeued without counting a failure
  #15695 rate_limited @hugo  34s  2026-10-13 18:16
        ! pid 25892 exited rate-limited (quota wall) — requeued without counting a failure
  #15875 rate_limited @hugo  23s  2026-10-13 18:21
        ! pid 41236 exited rate-limited (quota wall) — requeued without counting a failure
  #16049 rate_limited @hugo  36s  2026-10-13 18:27
        ! pid 36888 exited rate-limited (quota wall) — requeued without counting a failure
  #16550 blocked      @hugo  186s  2026-10-14 11:10
        → Sem workspace: o marcador /home/joaquim_ataides/.local/libexec/hermes-guard/MODO_V2 foi removido (dir mtime 14/10 10:45) e hermes-tarefa-iniciar sai EXIT=75/CON
  #18556 timed_out    @hugo  6320s  2026-10-15 15:43
        ! Iteration budget exhausted (200/200) — task could not complete within the allowed iterations
  #18614 running      @hugo  active  2026-10-15 17:29
