Especialista: senior
Skill de área usada: area-sql-banco (migration/RPC/RLS). Entrega ESTACIONADA: nada de conteúdo novo.

## O que este cartão pediu (entrega estacionada, não é defeito novo)
Trazer a ponta já pronta `c1b63cbf5e` da branch `v2/absent-agents-presence-26101322020396` para a base local
`dia/2026-10-16`, sem desfazer o que a `dia` já tem, provar de novo (harness + `zapp-verify --rapido`) e fechar.

## O que fiz
- `hermes-tarefa-iniciar Zapp_Web_V2 absent-agents-presence-26101322020396` → workspace/branch
  `v2/absent-agents-presence-26101322020396-2610161342570b` a partir de `dia/2026-10-16` (`d723a90107`).
- A entrega estava ESTACIONADA e não integrada: `git merge-base --is-ancestor` provou que **nenhum** dos 3 commits
  (`620a9b33fb`, `32ec274900`, `c1b63cbf5e`) está na `dia` (merge-base = `453e6b69f9`). Então trouxe a cadeia inteira
  por `git cherry-pick` (a ponta sozinha não se aplica sem os pais).
- **Único conflito: `.tmp/relato.md` (modify/delete)** — a `dia` não rastreia mais `.tmp/relato.md` (`.gitignore:124`).
  Resolvi mantendo a decisão da `dia`: arquivo fora do índice (é o meu relato, reescrito neste arquivo local).
  Nenhum arquivo de código/CI/migration conflitou — os 3 arquivos da entrega entraram limpos.
- Não "aproveitei" nada: a diferença contra a base é **só adição** (486 inserções, 0 remoções), 3 arquivos.
- Migration irmã `20261013235905` (`reassign_absent_agents(integer, boolean)`): **conferido, ela NÃO está na `dia`** →
  nada a mesclar; hoje não existe overload ambíguo. Prova: `git merge-base --is-ancestor b64ff0524b dia/2026-10-16`
  → "NAO"; `ls supabase/migrations | grep 20261013235905` → vazio (o arquivo só existe na branch
  `v2/fix-db-reassign-open-conversations-dry-r-2610131359eaf5`). **Nota para o integrador:** se ela entrar depois, a
  ordem por nome faz `235905` rodar antes de `010805` e esta migration criaria o overload `(integer)` ao lado de
  `(integer, boolean)` — a chamada sem argumento ficaria ambígua. Não mexi nela (arquivo de outro cartão).

## Arquivos (`git diff --name-only dia/2026-10-16...HEAD`, colado)
scripts/ci/check-test-inventory.mjs
scripts/db-audit/absent-agents-presence.test.sh
supabase/migrations/20261014010805_absent_agents_use_presence.sql

## Verificação (comandos rodados agora, na base nova)
- `bash scripts/db-audit/absent-agents-presence.test.sh` → **39 PASS / 0 FALHOU**, `TODOS OS BLOCOS PASSARAM`,
  EXIT=0, **2 execuções seguidas** (logs `.tmp/presenca-20261016.log`, `.tmp/harness-2.log`). PostgreSQL 17
  descartável (container efêmero), papéis reais (authenticated admin/sem papel, anon, PUBLIC, service_role) e o
  trigger anti-hijack REAL aplicado dos arquivos do repo (`20260924203300` + `20260929790000`).
  Cobre: RED com o corpo antigo (quem tem heartbeat fresco perde a carteira) e GREEN com a migration real
  (presente mantém; ausente/offline/heartbeat parado realocam para quem tem heartbeat fresco; fila sem candidato
  fresco não move nada), `updated_at` só das linhas movidas, eventos `absence_reassign`, guarda de papel,
  NULL/negativo → 22023, default 2, ACL nos 4 papéis e **Rollback total por comportamento** (default 30 + critério
  antigo = 9 realocados).
- Papéis que o cartão lista e a harness curada não nomeia: rodei uma prova AD-HOC (`.tmp/papeis-reais.prova.sh`, fora
  do diff — `.tmp/` é ignorado) contra o arquivo REAL da migration em PG 17 descartável, log
  `.tmp/papeis-reais-20261016.log`: **supervisor** (`user_roles.role='supervisor'`) EXECUTA e realoca
  (`select reassign_absent_agents(2)` → `1`; ausente fica com 0 contatos, supervisor com 1, 1 evento
  `absence_reassign`); **agente sem papel** → `ERROR: reassign_absent_agents: requer perfil admin ou supervisor`
  (`PL/pgSQL function reassign_absent_agents(integer) line 11 at RAISE`); **anon** → `ERROR: permission denied for
  function reassign_absent_agents` e `has_function_privilege('anon',...,'EXECUTE') = f`. Admin e service_role já
  são cobertos pela harness.
- `zapp-verify . --rapido` → `VERIFY: VERDE (181s)`, papéis: dependencias OK, db_guard OK, tipos OK (176s),
  lint OK, migrations OK. `banco_local: AVISO — NÃO VERIFICADO (sem nome de conjunto)`: o conjunto local da tarefa
  `v2-2610161342570b` não existe (`zapp-db-local list` não o lista) e eu não subo stack nova só para isso; a prova
  de banco deste cartão é o harness acima, que aplica o arquivo REAL da migration em PG 17.
- `git diff --numstat dia/2026-10-16...HEAD` → 8/0, 358/0, 120/0 (nenhuma linha removida da `dia`).
- Nada de produção citado em código, teste, comentário ou neste relato; nenhum `git push`, `db push` ou deploy.

## Juiz barato, 1º fechar: ponto NÃO procede (rodei o MESMO comando de novo sem mudar código)
O juiz pediu para desligar/preservar o gatilho `update_contacts_updated_at` no UPDATE de `contacts`. Não procede
para ESTE cartão: eu não adiciono nem altero UPDATE nenhum — a entrega só troca o critério de ausência
(`user_sessions` → `agent_presence`) e o default; o `UPDATE contacts SET assigned_to = ...` e o gatilho
`BEFORE UPDATE` são anteriores (corpo vigente desde `20260829040000`) e regravar `updated_at` na linha movida é o
comportamento desejado de "conversa mexida agora". A harness mede exatamente isso e passa: `[PASS] gatilho: b3
(nao movido) mantem updated_at original (5)` e `[PASS] gatilho: so as 4 linhas movidas tiveram updated_at
regravado (4)` — as 5 linhas do agente presente ficam com `updated_at = '2020-01-01'`, só as movidas mudam.
Mexer nisso seria comportamento fora do pedido: o cartão é sobre o CRITÉRIO de ausência (heartbeat de
`agent_presence`) e não pede política de timestamp; o gatilho é objeto de outro assunto.

## O que NÃO fiz e por quê
- Não toquei em `src/**` (o cartão proíbe): o hook `useAgentReassignment.ts:48-51` passa `inactive_minutes`
  explícito, então o novo default 2 da função só governa a chamada sem argumento — nenhum comportamento de front muda.
- Não criei migration nova nem editei a harness para "fazer passar": a harness é a do cartão, aplicada como está.
- Não mesclei a migration irmã (não está na `dia`) e não abri PR/push.
