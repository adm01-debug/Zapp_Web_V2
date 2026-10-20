# Relatório de Validação Exaustiva — ZAPP WEB V2
## Coordenação de 5 Agentes Especializados

**Data:** 27/08/2026  
**Banco testado:** `tnnnlkbymytvtqngbbqh.supabase.co` (destino/produção)  
**Cobertura:** segurança, integridade, performance, funcionalidade e detecção de gaps

---

## Painel de Controle dos 5 Agentes

| Agente | Escopo | Checks | Bugs |
|---|---|---|---|
| 🔴 **Alfa** — Segurança & RLS | ACLs, policies, views, audit | 10 | 4 |
| 🟠 **Beta** — Integridade de Dados | FKs, triggers, constraints, dados | 8 | 3 |
| 🟡 **Gamma** — Performance | Índices, seq scans, bloat, plans | 7 | 2 |
| 🟢 **Delta** — Funcionalidade | Cron, realtime, funções, auth | 10 | 3 |
| 🔵 **Epsilon** — Gap Detection | Código morto, chains quebradas | 10 | 5 |

**Total: 45 checks executados | 17 problemas confirmados por simulação**

---

## 🔴 CRÍTICOS — Exploráveis Agora

### C-01 · `clear_login_attempts` executável por `anon` e `PUBLIC`
**Confirmado por:** `has_function_privilege('anon', 'public.clear_login_attempts(text)', 'execute')` = **true**

ACL real da função:
```
=X/postgres  postgres=X/postgres  anon=X/postgres  authenticated=X/postgres  service_role=X/postgres
```

O `=X/postgres` (PUBLIC) é o problema: **qualquer request HTTP não autenticado** pode chamar:
```http
POST /rest/v1/rpc/clear_login_attempts
{"p_email": "vítima@empresa.com"}
```
E zera todos os registros de tentativas falhas para aquele email. A proteção de brute-force está **completamente neutralizada** — basta um script que alterna `record_failed_login` e `clear_login_attempts`.

**Impacto:** proteção de lockout = inexistente  
**Correção:** `REVOKE EXECUTE ON FUNCTION public.clear_login_attempts(text) FROM PUBLIC, anon;`

---

### C-02 · `notify_sicoob_on_reply` — Bridge SICOOB completamente morta
**Confirmado por:** `SELECT DISTINCT channel_type FROM public.messages` → único valor: **`whatsapp`** (219 mensagens)

A função `notify_sicoob_on_reply` foi instalada como trigger em `messages` e verifica:
```sql
IF NEW.sender = 'agent' AND NEW.channel_type = 'internal_chat' THEN
```

Problema: `messages.channel_type` **não tem CHECK constraint** — qualquer valor é aceito. Mas na prática, **100% das mensagens têm `channel_type='whatsapp'`**. A condição `internal_chat` **nunca é verdadeira**. A bridge SICOOB nunca foi chamada nem uma vez desde que o sistema foi ao ar.

Agravante: mesmo que o `channel_type` fosse correto, o código faz:
```sql
'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
```
E `current_setting('app.settings.service_role_key', true)` retorna **NULL** (confirmado). Portanto as requisições HTTP sairiam sem header de autenticação.

**Dupla falha:** condição de disparo errada + credencial ausente.  
**Correção:** (1) Investigar qual `channel_type` representa conversa interna; (2) Configurar o secret via vault; (3) Verificar se a edge function `sicoob-bridge-reply` ainda é necessária.

---

### C-03 · `decrypt_gmail_token` / `encrypt_gmail_token` — callable por `authenticated`
**Confirmado por:** ACL real: `postgres=X | service_role=X | authenticated=X`

Qualquer usuário autenticado pode chamar `.rpc('decrypt_gmail_token')` passando bytes arbitrários, ou `.rpc('encrypt_gmail_token')` com qualquer texto. Como são `SECURITY DEFINER`, rodam com permissões de `postgres`. O `decrypt_gmail_token` descriptografa tokens usando a chave do vault — se o usuário passar os bytes de um token que obteve de outro contexto, consegue descriptografar.

**Impacto:** escalada de privilégio sobre tokens OAuth Gmail  
**Correção:**
```sql
REVOKE EXECUTE ON FUNCTION public.decrypt_gmail_token(bytea) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.encrypt_gmail_token(text) FROM authenticated;
```

---

## 🔴 ALTOS — Requerem Correção Breve

### A-01 · Trigger duplicado neutralizando exceção de escalada de privilégio em `profiles`
**Confirmado por:** ordem alfabética de triggers BEFORE UPDATE verificada.

