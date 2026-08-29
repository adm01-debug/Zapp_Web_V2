# Seguranca do banco — notas operacionais

Complementa o `SECURITY.md` da raiz, que trata de politica e reporte de vulnerabilidade.
Este arquivo cobre o que e especifico do PostgreSQL/Supabase.

**Origem:** etapas 74, 75 e 76 do plano em `docs/audits/AUDITORIA_MIGRACAO_DB_2026-08-27.md`.

---

## 1. `mcp_exec` e `mcp_exec_many` — SQL arbitrario

Duas funcoes `SECURITY DEFINER` no schema `public` que executam SQL arbitrario. **Nao sao
da aplicacao** — sao infraestrutura do gateway MCP usado para operar o banco.

```
public.mcp_exec(text, integer)        -> jsonb
public.mcp_exec_many(text[], integer) -> jsonb
```

### ACL exigido

```
mcp_exec       -> {postgres=X/postgres, service_role=X/postgres}
mcp_exec_many  -> {postgres=X/postgres, service_role=X/postgres}
```

`authenticated`, `anon` e `PUBLIC` foram revogados pela migration `20260827000100`.
**Se `EXECUTE` voltar para `authenticated` ou `anon`, qualquer usuario logado tem SQL
arbitrario como superusuario.**

### Verificacao

```sql
SELECT p.proname, p.proacl
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname IN ('mcp_exec','mcp_exec_many');
```

O resultado nao deve conter `authenticated=` nem `anon=` nem `=X/` sem role.

### Risco residual aceito

Quem tem a `service_role key` do projeto tem SQL arbitrario. Isso e verdade com ou sem
estas funcoes — a `service_role` bypassa RLS por definicao. O que muda e a superficie:
com `mcp_exec`, uma chave vazada permite DDL, nao apenas DML. Por isso a rotacao da
chave e o controle real, nao o ACL.

---

## 2. Rotacao da `service_role key`

| Campo | Valor |
|---|---|
| Projeto | `tnnnlkbymytvtqngbbqh` |
| Ultima rotacao registrada | *nao registrada* — preencher na proxima |
| Periodicidade alvo | 90 dias, e imediatamente apos qualquer suspeita de vazamento |

Apos rotacionar, atualizar em todos os consumidores:

- secrets das edge functions do projeto
- os MCP servers em Cloudflare Workers que apontam para este banco
- o secret `DESTINO_URL` no GitHub (usado por `db-guard.yml` e `supabase-sync.yml`)

Registre a data nesta tabela no mesmo PR da rotacao.

---

## 3. Criptografia de tokens Gmail — VAULT (implementado em 27/08/2026)

`encrypt_gmail_token` e `decrypt_gmail_token` foram refatoradas pela migration
`20260827210000_gmail_crypto_vault` para usar o vault do Supabase em vez de uma GUC.

**Estado atual:** chave `gmail_encryption_key` presente em `vault.decrypted_secrets`.
As funcoes leem a chave via `SELECT decrypted_secret FROM vault.decrypted_secrets WHERE
name='gmail_encryption_key'` e levantam `RAISE EXCEPTION` se estiver ausente.

A GUC `app.encryption_key` **nao e mais usada**. Nao reintroduza
`current_setting('app.encryption_key')` — o mecanismo mudou.

### Por que o vault foi escolhido sobre a GUC

1. A GUC exigia `ALTER DATABASE postgres SET app.encryption_key = '<chave>'` — visivel
   em `pg_db_role_setting` para qualquer `superuser`.
2. O vault do Supabase usa `pgsodium` para cifrar o valor em repouso. So funcoes com
   `SECURITY DEFINER` que chamam `vault.decrypted_secrets` conseguem ler o plaintext.
3. Zero config extra: a chave e gerada em-banco e nunca transita pelo codigo da aplicacao.

### Verificacao

```sql
-- Chave presente (sem expor o valor)
SELECT id, name, created_at FROM vault.secrets WHERE name = 'gmail_encryption_key';

-- Roundtrip criptografico funcionando
SELECT public.decrypt_gmail_token(
  public.encrypt_gmail_token('TOKEN_TESTE')
) = 'TOKEN_TESTE' AS roundtrip_ok;

-- NULL-safe: deve retornar NULL sem RAISE
SELECT public.decrypt_gmail_token(NULL) IS NULL AS null_safe;
```

---

## 4. `channel_connections.credentials`

