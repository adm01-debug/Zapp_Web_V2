Especialista: worker (sql) (area-sql-banco)

## O que mudou e por quê
- supabase/migrations/20261013230015_talkx_n102_window_fixes.sql (nova, 106 linhas): CREATE OR REPLACE de public.talkx_campaign_window_open passa a converter p_at UMA vez para o fuso da campanha (`v_local_at := p_at AT TIME ZONE v_timezone`) e extrai ISODOW, DOW, HOUR, MINUTE e a data do DND de v_local_at — antes tudo saia de p_at cru (UTC). ISODOW segue normalizado com % 7 para a convencao do array send_weekdays (0=domingo..6=sabado) e o DOW do DND sai da MESMA base convertida, entao ISODOW e DOW nunca sao aplicados sobre fusos diferentes.
- Fonte do fuso (decisao registrada, sem coluna nova): schedule_timezone da propria campanha, com fallback 'America/Sao_Paulo' quando o nome nao for IANA valido, pelo helper que ja existe `public.is_valid_talkx_schedule_timezone(text)` (migration 20260911200000) — evita que linha legada faca a avaliacao da janela estourar erro de fuso.
- Base N-102: supabase/migrations/20261009203548_talkx_campaigns_send_weekdays_dnd.sql entra por cherry-pick (2aa755399b + 5908ddc3b2), byte-identica a da branch de preparacao; nao editei (arquivo de leitura no cartao).
- Nenhum GRANT/REVOKE/papel/policy/DML/trigger no diff; uma unica instrucao (atomica).

## Prova — Postgres descartavel, migrations REAIS, papel authenticated
- comando: `bash .tmp/prova-fuso.sh` -> ultima linha `RESULTADO: OK (nenhuma divergencia)`; EXIT=0
- vermelho antes (só helper de fuso + base, sem a correcao), 5/5:
  c1 SP @ 2026-10-12 02:30Z -> true (SP 11/10 23:30, domingo; send_weekdays={1} deveria fechar a janela)
  c2 SP @ 2026-10-13 09:00Z -> true (SP 06:00, dentro do DND 22:00-08:00)
  c3 America/New_York @ 2026-10-13 11:30Z -> true (NY 07:30, dentro do DND — prova que o fuso usado é o DA campanha)
  c4 fuso legado invalido @ 2026-10-12 02:30Z -> true (cai no default SP)
  controle c1 @ 2026-10-12 12:30Z -> true (SP 09:30 segunda, janela aberta)
- verde depois, 5/5: os quatro primeiros -> false; controle -> true
- rollback executado de verdade: as linhas `--   ` do cabecalho rodam no psql e devolvem o comportamento antigo (5/5 true); reaplicando a correcao volta a false/false/false/false/true.
- bordas iguais antes e depois: p_at NULL -> true; campanha inexistente -> exception `talkx_campaign_not_found` (P0002).
- grep do arquivo novo: `p_at` aparece so como parametro (linha 26) e na conversao (linha 55) — nenhuma extracao de dia/hora usa o instante cru.

## O que NAO fiz e por que
- Nao toquei supabase/functions/talkx-scheduler/**, src/hooks/**, o teste Deno nem a suite versionada — fora do cartao (o .test.sh versionado e do cartao t_5d0f8628).
- Nao corrigi o cast jsonb->smallint[] de save_talkx_campaign_draft/update_talkx_campaign_limits (linhas 106 e 345 da base): e o defeito 1/4, do cartao de cast.
- Nao criei .test.sh novo (o inventario do CI exige registro em .github/workflows/db-guard.yml, que nao e meu): a prova do cartao e o teste manual acima, em Postgres descartavel.
- `hermes-db-migrar` subiu o banco local da tarefa e a aplicacao falhou com `relation "public.talkx_campaigns" does not exist` — o replay do banco local da tarefa nao materializou o schema (falha pre-existente, alheia a este diff); por isso a prova e o Postgres descartavel, que aplica as migrations reais na ordem.

hotspot: supabase/migrations/20261013230015_talkx_n102_window_fixes.sql — os 4 cartoes irmaos do N-102 gravam a MESMA migration nova (versoes 20261013230014/15); a integracao precisa juntar as 4 correcoes num so arquivo, senao a ultima sobrescreve a outra.
