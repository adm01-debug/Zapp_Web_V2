# PROMPT DE EXECUÇÃO — FUSÃO TAREFAS + LEMBRETES E QUADRO KANBAN PESSOAL | ZAPP WEB V2 — 150 ETAPAS

> ⚠️ **SUBSTITUÍDO em 29/09/2026** por `PLANO_TAREFAS_FINALIZACAO_100_ETAPAS.md` após a auditoria `RELATORIO_AUDITORIA_TAREFAS_FUSAO.md`. Este arquivo fica como referência da especificação de produto (seções 2–6); as etapas 1–150 não devem mais ser executadas daqui.

> **Executor:** Claude Code (container `claude-code`, VPS AtomicaBR) — em **três sessões** `claude -p` (ver seção 7)
> **Repo:** `adm01-debug/Zapp_Web_V2` (branch base `main` @ `577a213a` ou posterior)
> **Deploy:** Vercel `zapp_web_v2` (team `juca1`) — preview automático por branch; merge em `main` = produção
> **Telas alvo:** `?view=tasks` (Tarefas), `?view=pipeline` (Pipeline → vira **Quadro**), abas **Tarefas** e **Lembretes** do chat (`?view=inbox`), painel Detalhes do Contato
> **Ledger de progresso (obrigatório):** `docs/design/TAREFAS_QUADRO_STATUS.md`
> **Destino deste arquivo:** `docs/design/PLANO_TAREFAS_QUADRO_FUSAO_150_ETAPAS.md`
> **Versão:** 1.0 — 28/09/2026 — plano, **não execução**. Nada deste documento foi implementado.
> **Autor da estratégia:** sessão de design (Claude) a pedido de Joaquim; leitura de código feita em 28/09/2026 sobre `main`.

---

## 0. LEIA ANTES DE TOCAR EM QUALQUER ARQUIVO

### 0.1 O problema em uma frase
Hoje o sistema tem **três lugares** para "coisas que eu preciso fazer" — Tarefas (lista), Lembretes (alarme por contato) e Pipeline (kanban só de vendas) — com **três modelos de dados**, **três hooks**, **três telas** e **nenhuma regra em comum**. O usuário não sabe onde registrar o quê, e o time de suporte não sabe explicar a diferença. Este plano funde os três num único conceito — **Tarefa** — com **um modelo**, **um hook**, **três modos de ver** (Lista, Quadro, Agenda) e **um lugar** dentro do chat.

### 0.2 Por que fundir (fatos do código, não opinião)

| Hoje | Evidência (arquivo) | Problema de produto |
|---|---|---|
| Tarefa = `conversation_tasks` (title, status `pending/completed`, priority, due_date, assigned_to, created_by, contact_id) | `src/hooks/tasks/useMyTasks.ts`, `useConversationTasks.ts` | Só dois estados. Não existe "fazendo" nem "aguardando". Não tem hora de aviso. |
| Lembrete = `reminders` (title, description, remind_at, is_dismissed, notified_at, profile_id, contact_id NOT NULL na UI) | `src/hooks/chat/useReminders.ts`, `RemindersPanel.tsx` | É uma tarefa com hora de aviso e sem prazo. Duplica 80% do conceito. Só existe **dentro** do contato; não há visão global. |
| Pipeline = `sales_deals` + `sales_pipeline_stages` (5 colunas fixas de venda, valor, ganho/perdido) | `src/components/pipeline/SalesPipelineView.tsx` | Kanban bonito, mas amarrado a "deal". Em produção: **0 deals** (print de 28/09). Drag & drop nativo HTML5 (sem teclado, sem mobile) enquanto o repo já tem `@hello-pangea/dnd` em uso no módulo Contatos. |
| "Minhas tarefas" mostra tarefas de **todo o time** | `useMyTasks.ts` não filtra por dono; subtítulo da tela: "Tarefas da equipe, cruzando todos os contatos" | Contradiz a decisão de negócio (tarefa é pessoal). |
| RLS de `conversation_tasks` é `USING (true)` para qualquer autenticado | migrations `20260315203210…` | Qualquer usuário edita/apaga tarefa de qualquer outro. Para tarefa pessoal, isso é falha. |
| RLS de `reminders` é por `profile_id` | migration `20260409014536…` | Já é pessoal — este é o comportamento certo a herdar. |
| `notify_due_reminders()` existe e grava em `notifications` | `20260925170100_add_notify_due_reminders.sql` | **Nenhuma migration agenda o cron** que a chama (`git grep cron.schedule` não acha). Pode nunca rodar. Verificar `cron.job` em produção na Fase 0. |
| `NotificationCenter` conhece o tipo `reminder_due` no TS | `useNotifications.ts:12` | Nenhum componente renderiza CTA específica ("abrir contato", "adiar"). |
| Chat tem abas **Tarefas** e **Lembretes** separadas; Notas tem seção "Pendências" que são as mesmas tarefas | `ConversationTabs.tsx`, `NotesTab.tsx` | Mesmo dado em 3 abas. |
| Contagem da aba: `tasks_open` + `reminders_pending` | RPC `get_conversation_tab_counts` | Dois badges para um conceito. |
| Zero testes | `git grep` em `*.test.*` por `TasksView|SalesPipelineView|useMyTasks|useReminders` = 0 | Refatorar sem rede. |

### 0.3 Regras invioláveis (anti-falha)

1. **Nenhum checkpoint fecha sem evidência** escrita no ledger: SHA, caminho de screenshot, saída de script, contagem de banco. "Feito" sem arquivo é mentira.
2. **Ordem é lei: banco → dados (hook) → componentes base → telas → chat → navegação → QA → cutover.** Não abra `SalesPipelineView.tsx` antes do CP2.
3. **Toda DDL/migration/RLS em produção exige `APROVADO` do Joaquim** (regra 8 do fluxo Git). A PR da Fase 1 fica aberta aguardando. Nada de aplicar migration por MCP "para adiantar".
4. **Zero perda de dado.** Tabelas legadas (`reminders`, `sales_deals`, `sales_pipeline_stages`, `deal_activities`) **não são dropadas** neste plano. São migradas/desligadas da UI. Drop é decisão futura, fora daqui.
5. **Diff mínimo por arquivo.** Reescrita autorizada apenas para: `TasksView.tsx`, `SalesPipelineView.tsx`, `TasksTab.tsx`, `RemindersPanel.tsx`, `useMyTasks.ts`. O resto é edição cirúrgica.
6. **Contrato de funcionalidades preservadas (seção 5) é lei.** Cada handler existente continua funcionando ou é substituído por equivalente documentado.
7. **Tarefa é do usuário para ele mesmo.** Nenhuma UI de "atribuir a", "responsável", "delegar" nesta entrega. Coluna `assigned_to` fica no banco, sempre igual a `created_by`, para a v2 (delegação) não exigir migration.
8. **Componentes compartilhados só mudam via prop nova com default = comportamento atual** (`PageHeader`, `Button`, `Badge`, `Tabs`, `Dialog`).
9. **Ratchets são gates:** `npm run typecheck` (zero), `node scripts/ci/lint-ratchet.mjs`, `node scripts/ci/typecheck-ratchet.mjs`, `npm run implicit-any-check`, `npx vitest run src/components/tasks src/hooks/tasks src/components/inbox/tabs`. Baseline só muda seguindo `scripts/ci/README.md`.
10. **Armadilha do lint-ratchet:** ele casa violações legadas por `contextHash`. Inserir código *antes* de violação antiga acusa dívida nova. Mova a inserção para depois.
11. **Branch e PR, nunca `main`.** Uma branch por fase: `claude/feat-tarefas-fN-<slug>-<AAMMDD-HHMM>`. Um commit por fase, mensagem `feat(tarefas): fase N — <o que>`.
12. **Sem biblioteca nova de UI.** `@hello-pangea/dnd` (já instalada), `framer-motion`, `date-fns`, `lucide-react`. Fora do repo, em `/workspace/qa`: `playwright`, `pngjs`, `pixelmatch`.
13. **Máximo 3 iterações por loop visual/funcional.** Na 3ª, registre o resíduo e siga.
14. **Shell dos containers é `dash`.** Sem `[[ ]]`, arrays, `source`. Sem `python3`.
15. **Push do container `claude-code` trava por causa do hook `.husky/pre-push` (typecheck + ratchets > limite da chamada).** Use `nohup git push … &` e confira com `git ls-remote`, **ou** suba pela API do GitHub (`github_push_files`). Registre qual usou.
16. **Login de QA (`qa.visual@…`) devolve 401 em produção em 28/09.** A Fase 0 conserta isso **antes** de qualquer QA visual. Sem login válido, nenhum checkpoint visual fecha — e o plano diz isso no ledger em vez de fingir screenshot.
17. **Se algo do plano contradisser o código real, o código real vence — e a divergência vai para o ledger antes de decidir.**

---

## 1. CONTEXTO VERIFICADO (leitura em 28/09/2026, `main` @ `577a213a`)

### 1.1 Stack e comandos
Vite 8 + React 19 + TS 5.8 + Tailwind 3.4.19 + shadcn/Radix + framer-motion 12 + TanStack Query 5 + `@hello-pangea/dnd` 18 + date-fns + lucide. Scripts: `dev`, `build`, `lint`, `typecheck` (`tsc -b --force`), `test` (`vitest run`), `implicit-any-check`, `test:e2e`. Husky ativo (`pre-commit`, `pre-push`).

### 1.2 Arquivos do domínio (todos existem)
| Camada | Arquivo | Linhas | Papel hoje |
|---|---|---|---|
| Tela | `src/components/tasks/TasksView.tsx` | 244 | Lista Hoje/Próximas/Concluídas + diálogo "Nova tarefa" (título, contato obrigatório ou "Tarefa pessoal", prioridade, prazo, responsável, descrição) |
| Tela | `src/components/pipeline/SalesPipelineView.tsx` | 148 | Kanban de deals; carrega `sales_pipeline_stages`, `sales_deals`, 200 contatos, perfis; DnD nativo |
| Tela | `src/components/pipeline/DealCard.tsx`, `PipelineKPICards.tsx` | 82, 33 | Card e KPIs de venda |
| Chat | `src/components/inbox/tabs/TasksTab.tsx` | 118 | Mesma lista, filtrada pelo contato; filtro "minhas/de outros" |
| Chat | `src/components/inbox/tabs/RemindersTab.tsx` → `RemindersPanel.tsx` | 16, 109 | Criar lembrete (título + `remind_at`), listar, dispensar, apagar |
| Chat | `src/components/inbox/tabs/NotesTab.tsx` (seção "Pendências") | — | Lista `openTasks` do mesmo hook de tarefas |
| Chat | `src/components/inbox/chat/ConversationTabs.tsx` | 100 | 9 abas; badges `tasksOpen` e `remindersPending` |
| Chat | `src/components/inbox/tabs/TaskColumn.tsx`, `TaskCard` (dentro do TasksTab) | — | Reutilizados por `TasksView` |
| Hook | `src/hooks/tasks/useMyTasks.ts` | 89 | `conversation_tasks` **sem filtro de dono**; agrega overdue/today/upcoming/completed7d |
| Hook | `src/hooks/chat/useConversationTasks.ts` | 133 | Igual, filtrado por `contact_id` |
| Hook | `src/hooks/chat/useReminders.ts` | 83 | `reminders` por `contact_id` + `profile_id` |
| Hook | `src/hooks/chat/useConversationTabCounts.ts` | — | Chama RPC `get_conversation_tab_counts` |
| Hook | `src/hooks/system/useNotifications.ts` | — | Lê `notifications`; tipo `reminder_due` existe no union |
| Nav | `src/services/navigation.service.ts:47-48` | — | `pipeline` (Kanban icon, layout `full`, `Alt+P`), `tasks` (ListChecks, `Alt+K`) |
| Rota | `src/pages/ViewRouter.tsx:66-67` | — | `'pipeline' → SalesPipelineView`, `'tasks' → TasksView` |
| Tipos | `src/integrations/supabase/types.ts` | — | `conversation_tasks` L2555, `reminders` L5775, `sales_deals` L5862, `sales_pipeline_stages` L5951, `deal_activities` L2996 |

### 1.3 Banco (colunas reais)
- `conversation_tasks`: `id, title, description, status text (pending|completed), priority text (low|medium|high|urgent), due_date timestamptz, contact_id uuid null, assigned_to uuid null, created_by uuid null, completed_at, created_at, updated_at`. RLS: 4 policies `USING (true)` para `authenticated`.
- `reminders`: `id, title, description, remind_at, is_dismissed bool, notified_at, profile_id NOT NULL, contact_id null, created_at`. RLS: "Users can manage own reminders" por `profile_id`. Índice `idx_reminders_due_pending` (25/09).
- `sales_deals`, `sales_pipeline_stages`, `deal_activities`: intactas; ver colunas em `types.ts`. RLS permissiva.
- RPC `get_conversation_tab_counts(contact_id)` → `tasks_open, notes_total, files_total, reminders_pending` (25/09).
- Função `notify_due_reminders()` (SECURITY DEFINER, REVOKE de anon em 25/09): insere em `notifications` com `type='reminder_due'` e marca `notified_at`. **Sem `cron.schedule` no repo.**

### 1.4 Bugs e lacunas encontrados (entram no plano, não em "próximos passos")
- **L1** Tela "Tarefas" mostra tarefas de todos (`useMyTasks` sem `eq('created_by', …)`).
- **L2** RLS de tarefas não isola dono.
- **L3** Lembrete sem visão global (só dentro do contato).
- **L4** Cron do aviso de lembrete possivelmente inexistente em produção.
- **L5** `NotificationCenter` não tem ação para `reminder_due` (abrir contato / adiar / concluir).
- **L6** Pipeline DnD sem teclado e sem toque (HTML5 `draggable`).
- **L7** Zero testes nas três telas.
- **L8** Diálogo "Nova tarefa" pede "Responsável" — contradiz "tarefa pessoal".
- **L9** `TasksTab` tem filtro "de outros" — idem.
- **L10** `PipelineKPICards` calcula "Taxa de conversão" = ganhos/total sem tratar zero (mostra 0%, mas divide por zero em JS = NaN mascarado). Verificar na Fase 0.

