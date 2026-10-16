# Auditoria de notificações de lembrete (etapa 176)

Auditoria **somente de leitura** do caminho do lembrete de tarefa contra os
fluxos novos do plano `PLANO_TAREFAS_NIVEL_DESIGN_200_ETAPAS_2026-10-11.md`
(prazo = entrega, lembrete = aviso; lembrete antes do prazo; adiar rearma
`notified_at`). Nenhum código de produção, migration ou Edge Function foi
alterado; este documento é o único artefato.

Data: 11/10/2026 · Especialista: hugo (hooks, estado e dados no front)

## 1. Resumo

O caminho do lembrete está **funcionalmente fechado de ponta a ponta** e
coberto por testes: o cron grava `notifications` com `type = 'reminder_due'`, o
tempo real do sino mostra o toast e as mesmas ações valem para o item da lista.

As duas garantias pedidas pela etapa 176 se confirmam:

- **Adiar rearma `notified_at`**: `snoozePatch` retorna `notified_at: null` e o
  banco grava (`useWorkItemNotifications.ts:63-68`).
- **Lembrete e prazo são conceitos separados**: o cron lê só `remind_at`
  (`due_date` não participa), coerente com "o lembrete avisa, o prazo marca a
  entrega".

Porém a etapa 176 encontra **3 pontos de risco reais** que o plano novo precisa
cobrir (nenhum bloqueia a entrega, todos são de front/dados, não de banco novo):

1. **Trocar o lembrete pelo formulário não zera `notified_at`** → um lembrete
   reprogramado depois de já ter disparado **nunca dispara de novo**.
2. **"Lembrete antes do prazo" não é garantido em nenhuma camada** → o cron
   dispara mesmo com `remind_at` posterior a `due_date`; a função de coerência
   prevista (etapa 162) ainda não existe no código.
3. **Prazo vencido não gera notificação** → o aviso de prazo não existe hoje; o
   que existe é a contagem de "atrasadas" no badge (decisão D17, etapa 179).

## 2. O caminho do lembrete

### 2.1 O cron `notify_due_tasks`

Definição vigente (endurecida em 30/09 contra escrita por qualquer
authenticated):

`supabase/migrations/20260930141000_harden_notify_due_tasks_rpc_authorization.sql:29-41`

```sql
FOR v_task IN
  SELECT t.id, t.title, t.created_by, t.contact_id, t.remind_at, p.user_id
  FROM public.conversation_tasks t
  JOIN public.profiles p ON p.id = t.created_by
  WHERE t.remind_at <= now() AND t.notified_at IS NULL
    AND t.status NOT IN ('done', 'cancelled')
LOOP
  INSERT INTO public.notifications (user_id, title, message, type, metadata)
  VALUES (v_task.user_id, 'Lembrete: ' || v_task.title, ..., 'reminder_due',
    jsonb_build_object('task_id', v_task.id, 'contact_id', v_task.contact_id));
  UPDATE public.conversation_tasks SET notified_at = now() WHERE id = v_task.id;
  v_count := v_count + 1;
END LOOP;
```

- **Quando dispara:** `remind_at <= now()` e `notified_at IS NULL`, com a tarefa
  fora de `done`/`cancelled`. `due_date` **não** é consultado.
- **Para quem:** `profiles.user_id` do `created_by` (que é o `assigned_to`; o
  trigger `trg_task_set_assignee` força `assigned_to := created_by` no INSERT).
- **Guarda de autorização:** `is_privileged_contact_caller()` (linhas 25-27) —
  só `service_role`/`postgres` executam; o cron roda sem JWT.
- **Cadência:** `SELECT cron.schedule('tasks-notify-due', '* * * * *', ...)` em
  `20260928140100_tasks_notify_due_cron.sql:54`.
- **Cron de lembretes antigo desligado:** `unschedule('notify-due-reminders')`
  na mesma migration (linhas 57-59); a função `notify_due_reminders()` (tabela
  `reminders`, com id determinístico `md5(...)::uuid` + `ON CONFLICT DO NOTHING`)
  segue existindo, mas sem agendamento.

### 2.2 A notificação e o sino

- O INSERT cai em `public.notifications`; o sino assina em tempo real
  `postgres_changes` filtrando `user_id=eq.<user>`
  (`src/hooks/system/useNotifications.ts:110-118`).
- No INSERT de `type = 'reminder_due'`, monta o toast com as ações
  (`useNotifications.ts:134-142`); sem som de propósito.
- O item da lista e o toast compartilham o mesmo miolo de ações
  (`src/components/notifications/ReminderNotification.tsx:32-80`):
  **Abrir**, **Adiar ▾** (15 min · 1 h · Amanhã 9h) e **Concluir**.

### 2.3 O hook `useWorkItemNotifications`

`src/hooks/tasks/useWorkItemNotifications.ts` converte a notificação nas ações.
Funções puras exportadas (`:57-75`) e mutations (`:129-206`).

## 3. O que acontece em cada fluxo novo

### 3.1 Adiar (rearma `notified_at`) — OK

`snoozePatch` (`useWorkItemNotifications.ts:63-68`):

