# Dossiê — claude__fix-canonical-receipt-policies-261020-2005 (PR #2137)

**Propósito**: 1 migration nova `supabase/migrations/20261021000000_recreate_team_message_receipt_policies_canonical.sql` (109 linhas, commit b397e0d4a) que faz DROP+CREATE incondicional das policies `Members can insert own receipts` (INSERT) e `Conversation members can read receipts` (SELECT) em `public.team_message_receipts`, na forma canônica. Alvo declarado: convergência do **replay local** de migrations; em produção o próprio autor declara "no-op funcional".

## Arquivo × achado × evidência

| Arquivo | Status | Achado | Evidência |
|---|---|---|---|
| `supabase/migrations/20261021000000_recreate_team_message_receipt_policies_canonical.sql` | NEW_FILE_ABSENT_IN_MAIN | **OBSOLETA** — necessidade já coberta pela main e por produção | (1) Produção ao vivo (`pg_policies`, 15/11/2026, projeto tnnnlkbymytvtqngbbqh): SELECT `qual = is_admin_or_supervisor(auth.uid()) OR EXISTS(... mem.profile_id = current_profile_id())`, INSERT `with_check = (profile_id = current_profile_id()) AND EXISTS(... mem.profile_id = team_message_receipts.profile_id)`, ambas `roles={authenticated}` — texto idêntico ao da branch. (2) Migration `20261021000000` **não** está em `supabase_migrations.schema_migrations`; `20260928430000` e `20261003272707` estão. (3) A forma canônica já está declarada textualmente na main em `supabase/migrations/20261003272707_reconcile_local_replay_with_canonical.sql:68-109` (bloco `if not exists ... create policy`). (4) O replay: `20260928430000_team_chat_fix_policies_to_authenticated.sql` (forma fraca) está no allowlist `scripts/db-audit/replay-known-failures.json:75` — falha por `conversation_id` inexistente (psql `ON_ERROR_STOP=1`, `scripts/db-audit/replay-local.sh:167`) antes de criar as policies fracas, então a guarda de `20261003272707` dispara e cria o canônico. (5) O próprio corpo da PR #2137 mediu replay em `origin/main` puro (1046 migrations) e na branch (1047) e obteve estado final **idêntico e canônico** nos dois; conclui "é seguro fechar o PR sem merge". Revisão Qodo na PR: "Replay fix targets an already-fixed state". |

Testes da main que já protegem a forma canônica: `scripts/db-audit/team-receipts-membership.test.sh:232,242`, `scripts/db-audit/team-message-read-state.test.sh:207,211`; hash das policies em `supabase/schema-manifest.json:4775,4868`.

## Veredito
**OBSOLETA** (confiança alta). A migration é uma reafirmação defensiva/idempotente de um estado que produção já tem e que o replay da main já reproduz. Nenhuma linha útil ausente; portar criaria apenas uma migration redundante (DROP+CREATE em produção sem efeito funcional).

Observação: a PR foi fechada em 01/11/2026 com comentário genérico ("absorvido pela main"); a prova real é a acima, não o comentário.

## Lacunas a recuperar
Nenhuma. `apagar_branch_seguro = true`.

## Verificação adversarial

Parecer: **concordo com OBSOLETA**. Tentei refutar por quatro frentes e todas fecharam contra a branch.

Diff real conferido: `git diff bac62ba9 origin/claude/fix-canonical-receipt-policies-261020-2005` = 1 arquivo, 109 inserções,
só a migration `supabase/migrations/20261021000000_recreate_team_message_receipt_policies_canonical.sql`. Nenhum outro hunk a resgatar.

