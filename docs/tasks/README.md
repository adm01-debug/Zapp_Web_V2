# Módulo de Tarefas

Workspace de trabalho pessoal do atendente: transforma conversa em tarefa com prazo, prioridade e
lembrete. Entra pelo `?view=tasks` (atalho `Alt+T` a partir da conversa) e vive em
`src/components/tasks/**` + `src/hooks/tasks/**`.

## Modos

| Modo | Atalho | O que é |
| --- | --- | --- |
| Lista | `1` | Agrupada por seção (Caixa de entrada, Hoje, Esta semana, Fazendo, Aguardando, Concluídas 7 dias, Canceladas) |
| Quadro | `2` | 6 colunas, uma por status, com trava de WIP |
| Agenda | `3` | Agrupada por dia |

Trocar de modo **não refaz request**: os três modos leem o mesmo conjunto já buscado.

## Modelo de dados

**`conversation_tasks`** — 18 colunas: `id`, `title`, `description`, `status`, `priority`,
`position`, `due_date`, `remind_at`, `notified_at`, `started_at`, `completed_at`,
`status_changed_at`, `waiting_reason`, `contact_id`, `assigned_to`, `created_by`, `created_at`,
`updated_at`.

- `status` ∈ `backlog | todo | doing | waiting | done | cancelled` (constraint no banco; `backlog` é a
  "Caixa de entrada" da UI).
- `waiting` **exige** `waiting_reason` — o portão vale tanto no arrastar quanto no menu de ações.
- Trava de WIP: no máximo **3** tarefas em `doing`; a quarta é bloqueada com aviso.
- `cancel` vai direto para `cancelled` sem passar pela máquina de estados (resíduo conhecido, D14).

**`reminders`** — tabela legada (título, `remind_at`, `profile_id`, `contact_id`, `is_dismissed`) com
`migrated_task_id` apontando para a tarefa que a substituiu. Conferido em produção: 1 linha, 0 sem
destino. A coluna `reminders_pending` da RPC abaixo é o último resto desse modelo (etapa 97 remove).

## Contagens da aba (RPC)

`get_conversation_tab_counts(p_contact_id)` → `tasks_open`, `notes_total`, `files_total`, `n`.
`tasks_open` conta só as tarefas **do usuário atual** (`created_by = current_profile_id()`) que não
estão `done`/`cancelled`. O campo `n` é legado e devolve `0` fixo: o front já resolve os badges de
Pedidos client-side (`ConversationTabs.tsx`) e tolera o campo extra até a remoção.

## Lembretes (alarme)

Cron `tasks-notify-due`, `* * * * *` → `SELECT public.notify_due_tasks()`
(`supabase/migrations/20260928140100_tasks_notify_due_cron.sql`). A função varre `remind_at` vencido
com `notified_at` nulo, notifica uma única vez por tarefa (idempotência por `notified_at`) e alimenta
o toast e a central de notificações. Adiar 15 min reescreve `remind_at`.

## Acesso (RLS)

- **Papel agente**: vê e altera **só** as tarefas em que é o dono — `created_by = current_profile_id()`.
  Verificado em produção: GET devolve `[]`, PATCH e DELETE afetam 0 linhas, e a UI mostra 0 cards.
- **Papel supervisor**: vê as tarefas de todos (desenho, não vazamento).

## Atalhos

Sete, com escopo `tasks`/`pipeline`: `tasks-focus-quickadd`, `tasks-mode`, `tasks-search`,
`tasks-open-sheet`, `tasks-complete`, `tasks-cancel`, `tasks-help`. As **teclas** ficam em
`src/hooks/shortcuts/defaultShortcuts.ts` (eager); os **rótulos** moram em
`src/hooks/shortcuts/taskShortcutLabels.ts`, carregado por `import()` dinâmico para não pesar no
`initial-js` — o teste `useTaskShortcutLabels.test.tsx` amarra os dois lados.

## Testes

- Unitários: `bun run test` (o domínio de tarefas responde por 19 arquivos / 254 casos).
- Funcional em produção (E.5, 24 checks): harness Playwright em `.tmp/tasks-func.mjs`, com login pela
  UI. **Feche o diálogo de entrada com `Escape` antes de clicar** (senão os cliques são
  interceptados) e nunca use `waitUntil: 'networkidle'` — o app mantém websocket aberto.
- Dados de teste em produção: use prefixo identificável e **apague com contagem antes/depois**.
- **`WelcomeModal`**: o app abre o "Bem-vindo… Pular tour" (overlay `z-[9999]`) em contexto/sessão nova e ele
  **intercepta todo clique de ponteiro** — não há flag persistente. Qualquer automação precisa fechá-lo (Escape
  ou "Pular tour") antes de interagir, senão o clique resolve o elemento e não completa.

## Resíduos conhecidos

`work-items-badge` sem consumidor na UI; `Bell` e `Filter` importados sem uso no `TasksModule`; sem
índice em `completed_at` nem em `position`; `update()` do hook ignora `input.status`; WIP contado
globalmente e não por contato; duplicidade entre `workItemAggregates` e `TasksBoardMode`;
`e2e/reactions.spec.ts` crônico na `main`.
