Especialista: senior (area-sql-banco)

## Pontos da recusa

Ponto 1: remover a criação do gatilho `tag_added` e toda lógica que dependia de `contacts.tags` até a trilha de tags decidir o schema oficial.
- O que mudei: parti do commit aprovado `40856fc119c6` e mantive só o runtime SQL de mensagem/keyword. Em `supabase/migrations/20261011190932_automation_runtime.sql` removi `enqueue_automation_events_on_tags`, `trg_automation_events_on_tags`, a constraint que aceitava `tag_added` na fila e todos os comentários/contratos que dependiam de `contacts.tags`. O rollback agora remove só o gatilho de mensagem, a função de mensagem, o índice adicionado e as duas tabelas novas.
- Permissões/RLS: mantive as policies, REVOKE/GRANT e RLS da entrega aprovada porque fazem parte da fila/log novos do runtime de automações; sem isso as tabelas novas ficariam com leitura/escrita indevidas. A prova é o T8, que roda no Postgres real com papéis `authenticated`, `anon`, `service_role`, `app.admin` e `app.agent`: staff lê, agente/anon não leem e a escrita fica só para `service_role`/gatilho.
- Teste que prova: em `supabase/tests/automation_runtime_events.sql`, a fixture de `public.contacts` não tem coluna `tags`; o T5 confere que não existe função/gatilho de tags e que `trigger_type = 'tag_added'` é rejeitado pela constraint da fila.
- Vermelho antes: `docker exec ... psql -v mig=/repo/.tmp/approved_with_tags.sql < supabase/tests/automation_runtime_events.sql` -> `RED approved exit=3` e `psql:/repo/.tmp/approved_with_tags.sql:276: ERROR:  column "tags" of relation "contacts" does not exist`.
- Verde depois: `docker exec ... psql -v mig=/repo/supabase/migrations/20261011190932_automation_runtime.sql -v rollback=/repo/.tmp/rollback.sql < supabase/tests/automation_runtime_events.sql` -> `GREEN rollbackfix exit=0`, com `T5 OK: tag_added não tem função/gatilho e não entra na fila`, `C1 OK: rollback removeu tabelas, funções e gatilhos` e `C2 OK: reaplicar a migration recriou só o gatilho de mensagem`.

## Arquivos alterados

Saída de `git diff --name-only dia/2026-10-13...HEAD`:

.tmp/relato.md
supabase/migrations/20261011190932_automation_runtime.sql
supabase/tests/automation_runtime_events.sql

## Verificação executada

- `git diff --check` -> exit 0.
- `git diff --stat dia/2026-10-13...HEAD` -> 3 arquivos no diff, sendo 1 arquivo de teste SQL: `.tmp/relato.md`, a migration e `supabase/tests/automation_runtime_events.sql`.
- `python3` sobre o diff -> confirmou ausência do id de produção proibido e `len(diff) < 90000`.
- Prova vermelho/verde SQL em Postgres 17 descartável via Docker:
  - vermelho com a migration aprovada anterior: `RED approved exit=3` por dependência de `contacts.tags`.
  - verde com a migration final: `GREEN rollbackfix exit=0`; notices T1..T9 e C1/C2 passaram.

## O que NÃO fiz

- Não criei gatilho de tag nem adaptação para schema de tags; isso fica fora deste cartão por decisão explícita da recusa.
- Não alterei types gerados, Edge Functions, front ou CI; o código de produto ficou restrito à migration e ao teste SQL do runtime de automações. O terceiro arquivo do diff é este relato commitado (`.tmp/relato.md`), por isso a contagem correta é 3 arquivos no diff e 1 arquivo de teste.
- Não fiz merge/rebase manual da branch `dia/2026-10-11`: o workspace foi criado por `hermes-tarefa-iniciar` em cima de `dia/2026-10-13`, e eu trouxe do commit aprovado `40856fc119c6` somente os arquivos SQL deste cartão, depois removi a trilha de tags. Não houve conflito a resolver.
- Entrega integrável na ponta atual: a branch tem um único commit em cima de `dia/2026-10-13`; o diff de código é só a migration nova e o teste SQL. O comportamento aprovado de mensagem/keyword foi mantido e provado pelos T1..T4/T6..T9; a mudança do refazer é só retirar tags, provada pelo T5.
- Rodei `zapp-verify . --rapido`; ele não chegou a validar o diff porque o typecheck foi morto pelo sistema com exit 137 (`tc-rapido: tsc saiu 137 em app`). A prova específica deste cartão é o teste SQL vermelho/verde acima, executado em Postgres real e com rollback reaplicado.