1. **A necessidade alegada (divergência no replay limpo) não existe.** A premissa da branch é que
   `20260928430000_team_chat_fix_policies_to_authenticated.sql` cria as duas policies na forma fraca e, por isso, a guarda
   `if not exists` de `20261003272707` pula. Isso é falso no replay:
   - `replay-local.sh` roda cada arquivo com `psql -v ON_ERROR_STOP=1` **sem** `--single-transaction`
     (`origin/main:scripts/db-audit/replay-local.sh:166-168`) → o arquivo aborta no primeiro erro e o que veio antes fica.
   - Em `origin/main:supabase/migrations/20260928430000_...sql`, a **linha 20** (`CREATE POLICY "Conversation members can read
     receipts" ... USING (is_team_conversation_member(auth.uid(), conversation_id))`) é a primeira referência a
     `conversation_id` do arquivo e é exatamente a falha allowlistada
     (`origin/main:scripts/db-audit/replay-known-failures.json:75-78`: "column 'conversation_id' does not exist no replay").
   - Logo, no replay: a linha 18 (`DROP POLICY IF EXISTS "Conversation members can read receipts"`) **executa**, a linha 20
     falha e as linhas 22-24 (a policy de INSERT fraca) **nunca rodam**.
   - Estado quando `20261003272707` chega: SELECT inexistente (guarda só checa `policyname` → dispara, cria o canônico);
     INSERT ainda na versão de `20260927270016_team_chat_e26_fix_receipt_insert_policy.sql:3`, que é **sem `TO`** → `roles={public}`,
     então a guarda `policyname = 'Members can insert own receipts' and roles = '{authenticated}'`
     (`origin/main:supabase/migrations/20261003272707_...sql:68-87`) **não** casa e dispara, criando o canônico `TO authenticated`.
   - Nada entre as duas, nem depois delas até o HEAD da main, volta a mexer nessas policies: `git grep -l` pelos dois nomes em
     `supabase/migrations` dá 5 arquivos, e os dois posteriores
     (`20261006222024_` e `20261009193246_team_receipts_reactions_conversation_id_forced.sql`) só as citam em comentário;
     `20260930260000_team_reaction_membership_guard.sql:23-24` idem ("`team_message_receipts` NÃO entra").
   → O replay da main já converge para o canônico. A migration da branch não corrige nada.

2. **A substituição alegada cobre a necessidade** (exigência do protocolo para OBSOLETA): abri
   `origin/main:supabase/migrations/20261003272707_reconcile_local_replay_with_canonical.sql:68-107` e o `with check` do INSERT e o
   `using` do SELECT são **texto a texto** os mesmos da branch (mesmo `EXISTS` com `join team_messages`, mesmo
   `is_admin_or_supervisor(auth.uid()) or ...`). A única diferença é a guarda `if not exists`, que, pelo item 1, dispara no replay.

3. **Produção conferida ao vivo, hoje** (MCP `SUPABASE - ZAPP WEB V2 - MCP`, projeto `tnnnlkbymytvtqngbbqh`, 15/11/2026,
   `select policyname, cmd, roles, qual, with_check from pg_policies where tablename='team_message_receipts'`):
   - `Conversation members can read receipts` / SELECT / `{authenticated}` /
     `qual = (is_admin_or_supervisor(auth.uid()) OR (EXISTS (SELECT 1 FROM (team_conversation_members mem JOIN team_messages tm ON ((tm.id = team_message_receipts.message_id))) WHERE ((mem.conversation_id = tm.conversation_id) AND (mem.profile_id = current_profile_id())))))`
   - `Members can insert own receipts` / INSERT / `{authenticated}` /
     `with_check = ((profile_id = current_profile_id()) AND (EXISTS (... AND (mem.profile_id = team_message_receipts.profile_id))))`
   Idênticas ao que a branch criaria → em produção é mesmo no-op. Ledger:
   `select version from supabase_migrations.schema_migrations where version in (...)` devolve `20260927270016`, `20260928430000`,
   `20261003272707` e **não** `20261021000000` — a migration da branch nunca foi aplicada e não falta nada por ela.

4. **Não há hunk de valor ≥ médio fora disso.** O conteúdo restante do arquivo são ~70 linhas de comentário (diagnóstico,
   rollback, fonte da expressão). Valor documental, abaixo de médio, e parte dele está factualmente **errada** (afirma que a
   guarda de `20261003272707` é pulada no replay) — portar introduziria documentação incorreta além de um DROP+CREATE de RLS em
   produção sem ganho. A forma canônica já está protegida por teste e manifesto na main:
   `origin/main:scripts/db-audit/team-receipts-membership.test.sh:232-247` (recria as duas policies exatamente nessa forma) e
   `origin/main:supabase/schema-manifest.json:4868`.

Lacunas adicionais encontradas: nenhuma. `apagar_branch_seguro = true` mantido.
