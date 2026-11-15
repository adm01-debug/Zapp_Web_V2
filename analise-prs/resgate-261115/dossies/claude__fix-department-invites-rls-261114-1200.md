# Dossiê — claude__fix-department-invites-rls-261114-1200 (PR #3108)

**Veredito: INCORPORADA** · confiança alta · apagar branch: seguro

## Propósito
Commit único `14a17d19d fix(departamentos): restringe leitura de department_invites a admin`
(merge_base `6423dc237`). Fecha furo de RLS: policy `dept_invites_select_authenticated` tinha `USING(true)`;
passa a `dept_invites_select_admin` com `is_admin(auth.uid())`, no mesmo padrão das policies de escrita
(`20261102012200_department_invites_restringe_escrita.sql`). Traz teste `scripts/db-audit/` em Postgres descartável.

## Arquivo × achado × evidência
| Arquivo (branch) | Achado | Evidência |
|---|---|---|
| `supabase/migrations/20261114120000_department_invites_restringe_select.sql` (NEW_FILE_ABSENT_IN_MAIN) | Na main **renomeada** para `supabase/migrations/20261114121000_department_invites_restringe_select.sql`; conteúdo byte-a-byte igual | `diff <(git show <branch>:…120000…) <(git show origin/main:…121000…)` → sem saída. Entrou em `41853318c` (pacote 6, #3113). Motivo do rename: `20261114120000` já é ocupado em produção por `set_conversations_status_encerramento_repetido` (ledger ao vivo). |
| `scripts/db-audit/department-invites-select-admin-only.test.sh` (BOTH_CHANGED, 2 linhas `missing_in_main`) | As 2 linhas diferentes são apenas o nome da migration (`120000` → `121000`) no comentário (l.17) e na variável `migration=` (l.26); lógica idêntica | `git diff <branch> origin/main -- scripts/db-audit/department-invites-select-admin-only.test.sh` mostra só esses 2 hunks |

## Produção (somente leitura, `tnnnlkbymytvtqngbbqh`)
- `supabase_migrations.schema_migrations`: `20261114121000 department_invites_restringe_select` aplicada.
- `pg_policies` em `public.department_invites`: `dept_invites_select_admin` (SELECT, `is_admin(auth.uid())`), `dept_invites_insert_admin`, `dept_invites_delete_admin`. A policy antiga `dept_invites_select_authenticated` não existe mais.

## Lacunas a recuperar
Nenhuma. As 23 "linhas em lacuna" da pré-classificação mecânica são rename de arquivo (21) + ajuste de referência ao nome (2).

## Verificação adversarial

Parecer: **concordo — INCORPORADA**, branch segura para apagar. Tentei refutar e não achei um único hunk de valor fora da `main`.

Checagens independentes (2026-11-15, git somente leitura + produção somente leitura):

1. `git diff --stat 6423dc237 origin/claude/fix-department-invites-rls-261114-1200` → exatamente 2 arquivos, 204 inserções, 0 remoções. Não há terceiro arquivo escondido na pré-classificação.
2. Migration: `diff <(git show <branch>:supabase/migrations/20261114120000_department_invites_restringe_select.sql) <(git show origin/main:supabase/migrations/20261114121000_department_invites_restringe_select.sql)` → **saída vazia** (byte-a-byte igual). Os 21 "missing_in_main" são 100% efeito do rename de arquivo.
3. Rename justificado e não é perda: `git ls-tree origin/main -- supabase/migrations | grep 20261114` mostra `20261114120000_set_conversations_status_encerramento_repetido.sql` ocupando o timestamp; produção confirma (`supabase_migrations.schema_migrations`: `20261114120000 = set_conversations_status_encerramento_repetido`, `20261114121000 = department_invites_restringe_select`).
4. Teste: `git diff <branch> origin/main -- scripts/db-audit/department-invites-select-admin-only.test.sh` → só 2 hunks de 1 linha (l.17 comentário, l.26 variável `migration=`), ambos trocando `120000`→`121000`. A versão da `main` é a **correta**: aponta para o arquivo que existe na `main`; a da branch apontaria para arquivo inexistente. Zero linha de lógica diferente; nenhuma linha da branch removida na `main` (`removed_still_in_main: 0`).
5. Entrada na `main`: `git log --oneline origin/main --` nos dois arquivos → ambos em `41853318c` ("pacote 6 — as 26 PRs abertas integradas num ciclo de CI", #3113).
6. Efeito de segurança verificado ao vivo (`tnnnlkbymytvtqngbbqh`, SELECT em `pg_policies`): `public.department_invites` tem `dept_invites_select_admin` (SELECT, `is_admin(auth.uid())`), `dept_invites_insert_admin` (INSERT), `dept_invites_delete_admin` (DELETE, `is_admin(auth.uid())`). A policy permissiva `dept_invites_select_authenticated` **não existe mais** — o furo está fechado em produção, não só no código.

Lacunas adicionais: nenhuma.
