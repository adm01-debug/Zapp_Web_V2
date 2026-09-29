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
## CP10 QA          [ ] CI da PR #1133 vermelho no typecheck-ratchet (B14, causa não identificada) · E.2/E.3/E.5/isolamento não rodados
## CP11 Entrega     [~] legado removido (12 arquivos) · PR #1133 ABERTA · produção NÃO verificada · docs não atualizados · remindersPending ainda no tipo

## Novo plano (v2) — checkpoints
## CP-A Desbloqueio [ ] prod atual= · causa B14= · PR #1133 merge= · deploy READY= · shots A-09=
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
