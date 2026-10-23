# Análise de Funções-Chave — 4 funções críticas (2026-10-22)

Fonte: `pg_get_functiondef` via MCP. Todas têm `SECURITY DEFINER SET search_path TO 'public','pg_temp'`.

---

## 1. `close_conversation_atomic`

**Propósito:** fechar conversa de forma atômica com idempotência por `client_request_id`.

**Auth:** verifica `auth.role() IN ('authenticated','service_role')` e `auth.uid() IS NOT NULL`.
Para role=authenticated exige perfil ativo + `is_contact_visible_to_user(contact_id)`.

**Concorrência:** `SELECT ... FOR UPDATE` no contato antes de qualquer write — serializa
fechamentos concorrentes do mesmo contato. Se dois agentes tentarem fechar o mesmo contato
simultaneamente, um espera o FOR UPDATE do outro.

**Idempotência:** verifica `client_request_id` em `conversation_closures` antes de inserir.
Se o mesmo ID já existir com payload idêntico, devolve o resultado anterior sem criar
duplicata. Se payload divergir, lança `closure_request_id_reused_with_different_payload`.

**FSM:** usa `transaction_timestamp()` (não `now()`) para garantir que o timestamp persistido
no contato e o gerado pelo evento sejam idênticos mesmo que a transação tenha começado antes.

**Achados:** NENHUM. Função bem implementada — guards de auth, FSM, idempotência e lock.

---

## 2. `record_failed_login`

**Propósito:** registrar tentativa de login falha com lockout exponencial.

**Auth:** não requer autenticação (chamada pela edge `auth-login` que tem verify_jwt=false).

**Lógica de lockout:**
- UPSERT atômico via `ON CONFLICT (email) DO UPDATE`
- Exponential backoff: `2^(attempts - v_max_attempts)` minutos, cap em 2^10 = 1024 min (~17h)
- Se conta bloqueada e lock expirou: zera `attempt_count = 1`, `locked_until = NULL`
- Se conta bloqueada e lock ativo: mantém `attempt_count` sem incrementar

**Concorrência:** o ON CONFLICT é atômico — dois logins simultâneos para o mesmo email
são serializados pelo único índice único em `login_attempts(email)`.

**Achados:**
- `login_attempts` sem TTL (S12-01 — corrigido em PR #2186 migration `20261026110300`)
- Função em si: NENHUM bug identificado

---

## 3. `notify_due_tasks`

**Propósito:** notificar usuários de tarefas cujo `remind_at <= now()` e `notified_at IS NULL`.

**Auth:** exige `is_privileged_contact_caller()` (service_role). Chamada pelo cron
`tasks-notify-due` (a cada 1 min, 1390 falhas em 30d → falhas são de job startup timeout, não da função).

**Padrão:** FOR loop com INSERT em `notifications` + UPDATE de `notified_at` por tarefa.
Atomicidade: INSERT e UPDATE estão na mesma transação implícita da chamada — ou ambos
succedem para uma tarefa, ou ambos falham junto. Risco de re-notificação é baixo.

**Achados:**
- `O(N)` com N = tarefas vencidas: se acumular muitas tarefas sem processar (ex: cron
  parado por horas), uma única execução pode ser lenta. Mitigação: cron a 1min garante N pequeno.
- NENHUM bug crítico identificado.

---

## 4. `merge_contacts_atomic`

**Propósito:** fundir N contatos secundários em um primário, remapeando todas as FKs.

**Auth:** `service_role` ou `is_admin_or_supervisor(auth.uid())`.

**Anti-deadlock:** `SELECT ... WHERE id = p_primary_id OR id = ANY(v_secondary_ids) ORDER BY id FOR UPDATE`
— a cláusula `ORDER BY id` garante que duas fusões concorrentes sempre adquirem locks
na mesma ordem, prevenindo deadlock circular.

**CRM conflict check:** previne fusão se ambos (primário e secundário) tiverem
`crm_contact_links` — evita ambiguidade de identidade externa.

**GUC transacional:** `set_config('app.contact_merge_identity', 'on', true)` com `local=true`
é limitado à transação atual — sem vazamento para outras sessões.

**Dynamic FK remapping:** o loop via `pg_constraint` remapeia automaticamente FKs futuras
sem precisar atualizar a função. Risco: se uma tabela nova com FK para `contacts` tiver
constraint de unicidade que conflite com o merge, a transação abortará inteira. Isso é
comportamento correto (atomicidade garantida).

**Achados:** NENHUM bug ou race condition identificado.

---

## Resumo por função

| Função | Auth | Lock | Idempotente | Achado |
|--------|------|------|-------------|--------|
| `close_conversation_atomic` | role + profile + visibility | FOR UPDATE | sim (client_request_id) | NENHUM |
| `record_failed_login` | não requer | ON CONFLICT atômico | sim (upsert) | S12-01 (TTL na tabela, não na função) |
| `notify_due_tasks` | service_role | implícito (UPDATE notified_at) | sim (notified_at flag) | O(N) — baixo risco |
| `merge_contacts_atomic` | service_role ou admin | FOR UPDATE + ORDER BY id | sim (delete idempotent via FK remapping) | NENHUM |
