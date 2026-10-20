Especialista: senior (area-testes-do-produto)

Refazer 1 do TL-050 (entrega anterior fe56b6259 recusada em 4 pontos). Patch com
exatamente 3 arquivos; `.tmp/relato.md` fora do patch (vai so no handoff).

Ponto 1 — runs atuais do db-guard e db-live-guard na nota F93.
Mudei: docs/multiplix/PLANO_FINALIZACAO_MULTIPLIX_100_ETAPAS_2026-09-29.md (item
(e) ao fim da nota F93, 13/10 = ponta dia/2026-10-13 + TL-050, copia local).
Comandos e resultados registrados (15/10, exit 0 nos 4):
`node scripts/db-audit/supabase-usage-guard.mjs` -> "Violacoes totais: 2 |
no baseline: 2 | novas: 0"; `node scripts/db-audit/check-realtime-subscriptions.mjs`
-> "26 subscribed tables are present in the canonical baseline";
`node --test scripts/db-audit/check-catalog-fresh.test.mjs` -> 21 pass / 0 fail;
`node scripts/db-audit/check-migration-drift.mjs` -> 831 arquivos validos
(comparacao com ledger pulada sem DESTINO_URL). db-live-guard (etapa do
catalogo, offline): `psql -X -v ON_ERROR_STOP=1 -At -f
scripts/db-audit/catalog.sql` no banco local PostgreSQL 17 -> exit 0; diff das
secoes do TL-050 entre geracao fresca e commitado = vazio. Etapa viva completa
nao rodada (exige DESTINO_URL de producao; proibido neste modo).

Ponto 2 — catalogo gerado pelo script, colunas em ordem da tabela (id primeiro).
Mudei: supabase/schema-catalog.json (2 blocos reordenados para a ordem
attnum saída do catalog.sql: gmail_oauth_states id,user_id,state,created_at,
expires_at,consumed_at; talkx_storage_purge_queue
id,bucket_id,object_name,object_id,reason,enqueued_at,attempts,last_error,
processed_at). user_sessions.auth_session_id e audit_logs.dedupe_key já estavam
por último no banco e no arquivo: conferidos, intocados.
Teste que prova: 'colunas das tabelas novas seguem a ordem do banco (attnum),
nao alfabetica' em scripts/db-audit/check-catalog-fresh.test.mjs.
VERMELHO antes (6 x 9 linhas em ordem alfabetica; 20 pass / 1 fail) e VERDE
depois (21 pass / 0 fail). Idempotencia: fatia corrigida == geracao fresca
byte a byte (True); 2a geracao == 1a (menos generated_at, True).
Feito diferente da receita (e por que): regenerar o ARQUIVO INTEIRO no banco
local importaria objetos de migrations posteriores (ex.: ai_usage_outbox) e ate
sem migration na arvore (contact_block_audit) — ~100 linhas de outros cartoes,
que dariam "diff maior que o titulo". Apliquei da geracao so os hunks do
escopo; arquivo final tem as mesmas 2895 linhas, mesmos conjuntos.

Ponto 3 — renomear o segundo teste; tirar "Cobre os dois sentidos".
Mudei: scripts/db-audit/check-catalog-fresh.test.mjs: teste renomeado para
'catalogo nao tem tabela que o retrato canonico nao cita' (o nome antigo dizia
o inverso do que o assert verifica); frase removida e trocada por ponteiro ao
proximo teste. Prova: suite 21/21 verde com o nome novo; grep confirma que a
frase nao existe mais no arquivo.

Ponto 4 — .tmp/relato.md e lista de arquivos.
Nao ha .tmp/relato.md no patch (0 ocorrencias): relato vai so neste handoff.
Arquivos tocados (== patch, 13.250 chars, aplica limpo nos 3):
docs/multiplix/PLANO_FINALIZACAO_MULTIPLIX_100_ETAPAS_2026-09-29.md
supabase/schema-catalog.json
scripts/db-audit/check-catalog-fresh.test.mjs

Verificacao final (copia na ponta dia/2026-10-13 + TL-050):
node --test scripts/db-audit/check-catalog-fresh.test.mjs -> tests 21, pass 21, fail 0
node scripts/db-audit/supabase-usage-guard.mjs -> novas: 0 (exit 0)
node scripts/db-audit/check-realtime-subscriptions.mjs -> 26 tabelas (exit 0)
Nao afirmado: runs do CI remoto e etapa viva com DESTINO_URL (proibidos aqui).
