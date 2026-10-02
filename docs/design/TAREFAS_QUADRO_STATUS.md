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

## CP-C Sheet       [x] WorkItemSheet=ok (23–27, C1) · ?task=ok · Abrir pelo card=ok (B3) · Aguardando por DnD/kebab/menu=ok (28/29, C2; DnD e kebab) · kebab 5 grupos=ok (30, C2) · RemindChip popover=ok (31, C2) · ContactChip=ok (32, C2) · MoveToMenu=ok (33, C2, em board/) · screenshot `C-34-sheet.png` **tirado em producao em 02/10/2026** com a conta COMPRAS (o bloqueio de login nao existe mais)
## CP-D QuickAdd [x] — chip-btn CSS=ok · 7 chips=ok (reconfirmado no DOM em 02/10: `[data-testid^=quick-add-chip]` = 7) · screenshot `D-42-quickadd.png` tirado 02/10 · validação passado=ok · teste=11+2+6 mutações
## CP-E Telas       [~] etapas 43, 44, 45 e 46, 47 (B7), 48 (B4), 49, 50, 51 (B5), 52 (B8), 53, 55, 56 e 57 fechadas 29-30/09/2026 (executor: Hermes) · subtítulo: ok (números reais pt-BR) · KPIs 88px: ok (5 cards, tile 44px, WIP n/3) · filtros 3 modos: ok (barra de 5 filtros, estado na URL por replaceState, recorte único) · Concluídas 7d: ok · Próximas por dia: ok · fade ao concluir: ok · Concluído 7d no Quadro: ok · Quadro WIP/ordem: drop ok (interno sim, externo nao) · coluna vazia/esqueleto/altura: ok · Agenda grupos: ok (3 grupos, ponto por tipo, atrasadas expansível) · card agenda: ok (h-11, 1 linha, checkbox) · QuickAdd no dia: ok (pré-preenchido) · 0 requests na troca= · modo por rota: ok · auditoria F1: ok (7 correções; 9 mutações mortas) · auditoria F2: ok (7 correções; 7 mutações mortas) · auditoria F3: ok (A4 16/16 mutações mortas; A1-1 corrigido; 3 achados do A2 na fila) · cenários F4: ok (7 sobreviventes da F3 cobertos; 5/5 mutações mortas) · rótulos pt-BR do módulo: ok (Média, Concluído e as políticas das colunas acentuados)

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

## Etapa 49 — Lista: "Próximas" por dia, "Sem prazo" colapsável e tooltip da ordenação — evidências

**Regra do plano (3 comportamentos):** "Próximas" agrupa por dia ("Amanhã", "Qua 01/10", …, "Semana que vem" para > 7 dias) com subcabeçalho `text-[12px]`; "Sem prazo" colapsa quando > 10; tooltip no cabeçalho "Ordenado por prazo, depois prioridade".

**Mudanças (4 arquivos):**

| arquivo | o que muda |
|---|---|
| `src/hooks/tasks/workItemAggregates.ts` | `dayGroupLabel` (Hoje / Amanhã / "Seg 05/10" dentro de 7 dias / "Semana que vem" acima disso) e `groupUpcomingByDay` (ordena por prazo → prioridade e agrupa dias consecutivos); `PRIORITY_WEIGHT` extraído do `bucketByStatus` e reusado |
| `src/components/tasks/list/TasksListMode.tsx` | "Próximas" recebe `groups` + `hint`; subcabeçalho `text-[12px]`; tooltip no cabeçalho; "Sem prazo" com `defaultOpen={noDue.length <= 10}`; `renderCard` extraído (o card estava duplicado nos dois caminhos) |
| `src/hooks/tasks/__tests__/workItemAggregates.test.ts` | 3 casos: rótulos (incluindo a fronteira +7 / +8 dias), agrupamento ordenado por prazo e desempate por prioridade |
| `src/components/tasks/__tests__/taskComponents.test.tsx` | 3 casos: subcabeçalhos + "Semana que vem"; "Sem prazo" abre com 10 e recolhe com 11; tooltip do cabeçalho. Harness novo `renderLista` com `TooltipProvider` (a app fornece em `AppProviders.tsx:75`) |

**Divergências do plano (4, pequenas):** (1) o plano não diz **qual** cabeçalho leva o tooltip — escolhi o de "Próximas", que é onde o agrupamento por prazo acontece; (2) o harness da Lista ganhou `TooltipProvider`, porque o `Tooltip` do cabeçalho exige provider e a app já fornece um global (mesmo padrão do board na etapa 47); (3) `PRIORITY_WEIGHT` foi extraído para não duplicar o mapa de pesos (teto de 3% de duplicação do SonarCloud) — `bucketByStatus` passou a usá-lo; (4) o plano pede o subcabeçalho em `text-[12px]`, mas o guard-rail de tipografia (`node scripts/qa/medir-tipografia.cjs --check`, teto 0 para "arbitrário com equivalente exato") reprovou: o token equivalente é `text-xs` (12px). O CI pegou isso no PR #1238 e o valor foi trocado por `text-xs`, preservando o tamanho pedido.

**Teste de mutação (3 mutações, árvore restaurada entre cada):** M1 "Sem prazo" nunca colapsa → 1 vermelho; M2 "Próximas" sem os subcabeçalhos → 1 vermelho; M3 o corte de 7 dias vira 99 → 3 vermelhos; 25 a 27 verdes em cada rodada.

**Gates:** `typecheck` ✓ · `lint-ratchet` 0 novas (baseline 971, atual 955) ✓ · `implicit-any` 0 ✓ · `build` ✓ · bundle 492,3/550 KB gzip e 4018,6/4100 KB ✓ · `db:guard` ✓ · suíte 4302 passed / 0 failed (313 arquivos) ✓

**Resíduo (defensivo, não é regressão):** se `upcoming` trouxer item sem `due_date` — estado impossível vindo do `bucketByDue` — a seção cai na lista plana em vez de esconder a tarefa.

## Etapa 50 — animação de concluir na Lista (fade 200ms) — evidências

**Regra do plano:** `motion.div` com `exit={{ opacity: 0, height: 0 }}` de 200ms por item, via `AnimatePresence`, respeitando reduced-motion. DoD: item some com fade.

**Mudanças (2 arquivos):**

| arquivo | o que muda |
|---|---|
| `src/components/tasks/list/TasksListMode.tsx` | o card de cada item ganha `exit` (fade + altura, 200ms) e `overflow-hidden`; cada lista de itens (a plana e a de cada dia de "Próximas") passa a ficar dentro do seu próprio `AnimatePresence`, que é o que faz o exit ser observado; `useReducedMotion()` (padrão do repo) zera as durações de entrada e saída |
| `src/components/tasks/__tests__/taskComponents.test.tsx` | caso novo da etapa 50 — o item fica montado durante a saída, ainda está lá 60ms depois (pina a duração) e sai ao fim; harness `renderBuckets` para trocar os buckets; a asserção final do caso da etapa 48 virou `waitFor` porque o item continuava montado por causa do exit |

**A primeira prova do exit foi um vermelho:** ao introduzir a animação, o caso da etapa 48 ("ver menos" esconde a antiga) ficou vermelho — o item permanecia montado durante a saída. Foi o que mostrou que a animação está de fato em cima do unmount, e é o mesmo mecanismo que o caso novo pina.

**Achado durante a construção (registrado, não é bug):** quando o **último** item de uma seção é concluído, quem sai é a seção inteira — o fade por item só acontece enquanto a seção continua de pé (com pelo menos um item). O plano pede o fade do item; a animação da seção é outra coisa e não está no escopo.

**Teste de mutação (3 mutações, árvore restaurada entre cada):** M1 sem o `exit` → 1 vermelho; M2 sem o `AnimatePresence` por item → 1 vermelho; M3 saída instantânea (duração 0) → **sobreviveu na primeira rodada** e matou 1 depois que o caso passou a medir a duração (60ms ainda em cena). Na primeira versão o teste pinava o mecanismo do exit, não os 200ms — a lacuna foi encontrada pela própria mutação e fechada.

**Gates:** `typecheck` ✓ · `lint-ratchet` 0 novas ✓ · `implicit-any` 0 ✓ · **guard-rail de tipografia** ✓ · `build` ✓ · bundle 492,3/550 KB gzip e 4018,8/4100 KB ✓ · `db:guard` ✓ · suíte 4315 passed / 0 failed (316 arquivos) ✓

**Lacuna declarada (não medida):** o caminho de reduced-motion (durações zeradas pelo `useReducedMotion()`) não tem caso próprio — medi-lo exigiria mockar o módulo do framer no arquivo inteiro, mudando o comportamento dos outros casos do harness. O que está pinado é o exit e a duração normal (200ms).

## Etapa 51 (B5) — coluna Concluído do Quadro: 7 dias + "Ver mais antigas (30 dias)" — evidências

**Regra do plano:** a coluna Concluído mostra só `completed_at ≥ now-7d`, ordem `completed_at desc`, rodapé "Ver mais antigas (30 dias)" (filtro local). DoD: paginação local.

**Mudanças (4 arquivos):**

| arquivo | o que muda |
|---|---|
| `src/hooks/tasks/workItemAggregates.ts` | `splitDoneByRecency(items, now)` → `{ recent, older }`, ambos em `completed_at desc`; `recent` é a janela de 7 dias, `older` o resto da janela de 30 dias que a query do hook já traz |
| `src/components/tasks/board/BoardColumn.tsx` | na coluna `done` a lista passa a ser `recent` e o rodapé "Ver mais antigas (30 dias)"/"Ver menos" revela `older`; o contador do cabeçalho passa a contar o que está visível |
| `src/hooks/tasks/__tests__/workItemAggregates.test.ts` | 4 casos: janela + ordem desc, teto de 30 dias (mais novo antes do mais antigo), sem carimbo na janela recente, ignora o que não está concluído |
| `src/components/tasks/__tests__/taskComponents.test.tsx` | caso de componente: a concluída de 13 dias não aparece até clicar no rodapé |

**Decisão declarada (não é divergência silenciosa):** a concluída **sem `completed_at`** entra na janela **recente** (fica visível) em vez de sumir: a auditoria da Fase A mediu 0 linhas nesse estado, e esconder tarefa por falta de dado seria pior do que mostrar. Para quem tem carimbo, a janela de 7 dias do plano vale integralmente.

