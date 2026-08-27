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

## 3. `app.encryption_key` — NAO esta configurada

`encrypt_gmail_token` e `decrypt_gmail_token` dependem de
`current_setting('app.encryption_key', true)`. Em 27/08/2026 essa GUC **nao existe em
nenhum escopo**: nem na sessao, nem em `pg_db_role_setting` (0 de 11 entradas mencionam
`app.*`).

### Por que isso era pior do que parecia

1. As duas funcoes tinham `SET search_path TO 'public'`, mas `pgcrypto` esta instalada no
   schema `extensions`. `pgp_sym_encrypt` nunca era resolvivel — a funcao falhava **sempre**,
   nao "quando faltasse a chave".
2. `pgp_sym_encrypt` e `STRICT`. Com chave `NULL` ele retorna `NULL` **em silencio**.
   Corrigir apenas o `search_path` faria o fluxo Gmail gravar
   `access_token_encrypted = NULL` sem erro nenhum.

A migration `20260827130000` corrigiu os dois pontos: schema-qualificou
`extensions.pgp_sym_encrypt` e adicionou `RAISE EXCEPTION` explicito quando a chave falta.

### Antes de ligar o fluxo Gmail

Configure a chave num escopo persistente e **nao** no codigo da aplicacao:

```sql
-- escopo de banco, sobrevive a reconexao
ALTER DATABASE postgres SET app.encryption_key = '<chave>';
```

Alternativa preferivel: guardar a chave no `vault` do Supabase e ler por
`vault.decrypted_secrets` dentro das proprias funcoes, eliminando a GUC. Isso muda a
assinatura do par de funcoes — decida antes de popular `gmail_accounts`, que hoje tem
0 linhas.

### Verificacao

```sql
SELECT current_setting('app.encryption_key', true) IS NOT NULL AS configurada;
SELECT count(*) FROM pg_db_role_setting
WHERE array_to_string(setconfig,',') ILIKE '%app.encryption_key%';
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

## 6. Teste de regressao (etapa 76)

O ACL de `mcp_exec` ainda **nao** tem teste automatizado. O job `catalog-fresh` do
`db-guard.yml` roda semanalmente com `DESTINO_URL` e e o lugar natural para adicionar a
assercao. Query pronta na secao 1.
