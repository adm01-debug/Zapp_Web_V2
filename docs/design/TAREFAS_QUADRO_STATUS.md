# Tarefas + Lembretes + Quadro — STATUS
Base: 1b85cb439f42a47d1091ce740ec68be357f05903 · Repo path: /workspace/repos/Zapp_Web_V2-tarefas · Playwright: ok · QA user: ok (senha redefinida 28/09)

Decisões: G-1=Migrar reminders (1 ativo, risco zero) G-2=Desligar UI deals (0 deals em produção) G-3=2 itens sidebar por 30 dias G-4=Órfãs→Admin 01 (d7825f6e-0240-4500-bc88-2721897f78c6) G-5=Sem parser NL v1 G-6=WIP Fazendo=3 hard, Aguardando=5 soft G-7=Push só se infra existir (registrado como resíduo) G-8=Concluídas 7 dias

## CP0 Ambiente     [x] sha=1b85cb43 · branch=claude/feat-tarefas-f0-ledger-260928-1940
  baseline: typecheck=0 lint-ratchet=ok tc-ratchet=ok implicit-any=SIGTERM(ok) vitest=94/94 passed
  inventário: tasks=0 total · órfãs=0 · reminders=1(is_dismissed=false) · deals=0
  cron notify-due-reminders=EXISTE (jobid=14, schedule=* * * * *) — plano L4 era FALSA
  RLS conversation_tasks=4 policies com get_profile_id_for_user() — plano L2 era FALSA
  realtime: conversation_tasks NÃO está em supabase_realtime (só notifications)
  relreplident=d (default PK) — precisará REPLICA IDENTITY FULL

## DIVERGÊNCIAS PLANO × CÓDIGO
  D1: L4 "cron ausente" FALSO — jobid=14 notify-due-reminders já existe; etapas 17-18 ajustadas: criar notify_due_tasks (não renomear), unschedule('notify-due-reminders') com nome real
  D2: L2 "RLS USING(true)" FALSO — 4 policies já filtram por get_profile_id_for_user(); etapa 15 substituirá por políticas mais restritivas (só created_by)
  D3: current_profile_id() NÃO existe — usar get_profile_id_for_user(auth.uid()) ou criar alias; todas as novas policies usam o alias criado na migration
  D4: Trigger trg_prevent_conversation_task_field_forgery barra UPDATE em assigned_to — trigger de assigned_to:=created_by deve ser BEFORE INSERT (não UPDATE); sem conflito
  D5: supabase_realtime precisa: ALTER TABLE conversation_tasks REPLICA IDENTITY FULL + ALTER PUBLICATION supabase_realtime ADD TABLE conversation_tasks
  D6: cron.job name real = 'notify-due-reminders', não 'reminders-notify-due' como constava em alguns trechos do plano

## AUDITORIA 29/09/2026 — plano v1 (150 etapas) substituído por PLANO_TAREFAS_FINALIZACAO_100_ETAPAS.md
Relatório completo: docs/design/RELATORIO_AUDITORIA_TAREFAS_FUSAO.md · 62 feitas · 41 parciais · 47 não iniciadas · 15 bugs novos (B1–B15)

## CP1 Banco        [x] PR #1130 mergeada em 2845e242 · 3 migrations aplicadas em produção 28/09 (140000/140100/140200) · cron tasks-notify-due jobid=16 ativo · 1 reminder migrado · 1 notificação reminder_due gerada · RLS 4 policies tasks_*_own · realtime ok
## CP2 Dados        [~] useMyWorkItems existe (PR #1133) · sem join contacts · sem otimista · sem snooze · badge invertido (B6) · 0 testes do hook · types.ts NÃO regenerado (B15)
## CP3 Componentes  [~] card/chips/mode/empty ok · WorkItemSheet NÃO existe (B3) · MoveToMenu NÃO existe · chips sem CSS (B1) · 0 testes de componente
## CP4 Lista        [~] 6 seções ok · Concluídas nunca aparece (B4) · sem acento (B9) · filtros só busca · KPIs simplificados
## CP5 Quadro       [~] DnD 5 colunas ok · Aguardando impossível via UI (B2) · done sem 7d (B5) · reorder em doing cheio bloqueado (B8) · sem a11y do DnD
## CP6 Agenda       [~] 7 dias + atrasadas ok · sem grupos Alarmes/Prazos · sem QuickAdd por dia · D7: manter hoje→+6
## CP7 Avisos       [ ] cron ok · NENHUMA UI (toast/popover/badge/título) · /remind é fake (B10)
## CP8 Chat         [~] 8 abas · TasksTab reescrita · NotesTab ainda duplica lista · NotesTab.test com shape antigo (B11)
## CP9 A11y/mobile  [~] N/1/2/3 + foco no card · sem aria-live · reduced-motion parcial · mobile/light/zen não validados
## CP10 QA          [x] B14 identificado e corrigido (ver CP-A) · CI da PR #1133 100% verde no HEAD · E.2/E.3/E.5/isolamento seguem para as fases seguintes
## CP11 Entrega     [~] legado removido (12 arquivos) · PR #1133 MERGEADA em 74f409bb · produção verificada no nivel do artefato (chunk servido) · docs: ledger fechado, textos de produto ficam para a etapa 98 · remindersPending ainda no tipo (etapa 97)

