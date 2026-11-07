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

### `20260930660000_talkx_v15_replied_count_guard_and_drop_increment.sql`

**Nunca aplicada — superada por bug de ordem (DROP-before-REVOKE).** A V15 original
(versão 20260930660000) executava `DROP FUNCTION IF EXISTS` ANTES de `REVOKE ALL ON
FUNCTION` — o REVOKE apontava para a função já dropada e a transação abortava com
`42883` (undefined_function). Como nunca rodou, não há drift: o ledger não tem a
versão 20260930660000 (confirmado por `hermes-db-migrar --ja-no-ledger` = "nao").

A V15 corrigida (ordem REVOKE antes do DROP) é a migration
`20260930750000_talkx_v15_replied_count_guard_and_drop_increment.sql` (mesmo nome,
versão nova). Este arquivo fica aqui só como registro histórico do bug.

### `20261020120000_e2e_fixture_message_rpc.sql`

**Nunca aplicada — movida para evitar `missing_count=2` no `db-migrate.yml` (2026-11-02).**
Função SECURITY DEFINER `public.e2e_fixture_message(p_op text)` para a suite E2E inserir
mensagens `sender='contact'` sem violar o trigger `guard_message_provenance_fields`.

Nunca foi aplicada porque a aprovação via ambiente `producao-ddl` não foi dada. A suite E2E
usa o fallback legado em `e2e/fixtures/e2e-contact.ts` enquanto a função não existir.
O comportamento do E2E é idêntico ao de antes desta migration ser escrita.

Confirmação: `SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version =
'20261020120000'` → `0` (verificado em 2026-11-02).

**Para reaplicar quando TalkX V4 / E2E forem retomados:** ver o arquivo neste diretório e
aplicar via `producao-ddl` com aprovação do Joaquim. Não mover de volta para
`supabase/migrations/`.

### `20261023100000_talkx_campaign_recipients_page_add_segment.sql`

**Nunca aplicada — movida para evitar `missing_count=2` no `db-migrate.yml` (2026-11-02).**
Adiciona parâmetro `p_segment_id uuid DEFAULT NULL` à função
`public.talkx_campaign_recipients_page` (etapa N-131 / N-095 do TalkX V4).

Nunca foi aplicada porque o TalkX V4 está congelado por decisão de 2026-11-01
(`.claude/CLAUDE.md`). A versão em produção tem 5 parâmetros (sem `p_segment_id`);
o front (`TalkXRecipientsTable.tsx:71-77`) e `types.ts:14743-14750` usam essa assinatura.

Confirmação: `SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version =
'20261023100000'` → `0` (verificado em 2026-11-02).

**Para reaplicar quando TalkX V4 for retomado:** confirmar que front e `types.ts` foram
atualizados para 6 parâmetros, então aplicar via `producao-ddl` com aprovação do Joaquim.
Não mover de volta para `supabase/migrations/`.

### `20261026240300_drop_bkp_261023.sql`

**Registrada no ledger entre os runs `42143639908` e `42270182966` de 06/11/2026.**
O ledger preserva `DROP SCHEMA _bkp_261023 CASCADE`, mas esse registro isolado não prova o efeito
no catálogo. O SQL original permanece neste diretório e é fixado por hash na evidência
`ledger-archive/registered-tombstone`. O schema `_bkp_261023` ainda existia na
consulta read-only de 07/11/2026; portanto o registro nao e tratado como prova de apply.

Na pasta ativa existe apenas um tombstone de comentários com a mesma versão. Ele mantém a paridade
arquivos/ledger sem permitir que `db push` ou replay repitam o `DROP` caso o registro do ledger seja
removido ou reparado. Nunca mover o SQL executável de volta para `supabase/migrations/`.

## Regra

Nao apagar. Nao reaplicar. Servem como registro historico do schema anterior a migracao.
Se precisar do conteudo em outro lugar, copie — nao mova de volta.
