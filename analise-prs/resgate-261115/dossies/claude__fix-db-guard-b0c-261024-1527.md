# Dossiê — claude__fix-db-guard-b0c-261024-1527 (PR #2226)

**Branch:** `origin/claude/fix-db-guard-b0c-261024-1527` · tip `4aab75adf` · merge-base `1645c4aac` · 1 commit, 1 arquivo (+7/-0)
**PR #2226:** CLOSED sem merge em 2026-11-01; comentário de fechamento: "supersedida por correções posteriores de CI/db-guard".

## Propósito
Corrigir a assertion B.0c do TC-009 (`scripts/db-audit/team-receipts-reactions-conversation-id.test.sh:413`): o backfill da migration
`20261009193246_team_receipts_reactions_conversation_id_forced.sql` fazia `UPDATE team_message_receipts SET conversation_id=...` e o
trigger BEFORE UPDATE `team_message_receipts_update_guard_trig` preenchia `read_at` em recibos legados `status='read', read_at=NULL`
como efeito colateral. A branch envolve os dois UPDATEs do backfill com `SET LOCAL session_replication_role = replica` / `DEFAULT`.

## Arquivo × achado × evidência

| Arquivo | Branch | Main hoje | Achado |
|---|---|---|---|
| `supabase/migrations/20261009193246_team_receipts_reactions_conversation_id_forced.sql` | `SET LOCAL session_replication_role = replica;` antes do UPDATE de recibos e `= DEFAULT` depois do UPDATE de reações (+3 linhas de comentário) | `ALTER TABLE public.team_message_receipts DISABLE TRIGGER team_message_receipts_update_guard_trig;` (linha 35) → UPDATE recibos → `ENABLE TRIGGER` (linha 41), com comentário nas linhas 33-34 explicando o mesmo motivo (`read_at` / `status='read'`) | **Intenção já na main com outro texto.** Introduzido por `4efaa6db0` (PR #2282, 2026-10-27) — `git log -S'DISABLE TRIGGER team_message_receipts_update_guard_trig'`. |

Cobertura do escopo da branch (reações): a branch também "protegia" o UPDATE de `team_message_reactions`. Na main, a única trigger dessa
tabela é `team_reactions_dedup_trig BEFORE INSERT` (`supabase/migrations/20260929220000_team_chat_e32_reactions_hardening.sql:14`) —
UPDATE de backfill não dispara nenhum trigger, logo a abordagem estreita da main cobre toda a necessidade.

A abordagem da main é inclusive a recomendada pela revisão automática da PR #2226 (Qodo: "prefira a desativação específica do trigger
de guarda", pois `SET LOCAL` não persiste sem transação explícita no `psql_file` do TC-009).

## Produção (somente leitura, `supabase_migrations.schema_migrations`)
`20261006222024` e `20261009193246` (`team_receipts_reactions_conversation_id_forced`) constam aplicadas no ledger — backfill é one-shot;
nada a reaplicar.

## Veredito
**INCORPORADA** (confiança alta). Mesmo comportamento (guard de UPDATE silenciado durante o backfill de recibos), texto diferente, já em
`origin/main` e já em produção. Nenhuma lacuna a recuperar. `apagar_branch_seguro = true`.

## Verificação adversarial

Parecer: **concordo — INCORPORADA**, e com razão mais forte do que a triagem alegou: o hunk da branch não é apenas
redundante, ele **não funcionaria** no harness que a própria branch tentava consertar.

1. **Diff da branch conferido na íntegra** (`git diff 1645c4aac 4aab75adf`): 1 arquivo, +7/-0, só
   `SET LOCAL session_replication_role = replica;` (antes do UPDATE de recibos), `= DEFAULT;` (depois do UPDATE de
   reações) e 3 linhas de comentário. Nada além disso — nenhum hunk escondido para resgatar.
2. **Main cobre a necessidade**: `origin/main:supabase/migrations/20261009193246_team_receipts_reactions_conversation_id_forced.sql:33-41`
   — comentário sobre `read_at`/`status='read'` + `ALTER TABLE public.team_message_receipts DISABLE TRIGGER
   team_message_receipts_update_guard_trig` (l.35) → UPDATE → `ENABLE TRIGGER` (l.41). No merge-base
   (`1645c4aac:…:31-36`) essas linhas não existiam; entraram em `4efaa6db0` (2026-10-27, PR #2282), três dias
   depois da branch. Confirmado também na migration irmã/predecessora
   `origin/main:supabase/migrations/20261006222024_…:l.35,41` — a main corrigiu **os dois** arquivos; a branch só um.
3. **A abordagem da branch era inoperante no TC-009** (achado novo, não estava na triagem):
   `scripts/db-audit/team-receipts-reactions-conversation-id.test.sh:49` aplica a migration com
   `psql -X -qAt -v ON_ERROR_STOP=1 … < "$1"`, em autocommit, e a migration não tem `BEGIN/COMMIT`
   (l.29: "Sem BEGIN/COMMIT: o gateway aplica a migration numa única transação"). `SET LOCAL` fora de bloco de
   transação morre no fim do próprio comando (Postgres só avisa, não falha), então os UPDATEs seguintes rodariam
   com os triggers **ligados** e a assertion B.0c (l.413) não seria consertada. Isso valida a crítica da revisão
   Qodo citada no dossiê e torna o hunk sem valor algum.
4. **Nenhuma lacuna no escopo "reações"** que a abordagem estreita da main deixaria aberta: no momento do backfill
   de `team_message_reactions`, os triggers vigentes são `team_reactions_dedup_trig` BEFORE **INSERT**
   (`20260929220000_team_chat_e32_reactions_hardening.sql:14`) e `team_reactions_force_conversation_id_trig`
   BEFORE INSERT OR UPDATE (`20261006222024_…:104-106`). O segundo dispara, mas faz exatamente o mesmo que o
   backfill (`SET conversation_id = <cid da mensagem>`) — idempotente, sem efeito colateral. Mesmo raciocínio para
   `team_receipts_fill_conversation_id_trig` (`20261006222024_…:78-80`). O único trigger nocivo é o guard de UPDATE
   de recibos, que escreve `read_at` (`20260928490000_team_chat_e13_receipts_hardening.sql:8,16`) — e é
   precisamente o que a main desliga.
5. **Não foi remoção deliberada de nada valioso**: `git log -S'session_replication_role' origin/main` não registra
   nenhum commit que tenha tirado esta abordagem do arquivo; ela nunca entrou na main.

Valor residual da branch: apenas 3 linhas de comentário com o nome do trigger, informação já presente na main em
outra redação (l.33-34). Valor **baixo**, abaixo do limiar de lacuna. `apagar_branch_seguro = true`.