---

## 2. ESPECIFICAÇÃO DE PRODUTO E UX (o "porquê" de cada decisão)

### 2.1 Conceito único: **Tarefa**
Uma Tarefa é "algo que **eu** preciso fazer", com estas propriedades opcionais:
| Propriedade | Campo | Semântica | Exemplo |
|---|---|---|---|
| Prazo | `due_date` | Até quando tem que estar pronto | "Enviar orçamento até sexta" |
| Alarme | `remind_at` | Quando o sistema deve **me avisar** | "Me avise amanhã 10h" |
| Contato | `contact_id` | Sobre quem é (abre o chat com 1 clique) | Regianne — Translig |
| Prioridade | `priority` | Ordem dentro da coluna | urgente > alta > média > baixa |
| Estado | `status` | Onde está no fluxo (seção 2.2) | Fazendo |
| Motivo de espera | `waiting_reason` | Por que parou (só em Aguardando) | "Aguardando aprovação do cliente" |
| Descrição | `description` | Contexto livre | — |

**Lembrete = Tarefa com `remind_at` e, normalmente, sem `due_date`.** Deixa de existir como coisa separada. O usuário cria "uma tarefa e pede para ser lembrado". Na UI a palavra "Lembrete" some dos títulos e vira a ação **"Lembrar-me"** (ícone de sino) dentro da tarefa.

**Deal = fora do escopo.** Não vira tarefa. O módulo comercial de deals é desligado da UI (dados preservados). Se um dia voltar, volta como tipo de tarefa com campo `value` — não agora (decisão G-2 na seção 6).

### 2.2 Fluxo (máquina de estados) — padrão Kanban pessoal
Pesquisa consolidada (Jim Benson / *Personal Kanban*; Nadja Schnetzler; Super Productivity; Kanban Tool; Superthread): para trabalho **individual**, o quadro que funciona tem 4 a 6 colunas, WIP pequeno em "Fazendo", uma coluna explícita de "Aguardando" para não estourar o WIP com item bloqueado, e **nunca** colunas de processo corporativo (Análise/QA/Deploy). Referências no Apêndice H.

| Coluna (rótulo) | `status` | Limite WIP | Política explícita (aparece no tooltip do cabeçalho) |
|---|---|---|---|
| **Caixa de entrada** | `backlog` | ∞ | Tudo que foi capturado e ainda não foi decidido. Sem prazo obrigatório. |
| **A fazer** | `todo` | ∞ (alerta visual > 15) | Decidi que vou fazer. Está pronta para começar. |
| **Fazendo** | `doing` | **3** (hard: bloqueia soltar a 4ª; mostra "3/3") | Estou nisso agora. Mais de 3 = troca de contexto, não trabalho. |
| **Aguardando** | `waiting` | **5** (soft: aviso âmbar) | Parou por causa de alguém/algo. Obrigatório dizer o motivo. Envelhecimento visível. |
| **Concluído** | `done` | — (mostra últimos 7 dias, "ver mais") | `completed_at` preenchido. Não volta sem ação explícita. |
| (oculta) | `cancelled` | — | Só via filtro "Canceladas". Não entra em métricas de throughput. |

Transições permitidas (Apêndice B): qualquer → `doing` respeita WIP; `waiting` exige `waiting_reason`; `done` grava `completed_at` e limpa `remind_at` pendente (não avisar de coisa pronta); reabrir `done` → `todo`. Legado: `pending → todo`, `completed → done`.

### 2.3 Três modos de ver o mesmo dado
| Modo | Para quê | Onde | Padrão de referência |
|---|---|---|---|
| **Lista** (`?view=tasks`, default) | Executar o dia: Atrasadas, Hoje, Próximas, Sem prazo, Concluídas | Tela Tarefas | Things 3 / Todoist "Hoje" |
| **Quadro** (`?view=pipeline` — id mantido, rótulo "Quadro") | Ver fluxo e gargalo; mover com arrastar/teclado | Mesma tela, modo 2 | Personal Kanban (5 colunas) |
| **Agenda** | Ver semana: barras por dia com prazo e alarme | Mesma tela, modo 3 | Google Tasks + Calendar strip |
Os três modos compartilham **um** hook, **um** filtro, **um** card. Trocar de modo é `AnimatePresence` de 120ms, sem refetch.

### 2.4 Captura rápida (o maior ganho de UX)
- Campo único no topo: "Adicionar tarefa…". `Enter` cria em **Caixa de entrada** com prioridade média. Sem diálogo.
- Chips à direita do campo: **Hoje · Amanhã · Próx. semana · 📅 Data · 🔔 Lembrar · @ Contato · ! Prioridade**. Clique preenche; não exige abrir modal.
- Atalho global **`N`** (com foco fora de input) e **`Alt+K`** (já existe) focam o campo.
- Do chat: aba "Tarefas" tem o mesmo campo, já com `@contato` preenchido.
- Parser de linguagem natural **fica fora** da v1 (risco de erro silencioso em pt-BR). Entra como G-5.

### 2.5 Card (Lista e Quadro usam o mesmo componente)
```
┌─────────────────────────────────────────────┐
│ ○  Enviar orçamento revisado        !alta ⋮ │  ← checkbox (Lista) | pega (Quadro)
│    🧑 Regianne · Translig SPO                │  ← chip do contato (clique = abre chat)
│    📅 Sex 03/10   🔔 Qui 09:00   ⏳ 3d       │  ← prazo | alarme | envelhecimento na coluna
│    ⏸ Aguardando aprovação do cliente        │  ← só em Aguardando
└─────────────────────────────────────────────┘
```
Tokens: card `bg-card rounded-[14px] border-border/70 p-3 gap-1.5`; hover `border-primary/40 -translate-y-0.5`; arrastando `shadow-glow-primary rotate-[1deg]`; prioridade = borda esquerda 3px (`urgent` destructive, `high` warning, `medium` primary/60, `low` muted); atrasada = chip de prazo `text-destructive`; envelhecimento ≥3d âmbar, ≥7d vermelho; concluída = `opacity-60 line-through` no título.

### 2.6 Avisos (o que acontece na hora do alarme)
1. Cron (a cada minuto) roda `notify_due_tasks()` → insere em `notifications` (`type='reminder_due'`, `metadata.task_id`, `contact_id`).
2. `useNotifications` já assina realtime → toast no canto com **3 ações**: **Abrir** (contato ou tarefa), **Adiar** (15 min · 1 h · Amanhã 9h), **Concluir**.
3. `NotificationCenter` lista com as mesmas ações. Adiar = `remind_at` novo + `notified_at = null`.
4. Push do navegador via infraestrutura existente (`PushNotificationToggle`) — só se já funcionar para outros tipos; senão registra como resíduo.
5. Badge no item "Tarefas" da sidebar = atrasadas + alarmes vencidos não dispensados.

### 2.7 Acessibilidade e movimento (não negociáveis)
- DnD com `@hello-pangea/dnd`: teclado (espaço pega, setas movem, espaço solta), `aria-live` anunciando "Movida para Fazendo (2 de 3)".
- Todo card é `role="article"` com `aria-label` = título + estado + prazo.
- Contraste ≥ 4.5:1 em chips (auditar com o script E.3).
- `prefers-reduced-motion` → sem animação de mover/entrar.
- Foco visível `ring-2 ring-ring` em card, coluna e chips.
- Mobile (< md): Quadro vira colunas com `snap-x` horizontal (uma coluna por tela) + botão "Mover para…" no card (sem depender de arrastar).

### 2.8 Métricas pessoais (substituem os KPIs de venda)
| KPI | Cálculo | Por quê |
|---|---|---|
| Atrasadas | `due_date < hoje AND status NOT IN (done,cancelled)` | Urgência |
| Para hoje | `due_date = hoje` idem | Foco do dia |
| Fazendo | `status = doing` (n/3) | WIP visível |
| Concluídas 7d | `completed_at ≥ now-7d` | Throughput |
| Tempo médio (7d) | média de `completed_at - created_at` das concluídas 7d | Cycle time |
Sem gráfico na v1. Só números tabulares, mesmo `ContactKpiCard` visual do redesign de Contatos (reuso de padrão).

### 2.9 O que **não** entra (evita escopo infinito)
Delegação · subtarefas · recorrência · anexos · comentários · etiquetas livres · colunas personalizáveis · parser de linguagem natural · integração com Google Calendar · deals/valor. Todos listados como decisões futuras na seção 6.

---

## 3. ARQUITETURA DA MUDANÇA

### 3.1 Modelo de dados alvo (uma tabela: `conversation_tasks`, nome mantido para não quebrar RPCs e tipos)
| Coluna | Ação | Detalhe |
|---|---|---|
| `status` | **ampliar** | `CHECK (status IN ('backlog','todo','doing','waiting','done','cancelled'))` **após** backfill `pending→todo`, `completed→done`. Default `'backlog'`. |
| `remind_at timestamptz null` | **nova** | Alarme. |
| `notified_at timestamptz null` | **nova** | Idempotência do aviso (mesmo padrão de `reminders`). |
| `waiting_reason text null` | **nova** | Obrigatório via CHECK: `status <> 'waiting' OR waiting_reason IS NOT NULL`. |
| `position integer not null default 0` | **nova** | Ordem manual dentro da coluna (DnD). |
| `started_at timestamptz null` | **nova** | Preenchida ao entrar em `doing` (cycle time real). |
| `status_changed_at timestamptz not null default now()` | **nova** | Envelhecimento na coluna. Trigger atualiza quando `status` muda. |
| `created_by` | **NOT NULL** após backfill | Dono. Backfill: `COALESCE(created_by, assigned_to)`; se ambos nulos → decisão G-4. |
| `assigned_to` | manter | Sempre `= created_by` nesta versão (trigger `BEFORE INSERT` garante). |
| Índices | novos | `(created_by, status, due_date)`, `(created_by, remind_at) WHERE remind_at IS NOT NULL AND notified_at IS NULL AND status NOT IN ('done','cancelled')`. |
| RLS | **substituir** | 4 policies por `created_by = public.current_profile_id()` (função já existente? verificar na etapa 12; senão `profile_id IN (SELECT id FROM profiles WHERE user_id = auth.uid())` como em `reminders`). |
| Migração de `reminders` | **INSERT … SELECT** | `reminders` não dispensados → `conversation_tasks` com `status='todo'`, `remind_at`, `notified_at`, `created_by=profile_id`, `contact_id`, `title`, `description`. Grava `reminders.migrated_task_id` (coluna nova) para rastreio e idempotência. Dispensados → `status='done'`, `completed_at=created_at` (histórico). |
| `notify_due_tasks()` | **nova função** | Cópia de `notify_due_reminders` lendo `conversation_tasks`. `metadata.task_id`. Mesmo REVOKE de anon. |
| `cron.schedule('tasks-notify-due', '* * * * *', 'SELECT public.notify_due_tasks()')` | **nova** | Idempotente (`cron.unschedule` se existir). |
| `get_conversation_tab_counts` | **alterar** | `tasks_open` = tarefas **do usuário atual** não `done/cancelled` do contato; `reminders_pending` passa a devolver 0 (compat) e é removido na etapa 148. |
| `notify_due_reminders` + cron antigo | **desligar** | `cron.unschedule` se existir; função fica (sem chamador) até drop futuro. |
| `reminders`, `sales_*`, `deal_activities` | **intocadas** | Só RLS de `reminders` continua. |

### 3.2 Arquivos novos
| Arquivo | Conteúdo |
|---|---|
| `supabase/migrations/2026MMDDHHMMSS_tasks_unify_reminders_kanban.sql` | DDL da seção 3.1 (Apêndice A), em **uma** migration transacional com `-- rollback:` comentado |
| `supabase/migrations/2026MMDDHHMMSS_tasks_notify_due_cron.sql` | Função + cron |
| `src/hooks/tasks/workItem.types.ts` | `WorkItem`, `WorkItemStatus`, `Priority`, `KANBAN_COLUMNS`, `WIP_LIMITS` |
| `src/hooks/tasks/workItemMachine.ts` | `canTransition(from,to,ctx)`, `applyTransition(item,to,now)` — puro, testável |
| `src/hooks/tasks/workItemAggregates.ts` | `bucketByDue(items, now)`, `bucketByStatus`, `kpis(items, now)`, `agingDays` — puro |
| `src/hooks/tasks/useMyWorkItems.ts` | **substitui** `useMyTasks`: query `['work-items', profileId, filters]`, filtro por dono, realtime `postgres_changes` filtrado por `created_by`, mutations otimistas (create/update/move/complete/snooze/cancel/delete) |
| `src/hooks/tasks/useWorkItemNotifications.ts` | Ações de `reminder_due` (abrir/adiar/concluir) |
| `src/components/tasks/TasksModule.tsx` | Shell: `PageHeader variant="plain"` + KPIs + captura rápida + `ModeSwitcher` (Lista/Quadro/Agenda) + filtros |
| `src/components/tasks/shared/WorkItemCard.tsx` | Card único (seção 2.5), props `mode: 'list'|'board'|'agenda'` |
| `src/components/tasks/shared/QuickAdd.tsx` | Campo + chips (seção 2.4) |
| `src/components/tasks/shared/PriorityChip.tsx`, `DueChip.tsx`, `RemindChip.tsx`, `ContactChip.tsx`, `AgingDot.tsx` | Átomos |
| `src/components/tasks/shared/WorkItemSheet.tsx` | Painel lateral de edição (título, descrição, contato, prioridade, prazo, alarme, estado, motivo de espera) — `Sheet` do shadcn |
| `src/components/tasks/shared/ModeSwitcher.tsx` | Segmentado com `layoutId="tasks-mode-pill"` (mesmo padrão do redesign de Contatos) |
| `src/components/tasks/list/TasksListMode.tsx` | Seções Atrasadas / Hoje / Próximas / Sem prazo / Concluídas |
| `src/components/tasks/board/TasksBoardMode.tsx` | `DragDropContext` + 5 `BoardColumn` |
| `src/components/tasks/board/BoardColumn.tsx` | Cabeçalho (nome, n/WIP, tooltip com política), `Droppable`, estado "WIP cheio" |
| `src/components/tasks/board/MoveToMenu.tsx` | "Mover para…" (mobile/teclado) |
| `src/components/tasks/agenda/TasksAgendaMode.tsx` | Faixa de 7 dias + lista do dia |
| `src/components/tasks/TasksEmptyState.tsx` | 3 variantes: sem tarefas, sem resultado de filtro, coluna vazia |
| `src/components/tasks/__tests__/*.test.tsx`, `src/hooks/tasks/__tests__/*.test.ts` | Testes (Fase 10) |
| `docs/design/TAREFAS_QUADRO_STATUS.md` | Ledger (Apêndice F) |
| `/workspace/qa/tasks-*.mjs` (fora do repo) | Scripts de QA (Apêndice E) |