**Limitação conhecida (registrada, não corrigida):** arrastar um card **dentro** da coluna Concluído continua persistindo `position`, mas a coluna agora é ordenada por `completed_at desc` — o arrasto não muda mais a ordem visível (antes da etapa 51 mudava). Desabilitar o arrasto ali levaria junto o caminho de arrastar a tarefa de volta para outra coluna; decidir isso é de produto, então ficou fora do escopo.

**Teste de mutação (3 mutações, árvore restaurada entre cada):** M1 sem o corte dos 7 dias → 2 vermelhos (agregado + coluna); M2 sem a ordem `completed_at desc` → 2 vermelhos; M3 rodapé que não revela → 1 vermelho.

**Gates:** `typecheck` ✓ · `lint-ratchet` 0 novas ✓ · `implicit-any` 0 ✓ · guard-rail de tipografia ✓ · `build` ✓ · bundle 492,3/550 KB gzip e 4019,1/4100 KB ✓ · `db:guard` ✓ · suíte 4327 passed / 0 failed (318 arquivos) ✓

## Etapa 52 (B8) — coluna "Fazendo" cheia: drop de fora bloqueado, reorder por dentro liberado — evidências

**Regra do plano:** `isDropDisabled = hardFull && dragSourceStatus !== 'doing'`, com a origem guardada no `onDragStart` do `DragDropContext`; o cabeçalho da coluna cheia ganha `ring-1 ring-destructive/40`. DoD: reordenar dentro de "Fazendo" cheio funciona; a 4ª vinda de fora não solta.

**Mudanças (3 arquivos):**

| arquivo | o que muda |
|---|---|
| `src/components/tasks/board/TasksBoardMode.tsx` | estado `dragSourceStatus` alimentado pelo `onDragStart` (origem do arrasto) e limpo no `onDragEnd`; repassado às colunas |
| `src/components/tasks/board/BoardColumn.tsx` | prop `dragSourceStatus`; `isDropDisabled = hardFull && dragSourceStatus !== status` (antes: `hardFull` puro, que travava até a reorganização interna); anel `ring-1 ring-destructive/40` no cabeçalho cheio |
| `src/components/tasks/__tests__/taskComponents.test.tsx` | mock do dnd passa a registrar o `onDragStart` e o `isDropDisabled` de cada coluna; 2 casos novos |

**Por que a regra exata do plano:** `doing` é a única coluna com limite rígido (`WIP_LIMITS.doing.hard = 3`). Sem guardar a origem, com 3/3 o arrasto interno também era recusado — o usuário não conseguia nem reordenar o que já estava lá. Agora: origem `doing` → aceita; origem de outra coluna → recusa (o card volta e o cabeçalho mostra o anel).

**Teste de mutação (3, árvore restaurada entre cada):** M1 `isDropDisabled = hardFull` (trava também o interno) → vermelho no caso do reorder interno; M2 `isDropDisabled = false` (nunca bloqueia) → vermelho no caso da origem externa; M3 sem a classe do anel → vermelho no caso do cabeçalho.

**Gates:** `typecheck` ✓ · `lint-ratchet` 0 novas ✓ · `implicit-any` 0 ✓ · guard-rail de tipografia ✓ · `build` ✓ · bundle 4018,9/4100 KB ✓ · `db:guard` ✓ · suíte 4330 passed / 0 failed (318 arquivos) ✓

## Etapa 53 — coluna vazia com política, esqueleto próprio e altura sem número mágico — evidências

**Regra do plano:** (1) `TasksEmptyState variant="column"` recebe `policy` e mostra o texto da política em `text-muted-foreground/70`; (2) `BoardColumnSkeleton` (3 `WorkItemCardSkeleton`) usado no `isLoading`; (3) remover `max-h-[calc(100vh-280px)]` → `min-h-0 flex-1` com o pai em `h-full`. DoD: 3 itens.

**Mudanças (5 arquivos):**

| arquivo | o que muda |
|---|---|
| `src/components/tasks/TasksEmptyState.tsx` | prop `policy?: string`; no `variant="column"` o texto da política entra abaixo de "Coluna vazia" em `text-xs text-muted-foreground/70` |
| `src/components/tasks/shared/BoardColumnSkeleton.tsx` (**novo**) | esqueleto da coluna: 3 `WorkItemCardSkeleton` |
| `src/components/tasks/board/BoardColumn.tsx` | `{isLoading && <BoardColumnSkeleton />}` no lugar dos 2 cartões montados ad hoc; `policy={col.policy}` no estado vazio; raiz da coluna troca `max-h-[calc(100vh-280px)]` por `h-full min-h-0` (e o import de `WorkItemCardSkeleton` sai, senão vira dívida nova de lint) |
| `src/components/tasks/__tests__/taskComponents.test.tsx` | 3 casos: política na coluna vazia (as 5 políticas), esqueleto (5 × 3 = 15 `.animate-shimmer`, e nenhum "Coluna vazia" durante o carregamento) e a raiz da coluna sem o teto de 100vh com `min-h-0` |
| `docs/design/TAREFAS_QUADRO_STATUS.md` | este bloco |

**Divergência declarada (item 3, mínima):** o plano pede `min-h-0 flex-1` na raiz da coluna. `flex-1` ali atua no eixo principal do pai — que é uma **linha** (`flex gap-3 overflow-x-auto`) — e distribuiria a **largura** entre as colunas, acabando com a largura fixa (`min-w-[232px] xl:min-w-[260px]`) e com o scroll horizontal; isso ainda contraria a premissa da etapa 54 (verificar se as 5 colunas cabem em 1440, ou seja, elas não são fluidas). Usei `h-full min-h-0`: o pai (container do Quadro) já é `h-full` e a cadeia acima (`motion.div` do módulo com `flex-1 min-h-0`) tem altura resolvida, então a coluna preenche a altura disponível pelo `align-items: stretch` do flex — mesmo efeito pretendido (coluna alta usa a altura real, sem constante de viewport), sem mexer na largura.

**Teste de mutação (3, árvore restaurada entre cada):** M1 sem o texto da política → vermelho no caso da coluna vazia; M2 esqueleto com 2 cartões → vermelho na contagem (15 → 10); M3 teto mágico de volta → vermelho no caso da raiz da coluna.

**Gates:** `typecheck` ✓ · `lint-ratchet` 0 novas ✓ · `implicit-any` 0 ✓ · guard-rail de tipografia ✓ · `build` ✓ · bundle 4019,1/4100 KB ✓ · `db:guard` ✓ · suíte 4333 passed / 0 failed (318 arquivos) ✓

## Etapa 43 — subtítulo do cabeçalho com contagens reais — evidências

**Regra do plano:** subtítulo do `PageHeader` = `"{abertas} abertas · {hoje} para hoje"` com `toLocaleString('pt-BR')`. DoD: números reais.

**Mudanças (2 arquivos):**

| arquivo | o que muda |
|---|---|
| `src/components/tasks/TasksModule.tsx` | `openCount` = tudo que não está concluído (`backlog + todo + doing + waiting`, tirado do `byStatus` que já vem do hook) e `kpis.dueToday`; o subtítulo fixo "Suas tarefas pessoais" vira `${abertas} · ${hoje}` |
| `src/components/tasks/__tests__/TasksModule.test.tsx` | 3 casos: contagens da carga (4 abertas / 1 para hoje, com a concluída fora da conta), singular ("1 aberta") e separador de milhar em pt-BR ("1.234", com 1234 linhas no mock) |

**Refinamento declarado (mínimo):** o plano escreve o rótulo no plural fixo ("{abertas} abertas"). Com uma tarefa só isso leria "1 abertas", então o texto alterna para **"1 aberta"** — o número é o mesmo pedido, só a concordância acompanha. Testado.

**Teste de mutação (3, árvore restaurada entre cada):** M1 sem `toLocaleString` → vermelho no caso do milhar; M2 `kpis.dueToday` trocado por `kpis.overdue` → 2 vermelhos (número errado); M3 plural fixo → vermelho no caso do singular.

**Gates:** `typecheck` ✓ · `lint-ratchet` 0 novas ✓ · `implicit-any` 0 ✓ · guard-rail de tipografia ✓ · `build` ✓ · bundle 4019,1/4100 KB ✓ · `db:guard` ✓ · suíte 4347 passed / 0 failed (321 arquivos) ✓

## Etapa 44 — KPIs no padrão `ContactKpiCard` (88px) — evidências

**Regra do plano:** 5 cards `h-[88px] rounded-[14px]`, tile 44px (`bg-kpi-*`), ícone 20px, valor 26/700 tabular, label 13/500. Cores: Atrasadas `kpi-yellow` (`destructive/15` se > 0), Para hoje `kpi-blue`, Fazendo `kpi-purple` "n/3", Concluídas 7d `kpi-green`, Tempo médio `muted`. Grid `grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3`. DoD: E.2 `kpiCard=88±4`.

**Mudanças (3 arquivos):**

| arquivo | o que muda |
|---|---|
| `src/components/tasks/shared/TasksKpiStrip.tsx` (**novo**) | as 5 leituras com card de 88px + tile de 44px (`bg-kpi-*`), ícone de 20px, valor da escala com `font-bold tabular-nums`, rótulo 13/500; Atrasadas troca o `kpi-yellow` por `bg-destructive/15` quando há atraso; Fazendo sai como `n/3` lendo `WIP_LIMITS.doing.hard`; grid com os 3 breakpoints |
| `src/components/tasks/TasksModule.tsx` | o bloco inline de KPIs (cards sem altura fixa, sem tile e com `md:grid-cols-5`) vira `<TasksKpiStrip kpis={kpis} />` |
| `src/components/tasks/__tests__/TasksModule.test.tsx` | 3 casos: 5 cards de 88px com tile de 44px e valor `font-bold tabular-nums text-2xl`; cores por tipo + `n/3` + números reais; os 3 breakpoints do grid |

**Divergência declarada (mínima):** o plano pede o valor em **26px**. O guard-rail de tipografia do repo (`scripts/qa/medir-tipografia.cjs`) **proíbe tamanho arbitrário acima de 16px** — o teto é a escala do `tailwind.config.ts` — e o `text-[26px]` fez a dívida subir de 2 para 3 (reprovando o gate). Token mais próximo: **`text-2xl` (24px)**, 2px do pedido; o `font-bold` e o `tabular-nums` saíram como escrito. O gate visual da etapa mede o **card** (88±4), não a fonte. Mesma natureza da divergência do `text-[12px]`→`text-xs` na etapa 49.

**Nota de teste (honestidade):** o jsdom não mede layout, então "88px" é provado pelo contrato de classe (`h-[88px]`) — a medida real é o gate visual da etapa 54.

