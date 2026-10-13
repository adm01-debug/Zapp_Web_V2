Especialista: worker (sql) (area-sql-banco)

## O que mudou e por quê
- supabase/migrations/20261013051916_contact_change_log.sql (nova): cria a tabela append-only
  `public.contact_change_log` (contact_id, operation, campos text[], performed_by,
  performed_by_profile, performed_by_db_role, performed_at), o gatilho `trg_contact_change_log`
  (AFTER INSERT OR UPDATE em `contacts`) e a funcao SECURITY DEFINER `public.log_contact_change()`,
  que grava UMA linha por alteracao com SO OS NOMES dos campos em `campos` — nunca os valores
  (sem PII: nome, telefone, e-mail, endereco e nota nao entram). UPDATE que nao mexe em nenhum
  campo de negocio nao gera linha; soft-delete/restore viram `operation` propria.
- supabase/migrations/...: RLS ligada; policy de SELECT igual a visibilidade do contato
  (`public.is_contact_visible_to_user(contact_id, auth.uid())`); INSERT/UPDATE/DELETE bloqueados
  (policy `... using(false)` + REVOKE); `anon` sem policy e sem ACL; `authenticated`/`service_role`
  so com SELECT. Gatilho escreve como definer (owner), entao o cliente nao precisa de INSERT.
- supabase/tests/contact_change_log.sql (nova): suite em Postgres 17 descartavel que aplica a
  migration REAL e prova, com papeis reais (authenticated com JWT sintetico, anon), escrita,
  nao-vazamento de PII, soft-delete/restore, isolamento por visibilidade e o rollback.
- src/integrations/supabase/types.ts: adiciona `contact_change_log` (Row/Insert/Update) para o
  tipo nao ficar defasado da tabela nova — o proprio cartao pede (o painel/hook le essa tabela).

## Prova
- vermelho antes (`-v sem_guarda=1`, derruba o gatilho dentro da transacao):
  `docker exec -i pg-ccl psql ... -v sem_guarda=1 -f - < supabase/tests/contact_change_log.sql`
  -> `ERROR: FALHOU [E.12 gatilho e AFTER INSERT OR UPDATE (...)]: esperado [true], obtido [<NULL>]`
- verde depois: mesmo comando sem `sem_guarda` ->
  `PASS: contact_change_log — 1 linha por edicao com ator certo, SO os nomes dos campos (sem PII),
   UPDATE irrelevante nao grava, soft-delete/restore proprios, leitura sob a visibilidade do
   contato, append-only, e rollback provado.` (exit 0; 6 blocos: E.1-E.16 estrutura, W.1-W.14
  escrita/ator/PII, L.1-L.5 isolamento por papel, F.1-F.8 ACL/append-only, R.1-R.6 rollback+reaplicacao)
- migration aplicada no banco local da tarefa pela ferramenta do modo V2
  (`hermes-db-migrar supabase/migrations/20261013051916_contact_change_log.sql`).

## Efeitos colaterais revisados (recusas anteriores)
- Gatilho e AFTER: nao altera NEW nem o curso da escrita em `contacts`.
- Nao dispara em UPDATE sem mudanca real na lista branca (sai antes de gravar) — evita ruido do
  gatilho de `updated_at`/`ai_projection_updated_at`.
- Backfill nao existe aqui (tabela nova vazia): logo, sem INSERT em massa sob UNIQUE.
- Nenhum GRANT/papel existente mudou; nao toquei `contacts` nem policy de outra tabela.
- Sem oraculo: a trilha nao revela valor algum, so o nome do campo.

## Sobre o alerta do juiz barato (types.ts sem teste no mesmo commit)
- O teste que prova o defeito e `supabase/tests/contact_change_log.sql` (suite .sql, vermelho→verde
  na secao Prova), commitado junto. `src/integrations/supabase/types.ts` NAO e codigo sob teste:
  e o espelho de tipos que o cartao mandou atualizar para nao ficar defasado da tabela nova —
  nao ha como testar um tipo em runtime; a prova de que a forma bate com o banco e a propria suite
  (mesmas colunas.

## O que NAO fiz e por que
- Nao toquei no hook/painel (t_a364a46c, perfil de hooks): fora da minha area. Deixei o contrato
  exato da tabela em comentario no cartao do hook.
- Nao liguei a suite a um passo de workflow (`scripts/db-audit`/db-guard) porque o cartao limita os
  arquivos a supabase/migrations, supabase/tests e types.ts; a suite roda no Postgres descartavel.
- Nao editei nenhuma migration existente; a correcao e aditiva.