```ts
export function snoozePatch(minutes: SnoozeOption, now: Date = new Date()) {
  return { remind_at: computeRemindAt(minutes, now), notified_at: null };
}
```

A mutation grava `conversation_tasks.update(snoozePatch(minutes)).eq('id', taskId)`
(`:132-136`). Com `notified_at` zerado e `remind_at` no futuro, o cron volta a
pegar a tarefa no próximo minuto em que ela vencer. `'tomorrow9'` usa
`tomorrowAtNine` no fuso local (`:57-60`). **Adiar funcionando.**

### 3.2 Concluir (limpa o alarme) — OK

`completePatch` (`:71-75`): `{ status: 'done', completed_at, remind_at: null,
notified_at: null }`. O trigger do banco
(`20260928140000_tasks_unify_reminders_kanban.sql:80-104`) faz o mesmo quando o
status entra em `done`/`cancelled`. Redundância intencional e consistente.
Depois de concluir, o hook chama `markAsRead()` (marca a notificação como lida,
`:114`, `:162-166`). **Concluir funcionando.**

### 3.3 Trocar o prazo (`due_date`) — sem efeito sobre o aviso

O aviso só olha `remind_at`. Mudar `due_date` (pelo Sheet ou pela Agenda) **não
reprograma nem cancela o lembrete** e **não cria novo aviso**. Coerente com a
separação prazo × lembrete, mas significa que "prazo adiantado" não antecipa o
aviso — é o usuário quem precisa mexer no lembrete.

### 3.4 Trocar o lembrete pelo formulário — RISCO (ver R1)

O Sheet Salvar monta o patch por campo e manda `remindAt`
(`WorkItemSheet.tsx:198-208`), que vira só `remind_at` no `toDbPatch`
(`useMyWorkItems.ts:154-163`):

```ts
if (patch.remindAt !== undefined) out.remind_at = patch.remindAt;  // notified_at fica como está
```

O `updateMutation` grava o patch e nada mais (`useMyWorkItems.ts:384-391`). Só o
trigger de status zera `notified_at` — e ele só roda `WHEN (NEW.status IS
DISTINCT FROM OLD.status)`.

## 4. Casos de risco

**R1 — Reprogramar o lembrete pelo Sheet não zera `notified_at` (correção
incompleta do fluxo).** Cenário: o lembrete dispara (`notified_at` preenchido), o
usuário abre a tarefa e muda o horário do lembrete para mais tarde. O
`remind_at` novo é gravado, mas `notified_at` continua preenchido; o `WHERE ...
notified_at IS NULL` do cron descarta a tarefa para sempre — **o novo lembrete
nunca dispara**. Caminho irmão ("Adiar" no toast) funciona porque passa por
`snoozePatch`. Correção mínima pertence ao front (`toDbPatch`/`update`: quando
`remindAt` muda, mandar `notified_at: null`), sem migration.

**R2 — "Lembrete antes do prazo" não é garantido em nenhuma camada.** O front
só bloqueia lembrete **no passado** (`assertRemindNotInPast`,
`useMyWorkItems.ts:128`, chamado em `:312`, `:386`, `:601`); o banco não impõe ordem entre
`remind_at` e `due_date`; o cron não compara os dois. A função de coerência
prevista (etapa 162, `ok/depois do prazo/no passado/sem prazo`) **ainda não
existe no código** (`git grep` por `coherence/coerência` não acha nada em
`src/`). Enquanto ela não existir, uma tarefa com lembrete depois do prazo gera
um aviso "vencido" já atrasado.

**R3 — Prazo vencido não avisa.** Não há notificação de `due_date`; o badge do
menu conta "atrasadas + lembretes disparados" na consulta
(`useMyWorkItems.ts:685-703`), não no sino. Registrar para a etapa 179 (D17
mantém a regra do badge) — não é defeito, é o desenho atual.

**R4 — Sem idempotência de id em `notify_due_tasks` (baixo).** Diferente de
`notify_due_reminders` (id `md5(...)::uuid` + `ON CONFLICT DO NOTHING`), o cron
de tarefas usa o id default e não tem `ON CONFLICT`. Hoje não duplica: o
`UPDATE notified_at` acontece no mesmo comando/transação do INSERT e o cron é
sequencial. Fica o registro para quando houver reprocessamento.

**R5 — Tarefa sem `profiles.user_id` fica em laço (baixo).** O `JOIN profiles`
+ `p.user_id` nulo descarta a linha sem marcar `notified_at`; a tarefa é
reavaliada a cada minuto enquanto vencida. Sem efeito visível ao usuário.

**R6 — Remover/limpar o lembrete não apaga o aviso já disparado.** Remover o
lembrete (`remindAt: null`) só zera `remind_at`; a notificação `reminder_due`
já criada permanece no sino até ser marcada como lida. Comportamento aceitável
(é histórico), mas vale a confirmação de produto.

## 5. Confirmação de somente leitura

Auditoria de leitura: nenhum arquivo de `src/**` ou `supabase/**` foi alterado,
nenhuma migration aplicada. Único artefato novo: este documento. Verificação
`zapp-verify . --rapido` verde.
