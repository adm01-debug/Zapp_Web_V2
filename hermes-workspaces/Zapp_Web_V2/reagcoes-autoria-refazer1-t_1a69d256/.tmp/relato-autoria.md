Especialista: worker (sql) (area-sql-banco)
Números: 2 arquivos no diff — 1 migration nova + 1 prova nova (é o único arquivo de teste).

## O que mudou e por quê
- `supabase/migrations/20261013210000_message_reactions_autoria.sql` (novo): consolida a escrita de
  `public.message_reactions` em UMA policy por comando, todas `TO authenticated`:
  * INSERT: `user_id = public.get_profile_id_for_user(auth.uid())` **e** `contact_id IS NOT DISTINCT FROM
    (contact da própria mensagem)` **e** a visibilidade da mensagem (a mesma de antes);
  * UPDATE: USING/DELETE USING = autor **ou** `public.is_admin_or_supervisor(auth.uid())`; o UPDATE ganhou
    WITH CHECK (antes não tinha) — fecha personificação/fuga de contato no upsert;
  * DROPadas as redundantes vivas que somavam por OR: `Users can insert reactions for assigned contacts`
    (INSERT) e `Users can delete their own reactions` (DELETE) — confirmadas em `pg_policies` do banco
    local antes de mexer. Fecha SEC-RLS_CONTATOS_MENSAGENS-04
    (`docs/audits/SEGURANCA_RLS_CONTATOS_MENSAGENS_2026-10-07.md:112-129`).
- `supabase/tests/rls_message_reactions_autoria.sql` (novo): prova de RLS rodando como os papéis REAIS
  (`SET ROLE authenticated` com as claims do usuário; `SET ROLE anon`), nunca só como postgres.

## Prova (banco LOCAL da tarefa, papéis reais)
- Aplicação: `hermes-db-migrar supabase/migrations/20261013210000_message_reactions_autoria.sql`
  → `APLICADA no banco LOCAL 'v2-261013021892a8' (produção não foi tocada)`.
- vermelho antes (mesma prova, SEM a migration): `zapp-db-local psql . v2-261013021892a8 < supabase/tests/rls_message_reactions_autoria.sql`
  → `ERROR: [FAIL] A2 user_id de COLEGA é negado (personificação)`, `[FAIL] A3 user_id nulo (reação "de cliente")`,
  `[FAIL] A4 contact_id de contato alheio é negado`, `[FAIL] restam exatamente 3 policies de escrita`.
- verde depois (mesmo comando, com a migration):
  `[PASS] A1 atendente A grava a PRÓPRIA reação (caminho do app)` … `[PASS] ANON não insere reação` …
  `[PASS] ADMIN troca/apaga a reação de terceiro (moderação)` … `[PASS] restam exatamente 3 policies de escrita`;
  15 linhas `[PASS]`, zero `[FAIL]`, zero `ERROR`.
- Rollback executável conferido: as linhas `-- Rollback:` rodadas em `BEGIN; … ROLLBACK;` no banco local
  → `DROP POLICY`×3, `CREATE POLICY`×5, `write_policies_apos_rollback = 5`, `ROLLBACK` (estado intacto).
- `zapp-verify . --rapido` → `VERIFY: VERDE SEM BANCO (219s)` (dependencias/db_guard/tipos/lint/migrations OK).

## Contrato do front (por que não usei `contact_id IS NULL` literal)
O cartão pede `AND contact_id IS NULL`. Isso derrubaria o único escritor autenticado: o upsert de
`src/hooks/reactions/useReactionMutations.ts:65` manda `{ message_id, user_id: profileId, contact_id: contactId, emoji }`
(`contactId` resolvido da própria mensagem), e o UPDATE do mesmo upsert cairia no WITH CHECK. Então mantive
`contact_id` = contato da mensagem: o buraco do cartão (personificar colega e forjar "reação de cliente")
fica negado do mesmo jeito — provado em A2/A3 — sem quebrar o app. Conferi os 4 pontos que tocam a tabela
(`useReactionMutations.ts` add/remove, `useBatchReactions.ts`, `useMessageReactions.ts`): os demais só leem.

## Efeitos colaterais (passada obrigatória)
Só policies; nenhum dado, trigger, GRANT, papel ou ACL tocado (não há objeto novo). Mudança atômica (um
BEGIN/COMMIT). Sem oráculo novo. Nenhum identificador do banco real no diff nem aqui.

## O que NÃO fiz e por quê
- Não criei harness de CI novo em scripts/db-audit (o cartão só permite `supabase/migrations/**` e
  `supabase/tests/**`; e um harness novo reprovaria no inventário do CI). A prova foi para `supabase/tests/`, o que às vezes
  dispara alarme falso de "teste tautológico" — o teste não é tautológico: ele FALHA na base (colado acima).
- Não mexi em GRANT/anon (SEC-RLS_CONTATOS_MENSAGENS-05) nem no SELECT (`message_reactions_select_policy`,
  SEC-RLS-08): fora do escopo deste cartão.
