# Auditoria de segurança do banco — item 092 (plano-sync)

- Data: 2026-10-17
- Especialista: worker (auth) — area-auth-seguranca
- Escopo: RLS, grants, definers e realtime — **retrato canônico** (banco de produção, leitura via `zapp-db-ler` RO) **x arquivos** (migrations do repositório)
- Limite: **nenhuma alteração de banco** foi executada. Somente leitura.

## 1. Como foi medido

- Canônico: consultas somente-leitura via `zapp-db-ler` (wrapper RO; 1 SELECT por chamada, teto de 500 linhas). Funções ausentes da lista branca do wrapper não são auditáveis por aqui.
- Arquivos: checkout da branch sob trabalho `v2/sync20-10-seguranca-banco-rls-…`, base `dia/2026-10-17`, **878 migrations**. Para classificar cada divergência também conferi a branch `main` (**1064 migrations**), porque parte do canônico só existe lá.
- Snapshot derivado versionado: `supabase/schema-manifest.json` (gerado em **2026-10-09T16:18:59Z**).

## 2. Matriz de divergências

| Eixo | Canônico (prod, hoje) | Arquivos (branch V2) | Divergência | Risco |
|---|---|---|---|---|
| **RLS** | 171 tabelas com RLS ligada; **0 tabelas public sem RLS** | 174 objetos com `ENABLE ROW LEVEL SECURITY` (nomes distintos) | 3 tabelas em prod **sem** `ENABLE RLS` nos arquivos V2: `app_settings`, `connection_alert_preferences`, `search_events`. 6 objetos nos arquivos **sem** tabela RLS no canônico: `outbox_events`, `ai_usage_outbox`, `contact_tags`, `tags`, `lid_audit_snapshot_20260902`, `profiles_public` (no canônico é **view**) | **Médio.** `connection_alert_preferences` e `search_events` existem em `main` (`20261013044440_…`, `20261016013134_…`) → lacuna de branch, não de prod. **`app_settings` não tem migration em lugar nenhum** (nem V2 nem main) → objeto órfão no canônico. Os 6 "só arquivo" são tabelas V2 ainda não deployadas (baixo). |
| **Policies** | 456 policies em `public` | ≥780 `CREATE POLICY` declaradas (soma histórica; inclui versões substituídas) | **9 policies existem em prod e não na V2**: 4 em `connection_alert_preferences`, 1 em `app_settings`, 1 em `search_events`, 1 `conversation_tasks.tasks_select_contact_visible`, 1 `voice_command_logs` (delete próprio), 1 `whisper_messages` (marcar lido). Todas menos a de `app_settings` existem em `main`. | **Médio/baixo.** Regras de visibilidade de `conversation_tasks`/`whisper_messages`/`voice_command_logs` vivem só em prod × `main`; a de `app_settings` é órfã como a tabela. |
| **Grants** | `anon` 810 · `authenticated` 1041 · `service_role` 1234 · `postgres` 1281 (role_table_grants, public). `pg_default_acl`: tabelas novas nascem com `arwdDxtm` para `anon`/`authenticated` | baseline autoral (`scripts/db-audit/check-grants-fresh.mjs`, precisa de psql ao prod — não rodável no modo RO) | Não há comparação 1:1 por `zapp-db-ler`. Ponto duro medido: **`anon` tem INSERT/UPDATE/DELETE/TRUNCATE em ≥114 tabelas** (default do Supabase) → **a RLS é o único portão** | **Alto se** qualquer tabela perder RLS ou ganhar policy permissiva para `anon`. Hoje: **1 única policy para `anon`** no canônico (`webauthn_challenges`) e ela é **deny** (`USING false`, `WITH CHECK false`) → fechado. Risco é de regressão, não estado atual. |
| **Definers** | 298 funções `SECURITY DEFINER` public; **todas com `search_path` fixo**; **0 executáveis por `anon`**; **0 com ACL default** (`proacl null`) | 356 nomes de `CREATE FUNCTION` | **18 definers em prod sem `CREATE FUNCTION` na V2**. Conferidos: `admin_unlock_login`, `purge_gmail_account_data`, `get_team_birthdays`, `delivery_stats`, `my_network_status`, `inbox_wait_summary` existem em `main` (15–16/10). `admin_unlock_login` lida com login: confere `public.is_admin(auth.uid())` antes de agir e só `authenticated` executa. | **Baixo em segurança** (postura correta: search_path fixo, sem exec anon, guardas presentes). **Médio em sincronização**: defeito de branch, não de prod. |
| **Realtime** | publication `supabase_realtime`: **33 tabelas**. Também existe `supabase_realtime_messages_publication` (7 partições `messages_2026_10_14..20`) | 39 `ADD TABLE` distintos em `supabase_realtime` | **4 publicadas em prod sem `ADD TABLE` na V2**: `agent_achievements`, `email_messages`, `email_threads`, `team_message_reactions`. **10 declaradas nos arquivos e NÃO publicadas em prod**: `ai_usage_logs`, `audit_logs`, `campaign_contacts`, `campaigns`, `connection_health_logs`, `csat_surveys`, `password_reset_requests`, `queue_positions`, `rate_limit_logs`, `security_alerts` | **Médio/alto.** Nenhuma migration V2 **remove** essas 10 da publicação (grep por `from supabase_realtime` vazio) → a remoção ocorreu **fora da história declarada** (drift). Replay dos arquivos sobre prod **republica tabelas sensíveis** (`password_reset_requests`, `security_alerts`, `audit_logs`, `ai_usage_logs`) ao Realtime. |

