# Dossiê — claude__fix-high3-fk-indexes-261101-1830 (PR #2505)

**Ref:** `origin/claude/fix-high3-fk-indexes-261101-1830` · tip `65012f35e` · merge-base `1252bb5a4`
**Propósito:** HIGH-3 da auditoria 2026-10-25 — criar índices para 48 colunas FK sem cobertura (`supabase/migrations/20261031170000_high3-fk-indexes.sql`, 1 arquivo, +148 linhas). Commits: `8d55c1b53`/`032901902` (57 índices), `f9f14069c` (-7 redundantes), `00b4773a6` (-2 redundantes → 48, "arquivo = o aplicado em produção").

## Arquivo × achado × evidência

| Arquivo | Status mecânico | Achado | Evidência |
|---|---|---|---|
| `supabase/migrations/20261031170000_high3-fk-indexes.sql` | BOTH_CHANGED / CONFLICT (100 linhas "faltando") | **JÁ NA MAIN** — mesmo conteúdo, formatação diferente | Main (`587ec25f8`, PR #2551, 2026-11-02) tem o arquivo com os mesmos 48 `CREATE INDEX IF NOT EXISTS` em 1 linha cada; branch tem cabeçalho de 4 comentários + statements em 2 linhas. Normalizando (remover `--`, colapsar espaços, 1 statement/linha, sort): `diff` = vazio, 48 = 48 statements. |

O "CONFLICT" e as 100 linhas `missing_in_main` são artefato de formatação (quebra de linha após o nome do índice + comentários de cabeçalho), não de conteúdo SQL.

## Produção (somente leitura, `tnnnlkbymytvtqngbbqh`)
- `supabase_migrations.schema_migrations`: `20261031170000 | high3-fk-indexes` presente.
- `pg_indexes` (schema `public`): **48/48** índices nomeados na migration existem.

## Veredito
**INCORPORADA** (confiança alta). Nada a recuperar. `apagar_branch_seguro = true`.
Única diferença textual: comentários de cabeçalho (`-- HIGH-3: 48 foreign-key columns...`) — valor nenhum.

## Reexame de commits intermediários

Histórico (`git log --oneline --no-merges 1252bb5a4..origin/claude/fix-high3-fk-indexes-261101-1830`):
`8d55c1b53` (57 índices, arquivo `20261031140000`) → `49c1d4b0e` (apaga o arquivo: versão colidiu com PR #2483)
→ `032901902` (recria os 57 como `20261031170000`) → `f9f14069c` (−7) → `00b4773a6` (−2 → 48).

**Veredito do reexame: REFATORACAO_INTERNA.** Nenhum dos 3 achados é reversão de trabalho real.

### Achado 1 — `8d55c1b53` → `49c1d4b0e`: 117 linhas em `20261031140000_high3-fk-indexes.sql`
Renomeação de migration, não perda. O conteúdo de `8d55c1b53:20261031140000` e de
`032901902:20261031170000` é **byte a byte idêntico** (`diff` entre os dois blobs = vazio; 57 statements em
cada). Motivo do rename está no próprio commit: a versão `20261031140000` colidia com
`20261031140000_copilot_sessions_brinde_state.sql` (hoje na main). Valor a recuperar: **nenhum**.

### Achado 2 — `032901902` → `f9f14069c` (7 índices) e `00b4773a6` (2 índices)
Os 9 `CREATE INDEX` retirados **não** estão na ponta nem na main (`git grep` nas migrations da main: só
`idx_team_messages_reply_to_id`, e apenas em migration antiga de backfill/drop de duplicados). Mas a
**intenção** (cobertura de índice para checagem de FK) já está satisfeita em produção por índices parciais
preexistentes. Verificado ao vivo em `tnnnlkbymytvtqngbbqh` (somente `SELECT` em `pg_index`), coluna como
primeira chave do índice:

| Tabela.coluna | Índice que já cobre (produção) |
|---|---|
| `conversation_events.closure_id` | `ux_conversation_events_closure_id` (UNIQUE, `WHERE closure_id IS NOT NULL`) |
| `messages.reply_to_id` | `idx_messages_reply_to` (parcial NOT NULL) |
| `messages.whatsapp_group_id` | `messages_whatsapp_group_id_idx` (parcial NOT NULL) |
| `multiplix_events.recipient_id` | `idx_multiplix_events_recipient` (parcial NOT NULL) |
| `profiles.department_id` | `idx_profiles_dept_id` (parcial NOT NULL) |
| `team_conversations.department_id` | `idx_team_conversations_dept_id` (parcial NOT NULL) |
| `team_messages.reply_to_id` | `idx_team_messages_reply_to` (parcial NOT NULL) |
| `conversation_tasks.migrated_from_reminder_id` | `uq_conversation_tasks_migrated_from_reminder` (UNIQUE, parcial NOT NULL) |
| `crm_sync_outbox.contact_id` | `idx_crm_sync_outbox_contact` (parcial NOT NULL) |

9/9 cobertos. Checagem de FK sempre busca chave `NOT NULL`, e o planner prova que `col = <valor>` implica
`col IS NOT NULL`, então o índice parcial é usável — criar o índice full só somaria custo de escrita.
`f9f14069c` documenta exatamente isso na mensagem; `00b4773a6` fez o mesmo para os 2 restantes (sem
justificar na mensagem, mas confirmado aqui no banco). Valor a recuperar: **nenhum**.

### Achado 3 — `f9f14069c` → `00b4773a6`: 2 linhas de comentário de cabeçalho
`-- HIGH-3: 50 foreign-key columns...` → `48`, e `-- 7 columns excluded...` → `9`. Atualização de contagem
no comentário, acompanhando os 2 índices retirados. Valor a recuperar: **nenhum**.

### Conclusão
Mantém-se **INCORPORADA** · `apagar_branch_seguro = true`. A ponta (48 statements) é igual à main
(48 statements, formatação diferente) e os 48 índices existem em produção (ver seção anterior); as 138
linhas "sumidas" são 117 de rename de migration, 19+2 de remoção deliberada de índices redundantes e
atualização do comentário correspondente.

## Verificação adversarial

Papel: refutar o veredito INCORPORADA. **Não foi possível refutar — veredito confirmado.**

Checagens independentes (repo local, `origin/main` atual; banco `tnnnlkbymytvtqngbbqh` só `SELECT`):

1. **Superfície real da branch.** `git diff --name-status 1252bb5a4 origin/claude/fix-high3-fk-indexes-261101-1830`
   → uma única linha: `A supabase/migrations/20261031170000_high3-fk-indexes.sql` (148 inserções, 0 remoções).
   A branch não contribui nenhum outro arquivo — nada de `src/`, edge, workflow ou teste a resgatar.
   Os ~3 mil arquivos do `git diff origin/main..branch` são a main tendo andado desde 2026-11-01, não trabalho da branch.

2. **Conteúdo SQL idêntico.** Normalizando os dois blobs (remover linhas `--`, colapsar espaços,
   1 statement por linha, `sort`): `diff` vazio, 48 statements em cada lado.
   Main: `git show origin/main:supabase/migrations/20261031170000_high3-fk-indexes.sql` (48 linhas, commit `587ec25f8`, PR #2551, 2026-11-02).
   Único texto exclusivo da branch: 4 linhas de comentário de cabeçalho (`-- HIGH-3: 48 foreign-key columns…`,
   método de detecção, razão do `CREATE INDEX` não-CONCURRENTLY, 9 colunas excluídas). Valor documental **baixo** — abaixo do limiar de PERDIDA_PARCIAL.

3. **Ledger de produção.** `select version,name from supabase_migrations.schema_migrations where version in ('20261031170000','20261031140000')`
   → `20261031170000 | high3-fk-indexes` e `20261031140000 | copilot_sessions_brinde_state`.
   Confirma o motivo do rename no histórico da branch: a versão `…140000` está ocupada por outra migration em produção.

4. **Os 48 índices existem ao vivo.** `count(*) from pg_indexes where schemaname='public' and indexname in (<os 48 nomes>)` → **48**.

5. **Único lugar onde um gap poderia se esconder: os 9 índices retirados nos commits `f9f14069c`/`00b4773a6`.**
   Re-verifiquei por conta própria em `pg_index` (coluna como **primeira** chave do índice, `indkey[0]`): **9/9 cobertos** —
   `conversation_events.closure_id` → `ux_conversation_events_closure_id`; `messages.reply_to_id` → `idx_messages_reply_to`;
   `messages.whatsapp_group_id` → `messages_whatsapp_group_id_idx` (+ `messages_group_client_msg_uq`);
   `multiplix_events.recipient_id` → `idx_multiplix_events_recipient`; `profiles.department_id` → `idx_profiles_dept_id`;
   `team_conversations.department_id` → `idx_team_conversations_dept_id` (+ `idx_team_conversations_dept_unique`);
   `team_messages.reply_to_id` → `idx_team_messages_reply_to`; `conversation_tasks.migrated_from_reminder_id` → `uq_conversation_tasks_migrated_from_reminder`;
   `crm_sync_outbox.contact_id` → `idx_crm_sync_outbox_contact`.
   Além disso esses 9 statements **não estão na ponta da branch**, logo mergear a branch não os traria — são histórico intermediário, não trabalho pendente.

**Parecer: concordo. INCORPORADA · `apagar_branch_seguro = true`.** Nenhum hunk de valor ≥ médio fora da main.
