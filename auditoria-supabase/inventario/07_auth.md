# Inventário — Auth, Usuários e Storage Realtime

**Data**: 2026-10-24 | **Projeto**: tnnnlkbymytvtqngbbqh  
**Método**: `auth.users` (contagem/agregados), `auth.mfa_factors`, `pg_policies` (schema storage), schema público para Realtime

## Resumo

| Categoria | Valor |
|-----------|-------|
| Total de usuários auth | 10 |
| MFA factors cadastrados | **0** (HIGH-7) |
| Providers ativos | email, google |
| Buckets auditados | 9 (ver inventario/05_buckets.md) |
| Tabelas para Realtime ausentes no schema | 3 (MEDIUM-9) |

---

## Usuários (10)

Evidência (re-executada 2026-10-24T22:00 UTC):
```sql
SELECT count(*) FROM auth.users;
-- Resultado: 10
```

Distribuição por provider (sem PII):
```sql
SELECT raw_app_meta_data->>'provider' AS provider, count(*)
FROM auth.users GROUP BY 1 ORDER BY 1;
-- email: 8 | google: 2
```

Dados de PII (emails, nomes) não registrados neste inventário.

---

## MFA (0 factors) — HIGH-7

Evidência (re-executada 2026-10-24T22:00 UTC):
```sql
SELECT count(*) FROM auth.mfa_factors;
-- Resultado: 0
```

**Impacto**: Nenhum dos 10 usuários tem MFA ativo. Com acesso à dashboard do Supabase (project `tnnnlkbymytvtqngbbqh`) e à Evolution GO, um único fator comprometido (senha) é suficiente para acesso total ao sistema.

**Correção**: Habilitar MFA obrigatório em Auth Settings da dashboard do Supabase para todos os usuários (TOTP via app). Não requer migration.

**Esforço**: 15 min (configuração no dashboard)

---

## Tabelas ausentes do schema para Realtime — MEDIUM-9

Tabelas que recebem subscrições Realtime no front (identificadas por `RELATORIO.md` Seção 9 e inventario/01_schemas_e_tabelas.md):

| Tabela | Presente em `supabase/schema-manifest.json` | Observação |
|--------|---------------------------------------------|------------|
| `conversations` | ❌ ausente | Core do inbox — Realtime subscribed |
| `tasks` | ❌ ausente | Tarefas de usuário |
| `accounts` | ❌ ausente | Contas/organizações |

**Causa**: drift entre produção e schema-manifest.json — estas tabelas existem no banco mas não foram geradas no manifesto (HIGH-6 do relatório principal e MEDIUM-9 desta auditoria).

**Impacto**: `db-live-guard` pode acusar drift nestas tabelas. Regenerar `schema-manifest.json` com `types-sync` corrige.

---

## Política de sessions e tokens

```sql
-- Verificar sessões ativas (apenas contagem):
SELECT count(*) FROM auth.sessions WHERE not_after > now();
-- Resultado: verificado via auth_list_sessions — count não disponível via SQL direto
```

Sessões com refresh_token longo: sem dados de expiração inesperada encontrados.

---

## Achados desta seção

- **HIGH-7**: 0 usuários com MFA ativo em sistema de produção com 10 usuários
- **MEDIUM-9**: `conversations`, `tasks`, `accounts` ausentes do schema-manifest (Realtime subscribed mas não documentadas)
