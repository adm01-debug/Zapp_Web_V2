# Dossiê — claude/fix-merge-contato-telefone-secundario-261114-0000 (PR #3107)

**Propósito.** Corrigir bug HIGH na mesclagem de contatos: `public.merge_contacts_atomic` fazia `UPDATE contacts SET phone=...` no primário ANTES de apagar os secundários; quando o telefone escolhido era o do secundário, a UNIQUE `contacts_phone_key` disparava 23505 e abortava a mesclagem. Fix = reordenar o UPDATE para depois do DELETE (migration) + teste offline em `scripts/db-audit/`.

Commit único: `5ed381c55 fix(contatos): corrige mesclagem presa no telefone do secundario` (merge_base `6423dc237`).

## Arquivo × achado × evidência

| Arquivo (branch) | Achado | Evidência |
|---|---|---|
| `supabase/migrations/20261114120000_merge_contacts_phone_secundario_unique.sql` | **INCORPORADA** — renomeada para `20261114120500_...` na main (pacote 6, commit `41853318c`, PR #3113). Conteúdo byte a byte idêntico. | `diff <(git show REF:...120000_...sql) <(git show origin/main:supabase/migrations/20261114120500_merge_contacts_phone_secundario_unique.sql)` → sem saída (IDENTICAL). Renome necessário porque `20261114120000_set_conversations_status_encerramento_repetido.sql` já ocupava o prefixo na main. |
| `scripts/db-audit/merge-contacts-phone-secundario.test.sh` | **INCORPORADA** — versão da main é a mesma com 2 ajustes: referência ao novo nome da migration (linhas 6 e 14) e `-v VERBOSITY=verbose` no psql (linha 126) para o psql imprimir o SQLSTATE 23505 que o teste assere. As 3 linhas "faltantes" são exatamente essas, substituídas por versão melhor. | `diff` entre branch e main mostra só 6c6, 14c14, 119c119,126. |

## Produção (somente leitura, `tnnnlkbymytvtqngbbqh`)
- `supabase_migrations.schema_migrations`: `20261114120500 merge_contacts_phone_secundario_unique` aplicada (e `20261114120000 set_conversations_status_encerramento_repetido`, confirmando o motivo do renome).
- `pg_proc.prosrc` de `public.merge_contacts_atomic`: `DELETE FROM public.contacts` na posição 3845, `UPDATE public.contacts` na posição 4268 → DELETE antes do UPDATE, ou seja, a reordenação está viva no banco.

## Veredito
**INCORPORADA** (confiança alta). Nenhuma lacuna a recuperar. `apagar_branch_seguro = true`.

## Verificação adversarial

Parecer: **concordo — INCORPORADA**, `apagar_branch_seguro = true`. Tentei refutar e não achei um único hunk de valor fora da main.

Checagens independentes (repo local, somente leitura):
- `git diff --stat 6423dc237 origin/claude/fix-merge-contato-telefone-secundario-261114-0000` → exatamente **2 arquivos, 325 inserções, 0 remoções**. Não há terceiro arquivo nem linha apagada que a main precise.
- Migration: `diff <(git show REF:supabase/migrations/20261114120000_merge_contacts_phone_secundario_unique.sql) <(git show origin/main:supabase/migrations/20261114120500_merge_contacts_phone_secundario_unique.sql)` → **saída vazia (byte a byte idêntica)**. Motivo do renome confirmado: `git ls-tree origin/main supabase/migrations/` lista `20261114120000_set_conversations_status_encerramento_repetido.sql` ocupando o prefixo.
- Teste: `diff` branch × main dá só `6c6`, `14c14` (ponteiro para o novo nome da migration) e `119c119,126`. Este último **não é perda — é ganho**: a main acrescenta `-v VERBOSITY=verbose` ao `psql` mais 7 linhas de comentário explicando que sem isso a asserção do SQLSTATE `23505` reprovava justamente quando o bug reproduzia. As 3 linhas de `missing_sample` do JSON são exatamente essas 3, substituídas por versão superior.
- Sem remoção/revert posterior: `git log --oneline origin/main -5 -- <os 2 arquivos>` → só `41853318c` (pacote 6, #3113) e `b24e31500` (pacote 7, #3123, que trouxe o ajuste do verbose). Nada de "remove"/"revert"/"desativa".

Produção `tnnnlkbymytvtqngbbqh` (SELECT via MCP, somente leitura) — reproduzi as duas medições do dossiê:
- `supabase_migrations.schema_migrations` → `20261114120500 merge_contacts_phone_secundario_unique` **aplicada** (e `20261114120000 set_conversations_status_encerramento_repetido`, confirmando a colisão de prefixo).
- `pg_proc.prosrc` de `public.merge_contacts_atomic` → `pos_delete=3845`, `pos_update=4268`, `delete_antes_do_update = true`. A reordenação que é a essência do fix está **viva no banco**.

Lacunas adicionais: nenhuma.