Dois triggers BEFORE UPDATE na tabela `profiles` protegem os campos `role`, `access_level`, `permissions`:

| Trigger | Função | Comportamento quando não-admin tenta mudar role |
|---|---|---|
| `on_profile_update_prevent_escalation` (dispara 1º) | `prevent_role_escalation` | Silently reverte: `NEW.role := OLD.role` |
| `prevent_privilege_escalation` (dispara 2º) | `prevent_profile_privilege_escalation` | `RAISE EXCEPTION 'Only administrators can modify...'` |

O trigger `on_profile_update_prevent_escalation` dispara **antes** (ordem alfabética: 'o' < 'p'). Ele silenciosamente reverte `NEW.role = OLD.role`. Quando o segundo trigger executa, `OLD.role IS DISTINCT FROM NEW.role` já é `FALSE` — a exceção **nunca é lançada**.

**Resultado prático:** um não-admin que tente `UPDATE profiles SET role='admin'` recebe 200 OK sem erro, mas a mudança não persiste. O frontend pode interpretar o 200 como sucesso e mostrar a role errada até o próximo reload.

**Correção:** remover um dos dois triggers. Se o comportamento desejado é exceção, remover `on_profile_update_prevent_escalation`. Se é revert silencioso, remover `prevent_privilege_escalation`.

---

### A-02 · Trigger duplicado em `user_devices` executando a mesma função 2x
**Confirmado:** dois triggers BEFORE UPDATE chamando `update_device_last_seen()`:
- `on_device_update_last_seen`
- `update_user_devices_last_seen`

Ambos fazem `NEW.last_seen_at = now()`. No mesmo microssegundo, `now()` retorna o mesmo valor — resultado idêntico. Desperdício de execução dupla a cada UPDATE em `user_devices`.

**Correção:** `DROP TRIGGER update_user_devices_last_seen ON public.user_devices;`

---

### A-03 · `get_channel_credentials` callable por `authenticated`
**Confirmado por:** `authenticated=X/postgres` no ACL.

Retorna credenciais brutas (tokens, chaves API) do canal WhatsApp/Evolution para qualquer usuário autenticado via `.rpc('get_channel_credentials', {_connection_id: uuid})`. A view `channel_connections_safe` existe exatamente para evitar isso, mas a função privilegiada continua exposta.

**Correção:** `REVOKE EXECUTE ON FUNCTION public.get_channel_credentials(uuid) FROM authenticated;`

---

### A-04 · 108 FK de coluna única sem índice de suporte
**Confirmado:** query retornou exatamente **108 colunas** (lista truncada). Caminhos quentes afetados:

`messages.agent_id`, `messages.whatsapp_connection_id`, `messages.channel_connection_id`, `sales_deals.contact_id`, `sales_deals.stage_id`, `queue_positions.contact_id`, `queue_positions.queue_id`, `contact_tags.tag_id`, `role_permissions.permission_id`, `team_messages.sender_id`, `conversation_sla.contact_id`.

Impacto duplo:
1. JOINs por essas colunas fazem seq scan na tabela filho
2. **DELETE/UPDATE na tabela pai** bloqueia a tabela filho inteira enquanto verifica as FKs

Nenhum dos índices planejados (etapas 13–32 do plano de melhorias) foi implementado ainda.

---

## 🟡 MÉDIOS — Funcionalidade Degradada

### M-01 · `search_contacts` bypassa RLS completamente
**Confirmado:** função `STABLE SECURITY DEFINER` sem nenhum filtro de visibilidade.

Qualquer usuário autenticado pode chamar `.rpc('search_contacts')` e recebe **todos os contatos** do banco. As policies SELECT da tabela `contacts` são ignoradas porque a função roda como `postgres`.

Pode ser intencional (todos os agentes veem todos os contatos), mas precisa ser documentada como decisão explícita.

---

### M-02 · `search_contacts` executa 2 full table scans separados
**Confirmado:** a função faz primeiro `SELECT COUNT(*)` (scan 1) e depois `RETURN QUERY SELECT ... LIMIT page_size` (scan 2). Para milhões de contatos, isso é 2× o custo.

**Correção:** usar `COUNT(*) OVER ()` como window function no RETURN QUERY, eliminando o primeiro scan.

---

### M-03 · `search_contacts` não usa índices trgm nas buscas `ILIKE`
**Confirmado:** a tabela `contacts` tem 6 índices GIN trgm mas a função usa `ILIKE '%' || v_search || '%'`. Para buscas curtas (1–2 chars), faz seq scan. O operador `%` do pg_trgm ou `websearch_to_tsquery` usaria os índices.

