# SYNC-AG4b — Fotografia do banco canônico via canal RO (F10–F13)

Cartão: t_db1b5daa (worker sql). Data da medição: 17/10/2026.
Fonte: **canal RO para agentes** (`zapp-db-ler "SQL"`), somente `SELECT`/`WITH` de uma
instrução, schemas `vault`/`pgsodium`/`auth` proibidos, no máximo 500 linhas por consulta.
Base de arquivo comparada: `supabase/migrations/**` de `origin/main` no commit
`a9b4d6c6fb35625e8a4794895f733ce696201b28`, e o manifesto commitado
`supabase/schema-manifest.json` (`generated_at` `2026-10-16T18:17:30Z`).

Este documento é a **fotografia** exigida pelo gate 150. Ele **não aplica nada**: nenhuma
migration foi criada, nenhum push/PR/merge, nenhum objeto do banco canônico foi alterado.
Toda leitura aqui é de **catálogo/metadado**; nenhuma linha de tabela de usuário
(contatos, mensagens, pagamentos) foi lida.

Artefatos de apoio (CSV/JSON) ficam em `.tmp/sync/` (ignorado pelo git); não entram no
commit porque são gerados. O bloco de consultas reproduzíveis na seção 3 regera cada um.

## F10 — Identidade e ledger

Identidade (uma consulta):

| item | valor |
| --- | --- |
| `current_database()` | `postgres` |
| `current_user` do canal | `postgres` (canal de leitura) |
| `version()` | `PostgreSQL 17.6 on x86_64-pc-linux-gnu, 64-bit` |

Schemas visíveis (12), excluídos por regra do canal `auth`/`vault`/`pgsodium`:
`cron`, `extensions`, `graphql`, `graphql_public`, `net`, `ops`, `ops_backup`,
`pgbouncer`, `public`, `realtime`, `storage`, `supabase_migrations`.

Ledger de migrations aplicadas — relação `supabase_migrations.schema_migrations`
(colunas `version text`, `statements text[]`, `name text`):

| leitura | valor |
| --- | --- |
| linhas / versões distintas | **912 / 912** |
| menor versão | `20251215024517` |
| maior versão | `20261016230000` |
| `supabase_migrations.version_reservations` | 302 |

Ranking por mês (prefixo `AAAAAM` da versão):

| mês | aplicadas | mês | aplicadas |
| --- | --- | --- | --- |
| 202512 | 42 | 202608 | 63 |
| 202603 | 67 | 202609 | 401 |
| 202604 | 137 | 202610 | 192 |
| 202605 | 3 | | |
| 202606 | 7 | **total** | **912** |

Não há versão com prefixo `202607` (nenhuma migration em julho/2026).

Confronto com os **arquivos** versionados de `origin/main`:
`supabase/migrations/**/*.sql` = **1071 arquivos**, **1066 versões distintas** (14 dígitos).

## F11 — Drift nos 4 conjuntos

### (a) arquivo sem ledger — 153 versões
153 versões com arquivo em `origin/main` e **nenhuma linha** no ledger. **Todas as 153 são
anteriores** à maior versão aplicada (`20261016230000`) — ou seja, são buracos no meio da
série, não migrations "do futuro". Lista: `.tmp/sync/f11a-arquivo-sem-ledger.csv`.

### (b) ledger sem arquivo — 1 versão
`20261016120000` — nome no ledger `security_fixes_passkey_purge_gmail_search_events`.
Essa migration **foi aplicada no canônico e não existe** em `origin/main`. É a única das
912 sem arquivo correspondente.
Lista: `.tmp/sync/f11b-ledger-sem-arquivo.csv`.

### (c) conteúdo/hash diferente — NÃO MENSURÁVEL pelo ledger (limitação medida)
O ledger **não guarda hash**, e a coluna `statements` **não é cópia fiel do arquivo**:

- **62** das 912 linhas têm `statements` vazio/nulo (nenhuma instrução guardada);
- no caso testado `20261016190000_fix_security_definer_search_path_batch2`, o ledger
  guarda `array_length(statements,1)=1` com **408 bytes**, contra **1690 bytes** do arquivo
  — o `md5` conferido dentro do banco bate com o `md5` do texto de 408 B, provando que o
  **valor já está reduzido na origem**, não é corte do canal (um literal de 1000 bytes
  volta com `length=1000`).

Conclusão: **não é possível** provar "mesmo conteúdo" pelo ledger. O que o ledger prova é
**presença** (versão aplicada). A comparação de conteúdo depende de **F12** (objetos no
canônico x manifesto) e do replay local (doc `SYNC-AG4-F14`).

### (d) ordem fora — buracos e colisão de timestamp
- **Buracos**: as 153 versões do item (a) são todas anteriores ao topo da série — ordem
  "furada" (arquivo existe desde antes, nunca aplicado). `.tmp/sync/f11d-ordem-buracos.csv`.
- **Colisão `20261016220000`**: dois arquivos em `origin/main` com o mesmo timestamp —
  `20261016220000_fix_domain_case_sensitivity.sql` (DDL) e
  `20261016220000_search_events_rls_decision.sql` (só comentário). O ledger registra
  **um** só: `fix_domain_case_sensitivity`. Como o segundo não executa DDL, a aplicação
  não muda de resultado (mesma conclusão do F14, agora confirmada no canônico).
