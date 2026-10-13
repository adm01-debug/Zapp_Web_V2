Especialista: worker (sql) (area-sql-banco)

[refazer 1] — os 4 pontos do revisor, um por um:
1. Convencao unica de dia da semana: FEITO. `v_weekday := EXTRACT(ISODOW FROM v_local_at)::integer % 7` agora e calculado UMA vez (linha 59), logo depois de v_local_at (55) e ANTES do IF de send_weekdays (63); o teste de domingo do DND saiu de `EXTRACT(DOW FROM v_local_at) = 0` para `v_weekday = 0` (linha 84). `EXTRACT(DOW)` nao aparece mais na funcao (o unico texto que cita "EXTRACT(DOW)" e o comentario de cabecalho, dizendo que ele nao e usado) e o cabecalho foi reescrito para descrever a convencao unica (ISODOW % 7 -> 0=domingo..6=sabado).
2. Base fora do diff: FEITO. `git rm supabase/migrations/20261009203548_talkx_campaigns_send_weekdays_dnd.sql`. Dependencia declarada: a base N-102 vem da preparacao t_37e0dde7 (branch v2/preparar-workspace-cherry-pick-recusados-2610130717ff40 @ aa71b6e73), ja fechada e na fila do integrador; no meu Postgres descartavel ela entra por `git show aa71b6e73:supabase/migrations/20261009203548_...` so para o ambiente ficar igual ao repositorio integrado, sem versionar nada aqui. Diff do cartao agora (git diff 96dd72dc5f...HEAD | wc -c): 14.493 bytes — 106 linhas adicionadas em supabase/migrations/20261013230015_talkx_n102_window_fixes.sql e o .tmp/relato.md (que ja e versionado no branch do dia). Os tamanhos que eu citei antes (23k/47k) estavam errados.
3. Relato corrigido: no diff NAO ha GRANT/REVOKE/papel/policy/DML/trigger nem nenhum outro arquivo — a base que trazia REVOKE/GRANT, ALTER TABLE e INSERT ... ON CONFLICT saiu do branch. A unica instrucao da migration nova e um CREATE OR REPLACE FUNCTION (nao re-concede nada: o ACL da funcao vem da base).
4. Saida literal dos testes manuais: abaixo, com o SELECT executado e o valor retornado.

## O que mudou e por que
supabase/migrations/20261013230015_talkx_n102_window_fixes.sql: talkx_campaign_window_open passa a avaliar a janela no fuso DA CAMPANHA. Trecho final:
  v_timezone := COALESCE(NULLIF(v_campaign.schedule_timezone, ''), 'America/Sao_Paulo');
  IF public.is_valid_talkx_schedule_timezone(v_timezone) IS NOT TRUE THEN
    v_timezone := 'America/Sao_Paulo';
  END IF;
  v_local_at := p_at AT TIME ZONE v_timezone;
  v_weekday := EXTRACT(ISODOW FROM v_local_at)::integer % 7;
  ...
  IF v_weekday = 0 AND (v_dnd_hours ->> 'sundays')::boolean = false THEN
Decisao registrada: a fonte do fuso e a coluna schedule_timezone (ja existe, NOT NULL, validada por CHECK na 20260911200000); quando o nome nao passa em is_valid_talkx_schedule_timezone (linha legada anterior a validacao) cai em 'America/Sao_Paulo' em vez de estourar erro de fuso no envio.

## Prova — Postgres descartavel, migrations REAIS, papel authenticated
comando: bash .tmp/prova-fuso.sh -> RESULTADO: OK (nenhuma divergencia), exit 0.
Saida literal do psql, antes e depois, nos dois instantes pedidos:

ANTES (so a base N-102, sem a correcao):
$ psql -c "set role authenticated; select public.talkx_campaign_window_open('11111111-1111-1111-1111-111111111111'::uuid, timestamptz '2026-10-12 02:30:00+00') as janela_aberta;"
 janela_aberta
---------------
 t
(1 row)
$ psql -c "... '22222222-2222-2222-2222-222222222222'::uuid, timestamptz '2026-10-13 09:00:00+00' ..."
 janela_aberta
---------------
 t
(1 row)

DEPOIS (com a correcao):
 janela_aberta
---------------
 f
(1 row)
 janela_aberta
---------------
 f
(1 row)

Casos (5/5 em cada fase):
 1) SP @ 2026-10-12 02:30Z = 11/10 23:30 local, domingo, send_weekdays={1}: true -> false
 2) SP @ 2026-10-13 09:00Z = 06:00 local, dentro do DND 22:00-08:00: true -> false
 3) America/New_York @ 2026-10-13 11:30Z = 07:30 local NY, dentro do DND (prova que o fuso usado e o DA campanha): true -> false
 4) fuso legado invalido ('Mars/Olympus') @ 2026-10-12 02:30Z: cai no default SP -> false (antes: true)
 5) controle SP @ 2026-10-12 12:30Z = 09:30 local, segunda, janela aberta: true -> true
Rollback executado de verdade: as linhas `--   ` do cabecalho rodam no psql e devolvem o comportamento antigo (5/5 true); reaplicando a correcao, 5/5 na forma corrigida.
Bordas iguais antes e depois: p_at NULL -> true; campanha inexistente -> exception talkx_campaign_not_found (P0002).

## O que NAO fiz e por que
- Nao toquei supabase/functions/talkx-scheduler/**, src/hooks/**, o teste Deno nem a suite .test.sh versionada do N-102 (esta e do cartao de teste t_5d0f8628, com registro no db-guard.yml): a prova deste cartao e o teste manual em Postgres descartavel exigido pelo criterio.
- Aviso do juiz "sem teste no diff": ver o item acima — o teste versionado e de outro cartao; o vermelho/verde esta na prova manual.
- Nao corrigi o cast jsonb->smallint[] de save_talkx_campaign_draft/update_talkx_campaign_limits: e o defeito 1/4 (cartao de cast).
- Verificacao: o fechar roda zapp-verify; uma rodada morreu por OOM do ambiente (`Killed ... tsc saiu 137`, ~1 GB livre de 47 GB) e `jev-juiz falha` classificou como `environment` (0.78); a rodada que fechou deu OK dependencias/db_guard/lint/migrations.
