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
anexada a nenhuma trigger. Uma trigger `BEFORE` nao consegue mascarar coluna em `SELECT` —
o proprio comentario no corpo admite isso. A etapa 67 do plano mandava anexa-la; isso foi
deliberadamente **nao** executado, porque criaria aparencia de controle sem controle.
Decidir entre implementar mascaramento real ou remover a funcao.

---

## 5. Policies permissivas

28 policies usam `USING(true)` ou `WITH CHECK(true)`:

- **4 em `service_role`** — irrelevante, `service_role` bypassa RLS de qualquer forma.
- **24 SELECT para `authenticated`** em tabelas de catalogo e configuracao
  (`queues`, `tags`, `products`, `stickers`, `permissions`, `business_hours`,
  `sla_configurations`, `whatsapp_templates`, etc).

O sistema e single-tenant, entao visibilidade de catalogo para qualquer usuario logado e
decisao de design, nao bug. **Nao mude sem decisao de negocio.** Levantamento:

```sql
SELECT tablename, policyname, cmd, array_to_string(roles,'+') AS roles
FROM pg_policies
WHERE schemaname='public' AND (qual = 'true' OR with_check = 'true')
ORDER BY tablename, policyname;
```

---

## 6. Teste de regressao (etapas 76 e 96)

O ACL de `mcp_exec` e verificado automaticamente no job `catalog-fresh` do
`db-guard.yml`, que roda em todo `workflow_dispatch` e no cron semanal (segunda 06h UTC).

O job falha se `authenticated` ou `anon` tiver `EXECUTE` em qualquer uma das duas funcoes.
Query de verificacao na secao 1. Ultimo resultado verde: run #89 (dispatch 2026-08-29).

---

## 7. `reassign_absent_agents` — proxy de presenca via `user_sessions`

**Contexto:** a funcao tinha bug de runtime — referenciava `profiles.last_seen_at`
(coluna inexistente). Corrigida pela migration `20260829020000_fix_reassign_absent_agents_last_seen_at`.

### Logica atual

Agente e considerado "ausente" se nao tiver sessao ativa com `last_activity_at` recente:

```sql
NOT EXISTS (
  SELECT 1 FROM user_sessions us
  WHERE us.user_id = p.user_id
    AND us.is_active = true
    AND us.last_activity_at > now() - (inactive_minutes || ' minutes')::interval
)
```

Agente substituto deve ter sessao ativa recente (criterio inverso).

### Risco: sessoes stale

`user_sessions.is_active = true` pode persistir para sessoes que expiraram na pratica
(logout sem invalidacao, crash de browser). Nesse cenario, o agente parece "ativo"
mesmo offline — `reassign_absent_agents` nao o reatribuiria.

**Mitigacao recomendada:** adicionar `pg_cron` para expirar sessoes automaticamente:

```sql
-- Desativar sessoes expiradas (adicionar ao pg_cron como job diario)
UPDATE user_sessions
SET is_active = false
WHERE is_active = true AND expires_at < now();
```

### Guard de autorizacao

A funcao exige perfil `admin` ou `supervisor` (implementado em `20260828000000`).
`authenticated` sem esse perfil recebe `RAISE EXCEPTION` antes de acessar dados.

### Verificacao

```sql
-- Sessoes ativas com last_activity_at recente (ultimas 30 min)
SELECT p.id, p.is_active, us.last_activity_at, us.expires_at, us.is_active AS sess_ativa
FROM profiles p
LEFT JOIN user_sessions us ON us.user_id = p.user_id AND us.is_active = true
WHERE p.is_active = true
ORDER BY us.last_activity_at DESC NULLS LAST;

-- Sessoes com is_active=true mas expires_at vencido (stale)
SELECT count(*) AS sessoes_stale
FROM user_sessions
WHERE is_active = true AND expires_at < now();
```