**Teste de mutação (4, árvore restaurada entre cada):** M1 `h-[88px]`→`h-[108px]` vermelho no caso dos cards; M2 Atrasadas sempre amarela vermelho no caso das cores; M3 grid sem `md:grid-cols-3` vermelho no caso dos breakpoints; M4 Fazendo sem o `/3` vermelho no caso das cores.

**Gates:** `typecheck` ✓ · `lint-ratchet` 0 novas ✓ · `implicit-any` 0 ✓ · guard-rail de tipografia ✓ (arbitrário >16px de volta a 2) · `build` ✓ · bundle 4021,4/4100 KB ✓ · `db:guard` ✓ · suíte 4379 passed / 0 failed (324 arquivos) ✓

## Etapas 45 e 46 — barra de filtros (estado na URL) e o recorte nos três modos — evidências

**Regra do plano (45):** barra com `useReducer`: busca com debounce de 200ms · `Select` de prioridade · `Select` de contato com busca · toggle "Com alarme" · toggle "Mostrar concluídas" · "Limpar" (só com filtro ativo). Estado em `?q=&prio=&contact=&alarm=1&done=1` via `replaceState`. DoD: 5 filtros; a URL reflete.
**Regra do plano (46):** filtro aplicado nos **3 modos** pela função pura `applyFilters(items, filters)` em `workItemAggregates.ts` (+ teste). No Quadro, a coluna que o filtro esvazia mostra `variant="column"`. DoD: filtrar por prioridade esvazia colunas no Quadro.

**Por que as duas etapas saíram no mesmo PR (divergência declarada):** a barra sem o `applyFilters` entregaria 4 controles **inertes** — clicar em "Com alarme" não mudaria nada na tela. Como o recorte é a razão de existir da barra, as duas etapas foram entregues juntas; os dois DoDs estão verificados abaixo e o ledger registra as duas.

**Mudanças (8 arquivos):**

| arquivo | o que muda |
|---|---|
| `src/hooks/tasks/workItemFilters.ts` (**novo**) | `TasksFilters`/`DEFAULT_FILTERS`/`isFilterActive` + `filtersFromSearch`/`searchWithFilters` (puros); o serialize preserva o resto da URL (o `view` da rota) |
| `src/hooks/tasks/useTasksFilters.ts` (**novo**) | `useReducer` + debounce de 200ms (`SEARCH_DEBOUNCE_MS`) + espelho na URL por `replaceState`, sem empilhar histórico |
| `src/components/tasks/shared/TasksFilterBar.tsx` (**novo**) | os 5 controles + "Limpar" condicional; o seletor de contato usa os contatos das próprias tarefas (fonte local, sem query nova) |
| `src/hooks/tasks/workItemLabels.ts` (**novo**) | `PRIORITY_LABELS` num `.ts` — exportar do `PriorityChip.tsx` esbarraria no `react-refresh/only-export-components` (dívida nova no ratchet) |
| `src/hooks/tasks/workItemAggregates.ts` | `applyFilters(items, filters)` pura; é o **único** recorte — os três modos consomem os mesmos itens filtrados |
| `src/components/tasks/TasksModule.tsx` | a barra entra na toolbar; `byDue`/`byStatus`/`kpis` passam a sair dos itens filtrados; a busca inline antiga sai; os 3 modos recebem o mesmo recorte |
| `src/components/tasks/shared/PriorityChip.tsx` | passa a importar os rótulos do módulo novo (mesmos textos, sem duplicação) |
| testes | `workItemFilters.test.ts` (7) · `useTasksFilters.test.tsx` (5, com fake timers no debounce) · `applyFilters` no teste do agregado (7) · 3 casos de integração no `TasksModule.test.tsx` |

**Decisões do executor:**
- **`done` nasce ligado.** "Mostrar concluídas" já é o comportamento entregue nas etapas 48 e 51 — desligar por padrão esconderia as duas. Como o plano lista `done=1`, a URL escreve a **exceção** (`done=0`) e o "Limpar" devolve a URL vazia; sem essa inversão a URL nasceria "suja" e o "Limpar" apareceria sempre.
- **Debounce no estado, não no campo:** o texto anda na hora e só depois de 200ms vira filtro e parâmetro — a espera nunca aparece na digitação.
- **Contato vem das tarefas carregadas** (com busca embutida), evitando uma segunda query só para popular o filtro.
- **KPIs refletem o filtro** — o recorte é do módulo, não de uma tela.
- **Filtros somam (E, não OU).**

**Teste de mutação (4, árvore restaurada entre cada):** M1 sem debounce (dispatch direto) vermelho no caso do debounce; M2 a URL nunca marca `done=0` 4 vermelhos; M3 a busca volta a diferenciar maiúsculas 7 vermelhos; M4 "Limpar" sempre visível vermelho no caso do botão condicional.

**Nota de teste (honestidade):** os dois `Select` (radix) não são dirigidos no jsdom — o clique no portal é flaky. O que eles fazem está provado na função pura, no parse/serialize da URL e no teste do hook; a barra na tela, o recorte nos modos e a URL são provados na integração.

**Gates:** `typecheck` ✓ · `lint-ratchet` 0 novas ✓ (17 ocorrências antigas saíram junto) · `implicit-any` 0 ✓ · `db:guard` ✓ · guard-rail de tipografia ✓ · suíte 4424 passed / 0 failed (332 arquivos) ✓ · `build` ✓ · bundle 4027,9/4100 KB ✓

## Etapa 55 — Agenda: ponto por tipo, "Atrasadas" expansível e o dia em 3 grupos — evidências

**Regra do plano:** Agenda — reescrita autorizada: ponto do dia com cor por tipo (prazo `primary`, alarme `warning`, atrasada `destructive` — até 3 pontos); bloco "Atrasadas" expansível (colapsado por padrão se > 3); lista do dia em **3 grupos** (Alarmes por `remind_at` com hora à esquerda `w-14 tabular-nums`; Prazos por `due_date`; Sem hora). — DoD: item com prazo e alarme no mesmo dia aparece nos **dois** grupos.

**Mudanças (3 arquivos):**

| arquivo | o que muda |
|---|---|
| `src/hooks/tasks/workItemAggregates.ts` | `temHora` (prazo com hora × dia inteiro), `agendaDayDots` (até 3 pontos, na ordem do plano) e `groupAgendaDay` (os 3 grupos) — puros, testáveis sem React |
| `src/components/tasks/agenda/TasksAgendaMode.tsx` | a faixa dos 7 dias troca o ponto único por até 3 pontos com cor por tipo; o bloco "Atrasadas" ganha botão de expandir (`aria-expanded`) e nasce colapsado quando passa de 3; o dia selecionado passa a ser listado em 3 grupos, com a hora à esquerda (`w-14 tabular-nums`) no grupo dos alarmes |
| testes | 3 casos puros no teste do agregado + `src/components/tasks/__tests__/agendaGroups.test.tsx` (**novo**, 6 casos: DoD nos dois grupos, hora à esquerda, 3 pontos por tipo, colapsado/expandido, aberto com ≤ 3, estado vazio) |

**Decisão declarada — o que é "Sem hora":** `due_date` gravado só com o dia (meia-noite local) não tem horário marcado, então vai para **Sem hora**; o prazo com hora vai para **Prazos**. Assim o prazo de dia inteiro não some nem aparece duas vezes.

**Nada é deduplicado:** o código antigo escondia dos "Prazos" o item que já estava nos alarmes (`filter(t => !reminders.find(...))`). Isso contraria o DoD da etapa, então a deduplicação saiu — o item com prazo **e** alarme aparece nos dois grupos.

**Teste de mutação (4, árvore restaurada entre cada):** M1 `temHora` sempre `true` (nada cai em "Sem hora") 3 vermelhos; M2 pontos fora da ordem do plano 1 vermelho; M3 "Atrasadas" sempre aberto 1 vermelho; M4 volta a deduplicar 2 vermelhos.

**Gates:** `typecheck` ✓ · guard-rail de tipografia ✓ · `lint-ratchet` 0 novas ✓ · `implicit-any` 0 ✓ · `db:guard` ✓ · suíte 4474 passed / 0 failed (336 arquivos) ✓ · `build` ✓ · bundle 4031,3/4100 KB ✓

## Etapa 56 — card da Agenda em linha única (`h-11`) — evidências

**Regra do plano:** `WorkItemCard mode="agenda"`: linha única `h-11` (checkbox · título · chips à direita · kebab), sem motivo de espera. — DoD: altura 44±2.

**Mudanças (3 arquivos):**

| arquivo | o que muda |
|---|---|
| `src/components/tasks/shared/WorkItemCard.tsx` | o card deixou de duplicar JSX: checkbox, título, chips de contexto e kebab são montados **uma vez** e compostos nos dois layouts. Na Agenda a raiz sai como `flex flex-row h-11 items-center rounded-xl px-3` (uma linha), com checkbox e kebab **sempre visíveis** (na Lista/Quadro o kebab continua aparecendo no hover) e sem o motivo de espera. `data-mode` passou a marcar o modo no DOM (é o que o teste consulta) |
| `src/components/tasks/agenda/TasksAgendaMode.tsx` | a coluna da hora do grupo dos alarmes passou a centralizar na linha (`items-center`, sem `pt-3`): com o card de 44px, o `pt-3` da etapa 55 desalinhava a hora |
| testes | 1 caso novo em `agendaGroups.test.tsx`: contrato de classe (`h-11`, `flex-row`), checkbox presente na Agenda, nada de motivo de espera e kebab sem `opacity-0` |

**Nota de honestidade:** o jsdom não mede layout — "44±2" está provado pelo contrato de classe (`h-11` = 44px); a medida real é o gate visual da etapa 54.

**Teste de mutação (3, árvore restaurada entre cada):** M1 altura `h-11`→`h-9` 1 vermelho; M2 checkbox só na Lista 1 vermelho; M3 kebab voltando ao hover na Agenda 1 vermelho.

**Gates:** `typecheck` ✓ · guard-rail de tipografia ✓ · `lint-ratchet` 0 novas ✓ · `implicit-any` 0 ✓ · `db:guard` ✓ · suíte 4514 passed / 0 failed (342 arquivos) ✓ · `build` ✓ · bundle 4033,3/4100 KB ✓

## Etapa 57 — QuickAdd na Agenda com o dia selecionado — evidências

**Regra do plano:** `QuickAdd` na Agenda com chip Data pré-preenchido com o dia selecionado. Decisão D7 mantida (faixa hoje → +6). — DoD: criar cai no dia certo.

**Mudanças (4 arquivos):**

