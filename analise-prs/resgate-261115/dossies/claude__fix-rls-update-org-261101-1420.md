# Dossiê — claude__fix-rls-update-org-261101-1420 (PR #2481)

**Branch:** `origin/claude/fix-rls-update-org-261101-1420` · tip `4cc19fc6c` · merge-base `1252bb5a4` · PR #2481 CLOSED não mergeada (2026-11-02).

## Propósito
Fechar o achado de auditoria CRITICAL-2 ("policies UPDATE sem organization_id"): investigação concluiu falso positivo (sistema single-tenant, 0 colunas `organization_id`) e a branch adiciona `WITH CHECK` explícito (= USING) em 8 policies UPDATE via migration `supabase/migrations/20261101213000_rls_update_with_check_explicit.sql` (commits `5ce184017`, `0447cb9f6`; demais são merges de main). Mudança declaradamente sem efeito comportamental (Postgres já usa USING como WITH CHECK quando NULL).

## Arquivo × achado × evidência

| Arquivo | Achado | Evidência |
|---|---|---|
| `supabase/migrations/20261101213000_rls_update_with_check_explicit.sql` | **INCORPORADA** — a main tem o mesmo arquivo com os mesmos 8 `ALTER POLICY ... WITH CHECK`, só que condensados em 1 linha cada e sem os comentários `--` (formato do ledger). SQL normalizado (sem comentários/espaços) é idêntico. | `git show origin/main:<arquivo>` = 8 linhas, uma por policy; `diff` entre `origin/main` e branch após `grep -v '^\s*--' \| tr -s ' \n' ' '` difere apenas em 1 espaço inicial. Arquivo entrou na main em `587ec25f8` (#2551). |
| idem — produção | Aplicada em produção | `supabase_migrations.schema_migrations`: `20261101213000 / rls_update_with_check_explicit` presente. `pg_policies`: as 8 policies (`contacts/Users can update their assigned contacts`, `calls/Users can update their calls`, `message_templates/Users can update their own templates`, `payment_links/Users can update own payment links`, `sales_deals/Users can update assigned deals`, `talkx_campaigns/Users can update own campaigns`, `talkx_recipients/Users can update recipients of own campaigns`, `talkx_templates/talkx_templates_update`) têm `with_check` NÃO NULO com a expressão esperada. |

As 77 "linhas faltantes" do line_check são: 14 linhas de cabeçalho `--` + 7 comentários `--` por policy + quebras de linha/indentação do SQL multi-linha. Nenhuma linha de SQL efetivo falta.

## Veredito
**INCORPORADA** (confiança alta). Única diferença é documental (comentários explicando a investigação CRITICAL-2 e o rollback) — valor `nenhum` para o negócio; o contexto já está no corpo da PR #2481. Observação do Qodo na PR (nota de rollback incorreta) é irrelevante pois os comentários não estão na main.

## Lacunas a recuperar
Nenhuma. `apagar_branch_seguro = true`.

## Reexame de commits intermediários

**Parecer: REFATORACAO_INTERNA.** O achado mecânico (54 linhas em `supabase/migrations/20261030155126_rls_update_with_check_explicit.sql`, adicionadas em `5ce184017`) foi "removido" por `0447cb9f6` apenas porque esse commit **renomeia o arquivo**, sem tocar uma linha de conteúdo. Nada se perde. `apagar_branch_seguro` permanece `true`.

Commits da branch (`1252bb5a4..origin/claude/fix-rls-update-org-261101-1420`, sem merges):
- `5ce184017` — fix: adiciona WITH CHECK explícito em 8 policies UPDATE críticas (CRITICAL-2)
- `0447cb9f6` — fix: renomeia migration para 20261101213000 (versão > max do ledger)

Evidências:
1. `git show --stat 0447cb9f6` → `...eck_explicit.sql => 20261101213000_rls_update_with_check_explicit.sql | 0`, `1 file changed, 0 insertions(+), 0 deletions(-)`.
2. `git show -M 0447cb9f6` → `similarity index 100%` / `rename from 20261030155126_... rename to 20261101213000_...`. Nenhum hunk de conteúdo.
3. `diff <(git show 5ce184017:...20261030155126_...sql) <(git show <tip>:...20261101213000_...sql)` → vazio (111 linhas idênticas). O conteúdo do commit intermediário sobrevive integralmente na ponta, sob o novo nome.
4. O efeito de SQL está na main: `diff` normalizado (sem comentários `--`, sem linhas vazias, espaços colapsados) entre `<tip>:20261101213000_...sql` e `origin/main:20261101213000_...sql` → idêntico (8 `ALTER POLICY ... WITH CHECK`).

Não há commit que desfaça proteção/validação: o único commit posterior é um rename de versão de migration (ajuste de ordenação no ledger), motivação operacional, não funcional. O título não promete segurança e o commit não remove linha alguma.

## Verificação adversarial

**Parecer: CONCORDO com INCORPORADA.** `apagar_branch_seguro = true`. Tentei refutar e não achei um único hunk de valor ≥ médio ausente da main.

Tentativas de refutação e resultado:

1. **Superfície total da branch.** `git diff --name-status 1252bb5a4 origin/claude/fix-rls-update-org-261101-1420` → **1 arquivo**, `A supabase/migrations/20261101213000_rls_update_with_check_explicit.sql`, 111 inserções. Não existe nenhum outro arquivo (src/edge/workflow/docs) onde um hunk pudesse estar escondido.
2. **Commits intermediários.** `git log --no-merges -M --name-status 1252bb5a4..<tip>` → `5ce184017` (A `20261030155126_...`) + `0447cb9f6` (`R100` rename para `20261101213000_...`). `R100` = similaridade 100%: o rename não descarta conteúdo. Nenhum commit remove linha.
3. **SQL efetivo × main (feito por mim, não só pelo line_check).** Normalizei os dois arquivos (`grep -v '^[[:space:]]*--' | tr '\n' ' ' | tr -s ' '`) e os md5 batem: `5b457d96c94a09fe6d71d41eadccb5f1` em ambos. `diff` vazio. 8 `ALTER POLICY` na branch, 8 na main, mesmas tabelas/policies/expressões.
4. **Quem trouxe para a main.** `git log --diff-filter=A origin/main -- <arquivo>` → `587ec25f8` (#2551). Arquivo presente em `origin/main` hoje.
5. **As 77 "linhas faltantes" são comentários.** Única diferença real: 14 linhas de cabeçalho `--` (conclusão da investigação CRITICAL-2) + 7 comentários `--` por policy + indentação/quebras do SQL multi-linha. A main condensa cada policy em 1 linha e remove os `--`. Valor das 77 linhas: **baixo** — é texto explicativo em migration já aplicada (artefato histórico), e a conclusão "falso positivo / single-tenant" já consta no corpo da PR #2481 e neste dossiê. Não é trabalho de engenharia perdido.
6. **Produção confere.** `supabase_migrations.schema_migrations` → `20261101213000 / rls_update_with_check_explicit` registrada (a versão antiga `20261030155126` não existe no ledger, coerente com o rename). `pg_policies`: 7 das 8 policies com `with_check IS NOT NULL`.

**Observação que NÃO é lacuna da branch (é da main):** a 8ª policy não aparece em `pg_policies` porque a tabela **`public.payment_links` não existe mais em produção** (`to_regclass('public.payment_links')` → `null`, 0 policies). Consequência: o arquivo **que está na `main`** (`ALTER POLICY "Users can update own payment links" ON public.payment_links`) falharia num replay do histórico de migrations do zero. Isso é idêntico na branch e na main — recuperar a branch não corrige nada disso, logo não altera o veredito. Fica como risco de replay do histórico, para o dono decidir se quer um guard/ajuste em PR própria.
