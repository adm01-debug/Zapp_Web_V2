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

## CP1 Banco        [ ] PR=PENDENTE APROVADO · typecheck=0 · machine/aggregates tests=ok
## CP2 Dados        [ ] sha= · compat shots= · realtime= · lembrete antigo→tarefa nova: pendente
## CP3 Componentes  [ ] sha= · tests= · shot=
## CP4 Lista        [ ] sha= · shot= · quickAdd=_ kpi=_ · criar/concluir/undo/editar em prod:
## CP5 Quadro       [ ] sha= · shots= · columns=5 doing=n/3 · mouse+teclado em prod:
## CP6 Agenda       [ ] sha= · shot= · troca de modo: 0 requests
## CP7 Avisos       [ ] sha= · cron ativo · notif criada · toast · adiar · push: fora da v1
## CP8 Chat         [ ] sha= · abas=8 · badge==lista · shots=
## CP9 A11y/mobile  [ ] sha= · atalhos= · reduced-motion=0s · contraste= · mobile overflow=0 · light ok · bundle= KB gz
## CP10 QA          [ ] gates 8/8 · func 24/24 · geometria N/N · cores N/N · isolamento ok · migração ok
## CP11 Entrega     [ ] PR legado= · merge= · prod shots= · cron ok · concluído em

## Iterações
-

## Pendências / resíduos
- Push do navegador: fora da v1 (infra existente não foi verificada em 28/09)
- Parser de linguagem natural: v2
- Virtualização da lista: v2 (>500 itens)
- Agenda sem arrastar entre dias: v2
- Colunas personalizáveis / delegação / recorrência / subtarefas: v2
