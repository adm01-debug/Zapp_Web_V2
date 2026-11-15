# Dossiê — claude__feat-copiloto-fases13-15-ddl-261024-1530 (PR #2214)

**Veredito: INCORPORADA** · confiança alta · apagar branch: seguro.

## Propósito
3 commits (2b08a105d, c3c218d90, 0072cc1d1): migration DDL com 7 tabelas do copiloto RADAR fases 13-15
(`copilot_outcomes`, `copilot_objection_catalog`, `copilot_usage`, `copilot_seller_settings`,
`copilot_help_requests`, `copilot_learning_moments`, `copilot_conversation_scores`) + regeneração do
`supabase/schema-catalog.json` com essas tabelas.

## Arquivo × achado × evidência

| Arquivo | Achado | Evidência |
|---|---|---|
| `supabase/migrations/20261026180300_copilot_fases13_15_tabelas.sql` (novo) | **Já na main com outro nome.** `git diff <branch>:…20261026180300… origin/main:supabase/migrations/20261031100000_copilot_fases13_15_tabelas.sql` → **diff vazio (byte a byte idêntico)**. Entrou pela PR #2420 (`089551d0b 2026-10-31 feat(copilot): migrations DDL aditivas fases 13-15 RADAR`). A main tem ainda `20261030145126_copilot_fases13_15_tabelas.sql` (mesma DDL em uma linha por statement). | Produção (`tnnnlkbymytvtqngbbqh`, `supabase_migrations.schema_migrations`): versões `20261030145126` e `20261031100000` aplicadas; `pg_tables` lista as 7 tabelas. As policies `USING (true)` da branch foram **substituídas de propósito** por `seller_id = auth.uid()` em `20261107133000_fix_copilot_rls_open_policies.sql` e `20261107163000_fix_copilot_rls_wrong_join_column.sql` (ambas aplicadas em produção; `pg_policies` mostra `copilot_outcomes_select :: (seller_id = auth.uid())`). Tipos em `src/integrations/supabase/types.ts:3214-3573`. |
| `supabase/schema-catalog.json` (BOTH_CHANGED) | **Já na main (mais novo).** As 7 tabelas copilot constam no catálogo da main (contagem de ocorrências igual ou maior que na branch). As 52 linhas "ausentes" (normalizando indentação 2→4 espaços) são **snapshot desatualizado** da branch (`generated_at: 2026-10-16`, linha 2520) vs main (`generated_at: 2026-11-15`, linha 2997, sincronizado por `2cf0153ae`/`ff0a5dbca`). | Produção confirma que a main está certa: `contact_purchases` e `payment_links` **não existem** (`pg_tables` → 0); `csat_surveys.agent_id`/`rating` são `is_nullable=YES` (branch dizia not-null); `profiles_role_check` na main sem `special_agent` (schema-catalog.json:3137), `chk_conversation_status_values` sem `pending/closed` (:3041). Artefato gerado por `scripts/db-audit/catalog.sql`; nada a portar. |

## Lacunas a recuperar
Nenhuma. Tudo que a branch traz está em `origin/main` (migration idêntica em `20261031100000_copilot_fases13_15_tabelas.sql`; catálogo regenerado mais recente a partir do banco real). Triagem anterior (DUPLICATA) confirmada com prova.

## Verificação adversarial

Parecer: **concordo — INCORPORADA**. Tentei refutar os dois arquivos de forma independente (sem reaproveitar o `missing_sample` do JSON) e não achei um único hunk de valor fora da main.

Diff verificado: `git diff e51662a9c391cddc7a21fcfbba2dfd581c3ad6d8 origin/claude/feat-copiloto-fases13-15-ddl-261024-1530` → 2 arquivos, 3199 inserções. Commits da branch: `2b08a105d`, `c3c218d90`, `0072cc1d1`.

**1. `supabase/migrations/20261026180300_copilot_fases13_15_tabelas.sql` — idêntico na main.**
Extraí os dois blobs e comparei por hash:
`md5(branch:…20261026180300…) = md5(origin/main:supabase/migrations/20261031100000_copilot_fases13_15_tabelas.sql) = 557dcc3593e2211c8c90f942f6c2cd43`; `diff` sem saída. Não é "equivalente", é o mesmo byte a byte — comentários de rollback, CHECKs, policies e tudo.
Produção (`tnnnlkbymytvtqngbbqh`, SELECT em `information_schema.tables`): as 7 tabelas existem (`copilot_conversation_scores`, `copilot_help_requests`, `copilot_learning_moments`, `copilot_objection_catalog`, `copilot_outcomes`, `copilot_seller_settings`, `copilot_usage`).
O `20261030145126_copilot_fases13_15_tabelas.sql` da main é a mesma DDL com um statement por linha (md5 `24240927942c30f740bdada0288f6dc7`) — variante de formatação, não lacuna.

**2. `supabase/schema-catalog.json` — a main é a versão nova; a da branch é snapshot velho.**
Normalizei indentação e vírgula final nos dois blobs e tirei `comm -23`: **52 linhas** da branch não estão na main. Li todas as 52, uma por uma. Todas são estado antigo do banco, já superado:
- `"generated_at": "2026-10-16"` (branch, linha 2520) vs `"2026-11-15"` (main, linha 2997) — a própria linha "ausente" é a data do snapshot.
- `contact_purchases` (+13 colunas) e `payment_links` (+16 colunas): `SELECT table_name FROM information_schema.tables WHERE table_schema='public'` → **nenhuma das duas existe em produção**. Portá-las poria tabela fantasma no catálogo.
- `csat_surveys.agent_id:uuid:not-null` e `csat_surveys.rating:integer:not-null`: produção retorna `is_nullable=YES` para as duas (`information_schema.columns`). A main está certa, a branch errada.
- Assinaturas de função que **ganharam parâmetro** depois: a main tem `resolve_talkx_outcome_unknown(…, p_confirm_relaunch boolean)`, `retry_talkx_recipients(…, p_confirm_relaunch boolean)`, `talkx_benchmarks(p_days integer, p_limit integer)`; a branch tem as versões curtas. `update_own_profile` na main perdeu `p_email text`. São superconjuntos/correções, não perdas.
- CHECKs que foram apertados depois (`profiles_role_check` sem `special_agent`, `chk_conversation_status_values`, `messages_message_type_check`, `chatbot_flows_trigger_type_check`, `department_audit_logs_action_check`, `team_messages_*`, `talkx_*`): todos presentes na main em versão diferente — a main é a que casa com o banco de hoje.
Além disso, as 7 tabelas copilot já constam no catálogo da main (1 ocorrência de cada nome na lista de `tables`), que é o único efeito útil que esse commit de catálogo pretendia. O arquivo é artefato derivado, regenerado por automação (`.github/workflows/types-sync.yml`, commits `2cf0153ae`, `ff0a5dbca`, `ff9043905`).

**Checagem contra remoção acidental:** as policies `USING (true)` da branch não foram "perdidas" — entraram na main dentro da migration idêntica e depois foram **substituídas de propósito** por `seller_id = auth.uid()` em `20261107133000_fix_copilot_rls_open_policies.sql` e `20261107163000_fix_copilot_rls_wrong_join_column.sql`. Reaplicar a branch aqui seria regressão de segurança, não resgate.

**Conclusão:** branch 100% contida na main. Zero hunk de valor ≥ médio fora. `apagar_branch_seguro = true`. PR #2214 (mesmo tip) pode ser fechada como duplicata.