- **Arquivos fora do padrão de versão** (6, não são migrations): `multiplix_count_audience`,
  `multiplix_list_ramos`, `multiplix_list_ufs`, `multiplix_resolve_recipients`,
  `multiplix_search_audience`, `seed-talkx-connection` (em `supabase/migrations/` sem
  prefixo de 14 dígitos).

## F12 — Manifesto (16/10) x canônico (17/10), só `public`

| conjunto | manifesto 16/10 | canônico medido | delta |
| --- | --- | --- | --- |
| policies | 448 | **456** | +8 |
| triggers (não internos) | 123 | **129** | +6 |
| functions (`prokind='f'`) | 332 | **353** | +21 |
| tabelas com RLS | 168 | **171** | +3 |

(Policies em todos os schemas não-sistema: 489; triggers não internos idem: 140.)

Leitura: o retrato commitado em 16/10 está **atrás** do banco canônico em todos os 4
conjuntos. Isso é esperado se migrations foram aplicadas depois de 16/10 e o manifesto não
foi regerado no mesmo ritmo — mas o delta **só se fecha** com o replay local + regeração do
manifesto (Portão D2 do F14, decisão do Joaquim). **O manifesto commitado não deve ser
usado como fonte de verdade do canônico.**

## F13 — RLS e definers (catálogo, sem conteúdo de linhas)

RLS por tabela (`pg_class.relrowsecurity` + contagem de `pg_policies`), 171 tabelas em
`public`:

- **171 / 171** tabelas com RLS **habilitado**; **0 sem RLS**.
- **162** tabelas com **≥1 policy**.
- **9** tabelas com RLS e **0 policies** (negam tudo por padrão — confirmar se é
  intencional; são de serviço/rate-limit/cache):
  `ai_budget_reservations`, `ai_jobs`, `catalog_rate_limit_hits`, `catalog_rate_limits`,
  `edge_rate_limits`, `gmail_oauth_states`, `link_preview_cache`,
  `talkx_storage_purge_queue`, `talkx_test_send_claims`.
- Tabelas com mais policies: `message_reactions` (7), `profiles` (6),
  `ai_conversation_tags`/`conversation_tasks`/`saved_filters`/`talkx_campaign_segments`/
  `talkx_campaigns`/`team_message_reactions`/`user_devices`/`user_service_accounts` (5).

CSV completo: `.tmp/sync/f13-rls-por-tabela.csv` (tabela, rls, n_policies).

Definers (`pg_proc.prosecdef`, só `public`):

- **298** funções `SECURITY DEFINER` (**nomes apenas**; CSV `.tmp/sync/f13-definers.csv`).
- **0** definers sem `search_path` configurado (`proconfig`) — a higiene exigida pelo
  `funcao-segura-no-banco` está aplicada no canônico no momento da foto.

## 1. O que está provado e o que não está

**Provado (leitura RO, cada consulta auditada):** identidade; 912 versões no ledger;
ranking por mês; 153 arquivos sem ledger; 1 versão no ledger sem arquivo; colisão de
timestamp; contagens de policies/triggers/functions/RLS no canônico; 171/171 tabelas com
RLS; 9 tabelas RLS-sem-policy; 298 definers, 0 sem `search_path`.

**Não provado / limitação:** igualdade de conteúdo por hash (item F11c) — o ledger não
guarda hash e o `statements` está reduzido; isso fica para F12 + replay local.

**Não feito de propósito:** nenhuma DDL, nenhuma migration, nenhum push/PR/merge, nenhuma
linha de tabela de usuário lida.

## 2. Portões (não sou eu quem fecha)

- **D1** — aplicar as 195 migrations origin-only na cópia do dia (F14).
- **D2** — regerar `supabase/schema-manifest.json` + alinhar `supabase/tests` (dono autoriza).
- **D3** — qualquer aplicação em produção: proibida sem ordem explícita do Joaquim.
- **Novo (AG4b)** — reconciliar a versão `20261016120000` (aplicada no canônico, sem
  arquivo) e revisar as **9 tabelas RLS-sem-policy**.

## 3. Consultas reproduzíveis (colar no canal RO)

```sql
-- identidade
select current_database() as db, current_user as usr, version() as version;
-- ledger: total, extremos
select count(*) total, count(distinct version) distintos, min(version) menor,
       max(version) maior from supabase_migrations.schema_migrations;
-- ranking por mês
select substring(version,1,6) mes, count(*) aplicadas
  from supabase_migrations.schema_migrations group by 1 order by 1;
-- lista do ledger (paginar de 500 em 500)
select version||'|'||coalesce(name,'') v from supabase_migrations.schema_migrations
 order by version limit 500 offset 0;
-- RLS por tabela
select c.relname tabela, c.relrowsecurity rls,
       (select count(*) from pg_policies p where p.schemaname='public'
         and p.tablename=c.relname) n_policies
  from pg_class c join pg_namespace n on n.oid=c.relnamespace
 where n.nspname='public' and c.relkind='r' order by 1 limit 500;
-- definers (nomes)
select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.prosecdef order by 1 limit 500;
```
