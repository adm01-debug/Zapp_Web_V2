Especialista: worker (sql) (area-sql-banco)

## O que mudou e por quê
- Arquivos no commit: `supabase/migrations/20261013235905_reassign_agents_only_open_conversations.sql`, `supabase/tests/reassign_agents_only_open_conversations.sql`, `src/integrations/supabase/types.ts` e o proprio `.tmp/relato.md`.
- `supabase/migrations/20261013235905_reassign_agents_only_open_conversations.sql` (nova): redefine `public.reassign_overloaded_agents` e `public.reassign_absent_agents` para (a) contar e mover SO contatos `conversation_status='open'` e `deleted_at IS NULL`; (b) so entregar a candidato com capacidade livre medida por abertas (`abertas < profiles.max_chats`); (c) ordenar pela conversa em espera ha mais tempo (`COALESCE(conversation_status_changed_at, created_at)` ASC, nunca `updated_at`); (d) aceitar `p_dry_run boolean DEFAULT false` (devolve a contagem prevista sem mover nem gravar evento); (e) manter a mesma guarda de papel (admin/supervisor ou service_role), o `search_path` fixo e o registro em `conversation_events`. Assinaturas antigas (`()` e `(integer)`) saem com DROP antes do CREATE — com `p_dry_run` default, `()`/`(integer)` e a nova assinatura coexistiriam e a chamada sem argumento (a tela usa `reassign_overloaded_agents()`) ficaria AMBIGUA. Sem TR1/RPC de atribuicao auditada no repo, preservo o INSERT manual existente em `conversation_events` (nao ha funcao auditada para chamar).
- `supabase/tests/reassign_agents_only_open_conversations.sql` (novo): prova as duas RPCs no banco LOCAL, dentro de `BEGIN…ROLLBACK`, com `request.jwt.claims` para simular os papeis e checagem de ACL por `has_function_privilege`/`aclexplode`.
- `src/integrations/supabase/types.ts`: atualiza `Args` das duas RPCs para o novo argumento `p_dry_run?` (o cartao autoriza tipos.ts).

## Prova
- vermelho antes (functions antigas restauradas pelo rollback da migration): `zapp-db-local psql . v2-… -v ON_ERROR_STOP=1 < supabase/tests/reassign_agents_only_open_conversations.sql` → `ERROR: function public.reassign_overloaded_agents(boolean) does not exist` (rc 3).
- verde depois (migration reaplicada): mesmo comando → `T1..T10 OK` e `ROLLBACK` (rc 0). Casos: T1 dry-run conta 2 sem mover nem gravar evento; T2 move 2 abertas e deixa resolvida e soft-deleted intactas; T3 ordem por espera mais antiga ignorando `updated_at`; T4 candidato lotado de resolvidas ainda recebe (capacidade = abertas) e o lotado de abertas nao recebe; T5 ausencia move so abertas, dry-run nao move; T6 `authenticated` sem admin negado; T7 `inactive_minutes` negativo rejeitado (22023); T8 falha no evento desfaz o movimento (atomico); T9 EXECUTE restrito a authenticated+service_role e assinaturas antigas removidas; T10 `updated_at` so muda nas movidas (antes/depois).
- migration aplicada no banco LOCAL: `hermes-db-migrar supabase/migrations/20261013235905_…sql` → `APLICADA no banco LOCAL 'v2-…' (producao nao foi tocada)`.

## Efeitos colaterais conferidos
- Atomicidade: uma chamada = uma transacao; T8 prova que a falha no meio desfaz tudo.
- Gatilhos: o `UPDATE contacts` dispara `trg_log_assignment_change` (evento 'transfer'), comportamento PRE-existente, preservado; nao criei nem silenciei gatilho.
- `updated_at`: o `UPDATE` dispara `update_contacts_updated_at` (BEFORE UPDATE, regrava `NEW.updated_at = now()`). Ele regrava SO as linhas movidas — e a data DEVE mudar nelas (a linha mudou). Aviso do juiz sobre "regrava em todas as linhas tocadas": nao ha backfill nem UPDATE amplo aqui, so `WHERE id = v_contact.id`. Prova antes/depois na T10: a movida muda de data e a resolvida da mesma agente e o contato de outra agente ficam intactos (nao desligo o gatilho porque a semantica de `contacts.updated_at` nao esta no escopo do cartao).
- Capacidade so por abertas: resolvidas e soft-deleted nao contam nem se movem (T2/T4).
- ACL: REVOKE de PUBLIC/anon e GRANT a authenticated/service_role reproduz o ACL vigente do manifesto (postgres, service_role, authenticated); nada alem disso.
- Entrada invalida: negativo rejeitado com SQLSTATE 22023.

## O que NAO fiz e por que
- `supabase/schema-manifest.json` e `schema-catalog.json` nao foram regerados (nao estao no cartao; sao snapshots do db-live-guard). O guard `.rpc()` casa por NOME, nao por aridade, entao o rename nao quebra.
- `useAgentReassignment.ts` nao foi tocado: as chamadas atuais (`reassign_overloaded_agents()`, `reassign_absent_agents({inactive_minutes})`) seguem validas com os defaults.
- Nao criei `.test.sh` em `scripts/db-audit/` (precisaria de passo no db-guard.yml); a prova ficou na suite `supabase/tests/` que o cartao lista.

## Conclusao
Conclui. Diferente da sonda: o modo `--nova=` do hermes-db-migrar retorna rc 2 sem criar arquivo nesta sessao (a rotina interna chama git por caminho absoluto, barrado); criei o arquivo com a versao que a propria ferramenta calculou (20261013235905) e apliquei por `hermes-db-migrar <arquivo>`, que funcionou.
