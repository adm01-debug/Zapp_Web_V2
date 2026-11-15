# Dossiê — claude__feat-radar-migration-261101-1550 (PR #2487)

**Veredito: INCORPORADA** · confiança alta · apagar branch: seguro.

## Propósito
Branch `origin/claude/feat-radar-migration-261101-1550` (tip `0789ca73`, merge-base `1252bb5a`, 6 commits, 1 arquivo):
migration `supabase/migrations/20261030200000_copilot_live_motor.sql` — motor do Copiloto RADAR (CV-021–045):
9 colunas em `copilot_sessions`, 3 em `copilot_insights`, semente `ai.capability.copilot_live = false`,
função `enqueue_copilot_tick_on_contact_message()` + trigger `trg_copilot_tick_on_contact_message` em `messages`.
PR #2487 fechada em 2026-11-01 pelo congelamento de features (#2545), branch preservada.

## Arquivo × achado × evidência
| Arquivo (branch) | Achado | Evidência |
|---|---|---|
| `supabase/migrations/20261030200000_copilot_live_motor.sql` (NEW_FILE_ABSENT_IN_MAIN) | **Já está na main, renomeado** para `supabase/migrations/20261115010000_copilot_live_motor.sql`, conteúdo **byte-idêntico** | `git rev-parse` dos dois blobs = mesmo SHA `035b96ebc…`; `git diff <blob-branch> <blob-main>` = vazio. Entrou em `main` via commit `f369f88b2` 2026-11-15 "feat(copiloto): liga o motor do RADAR — gatilho + handler, nasce desligado (#3127)" |

Só mudou o timestamp do nome (20261030200000 → 20261115010000); o `line_check` mecânico marcou 115 linhas "faltando" porque comparou por caminho, não por conteúdo.

## Produção (Supabase `tnnnlkbymytvtqngbbqh`, só leitura, 2026-11-15)
- `supabase_migrations.schema_migrations`: `20261115010000 copilot_live_motor` aplicada (a versão `20261030200000` não existe no ledger, como esperado).
- `pg_proc`: `enqueue_copilot_tick_on_contact_message` existe; `pg_trigger`: `trg_copilot_tick_on_contact_message` existe.
- `copilot_sessions`: 9/9 colunas presentes (last_contact_message_at, last_processed_message_at, intent, sentiment, comm_style, decision_role, occasion, stakeholders, brinde_evidence).
- `copilot_insights`: tier, latency_ms, data presentes.
- `feature_flags`: `ai.capability.copilot_live enabled=false` (nasce desligado, como a migration pede).

Consumidores na main: `supabase/functions/_shared/copilot-tick.ts:4`, `supabase/functions/ai-jobs-worker/index.ts:254`, `supabase/schema-manifest.json:5007/5338`.

## Lacunas a recuperar
Nenhuma.

## Observação (não é lacuna desta branch)
Ligar o motor (`UPDATE feature_flags SET enabled = true WHERE key='ai.capability.copilot_live'`) gera custo de IA por mensagem de contato — decisão do dono, já registrada na própria migration e na PR #2487.

## Reexame de commits intermediários

**Parecer: REFATORACAO_INTERNA** · apagar branch continua seguro · nada a recuperar.

Achado mecânico: 1 linha, commit `188daf208`, arquivo `supabase/migrations/20261030200000_copilot_live_motor.sql`:
`ADD COLUMN IF NOT EXISTS comm_style text[] NOT NULL DEFAULT '{}'`.

Os 3 commits da branch (`git log --oneline --no-merges 1252bb5a..origin/claude/feat-radar-migration-261101-1550`):

| Commit | Assunto | O que fez com `comm_style` |
|---|---|---|
| `2c97614b0` | feat: migration 20261030200000 — motor Copiloto RADAR | criou `comm_style text` |
| `188daf208` | fix: comm_style text → text[] NOT NULL DEFAULT '{}' | trocou para `text[] NOT NULL DEFAULT '{}'` |
| `cd1c0ff91` | fix: comm_style nasce como text nullable (não text[]) | **reverteu** para `text` |

É um vai-e-volta de uma única linha: `git show cd1c0ff91` restaura o blob `035b96ebc…`, exatamente o
blob criado por `2c97614b0` — o mesmo blob que está hoje em
`origin/main:supabase/migrations/20261115010000_copilot_live_motor.sql`. Diff líquido da branch nessa
linha = zero.

### A intenção do commit intermediário sobrevive
`188daf208` queria alinhar o tipo com `20261031120000_copilot_phase4_brinde_intelligence.sql`
(`comm_style text[] NOT NULL DEFAULT '{}'`, origin/main:9), porque no replay local o
`ADD COLUMN IF NOT EXISTS` pulava a coluna já existente com tipo divergente. `cd1c0ff91` trocou de
estratégia: em vez de propagar `text[]`, deixou a migration do motor como `text` e delegou a
conciliação a `20261031160000_copilot_radar_delta_columns.sql`, que está na main e resolve os dois
casos num bloco `DO` com guarda de dados (origin/main:20-50):

- se `data_type = 'ARRAY'` → aborta se alguma linha tiver >1 elemento, senão `DROP DEFAULT` →
  `TYPE text USING (comm_style[1])` → `DROP NOT NULL` → `SET DEFAULT NULL`;
- se já for `text` → no-op. O próprio comentário da migration cita "20261030200000 corrigida".