## Novo plano (v2) — checkpoints
## CP-A Desbloqueio [x] fechado 29/09/2026 — Fase A, etapas 1–10 (executor: Hermes; PR #1133 assumida do claude-code)
  ⚠ DoD LITERAL NAO CUMPRIDO EM 2 ITENS: as etapas 1 e 9 exigem screenshots (out/A-01-prod-atual.png e out/A-09-prod-{tasks,board,chat}.png + console.json) que nunca existiram — o ambiente nao tem credencial de QA. O checkpoint foi fechado com SUBSTITUICAO DECLARADA (E2E autenticado + prova no chunk servido), nao com o DoD original. A auditoria de 29/09 confirmou: nenhum out/A-*.png existe no repo. Mesma natureza na etapa 20 (D12: prova no Network do Playwright trocada por teste de componente).
  prod antes=e433589f (ref main) · P1 CONFIRMADO: o banco ja esta no vocabulario novo (CHECK status in backlog/todo/doing/waiting/done/cancelled) e o front antigo gravava 'completed'/'pending' -> concluir/reabrir tarefa falhava em producao (1 tarefa real em status 'todo')
  causa B14 (escrita)=src/hooks/tasks/useMyWorkItems.ts — `type TaskUpdate = Record<string, any>` e rejeitado pelo .update() do supabase-js (TS2345 nas linhas 146, 186 e 204); o typecheck-baseline.json esta vazio, entao qualquer erro reprova o step. Reproduzido local: exit 1 com os mesmos 3 erros.
  B15=mesmo bug, outra face: a branch nasceu de main de 28/09 16:54, anterior a regeneracao do types.ts (18 colunas de conversation_tasks). Resolvido ao integrar a branch ao main atual — nao precisou regenerar nada.
  PR #1133 merge=74f409bbd55d5ad0c665be91641c282eb0b321f8 (squash · 29/09/2026 15:41:33Z · branch remoto apagado)
  commits empilhados=24475a27 (merge origin/main) · 8acd0936 (B14/B15) · 6dbbc194 (B9/B12) · 121526e3 (B11) · 6497681d (tipografia)
  gates no HEAD da PR (todos verdes)=Lint & TypeCheck · Unit Tests · Build · Security Audit · Contrato DB offline (rerun apos "toomanyrequests" do registry) · E2E Tests (Playwright)
  deploy READY=https://zapp-web-v2.vercel.app/ -> bundle /assets/index-ljreATgI.js (o anterior, index-B44wcD6i.js, passou a 404)
  prova do P1 no que a producao serve=chunk /assets/TasksModule-C51BlYUp.js contem waiting_reason · Aguardando · Fazendo · Quadro · backlog · doing, e ZERO ocorrencias de "completed"/"pending"
  E2E autenticado da main no commit de merge (e2e-logado.yml)=35 passed · 1 flaky · 2 skipped · 1 failed=e2e/reactions.spec.ts:84:3, PRE-EXISTENTE (o mesmo teste falhou nos runs 36589866502, 36592046165 e 36589996922, de outros PRs) — fora do escopo
  shots A-09=NAO produzidos: o ambiente do Hermes nao tem credencial de QA e o cofre nao tem login salvo para zapp-web-v2.vercel.app. Substituidos por (a) o E2E autenticado acima e (b) a prova no chunk servido. Refazer quando houver login de QA.
