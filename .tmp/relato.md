Especialista: senior (area-sql-banco)

Refazer 1 da entrega 5fd37bd32 (+ devolucao do limpador sobre fca670148). O que cada ponto da recusa ganhou:

Ponto 1 (uma so convencao de dia da semana): a funcao calcula `v_weekday := EXTRACT(ISODOW FROM v_local_at)::integer % 7` uma vez e reusa no DND; `EXTRACT(DOW` nao aparece em codigo vivo (somentions: linha 4, o Rollback executavel que restaura o SQL antigo, e linha 22, comentario que diz que ele nao e mais usado). Prova: secao N-102 na suite abaixo, fase base x fix.

Ponto 2 (NULL nao vira 0 por cast + teste no diff): dnd_hours regravado SEM 'holidays'/'sundays' (pre-condicao assertada: `?` = false/false); dom 12:00 SP abre e dom 23:30 SP fecha sem erro — NULL nao vira 0 nem false por cast. Teste versionado em `scripts/db-audit/talkx-campaign-window-open.test.sh` (secao N-102 fuso, container proprio, migrations REAIS fuso+base+correcao; N102_BASE_MIGRATION/N102_FIX_MIGRATION como override). Mutacao: com a funcao antiga no lugar da correcao a secao falha no 1o caso fix (`esperado 'false', obtido 'true'`); com a correcao, 23 PASS.

Ponto 3 (`p_at` sem deriva): `v_local_at` atribuido uma vez (linha 55); dia/hora/data saem dele (linhas 59, 75-76, 90-92). ACL intocada. p_at NULL -> true e campanha inexistente -> P0002 iguais antes/depois (assertados nas duas fases).

Ponto 4 (relato com psql literal): saidas literais abaixo; trecho final da funcao = migration 20261013230015 linhas 53-109.

Ponto 5 (devolucao do limpador: espelho do CI): `zapp-verify full` reproduziu GUARD_EXIT=1 — a migration cria `talkx_campaign_window_open`, o chamador talkx-scheduler resolve, e a chave temporaria do baseline (NOTA 2026-10-11) ficou obsoleta. Correcao: chave removida de `known-violations.json` + entrada em `_resolvido` (o que o proprio guard e o comentario do arquivo mandam fazer; nenhuma assercao afrouxada). Depois: GUARD_EXIT=0.

Arquivos (net `dia/2026-10-14...HEAD`): supabase/migrations/20261013230015_talkx_n102_window_fixes.sql (110, inalterado neste refazer), scripts/db-audit/talkx-campaign-window-open.test.sh (+135), scripts/db-audit/known-violations.json (-1 chave, +1 _resolvido), .tmp/relato.md. Base N-102 segue fora (cartao da preparacao). Chamadores: so talkx-scheduler, assinatura UUID/TSTZ->boolean inalterada.

Verificacao:
- `node scripts/db-audit/supabase-usage-guard.mjs` -> antes: `Entradas obsoletas... rpc:talkx_campaign_window_open:...` (exit 1); depois: `Violacoes totais: 1 | no baseline: 1 | novas: 0 / OK: nenhuma violacao nova.` (exit 0)
- secao N-102 (container descartavel, base aa71b6e73 via N102_BASE_MIGRATION): GREEN 23 PASS; RED com funcao antiga: `FAIL: (N-102 fuso) fix: SP 11/10 23:30 dom fora de {segunda} (false): esperado 'false', obtido 'true'`
- `zapp-verify full .`: db_guard OK, tipos OK, lint OK, migrations OK; testes: 1314/1315 arquivos, 1 falha em `src/components/inbox/__tests__/RealtimeInboxView.selectedMessagesError.test.tsx` (Serialized Error ERR_INVALID_ARG_TYPE de worker, 3/3 testes do arquivo PASS). Juiz: `pre_existing (certeza 0.94)`. Confirmado na base (meu diff em stash): mesmo 3/3 PASS + mesmo erro de worker. Fora do escopo, nao consertado.
- `bash -n` da suite: OK; sem container orfao (`docker ps` limpo pelo trap)

Saida literal da prova (tail):
PASS: (N-102 fuso) fix: domingo 12:00 SP fora do DND abre, sundays NULL nao fecha (true)
PASS: (N-102 fuso) fix: domingo 23:30 SP dentro do DND fecha, holidays NULL nao abre (false)
PASS: (N-102 fuso) fix: p_at NULL abre (true)
PASS: (N-102 fuso) fix: campanha inexistente -> P0002
PASS: (N-102 fuso) rollback: volta ao antigo, SP domingo lida como segunda (true)
PASS: (N-102 fuso) reaplicada: SP domingo fora de {segunda} (false)
PASS: N-102 fuso da campanha na janela — criterio, NULL sem cast, bordas e rollback