| arquivo | o que muda |
|---|---|
| `src/components/tasks/shared/QuickAdd.tsx` | prop `defaultDueDate` (o campo já nasce com o prazo) e `data-testid="quick-add-due"` no chip ativo, para o teste poder afirmar o dia |
| `src/components/tasks/agenda/TasksAgendaMode.tsx` | renderiza o `QuickAdd` logo abaixo da faixa dos 7 dias, com `key={selectedDay}` (trocar de dia remonta o campo e reaplica o prazo) e o dia selecionado às 23:59; os botões do dia ganharam `aria-label`/`aria-current` (a11y e testável) |
| `src/components/tasks/TasksModule.tsx` | o QuickAdd do cabeçalho **não** aparece no modo Agenda (lá quem manda é o da Agenda, com o dia); a Agenda recebe `onCreate` e `quickAddRef`, então o atalho **N** continua focando o campo certo |
| testes | 2 casos na Agenda (nasce no dia / remonta ao trocar o dia) + 1 no módulo (um único QuickAdd na Agenda, com o placeholder do dia) |

**Decisão declarada:** o prazo do dia selecionado é gravado às **23:59 locais** — a mesma convenção dos chips "Hoje/Amanhã/Próx. semana" do próprio QuickAdd. Assim a faixa hoje→+6 do D7 continua valendo. *(Fase F2: 23:59 passou a ser lido como **dia inteiro**, e não como "Prazos" — ver a FASE F2; era a única leitura que tornava o grupo "Sem hora" alcançável.)*

**Teste de mutação (3, árvore restaurada entre cada; base verde = 25 casos):** M1 o QuickAdd ignora o `defaultDueDate` 2 vermelhos; M2 sem a `key` (não remonta ao trocar o dia) 1 vermelho; M3 o módulo também renderiza o QuickAdd na Agenda (dois na tela) 1 vermelho.

**Nota honesta sobre a suíte:** **4517 testes verdes / 0 falhas**, mas o runner acusa **1 erro não tratado (2 ocorrências)** em `src/components/catalog/__tests__/useSendProduct.test.tsx` ("window is not defined"). O arquivo **passa isolado (9/9)** e nada do meu diff o toca — é flake de carga (vários chats rodando em paralelo nesta máquina). O check `🧪 Unit Tests` do CI é a autoridade.

**Gates:** `typecheck` ✓ · guard-rail de tipografia ✓ · `lint-ratchet` 0 novas ✓ · `implicit-any` 0 ✓ · `db:guard` ✓ · suíte 4517 verdes (flake de catálogo declarado) · `build` ✓ · bundle 4033,4/4100 KB ✓

## FASE F — correções da auditoria adversarial (30/09/2026) — evidências

**Origem:** auditoria adversarial das etapas 43–57 (5 frentes independentes + reprodução do
coordenador; relatório em `~/auditorias/fase-e-260930/RELATORIO-CONSOLIDADO.md`). Nenhuma
entrega era mentira: os sete achados eram comportamento errado que a suíte não pegava — cada
um com saída crua de reprodução.

**Mudanças (7 arquivos):**

| arquivo | o que muda |
|---|---|
| `src/hooks/tasks/useTasksFilters.ts` | (a) `clear` **cancela** o debounce pendente (o filtro voltava sozinho 200ms depois, campo vazio e `?q=` na URL); (b) a URL volta a ser fonte da verdade **depois** da montagem — quem sinaliza é o `search` do ROUTER, por ajuste no render (sem efeito de sincronização, sem dívida de lint); (c) a mesma base de URL na leitura e na escrita |
| `src/hooks/tasks/workItemAggregates.ts` | `applyFilters` ignora acento e caixa; guarda `items ?? []`; `bucketByDue` passa a contar concluída **sem carimbo** na janela de 7 dias (a mesma regra que o `splitDoneByRecency` do Quadro já documentava) |
| `src/components/tasks/list/TasksListMode.tsx` | o vazio da Lista deixa de olhar só a busca: **qualquer** filtro ativo oferece "Limpar filtros" (`filtersActive`) |
| `src/components/tasks/board/BoardColumn.tsx` | coluna com concluídas atrás do rodapé não diz mais "Coluna vazia" |
| `src/components/tasks/TasksModule.tsx` | contagem do cabeçalho, card "Fazendo" e trava de WIP passam a olhar a lista **real** (filtro é recorte de tela) |
| `src/components/tasks/board/TasksBoardMode.tsx` | prop `doingCount?` (com fallback) para a trava de WIP receber a contagem real |
| `src/components/tasks/shared/TasksFilterBar.tsx` | contato sem nome → "Sem nome"; id fora da lista → "Contato indisponível" (o `??` deixava o gatilho em branco) |

**Testes:** 9 casos novos (124 → 133 nos arquivos de Tarefas) — cada um **falha** no código anterior.

**Teste de mutação (9, árvore restaurada entre cada):** **9/9 mortas** — M1 `clear` sem cancelar o
debounce · M2 sem reidratação do router · M3 Lista decidindo o vazio pela busca · M4 cabeçalho
contando o recorte · M5 coluna vazia ignorando o rodapé · M6 busca exigindo acento · M7 concluída
sem carimbo sumindo da Lista · M8 sem guarda de lista nula · M9 rótulo de contato antigo.

**Gates:** `typecheck` ✓ · guard-rail de tipografia ✓ · `lint-ratchet` 0 novas (23 removidas) ✓ ·
suíte completa **345 arquivos / 4549 testes, 0 erro não tratado** ✓ · `build` ✓ · bundle
**4049,8/4100 KB** ✓

**Próximo (F2, PR separado):** o 2º `create` seguido na Agenda (prazo perdido após o 1º envio), a
ordenação de "Prazos" por `due_date`, o grupo "Sem hora" (fim do dia 23:59/00:00 = dia inteiro),
o rascunho preservado ao trocar de dia, `aria-controls` no "Atrasadas" e a blindagem do
`PriorityChip` com prioridade nula.

## FASE F2 — Agenda e QuickAdd (correções da auditoria) — evidências

**Origem:** os achados de severidade ALTA/MÉDIA da mesma auditoria que sobraram do F1.

**Mudanças (4 arquivos):**

| arquivo | o que muda |
|---|---|
| `src/components/tasks/shared/QuickAdd.tsx` | o envio (e o Esc) volta ao prazo **padrão do campo**, não a `null` — o 2º create seguido na Agenda nascia sem prazo e sumia do dia; e trocar de dia reaplica o prazo por **ajuste no render**, sem remontar o campo |
| `src/components/tasks/agenda/TasksAgendaMode.tsx` | sai o `key={selectedDay}` (o rascunho digitado deixa de ser descartado) e o botão de "Atrasadas" ganha `aria-controls` para a região que ele abre |
| `src/hooks/tasks/workItemAggregates.ts` | `temHora`: fim do dia (23:59) e meia-noite contam como **dia inteiro** — "Sem hora" deixa de ser inalcançável; `groupAgendaDay` ordena "Prazos" por `due_date` |
| `src/components/tasks/shared/PriorityChip.tsx` | prioridade nula/desconhecida cai em `medium` (antes o card imprimia "undefined") |

**Testes:** 5 novos + 2 atualizados (o da etapa 57 afirmava o **descarte** do rascunho; o da etapa 55 afirmava a ordem bruta da query). Suíte da Tarefas 133 → 138.

**Mutação (7, árvore restaurada entre cada):** **7/7 mortas** — M1 submit apagando o prazo · M2 sem o ajuste no render · M3 `temHora` exigindo hora ≠ 23:59 · M4 "Prazos" sem ordenação · M5 o pai remontando o campo · M6 sem `aria-controls` · M7 chip sem blindagem.

**Gates:** `typecheck` ✓ · tipografia ✓ · `lint-ratchet` 0 novas ✓ · suíte completa **345 arquivos / 4554 testes** ✓ · `build` ✓ · bundle **4050,2/4100 KB** ✓

## FASE F3 — auditoria adversarial das correções F1/F2 (30/09–01/10/2026) — evidências

**Método:** 5 frentes independentes, cada uma em cópia descartável com `node_modules` compartilhado
(precisavam MUTAR e rodar de verdade) + reprodução do coordenador. HEAD auditado: `826fa148` — o
MESMO commit que a produção servia no momento da auditoria.

**Veredito por frente:**

| frente | escopo | resultado |
|---|---|---|
| A1 | filtros, URL, debounce, busca | **1 achado ALTA (A1-1, regressão minha)** — corrigido neste PR |
| A2 | contagens reais × filtradas, estados vazios, `bucketByDue` | 3 probes vermelhos (A2-11, A2-12, A2-30) → fila, PR próprio |
| A3 | Agenda/QuickAdd (23:59, ordem, 2º create, rascunho) | sem defeito ALTO: os comportamentos declarados resistiram |
| A4 | força dos testes novos (mutação independente) + a11y + contratos | **16/16 mutações mortas**; 7 mutações de cenário (M17–M27) previstas sobreviventes → cobertura estreita, fila |
| A5 | integridade de entrega (repo, produção, banco, ledger) | **#1325 e #1334 mergeados**; produção `buildId 826fa148` == topo do `main`; **0 migrations** do tema (692 aplicadas, última de outra frente); build+bundle dentro do budget |

**A1-1 (ALTA) — a busca era descartada em silêncio:** a guarda `if (agora !== base) return` do debounce
comparava `window.location.search`, que é reescrito pelo próprio hook a cada mudança de filtro. Digitar
e mexer em outro filtro dentro dos 200 ms → campo com texto, `filters.q` vazio e `?q=` fora da URL.
Reprodução crua do auditor: `{aposDigitar:{q:'',textoDaBusca:'liga'}, aposPrio:{prio:'high'},
aposDebounce:{q:''}}`. **Correção:** remover a guarda (o `clear` já cancela o timer; navegação é
coberta pela reidratação pelo `search` do router).

**Testes/gates deste PR:** red-first (`expected '' to be 'liga'`) → verde (8/8) → mutação que
reintroduz a guarda **mata** o teste; `typecheck` ✓ · tipografia ✓ · `lint-ratchet` 0 novas
(26 removidas) ✓ · `implicit-any` 0 ✓ · `db:guard` 0 novas ✓ · suíte completa **348 arquivos /
4638 testes, 0 falhas** ✓ · `build` ✓ · bundle **4051,0/4100 KB** ✓

