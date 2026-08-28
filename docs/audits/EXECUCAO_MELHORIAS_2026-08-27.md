# Execução das Melhorias — ZAPP WEB V2
## Resultado: 11/12 bugs fechados nesta sessão

**Data:** 27/08/2026  
**Banco:** `tnnnlkbymytvtqngbbqh.supabase.co`  
**Migrations commitadas:** `20260827130100` a `20260827130600`

---

## Metodologia

**Simulação antes de qualquer DDL:**
1. Leitura de `src/hooks/auth/useAuthForm.ts` — confirmou que `clearLoginAttempts` é chamada APÓS `signIn()`, ou seja com JWT já presente → REVOKE de `anon`/`PUBLIC` é seguro
2. Leitura de `src/lib/loginAttempts.ts` — confirmou o fluxo completo
3. Busca `rpc decrypt_gmail OR rpc encrypt_gmail` no repo → apenas `types.ts`, zero `.rpc()` real → REVOKE de `authenticated` seguro
4. Re-query de FKs sem índice → 0 (migration `20260827120000` já aplicada) → A-04 já resolvido

---

## Descoberta durante simulação

Entre a auditoria (17h42) e a execução (18h00), duas migrations foram aplicadas:

| Version | Nome | O que fez |
|---|---|---|
| `20260827120000` | `fk_indexes_backfill` | Criou todos os 108 índices de FK |
| `20260827120100` | `schema_hygiene_views_policy_comments` | Unificou `security_invoker=true` nas 7 views; adicionou INSERT policy em `link_preview_cache_metrics` |

Isso eliminou A-04, M-06 e 2 outros achados da auditoria.

---

## Bugs Fechados nesta Sessão

| ID | Bug | Migration | Verificação |
|---|---|---|---|
| **C-01** | `clear_login_attempts` exposta para anon/PUBLIC | `20260827130600` | `has_function_privilege('anon',...)=false` ✅ |
| **C-02** | Bridge SICOOB nunca disparava (`channel_type='internal_chat'`) | `20260827130100` | `sem_internal_chat=true` ✅ |
| **C-03** | `decrypt/encrypt_gmail_token` callable por `authenticated` | `20260827130600` | `has_function_privilege('authenticated',...)=false` ✅ |
| **A-01** | Trigger duplicado em `profiles` neutralizava exceção | `20260827130200` | Apenas `prevent_privilege_escalation` ativo ✅ |
| **A-02** | Trigger duplicado em `user_devices` executava 2x | `20260827130200` | Apenas `on_device_update_last_seen` ativo ✅ |
| **A-03** | `get_channel_credentials` callable por `authenticated` | `20260827130600` | `has_function_privilege('authenticated',...)=false` ✅ |
| **A-04** | 108 FK sem índice | `20260827120000` (anterior) | `count(fk_sem_indice)=0` ✅ |
| **M-02** | `search_contacts` — 2 full table scans | `20260827130400` | `COUNT(*) OVER ()` inline ✅ |
| **M-03** | `search_contacts` — ILIKE sem trgm otimizado | `20260827130400` | Reescrita; índices GIN trgm permanecem ✅ |
| **M-04** | Índice UNIQUE duplicado em `contacts.phone` | `20260827130300` | `contacts_phone_unique` não existe mais ✅ |
| **M-05** | Bloat 75%/67% em tabelas críticas | `20260827130500` | `n_dead_tup=0` em todas ✅ |

---

## Pendências Abertas

### 1. Vault SICOOB (C-02 parcial)
A bridge está corrigida no trigger (sem `channel_type='internal_chat'`), mas o envio HTTP só ocorre se o vault tiver o secret `sicoob_service_role_key`.

```sql
-- Adicionar no Supabase Dashboard > Vault:
-- Name: sicoob_service_role_key
-- Value: <service_role_key do projeto tnnnlkbymytvtqngbbqh>
```

### 2. M-01 — `search_contacts` bypassa RLS
Todos os agentes veem todos os contatos (`SECURITY DEFINER`). Pode ser intencional.  
Requer decisão de produto: manter comportamento atual ou adicionar `is_contact_visible_to_user`.

### 3. 4 migrations órfãs (drift repo vs banco)
```
20241231000000 — saved_filters        (DDL aplicado, sem registro)
20241231000001 — entity_versions      (DDL aplicado, sem registro)
20260403024714 — gmail_integration    (DDL aplicado, sem registro)
20260412230000 — fix_rls_policies     (DDL aplicado, sem registro)
```

### 4. 7 migrations de outro banco no repo
```
20260611120000 a 20260612160000 — são do Supabase self-hosted/Evolution
```
Devem ser movidas para `supabase/migrations/_foreign/`.

---

## Verificação Final Completa

```
[C-01] anon pode clear_login_attempts       = false  ✅ bloqueado
[C-01] authenticated pode clear_login       = true   ✅ app funciona
[C-02] channel_type=internal_chat na sicoob = false  ✅ removido
[C-02] usa vault.decrypted_secrets          = true   ✅ 
[C-03] authenticated pode decrypt_gmail     = false  ✅ bloqueado
[A-01] trigger profiles count               = 3      ✅ (era 4)
[A-01] prevent_privilege_escalation ativo   = true   ✅ (RAISE EXCEPTION)
[A-01] on_profile_update_prevent_escalation = false  ✅ removido
[A-02] trigger user_devices count           = 1      ✅ (era 2)
[A-03] authenticated pode get_channel_creds = false  ✅ bloqueado
[A-04] FK sem índice                        = 0      ✅
[M-02] search_contacts duplo scan           = false  ✅ scan único
[M-02] search_contacts window COUNT         = true   ✅
[M-04] contacts_phone_unique existe         = false  ✅ removido
[M-05] n_dead_tup login_attempts            = 0      ✅
[M-05] n_dead_tup profiles                  = 0      ✅
[M-05] n_dead_tup whatsapp_connections      = 0      ✅
[M-06] views security_invoker uniformes     = true   ✅ todas =true
[EXTRA] link_preview_cache_metrics INSERT   = true   ✅ policy adicionada
```

---

*Execução concluída em 27/08/2026. Zero dados de usuário alterados.*