### 3.3 Arquivos alterados (cirúrgico)
| Arquivo | Mudança |
|---|---|
| `src/pages/ViewRouter.tsx` | `'tasks'` e `'pipeline'` → `TasksModule` com `defaultMode` `'list'` / `'board'` |
| `src/services/navigation.service.ts` | `pipeline` → label **"Quadro"**, ícone `Kanban` mantido; `tasks` mantém "Tarefas"; badge (etapa 121) |
| `src/components/inbox/chat/ConversationTabs.tsx` | remove aba `reminders`; badge de `tasks` = `tasksOpen` (que já inclui alarmes) |
| `src/components/inbox/chat/ConversationTabContent.tsx` | remove `RemindersTab`; `TasksTab` recebe `QuickAdd` com contato fixo |
| `src/components/inbox/tabs/TasksTab.tsx` | **reescrita**: usa `useMyWorkItems({contactId})`, sem filtro "de outros", captura rápida, card novo |
| `src/components/inbox/tabs/NotesTab.tsx` | seção "Pendências" passa a linkar para a aba Tarefas (não duplica lista) |
| `src/components/inbox/RemindersPanel.tsx`, `RemindersTab.tsx` | **removidos** na etapa 147 (após cutover) |
| `src/hooks/chat/useReminders.ts`, `useConversationTasks.ts`, `useMyTasks.ts` | `useMyTasks` **reescrito** como re-export deprecado de `useMyWorkItems`; os outros dois removidos na etapa 147 |
| `src/hooks/chat/useConversationTabCounts.ts` | tipo sem `remindersPending` (etapa 148) |
| `src/hooks/system/useNotifications.ts` | sem mudança de tipo; consumo de `metadata.task_id` |
| Componente de notificação (descobrir por `grep -rn "useNotifications()" src/components`) | render de `reminder_due` com 3 ações |
| `src/components/pipeline/*` | **removidos** na etapa 147 (após 2 checkpoints com o Quadro novo no ar) |
| `src/components/inbox/contact-details/*` (se houver atalho "lembrete") | apontar para tarefa |
| `src/integrations/supabase/types.ts` | regenerado após migration (gen-types) |
| `src/components/inbox/tabs/TaskColumn.tsx` | reutilizado pela Lista; só classes |

### 3.4 O que NÃO tocar
`supabase/functions/*` (nenhuma Edge Function no fluxo), `AppShell`, `Sidebar` (além do badge por prop existente), `sidebarNavConfig.ts` (estrutura), `vite.config.ts`, `eslint.config.js`, tabelas `contacts`, `profiles`, `notifications` (só INSERT via função), testes fora de `tasks/`, `inbox/tabs/`, `hooks/tasks/`.

---

## 4. PRINCÍPIOS DE DESIGN APLICADOS (para o executor não "improvisar")