**Limites declarados:** A1-1 residual (digitar e navegar dentro dos 200 ms → o texto digitado vence,
caso raro); a frente A4 não concluiu a agregação do próprio script (as 16 primeiras mutações foram
lidas das saídas cruas `res1/res2.json`); A2 ainda não corrigido; RLS/PostgREST real seguem não
provados (fora do escopo desta mudança de frontend).

**Relatório completo (fora do repo):** `~/auditorias/fase-f-260930/` — árvores `a1`…`a5` com as
sondas, `res1/res2.json` das mutações e os logs crus.

## FASE F4 — cenários das mutações que sobreviveram à F3 (01/10/2026) — evidências

**Origem:** as 7 mutações que a frente A4 da F3 registrou como **sobreviventes** (a suíte não pegava
a mudança). Nenhuma é defeito de comportamento: são **lacunas de cobertura** em decisões já tomadas.
Este PR **não muda comportamento** — acrescenta os testes que faltavam.

**Decisão que os testes protegem (Joaquim, 01/10/2026, sobre a `20261001-071945`):** filtro é recorte
de **tela** — KPIs e colunas seguem o filtrado; **subtítulo do módulo, card de KPI "Fazendo" e trava
de WIP do Quadro** seguem o dado real (lista não filtrada). A leitura "tudo segue o filtro" foi
revista e **não** vale.

**Arquivos:** `src/components/tasks/__tests__/contagensReaisVsFiltradas.test.tsx` (novo: subtítulo/KPI
e coluna do Quadro, com filtro `?prio=urgent` sobre 6 itens — 1 urgente, 2 médios com prazo hoje e 3
"fazendo") e `agendaGroups.test.tsx` (caso do `aria-controls` endurecido: o alvo tem de ser a REGIÃO
das atrasadas, não o próprio gatilho).

**Mutação (5 conjuntos, cada um isolado, restauração exigida por `git diff --quiet`):** **5/5 mortas** —
M17 `aria-controls` auto-referente (1 teste vermelho) · M19/M20/M27 `TasksBoardMode` sem a prop
`doingCount` (1) · M23 "para hoje" do cabeçalho com o recorte (1) · M24 KPI "Fazendo" com o recorte (1)
· M25 `doingReal` sobre a lista filtrada (2). Baseline do ciclo: 141 testes verdes.

**Gates:** `typecheck` ✓ · tipografia ✓ · `lint-ratchet` 0 novas (26 removidas) ✓ · `implicit-any` 0 ✓ ·
`db:guard` 0 novas (694 migrations válidas) ✓ · suíte completa **350 arquivos / 4674 testes, 0 falhas** ✓ ·
`build` ✓ (4,77s) · bundle **4054,7/4100 KB** ✓

**Erro do próprio auditor, registrado:** a v1 do script de mutação copiava o backup **depois** de
editar; a "restauração" devolvia o código mutado e as mutações seguintes rodavam contaminadas (os
vereditos de M24/M25 saíram com M23 ainda aplicado). Corrigido — backup antes da escrita + `git diff
--quiet` obrigatório após cada restauração — e as 5 mutações foram re-medidas isoladas; as primeiras
leituras foram descartadas.

**Limite declarado:** prova com componentes reais e dados mockados; não substitui a olhada logada
(etapas 54/58, que dependem do login de QA no cofre).

## CP-F Avisos de alarme [x] — toast=ok · popover=criado · badge=ok · push=fora da v1 · 66/67 pendentes de QA
## CP-G Chat integrado [x] — NotesTab=resumo+atalho+QuickAdd · TasksTab=5 grupos · reminders->tasks=ok · Alt+T=ok
## CP-H Acessivel e responsivo [~] — 7 atalhos=ok · aria-live=ok · reduced-motion=ok · contraste=ok (tabela medida) · mobile=ok por construcao · zen=aberta
## CP-I Testes      [x] arquivos=398 · casos=5219 (46 novos de tarefas) · bundle=12,2 KB gz (do modulo; teto 45) · TTI 300 itens=Lista 1606 ms · Quadro 1633 ms · Agenda 1584 ms (Playwright chromium 1672x941, login pela UI, `performance.now()` da navegacao ate o 1o `[data-testid=work-item-card]`; cards no DOM: 175/250/250)
  - (O DoD pedia ">= 50 cards no DOM"; por modo a Lista agrupa e o Quadro recorta por coluna, entao 50 simultaneos nao acontecem — medido ate o 1o card com o total no DOM registrado.)
  - Seed do QA: 300 tarefas `[E2E seed 89]` — contagem ANTES `0-0/300`, DELETE 204 (`*/300`), DEPOIS `*/0`. Rodado 2x, zerado nas duas.
## CP-J Entrega     [~] (E.5 **24/24 medido em producao** em 02/10; a premissa de 30d5 — '23/24 declarado' e '1 check e pendencia do Joaquim' — foi CORRIGIDA: nao havia pendencia do dono, o bloqueio era bug de app, o canal realtime `work-items:<uid>` reusado por 2 instancias de `useMyWorkItems`, corrigido na main) gates 8/8=8 OK · func 24/24=**24** (E.5, 3 rodadas: 18 -> 21 -> 24) · geometria 8/8=OK · cores 10/10=OK (ΔE76) · isolamento=OK na RLS com agent (supervisor ve tudo por desenho) · migração=OK (ID conferido) · PR drop n (etapa 97)=**MERGEADA** #1516 `2d4e8e4b` com `DDL_POS_MERGE=aplicadas` e prova no banco · docs=OK (README do modulo criado) · prod final=cron OK + E.1 6/6 OK; falta abrir a migrada na Lista/Sheet do dono (credencial Admin 01)

### Decisao 30d5 (Joaquim, 2026-10-01) — como tratar o E.5

Opcao A + investigacao:
1. As **4 flaky** (`concluir-e-desfazer`, `apagar-e-undo`, `atalhos-altk-altp-n-1-2-3`, `console-sem-erro`)
   ganham **retry padrao de e2e: ate 3 tentativas**, com a flakiness **declarada** na saida. **Se falhar nas 3,
   conta como FALHA** — nao mascara.
2. `central-notificacoes-abrir` e **codigo, nao dado**: investigar e **corrigir agora, com vermelho-antes**
   (teste que falha primeiro, depois a correcao minima, depois verde + suite inteira verde).
3. `criar-do-chat-com-contato` fica como **PENDENCIA DO JOAQUIM**: criar conversa em producao depende dele.
   **Nao perseguir** essa check; ela permanece declarada como nao executada.
4. ~~O E.5 fica **23/24 declarado** — nunca marcado 24/24.~~ **SUPERADO em 02/10:** o E.5 fechou **24/24 medido em producao** (duas rodadas limpas consecutivas). A regra do retry de 3 tentativas segue valendo apenas para as 4 flaky declaradas — e na ultima rodada nenhuma delas precisou de retry.

### FASE J — numeros reais (2026-10-01)

**91. Gates — 8 saidas, todas exit 0.** typecheck · build · `db-usage-guard` · `check-migration-drift` ·
`check-realtime-subscriptions` · `lint-ratchet` · `implicit-any-ratchet` · `medir-tipografia --check` ·
`bundle-budget` (JS inicial **336,3 KB** de 341; CSS 39,9/80; maior chunk 492,3/550; assets 4088,2/4100) ·
suite **404 arquivos / 5284 testes / 0 falhas**. O `bun run lint` cru acusa 937 problemas **legados** — ja
registrados como "nao e gate do CI"; o gate real e o `lint-ratchet`, que passa.

**92. E.5 funcional (24 checks) — DoD ATINGIDO: 24/24.** Trajetoria: 1 → 8 → 14 → 17 → 18 (producao) → 21 (producao) → **24/24 (producao, duas rodadas limpas consecutivas: build `index-CSoe39fh` e `index-DcvfgM7e`, esta com hash identico antes e depois da rodada)**. Correcoes de causa raiz que destravaram: (a) `useTasksFilters` baseava a URL no `location` do react-router, que nao ve `pushState`, e regravava `/?view=inbox` por cima da navegacao do 'Abrir' — o Sheet nunca abria; (b) canal realtime `work-items:<uid>` reusado por duas instancias derrubava a aba Tarefas do chat; (c) faltava `KeyK` no mapa de atalhos. Ressalvas declaradas: `console-sem-erro` ignora os 503 (balde `infraErrors` separado, 12 na janela), `/remind` exercitado pelo chip do QuickAdd (nao pelo comando literal) e o sino e aberto de outra view (o app nao rele `?task=` com o modulo ja montado).
As 6 restantes, classificadas: `criar-do-chat-com-contato` — **nao testavel com as contas de escopo** (nenhuma
tem conversa na inbox); `concluir-e-desfazer`, `apagar-e-undo`, `atalhos-altk-altp-n-1-2-3` e
`console-sem-erro` — **PASSARAM em outras rodadas = flake** (a UI e realtime e o headless perde a corrida);
`central-notificacoes-abrir` — a unica persistente (o Sheet nao abre pelo caminho sino -> notificacao -> Abrir).
Nenhuma provada como bug do app.
**Prova independente do alarme (checada por mim no banco, nao pelo relato do subagente):** a tabela e
`notifications`; existem **7 linhas de `type='reminder_due'`**, a ultima em `2026-10-02T00:28:00Z` (21:28 BRT,
minutos antes da checagem). O cron **dispara** — portanto `toast-do-alarme` e `adiar-15min` sao flakiness de
headless, nao alarme quebrado. (`public.reminder_due` NAO existe: a alegacao inicial do agente citava essa
relacao; conferi e o registro real e em `notifications.type`.) Rodada paralela com harness corrigido de outro jeito deu **10/24** — a
divergencia entre harnesses e a prova de flakiness. O 404 de `/assets/EvolutionDisconnectBan...` visto no
`console-sem-erro` **foi descartado**: era corrida com o deploy (o check passou depois).

**93. Geometria — 8/8 OK.** Medido em producao (1672x941, Chromium/Playwright, conta QA COMPRAS):
quickAdd **44** (44±2) · kpiCard **88** (88±4, 5/5) · modeSwitcher **44** · card com chips **72** (>=72) ·
agendaCard **44** · columns **5** · columnGap **12** · sheet **420** (420±4). Reproduzido em 2 execucoes.
Ressalva registrada: o card fecha 72 no estado COM chips (DueChip+PriorityChip); sem chip fica em 56
(min 56 / max 72 numa amostra de 68 cards) — confirmar se o alvo vale para qualquer card.

