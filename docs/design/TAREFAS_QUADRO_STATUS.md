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
## CP-B Hook        [ ] types.ts regenerado= · 0 Record<string,any>= · join contacts= · otimista= · snooze= · badge fix= · testes hook=
## CP-C Sheet       [ ] WorkItemSheet= · ?task= · Aguardando por DnD/kebab/menu= · kebab 5 grupos= · RemindChip popover= · ContactChip=
## CP-D QuickAdd    [ ] chip-btn CSS= · 7 chips= · validação passado= · teste=
## CP-E Telas       [ ] KPIs 88px= · filtros 3 modos= · Concluídas 7d= · Quadro WIP/ordem= · Agenda grupos= · 0 requests na troca=
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
