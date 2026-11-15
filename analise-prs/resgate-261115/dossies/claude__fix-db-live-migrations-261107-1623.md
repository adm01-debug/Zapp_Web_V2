# Dossiê — `claude/fix-db-live-migrations-261107-1623` (PR #2780, fechada sem merge 2026-11-07)

**Propósito** (commit `35eb186a6 fix: reconcilia cinco migrations aplicadas`): fazer os 5 arquivos
`supabase/migrations/20261107{120000,121000,122000,123000,133000}_*.sql` serem cópia fiel do que está no
ledger `supabase_migrations.schema_migrations.statements` (sem comentários), para o DB Live Guard parar
de reportar drift arquivos↔ledger. Só muda arquivos SQL; nenhum DDL executado.

**Fechamento alegado**: "a `main` já contém versões mais completas dos cinco arquivos; o diff removeria 130
linhas de comentários". Verdade só em parte — ver tabela.

## Arquivo × achado × evidência

Comparação feita com o ledger ao vivo (`db_query` em `tnnnlkbymytvtqngbbqh`, 2026-11-15) normalizando
comentários/espaços (`scratchpad/canon-2780.mjs`):

| Arquivo (supabase/migrations/) | main hoje | branch | Achado |
|---|---|---|---|
| `20261107120000_goal_notifications_own_insert_policy.sql` | IGUAL ao ledger (com comentários) | IGUAL (sem comentários) | **INCORPORADA** — branch só tirava comentários (valor nenhum). |
| `20261107123000_finalize_goal_notification_and_reaction_backup_policies.sql` | IGUAL ao ledger | IGUAL | **INCORPORADA** — idem. |
| `20261107133000_fix_copilot_rls_open_policies.sql` | IGUAL ao ledger (tokens; só quebra de linha/comentário) | IGUAL (one-liners) | **INCORPORADA** — main `b67ef0c61` (#2763). Única diferença é formatação. |
| `20261107121000_message_reactions_one_per_agent.sql` | **DIFERENTE do ledger** | IGUAL ao ledger | **PERDIDA** — ver abaixo. |
| `20261107122000_contacts_phone_search_digits.sql` | **DIFERENTE do ledger** | IGUAL ao ledger | **PERDIDA** — ver abaixo. |

### Como a main regrediu 121000/122000
- Merge-base `43fb7342a` (vindo de `e900ae317` #2755) tinha os dois arquivos fiéis ao ledger (com comentários).
- `a15fdfb81` (2026-11-09, "adiciona 10 arquivos SQL faltantes") **apagou** esses dois e criou
  `..._one_per_agent_constraint.sql` / `..._phone_search_digits_column.sql` com SQL reescrito à mão
  (`CREATE TABLE AS SELECT ... WHERE false`, `DISTINCT ON`, `REVOKE` sem `service_role`, sem COMMENTs;
  `regexp_replace(phone,'\D',...)` sem `coalesce`, índice `contacts_phone_search_digits_trgm_idx`, sem COMMENT).
- `fe6c6b0bf` (2026-11-09) renomeou de volta e registrou as duas como exceção
  `ledger-divergence/pinned-replay` em `scripts/db-audit/migration-evidence.json:1254-1279`
  (justificativa admite: "o ledger preserva ... row_number() OVER e COMMENTs finais" / "nome
  idx_contacts_phone_search_digits_trgm e COMMENT ON COLUMN final").
- Produção confirma o ledger, não a main: `pg_indexes` → `idx_contacts_phone_search_digits_trgm`;
  `information_schema.columns.generation_expression` → `regexp_replace(COALESCE(phone, ''::text), '[^0-9]'...)`;
  constraint `message_reactions_one_per_agent UNIQUE (message_id, user_id)`.
- `docs/agentes/banco.md:96`: "O ledger ao vivo é a verdade." A main hoje contraria isso em 2 arquivos e
  mascara com exceção pinada.

**Efeito prático da divergência**: replay local (Postgres descartável) cria índice com outro nome e coluna
gerada com semântica diferente (`phone NULL` → `NULL` em vez de `''`), e o `_rb_*` fica sem o REVOKE de
`service_role` — snapshot/catálogo local ≠ produção. Valor **médio** (fidelidade do banco versionado e do
guard; não afeta usuário final).

## Veredito
**PERDIDA_PARCIAL** — 3/5 arquivos incorporados; 2/5 a main tem conteúdo infiel ao ledger onde a branch
tinha o fiel. Não é DECISAO_DONO (só arquivos de migration + evidence). `apagar_branch_seguro = false`
(mas o conteúdo a recuperar está integralmente abaixo e no ledger; a branch em si não é necessária).

## Lacunas a recuperar (branch nova a partir de `main`)

1. `supabase/migrations/20261107121000_message_reactions_one_per_agent.sql` — substituir pelo SQL do
   ledger. Preferir a versão do merge-base (com comentários/rollback):
   `git show 43fb7342a7bea6e647b64c2927e253a1506b3f79:supabase/migrations/20261107121000_message_reactions_one_per_agent.sql`.
   Corpo SQL (= `origin/claude/fix-db-live-migrations-261107-1623` = ledger):
```sql
SET search_path = public, pg_temp;
CREATE TABLE IF NOT EXISTS public._rb_message_reactions_one_per_agent_20261107121000 (
  id uuid PRIMARY KEY,
  message_id uuid NOT NULL,
  user_id uuid,
  contact_id uuid,
  emoji text NOT NULL,
  created_at timestamptz NOT NULL
);
ALTER TABLE public._rb_message_reactions_one_per_agent_20261107121000 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public._rb_message_reactions_one_per_agent_20261107121000
  FROM PUBLIC, anon, authenticated, service_role;
WITH ranked AS (
  SELECT reaction.*,
         row_number() OVER (
           PARTITION BY reaction.message_id, reaction.user_id
           ORDER BY reaction.created_at DESC, reaction.id DESC
         ) AS position
  FROM public.message_reactions AS reaction
  WHERE reaction.user_id IS NOT NULL
)
INSERT INTO public._rb_message_reactions_one_per_agent_20261107121000
  (id, message_id, user_id, contact_id, emoji, created_at)
SELECT id, message_id, user_id, contact_id, emoji, created_at
FROM ranked
WHERE position > 1
ON CONFLICT (id) DO NOTHING;
DELETE FROM public.message_reactions AS reaction
USING public._rb_message_reactions_one_per_agent_20261107121000 AS backup
WHERE reaction.id = backup.id;
ALTER TABLE public.message_reactions
  DROP CONSTRAINT IF EXISTS message_reactions_one_per_agent;
ALTER TABLE public.message_reactions
  ADD CONSTRAINT message_reactions_one_per_agent
  UNIQUE (message_id, user_id);
COMMENT ON CONSTRAINT message_reactions_one_per_agent ON public.message_reactions IS
  'Garante uma unica reacao de agente por mensagem; novo emoji substitui o anterior via upsert.';
COMMENT ON TABLE public._rb_message_reactions_one_per_agent_20261107121000 IS
  'Rollback privado das duplicatas de reação removidas ao instalar a unicidade por agente/mensagem.';
```

2. `supabase/migrations/20261107122000_contacts_phone_search_digits.sql` — idem
   (`git show 43fb7342a7bea6e647b64c2927e253a1506b3f79:supabase/migrations/20261107122000_contacts_phone_search_digits.sql`):
```sql
SET search_path = public, extensions, pg_temp;
ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS phone_search_digits text
  GENERATED ALWAYS AS (regexp_replace(coalesce(phone, ''), '[^0-9]', '', 'g')) STORED;
CREATE INDEX IF NOT EXISTS idx_contacts_phone_search_digits_trgm
  ON public.contacts USING gin (phone_search_digits extensions.gin_trgm_ops);
COMMENT ON COLUMN public.contacts.phone_search_digits IS
  'Somente dígitos de phone, gerados para busca consistente sem alterar o formato exibido.';
```

3. `scripts/db-audit/migration-evidence.json` — remover as duas entradas `ledger-divergence/pinned-replay`
   das versões `20261107121000` e `20261107122000` (linhas ~1254-1279), pois o arquivo passa a bater com o
   ledger (sem exceção, o guard compara `canonicalSql(arquivo)` com `canonicalStatements(ledger)`,
   `check-migration-drift.mjs:690-693`). Checar também `scripts/db-audit/replay-known-failures.json`
   (entradas `20261107*` adicionadas em `a15fdfb81`) — se referenciarem hash/texto desses arquivos, ajustar.

4. Validar: `node --test scripts/db-audit/check-migration-drift.test.mjs`; CI `db-live-guard.yml`
   ("Comparar migrations") na PR. Nenhum DDL: produção já está no estado do ledger.

**Não recuperar**: remoção de comentários em 120000/123000/133000 (valor nenhum; main está melhor).

## Verificação adversarial (2026-11-15)

**Parecer: CONCORDO com PERDIDA_PARCIAL.** Tentei refutar por três vias (main já cobre / remoção
deliberada / trabalho não encaixa mais) e as três falharam. Achei 3 lacunas adicionais que mudam o
*plano* de recuperação (não o veredito).

### Refutação tentada e resultado
1. **"A main já cobre"** — falso para 121000/122000. Comparação canônica (comentários removidos,
   espaços colapsados; `scratchpad/verif/norm.py`) de `origin/main` × `origin/claude/...` × ledger ao
   vivo (`md5` do `array_to_string(statements)` normalizado, `db_query` 15/11):
   | version | md5 ledger | md5 main | md5 branch |
   |---|---|---|---|
   | 20261107120000 | `e397a2e3…` | `e397a2e3…` ✔ | `e397a2e3…` ✔ |
   | 20261107121000 | `e969f58f…` | `39dd61fe…` ✘ | `e969f58f…` ✔ |
   | 20261107122000 | `61491f47…` | `27194bf3…` ✘ | `61491f47…` ✔ |
   | 20261107123000 | `8e4bea94…` | `8e4bea94…` ✔ | `8e4bea94…` ✔ |
   | 20261107133000 | `93fe29cc…` | `956f27f5…` (só espaço depois de `(`) | `93fe29cc…` ✔ |
   133000 confirmado como diferença de espaçamento puro (diff por caractere: `USING ( scored_by` ×
   `USING (scored_by`, 4 chars) → INCORPORADA, como a triagem disse.
2. **"Foi removido de propósito"** — não. `git log origin/main` nos 2 arquivos: `e900ae317` (fiéis) →
   `a15fdfb81` "adiciona 10 arquivos SQL faltantes para alinhar ledger com disco" (apagou os fiéis e
   escreveu SQL novo à mão) → `fe6c6b0bf` (renomeou de volta + exceção). Nenhum commit diz
   remove/revert/desativa o conteúdo; a mensagem de `a15fdfb81` diz o oposto do efeito.
   A exceção `ledger-divergence/pinned-replay` não é estado final desejado: o próprio drift checker
   marca `excecao pinned-replay obsoleta` quando arquivo passa a bater com o ledger
   (`scripts/db-audit/check-migration-drift.mjs:816-818`) — ou seja, o desenho prevê que a exceção
   desapareça quando a fidelidade é possível.
3. **"Não encaixa mais / regra 7 proíbe"** — não proíbe neste caso. O passo `Rejeitar edicao de
   migration ja existente` libera explicitamente arquivos com `kind` `ledger-divergence/pinned-replay`
   (`.github/workflows/db-guard.yml:141-142`), que é exatamente o kind dessas duas entradas
   (`scripts/db-audit/migration-evidence.json:1259` e `:1272`). Logo não é DECISAO_DONO: só arquivos de
   migration + evidence, sem DDL (produção já está no estado do ledger).

### Produção confirma o ledger, não a main (db_query 15/11)
- `pg_indexes` → `idx_contacts_phone_search_digits_trgm` (main grava `contacts_phone_search_digits_trgm_idx`).
- `information_schema.columns.generation_expression` → `regexp_replace(COALESCE(phone, ''::text), '[^0-9]'::text, ''::text, 'g'::text)` (main grava `regexp_replace(phone,'\D',…)`).
- `pg_constraint` → `message_reactions_one_per_agent UNIQUE (message_id, user_id)`.
- `_rb_message_reactions_one_per_agent_20261107121000` existe com as colunas explícitas da branch
  (`id, message_id, user_id, contact_id, emoji, …`), não `CREATE TABLE AS SELECT *`.

### Lacunas adicionais (não estavam na triagem)
A. **O arquivo da main em 121000 não é só infiel: é destrutivo em replay.** O `DELETE` da main
   (`origin/main:supabase/migrations/20261107121000_message_reactions_one_per_agent.sql:24-32`) não tem
   o filtro `user_id IS NOT NULL` do ledger, e particiona por `(message_id, user_id)`: com `user_id`
   NULL todas as reações de contato da mesma mensagem caem na mesma partição e as `rn > 1` seriam
   apagadas. Em produção hoje 109 das 115 linhas de `message_reactions` têm `user_id IS NULL` e 1
   mensagem já tem >1 reação de contato (`db_query` 15/11). Além disso o backup usa
   `SELECT DISTINCT ON (message_id, user_id) *` → guarda a linha **sobrevivente**, não as duplicatas
   apagadas (rollback inútil). Nada disso afeta a produção atual (ela tem o ledger), mas qualquer
   reconstrução do banco a partir dos arquivos do repo destrói reações de contato. Isso eleva o valor
   da recuperação de "fidelidade" para "evita perda de dado em rebuild".
B. **A recuperação não cabe numa única PR.** Se a mesma PR altera os 2 arquivos *e* remove as 2
   entradas do evidence, o passo `Rejeitar edicao de migration ja existente` lê o evidence do head,
   não acha a entrada e reprova (`db-guard.yml:134-142`). Sequência correta: **PR 1** restaura os 2
   arquivos mantendo as entradas (db-guard passa pela exceção; o drift local da PR roda sem
   `DESTINO_URL`, `db-guard.yml:296-297`, então não vê o ledger); **PR 2** remove as 2 entradas (não
   toca migration → o passo não dispara). Entre os dois merges, o `db-live-guard` (semanal/dispatch,
   `db-live-guard.yml` — sem gatilho de push) acusaria `excecao pinned-replay obsoleta`; se as duas PRs
   entrarem no mesmo dia isso nunca é observado. Remover as entradas é obrigatório, não opcional
   (para `pinned-replay` o checker não valida `file_sha256`, mas falha no teste de obsolescência).
C. **`scripts/db-audit/replay-known-failures.json` não tem entrada `20261107121000`/`20261107122000`**
   (`grep 2026110712` vazio em `origin/main`) — o sub-passo 3 do plano da triagem é no-op; não gastar
   passo nisso.

### Branch
`43fb7342a` é ancestral de `origin/main` (`git merge-base --is-ancestor` → verdadeiro) e o ledger ao
vivo guarda o SQL, logo o conteúdo a recuperar não depende da branch. Mantenho
`apagar_branch_seguro = false` só até a PR 1 acima entrar — depois a branch é descartável.
