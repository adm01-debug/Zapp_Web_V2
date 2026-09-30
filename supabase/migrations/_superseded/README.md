# `_superseded/` — migrations superadas por outras ja registradas

**Criado em:** 27/08/2026
**Origem:** `docs/audits/AUDITORIA_MIGRACAO_DB_2026-08-27.md`, achado **A-05** — **com correcao**

## Correcao do relatorio de auditoria

O relatorio de 27/08/2026 classificou estes 4 arquivos como *"Grupo 1 — DDL aplicado,
registro ausente"* e a etapa 3-6 do plano mandava registra-los em `schema_migrations`
como ja aplicados.

**Isso estava errado.** A classificacao usou apenas `to_regclass('public.<tabela>')`, que
so responde "a tabela existe". Comparacao objeto a objeto (policies, triggers, indices,
constraints, colunas) mostra que a DDL **destes arquivos** nunca rodou no destino — as
tabelas foram criadas por **outras** migrations, ja registradas, com formato diferente.

Registra-los como aplicados seria gravar uma afirmacao falsa em `schema_migrations`.

## Rastreamento da origem real

```sql
SELECT m.version, m.name
FROM supabase_migrations.schema_migrations m
WHERE array_to_string(m.statements,' ') ILIKE '%CREATE TABLE%<tabela>%';
```

| Objeto | Criado de fato por | Status |
|---|---|---|
| `saved_filters` | `20260315163251` + `20260315172343` | registradas |
| `entity_versions` | `20260315172343` | registrada |
| `gmail_accounts`, `email_threads` | `20260403105341` | registrada |

## Divergencias que provam a supersessao

### `20241231000000_saved_filters.sql`
| Item | No arquivo | No banco |
|---|---|---|
| Policy SELECT | `Users can view own filters` | `Users can view own saved filters` (+ `Users can view shared filters`) |
| Trigger updated_at | `trigger_saved_filters_updated_at` | `update_saved_filters_updated_at` |
| Trigger default | `trigger_single_default_filter` | `ensure_single_default_filter_trigger` |
| Indices | 4 declarados | 1 (`idx_saved_filters_user_entity`) |
| `unique_filter_name_per_user_entity` | declarada | **ausente** |
| `update_saved_filters_updated_at()` | criada | **nao existe como funcao** |

### `20241231000001_entity_versions.sql`
| Item | No arquivo | No banco |
|---|---|---|
| Coluna de data | `changed_at` | `created_at` |
| Policies | `Users can view versions` **USING (true)** | `Admins can view entity versions` / `Block authenticated version inserts` |

Aplicar este arquivo hoje **abriria `entity_versions` para qualquer autenticado**.

### `20260403024714_gmail_integration.sql`
| Item | No arquivo | No banco |
|---|---|---|
| Tokens | `access_token text`, `refresh_token text` (**texto puro**) | `access_token_encrypted bytea`, `refresh_token_encrypted bytea` |
| Dono da conta | `profile_id` | `user_id` |
| `email_attachments` | criada | **nao existe** |
| `CREATE TABLE` | sem `IF NOT EXISTS` | — |

Hard-fail garantido no push, e o schema que ele descreve e menos seguro que o atual.

### `20260412230000_fix_rls_policies_security.sql`
Patch de RLS escrito **para o schema antigo**. Referencia `email_attachments` (inexistente)
e substitui policies que ja nao existem com esses nomes. As policies atuais do destino sao
mais estritas que as que este arquivo proporia — ex.: `global_settings` hoje e admin-only,
e o arquivo mantinha `USING(true)` "por design".

### `20260930120000_harden_default_privileges_revoke_anon_execute.sql`

**Redundante e nao-aplicavel em producao.** Este arquivo (item 5 da auditoria adversarial,
onda 2) usava `ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin`, que exige SUPERUSER. O caminho
de escrita de producao (`mcp_exec`, SECURITY DEFINER owner `postgres`) roda como `postgres`, que o
repo rebaixou (`rolsuper=false`) por endurecimento — resultado: `42501 permission denied to change
default privileges` na aplicacao pos-merge (PR #1255).

O objetivo do arquivo **ja foi cumprido por outras migrations, corretamente**:

- `20260930113613_revoke_anon_default_privileges_and_gamification_rpcs.sql` — `ALTER DEFAULT
  PRIVILEGES FOR ROLE postgres ... REVOKE ALL ON TABLES/FUNCTIONS/SEQUENCES FROM anon` (o `FOR ROLE
  postgres` aplica como nao-superuser) + revoke de anon/PUBLIC nas 13 funcoes (incluindo as 6
  trigger functions que este arquivo revogaria).
- `20260930130000_revoke_public_ai_analysis_functions.sql` — revoke nas 5 funcoes de analise de IA.

Como todas as 225 funcoes de `public` sao de `postgres`, o default que importa e o de `postgres`
(coberto por 20260930113613) — o `FOR ROLE supabase_admin` deste arquivo era desnecessario desde o
inicio. Nao aplicar, nao reaplicar; a cobertura equivalente ja existe.

## Regra

Nao apagar. Nao reaplicar. Servem como registro historico do schema anterior a migracao.
Se precisar do conteudo em outro lugar, copie — nao mova de volta.
