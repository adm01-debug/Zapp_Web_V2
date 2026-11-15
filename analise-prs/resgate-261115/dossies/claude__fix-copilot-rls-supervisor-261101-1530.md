# Dossiê — claude/fix-copilot-rls-supervisor-261101-1530 (PR #2485)

**Propósito**: restringir a supervisor/admin (`is_admin_or_supervisor(auth.uid())`) o INSERT em `copilot_learning_moments` e o UPDATE em `copilot_conversation_scores`, que na época eram `WITH CHECK (true)` (migration `20261031100000`, main). PR fechada em 2026-11-01 pelo congelamento de features (#2545); branch preservada.

Ref: `origin/claude/fix-copilot-rls-supervisor-261101-1530` (tip `f7ceab5`, merge-base `1252bb5`). 14 commits, 12 deles "re-trigger CI"/merges de main; diff útil = 1 migration (38 linhas) + `.github/.ci-trigger`.

## Arquivo × achado × evidência

| Arquivo | Achado | Evidência |
|---|---|---|
| `.github/.ci-trigger` | ruído (arquivo com conteúdo `7`, só para redisparar CI) | `git show <ref>:.github/.ci-trigger` → `7`; ausente em main (`git ls-tree origin/main .github/.ci-trigger` vazio). Valor: nenhum. |
| `supabase/migrations/20261031150000_copilot_rls_supervisor_only.sql` | **Não está na main nem em produção**, mas o buraco de segurança que a motivou (policies `true`) foi fechado em main por OUTRA abordagem (escopo por autor, não por papel). | main: `supabase/migrations/20261107133000_fix_copilot_rls_open_policies.sql` L36-61 e `20261107163000_fix_copilot_rls_wrong_join_column.sql` (commit `b67ef0c61`, PR #2763, 2026-11-07). Produção (`supabase_migrations.schema_migrations`): `20261107133000` e `20261107163000` aplicadas; `20261031150000` ausente. `pg_policies` hoje: `copilot_learning_moments_insert` WITH CHECK `(tagged_by = auth.uid())`; `copilot_conversation_scores_update` USING/WITH CHECK `(scored_by = auth.uid())`. |

## Por que não é INCORPORADA nem OBSOLETA

- Main (#2763) escolheu de propósito "autor = auth.uid()" ("mesmo padrão já usado em copilot_sessions/copilot_insights/copilot_feedback", comentário L1-7 da migration 20261107133000). Isso fecha o vazamento entre vendedores, **mas o vendedor ainda pode inserir learning_moment e score na própria conversa** (`tagged_by`/`scored_by` = ele mesmo). `copilot_conversation_scores` tem PK `conversation_id` (20261031100000 L129-134), logo um vendedor que se auto-avalia 5 impede o supervisor de inserir e (pela policy atual) de atualizar. A necessidade declarada na branch ("evitar manipulação das próprias avaliações") NÃO está coberta.
- A branch, por outro lado, **inverte uma permissão que main concede hoje** (vendedor pode inserir/atualizar como autor → só supervisor/admin). É mudança de regra de negócio oposta à vigente → `DECISAO_DONO` (critério b).
- Sem impacto imediato: nenhum chamador em `src/` nem `supabase/functions/` (`git grep copilot_learning_moments|copilot_conversation_scores origin/main -- src supabase/functions` só acha `src/integrations/supabase/types.ts`). Hooks `useConversationScore.ts`/`useCopilotLearning.ts` não tocam essas tabelas.

## Veredito: DECISAO_DONO (confiança alta)

Pergunta ao dono: quem pode registrar "momentos de aprendizado" e "nota da conversa" no Copilot — só supervisor/admin (branch) ou também o próprio vendedor (main hoje)? Se "só supervisor", recuperar a lacuna abaixo. Se "vendedor também", OBSOLETA → apagar branch.

## Lacuna a recuperar (se dono escolher "só supervisor")

Nova migration (versão nova > `20261115010000`, ledger de produção; a `20261031150000` da branch é anterior ao ledger e não pode ser reaproveitada), em cima das policies atuais de main. Hunk essencial (adaptado — manter também o SELECT escopado de main; só trocar INSERT/UPDATE):

```sql
-- copilot_learning_moments: INSERT só supervisor/admin
DROP POLICY IF EXISTS copilot_learning_moments_insert ON public.copilot_learning_moments;
CREATE POLICY copilot_learning_moments_insert
  ON public.copilot_learning_moments FOR INSERT TO authenticated
  WITH CHECK (public.is_admin_or_supervisor(auth.uid()) AND tagged_by = auth.uid());

-- copilot_conversation_scores: INSERT e UPDATE só supervisor/admin
-- (na branch original só o UPDATE era restrito; manter INSERT aberto deixa o vendedor
--  se auto-avaliar e, pela PK conversation_id, bloquear o supervisor)
DROP POLICY IF EXISTS copilot_conversation_scores_insert ON public.copilot_conversation_scores;
CREATE POLICY copilot_conversation_scores_insert
  ON public.copilot_conversation_scores FOR INSERT TO authenticated
  WITH CHECK (public.is_admin_or_supervisor(auth.uid()) AND scored_by = auth.uid());
DROP POLICY IF EXISTS copilot_conversation_scores_update ON public.copilot_conversation_scores;
CREATE POLICY copilot_conversation_scores_update
  ON public.copilot_conversation_scores FOR UPDATE TO authenticated
  USING (public.is_admin_or_supervisor(auth.uid()))
  WITH CHECK (public.is_admin_or_supervisor(auth.uid()) AND scored_by = auth.uid());
```

`is_admin_or_supervisor(uuid)` existe em main (`supabase/migrations/20251215025014_*.sql` L31). Fluxo DDL: arquivo → PR → merge → apply, conforme `docs/agentes/banco.md`; PR fica aberta para o dono (migration em produção).

`apagar_branch_seguro`: **false** (lacuna depende de decisão).

## Verificação adversarial

**Discordo do veredito. DECISAO_DONO → PERDIDA_PARCIAL.** Os fatos do dossiê conferem todos; o enquadramento não.

Fatos reconferidos (todos confirmados):
- Branch = 2 arquivos, 39 linhas (`git diff 1252bb5a4 origin/claude/fix-copilot-rls-supervisor-261101-1530 --stat`): `.github/.ci-trigger` (conteúdo `7`, ruído) + `supabase/migrations/20261031150000_copilot_rls_supervisor_only.sql` (38 linhas).
- Main hoje: `20261107133000_fix_copilot_rls_open_policies.sql` L48-51 (scores INSERT/UPDATE `scored_by = auth.uid()`) e L60-61 (moments INSERT `tagged_by = auth.uid()`); `20261107163000` L7-19 só conserta o SELECT.
- Produção (`pg_policies`, 2026-11-15): `copilot_conversation_scores_insert` CHECK `(scored_by = auth.uid())`, `_update` USING/CHECK `(scored_by = auth.uid())`, `copilot_learning_moments_insert` CHECK `(tagged_by = auth.uid())`. `20261031150000` ausente do ledger; `20261107133000`, `20261107163000`, `20261115010000` presentes.
- PK `conversation_id` em `copilot_conversation_scores` confirmada (`20261031100000_copilot_fases13_15_tabelas.sql` L129-134) → com INSERT aberto por autor, o vendedor que se auto-avalia trava para sempre o INSERT e o UPDATE do supervisor. Falha real da main.
- Zero uso: `copilot_conversation_scores` e `copilot_learning_moments` com **0 linhas** em produção; `src/hooks/copilot/useConversationScore.ts` é cálculo puro (L29-50, sem Supabase) e `useCopilotLearning.ts` é stub (L16-25, só callback). Nenhum chamador em `src/` nem `supabase/functions/`.
- `public.is_admin_or_supervisor` existe em produção e em main (`20251215025014_*.sql` L31). Produção tem 3 `supervisor` + 2 `admin` em `user_roles` → restringir não deixa a tabela sem escritor.

Por que não é decisão do dono:
1. **Não existe regra vigente em sentido contrário.** O #2763 (`b67ef0c61`, "fix(db): fecha RLS multi-tenant do Copilot") aplicou um padrão genérico de escopo por autor — comentário L1-7 da `20261107133000`: "mesmo padrão já usado em copilot_sessions/copilot_insights/copilot_feedback". Não houve escolha de negócio sobre quem avalia.
2. **A própria main assume que quem avalia é o gestor**: `20261107163000` L4-5 — "O dono da conversa perdia acesso ao score/learning moment quando outra pessoa (**gestor**) registrava o seu". A branch converge com esse modelo, não o contradiz.
3. **Nada a reverter na prática**: 0 linhas, 0 chamadores, nenhuma tela. A "permissão vigente" existe só como predicado de RLS em tabela vazia e sem uso.
4. `git log --grep=supervisor` e `git log -S"is_admin_or_supervisor"` nos arquivos envolvidos: nenhuma rejeição da abordagem supervisor-only. Nada de "remove"/"revert"/"desativa".
5. Sem custo externo recorrente. É DDL puro — e DDL sozinho não justifica chamar o dono (dono autorizou banco e backend).

Correções/lacunas adicionais ao dossiê:
- **Versão da nova migration**: o dossiê diz "> 20261115010000"; o ledger de produção já está em **20261115020000** (`max(version)`). A nova precisa ser > `20261115020000`.
- **Não reaproveitar o arquivo da branch verbatim**: o `WITH CHECK` dele é só `is_admin_or_supervisor(auth.uid())`, sem `tagged_by`/`scored_by` — aplicado sobre a main, *perderia* o escopo por autor do #2763. Use o hunk adaptado do dossiê (papel **E** autor).
- **Lacuna vizinha não registrada**: hoje `copilot_learning_moments` não tem policy de UPDATE nem DELETE, e `copilot_conversation_scores` não tem DELETE (`pg_policies`: 2 e 3 policies). Com a PK por conversa, um registro errado é intocável por qualquer usuário (só `service_role`). Quem escrever a migration deve resolver isso no mesmo arquivo.

`apagar_branch_seguro`: **false** — o hunk só existe aqui e no dossiê; apagar a branch depois que a migration nova entrar.