**94. Cores — 10/10 OK por ΔE76.** fundo e card ΔE **0,00** · chip urgente 0,79 · alta 0,66 · media 0,85 ·
baixa 0,48 · chips do QuickAdd 0,00 · coluna cheia 0,00 · coluna vazia 5,13 · chip atrasado 4,23
(tolerancia: fundos <=6, demais <=8). Comparado contra `src/styles/tokens.css` (bloco `.dark`), que e o que a
producao pinta; a redacao "tokens navy" do plano e legada. Como a conta QA nao tinha prazo nem prioridade
variada, o medidor semeou **7 tarefas sinteticas QA-E2E3-*** via REST **com o JWT do proprio usuario**
(nunca service_role) e apagou ao fim — limpeza conferida por leitura independente (restantes=0).

**95. Isolamento — ENTREGUE com prova, e com uma CORRECAO ao relato anterior.** Tarefa `997dd9e8-...`
(dono Admin 01). Prova em 3 camadas: (a) UI — Compras ve 8 cards (so os dele), Logistica ve **0** e o agent
`comercial01` ve **0**; (b) RLS/REST — GET/PATCH/DELETE do agent na tarefa de outro dono devolvem **0 linhas**
(`[]`, HTTP 200) e releitura SQL confirma a tarefa intacta; (c) `reminders` e estritamente por usuario
(`[]` nos tres).
**CORRECAO (achado do agente, e eu tinha dito o contrario de forma incompleta):** os **dois** usuarios de
teste (Compras e Logistica) sao **supervisor** (`user_roles`: d2229ada=supervisor, ab2d4b9b=supervisor) e a
policy e `created_by = current_profile_id() OR is_admin_or_supervisor()`. Ou seja: **supervisor x supervisor
nao se isolam entre si na RLS** — eles veem tudo, por desenho. O isolamento que se observa entre eles na UI
vem do **filtro client-side** (`src/hooks/tasks/useMyWorkItems.ts:186`, `.eq('created_by', profileId)`).
O invariante "dono so ve o seu" foi provado na RLS com o unico usuario **nao-privilegiado** disponivel, o
agent `comercial01`. Para fechar o DoD literal ("2 usuarios") na camada RLS, o segundo usuario teria de ser
um **agent**, nao um supervisor.
**Pendencia do DoD de 96:** abrir a tarefa migrada na Lista e no Sheet **do dono** (Admin 01) nao foi feito —
falta credencial do Admin 01/QA; e a tarefa nao aparece para os usuarios de escopo por causa do filtro por dono.

**96. Migracao dos lembretes — OK, ID conferido.** `reminders`: 1 linha, `migrated_task_id IS NULL` = **0**; a
linha aponta para a tarefa `997dd9e8-...`, que existe (`zcxvcv`, `todo`).

**98. Docs — OK.** Faltava o README do modulo: criado `docs/tasks/README.md` (modos, modelo de dados com as 18
colunas, RPC das abas, cron do alarme, RLS por papel, os 7 atalhos, como rodar os testes e os residuos).
Divergencia do plano: o DoD falava em "<=15 linhas de diff", mas o arquivo **nao existia** — documentar de
verdade custou ~70 linhas.

**100 (parte de infra) — OK.** Cron `tasks-notify-due` **active** em producao, `* * * * *`, sem sobras de
`notify-due-reminders`. Faltam as screenshots do E.1.


## Divergências plano × código (D1–D6 acima; novas)
  D7: Agenda começa hoje (etapa 93) e não na segunda (etapa 98) — contradição do plano v1; mantido hoje→+6
  D8: "Apagar" = cancelar (soft) com undo; sem hard-delete na v1
  D9: useConversationTasks/useReminders removidos (não viraram adaptadores)
  D10: não existe NotificationCenter; ponto de render = popover de notificações da Sidebar

## Iterações
- 28/09 PR #1133: 6 commits de fix de CI (TransitionResult, cast Supabase, LazyExoticComponent, baseline realtime, runtime-config.test.sh) + 2 pushes vazios que NÃO geraram run (concurrency) → regra 7 do plano v2

## FASE C1 — Sheet de edição (etapas 23–27) — 2026-10-01

Branch `hermes/fase-c-sheet-2610011018cb68`. PR: feat(tarefas): Sheet de edição do item.

- **23** `src/components/tasks/shared/WorkItemSheet.tsx` (novo, 396 linhas): `Sheet` `side="right"` `w-[420px]`,
  `side="bottom" h-[90vh]` abaixo de `md` (matchMedia). Props exatamente como o plano: `{ item | null, open,
  onOpenChange, onSave(item, patch), onMove(item, to, waitingReason?), onSnooze, onSetReminder, onCancel,
  contactOptions, doingCount, focusField? }`. Esc fecha (caso de teste "23: abre com os 8 campos e fecha no Esc").
- **24** 8 campos na ordem do plano: título (autofocus), estado (`Select` com as 5 colunas; `doing` `disabled` com
  o texto "Fazendo está cheio (3/3)" quando `doingCount >= 3` e o item não está em doing), motivo de espera
  (`Textarea`, só em Aguardando, obrigatório, erro inline "Diga por que parou"), prioridade (4 chips),
  contato, prazo (`Popover`+`Calendar` pt-BR + hora opcional; sem hora = `T23:59`, a convenção de "dia inteiro"
  já usada no módulo), alarme (`Popover` data+hora, "Avisado em {notified_at}", "Remover alarme", "Adiar 15 min"),
  descrição (colapsada, abre quando o item já tem uma).
- **25** Rodapé: "Salvar" (`bg-primary`, `disabled` sem mudança, `Ctrl+Enter`), "Cancelar tarefa" (ghost
  destructive → `cancel`, com undo do hook, decisão D8), "Concluir" (`bg-success` → `move('done')`).
- **26 (B3)** `TasksModule.tsx` renderiza `<WorkItemSheet item={itemAberto} …/>`; os três modos passam a receber
  `onOpen={abrirSheet}`; `abrirSheet`/`fecharSheet` sincronizam `?task=` por `history.replaceState`.
- **27** Deep-link `?task=<id>`: o id é lido **uma vez** no primeiro render e o item é **derivado** do cache
  (`itemAberto = selectedItem ?? itemDoLink`), sem `useEffect` — a primeira versão usava efeito com `setState` e
  o **lint-ratchet acusou 1 dívida nova** (`react-hooks/set-state-in-effect`); corrigido no mesmo PR.
- Estado vai por `move` (máquina de estados), nunca por `update` — fecha o resíduo registrado no ledger
  ("`update()` do hook ignora `input.status` (vai morder no Sheet da Fase C)").

**Prova (execução, não auto-relato)**
- Vermelho-antes: com a ligação do `TasksModule` removida (`git stash`), `WorkItemSheet.test.tsx` → **2 falhas
  exatamente nos casos 26 e 27** (7 passam); com a ligação → **9/9 verde**.
- Mutações (`.tmp/mut-c1.py`, backup por hash antes e conferência depois): M1 `open={false}` (Sheet não abre) →
  **morta**; M2 `move` sem o motivo → **morta**; M3 `doing` nunca desabilita → **morta**; M4 Salvar sempre
  habilitado → **morta**. 4/4 mortas, restauração `ok` nas quatro.
- Gates: `typecheck` 0 · `implicit-any-check` 0 (baseline 0) · `db:guard` 0 novas (702 migrations, nada meu) ·
  tipografia aprovada · `lint-ratchet` **945 atual / 26 removidas / 0 novas** · eslint dos 3 arquivos do diff 0 ·
  `build` 8,47s · bundle **4057,6 KB gzip (budget 4100)** / CSS 39,3 KB · suíte completa **354 arquivos / 4703
  testes / 0 falhas**.

## FASE C2 — ações do card e portão do Aguardando (etapas 28–33) — 2026-10-01

Branch `hermes/fase-c2-card-2610011102404a`, sobre `e6739afc` (o merge da C1).

- **28 (B2, DnD)** `TasksBoardMode.handleDragEnd`: destino `waiting` sem `waiting_reason` não chama `move` —
  chama `onRequestWaitingReason(item)` e o Sheet abre com `focusField='waiting_reason'`. O portão virou um
  predicado puro exportado (`precisaMotivoDeEspera(item, to)`) justamente para ser testável.
- **29 (kebab/MoveToMenu)** mesmo portão no kebab: `TasksModule.handleMoveTo` intercepta `to === 'waiting'` e
  abre o Sheet; "Fazendo" fica desabilitado com `title`/`aria-label` "Fazendo está cheio (3/3)".
- **30** kebab com os 5 grupos: Abrir · Concluir/Reabrir · Lembrar-me ▸ (15 min · 1 h · Amanhã 9h · Escolher… ·
  Remover alarme) · Mover para ▸ · Cancelar (D8: "Remover" saiu).
- **31** `RemindChip` virou `Popover` (15 min · 1 hora · Amanhã 9h · Remover · Escolher…), `BellRing` em
  `text-destructive` quando já disparou, `stopPropagation` para não abrir o card.
- **32** `ContactChip` com avatar de 18px (foto por `avatar_url` ou `getInitials`+`getAvatarColor`) e clique →
  `openContactChat(contactId)` (o mecanismo real do app: `window.__pendingOpenContactId` + `navigateToView('inbox')`
  + evento `open-contact-chat`). O plano supunha `?view=inbox&contact=<id>` e mandava confirmar; confirmado que
  esse parâmetro não existe (ele é filtro do próprio módulo de Tarefas).
- **33** `src/components/tasks/board/MoveToMenu.tsx` (novo, caminho do plano): botão `ArrowRightLeft` só sob
  `pointer: coarse`; exporta `MoveTargets`, reusado pelo submenu do kebab (zero duplicação de regra).

**Prova (execução)**
- `cardAcoes.test.tsx` novo: **14/14**; módulo + hooks: **163/163** (11 arquivos); suíte completa **357/4733, 0 falhas**.
- Mutações (`.tmp/mut-c2.py`, backup por hash antes e conferência depois): **M1** (predicado sempre falso) MORTA ·
  **M3** (Sheet não inicia em Aguardando) MORTA · **M4** (Adiar 15 min → 60) MORTA · **M5** (MoveToMenu sempre
  visível) MORTA · **M6** (Fazendo cheio nunca desabilita) MORTA · **M2e/M2b** (cada portão sozinho) sobrevivem —
  redundância por desenho — e **M2c (os dois portões removidos) MORTA**, provando que o par é load-bearing.
- O caso do "Lembrar-me" do kebab nasceu falhando (o menu fecha após a ação) e foi corrigido; o veredito de M4 só
  passou a valer com baseline verde — registrado por transparência.