1. **Lei de Hick:** captura rápida tem 1 campo; detalhes ficam no `Sheet`. Nunca modal com 7 campos como o "Nova tarefa" atual.
2. **Visibilidade do estado do sistema (Nielsen #1):** WIP "2/3" no cabeçalho; toast otimista ao mover; skeleton por coluna.
3. **Controle e liberdade (Nielsen #3):** toda ação destrutiva (cancelar, apagar, concluir em massa) tem **Desfazer** por 6s (`undoToast` já existe em `@/lib/undoToast`).
4. **Consistência (Nielsen #4):** o card é o mesmo na Lista, no Quadro, na Agenda e no chat. Tokens do tema navy do redesign de Contatos (`--card`, `--border`, `--primary`, `--success`, `--warning`, `--destructive`, `--kpi-tile-*`).
5. **Reconhecimento em vez de memória (Nielsen #6):** chips de data legíveis ("Sex 03/10", "Amanhã"), não ISO. Política da coluna no tooltip.
6. **Flexibilidade e eficiência (Nielsen #7):** atalhos `N` (nova), `1/2/3` (modo), `Space` (pegar/soltar), `E` (editar), `X` (concluir), `Del` (apagar com undo) — todos no `useKeyboardShortcuts` existente, ignorados com foco em input.
7. **Estética minimalista (Nielsen #8):** máximo 3 chips por card; descrição colapsada; contadores só quando > 0.
8. **Prevenção de erro (Nielsen #5):** WIP hard em Fazendo; motivo obrigatório em Aguardando; alarme no passado é rejeitado com mensagem inline.
9. **Gestalt — proximidade e continuidade:** colunas com gap 12px, cards com gap 8px, cabeçalho grudado (`sticky top-0`).
10. **Fitts:** alvos ≥ 36×36; checkbox do card 20px com área de clique 36px.
11. **Densidade:** desktop ≥ 1440 mostra 5 colunas sem scroll; 1280 mostra 5 com largura mínima 232px e scroll horizontal; mobile 1 por tela.
12. **Motion com propósito:** entrada de card 150ms fade; mover = spring `stiffness 400 / damping 32` (mesmo do pill de tabs); nada infinito; `useReducedMotion` em todo ponto.

---

## 5. CONTRATO DE FUNCIONALIDADES PRESERVADAS (checar no CP11)
Criar tarefa (com e sem contato) · concluir/reabrir · apagar (com undo) · editar título/descrição/prioridade/prazo · buscar por título · ver Atrasadas/Hoje/Próximas/Concluídas 7d · KPIs · criar alarme (ex-lembrete) por contato · listar alarmes pendentes do contato · dispensar alarme (= concluir) · aviso na hora do alarme via `notifications` · aba do chat com badge de abertas · "Pendências" em Notas continua acessível (via link) · atalhos `Alt+K` e `Alt+P` · modo Zen no inbox · responsivo · permissões (usuário só vê o seu) · painel de detalhes do contato inalterado · `?view=pipeline` continua abrindo algo útil (o Quadro).
Não preservado, por decisão: deals de venda na UI (G-2), filtro "de outros" (regra 7), campo "Responsável" (regra 7).

---

## 6. DECISÕES DE NEGÓCIO QUE PRECISAM DE `APROVADO` ANTES DA FASE 1
| # | Decisão | Recomendação | Custo/risco se errar |
|---|---|---|---|
| **G-1** | Migrar lembretes existentes para tarefas (INSERT SELECT) ou começar do zero? | **Migrar.** Contar antes (etapa 8). Se < 50 linhas, risco zero. | Sem migrar, usuários perdem alarmes marcados. |
| **G-2** | Desligar a UI de deals (Pipeline de Vendas) e manter tabelas? | **Sim.** Produção tem 0 deals. Tabelas ficam; UI some na etapa 147. | Se houver deal escondido em outra org/cliente, reverter é um `git revert`. |
| **G-3** | Manter dois itens na sidebar ("Tarefas" e "Quadro") ou um só? | **Dois por 30 dias**, mesmo módulo, modos diferentes; depois avaliar uso e unificar. Atalhos `Alt+K`/`Alt+P` continuam. | Um só agora quebra hábito e bookmark. |
| **G-4** | Tarefas legadas sem `created_by` e sem `assigned_to` (órfãs): apagar, atribuir ao admin ou manter invisíveis? | **Atribuir ao perfil Admin 01** e logar IDs no ledger. Contar antes (etapa 8). | Invisíveis = "sumiu tarefa"; apagar = perda. |
| **G-5** | Parser de linguagem natural na captura ("amanhã 10h @regianne")? | **Não na v1.** Chips resolvem 90%. | Erro silencioso de data em pt-BR gera alarme errado. |
| **G-6** | WIP de Fazendo = 3 (hard) e Aguardando = 5 (soft)? | **Sim**, valores da literatura para indivíduo. Ajustável em `WIP_LIMITS` sem migration. | Alto demais = quadro vira lista. |
| **G-7** | Push do navegador para alarmes? | **Só se o mecanismo existente funcionar** (etapa 104 testa). Senão, toast + central + badge. | Prometer push que não chega destrói confiança no alarme. |
| **G-8** | Tarefas concluídas: mostrar 7 dias e arquivar visualmente? | **Sim** (7 dias; "ver mais" carrega 30). Nunca apagar. | Concluídas infinitas no Quadro travam a coluna. |

---

## 7. SESSÕES DE EXECUÇÃO (Claude Code, `claude -p`)
- **Sessão A — Fases 0 a 3** (banco, dados, componentes base). Termina com a PR de migration **aberta e aguardando APROVADO**; front da Fase 2-3 depende dos tipos regenerados, então A pausa no CP1 até o merge da migration.
- **Sessão B — Fases 4 a 8** (Lista, Quadro, Agenda, avisos, chat, navegação).
- **Sessão C — Fases 9 a 11** (métricas, QA, cutover, remoção do legado).
Cada sessão começa lendo o ledger e o plano; nunca refaz etapa marcada `[x]` com evidência.

---

## 8. O PLANO — 150 ETAPAS · 12 FASES · 12 CHECKPOINTS

Formato: `[ ] N. Ação — arquivo — DoD`. Marque `[x]` **só** com evidência no ledger.

### FASE 0 — Preparação, diagnóstico e desbloqueios (etapas 1–12) → CP0

- [ ] **1.** `ls /workspace/repos | grep -i zapp`; usar o diretório com `"name": "zapp-web-v2"` em `package.json`. — DoD: caminho absoluto no ledger.
- [ ] **2.** `git fetch --all && git checkout main && git pull && git rev-parse HEAD` (≥ `577a213a`). — DoD: SHA no ledger.
- [ ] **3.** Se existir `graphify-out/GRAPH_REPORT.md`, conferir frescura (commit = HEAD; senão `graphify update . --force`) e rodar `graphify explain "useMyTasks"`, `graphify explain "SalesPipelineView"`, `graphify path "TasksTab" "conversation_tasks"`. — DoD: mapa da seção 1.2 confirmado ou divergência anotada.
- [ ] **4.** Listar PRs abertas (`gh` não está logado no container — usar a API com o token de `/workspace/.git-credentials`). Se alguma tocar `src/components/tasks`, `src/components/pipeline`, `src/components/inbox/tabs`, `src/hooks/tasks`, `src/hooks/chat/useReminders.ts` ou migrations de tasks/reminders → **parar e avisar Joaquim**. — DoD: lista no ledger.
- [ ] **5.** Criar `docs/design/TAREFAS_QUADRO_STATUS.md` do Apêndice F. Branch `claude/chore-tarefas-f0-ledger-<carimbo>`; commit `chore(tarefas): ledger do plano de fusão`. PR e merge (só doc). — DoD: SHA do merge.
- [ ] **6.** Baseline técnico: `npm ci`, `npm run typecheck`, `node scripts/ci/lint-ratchet.mjs`, `node scripts/ci/typecheck-ratchet.mjs`, `npm run implicit-any-check`, `npx vitest run src/components/inbox/tabs src/hooks` (tudo verde antes de mexer). — DoD: 6 saídas resumidas no ledger.
- [ ] **7.** **Desbloquear login de QA:** `POST /functions/v1/auth-login` devolve 401 para `ZAPP_QA_EMAIL` (28/09). Diagnosticar via Supabase Admin (`auth.users` do usuário `qa.visual@promobrindes.com.br`: existe? banido? senha rotacionada?). Se precisar redefinir senha ou recriar usuário → **pedir APROVADO** (escrita em auth de produção). Atualizar `/workspace/.secrets/zapp-v2.env`. — DoD: `node /workspace/qa/probe3.mjs` chega em `?view=inbox` logado.
- [ ] **8.** Inventário de dados em produção (somente leitura, via MCP `MCP - SUPABASE / LOVABLE CLOUD - ZAPP WEB V2` ou `SUPABASE - ZAPP WEB V2 - MCP`): `SELECT count(*), status FROM conversation_tasks GROUP BY 2`; `SELECT count(*) FROM conversation_tasks WHERE created_by IS NULL AND assigned_to IS NULL` (órfãs, G-4); `SELECT count(*), is_dismissed FROM reminders GROUP BY 2`; `SELECT count(*) FROM sales_deals`; `SELECT DISTINCT priority FROM conversation_tasks`. — DoD: números no ledger (são a base das decisões G-1/G-2/G-4).
- [ ] **9.** Verificar o cron do aviso: `SELECT jobname, schedule, command FROM cron.job` → existe algo chamando `notify_due_reminders`? Registrar. Testar a função manualmente numa transação com rollback (`BEGIN; SELECT notify_due_reminders(); ROLLBACK;`) só para confirmar que compila. — DoD: L4 confirmada ou descartada no ledger.
- [ ] **10.** Descobrir funções auxiliares já existentes no banco: `\df public.current_profile_id`, `\df public.get_conversation_tab_counts`; `grep -rn "auth.uid()" supabase/migrations | grep profiles | head` para copiar o padrão de RLS por perfil. — DoD: nome da função/padrão a reutilizar no Apêndice A.
- [ ] **11.** Instalar QA fora do repo se faltar: `cd /workspace/qa && npx playwright install chromium` (deps já instaladas em 28/09). Rodar `node /workspace/qa/probe3.mjs`. — DoD: login ok (depende da 7).
- [ ] **12.** Screenshots "ANTES" (login válido): `?view=tasks` → `out/tasks-00-before.png`; `?view=pipeline` → `out/pipeline-00-before.png`; inbox com aba Tarefas → `out/chat-tarefas-00-before.png`; aba Lembretes → `out/chat-lembretes-00-before.png`. Viewport 1672×941, tema dark, skin limpo. — DoD: 4 arquivos.

**CP0 — Ambiente pronto.** Gate: 12 etapas com evidência; decisões G-1…G-8 respondidas por Joaquim (registrar a resposta literal no ledger). Sem G-1, G-2 e G-4 respondidas, a Fase 1 **não começa**.

---

### FASE 1 — Banco: migration de fusão (etapas 13–28) → CP1 (PR aberta, aguardando APROVADO)

- [ ] **13.** Branch `claude/feat-tarefas-f1-migration-<carimbo>` a partir de `main`. — DoD: `git branch --show-current`.
- [ ] **14.** Criar `supabase/migrations/<ts>_tasks_unify_reminders_kanban.sql` com o Apêndice A, **na ordem**: (a) `ALTER TABLE conversation_tasks ADD COLUMN IF NOT EXISTS` para `remind_at, notified_at, waiting_reason, position, started_at, status_changed_at`; (b) backfill `status`: `pending→todo`, `completed→done`, `NULL→todo`; (c) backfill `created_by = COALESCE(created_by, assigned_to)`; (d) órfãs conforme G-4; (e) `ALTER COLUMN created_by SET NOT NULL`; (f) `DROP CONSTRAINT IF EXISTS` + `ADD CONSTRAINT conversation_tasks_status_check`; (g) `ADD CONSTRAINT conversation_tasks_waiting_reason_check`; (h) `ALTER COLUMN status SET DEFAULT 'backlog'`; (i) índices; (j) trigger `tasks_status_changed_at` (BEFORE UPDATE, se `NEW.status IS DISTINCT FROM OLD.status` → `status_changed_at = now()`, `started_at = COALESCE(started_at, CASE WHEN NEW.status='doing' THEN now() END)`, `completed_at = CASE WHEN NEW.status='done' THEN COALESCE(completed_at, now()) ELSE NULL END`, `remind_at = CASE WHEN NEW.status IN ('done','cancelled') THEN NULL ELSE remind_at END`); (k) trigger `tasks_assigned_eq_created` (BEFORE INSERT/UPDATE: `NEW.assigned_to := NEW.created_by`). — DoD: arquivo commitado; `node scripts/db-audit/check-migration-drift.mjs` passa.
- [ ] **15.** Na mesma migration: RLS. `DROP POLICY` das 4 policies `USING (true)`; `CREATE POLICY tasks_select_own ON conversation_tasks FOR SELECT TO authenticated USING (created_by = <perfil atual>)`; idem `insert (WITH CHECK)`, `update (USING + WITH CHECK)`, `delete`. Usar o padrão descoberto na etapa 10. — DoD: `EXPLAIN` mental: nenhuma policy sem filtro de dono.
- [ ] **16.** Na mesma migration: migração de `reminders` (G-1). `ALTER TABLE reminders ADD COLUMN IF NOT EXISTS migrated_task_id uuid`; `WITH ins AS (INSERT INTO conversation_tasks (id, title, description, status, priority, remind_at, notified_at, contact_id, created_by, assigned_to, created_at, completed_at) SELECT gen_random_uuid(), r.title, r.description, CASE WHEN r.is_dismissed THEN 'done' ELSE 'todo' END, 'medium', r.remind_at, r.notified_at, r.contact_id, r.profile_id, r.profile_id, r.created_at, CASE WHEN r.is_dismissed THEN r.created_at END FROM reminders r WHERE r.migrated_task_id IS NULL RETURNING id, …) UPDATE reminders SET migrated_task_id = …` (usar `CTE` com `ctid`/chave para o join de volta; se PG não permitir em um só statement, fazer em duas com tabela temporária). Idempotente por `migrated_task_id IS NULL`. — DoD: `SELECT count(*) FROM reminders WHERE migrated_task_id IS NULL` = 0 num banco de teste.
- [ ] **17.** Segunda migration `<ts>_tasks_notify_due_cron.sql`: `CREATE OR REPLACE FUNCTION public.notify_due_tasks() RETURNS integer` (cópia de `notify_due_reminders` trocando tabela/colunas; `metadata` com `task_id`, `contact_id`, `remind_at`; chave idempotente `md5('zapp:task-due:v1:'||id)`); `REVOKE ALL ON FUNCTION … FROM anon, authenticated, public`; `GRANT EXECUTE TO postgres` (mesmo padrão de `20260925203000_revoke_anon_execute_cron_only_functions.sql`). — DoD: arquivo commitado.
- [ ] **18.** Na mesma migration: `SELECT cron.unschedule('reminders-notify-due') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname='reminders-notify-due')` (usar o nome real descoberto na etapa 9, se houver); `SELECT cron.schedule('tasks-notify-due', '* * * * *', $$SELECT public.notify_due_tasks()$$)` protegido por `IF NOT EXISTS` em bloco `DO`. — DoD: idempotente (rodar 2× não duplica job).
- [ ] **19.** Terceira migration `<ts>_tab_counts_tasks_own.sql`: `CREATE OR REPLACE FUNCTION get_conversation_tab_counts(...)` com `tasks_open` filtrado por `created_by = <perfil atual>` e `status NOT IN ('done','cancelled')`; `reminders_pending` fixo em `0` (compat até etapa 148). — DoD: assinatura de retorno inalterada.
- [ ] **20.** Bloco `-- ROLLBACK (manual):` ao fim de cada migration com as instruções inversas (drop columns/constraints/policies restauradas com `USING (true)`, `cron.unschedule`). — DoD: presente.
- [ ] **21.** Teste local das migrations: `supabase db reset` no container **ou** (se não houver stack local) aplicar num branch/projeto de teste via `SUPABASE - GESTÃO DE PRODUTOS` → `create_branch`/`apply_migration`? **Não** — esse MCP é de outro projeto. Usar `supabase_db_transaction` do MCP `SUPABASE - ZAPP WEB V2 - MCP` com `BEGIN … ROLLBACK` contendo a migration inteira para validar sintaxe e contagens (`SELECT count(*) FROM conversation_tasks WHERE status='todo'`) **sem commitar**. — DoD: saída da transação no ledger; nada persistido.
- [ ] **22.** Regenerar tipos: `bunx supabase gen types typescript --project-id tnnnlkbymytvtqngbbqh > src/integrations/supabase/types.ts` (ou o script do workflow `types-sync.yml`) **a partir do banco com a migration aplicada** — como ela ainda não foi aplicada, gerar os tipos **manualmente** nas linhas de `conversation_tasks` (adicionar as 6 colunas em `Row/Insert/Update`) e marcar no ledger "tipos escritos à mão; regenerar após merge". — DoD: `npm run typecheck` = 0.
- [ ] **23.** `src/hooks/tasks/workItem.types.ts`: `WorkItemStatus = 'backlog'|'todo'|'doing'|'waiting'|'done'|'cancelled'`; `Priority = 'low'|'medium'|'high'|'urgent'`; `WorkItem = Tables<'conversation_tasks'> & { contact: {id,name,phone,avatar?}|null }`; `KANBAN_COLUMNS: {status, label, policy, wip?: {limit, hard: boolean}}[]` (seção 2.2); `PRIORITY_ORDER`. — DoD: exportado, sem `any`.
- [ ] **24.** `src/hooks/tasks/workItemMachine.ts` (puro): `canTransition(from, to, ctx: {doingCount, waitingReason?}) → {ok:true} | {ok:false, reason:'wip_full'|'waiting_reason_required'|'same'}`; `applyTransition(item, to, now) → Partial<WorkItem>` (espelha o trigger do banco: `completed_at`, `started_at`, `remind_at=null` em done/cancelled, `status_changed_at`). — DoD: 100% coberto por teste (etapa 26).
- [ ] **25.** `src/hooks/tasks/workItemAggregates.ts` (puro): `bucketByDue(items, now)` → `{overdue, today, upcoming, noDue, done7d}`; `bucketByStatus(items)` → `Record<WorkItemStatus, WorkItem[]>` ordenado por `position, PRIORITY_ORDER, due_date`; `kpis(items, now)` (seção 2.8); `agingDays(item, now)`; `dueLabel(date, now)` ("Hoje", "Amanhã", "Sex 03/10", "Atrasada 2d"). Reaproveitar `date-fns/locale/ptBR`. — DoD: sem `Date` global (recebe `now`).
- [ ] **26.** Testes `src/hooks/tasks/__tests__/workItemMachine.test.ts` (12 casos: WIP cheio, motivo obrigatório, reabrir, cancelar limpa alarme, idempotência) e `workItemAggregates.test.ts` (dataset sintético de 20 itens, `now` fixo, feriado de fim de semana no `dueLabel`). — DoD: `npx vitest run src/hooks/tasks` verde.
- [ ] **27.** Commit `feat(tarefas): fase 1 — migration de fusão (tasks+reminders+kanban), RLS por dono, notify_due_tasks + cron, tipos e máquina de estados`. Push (regra 15). — DoD: CI verde (`DB Guard (offline)` inclusive).
- [ ] **28.** Abrir PR `feat(tarefas): fase 1 — banco` com corpo: contagens da etapa 8, resposta às decisões G-1/G-2/G-4, plano de rollback, e a frase **"AGUARDA APROVADO — DDL/RLS em produção"**. Não mergear. — DoD: URL no ledger.

**CP1 — Banco especificado e testado em rollback.** Gate: PR aberta; transação de teste com contagens; typecheck 0; testes puros verdes. **Sessão A para aqui** até Joaquim mergear. Após o merge: `SELECT count(*), status FROM conversation_tasks GROUP BY 2` e `SELECT jobname FROM cron.job WHERE jobname='tasks-notify-due'` em produção → ledger.

---

### FASE 2 — Camada de dados do front (etapas 29–40) → CP2

- [ ] **29.** Branch `claude/feat-tarefas-f2-dados-<carimbo>` a partir de `main` **com a migration mergeada** (`git log --oneline | grep "fase 1"`). Regenerar `types.ts` de verdade (etapa 22 disse que era à mão). — DoD: diff de `types.ts` só em `conversation_tasks` e `reminders`.
- [ ] **30.** `src/hooks/tasks/useMyWorkItems.ts`: `useMyWorkItems(opts?: {contactId?: string; includeDone?: boolean; includeCancelled?: boolean})`. Query key `['work-items', profileId, opts]`. Select `*, contacts(id,name,phone,avatar_url)` com `.eq('created_by', profileId)` (RLS já garante, o filtro é para o cache), `.neq('status','cancelled')` salvo opção, `.order('position').order('due_date',{nullsFirst:false})`. `enabled: !!profileId`. `staleTime: 30_000`. — DoD: hook tipado, sem `any`.
- [ ] **31.** Realtime: `supabase.channel('work-items:'+profileId).on('postgres_changes', {event:'*', schema:'public', table:'conversation_tasks', filter:'created_by=eq.'+profileId}, () => invalidate())`. Garantir que `conversation_tasks` está na publicação `supabase_realtime` (`SELECT * FROM pg_publication_tables WHERE tablename='conversation_tasks'`); se não estiver → **adicionar à migration da Fase 1 antes do merge** (é DDL; se a Fase 1 já mergeou, nova migration pequena com APROVADO). — DoD: mudar status via SQL reflete na tela em < 2s (evidência: vídeo não; log de `console.debug` no ledger).
- [ ] **32.** Mutations com update otimista + rollback (`onMutate` guarda snapshot; `onError` restaura + `toast.error`): `create({title, contactId?, priority?, dueDate?, remindAt?, description?, status?='backlog'})`, `update(id, patch)`, `move(id, toStatus, toIndex)` (aplica `applyTransition` + reordena `position` dos vizinhos em batch `upsert`), `complete(id)`, `reopen(id)`, `snooze(id, minutes|'tomorrow9')` (`remind_at` novo, `notified_at=null`), `cancel(id)`, `remove(id)`. — DoD: cada mutation com `onSuccess` invalidando `['work-items']` e `['conversation-tab-counts', contactId]`.
- [ ] **33.** Validação antes da mutation: `move` chama `canTransition` e, se `wip_full`, **não** envia e devolve `{blocked:'wip_full'}` para a UI mostrar o aviso; `waiting` sem motivo abre o `Sheet` pedindo motivo (a UI decide; o hook só rejeita). Alarme no passado (`remindAt < now - 1min`) rejeitado com `Error('remind_in_past')`. — DoD: testes na etapa 40.
- [ ] **34.** `useMyTasks.ts` vira `export { useMyWorkItems as useMyTasks }` + `/** @deprecated use useMyWorkItems */` com um adaptador que devolve os campos antigos (`overdue, today, upcoming, completed7d, toggleTask, deleteTask, createTask, isCreating, isLoading`) computados por `bucketByDue`. Assim `TasksView` atual continua funcionando até a Fase 4 sem tocar nele. — DoD: `?view=tasks` no preview idêntico ao "antes" (screenshot `tasks-02-compat.png`).
- [ ] **35.** `useConversationTasks.ts`: mesmo adaptador, chamando `useMyWorkItems({contactId})`. `TasksTab` e `NotesTab` seguem funcionando. — DoD: aba Tarefas do chat idêntica ao antes.
- [ ] **36.** `useReminders.ts`: adaptador sobre `useMyWorkItems({contactId})` filtrando `remind_at IS NOT NULL AND status NOT IN (done,cancelled)`; `create` → `create({title, remindAt, contactId, status:'todo'})`; `dismiss` → `complete`; `remove` → `remove`. `RemindersPanel` continua funcionando **lendo da tabela nova**. — DoD: criar "lembrete" pela aba antiga aparece em `?view=tasks`.
- [ ] **37.** `src/hooks/tasks/useWorkItemNotifications.ts`: dado `notification.metadata.task_id`, expõe `openTask()` (navega para `?view=tasks&task=<id>` e abre o `Sheet`), `openContact()` (`?view=inbox&contact=<id>` — descobrir o parâmetro real por `grep -rn "selectedContactId" src/hooks/inbox`), `snooze(minutes)`, `complete()`, e marca a notificação como lida. — DoD: funções puras testáveis, sem JSX.
- [ ] **38.** Suporte a `?task=<id>`: em `TasksModule` (Fase 4) ler `URLSearchParams` e abrir o `Sheet`; por enquanto só registrar o contrato no `useMyWorkItems` (`selectedId` via `useSearchParams`). — DoD: contrato documentado no arquivo.
- [ ] **39.** Realtime do badge da sidebar: `useMyWorkItemsBadge()` = `overdue.length + itens com remind_at <= now && notified_at != null && status not done` (leve, `select('id,due_date,remind_at,notified_at,status')`). — DoD: hook exportado.
- [ ] **40.** Testes `src/hooks/tasks/__tests__/useMyWorkItems.test.tsx` com `@tanstack/react-query` + mock de `supabase` (padrão de outros testes do repo — copiar de `src/hooks/__tests__/useNotifications.test.tsx`): create/complete/move com WIP cheio/rollback em erro. Commit `feat(tarefas): fase 2 — useMyWorkItems, adaptadores de compatibilidade, notificações`. Push, PR, CI verde, **merge autorizado** (só front, sem mudança visual). — DoD: `npx vitest run src/hooks/tasks` verde; SHA do merge.

**CP2 — Dados unificados sem mudança visual.** Gate: 3 telas antigas iguais ao "antes" (screenshots `*-02-compat.png` comparados por olho — sem pixelmatch aqui); realtime confirmado; criar lembrete na aba antiga aparece na tela Tarefas.

---

### FASE 3 — Componentes base do módulo (etapas 41–56) → CP3

- [ ] **41.** Branch `claude/feat-tarefas-f3-componentes-<carimbo>`. Ler `src/components/contacts/ContactKpiCard.tsx`, `ContactViewSwitcher.tsx` e `contactTypeConfig.tsx` do redesign navy para copiar tokens e o padrão de pill com `layoutId`. — DoD: anotação no ledger dos tokens reaproveitados.
- [ ] **42.** `PriorityChip.tsx`: `low` `bg-muted text-muted-foreground`, `medium` `bg-primary/15 text-primary-glow`, `high` `bg-warning/15 text-warning`, `urgent` `bg-destructive/15 text-destructive`; `h-5 px-2 rounded-full text-[12px] font-medium`; `aria-label="Prioridade alta"`. Rótulos pt-BR: Baixa/Média/Alta/Urgente. — DoD: contraste ≥ 4.5:1 nos 4 (E.3).
- [ ] **43.** `DueChip.tsx`: `Calendar` 14px + `dueLabel()`; atrasada → `text-destructive` + ícone `AlertCircle`; hoje → `text-warning`; sem prazo → não renderiza. `title` com a data completa. — DoD: 4 estados.
- [ ] **44.** `RemindChip.tsx`: `Bell` 14px + hora ("Qui 09:00"); vencido e não concluído → `BellRing text-destructive`; clique abre popover de adiar (15 min · 1 h · Amanhã 9h · Remover). — DoD: popover funciona.
- [ ] **45.** `ContactChip.tsx`: avatar 18px (`getAvatarColor` + iniciais ou `avatar_url`) + nome truncado; clique → `openContact` (hook da etapa 37); `stopPropagation` para não pegar o card. — DoD: abre o chat do contato.
- [ ] **46.** `AgingDot.tsx`: `agingDays ≥ 3` → dot 6px âmbar + "3d"; `≥ 7` → vermelho; `< 3` → nada. Só em `doing` e `waiting`. — DoD: 3 estados.
- [ ] **47.** `WorkItemCard.tsx` (seção 2.5): props `{item, mode, dragHandleProps?, isDragging?, onToggleDone, onOpen, onMoveTo?}`; layout `flex flex-col gap-1.5 p-3 rounded-[14px] border border-border/70 bg-card` + borda esquerda de prioridade (`border-l-[3px]`); linha 1 = checkbox (`mode==='list'`) ou pega (`GripVertical`, `mode==='board'`) + título + `PriorityChip` + kebab; linha 2 = `ContactChip` (se houver); linha 3 = `DueChip` `RemindChip` `AgingDot`; linha 4 = `waiting_reason` (só em `waiting`, `PauseCircle` 14px, `text-muted-foreground italic`); `done` → `opacity-60 line-through`. `role="article"`, `aria-label`. `data-testid="work-item-card"`, `data-status`, `data-id`. — DoD: renderiza os 6 status sem quebrar altura (`min-h-[72px]`).
- [ ] **48.** Kebab do card (`DropdownMenu`): Abrir · Mover para… (submenu com as 5 colunas, desabilitando a atual e `doing` cheio) · Lembrar-me (popover) · Cancelar · Apagar (com `undoToast` 6s). — DoD: todas as ações ligadas às mutations.
- [ ] **49.** `QuickAdd.tsx` (seção 2.4): `Input h-11 rounded-xl bg-input` com placeholder "Adicionar tarefa… (Enter para criar)"; chips à direita (`Hoje`, `Amanhã`, `Próx. semana`, `Data` → `Popover` com `Calendar` do shadcn, `Lembrar` → `Popover` com data+hora, `@` → `ContactPicker` reaproveitando o de `TasksView` ("Buscar contato (min. 2 letras)"), `!` → ciclo de prioridade). Estado local; `Enter` → `create()`; `Esc` limpa. Contato fixo via prop `contactId` (chat) esconde o chip `@`. — DoD: criar com só título leva < 1s e cai em "Caixa de entrada".
- [ ] **50.** `WorkItemSheet.tsx`: `Sheet side="right"` 420px; campos: título (`Input`), estado (`Select` com as 5 colunas — `doing` desabilitado se WIP cheio com texto "Fazendo está cheio (3/3)"), prioridade, contato, prazo, alarme, motivo de espera (aparece só quando estado = Aguardando; obrigatório), descrição (`Textarea` autosize), rodapé com "Concluir" / "Cancelar tarefa" / "Apagar". Salva por campo (`onBlur`) com `update()`. `Esc` fecha. — DoD: cada campo persiste.
- [ ] **51.** `ModeSwitcher.tsx`: segmentado `Lista | Quadro | Agenda` com `layoutId="tasks-mode-pill"` (spring 400/32), ícones `List`/`Kanban`/`CalendarDays` 18px, `data-testid="tasks-mode"`. Persistir modo em `localStorage['tasks-mode']`; `?view=pipeline` força `board` na primeira carga. — DoD: pill anima; reduced-motion sem animação.
- [ ] **52.** `TasksEmptyState.tsx`: variantes `all` ("Nada por aqui. Adicione a primeira tarefa acima." + atalho `N`), `filter` ("Nenhuma tarefa com esse filtro" + "Limpar"), `column` (texto da política da coluna em `text-muted-foreground/70`, sem ícone). — DoD: 3 variantes.
- [ ] **53.** `BoardColumn.tsx`: cabeçalho `sticky top-0 bg-background/95 backdrop-blur` com nome, contador `n` ou `n/limite` (`tabular-nums`), ícone `Info` com `Tooltip` = política; `Droppable droppableId={status}`; estado `isDraggingOver` → `bg-primary/5 ring-1 ring-primary/30`; WIP cheio (hard) → `ring-destructive/40` + texto "Limite atingido" e `isDropDisabled`; soft → `ring-warning/40`. Corpo `flex flex-col gap-2 p-2 min-h-[120px] overflow-y-auto`. — DoD: 4 estados visuais.
- [ ] **54.** `MoveToMenu.tsx`: botão `ArrowRightLeft` 16px no card (visível sempre em mobile, no hover em desktop) abrindo as 5 opções. — DoD: move sem DnD.
- [ ] **55.** Skeletons: `WorkItemCardSkeleton` (h-[72px], `animate-shimmer`) e `BoardColumnSkeleton` (3 cards). — DoD: sem CLS ao carregar.
- [ ] **56.** Testes de componente `src/components/tasks/__tests__/WorkItemCard.test.tsx`, `QuickAdd.test.tsx` (Enter cria; chips preenchem; alarme no passado mostra erro inline), `PriorityChip.test.tsx`. Commit `feat(tarefas): fase 3 — componentes base (card, quick add, sheet, colunas)`. Push, PR, CI verde, **merge** (componentes ainda não usados = sem mudança visual). — DoD: vitest verde; SHA.

**CP3 — Kit de componentes.** Gate: testes verdes; Storybook não existe — evidência = screenshot de uma página de teste temporária **não commitada** (`/workspace/qa/out/03-components.png`) renderizando os 6 status do card, ou os testes de componente com snapshot.

---

### FASE 4 — Tela Tarefas: shell, captura rápida, KPIs, modo Lista (etapas 57–72) → CP4

- [ ] **57.** Branch `claude/feat-tarefas-f4-lista-<carimbo>`. Criar `TasksModule.tsx` com `PageHeader variant="plain"` (prop existente do redesign), `title="Tarefas"`, `subtitle` = "{n} abertas · {m} para hoje" (números reais, `toLocaleString('pt-BR')`), `breadcrumbs=[Início, Tarefas]`, `actions={<ModeSwitcher/>}`. — DoD: header renderiza.
- [ ] **58.** `TasksModule` lê `defaultMode` da rota (`'list'` para `tasks`, `'board'` para `pipeline`) e `?task=<id>` (abre `Sheet`). Modo persistido em `localStorage['tasks-mode']` só quando o usuário troca (não pela rota). — DoD: `?view=pipeline` abre em Quadro; `?view=tasks` abre no último modo escolhido ou Lista.
- [ ] **59.** Faixa de KPIs (seção 2.8): 5 cards `h-[88px]` no padrão visual do `ContactKpiCard` (tile 44px, valor 26/700 tabular, label 13/500), grid `grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3`. Cores: Atrasadas `kpi-yellow` (âmbar) ou `destructive/15` se > 0; Para hoje `kpi-blue`; Fazendo `kpi-purple` com "n/3"; Concluídas 7d `kpi-green`; Tempo médio `kpi-blue`. Clique em Atrasadas/Para hoje aplica o filtro. — DoD: valores = `kpis()`.
- [ ] **60.** `QuickAdd` abaixo dos KPIs, largura total, com `ref` exposta para os atalhos. — DoD: `N` fora de input foca; `Alt+K` idem (já existe).
- [ ] **61.** Barra de filtros (linha única, `h-11`, mesma receita da toolbar de Contatos): busca por título (`debounce 200ms`), `Select` prioridade (Todas/Urgente/Alta/Média/Baixa), `Select` contato (com busca), toggle "Com alarme", toggle "Mostrar concluídas", botão "Limpar" (só com filtro ativo). Estado em `useReducer`; **não** vai para URL (evita poluir `?view=`). — DoD: filtros combinam (AND).
- [ ] **62.** `TasksListMode.tsx`: seções colapsáveis (`Collapsible`) na ordem **Atrasadas** (`destructive`, aberta), **Hoje** (aberta), **Próximas** (aberta; agrupa por dia: "Amanhã", "Qua 01/10", "Semana que vem"), **Sem prazo** (colapsada se > 10), **Concluídas (7 dias)** (colapsada). Cabeçalho de seção = título + contador + chevron. Cards `WorkItemCard mode="list"`. — DoD: 5 seções.
- [ ] **63.** Checkbox do card na Lista: marcar → `complete()` com animação de 200ms (`opacity`+`height`) e toast "Concluída · Desfazer" (`undoToast` → `reopen`). — DoD: undo devolve o item para a seção certa.
- [ ] **64.** Reordenação na Lista: **não** há DnD na Lista (ordem é por prazo/prioridade). Documentar no tooltip do cabeçalho "Ordenado por prazo, depois prioridade". — DoD: sem `Draggable` na Lista.
- [ ] **65.** Clique no título/corpo do card → `WorkItemSheet` (`?task=<id>` na URL para deep-link; `history.replaceState`). — DoD: F5 com `?task=` reabre.
- [ ] **66.** Estado vazio: sem tarefas → `TasksEmptyState variant="all"`; com filtro → `variant="filter"`. — DoD: 2 variantes visíveis.
- [ ] **67.** Skeleton da Lista: 3 seções × 2 `WorkItemCardSkeleton` enquanto `isLoading`. — DoD: sem CLS.
- [ ] **68.** Tratamento de erro: `isError` → bloco `bg-destructive/10 border-destructive/30` com "Não foi possível carregar suas tarefas" + "Tentar novamente" (`refetch`). — DoD: simular com rede offline no Playwright.
- [ ] **69.** Remover do `TasksView.tsx` antigo: nada ainda — ele **deixa de ser importado** pelo `ViewRouter` na etapa 70; arquivo apagado na etapa 147. — DoD: nenhuma edição em `TasksView.tsx`.
- [ ] **70.** `ViewRouter.tsx`: `'tasks': (props) => <Views.TasksModule defaultMode="list" />`. Manter `'pipeline'` apontando para `SalesPipelineView` **até a Fase 5**. — DoD: `?view=tasks` = módulo novo; `?view=pipeline` = antigo.
- [ ] **71.** Testes `src/components/tasks/__tests__/TasksListMode.test.tsx` (seções, checkbox+undo, filtro) e `TasksModule.test.tsx` (defaultMode, `?task=`). — DoD: vitest verde.
- [ ] **72.** Commit `feat(tarefas): fase 4 — módulo Tarefas: KPIs, captura rápida, filtros, modo Lista`. Push, PR, CI verde, preview READY. Screenshot `tasks-04-after.png`. **Merge autorizado** (a tela antiga de Tarefas mostrava tarefas de todos; a nova mostra só as suas — avisar Joaquim no corpo da PR que isso é a decisão da regra 7, não bug). — DoD: SHA + screenshot.

**CP4 — Lista no ar.** Gate: E.2-tasks → `quickAdd=44±2`, `kpiCard=88±4`, 5 KPIs, seções presentes; criar/concluir/desfazer/editar funcionam em produção com o usuário de QA; `scrollWidth ≤ innerWidth`.

---

### FASE 5 — Quadro Kanban (`?view=pipeline` → Quadro) (etapas 73–92) → CP5

- [ ] **73.** Branch `claude/feat-tarefas-f5-quadro-<carimbo>`. Ler `src/components/contacts/ContactKanbanView.tsx` para copiar o uso de `@hello-pangea/dnd` já validado no repo (`DragDropContext`, `Droppable`, `Draggable`, `onDragEnd`). — DoD: padrão anotado.
- [ ] **74.** `TasksBoardMode.tsx`: `DragDropContext onDragEnd={handleDragEnd}`; `div.flex.gap-3.h-full.min-h-0.overflow-x-auto.snap-x` com 5 `BoardColumn` (`min-w-[232px] xl:min-w-0 xl:flex-1 snap-start`). Dados = `bucketByStatus(items)`. — DoD: 5 colunas em 1672 sem scroll; scroll em 1280.
- [ ] **75.** `handleDragEnd`: se `!destination` → nada; se mesma coluna → `move(id, status, index)` só reordena; se coluna diferente → `canTransition`; `wip_full` → `toast.warning("Fazendo está cheio (3/3). Conclua ou mova algo antes.")` e o card volta (a lib já faz); `waiting` → abre `Sheet` com foco em "Motivo de espera" e só confirma após preencher (cancelar = volta); senão `move()`. — DoD: 4 caminhos testados.
- [ ] **76.** `BoardColumn` para `doing`: `isDropDisabled={doingCount >= WIP.doing.limit && sourceStatus !== 'doing'}` (calculado em `onDragStart`); cabeçalho "Fazendo 3/3" fica `text-destructive` quando cheio. — DoD: 4º card não solta.
- [ ] **77.** `BoardColumn` para `waiting`: sem `isDropDisabled`; contador > 5 → `text-warning` + tooltip "Acima do recomendado (5). Cobre alguém ou cancele." — DoD: aviso visual.
- [ ] **78.** `BoardColumn` para `done`: mostra só `completed_at ≥ now-7d`; rodapé "Ver mais antigas" carrega 30 dias (`includeDone` + filtro local); ordem por `completed_at desc`. — DoD: paginação local.
- [ ] **79.** Coluna `backlog` ("Caixa de entrada"): `QuickAdd` compacto no topo da própria coluna (só título; sem chips) — cria direto em `backlog`. As outras colunas não têm quick add (evita criar em "Fazendo" e furar WIP). — DoD: campo só na 1ª coluna.
- [ ] **80.** `Draggable` do card: `WorkItemCard mode="board"` com `dragHandleProps` na pega **e** no card inteiro (`{...provided.draggableProps} {...provided.dragHandleProps}` no wrapper) — arrastar por qualquer ponto, exceto botões/chips (`stopPropagation`). `isDragging` → `shadow-glow-primary rotate-[1deg] scale-[1.02]`. — DoD: arrasta por qualquer área; botões não iniciam drag.
- [ ] **81.** Teclado: `@hello-pangea/dnd` já suporta `Space` (pega/solta), setas (move), `Esc` (cancela). Verificar que o `dragHandleProps` está num elemento focável (`tabIndex=0`) e adicionar `aria-roledescription="tarefa arrastável"`. Anúncios: `DragDropContext` prop `dragHandleUsageInstructions` em pt-BR e `screenReaderInstructions`; `onDragUpdate` → mensagem "Movendo para {coluna} (posição {i} de {n})". — DoD: mover só com teclado do início ao fim.
- [ ] **82.** Mobile (< md): `MoveToMenu` sempre visível no card; colunas `snap-x snap-mandatory` com indicador de página (5 dots) abaixo; cabeçalho da coluna com setas ‹ › para pular de coluna. Desabilitar drag em `pointer: coarse` (usar o menu). — DoD: em 390×844 dá para mover sem arrastar.
- [ ] **83.** Ordem dentro da coluna: `position` manual. Ao mover, recalcular `position` dos vizinhos (inteiros 0..n) num `upsert` em lote (`onConflict: 'id'`). Novos itens entram no **topo** da coluna (`position = min - 1`, normalizado no próximo move). — DoD: ordem persiste após F5.
- [ ] **84.** Envelhecimento: `AgingDot` em `doing`/`waiting` usa `status_changed_at`. — DoD: item movido há 4 dias mostra "4d" âmbar.
- [ ] **85.** Cabeçalho do Quadro (dentro de `TasksModule` no modo board): mesmos KPIs e `QuickAdd` da Lista; a barra de filtros vale para o Quadro (filtra os cards, mantém as colunas). — DoD: filtro por prioridade esvazia colunas corretamente (mostra `variant="column"` vazio).
- [ ] **86.** `ViewRouter.tsx`: `'pipeline': () => <Views.TasksModule defaultMode="board" />`. `SalesPipelineView` deixa de ser importado (arquivo fica até a etapa 147). — DoD: `?view=pipeline` = Quadro.
- [ ] **87.** `navigation.service.ts:47`: `label: 'Quadro'`, `description` (se houver) "Suas tarefas em colunas". Ícone `Kanban` mantido. `layout: 'full'` mantido (o Quadro usa a largura). Shortcut `Alt+P` mantido. — DoD: sidebar mostra "Quadro".
- [ ] **88.** `layout: 'full'` da rota `pipeline` vs. `tasks` (sem `full`): o `TasksModule` deve funcionar nos dois. Verificar `ViewContainer`/`AppShell` para o gutter; no modo Quadro usar `-mx-[var(--layout-gutter)] px-4` **só** se necessário para as 5 colunas caberem em 1440. Registrar a decisão. — DoD: 5 colunas visíveis em 1440 pelas duas rotas.
- [ ] **89.** Transição Lista ↔ Quadro ↔ Agenda: `AnimatePresence mode="wait"` fade 120ms; sem refetch (mesma query). — DoD: troca em < 150ms sem spinner.
- [ ] **90.** Estados: `isLoading` → `BoardColumnSkeleton ×5`; `isError` → mesmo bloco da Lista; coluna vazia → política em cinza. — DoD: 3 estados.
- [ ] **91.** Testes `src/components/tasks/__tests__/TasksBoardMode.test.tsx`: render das 5 colunas; `onDragEnd` para `doing` cheio bloqueia; para `waiting` sem motivo abre Sheet; reordenação recalcula `position`. Mock de `@hello-pangea/dnd` como em `ContactKanbanView` (se houver teste lá; senão testar `handleDragEnd` isolado). — DoD: vitest verde.
- [ ] **92.** Commit `feat(tarefas): fase 5 — Quadro Kanban pessoal (5 colunas, WIP, DnD acessível), pipeline vira Quadro`. Push, PR, CI verde, preview READY. Screenshots `board-05-after.png` (1672), `board-05-1280.png`, `board-05-mobile.png`. **Merge autorizado** — avisar no corpo da PR: "Pipeline de Vendas sai da UI (G-2 aprovada em <data>); tabelas intactas". — DoD: SHA + 3 screenshots.

**CP5 — Quadro no ar.** Gate: E.2-board → `columns=5`, `columnMinW≥232`, `doing header "n/3"`, `card≥72`; mover com mouse e com teclado em produção (usuário QA) e o banco reflete (`SELECT status, position FROM conversation_tasks WHERE id=…`); `scrollWidth ≤ innerWidth` em 1672 e 390.

---

### FASE 6 — Agenda (semana) (etapas 93–100) → CP6

- [ ] **93.** Branch `claude/feat-tarefas-f6-agenda-<carimbo>`. `TasksAgendaMode.tsx`: faixa horizontal de 7 dias (hoje → +6) como botões `h-16 rounded-xl` com dia da semana (12/600), número (18/700), ponto colorido = tem prazo (primary) / tem alarme (warning) / atrasada (destructive); dia selecionado `bg-accent border-primary/70`. Setas ‹ › mudam a semana; botão "Hoje". — DoD: navega entre semanas.
- [ ] **94.** Abaixo da faixa: lista do dia selecionado em 3 grupos — **Alarmes** (por `remind_at`, ordem cronológica, hora à esquerda `w-14 tabular-nums`), **Prazos** (por `due_date`), **Sem hora** (prazo no dia sem hora). Cards `mode="agenda"` (linha única compacta `h-11`). — DoD: item com prazo e alarme no mesmo dia aparece 1× em cada grupo com ícone distinto.
- [ ] **95.** Atrasadas: bloco fixo acima da faixa "{n} atrasadas" (`destructive`) expansível — não somem da Agenda por serem de dias passados. — DoD: visível em qualquer semana.
- [ ] **96.** Arrastar na Agenda: **não** (v1). Mover de dia = `DueChip` → popover de data. Documentar. — DoD: sem DnD.
- [ ] **97.** `QuickAdd` na Agenda pré-seleciona o dia escolhido como prazo (chip `Data` já preenchido). — DoD: criar cai no dia certo.
- [ ] **98.** Semana começa na **segunda** (`date-fns` `weekStartsOn: 1`, `ptBR`); fim de semana com fundo `bg-muted/30`. — DoD: ordem seg…dom.
- [ ] **99.** Testes `TasksAgendaMode.test.tsx`: distribuição por dia com `now` fixo; atrasadas sempre visíveis; sábado/domingo marcados. — DoD: verde.
- [ ] **100.** Commit `feat(tarefas): fase 6 — modo Agenda (semana)`. Push, PR, CI, preview, screenshot `agenda-06-after.png`. **Merge autorizado.** — DoD: SHA + screenshot.

**CP6 — Três modos completos.** Gate: `tasks-mode` alterna os 3 sem refetch (Network tab do Playwright: 0 requests a `conversation_tasks` na troca); screenshots dos 3.

---

### FASE 7 — Avisos: cron, toast, central de notificações, badge (etapas 101–112) → CP7

- [ ] **101.** Branch `claude/feat-tarefas-f7-avisos-<carimbo>`. Confirmar em produção (leitura): `SELECT jobname, schedule, active FROM cron.job WHERE jobname='tasks-notify-due'` e `SELECT count(*) FROM notifications WHERE type='reminder_due' AND created_at > now()-interval '1 day'`. — DoD: job ativo; contagem no ledger.
- [ ] **102.** Descobrir o componente que renderiza notificações: `grep -rn "useNotifications()" src/components` (Sidebar e provedores). Localizar a lista/toast. — DoD: arquivo(s) no ledger.
- [ ] **103.** Nesse componente, `case 'reminder_due'`: ícone `BellRing text-warning`, título = `notification.title`, corpo = mensagem, **3 botões** `h-8`: "Abrir" (`openContact` se `metadata.contact_id`, senão `openTask`), "Adiar ▾" (`DropdownMenu`: 15 min · 1 h · Amanhã 9h → `snooze`), "Concluir" (`complete`). Todas marcam como lida. Prop nova com default = comportamento atual para os outros tipos (regra 8). — DoD: 3 ações funcionam a partir da central.
- [ ] **104.** Toast realtime: onde `useNotifications` assina `postgres_changes` em `notifications` (verificar), garantir que `reminder_due` dispara `toast.custom` com as mesmas 3 ações, duração 15s, som **não** (não existe padrão de som no app; não introduzir). — DoD: criar tarefa com alarme para +2 min no usuário QA → toast aparece em ≤ 3 min sem F5 (evidência: `console.debug` timestamp + screenshot `notif-07-toast.png`).
- [ ] **105.** Push do navegador (G-7): ler `PushNotificationToggle.tsx` e o service worker; se houver Edge Function/trigger que envia push por tipo, adicionar `reminder_due`; se não houver mecanismo genérico → **não implementar**, registrar "push: fora da v1 (sem infraestrutura)". — DoD: decisão no ledger com evidência.
- [ ] **106.** Badge da sidebar em "Tarefas": `useMyWorkItemsBadge()`; descobrir como a Sidebar recebe badges (`grep -rn "badge" src/components/layout/SidebarNavItem.tsx src/services/navigation.service.ts`); passar `badge` para o item `tasks` (não para `pipeline`). Cor `bg-destructive` se houver atrasada, senão `bg-warning`. — DoD: badge = atrasadas + alarmes vencidos.
- [ ] **107.** Quando a aba do navegador está em segundo plano: `document.title` prefixado com "(n) " quando `badge > 0` (padrão de e-mail; reverte ao voltar). Verificar se já existe algo assim para o inbox (`grep -rn "document.title" src`); se existir, integrar; se não, criar `useDocumentBadge` mínimo. — DoD: título muda.
- [ ] **108.** `WorkItemSheet` → campo alarme mostra "Avisado em {notified_at}" quando já disparou; "Adiar" reseta `notified_at`. — DoD: estado visível.
- [ ] **109.** Alarme de tarefa concluída/cancelada: o trigger do banco já limpa `remind_at`; no front, `complete()` também limpa no otimista. Teste: concluir antes do horário → nenhuma notificação criada (verificar `notifications` após o horário). — DoD: 0 linhas.
- [ ] **110.** Idempotência: alarme já notificado não notifica de novo (chave `md5`); adiar gera nova notificação. Teste em produção com o usuário QA. — DoD: contagem 1 → adiar → 2.
- [ ] **111.** Testes `useWorkItemNotifications.test.ts` (snooze calcula `remind_at`; `tomorrow9` = amanhã 09:00 local; complete marca lida) e do componente de notificação (`reminder_due` mostra 3 botões; outros tipos inalterados). — DoD: verde.
- [ ] **112.** Commit `feat(tarefas): fase 7 — avisos de alarme (toast, central, badge, adiar)`. Push, PR, CI, preview, screenshots `notif-07-center.png`, `notif-07-toast.png`. **Merge autorizado.** — DoD: SHA + screenshots.

**CP7 — Alarme funciona de ponta a ponta em produção.** Gate: tarefa criada com alarme +2 min → notificação no banco → toast → "Adiar 15 min" → nova notificação após 15 min → "Concluir" → item em `done`. Tudo com timestamps no ledger.

---

### FASE 8 — Chat: fusão das abas Tarefas + Lembretes, Notas, painel do contato (etapas 113–124) → CP8

- [ ] **113.** Branch `claude/feat-tarefas-f8-chat-<carimbo>`. **Reescrever** `TasksTab.tsx`: `useMyWorkItems({contactId})`; `QuickAdd contactId={contactId}` no topo (chip `@` oculto, chip `Lembrar` em destaque); sem filtro "minhas/de outros"; 3 seções (Abertas por status — mini-quadro vertical: Fazendo, A fazer, Aguardando, Caixa de entrada — depois Alarmes próximos, depois Concluídas 7d); cards `mode="list"`. Link "Ver todas no Quadro" → `?view=pipeline`. — DoD: aba funciona com o contato.
- [ ] **114.** `ConversationTabs.tsx`: remover `{ id: 'reminders', … }` de `TABS`; tipo `ConversationTab` sem `'reminders'`; badge da aba `tasks` = `c.tasksOpen` (já filtrado por dono na RPC). — DoD: 8 abas; typecheck 0 (corrigir `Crm360Tab.tsx` que importa o tipo se referenciar `'reminders'`).
- [ ] **115.** `ConversationTabContent.tsx`: remover bloco `activeTab === 'reminders'` e o `lazy(RemindersTab)`. — DoD: sem import morto.
- [ ] **116.** Redirecionamento: se `localStorage` ou URL tiver aba `reminders` salva (verificar se a aba ativa é persistida — `grep -rn "activeTab" src/components/inbox/RealtimeInboxView.tsx`), mapear `'reminders' → 'tasks'`. — DoD: usuário que estava em Lembretes cai em Tarefas.
- [ ] **117.** `NotesTab.tsx` seção "Pendências": trocar a lista duplicada por um resumo "{n} tarefas abertas com este contato" + botão "Ver na aba Tarefas" (`onTabChange('tasks')`) + `QuickAdd` compacto (mantém a conveniência de criar dali). Remover `useConversationTasks` do arquivo. — DoD: sem lista duplicada; criar dali funciona.
- [ ] **118.** `ChatPanelHeader` / ações rápidas do contato: se existir botão "Lembrete"/`Bell` (`grep -rn "Lembrete\|BellPlus" src/components/inbox/chat src/components/inbox/contact-details`), passa a abrir o `QuickAdd` da aba Tarefas com o chip `Lembrar` já aberto. — DoD: atalho preservado ou inexistente (registrar).
- [ ] **119.** Painel Detalhes do Contato: se houver seção de lembretes/tarefas (`grep -rn "reminder\|task" src/components/inbox/contact-details -il`), unificar para "Tarefas ({n})" com os 3 próximos itens e link para a aba. — DoD: sem menção a "Lembrete" no painel.
- [ ] **120.** `RemindersPanel.tsx` e `RemindersTab.tsx`: não importados por ninguém (`git grep RemindersPanel src` = só os próprios). Ficam até a 147. — DoD: 0 importadores.
- [ ] **121.** Contagem da aba: `useConversationTabCounts` continua chamando a RPC; `tasksOpen` agora é "minhas abertas" (etapa 19). Verificar que o badge bate com a lista (mesmo critério `status NOT IN (done,cancelled)`). — DoD: badge == itens listados.
- [ ] **122.** Atalho no chat: `Ctrl+Shift+T` (verificar conflito em `useKeyboardShortcuts`) abre a aba Tarefas com foco no `QuickAdd`. Se conflitar, `Alt+T`. — DoD: registrado sem conflito.
- [ ] **123.** Testes: atualizar/criar `src/components/inbox/chat/__tests__/ConversationTabs.test.tsx` (8 abas, badge de tasks), `TasksTab.test.tsx` (quick add com contato fixo; seções). Rodar `npx vitest run src/components/inbox`. — DoD: verde (corrigir testes que citavam "Lembretes").
- [ ] **124.** Commit `feat(tarefas): fase 8 — chat: aba Tarefas absorve Lembretes, Notas sem duplicação`. Push, PR, CI, preview, screenshots `chat-08-tarefas.png`, `chat-08-notas.png`. **Merge autorizado.** — DoD: SHA + screenshots.

**CP8 — Chat com uma aba só.** Gate: 8 abas; criar alarme pela aba Tarefas do chat aparece na Agenda e dispara (CP7); badge correto; nenhum texto "Lembrete(s)" em `src/components/inbox` exceto no botão "Lembrar-me" (`git grep -n "Lembrete" src/components/inbox` = só ocorrências aprovadas).

---

### FASE 9 — Atalhos, acessibilidade, mobile, Zen, polimento (etapas 125–134) → CP9

- [ ] **125.** Branch `claude/feat-tarefas-f9-a11y-<carimbo>`. Registrar em `useKeyboardShortcuts` (escopo: `?view=tasks|pipeline`, ignorando inputs): `N` foca `QuickAdd`; `1/2/3` = Lista/Quadro/Agenda; `E` abre `Sheet` do card focado; `X` conclui o focado; `Delete` apaga com undo; `/` foca busca; `?` abre painel de atalhos (se existir no app — `grep -rn "ShortcutsDialog\|atalhos" src/components`). — DoD: tabela de atalhos no ledger; sem conflito com `Alt+K/P`, `Ctrl+N` (Contatos) e `Esc`.
- [ ] **126.** Navegação por teclado no card: `tabIndex=0`, `Enter` abre, `Space` (no Quadro) pega para arrastar; foco visível `ring-2 ring-ring ring-offset-2 ring-offset-background`. — DoD: percorrer 10 cards só com Tab.
- [ ] **127.** `aria-live="polite"` global no `TasksModule` para anunciar: "Tarefa criada", "Concluída", "Movida para {coluna}", "Desfeito". — DoD: NVDA/VoiceOver não é testável no container — evidência = `getAttribute('aria-live')` e texto injetado (E.5).
- [ ] **128.** Contraste: rodar E.3 nos 4 `PriorityChip`, `DueChip` atrasado, cabeçalho "Fazendo 3/3" vermelho, política cinza da coluna vazia. Ajustar tokens até ≥ 4.5:1 (texto) e ≥ 3:1 (ícones). — DoD: tabela no ledger.
- [ ] **129.** `prefers-reduced-motion`: `useReducedMotion()` em `ModeSwitcher`, animação de concluir, entrada de cards, spring do DnD (`@hello-pangea/dnd` respeita via CSS `transition: none` — adicionar regra em `utilities.css` sob `@media (prefers-reduced-motion: reduce)` para `[data-rbd-draggable-id]`). — DoD: E.2 com `emulateMedia({reducedMotion:'reduce'})` → todas as `transitionDuration` = `0s`.
- [ ] **130.** Mobile 390×844: Lista = 1 coluna, KPIs 2 por linha, `QuickAdd` chips viram menu `⋯`; Quadro = snap por coluna + `MoveToMenu`; Agenda = faixa de dias com scroll horizontal. `Sheet` vira `bottom` (`side="bottom"`, 90vh). — DoD: `scrollWidth ≤ innerWidth` nos 3 modos.
- [ ] **131.** Modo Zen (`?view=inbox`): a aba Tarefas do chat respeita `isZen` (sem mudanças; só verificar que o `QuickAdd` não estoura a largura do painel do chat em Zen). — DoD: screenshot `zen-09.png`.
- [ ] **132.** Tema claro: `localStorage.theme='light'` → os 3 modos legíveis; chips e bordas de prioridade com contraste. Screenshot `light-09-{list,board,agenda}.png`. — DoD: 3 screenshots sem regressão.
- [ ] **133.** Performance: `React.memo` em `WorkItemCard`; `useMemo` em `bucketByStatus`/`bucketByDue`; virtualização **não** (v1; até ~500 itens é fluido). Medir com 300 itens sintéticos no usuário QA (script E.6 cria e apaga). `npm run build` → chunk do módulo ≤ 45 KB gzip (registrar número). — DoD: número no ledger; sem jank perceptível ao arrastar (Playwright `page.metrics()` antes/depois).
- [ ] **134.** Commit `feat(tarefas): fase 9 — atalhos, acessibilidade, mobile, reduced-motion, tema claro`. Push, PR, CI, preview, screenshots. **Merge autorizado.** — DoD: SHA.

**CP9 — Acessível e responsivo.** Gate: atalhos funcionam; reduced-motion 0s; contraste ok; mobile sem overflow; tema claro ok.

---

### FASE 10 — QA técnico, funcional e visual (etapas 135–142) → CP10

- [ ] **135.** Gates técnicos completos em `main` atualizado: `npm run typecheck` (0) · `node scripts/ci/lint-ratchet.mjs` · `node scripts/ci/typecheck-ratchet.mjs` · `npm run implicit-any-check` · `npm run lint` · `npx vitest run` (suite inteira) · `npm run build` · `node scripts/ci/bundle-budget.mjs` (se existir). — DoD: 8 saídas com exit 0.
- [ ] **136.** E.5 funcional (Playwright, usuário QA, produção): 24 checks — criar por `QuickAdd`; criar com `Hoje`; criar com `Lembrar` +2min; criar do chat com contato; concluir + desfazer; editar no `Sheet` (título, prioridade, prazo); mover para Fazendo ×3 e bloquear a 4ª; mover para Aguardando exige motivo; mover com teclado; reordenar na coluna e persistir após F5; filtro prioridade; busca; `?task=` deep-link; trocar 3 modos sem request; Agenda navega semana; badge da sidebar; toast do alarme; adiar 15 min; central de notificações → Abrir; cancelar (some da Lista, aparece com filtro); apagar + undo; mobile mover pelo menu; console sem `error`. — DoD: JSON `{ok:[24], fail:[]}` no ledger.
- [ ] **137.** E.2 geometria (1672×941): `quickAdd 44±2 · kpiCard 88±4 · modeSwitcher 44±2 · card ≥72 · columns 5 · columnGap 12±2 · boardHeader sticky · agendaDay 64±2 · sheet 420±4`. — DoD: tabela OK/FAIL.
- [ ] **138.** E.3 cores: fundo, card, chips de prioridade, coluna cheia, coluna vazia, chip atrasado — ΔE ≤ 8 dos tokens navy (fundos ≤ 6). — DoD: tabela.
- [ ] **139.** Isolamento (segurança): com **dois** usuários (QA + um segundo usuário de teste criado com APROVADO, ou o próprio Admin 01 do Joaquim numa sessão dele): tarefa criada por A **não** aparece para B em Lista/Quadro/chat; `PATCH` direto via REST com o JWT de B no id de A → 0 linhas afetadas (RLS). — DoD: 2 evidências (screenshot + resposta HTTP).
- [ ] **140.** Dados migrados: `SELECT count(*) FROM reminders WHERE migrated_task_id IS NULL` = 0; amostra de 5 lembretes antigos → abrir cada um na Agenda/Lista do dono. — DoD: 5 IDs conferidos.
- [ ] **141.** Regressão do contrato (seção 5): checklist item a item, com "como verifiquei" ao lado. — DoD: 20 itens marcados.
- [ ] **142.** Registrar resíduos honestos: o que ficou (ex.: push, parser, virtualização, Agenda sem DnD, coluna personalizável). — DoD: seção "Pendências/resíduos" do ledger preenchida.

**CP10 — QA fechado.** Gate: 8 gates técnicos + 24 funcionais + geometria + cores + isolamento + migração, tudo no ledger.

---

### FASE 11 — Cutover final, remoção do legado, verificação de produção (etapas 143–150) → CP11

- [ ] **143.** Branch `claude/chore-tarefas-f11-legado-<carimbo>`. **Pré-condição:** CP5 e CP8 mergeados há ≥ 2 dias úteis sem incidente reportado por Joaquim (registrar datas). — DoD: datas no ledger.
- [ ] **144.** Remover `src/components/pipeline/{SalesPipelineView,DealCard,PipelineKPICards}.tsx` (G-2). `git grep -n "SalesPipelineView\|DealCard\|PipelineKPICards" src` = 0 antes de apagar. — DoD: build verde.
- [ ] **145.** Remover `src/components/tasks/TasksView.tsx` (antigo), `src/components/inbox/RemindersPanel.tsx`, `src/components/inbox/tabs/RemindersTab.tsx`. `git grep` = 0 importadores. — DoD: build verde.
- [ ] **146.** Remover adaptadores deprecados `src/hooks/chat/useReminders.ts`, `useConversationTasks.ts`; `useMyTasks.ts` vira só `export { useMyWorkItems as useMyTasks }` **se** ainda houver importador (`git grep useMyTasks src`), senão remover. — DoD: typecheck 0.
- [ ] **147.** `useConversationTabCounts.ts`: remover `remindersPending` do tipo e do consumo. Nova migration `<ts>_tab_counts_drop_reminders_pending.sql` removendo a coluna do `RETURNS TABLE` (**DDL → PR separada aguardando APROVADO**; o front tolera o campo extra até lá). — DoD: PR aberta.
- [ ] **148.** `docs/COMPLETE_SYSTEM_FEATURES.md` / `FUNCTIONALITIES_INVENTORY.md`: atualizar as linhas de Tarefas/Lembretes/Pipeline (3 linhas, não reescrever o doc). — DoD: diff ≤ 10 linhas.
- [ ] **149.** PR `chore(tarefas): fase 11 — remove legado (pipeline de vendas, painel de lembretes, hooks deprecados)`. Corpo = seção "Entrega" do ledger (resumo, decisões G-1…G-8 com data de aprovação, arquivos, testes, screenshots antes/depois dos 4 pontos de entrada, resíduos). CI verde → **merge autorizado** (só remoção de front já não importado). — DoD: SHA do merge.
- [ ] **150.** Verificar produção: deployment Vercel `READY` `target: production` do SHA; rodar E.1 em `?view=tasks`, `?view=pipeline`, inbox → `12-prod-{tasks,board,chat}.png`; E.3 uma última vez; `SELECT jobname, active FROM cron.job WHERE jobname='tasks-notify-due'`; `SELECT count(*) FROM notifications WHERE type='reminder_due' AND created_at > now()-interval '1 hour'` (≥ 0, sem erro). **Só então** escrever "concluído" no ledger e fechar com os 3 próximos passos para a v2 (delegação, recorrência, colunas personalizáveis). — DoD: 3 screenshots de produção + consultas no ledger.

**CP11 — Entregue.** Gate: legado removido, produção verificada, ledger com as 12 seções preenchidas e "Pendências/resíduos" honesto.

---

## 9. CRITÉRIOS DE ACEITAÇÃO FINAIS
**Produto:** um conceito (Tarefa), três modos (Lista/Quadro/Agenda), um lugar no chat; lembrete = "Lembrar-me"; pipeline = Quadro sem vocabulário de venda; tarefa é só do dono.
**Kanban:** 5 colunas com políticas visíveis; WIP 3 hard em Fazendo, 5 soft em Aguardando; motivo obrigatório em Aguardando; envelhecimento; DnD com mouse, teclado e menu (mobile).
**Avisos:** cron ativo; toast + central + badge; adiar/concluir/abrir; idempotente.
**Dados:** migração de `reminders` completa e rastreável; RLS por dono; zero drop de tabela.
**Técnico:** typecheck 0, ratchets verdes, testes novos (≥ 12 arquivos), build ok, bundle registrado, reduced-motion, tema claro, mobile.
**Honestidade:** ledger com números, SHAs e caminhos; resíduos declarados.

---

## APÊNDICE A — Esqueleto da migration de fusão (ajustar nomes descobertos na etapa 10)
```sql
-- 1) colunas
ALTER TABLE public.conversation_tasks
  ADD COLUMN IF NOT EXISTS remind_at timestamptz,
  ADD COLUMN IF NOT EXISTS notified_at timestamptz,
  ADD COLUMN IF NOT EXISTS waiting_reason text,
  ADD COLUMN IF NOT EXISTS position integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS started_at timestamptz,
  ADD COLUMN IF NOT EXISTS status_changed_at timestamptz NOT NULL DEFAULT now();
-- 2) backfill de status e dono
UPDATE public.conversation_tasks SET status = CASE status WHEN 'completed' THEN 'done' WHEN 'pending' THEN 'todo' ELSE COALESCE(NULLIF(status,''),'todo') END;
UPDATE public.conversation_tasks SET created_by = assigned_to WHERE created_by IS NULL AND assigned_to IS NOT NULL;
-- G-4: órfãs → perfil Admin 01 (id descoberto na etapa 8)
UPDATE public.conversation_tasks SET created_by = '<ADMIN01_PROFILE_ID>' WHERE created_by IS NULL;
ALTER TABLE public.conversation_tasks ALTER COLUMN created_by SET NOT NULL;
-- 3) constraints
ALTER TABLE public.conversation_tasks DROP CONSTRAINT IF EXISTS conversation_tasks_status_check;
ALTER TABLE public.conversation_tasks ADD CONSTRAINT conversation_tasks_status_check CHECK (status IN ('backlog','todo','doing','waiting','done','cancelled'));
ALTER TABLE public.conversation_tasks ADD CONSTRAINT conversation_tasks_waiting_reason_check CHECK (status <> 'waiting' OR waiting_reason IS NOT NULL);
ALTER TABLE public.conversation_tasks ALTER COLUMN status SET DEFAULT 'backlog';
-- 4) índices
CREATE INDEX IF NOT EXISTS idx_tasks_owner_status_due ON public.conversation_tasks (created_by, status, due_date);
CREATE INDEX IF NOT EXISTS idx_tasks_owner_remind_pending ON public.conversation_tasks (created_by, remind_at)
  WHERE remind_at IS NOT NULL AND notified_at IS NULL AND status NOT IN ('done','cancelled');
-- 5) triggers (status_changed_at / started_at / completed_at / remind_at; assigned_to := created_by)
--    ver etapa 14 (j) e (k)
-- 6) RLS por dono (substituir as 4 policies USING (true))
--    padrão: created_by IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
-- 7) migração de reminders (etapa 16) com reminders.migrated_task_id
-- 8) realtime: ALTER PUBLICATION supabase_realtime ADD TABLE public.conversation_tasks; (se ainda não estiver)
-- ROLLBACK (manual): ver etapa 20
```

## APÊNDICE B — Máquina de estados (`workItemMachine.ts`)
```
backlog ─┬─> todo ─┬─> doing (WIP 3, hard) ─┬─> done
         │         │                        ├─> waiting (motivo obrigatório) ─> doing | todo | done
         │         └─> waiting ─────────────┘
         └─> cancelled (de qualquer estado exceto done; done → reopen → todo → cancelled)
done ──reopen──> todo
Efeitos: doing → started_at (1ª vez); done → completed_at, remind_at=null; cancelled → remind_at=null; qualquer troca → status_changed_at.
```

## APÊNDICE C — Políticas das colunas (texto exato dos tooltips, pt-BR)
- **Caixa de entrada:** "Tudo que você capturou e ainda não decidiu. Limpe todo dia: mova para A fazer ou cancele."
- **A fazer:** "Decidido: vai ser feito. Ordene por prazo e prioridade. Se passar de 15, algo tem que sair."
- **Fazendo (máx. 3):** "O que está nas suas mãos agora. Três é o limite — mais que isso é troca de contexto, não trabalho."
- **Aguardando (ideal ≤ 5):** "Parou por causa de alguém ou algo. Escreva o motivo. Cobre quando envelhecer."
- **Concluído:** "Feito. Fica 7 dias à vista para você ver o que rendeu a semana."

## APÊNDICE D — `data-testid` obrigatórios (para E.2/E.5)
`tasks-module`, `tasks-mode` (+ `data-mode`), `quick-add-input`, `quick-add-chip-{today|tomorrow|nextweek|date|remind|contact|priority}`, `kpi-card` (+ `data-kpi`), `tasks-filter-{search|priority|contact|remind|done|clear}`, `list-section-{overdue|today|upcoming|nodue|done}`, `board-column-{backlog|todo|doing|waiting|done}`, `board-column-count`, `work-item-card` (+ `data-id`, `data-status`), `work-item-check`, `work-item-menu`, `move-to-menu`, `work-item-sheet`, `sheet-field-{title|status|priority|contact|due|remind|waiting|description}`, `agenda-day` (+ `data-date`), `agenda-overdue`, `notif-reminder-{open|snooze|complete}`, `conversation-tab-tasks`, `conversation-tab-count-tasks`.

## APÊNDICE E — Scripts de QA (`/workspace/qa`, fora do repo)
- **E.1 `tasks-shot.mjs`** — login (`#login-email`, `#login-password`, `Enter`; usar `probe3.mjs` como base) + screenshot de `?view=tasks|pipeline|inbox` em 1672×941 / 1280×800 / 390×844, tema dark, `localStorage['theme-custom-colors']` removido, `tasks-mode` forçado por argumento.
- **E.2 `tasks-measure.mjs`** — `getBoundingClientRect` dos `data-testid` do Apêndice D; asserts da etapa 137; `emulateMedia({reducedMotion:'reduce'})` → `transitionDuration`.
- **E.3 `tasks-colors.mjs`** — amostras 9×9 mediana em: fundo, card, chip urgente/alta/média/baixa, chip atrasado, cabeçalho Fazendo cheio, política cinza; ΔE76 em Lab (mesma implementação de 20 linhas do plano de Contatos).
- **E.4** — sem referência visual (não há mockup desta entrega); **pulado por definição**. A referência é a seção 2.
- **E.5 `tasks-func.mjs`** — os 24 checks da etapa 136 com `page.on('console')` acumulando erros e JSON final.
- **E.6 `tasks-seed.mjs`** — cria 300 tarefas sintéticas para o usuário QA via REST com o JWT dele (nunca service_role), distribuídas nos 5 status, e apaga ao final (`DELETE … WHERE title LIKE 'QA-SEED-%'`).
- Todos leem credenciais de `/workspace/.secrets/zapp-v2.env` (`ZAPP_QA_EMAIL`, `ZAPP_QA_PASSWORD`) — que **precisam ser válidas** (etapa 7).

## APÊNDICE F — Template do ledger `docs/design/TAREFAS_QUADRO_STATUS.md`
```md
# Tarefas + Lembretes + Quadro — STATUS
Base: <sha> · Repo path: <path> · Playwright: ok|bloqueado · QA user: ok|401
Decisões: G-1=<resp+data> G-2= G-3= G-4= G-5= G-6= G-7= G-8=

## CP0 Ambiente     [ ] sha= · before=tasks/pipeline/chat-tarefas/chat-lembretes-00-before.png · inventário: tasks=<n por status> órfãs=<n> reminders=<n/dismissed> deals=<n> · cron atual=<sim/não> · gates baseline ok
## CP1 Banco        [ ] PR=<url> AGUARDA APROVADO · teste rollback: <contagens> · typecheck=0 · machine/aggregates tests=ok · pós-merge: status=<contagens> cron=<jobname>
## CP2 Dados        [ ] sha= · compat shots=*-02-compat.png · realtime=<ms> · lembrete antigo→tarefa nova: ok
## CP3 Componentes  [ ] sha= · tests=<n> · shot=03-components.png
## CP4 Lista        [ ] sha= · shot=tasks-04-after.png · quickAdd=_ kpi=_ · criar/concluir/undo/editar em prod: ok
## CP5 Quadro       [ ] sha= · shots=board-05-{after,1280,mobile}.png · columns=5 doing=n/3 · mouse+teclado em prod: ok · position persiste: ok
## CP6 Agenda       [ ] sha= · shot=agenda-06-after.png · troca de modo: 0 requests
## CP7 Avisos       [ ] sha= · cron ativo · notif criada em <ts> · toast em <ts> · adiar→2ª notif em <ts> · push: <sim/fora da v1>
## CP8 Chat         [ ] sha= · abas=8 · badge==lista · shots=chat-08-*.png
## CP9 A11y/mobile  [ ] sha= · atalhos=<tabela> · reduced-motion=0s · contraste=<tabela> · mobile overflow=0 · light ok · bundle=_ KB gz
## CP10 QA          [ ] gates 8/8 · func 24/24 · geometria N/N · cores N/N · isolamento 2 usuários ok · migração 0 pendentes
## CP11 Entrega     [ ] PR legado=<url> · merge=<sha> · prod shots=12-prod-*.png · cron ok · concluído em <data>

## Divergências plano × código
-
## Iterações (máx 3 por fase)
-
## Pendências / resíduos (honestos)
- Push do navegador: <decisão>
- Parser de linguagem natural: v2
- Virtualização da lista: v2 (>500 itens)
- Agenda sem arrastar entre dias: v2
- Colunas personalizáveis / delegação / recorrência / subtarefas: v2
```

## APÊNDICE G — Backlog v2 (fora deste plano, já mapeado)
Delegação (`assigned_to ≠ created_by` + RLS "criador OU responsável" + notificação de atribuição) · recorrência (`rrule` texto + job que clona) · subtarefas (`parent_id`) · comentários (`task_comments`) · anexos (bucket) · etiquetas (`tags text[]`, já existe em `sales_deals` como modelo) · colunas personalizáveis por usuário (`user_board_columns`) · parser NL na captura · integração Google Calendar (alarme → evento) · relatório semanal por e-mail (throughput/cycle time) · reativar oportunidades como tipo de tarefa com `value` (se o comercial pedir).

## APÊNDICE H — Referências de Kanban pessoal consultadas (28/09/2026)
- Jim Benson & Tonianne DeMaria Barry, *Personal Kanban: Mapping Work | Navigating Life* — as 2 regras: visualizar o trabalho, limitar o WIP.
- Nadja Schnetzler, série "Kanban: A Universe of Options for Life's Planning" (personalkanban.com) — quadro individual de 6 colunas (To do / Next / Meet / Doing WIP 1–3 / Waiting for WIP 3 / Done).
- personalkanban.com, "Waiting column" — coluna Aguardando ao lado de Fazendo para não furar o WIP com item bloqueado; item pode ir e voltar.
- Super Productivity, "Personal Kanban for developers" — 6 colunas mínimas (Backlog/Ready/Doing/Waiting/Review/Done); WIP Doing 1, Waiting 3, Ready 5; evitar colunas de processo corporativo.
- Kanban Tool, "When should I move a task to Waiting" — Waiting como buffer planejado ou como bloqueio por terceiro.
- Superthread, "Kanban WIP limits" — comece baixo, torne o limite visível, foque em fluxo e não em utilização; sinais de limite alto demais.
- TasksBoard, "Personal Kanban board" — WIP 2–3 para indivíduo; quadro > lista quando há estágios e prazos sobrepostos.
- Nielsen Norman Group, 10 heurísticas de usabilidade — aplicadas na seção 4.
Adaptações feitas para o ZAPP: sem "Review" (não há revisor em tarefa pessoal); "Meet" substituída pelo modo Agenda; WIP Fazendo 3 (não 1) porque o atendente alterna entre conversas por natureza.

---

## COMANDOS DE DISPARO (Joaquim, via Portainer → container `claude-code`)
```sh
# Sessão A — Fases 0-3 (para no CP1 aguardando APROVADO da migration)
cd /workspace/repos/Zapp_Web_V2 && git fetch origin && git checkout main && git pull && \
claude -p 'Leia docs/design/PLANO_TAREFAS_QUADRO_FUSAO_150_ETAPAS.md por completo. Execute as Fases 0 a 3 (etapas 1-56) na ordem, fechando cada checkpoint SOMENTE com a evidência exigida em docs/design/TAREFAS_QUADRO_STATUS.md. Na Fase 1, abra a PR e PARE: DDL/RLS em produção exigem APROVADO. Toda branch nasce de main com carimbo de hora; nunca commite em main; push via nohup ou API do GitHub. Se um gate falhar 3 vezes, registre o resíduo e siga.' --model sonnet

# Sessão B — Fases 4-8 (após merge da migration)
claude -p 'Leia o plano e o ledger docs/design/TAREFAS_QUADRO_STATUS.md. Execute as Fases 4 a 8 (etapas 57-124). Não refaça etapas marcadas [x]. Cada fase = 1 branch + 1 PR; merge autorizado só nos casos que o plano diz "Merge autorizado".' --model sonnet

# Sessão C — Fases 9-11
claude -p 'Leia o plano e o ledger. Execute as Fases 9 a 11 (etapas 125-150). A etapa 147 abre PR de DDL e PARA para APROVADO. Ao final, verifique produção conforme a etapa 150 e só então escreva "concluído".' --model sonnet
```
