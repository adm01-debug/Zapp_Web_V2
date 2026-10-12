Especialista: senior (area-sql-banco)

Ponto 1 — a flag inbox.status-fsm nascia ligada por padrao.
- Mudei supabase/migrations/20261011174630_contacts_waiting_por_atribuicao.sql para criar a flag com enabled=false quando ela ainda nao existe, preservando o valor vigente com ON CONFLICT DO NOTHING.
- Prova vermelha: com a migration anterior, `zapp-db-local psql . cwait760 -v ON_ERROR_STOP=1 < supabase/tests/contacts_waiting_por_atribuicao.sql` falhou com `C0 FALHOU: flag nova deveria nascer desligada, veio t` (red_rc=3).
- Prova verde: com a migration atual, o mesmo teste passou e imprimiu `contacts_waiting_por_atribuicao: suite OK (C0 flag nasce off, C1 flag off, C2 tira responsavel, C3 atribui, C4 terminal) -- 5 grupo(s) verificado(s)`.

Ponto 2 — o rollback apagava a linha da feature flag.
- Mudei o rollback documentado em supabase/migrations/20261011174630_contacts_waiting_por_atribuicao.sql: ele nao executa DELETE em public.feature_flags; derruba so o gatilho/funcao novos, restaura os contatos capturados pelo backfill e remove a tabela auxiliar de rollback.
- Prova verde: `zapp-db-local psql . cwait760 -v ON_ERROR_STOP=1 < .tmp/prova_rollback_contacts_waiting.sql` passou e imprimiu `rollback contacts_waiting_por_atribuicao OK (dados restaurados, flag preservada, tabela auxiliar removida)`.

Ponto 3 — comentario e teste ainda diziam que o padrao era ligado.
- Atualizei os comentarios da migration e o teste supabase/tests/contacts_waiting_por_atribuicao.sql para refletirem que a flag nova nasce desligada.
- Prova verde: o teste SQL agora valida explicitamente C0 antes dos cenarios de gatilho e so passa quando `enabled=false`.

Ponto 4 — o teste C5 nao provava que a segunda execucao da migration acontecia de fato.
- Ajustei supabase/tests/contacts_waiting_por_atribuicao.sql para executar a migration real por `\i /tmp/20261011174630_contacts_waiting_por_atribuicao.sql` nos cenarios C5 e incluir um carimbo sentinela em `conversation_status_changed_at`; se a segunda execucao mexer de novo no contato, o teste falha.
- Prova vermelha do C5: rodei o mesmo teste contra um mutante temporario da migration que permitia atualizar tambem contatos ja `waiting`; falhou com `C5 FALHOU: segunda execucao da migration real alterou o estado (waiting / ... vs sentinela 2026-02-02 00:00:00+00)` (red_c5_rc=3).
- Prova verde: o teste imprimiu `contacts_waiting_por_atribuicao: C5 flag desligada OK (migration real nao mexeu no backfill)`, `contacts_waiting_por_atribuicao: C5 flag ligada OK (migration real aplicou o backfill)` e `contacts_waiting_por_atribuicao: C5 idempotencia OK (migration real preservou o carimbo sentinela)`.

Efeito em producao:
- Chave ausente: a migration cria `inbox.status-fsm` com `enabled=false`; gatilho e backfill ficam sem efeito operacional ate o Joaquim ligar a flag.
- Chave ja existente desligada: `ON CONFLICT DO NOTHING` preserva `enabled=false`; gatilho retorna `NEW` sem mudar status e o backfill nao captura nem atualiza contatos.
- Chave ja existente ligada: `ON CONFLICT DO NOTHING` preserva `enabled=true`; o gatilho sincroniza open<->waiting em mudanca de atribuicao e o backfill muda uma vez os contatos `open` sem responsavel com mensagem para `waiting`.
- A tabela `public._rb_contacts_waiting_por_atribuicao` existe so para rollback dos dados do backfill; por isso adicionei `REVOKE ALL` para PUBLIC/anon/authenticated. Prova: `has_table_privilege('anon', ..., 'select')` e `has_table_privilege('authenticated', ..., 'select')` retornaram `f`/`f`.

Arquivos alterados (git diff --name-only dia/2026-10-12...HEAD):
- .tmp/relato.md
- supabase/migrations/20261011174630_contacts_waiting_por_atribuicao.sql
- supabase/tests/contacts_waiting_por_atribuicao.sql

Verificacoes executadas:
- `git show --stat --oneline v2/refazer-contacts-waiting-atribuicao-t-41-2610112138f5a2`: confirmei que o trabalho anterior deste cartao tinha apenas a migration, o teste SQL e .tmp/relato.md; trouxe a migration e o teste, e gerei este relato atualizado.
- Contagem do diff final: 3 arquivos alterados no total; 1 deles e arquivo de teste (`supabase/tests/contacts_waiting_por_atribuicao.sql`).
- `zapp-db-local psql . cwait760 -v ON_ERROR_STOP=1 < supabase/tests/contacts_waiting_por_atribuicao.sql`: verde, suite OK e C5 desligada/ligada/idempotencia OK.
- `zapp-db-local psql . cwait760 -v ON_ERROR_STOP=1 < .tmp/prova_rollback_contacts_waiting.sql`: verde, rollback restaurou dados, preservou a flag e removeu a tabela auxiliar.
- `git diff --stat dia/2026-10-12...HEAD`: 3 arquivos (1 relato, 1 migration, 1 teste), escopo limitado ao pedido original e aos pontos da recusa.