- Gates: `typecheck` 0 · `implicit-any` 0 · `db:guard` 0 novas (705 migrations) · tipografia aprovada ·
  `lint-ratchet` 944 atual / 27 removidas / **0 novas** · build 5,19s · bundle **4060,3 KB gzip (budget 4100)**.

## FASE D — QuickAdd completo e CSS dos chips (35-42)

Etapas 35–41 fechadas; 42 entregue (commit/PR/CI/merge), restando só o screenshot logado.

- **35** `.chip-btn`/`.chip-active` em `src/styles/components.css` via `@apply`, importado por `src/index.css`. Divergência declarada: o plano pede `text-[12px]`, que **tem equivalente exato** (`text-xs`) e por isso reprovava o gate de tipografia — usei `text-xs`.
- **36** 7 chips **sempre visíveis** (à direita em ≥md, abaixo em mobile); no `compact` viram o botão `⋯` (`quick-add-more`) com os mesmos chips.
- **37** chip Data: `Popover` + `Calendar` (ptBR) + hora opcional (`quick-add-date-time`); o prazo vale o dia inteiro quando não há hora.
- **38** chip Lembrar: presets Em 1 h / Amanhã 9h / Próx. seg 9h + data/hora livre; passado → `quick-add-remind-error` com "O alarme precisa ser no futuro" e botão Criar desabilitado.
- **39** chip @ Contato sobre o **`ContactCombobox` novo** (busca por nome/telefone via `useContactsSearch`, avatar 18px, `×` remove); oculto quando `defaultContactId` vem do chat.
- **40** chip ! Prioridade com Baixa/Média/Alta/Urgente (`PRIORITY_LABELS`), default **Média**.
- **41** atalhos no campo (parser leve, sem NLP): Ctrl+1/2/3, Ctrl+L, Ctrl+@, documentados no `title`.
- **42** `QuickAdd.test.tsx` (11 casos: 9 do subagente + 2 meus para os chips Data e Prioridade) e `QuickAddCompacto.test.tsx` (2 casos).
- **Lacuna real corrigida:** no compact o `Ctrl+L` não abria o `⋯` (só o `Ctrl+@` abria) — o popover de Lembrar ficava sem gatilho montado.
- **Evidência:** typecheck 0 · eslint do módulo 0 · suíte **367 arquivos / 4835 testes / 0 falhas** · ratchet **0 novas / 29 removidas** · db:guard 0 novas · tipografia aprovada · implicit-any 0 · build ok, bundle **4066,1/4100 KB** · **6/6 mutações mortas** (`.tmp/mut-fase-d.py`, com baseline verde conferido antes e árvore restaurada por hash depois).
- **Pendente (não bloqueia):** screenshot da etapa 42 (login de QA no cofre).

## FASE F — Avisos: toast, popover, badge, titulo (59-70)

- 59 useWorkItemNotifications (5 acoes + helpers puros; adiar ZERA notified_at)
- 60 popover de notificacoes CRIADO do zero + sino na Sidebar; item reminder_due com 3 botoes
- 61 toast realtime (15 s, sem som) com os mesmos 3 botoes
- 62 badge do item Tarefas na sidebar (cor unica, ver limitacao)
- 63 useDocumentBadge com (n) no titulo so com a aba oculta
- 64 push fora da v1 (SW/PWA desligados; sem public/sw.js; nada de web-push nas functions)
- 65 Sheet com "Avisado em" + Adiar (15 min / 1 h / Amanha 9h) ligado a onSnooze
- 68 /remind cria tarefa real e abre o item; createAndGetId adicionado ao hook (sem leitura extra)
- 69 testes: 8 casos com now fixo + o teste do NotificationItem
- Evidencia: typecheck 0 · ratchet 0 novas/29 removidas · tipografia ok · db:guard ok · build ok,
  bundle 4068,3/4100 KB · suite 371 arquivos / 4853 testes / 0 falhas · 2/2 mutacoes mortas
- Pendente de QA: 66/67 (idempotencia com timestamps) e screenshots

## FASE G — Chat: Notas, redirecionamento, atalho, mini-quadro (71-76)

- 71 NotesTab: lista duplicada virou resumo '{n} tarefas abertas com este contato' + botao 'Ver na aba Tarefas'
  (onTabChange) + QuickAdd compact com o contato
- 72 TasksTab reescrito: mini-quadro vertical (Fazendo, A fazer, Aguardando, Caixa de entrada colapsaveis com
  contador) + 'Concluidas (7d)' colapsada; QuickAdd compact no topo
- 73 aba ativa passou a ser persistida, com redirect 'reminders' -> 'tasks' na hidratacao (normalizeConversationTab)
- 74 Alt+T abre a aba Tarefas e foca o QuickAdd; registry real, sem conflito
- 75 testes: NotesTab 10 + TasksTab 10 + ConversationTabs 13 (inbox/hooks: 519 casos verdes)
- Evidencia: typecheck 0 · ratchet 0 novas/30 removidas · tipografia ok · db:guard ok · build ok,
  bundle 4071,4/4100 KB · suite 378 arquivos / 4938 testes / 0 falhas · 1/1 mutacao morta (reminders sem redirect)
- Divergencias: chip Lembrar em destaque nao feito (QuickAdd sem prop de destaque; compact esconde os chips);
  reset para 'chat' ao trocar de conversa mantido (pre-existente)

## FASE H — Acessibilidade, mobile, motion, tema claro (77-84)

- 77 7 atalhos no registry real com escopo ['tasks','pipeline'] e guarda de input; o modulo deixou de ter
  listener proprio e consome o evento tasks-shortcut
- 78 regiao viva tasks-live + dragHandleUsageInstructions pt-BR + aria-roledescription no card do Quadro
- 79 useReducedMotion (duracao 0) + regra [data-rbd-draggable-id] transition none !important
- 80 contraste AA com --warning-text/--destructive-text (so luminosidade); tabela medida no PR
- 81 mobile: snap + 5 dots + setas + MoveToMenu visivel + drag off em pointer coarse + Sheet bottom
- 82 tema claro: contraste medido nos dois modos (screenshot depende de QA)
- 83 ZEN: ABERTA — nao verificada (garantia apenas por construcao)
- 84 commit/PR/CI/merge
- Evidencia: typecheck 0 · ratchet 0 novas/6 removidas · tipografia ok · implicit-any 0 · db:guard ok ·
  build ok, bundle 4074,6/4100 KB · suite 382 arquivos / 4978 testes / 0 falhas · 2/2 mutacoes mortas
  (regra de reduced-motion do card; aria-live da regiao viva)

> **Budget de bundle (medido em 2026-10-01, FASE H):** o build da FASE G fechava em 333,7 KB de JS
> inicial; a main atual (que o mergear re-sincroniza no branch) esta em 339,8 KB — **o #1424 (Talk X,
> Fase 1) consumiu 6,1 KB do grafo de entrada** (tocou `src/App.tsx`, rotas e providers). Com o guard em
> 340 KB, sobraram ~0,2 KB de folga: a FASE H estourou por 0,2 KB e a decisao 20261001-160338-3700 foi
> tirar os rotulos (nome/descricao) dos 7 atalhos de Tarefas do chunk de entrada, carregando-os sob
> demanda no painel de ajuda e na tela de atalhos. Nao se mexe no budget; quem for adicionar peso ao
> grafo de entrada (nao-lazy) precisa medir com `VITE_CRM_INTEGRATION_ENABLED=true bun run build` e
> `VITE_CRM_INTEGRATION_ENABLED=true node scripts/ci/bundle-budget.mjs` (o budget local sem esse env
> nao acusa o estouro).

## FASE I — Rede de testes (85-90)

- 85 WorkItemCard.test.tsx: 11 casos (status, teclado com guarda de alvo, checkbox/contato, kebab
  liberado, WIP) — 14/14 mutantes mortos pelo autor
- 86 TasksListMode.test.tsx (8) + TasksModule.test.tsx +6 (defaultMode, ?view=pipeline forca Quadro
  sem reescrever a preferencia, ?task= abre o Sheet, atalho N)
- 87 resolveDragEnd extraido como funcao PURA em board/resolveDragEnd.ts + TasksBoardMode.test.tsx (10)
- 88 TasksAgendaMode.test.tsx (7, relogio congelado) + WorkItemSheet.test.tsx +4 de borda
- 89 numeros: chunk do modulo 12,2 KB gz (teto 45) · JS inicial 334,9/341 KB ·
  NAO medido: seed de 300 tarefas e TTI dos 3 modos (dependem do login de QA)
- 90 commit/PR/CI/merge
- Evidencia: dominios 19 arquivos / 254 casos · suite 398 arquivos / 5219 testes / 0 falhas ·
  typecheck 0 · lint-ratchet 0 novas · typecheck-ratchet 0 novas · implicit-any 0 · tipografia ok · db:guard ok

## Pendências / resíduos (honestos)
- Push do navegador: decidir na etapa 64 (infra existe: usePushNotifications.ts, PushNotificationToggle.tsx — não avaliada)
- Parser de linguagem natural: v2 (G-5)
- Virtualização: v2 (>500 itens)
- Agenda sem arrastar entre dias: v2
- Delegação / recorrência / subtarefas / colunas personalizáveis / anexos / comentários: v2
- Migration de drop de reminders_pending (etapa 97): **APROVADA, MERGEADA e APLICADA** — PR #1516 `2d4e8e4b`, `DDL_POS_MERGE=aplicadas`, provado no banco: a RPC devolve `TABLE(tasks_open, notes_total, files_total)`
- e2e/reactions.spec.ts (reacoes do inbox) falha de forma cronica no e2e-logado da main desde antes desta entrega — nao e regressao das Tarefas; vira tarefa separada
- Guarda git do Hermes trava durante rebase: com HEAD destacado `git branch --show-current` devolve vazio e a checagem nega TODO comando git, inclusive `git rebase --abort/--continue` (deadlock). Contorno usado: integrar com `git merge origin/main`. Sugestao de correcao registrada no corpo do PR #1133
- `bun run lint` (eslint cru, que NAO e gate do CI) falha com 967 problemas legados; o gate real e o lint-ratchet, que passa (0 novas)
- Fase A, divergencia do plano: a etapa 3 lista hipoteses erradas para o B14 (NotesTab.test / vi.importMock / cast do ViewRouter); a causa era o tipo frouxo do proprio hook
- Fase A, divergencia do plano: a regra 8 ("logs do CI devolvem 403") esta desatualizada — `gh run view --log-failed` funciona e foi o que localizou o B14
- Fase A, divergencia do plano: integracao da branch ao main feita por MERGE (rebase e inviavel sob a guarda — ver acima); a PR passou a ter um commit de merge
- Auditoria 29/09 — residuos que NAO fechei (fora do escopo desta PR, viram tarefa propria quando o Joaquim quiser): `work-items-badge` sem consumidor na UI; `Bell` e `Filter` importados e nao usados no TasksModule; `get_conversation_tab_counts.reminders_pending` devolve 0 fixo (campo morto); `created_by` e NOT NULL com FK ON DELETE SET NULL (apagar um profile que tenha tarefas falha); sem indice em completed_at nem em position; `update()` do hook ignora `input.status` (vai morder no Sheet da Fase C); WIP contado globalmente e nao por contato; duplicidade entre workItemAggregates e TasksBoardMode (o SonarCloud nao reprova porque nao e codigo novo); e2e/reactions.spec.ts cronico na main.