A protecao real e a policy RLS `"Admins full access to channels"`
(`has_role(auth.uid(),'admin')`) mais a view `channel_connections_safe`, que omite a coluna.

`mask_channel_credentials()` **nao** protege nada: o corpo e `RETURN NEW` e ela nao esta
anexada a nenhuma trigger. Decidir entre implementar mascaramento real ou remover a funcao.

---

## 5. Policies permissivas

28 policies usam `USING(true)` ou `WITH CHECK(true)`:

- **4 em `service_role`** — irrelevante, `service_role` bypassa RLS de qualquer forma.
- **24 SELECT para `authenticated`** em tabelas de catalogo e configuracao.

O sistema e single-tenant, entao visibilidade de catalogo para qualquer usuario logado e
decisao de design, nao bug. **Nao mude sem decisao de negocio.**

---

## 6. Teste de regressao (etapas 76 e 96)

O ACL de `mcp_exec` e verificado automaticamente no job `catalog-fresh` do
`db-guard.yml`, que roda em todo `workflow_dispatch` e no cron semanal.

---

## 7. `reassign_absent_agents` — proxy de presenca via `user_sessions`

**Contexto:** a funcao tinha bug de runtime — referenciava `profiles.last_seen_at`
(coluna inexistente). Corrigida pela migration `20260829020000`.

### Logica atual

```sql
NOT EXISTS (
  SELECT 1 FROM user_sessions us
  WHERE us.user_id = p.user_id
    AND us.is_active = true
    AND us.last_activity_at > now() - (inactive_minutes || ' minutes')::interval
)
```

### Risco: sessoes stale

`user_sessions.is_active = true` pode persistir para sessoes que expiraram. Mitigacao
recomendada: `pg_cron` diario que desativa `WHERE expires_at < now()`.

### Guard de autorizacao

A funcao exige perfil `admin` ou `supervisor` (migration `20260828000000`).

---

## 8. `gmail-incremental-sync` — autenticacao via vault

O cron `*/5 * * * *` chama a edge `gmail-cron-sync` com header `x-cron-secret`.
O secret e lido de `vault.decrypted_secrets WHERE name='gmail_cron_secret'` em runtime.

**Nao existe secret hardcodado em `cron.job.command`.**

### Dependencias de reset

Em `supabase db reset`, recriar manualmente no vault:
```sql
SELECT vault.create_secret('<uuid-do-secret>', 'gmail_cron_secret');
```
E configurar o mesmo UUID no secret `CRON_SECRET` da edge function.

### Verificacao

```sql
SELECT command ILIKE '%vault%' AS usa_vault FROM cron.job WHERE jobname='gmail-incremental-sync';
```

---

## 9. `clear_login_attempts` — historico de bugs e versoes

A funcao passou por 2 reescritas:

1. **Pre-auditoria:** sem guard. Qualquer usuario limpava tentativas de qualquer email.
2. **20260829090000:** guard com `IS DISTINCT FROM coalesce(auth.jwt()->>'email', '')`. Valido.
3. **20260829100000 (atual):** `NOT (auth.role()='authenticated' AND LOWER(auth.jwt()->>'email') = LOWER(p_email))`. Mais legivel.

As versoes 090000 e 100000 sao funcionalmente equivalentes. 100000 e a canonicamente correta.

### Verificacao

```sql
SELECT prosrc ILIKE '%auth.jwt()->>%email%' AND prosrc ILIKE '%RAISE EXCEPTION%' AS guard_ok
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname='clear_login_attempts';
```

---

## 10. `email_messages` — ausencia de DELETE policy (intencional)

**Decisao:** `email_messages` nao tem policy DELETE para `authenticated`.

**Racional:**
- Deletar uma `email_thread` elimina por CASCADE todas as mensagens. Thread delete = message delete.
- Deletar mensagem individual sem deletar thread criaria inconsistencia (`message_count`, `snippet`).
- O fluxo de email padrao arquiva/move threads, nunca deleta mensagens individuais.
- Adicionando DELETE exigiria trigger de manutencao de `message_count` — complexidade desnecessaria.

**Estado das policies:**

| CMD | Roles | Observacao |
|---|---|---|
| SELECT | authenticated | Via FK com gmail_accounts |
| UPDATE | authenticated | Marcar lida, estrelar |
| DELETE | **ausente** | Intencional — ver acima |
| INSERT | **ausente** | So via service_role/edges |
