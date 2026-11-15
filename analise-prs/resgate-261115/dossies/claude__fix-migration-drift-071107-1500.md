# Dossiê — claude__fix-migration-drift-071107-1500 (PR #2767, fechada; substituta #2780 também fechada sem merge)

**Branch:** `origin/claude/fix-migration-drift-071107-1500` · tip `ac61366f` · merge-base `0601e3b6` · 1 commit
**Propósito:** `chore: adiciona arquivos SQL das 5 migrations aplicadas em 07/11 sem arquivo no git` — 5 arquivos novos em `supabase/migrations/`, conteúdo copiado de `supabase_migrations.schema_migrations.statements[]` (corpo da PR #2767).

## Estado na main (verificado)
- As 5 versões existem no ledger de produção (`db_query`: 20261107120000, 121000, 122000, 123000, 133000) e as 5 têm arquivo em `origin/main:supabase/migrations/` (`git ls-tree origin/main`), vindos de `e900ae317` (#2755), `b67ef0c61` (#2763), `a15fdfb81` e `fe6c6b0bf`.
- Fechamento da #2780 alegou "main já contém versões mais completas dos cinco arquivos". **Parcialmente falso**: para 121000 e 122000 a main tem SQL *diferente do aplicado em produção*, e registra isso como exceção `ledger-divergence/pinned-replay` em `scripts/db-audit/migration-evidence.json:1255-1280` (justificativas descrevem exatamente o conteúdo da branch como "o ledger preserva ...").
- Produção bate com a BRANCH, não com a main (`db_query` em `pg_indexes`/`pg_attrdef`/comentários/grants):
  - índice `idx_contacts_phone_search_digits_trgm` (main: `contacts_phone_search_digits_trgm_idx`);
  - expressão `regexp_replace(COALESCE(phone,''), '[^0-9]', '', 'g')` (main: `regexp_replace(phone, '\D', '', 'g')` — NULL em phone NULL);
  - `COMMENT ON COLUMN contacts.phone_search_digits`, `COMMENT ON CONSTRAINT message_reactions_one_per_agent`, `COMMENT ON TABLE _rb_message_reactions_one_per_agent_20261107121000` existem em produção e só na branch;
  - `_rb_message_reactions_one_per_agent_20261107121000` sem grant para `service_role` (branch revoga de `service_role`; main não).
  - `md5(array_to_string(statements))` do ledger: 121000=`aa4f4857…`, 122000=`0d63a4b3…` — texto do ledger idêntico ao da branch (só sem `;`).

## Arquivo × achado × evidência
| Arquivo | Achado | Evidência |
|---|---|---|
| `20261107120000_goal_notifications_own_insert_policy.sql` | INCORPORADA — main é superconjunto (comentários a mais) | `line_check.missing_in_main=0`; `git diff --stat origin/main <branch>` = só 22 deleções |
| `20261107123000_finalize_goal_notification_and_reaction_backup_policies.sql` | INCORPORADA — idem | `missing_in_main=0`; só 18 deleções |
| `20261107133000_fix_copilot_rls_open_policies.sql` | INCORPORADA — semanticamente idêntico (main só quebra linhas e adiciona comentários `--`) | `diff` após normalizar espaços/comentários = vazio; sem exceção em migration-evidence.json |
| `20261107121000_message_reactions_one_per_agent.sql` | **LACUNA (baixo)** — main usa rebuild diferente (CREATE TABLE AS / DISTINCT ON, sem revoke de service_role, sem COMMENTs); divergência aceita via pinned-replay | `origin/main:...121000...sql:3-36`; `migration-evidence.json:1255-1267`; produção = branch |
| `20261107122000_contacts_phone_search_digits.sql` | **LACUNA (baixo)** — main gera índice com outro nome e expressão sem coalesce, sem COMMENT; divergência aceita via pinned-replay. `schema-manifest.json:2973` registra o nome de produção `idx_contacts_phone_search_digits_trgm` | `origin/main:...122000...sql:3-9`; `migration-evidence.json:1268-1280`; produção = branch |

## Veredito: PERDIDA_PARCIAL (valor baixo)
Objetivo da branch (paridade ledger × disco, CI `db-live-guard` verde) está atingido na main por outro caminho. O que ficou de fora é fidelidade: 2 arquivos na main NÃO reproduzem o SQL aplicado em produção; replay em Postgres descartável gera índice com nome diferente do manifesto e tabela de rollback sem comentários/sem revoke de service_role. Sem efeito em produção ou no usuário. Recuperável a qualquer momento direto do ledger (`statements[]`), por isso não é perda irreversível — mas regra 5 do prompt exige `apagar_branch_seguro=false`.

## Como portar (se o dono quiser)
1. Substituir `supabase/migrations/20261107121000_message_reactions_one_per_agent.sql` e `..._20261107122000_contacts_phone_search_digits.sql` pelo conteúdo abaixo (= `git show origin/claude/fix-migration-drift-071107-1500:supabase/migrations/<arquivo>`).
2. **Obrigatório na mesma PR:** remover as 2 entradas `pinned-replay` (versions 20261107121000 e 20261107122000) de `scripts/db-audit/migration-evidence.json` — `check-migration-drift.mjs:818` falha com "excecao pinned-replay obsoleta" quando arquivo e ledger voltam a coincidir. Rodar `node --test scripts/db-audit/check-migration-drift.test.mjs`.
3. Nenhum DDL em produção (migrations já aplicadas). Confirmar que não há regra de "migration imutável" documentada que impeça (busca por "imut" em `docs/agentes/banco.md` e `scripts/db-audit/README.md` não encontrou nada; NÃO VERIFICADO além disso).

### Hunk — 20261107121000_message_reactions_one_per_agent.sql (branch, = ledger)
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

### Hunk — 20261107122000_contacts_phone_search_digits.sql (branch, = ledger)
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

---

## Verificação adversarial

**Parecer: DISCORDO do PERDIDA_PARCIAL → OBSOLETA. `apagar_branch_seguro=true`.**

Os fatos técnicos da triagem conferem (reproduzi todos), mas a conclusão não: a divergência dos 2
arquivos não é lacuna, é **decisão deliberada e registrada**, e o "como portar" do dossiê é proibido
por regra vigente e reprovado pela CI nos dois caminhos possíveis.

### 1. Fatos confirmados (nada a contestar na medição)
- `git show origin/main:supabase/migrations/20261107121000_...sql` vs branch: main usa
  `CREATE TABLE AS SELECT ... WHERE false` + `INSERT DISTINCT ON`, `REVOKE ... FROM PUBLIC, anon, authenticated`
  (sem `service_role`) e **não** tem os 2 `COMMENT`. Branch = texto do ledger. Confirmado.
- `...122000...sql` main: `regexp_replace(phone, '\D', '', 'g')` + índice `contacts_phone_search_digits_trgm_idx`,
  sem `COMMENT ON COLUMN`. Branch: `coalesce(phone,'')` + `idx_contacts_phone_search_digits_trgm` + COMMENT. Confirmado.
- `20261107133000`: 15 `CREATE POLICY` na main e 15 na branch; cada um dos 6 nomes do `missing_sample`
  aparece 2× no arquivo da main (policy + `DROP POLICY`). **INCORPORADA confirmada** — o
  `missing_in_main=15` do JSON é artefato de quebra de linha, não lacuna.

### 2. Por que é OBSOLETA e não perda
- **Foi "removido" de propósito, com registro.** `fe6c6b0bf` (09/11, "fix(db-audit): registra 5
  divergências de migration no evidence + renomeia 2 arquivos") escolheu *aceitar* a divergência em
  vez de trocar o conteúdo. A justificativa em `scripts/db-audit/migration-evidence.json:1265` e
  `:1278` descreve o conteúdo da branch linha por linha e fecha com **"Migration imutavel; hashes
  medidos em 09/11/2026"**. O conteúdo do ledger está, portanto, documentado na main — não perdido.
- **Os hashes pinados estão vivos e batem com a main hoje:** `sha256` de
  `origin/main:...121000...sql` = `48ec6d47…` = `file_sha256` da exceção (`:1258`); `...122000...sql`
  = `f32e6a49…` = `:1271`. A exceção não é gambiarra abandonada: é contrato verificado pelo
  `check-migration-drift.mjs`.
- **A main já guarda a verdade de produção onde ela é consumida:**
  `supabase/schema-manifest.json:2973` registra `contacts.idx_contacts_phone_search_digits_trgm`
  (nome de produção). E o ledger ao vivo guarda o SQL verbatim — que por `AGENTS.md` é *a* verdade.
- **O porte proposto é proibido por regra vigente:** `docs/MIGRATIONS.md:346`, `:414` e `:426` —
  "O arquivo nao pode ser reescrito (migration registrada e imutavel)"; o mesmo documento registra
  o precedente exato (f51) em que a solução correta foi **registrar exceção pinned-replay**, nunca
  reescrever. É precisamente o que a main fez com estes 2 arquivos.
- **E a CI reprova o porte nos dois caminhos** (o dossiê só viu metade disso):
  - com a exceção mantida: `check-migration-drift.mjs:817-819` → `excecao pinned-replay obsoleta`
    (além do `file_sha256` divergente);
  - sem a exceção (o passo 2 do "como portar"): `.github/workflows/db-guard.yml:94-143` — passo
    "Rejeitar edicao de migration ja existente" bloqueia `status === 'modified'` em
    `supabase/migrations/*.sql`, e a única saída é justamente ter a entrada
    `ledger-divergence/pinned-replay` no evidence (linha 142: `continue`). Removê-la transforma o
    arquivo editado em violação. Não existe PR verde que faça esse porte.

### 3. Impacto real do delta: zero (medido, não estimado)
- Nome do índice: referenciado em `origin/main` só por `migration-evidence.json`,
  `schema-manifest.json` e o próprio .sql (`git grep -l`). Nenhum código/edge/teste usa.
- `coalesce` vs NULL: único consumidor é `src/hooks/integrations/useCatalogContactSearch.ts:43`
  (`phone_search_digits.ilike.%digits%`) — `NULL` e `''` não casam igual, resultado idêntico;
  `src/integrations/supabase/types.ts:2475` já tipa a coluna como `string | null`.
- COMMENTs e `REVOKE ... service_role` da tabela `_rb_…`: produção já está no estado da branch
  (medido pela triagem); nenhum replay de teste depende disso.

### 4. Conclusão
Objetivo da branch (paridade ledger × disco, `db-live-guard` verde) atingido na main; o delta
restante não é recuperável por PR nenhuma sob as regras atuais, está documentado na main e
reproduzível do ledger a qualquer momento. Nada a portar → branch pode ser apagada.