## 3. Snapshot derivado desatualizado

`supabase/schema-manifest.json` (10/09) registra `rls=168`, `policies=448`, `functions=332`, `relation_grants=4962`. O canônico hoje tem **171 / 456 / 353**. O artefato está ~8 dias defasado; `check-manifest-fresh.mjs` não roda no modo RO (exige psql ao prod).

## 4. Causa raiz

Duas trilhas divergentes: o canônico reflete a linhagem que inclui as migrations de **15–16/10 do `main`** (`admin_unlock_login`, `search_events`, `connection_alert_preferences`, `delivery_stats`, `my_network_status`, `inbox_wait_summary`, `tasks_contact_visibility`, `whisper_mark_read_policy`, …), que **não estão na branch V2 `dia/2026-10-17`**. Por isso "objeto só no canônico" nos 4 eixos é, com uma exceção, lacuna de branch — a exceção é **`app_settings`** (tabela + policy `app_settings_admin_all`), que não existe em nenhuma migration.

## 5. Achados para a trilha de banco (não corrigidos aqui)

1. **`app_settings` (tabela + policy) sem migration em nenhuma branch** — objeto órfão no canônico. Risco: não reproduzível em rebuild.
2. **Publicação Realtime divergente nos dois sentidos** — em especial as 10 tabelas que os arquivos publicam e o canônico não, sem migration de remoção.
3. **`pg_default_acl` concede `ALL` a `anon`/`authenticated` em tabelas novas** — RLS é o único portão; qualquer tabela nova sem RLS fica exposta a escrita por `anon`.
4. **`schema-manifest.json` defasado** (10/09) frente ao canônico.

Nenhum destes exige (ou autoriza) alteração de banco por este cartão — são insumos para a trilha de banco do plano-sync.

## 6. O que esta auditoria NÃO cobre

- Ledger `supabase_migrations.schema_migrations` do canônico (schema inacessível ao wrapper RO) → não foi possível comparar migration a migration.
- Corpo de todas as 298 definers (li o das que saltaram; `pg_get_functiondef` é permitido, mas o teto é 500 linhas por SELECT).
- Grants por coluna/rotina de forma exaustiva (teto de 500 linhas e baseline autoral exigir privilégio negado ao RO).