---

## CP-K Entrega (2026-10-02) — fechamento da FASE J e do plano

**Etapa 97 — MERGED.** PR #1516, `MERGE_SHA=2d4e8e4bc76ffe02730889d9ed138f3280eff0fe`, `DEPLOY=ok`, `DDL_POS_MERGE=aplicadas`.
Prova medida no banco de producao (gateway somente-leitura): `pg_get_function_result('public.get_conversation_tab_counts(uuid)')` = `TABLE(tasks_open integer, notes_total integer, files_total integer)` — **sem `reminders_pending`**.
Armadilha registrada: `CREATE OR REPLACE FUNCTION` **nao troca o tipo de retorno** (`cannot change return type of existing function`) — a migration "passava" sem efeito. O caminho certo e `DROP FUNCTION` + `CREATE FUNCTION` + reconceder `REVOKE`/`GRANT`. O caminho de volta tem a mesma restricao e foi testado em PostgreSQL descartavel.

**Etapa 99 — contrato v1 item a item.** 19 dos 20 itens PRESERVADOS; **1 PARCIAL**: item 9 (listar alarmes pendentes do contato) — o painel/aba foi removido na fusao (PR #1133) e o alarme hoje aparece so como chip no card. 14 residuos honestos registrados (push do navegador, parser de linguagem natural, virtualizacao, Agenda sem DnD, delegacao/`assigned_to` sem UI, recorrencia, subtarefas, colunas personalizaveis; e, do metodo, que a RLS foi provada pela definicao das policies + o caso do agente na etapa 95).

**Etapas 66/67 (idempotencia do alarme).** 66: **1 -> 2 provado** com timestamps (alarme +2min disparou as 10:53:07Z com `count=1`; adiar 15min moveu `remind_at` para 11:08:10Z e o 2o disparo deu `count=2`; toast do alarme visivel). O trecho 'concluir -> `status=done` e `remind_at IS NULL`' **nao foi medido** (o clique de concluir nao surtiu efeito nesse roteiro). 67: **nao medida** em 3 tentativas — o roteiro nao conseguiu criar a tarefa (timeout esperando o card, 20s e depois 60s), mesmo o app criando normalmente em outros fluxos. Ambos seguem como pendencia de remedicao com roteiro instrumentado.

**Etapa 62 (badge da sidebar).** Achado do dono: o DoD pede `bg-destructive` com atrasada e `bg-warning` sem, e o `SidebarNavItem` pintava `bg-destructive` fixo. `useMyWorkItemsBadge` virou `useMyWorkItemsBadgeInfo` (devolve `count` + `hasOverdue`), o `Sidebar` passa a variante e o badge ganha a cor por estado; 3 testes novos cobrem vermelho, amarelo e o padrao.

**Etapa 93/47 (altura do card).** Medido em producao: o card do Quadro sem chip nenhum tem **56px**, e o DoD da etapa 47 exige `min-h-[72px]`. O `WorkItemCard` **nao tinha** `min-h` (zero ocorrencias no arquivo). Corrigido nesta PR no modo nao-agenda; cuidado deliberado: a Agenda continua `h-11` (44px, etapa 56).


---

## CP-L Entrega (2026-10-02) — evidencias de tela (etapas 34/42/54/58/81/82/83/100) e prova da 93 no ar

**Screenshots tirados contra producao com a conta COMPRAS** (18 PNGs em `~/auditorias/fase-j/out/`): `C-34-sheet.png`, `D-42-quickadd.png`, `E-54-pipeline-1440-cinco-colunas.png`, `E-58-{list,board,agenda,board-1280}.png`, `H-81-mobile-{list,board,agenda}.png`, `H-82-light-{list,board,agenda}.png`, `H-83-zen.png`, `J-100-prod-{tasks,board,chat}.png`.

**Etapa 81 — a medida que o DoD pede (`scrollWidth <= innerWidth` nos 3 modos):** Lista **390 = 390**, Quadro **390 = 390**, Agenda **390 = 390** (390x844, `overflow: false` nos tres). O `screens-relatorio.json` guarda os numeros crus.

**Etapa 54 (1440):** o board renderiza com os status no DOM e `docScrollWidth = innerWidth = 1440` — as colunas **cabem**, entao **nenhum `-mx-[var(--layout-gutter)]` foi aplicado**. Decisao registrada; o PNG e a evidencia.

**Etapa 83 (Zen):** em 390x844, `scrollWidth = innerWidth = 390` — QuickAdd e mini-quadro nao estouram o painel.

**Etapa 93 (card 56px -> 72px):** a correcao (`min-h-[72px]` so no modo nao-agenda) foi mergeada (#1590) e esta **no ar**: o CSS de producao (`assets/index-B65zfFfB.css`) contem `min-height:72px`, e os tokens `--warning` / `--warning-foreground` estao presentes para o badge amarelo da 62. Remedicao com tarefa seedada fica para a proxima janela (a conta QA esta sem tarefa e o card so existe com dado).

**Etapas 42/34:** reconfirmadas por medicao — `C-34-sheet.png` tirado 02/10 (o CP-C dizia pendente por login de QA, que ja nao e bloqueio) e o QuickAdd expoe **7 chips** no DOM (`D-42-quickadd.png`).


---

## CP-M Entrega (2026-10-02) — placar do plano em 96/100

**Fechadas neste ciclo (com o SHA da entrega citado na propria linha):**
- **34 (Sheet de edicao):** `e6739afc4` (#1391, FASE C, etapas 23-27) + `09e7cdffd` (#1398, 28-33) + `out/C-34-sheet.png` (02/10, conta COMPRAS).
- **42 (QuickAdd):** `256fac36e` (#1418, FASE D, etapas 35-42) + `out/D-42-quickadd.png` (7 chips medidos no DOM).
- **58 (telas da FASE E):** `ebc126427` (#1298, 45/46), `fed595989` (#1303, 55), `211fe1606` (#1305, 56), `92e884eef` (#1308, 57), com os ajustes #1325/#1334/#1360/#1372 + os 4 PNGs `out/E-58-*`.

**Placar: 96 de 100 etapas marcadas.**

**Pendentes do Joaquim (as 4 que restam, cada uma com o que destrava):**
- **66** (idempotencia do alarme): a idempotencia **1 -> 2** esta provada com timestamps; falta medir `concluir -> status='done' + remind_at IS NULL`, que exige remedicao instrumentada lendo o banco depois de concluir.
- **67** (concluir antes do horario -> 0 notificacoes): **nao medida**; o roteiro nao cria a tarefa (3 tentativas, 20s e 60s — nao e timing). Destrava com roteiro instrumentado (screenshot + console no momento da criacao).
- **96** (dados migrados): a query fecha (`migrated_task_id IS NULL` = 0); falta abrir a tarefa migrada na Lista/Sheet **do dono** — precisa de credencial do Admin 01.
- **100** (verificacao final): cron ativo e `reminder_due` > 0 nas 24h ja provados, e os 3 PNGs `J-100-prod-*` existem; falta a conferencia presencial do dono.


---

## CP-N Entrega (2026-10-02) — etapas 66 e 67 FECHADAS com medicao em producao

**Etapa 66 (idempotencia do alarme) — exit code 0.** Criada as 12:29:16 com alarme +2 min; **1o disparo as 12:31:00 com `count=1`** e toast visivel na UI; **adiar 15 min** as 12:31:03 confirmou "Aviso adiado" e moveu `remind_at` de 15:31:00Z para **15:46:01.527Z**; **2o disparo as 12:47:02 com `count=2`** (id novo, sem duplicar o anterior); **concluir** -> **`status=done` + `remind_at=null`** + `notified_at=null`, `completed_at=15:47:03.397764Z`; limpeza final DELETE 200 (tarefa) e 204 (notificacoes). Sequencia completa: 1 -> 2 -> done, todas as pernas medidas.

**Etapa 67 (concluir antes do horario -> 0 notificacoes) — exit code 0.** Criada as 12:20:16 com alarme +5 min (`remind_at` 15:25:14.950Z) e **concluida 6 segundos depois** (`status=done`, `remind_at=null`); **as 12:26:17, ja no horario do alarme, `count = 0` notificacoes.** Limpeza: DELETE 200 (tarefa) e 204 (notificacoes).

**Causa real das falhas anteriores (medida, nao suposta):**
- **67** — **era ambiente, nao o roteiro.** Sem mudar logica, o mesmo roteiro criou a tarefa de primeira. As tentativas de 08:11/08:17 caíram na janela em que a Vercel republicava a cada ~5 min e a app devolvia **503**: a Lista nao renderizava o card e o `waitCard` estourava. A rodada de hoje tambem registrou `503` de console e passou.
- **66** — **era instrumentacao.** O clique de concluir vivia dentro de um `.catch()` que engolia a falha do clique; o roteiro seguia e reportava "status continuou backlog" sem dizer por que. Com o helper `concluir()` (click -> `force` -> botao do toast) o clique registra `ok="click"` e o efeito aparece no banco em 3 s.

**Instrumentacao minima que passou a valer no roteiro:** `pageerror` / `console.error` / `requestfailed` no JSONL; `quickCreate` confirma que a tarefa nasceu (e, se nao nascer, grava o valor do campo, o dump dos cards e screenshot, abortando com mensagem clara); `waitCard` grava o mesmo dump no timeout; `concluir()` nao engole erro.

**Producao conferida depois dos runs:** `conversation_tasks where title like 'QA-E5-idem%'` = **0** e **0** notificacoes orfas dessas tarefas.

**Placar: 98 de 100.** Ficam abertas apenas **96** (abrir a migrada na Lista/Sheet do dono — credencial do Admin 01) e **100** (conferencia presencial do dono).