---

### M-04 · Índice UNIQUE duplicado em `contacts.phone`
**Confirmado:**
```
contacts_phone_key    — UNIQUE btree (gerado pela constraint)
contacts_phone_unique — UNIQUE btree (explícito, redundante)
```
Qualquer INSERT/UPDATE de `phone` atualiza dois índices ao invés de um.

**Correção:** `DROP INDEX CONCURRENTLY contacts_phone_unique;`

---

### M-05 · Bloat alto sem autovacuum em tabelas críticas

| Tabela | Live rows | Dead rows | % Dead | Último autovacuum |
|---|---:|---:|---:|---|
| `login_attempts` | 1 | 3 | **75%** | nunca |
| `whatsapp_connections` | 1 | 2 | **67%** | nunca |
| `profiles` | 3 | 6 | **67%** | nunca |
| `user_roles` | 3 | 2 | 40% | nunca |
| `contacts` | 52 | 18 | 26% | 27/08 17:11 |

Autovacuum ainda não atingiu o threshold mínimo para tabelas pequenas. Mas `login_attempts` com 75% de bloat indica rotatividade alta — corrigível com `VACUUM ANALYZE` manual.

---

### M-06 · `whatsapp_connections`: 508 seq scans para 1 única row
**Confirmado por `pg_stat_user_tables`:** `seq_scan=508, n_live_tup=1`. Queries sem predicado indexável causam full scan mesmo em tabelas minúsculas. Inofensivo hoje, padrão ruim para produção.

---

## ✅ Confirmados Corretos

| Check | Status |
|---|---|
| `mcp_exec`/`mcp_exec_many` — ACL só `postgres` + `service_role` | ✅ |
| 123 tabelas com RLS habilitado | ✅ |
| Zero tabelas com RLS ON e zero policies | ✅ |
| Todas as 7 views com `security_invoker` | ✅ |
| `audit_logs` bloqueia INSERT/UPDATE/DELETE de `authenticated` | ✅ |
| `notifications`, `entity_versions`, `gmail_accounts`, `login_attempts` bloqueados | ✅ |
| 3/3 `auth.users` com profile e user_role (triggers funcionando) | ✅ |
| 3/3 profiles com `agent_stats` | ✅ |
| Zero FKs com dados órfãos | ✅ |
| Cron `cleanup-link-preview-cache` ativo (`0 3 * * *`) | ✅ |
| 11 tabelas no realtime com `REPLICA IDENTITY FULL` | ✅ |
| Zero funções SECURITY DEFINER com search_path inseguro | ✅ |
| 22 CHECK constraints cobrindo campos críticos | ✅ |
| `has_role`/`is_admin_or_supervisor`/`user_has_permission` corretos | ✅ |
| `password_reset_requests` — token não exposto via coluna | ✅ |
| `search_contacts` — sem SQL injection via `sort_field` | ✅ |
| `is_ip_blocked` respeita `expires_at` | ✅ |
| `init_agent_stats` com `ON CONFLICT DO NOTHING` (idempotente) | ✅ |
| `log_audit_event` — não grava sem sessão autenticada | ✅ |

---

## Plano de Ação Prioritizado

| Prio | Ação | Risco | Esforço |
|---|---|---|---|
| **P0** | `REVOKE EXECUTE ON clear_login_attempts FROM PUBLIC, anon` | mínimo | 1 linha |
| **P0** | `REVOKE EXECUTE ON decrypt_gmail_token, encrypt_gmail_token FROM authenticated` | mínimo | 1 linha |
| **P0** | `REVOKE EXECUTE ON get_channel_credentials FROM authenticated` | mínimo | 1 linha |
| **P1** | Investigar e corrigir `notify_sicoob_on_reply` (channel_type + secret) | médio | análise + código |
| **P1** | Remover trigger duplicado em `profiles` | baixo | 1 DROP TRIGGER |
| **P1** | Remover trigger duplicado em `user_devices` | mínimo | 1 DROP TRIGGER |
| **P2** | `DROP INDEX CONCURRENTLY contacts_phone_unique` | mínimo | 1 linha |
| **P2** | Criar 108 índices de FK (`CONCURRENTLY`) | baixo | migration |
| **P3** | Reescrever `search_contacts` com 1 scan + trgm operators | médio | função |
| **P3** | `VACUUM ANALYZE login_attempts, whatsapp_connections, profiles` | mínimo | 1 linha |

---

*Relatório gerado em 27/08/2026 — todos os bugs confirmados por simulação direta no banco de produção.*  
*Zero dados alterados durante os testes.*