Na main o motor foi renumerado para `20261115010000`, isto é, **depois** de `20261031160000`, então o
`ADD COLUMN IF NOT EXISTS comm_style text` é no-op e o estado final é `text` nullable — o tipo que o
consumidor exige (`supabase/functions/_shared/copilot-tick.ts:73`, `comm_style: texto(80).optional()`,
string simples, não array).

### Confirmação em produção (`tnnnlkbymytvtqngbbqh`, SELECT, 2026-11-15)
`information_schema.columns` → `copilot_sessions.comm_style`: `data_type=text`, `is_nullable=YES`,
`column_default=null`. Bate com `supabase/schema-catalog.json:913`
(`copilot_sessions.comm_style:text:nullable`).

Ou seja: a linha removida era um tipo **errado** para o consumidor; o commit que a removeu é o que
acertou, e a correção de replay que ela tentava fazer existe na main por caminho melhor. Nenhuma
proteção, validação ou funcionalidade foi perdida.

## Verificação adversarial

**Parecer: CONCORDO com INCORPORADA** · apagar branch: seguro · lacunas adicionais: nenhuma.

Tentei refutar procurando qualquer hunk útil da branch ausente da `main`. Não existe nenhum — o
`line_check` do JSON (115 linhas "faltando") é artefato de comparação por caminho; o conteúdo é o mesmo blob.

### 1. Identidade de conteúdo, verificada por mim
```
git rev-parse origin/claude/feat-radar-migration-261101-1550:supabase/migrations/20261030200000_copilot_live_motor.sql
  -> 035b96ebce047bcde8f24596f4387ab9d429dbb6
git rev-parse origin/main:supabase/migrations/20261115010000_copilot_live_motor.sql
  -> 035b96ebce047bcde8f24596f4387ab9d429dbb6
git diff <branch-blob> <main-blob>  -> vazio
```
Mesmo SHA de blob = conteúdo byte-idêntico. Único arquivo do diff `1252bb5a..0789ca734`
(`git diff --stat`: 1 arquivo, 136 inserções). O nome antigo `20261030200000` não existe na `main`
(`git ls-tree -r --name-only origin/main -- supabase/migrations | grep -c 20261030200000` = 0).
Entrada na main: `f369f88b2` "feat(copiloto): liga o motor do RADAR — gatilho + handler, nasce desligado (#3127)".

### 2. Commits intermediários — varredura blob a blob
Varri todos os 6 commits da branch pelo SHA do blob do arquivo:

| Commit | blob |
|---|---|
| `2c97614b0` | `035b96ebc…` (= main) |
| `188daf208` | `f05256286…` (único divergente) |
| `cd1c0ff91` | `035b96ebc…` (= main) |
| `fec771439`, `c80f53acd`, `0789ca734` (merges de main) | `035b96ebc…` (= main) |

`git log --name-status --no-merges` confirma que **nenhum outro arquivo** foi autorado na branch:
os 3 commits próprios tocam só essa migration. O único blob divergente (`f05256286…`) difere de `main`
em **1 linha** (`git diff 188daf208 cd1c0ff91`):
`comm_style text[] NOT NULL DEFAULT '{}'` → `comm_style text`. Foi a própria branch que reverteu, no seu
último commit de autoria. Diff líquido = zero; não é lacuna.

### 3. A intenção do commit intermediário está coberta na main
`origin/main:supabase/migrations/20261031160000_copilot_radar_delta_columns.sql:22-51` resolve os dois
casos num bloco `DO` com guarda de dados: se `data_type='ARRAY'`, aborta com `RAISE EXCEPTION` caso
alguma linha tenha `array_length(comm_style,1) > 1`, senão `DROP DEFAULT` → `TYPE text USING (comm_style[1])`
→ `DROP NOT NULL` → `SET DEFAULT NULL`; se já for `text`, no-op (comentário cita "20261030200000 corrigida").

### 4. A renumeração não perde nada
Ordem na main: `20261031120000` (text[]) → `20261031160000` (converte p/ text) → `20261115010000`
(motor; `ADD COLUMN IF NOT EXISTS comm_style text` = no-op). Estado final `text` nullable, igual ao
que a ordem original da branch produziria. Em `copilot_insights.tier` a ordem da main faz prevalecer o
`NOT NULL DEFAULT 1` da delta sobre o `smallint CHECK` nullable do motor — mais estrito, não perda.

### 5. Produção (`tnnnlkbymytvtqngbbqh`, `db_query` SELECT, 2026-11-15) — reconsultada por mim
17 linhas, todas confirmando: ledger tem `20261115010000 copilot_live_motor` e `20261031160000
copilot_radar_delta_columns` (a versão `20261030200000` **não** está no ledger); `pg_proc` tem
`enqueue_copilot_tick_on_contact_message`; `pg_trigger` tem `trg_copilot_tick_on_contact_message`;
`copilot_sessions` tem as 9 colunas (`comm_style` = `text/YES`, `stakeholders` e `brinde_evidence`
`jsonb/NO`); `copilot_insights` tem `tier smallint`, `latency_ms integer`, `data jsonb`;
`feature_flags.ai.capability.copilot_live` = `false` (nasce desligado, como a migration exige).

Consumidores vivos na main: `supabase/functions/_shared/copilot-tick.ts`,
`supabase/functions/ai-jobs-worker/index.ts`, `supabase/functions/_shared/__tests__/copilot-tick.test.ts`.

### Ressalva (não é lacuna desta branch)
Ligar a flag (`UPDATE feature_flags SET enabled = true WHERE key='ai.capability.copilot_live'`) gera
custo de IA por mensagem de contato — decisão do dono, independente do destino desta branch.
