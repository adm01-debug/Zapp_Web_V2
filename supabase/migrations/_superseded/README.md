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

## Regra

Nao apagar. Nao reaplicar. Servem como registro historico do schema anterior a migracao.
Se precisar do conteudo em outro lugar, copie — nao mova de volta.

---

## `20260926410000_add_fk_support_indexes.sql` — duplicata funcional, nao incorrecao

**Movido em:** 27/09/2026
**Origem:** auditoria de 5 agentes coordenada nesta sessao, validando o fechamento do E17.

Diferente dos 4 arquivos acima, o SQL deste arquivo **esta correto e bate com o banco vivo**
— nao e o caso "DDL nunca rodou". O problema e outro: duas sessoes de IA em paralelo
resolveram o mesmo achado (5 colunas FK do E17 sem indice de apoio) de forma independente,
minutos uma da outra:

- PR #900, merge `9a718d1` (20260926T20:30:38Z) — criou `20260926250000_e17_fk_indexes.sql`.
- PR #899, merge `ad80651` (20260926T20:32:39Z, ~2min depois) — criou este arquivo.

Os dois tem os mesmos 5 `CREATE INDEX` byte-identicos (so o comentario de cabecalho difere):
`idx_gmail_accounts_user_id`, `idx_message_templates_user_id`, `idx_query_telemetry_user_id`,
`idx_webauthn_challenges_user_id`, `idx_whatsapp_connections_instance_token_secret_id`.

No banco vivo isso e inocuo — existe exatamente 1 copia fisica de cada indice (confirmado via
`pg_indexes`), porque uma das duas sessoes encontrou os indices ja criados pela outra antes de
aplicar sua propria DDL. Mas um **replay do zero em ordem de version** (`supabase db reset`,
disaster recovery, ambiente novo) executaria `20260926250000` primeiro (sucesso) e depois este
arquivo — `CREATE INDEX` sem `IF NOT EXISTS` — e falharia com "already exists", travando o
replay a partir dali.

**A versao que prevalece e `20260926250000_e17_fk_indexes.sql`** (mergeada 2min antes). O
registro `20260926410000` **permanece** em `supabase_migrations.schema_migrations` — nao foi
apagado, e evidencia historica valida de que essa sessao tambem aplicou (ou encontrou aplicado)
o mesmo fix. Só o arquivo mudou de lugar, para nao quebrar um replay futuro.