## CP-B Hook        [x] fechado 29/09/2026 — Fase B, etapas 11–22 (executor: Hermes) · types.ts ja regenerado na main · 0 Record<string,any> · join contacts ok · otimista ok · snooze ok · badge fix ok · 14 testes do hook + 1 de componente
## CP-B Hook — evidências (Fase B, etapas 11–22)
  [11] types.ts regenerado = JA CUMPRIDO na main: o arquivo traz as 18 colunas de conversation_tasks (waiting_reason, started_at, status_changed_at, ...), reminders.migrated_task_id e get_conversation_tab_counts. `git status` nao acusa types.ts -> diff = 0 (nada a regenerar). Conferido contra o schema vivo (project tnnnlkbymytvtqngbbqh) por SQL: 18 colunas, FK conversation_tasks_contact_id_fkey -> contacts, migrated_task_id presente.
  [12] B15 = o hook usa Database['public']['Tables']['conversation_tasks']['Insert'|'Update'] (aliases diretos do tipo gerado, sem tipo manual); grep -c "Record<string, any>" = 0; `tsc -b --force` = 0 erros; typecheck-ratchet baseline=0/atual=0/novas=0.
  [13] join do contato = select('*, contact:contacts!conversation_tasks_contact_id_fkey(id,name,phone,avatar_url)'); WorkItem ganhou `contact?: WorkItemContact | null` em workItem.types.ts (opcional para nao quebrar os testes puros) e o mapeamento row.contact -> item.contact tem teste proprio. PROVA COM DADO REAL (SQL no banco vivo): a tarefa migrada tem contact_id e o join resolve o contato (1 de 1). Nome/telefone nao foram lidos: PII de cliente nao sai da infra.
  [14] otimista = move, complete, reopen, cancel/deleteItem e update com onMutate (cancela as queries da key + tira snapshot de TODAS as keys ['work-items', profileId] + aplica applyTransition/patch no cache), onError (restaura o snapshot + toast) e onSettled (invalida). PROVA: teste com supabase.update pendente mostra o cache ja com o titulo novo e, apos a rejeicao, o titulo original de volta.
  [15] move(item, to, { index?, waitingReason? }) = com `index`, recalcula position 0..n da coluna de DESTINO e da de ORIGEM num unico upsert (onConflict:'id'); o upsert leva title e created_by porque no banco as duas sao NOT NULL SEM default (sem elas o PostgREST esbarra em not-null antes de resolver o conflito). TasksBoardMode passa { index: destination.index } no drop entre colunas. create recebe position = min(coluna) - 1 (entra no topo).
  [16] snooze(item, minutes | 'tomorrow9') = remind_at = now+minutes ou amanha 09:00 local, sempre com notified_at = null (rearma o alarme); exportado no hook. PROVA: teste confere as duas colunas (janela de +-1 min).
  [17] remind_in_past = setReminder(item, iso|null) exportado + assertRemindNotInPast aplicado em create, update e setReminder: iso < now-60s lanca { blocked: 'remind_in_past' } e NADA e escrito. PROVA: 2 testes (create e setReminder) com insert/update comprovadamente nao chamados.
  [18] API publica = JSDoc no topo do arquivo descrevendo a API e as regras; cancel(item) explicito com undo (deleteItem como alias, decisao D8); hasMounted saiu da API do hook e vive no TasksModule (useRef+useEffect), consumido por TasksListMode.
  [19] B6 = useMyWorkItemsBadge com UMA query select('id,due_date,remind_at,notified_at,status') e contagem no cliente (atrasadas + remind_at<=now AND notified_at IS NOT NULL, status fora de done/cancelled) — 2 round-trips viraram 1. Invalida ['work-items-badge'] no mesmo canal de realtime e no onSettled das mutations. PROVA: teste soma 2+1=2 numa unica select; teste confirma que snooze e complete invalidam a key (badge cai a 0).
  [20] B13 = query key SEM includeDone; a query traz sempre `done` dos ultimos 30 dias (.or('status.neq.done,completed_at.gte.<now-30d>')) e `cancelled` so com includeCancelled; Lista/Quadro/Agenda filtram localmente (7d/30d). PROVA (automatizada no CI): teste de componente do TasksModule conta as chamadas ao cliente Supabase ao alternar Lista->Quadro->Agenda->Lista = 1 select. TESTE DE MUTACAO: reintroduzindo a key dependente do modo, o teste fica vermelho ("expected 1 times, but got 2 times") -> o teste tem dentes. CORRECAO DA AUDITORIA (29/09, G1): o filtro nao cobria `completed_at IS NULL`, entao linha `done` sem carimbo (classe que o backfill de 20260928140000 pode gerar) ficaria invisivel para sempre; agora o `.or()` e 'status.neq.done,completed_at.is.null,completed_at.gte.<corte>' e ha teste medindo os tres termos + a janela.
  [21] testes = src/hooks/tasks/__tests__/useMyWorkItems.test.tsx (14 casos na Fase B: create com created_by/assigned_to, position no topo, remind_in_past em create e setReminder, complete+undo, WIP cheio, waiting sem motivo, move com indice/upsert, snooze x2, rollback do otimista, badge, mapeamento do contato) + src/components/tasks/__tests__/TasksModule.test.tsx (B13). Nenhum dos dois usa `any` nem @ts-nocheck (o lint-ratchet nao aceita divida nova). DEPOIS DA AUDITORIA (29/09): o teste do hook tem 15 casos (entrou o da query/30d) e nasceu src/components/tasks/__tests__/taskComponents.test.tsx (B9 acentos, B12 Backspace nao apaga, etapa 15 indice de destino) — 18 testes na area, todos com mutacao vermelha comprovada.
  [22] entrega = PR #1200 (branch hermes/tarefas-fase-b-26092914048a02) · MERGE_SHA=42019fbf1c1ea2c83f7b5d6bbb3687209e9dff04 (squash · 29/09/2026 18:07:39Z) · commits=a77cf070 (feat Fase B) · 6ee8ffc6 (docs CP-B) · 26868b9e (extrai o harness de mock) · bb29f023 (tira o `then` do harness)
  CI do PR (todos verdes) = 🔍 Lint & TypeCheck · 🧪 Unit Tests · 🏗️ Build · 🔒 Security Audit · Contrato DB offline · 🎭 E2E (Playwright) — os 6 obrigatórios — mais CodeQL (3) e SonarCloud
  deploy/producao = no merge, o bundle serviu o chunk /assets/useMyWorkItems-N98MKyJf.js (11.335 bytes). Provei por grep os marcadores conversation_tasks_contact_id_fkey (join), status.neq.done (janela de 30d do B13), work-items-badge, remind_in_past, tomorrow9, onConflict, "Tarefa concluida" e "Limite de Fazendo", e includeDone=0 / with-done=0 (o B13 antigo nao existe no bundle). MEDICAO INDEPENDENTE DA AUDITORIA (29/09): a producao ja tinha avancado para o build a7530654 (chunk useMyWorkItems-CQfCUPn5.js, sha256 562f9157…, os mesmos 11.335 bytes, conteudo byte-identico ao build local exceto o caminho do chunk pai); marcadores presentes com as contagens reais: work-items-badge=2 · remind_in_past=4 · tomorrow9=2 · onConflict=2 · includeDone=0.
  gates no HEAD final da branch bb29f023 (todos verdes, medidos NESTE commit) = typecheck-ratchet 0 novas · lint-ratchet 0 novas (atual 964 vs baseline 971: 7 removidas) · implicit-any 0 · guard-rail de tipografia aprovado · vitest 4240 passed / 0 failed (307 arquivos, 40 todo) · build verde · db:guard OK · bundle 492,3 KB gz (budget 550) · test:contracts ok · SonarCloud OK (depois de duas correcoes — ver D15). ATENCAO ao ler estes numeros: sao foto do HEAD da branch. Na main de hoje os mesmos gates dao lint-ratchet atual 956 / 15 removidas e vitest 4266 passed (313 arquivos) porque outras PRs entraram depois do merge (#1204, #1207, #1208, #1210) — a diferenca NAO e regressao desta entrega. E `db:guard` local pula a comparacao com o ledger do banco (DESTINO_URL ausente): "OK" cobre a estrutura local, nao a paridade com o banco.
  arquivos tocados = src/hooks/tasks/useMyWorkItems.ts · src/hooks/tasks/workItem.types.ts · src/components/tasks/TasksModule.tsx · src/components/tasks/board/TasksBoardMode.tsx · src/test/mocks/supabase.ts (so a linha exportada) + 2 arquivos de teste e 1 harness novos

## Divergências novas (Fase B)
  D11: a etapa 13 manda `select('*, contacts:contact_id(...)')` — sintaxe invalida no PostgREST (nao existe tabela `contact_id`). Usado `contact:contacts!conversation_tasks_contact_id_fkey(...)`, a forma com FK explicita. O contrato de saida segue o do plano (item.contact).
  D12: a etapa 20 pede a prova no "Network do Playwright". O e2e autenticado das Tarefas exige login e o ambiente nao tem credencial de QA (ver CP-A). Prova equivalente e permanente: contagem de chamadas ao cliente Supabase no teste de componente + teste de mutacao, ambos rodando no CI.
  D13: a etapa 15 nao preve que `title` e `created_by` sao NOT NULL sem default (unico caso nas 18 colunas); o upsert em lote precisa leva-las. Implementado com comentario no codigo.
  D14: `cancel(item)` NAO passa pela maquina de estados: canTransition bloqueia done->cancelled (de done so sai para todo) e a UI permite apagar um item concluido. Mantido update direto para 'cancelled' + undo para nao quebrar o contrato de "Apagar" (D8); se o plano quiser o bloqueio, e uma linha.
  D15: o SonarCloud (que NAO e check obrigatorio, mas reprovou por causa deste diff nas duas primeiras rodadas) exigiu duas correcoes no harness de teste: (a) 7,5% de duplicacao de codigo novo (teto 3%) porque os dois arquivos de teste repetiam o mesmo harness -> extraido para src/test/mocks/tarefas.ts; (b) `typescript:S7739` ("Do not add `then` to an object") no builder encadeavel reimplementado -> passou a reaproveitar o `createQueryBuilder` de src/test/mocks/supabase.ts (um builder para leitura e outro para escrita). LICAO para as proximas fases: teste novo deve nascer sem `then` em objeto literal e sem harness duplicado.

## AUDITORIA ADVERSARIAL 29/09/2026 — 5 subagentes + banco na mao (sobre CP-A/CP-B, base 73c92ca6)
Metodo: 5 subagentes com copias descartaveis (/tmp/audit1..5) para poderem MUTAR, mais trabalho de banco pelo MCP (projeto tnnnlkbymytvtqngbbqh, regiao real us-west-2). Todo achado de subagente foi reconferido na mao antes de aceitar — 2 foram REFUTADOS: o `.or()` com ISO cru NAO quebra o PostgREST (ha precedente em producao: useTalkXSuppression.ts:60/66, useCampaignEditor.ts:332, chat.service.ts:67) e o upsert em lote NAO dispara o antiforgery quando os valores nao mudam (provado por simulacao SQL com rollback forçado, zero residuo).
  Bateria de mutacao da auditoria: 20 mutacoes aplicadas -> 15 vermelhas (rede real: WIP de doing, waiting_reason, remind_in_past, key unica do B13, notified_at nulo no snooze, renumeracao das duas colunas, title/created_by no upsert, invalidacao do badge, position=min-1, tomorrow9=09:00, join do contato) e 5 VERDES = lacunas reais. Reverter os 2 testes de inbox -> 8 falhas (o B11 nao era cosmetico).
  ACHADOS E CORRECOES:
   (a) REGRESSAO MINHA na etapa 12: `type TaskInsert` e `} as TaskInsert);` foram reintroduzidos no commit a77cf070 (a Fase A havia tirado). Removidos; `tsc -b --force` segue 0 erros (o cast era desnecessario) -> a etapa 12 passa a ser cumprida de fato.
   (b) O teste de ROLLBACK do otimista era VACUOSO: `setQueriesData` chama `setQueryData` internamente (queryClient.js:204), entao o proprio patch otimista satisfazia `expect(restauracao).toHaveBeenCalled()` e o `onSettled` repunha o valor — a mutacao "rollback no-op" deixava a suite inteira verde. Agora a assercao confere o VALOR restaurado (titulo original) e a mutacao derruba o teste.
   (c) Sem teste nenhum: `DONE_WINDOW_DAYS` (janela de 30d), o indice de destino do Quadro (etapa 15), o Backspace do card (B12 — perda de dado) e os rotulos acentuados da Lista (B9). Fechados em src/components/tasks/__tests__/taskComponents.test.tsx + 1 caso novo no teste do hook.
   (d) G1 (gap meu, corrigido): o filtro `.or('status.neq.done,completed_at.gte.<corte>')` nao cobria `completed_at IS NULL` — linha `done` sem carimbo (classe que o backfill da migration 20260928140000 pode criar, porque o INSERT e direto e o trigger de estado so grava em UPDATE) ficaria invisivel PARA SEMPRE. Hoje ha 0 linhas nesse estado no banco vivo; o filtro agora inclui `completed_at.is.null`.
  Bateria de mutacao DESTA PR (8 mutacoes numa rodada: rollback anulado, DONE_WINDOW_DAYS=7, is.null removido, cancelled sem filtro, indice do Quadro removido, Backspace apagando, 3 acentos removidos) -> 5 testes VERMELHOS, EXIT=1; revertidas -> 18/18 verdes. Suite completa: 4266 passed / 0 failed (313 arquivos).
  NAO-PROVADO (honesto): RLS efetiva como usuario logado (o MCP roda com service role e ignora RLS — as 4 policies foram lidas, nao exercitadas); PostgREST real das queries `.or()`/upsert (simulacao SQL + precedente em codigo, nao request HTTP); e2e autenticado (sem credencial de QA); reprodutibilidade de build (hash do bundle local difere do de producao — enviesado pelo ambiente).
  Constatacoes do banco vivo (nada alterado): conversation_tasks com 1 tarefa (status=todo), 0 done sem completed_at, 0 sem dono, 0 sem status_changed_at; 4 policies; gatilhos trg_prevent_conversation_task_field_forgery, trg_task_set_assignee, trg_task_state_change, update_conversation_tasks_updated_at; cron tasks-notify-due (* * * * *) ativo e notify-due-reminders desligado; get_conversation_tab_counts usa `status NOT IN ('done','cancelled')`. NAO existe CHECK de completed_at quando done nem UNIQUE (created_by,status,position): a integridade dessas duas regras depende do codigo, nao do banco.
  ENTREGA DAS CORRECOES: PR #1217 (branch hermes/auditoria-fases-ab-260929162891bf, rebaseada na main pelo proprio hermes-tarefa-fechar) · MERGE_SHA=880f1a3c45bd4644606e33df0e2c4c340c8ab518 (squash · 29/09/2026) · commits=5e8e01bf (fix: etapa 12 + `completed_at.is.null`) · 265e7a1f (test: dentes do rollback/janela/B9/B12/indice) · b435f4b6 (docs). Checks obrigatorios 6/6 verdes (🔍 Lint & TypeCheck · 🧪 Unit Tests · 🏗️ Build · 🔒 Security Audit · Contrato DB offline · 🎭 E2E Tests) + CodeQL x2; deploy:production=success.
  PROVA DE PRODUCAO pos-merge (medida na mao, nao herdada do CI): bundle assets/index-M4dhV-WT.js; varredura BFS de 374 chunks servidos -> SO useMyWorkItems-BvcOab1q.js contem `completed_at.is.null` (o filtro corrigido) e NENHUM chunk contem includeDone/with-done.
  RE-VERIFICACAO DO BANCO pela rota propria do time (gateway MCP supabase-zapp-web-v2-mcp, 29/09): total=1 tarefa (todo=1) · done_sem_carimbo=0 · sem_dono=0 · policies=4 · triggers=4 · cron tasks-notify-due ativo=1 — bate 1:1 com o que a auditoria mediu pelo MCP da nuvem. O `db_query` desse gateway tambem roda como service_role, logo a RLS efetiva SEGUE nao-provada (ele nao impersona usuario). O endpoint nao exige Authorization (o token vai no path): tratar o link como credencial.

## Divergências novas (auditoria)
  D16: `useMyWorkItemsBadge` nao tem consumidor na UI (depende da Fase F) e `WorkItem.contact` (join da etapa 13) tambem nao e renderizado — contratos prontos e testados, UI pendente. `includeCancelled`, `snooze` e `setReminder` sao API publica sem UI (Fase F).
  D17: `bun run lint` (eslint cru, que NAO e gate do CI) acusa 956 problemas legados; o gate real e o lint-ratchet, que passa (0 novas).

## CP-C Sheet       [ ] WorkItemSheet= · ?task= · Aguardando por DnD/kebab/menu= · kebab 5 grupos= · RemindChip popover= · ContactChip=
## CP-D QuickAdd    [ ] chip-btn CSS= · 7 chips= · validação passado= · teste=
## CP-E Telas       [~] etapas 47 (B7) e 48 (B4) fechadas 29-30/09/2026 (executor: Hermes) · KPIs 88px= · filtros 3 modos= · Concluídas 7d: ok · Quadro WIP/ordem= · Agenda grupos= · 0 requests na troca= · modo por rota: ok

## Etapa 47 (B7) — modo por rota (Fase E) — evidências

**Regra do plano:** `?view=pipeline` abre SEMPRE no Quadro; `?view=tasks` retoma o último modo salvo (ou a Lista); a preferência só é gravada no `onChange` do `ModeSwitcher`.

**Causa no código (por que as duas telas ficaram idênticas):** `src/pages/ViewRouter.tsx` apontava os DOIS itens do menu para o mesmo componente, sem props — `'pipeline'` (menu "Quadro", Alt+P) e `'tasks'` (menu "Tarefas", Alt+K) — e `TasksModule` preferia o modo salvo no `localStorage` sobre o `defaultMode`. O mesmo componente, no mesmo modo, era servido pelos dois caminhos.

**Mudanças (4 arquivos):**

| arquivo | o que muda |
|---|---|
| `src/pages/viewRouteProps.ts` (novo) | contrato de entrada das rotas do módulo: `pipeline` = `{ defaultMode: 'board', forceMode: true }` |
| `src/pages/ViewRouter.tsx` | `pipeline` sai do `VIEW_MAP` e entra em `SPECIAL_VIEWS` passando o contrato; `tasks` segue sem props |
| `src/components/tasks/TasksModule.tsx` | prop `forceMode`: o modo da rota vence o salvo; a gravação continua só em `setMode` (troca pelo usuário) |
| `src/components/tasks/__tests__/TasksModule.test.tsx` | 5 casos novos + `TooltipProvider` no harness (a app fornece em `Providers`) |

**Teste de mutação (4 mutações, uma por vez, árvore restaurada entre elas):**

| mutação | resultado |
|---|---|
| M1 `TasksModule` sem `forceMode` | 2 vermelhos (os 2 casos de `pipeline`) |
| M2 `TasksModule` ignora o modo salvo | 1 vermelho (`tasks` retoma o salvo) |
| M3 rota `pipeline` sem `forceMode` | 1 vermelho (contrato do roteador) |
| M4 rota `pipeline` com `defaultMode: 'list'` | 1 vermelho (contrato do roteador) |

**Gates:** `typecheck` ✓ · `lint-ratchet` 0 novas ✓ · `implicit-any` 0 ✓ · `build` ✓ · bundle 315,5/340 KB inicial e 492,3/550 KB gzip ✓ · `db:guard` ✓ · suíte 4260 passed / 0 failed (311 arquivos, 40 todo) ✓

**Entrega:** PR #1230 mergeada em `1b23980d358aac2525c960168664ce43a9346d0b` (squash; commits de fix/test/docs) · deploy de produção: success · prova em produção: dos 376 chunks servidos por `zapp-web-v2.vercel.app`, exatamente 2 trazem `forceMode` — o do roteador (`{pipeline:{defaultMode:"board",forceMode:!0}}`) e o do módulo (`{defaultMode:e="list",forceMode:t=!1}`) — trechos idênticos ao build local.

**Achado fora do escopo (não corrigido):** `src/components/inbox/tabs/Crm360Tab.tsx:120/167/245` manda "Ver funil →" / "Ver pipeline →" para `navigateToView('pipeline')`; depois desta etapa esses botões abrem o Quadro de TAREFAS (antes caíam na mesma tela no modo salvo). Rótulo e destino são decisão de produto.

## Etapa 48 (B4) — "Concluídas (7 dias)" na Lista — evidências

**Regra do plano:** a seção "Concluídas (7 dias)" da Lista recebe `done7d` (a query da etapa 20 já traz 30 dias; o agregado filtra 7), com cabeçalho colapsado e "ver mais (30 dias)" no rodapé.

**O que já existia (Fase B) e o que faltava:** a seção já existia com `done7d` e recolhida, mas chamava-se só "Concluídas" e **não tinha rodapé** — não havia recorte dos 8 aos 30 dias para revelar.

**Mudanças (8 arquivos):**

| arquivo | o que muda |
|---|---|
| `src/hooks/tasks/workItemAggregates.ts` | bucket novo `doneOlder` (8–30 dias) no `BucketsByDue`, com o corte dos 7 dias e o teto de 30 |
| `src/components/tasks/list/TasksListMode.tsx` | seção passa a ser "Concluídas (7 dias)"; a `Section` ganha `olderItems` e o rodapé "ver mais (30 dias)" / "ver menos" |
| `src/components/tasks/TasksModule.tsx` | o filtro de busca também passa pelo `doneOlder` |
| `src/components/tasks/__tests__/taskComponents.test.tsx` | caso novo (recolhida → abre → revela as antigas → volta) e B9 atualizado para o rótulo novo |
| `src/hooks/tasks/__tests__/workItemAggregates.test.ts` | 3 casos do recorte (8–30 dentro; ≤7 fora; >30 fora) |
| `TasksTab` / `NotesTab` / `Crm360Tab` `.test.tsx` | mocks de `byDue` sincronizados com o campo novo do tipo (o typecheck exige) |

**DoD ("concluir → item aparece na seção"), em três elos medidos:** o hook grava `status=done` + `completed_at` no payload (teste do hook "complete move para done e oferece undo"); o agregado joga esse item em `done7d` (testes do bucket); a Lista o renderiza na seção (teste de componente). O clique-a-clique dentro do `TasksModule` **não** é simulado: o mock devolve leitura fixa e a invalidação desfaz o patch otimista, então a asserção mediria o mock — não o app.

**Teste de mutação (3 mutações, árvore restaurada entre cada):** M1 sem o corte dos 7 dias em `doneOlder` → 1 vermelho (o caso do recorte); M2 rodapé que não revela → 1 vermelho; M3 seção apontando para o bucket errado (`done7d`) → 1 vermelho. 21 verdes nas três rodadas.

**Gates:** `typecheck` ✓ · `lint-ratchet` 0 novas ✓ · `implicit-any` 0 ✓ · `build` ✓ · bundle 492,3/550 KB gzip e 4017,5/4100 KB de assets ✓ · `db:guard` ✓ · suíte 4279 passed / 0 failed (312 arquivos) ✓

**Resíduo (comportamento de antes, mantido de propósito):** quem tem só concluídas de 8–30 dias e nada ativo continua vendo o estado vazio da Lista — a seção só nasce quando há algo nos 7 dias.

## CP-F Avisos      [ ] useWorkItemNotifications= · popover Sidebar 3 botões= · toast= · badge sidebar= · título aba= · push decisão= · idempotência 1→2→done= · /remind real=
## CP-G Chat        [ ] NotesTab resumo= · TasksTab mini-quadro= · redirect reminders→tasks= · Alt+T= · testes inbox=
## CP-H A11y        [ ] 7 atalhos= · aria-live= · reduced-motion 0s= · contraste= · mobile 3 modos= · light= · zen=
## CP-I Testes      [ ] arquivos= · casos= · bundle= KB gz · TTI 300 itens=
## CP-J Entrega     [ ] gates 8/8= · func 24/24= · geometria= · cores= · isolamento 2 usuários= · migração= · PR drop reminders_pending (aguarda APROVADO)= · docs= · prod final=

## Divergências plano × código (D1–D6 acima; novas)
  D7: Agenda começa hoje (etapa 93) e não na segunda (etapa 98) — contradição do plano v1; mantido hoje→+6
  D8: "Apagar" = cancelar (soft) com undo; sem hard-delete na v1
  D9: useConversationTasks/useReminders removidos (não viraram adaptadores)
  D10: não existe NotificationCenter; ponto de render = popover de notificações da Sidebar

## Iterações
- 28/09 PR #1133: 6 commits de fix de CI (TransitionResult, cast Supabase, LazyExoticComponent, baseline realtime, runtime-config.test.sh) + 2 pushes vazios que NÃO geraram run (concurrency) → regra 7 do plano v2

## Pendências / resíduos (honestos)
- Push do navegador: decidir na etapa 64 (infra existe: usePushNotifications.ts, PushNotificationToggle.tsx — não avaliada)
- Parser de linguagem natural: v2 (G-5)
- Virtualização: v2 (>500 itens)
- Agenda sem arrastar entre dias: v2
- Delegação / recorrência / subtarefas / colunas personalizáveis / anexos / comentários: v2
- Migration de drop de reminders_pending: aguarda APROVADO (etapa 97)
- e2e/reactions.spec.ts (reacoes do inbox) falha de forma cronica no e2e-logado da main desde antes desta entrega — nao e regressao das Tarefas; vira tarefa separada
- Guarda git do Hermes trava durante rebase: com HEAD destacado `git branch --show-current` devolve vazio e a checagem nega TODO comando git, inclusive `git rebase --abort/--continue` (deadlock). Contorno usado: integrar com `git merge origin/main`. Sugestao de correcao registrada no corpo do PR #1133
- `bun run lint` (eslint cru, que NAO e gate do CI) falha com 967 problemas legados; o gate real e o lint-ratchet, que passa (0 novas)
- Fase A, divergencia do plano: a etapa 3 lista hipoteses erradas para o B14 (NotesTab.test / vi.importMock / cast do ViewRouter); a causa era o tipo frouxo do proprio hook
- Fase A, divergencia do plano: a regra 8 ("logs do CI devolvem 403") esta desatualizada — `gh run view --log-failed` funciona e foi o que localizou o B14
- Fase A, divergencia do plano: integracao da branch ao main feita por MERGE (rebase e inviavel sob a guarda — ver acima); a PR passou a ter um commit de merge
- Auditoria 29/09 — residuos que NAO fechei (fora do escopo desta PR, viram tarefa propria quando o Joaquim quiser): `work-items-badge` sem consumidor na UI; `Bell` e `Filter` importados e nao usados no TasksModule; `get_conversation_tab_counts.reminders_pending` devolve 0 fixo (campo morto); `created_by` e NOT NULL com FK ON DELETE SET NULL (apagar um profile que tenha tarefas falha); sem indice em completed_at nem em position; `update()` do hook ignora `input.status` (vai morder no Sheet da Fase C); WIP contado globalmente e nao por contato; duplicidade entre workItemAggregates e TasksBoardMode (o SonarCloud nao reprova porque nao e codigo novo); e2e/reactions.spec.ts cronico na main.
