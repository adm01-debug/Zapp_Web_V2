Especialista: worker (sql) (area-sql-banco)

## O que mudou e por quê
- `supabase/migrations/20261013235900_talkx_n102_window_fixes.sql` (novo, 1 arquivo): fatia "rollback" do N-102. O arquivo traz
  (a) o bloco `-- Rollback (SQL executável, na ordem)` corrigido e (b) o corpo do up corrigido. Por quê:
  - Defeito (1) DELIMITADORES: o bloco de rollback da base `20261009203548` restaura as duas RPCs com `as $$` abrindo e
    `$function$;` fechando, então o SQL extraído não executa (a prova abaixo mostra o erro de sintaxe). A base é leitura neste
    cartão, então o bloco CORRIGIDO vive nas linhas `--   ` da migration nova, com `$function$` nas DUAS pontas de cada função.
    São exatamente 6 statements; nenhuma outra linha do arquivo começa com `--   ` (conferido), então a extração do teste que lê
    `--   ` pega só o rollback.
  - Defeito (2) REVERSIBILIDADE: o up da série grava o default de `dnd_hours` com `ON CONFLICT (key) DO UPDATE SET value =
    EXCLUDED.value, description = EXCLUDED.description`, que sobrescreve o value/description de QUALQUER linha com a mesma key
    — inclusive a de outro dono — e o rollback ficava sem o que restaurar. O corpo da migration nova usa o mesmo upsert COM a
    guarda `WHERE public.talkx_settings.value = EXCLUDED.value`: só reafirma a linha cujo value já é o default da série; linha
    de outro dono não é tocada. O rollback apaga a linha só se ela ainda for esse default (`... AND value = '<default>' AND
    description = '<default>'`), então o valor alheio sobrevive ao up E ao down.
- Efeitos colaterais da migration: um único INSERT ... ON CONFLICT sobre uma linha; não muda coluna, DEFAULT, função, GRANT,
  ACL, policy nem papel; a linha alheia não dispara gatilho de `updated_at` porque o UPDATE nem chega a rodar nela.

## Prova
Postgres descartável (`postgres:17-alpine`, porta publicada, psql do host — sem tocar banco real), script `.tmp/prova/prova.sh`,
fixture `.tmp/prova/fixture.sql`, saída literal em `.tmp/prova/saida-final.txt`.
- vermelho antes, defeito (2): upsert da base sobre um `dnd_hours` de outro dono →
  `{"end": "08:00", "start": "22:00", ...} ||| Janela "não perturbe"...` + `SOBRESCRITO`
- vermelho antes, defeito (1): bloco de rollback da base (linhas `--   ` de `.tmp/base.sql`) →
  `exit do psql ao executar o rollback da base: 3` / `psql:...rollback_base.sql:6: ERROR:  syntax error at or near "declare"`
- verde, up corrigido (arquivo real aplicado com `psql -f`): valor depois do up =
  `{"end": "07:00", "start": "21:00", "sundays": false, "holidays": ["2026-12-25"]} ||| janela definida por outro dono (nao mexer)`
  → `[PASS] up preservou o valor de outro dono: INTACTO`
- verde, rollback do próprio arquivo (6 statements extraídos das linhas `--   `, executados com `ON_ERROR_STOP=1`):
  `exit do psql ao executar o rollback: 0` (sem erro de sintaxe) e
  `[PASS] down: dnd_hours alheio INTACTO; colunas=0; window_open=0; RPCs anteriores=2`
  (volta ao estado anterior: as 2 colunas do N-102 somem, `talkx_campaign_window_open` some, as 2 RPCs anteriores voltam, o
  `dnd_hours` de outro dono fica intacto)
- idempotência: reaplicar a migration → `[PASS] reaplicacao preservou o valor alheio: INTACTO`
- linha final: `TODOS OS BLOCOS PASSARAM: defeito reproduzido (a), correcao no up (b), rollback executavel e reversivel (c)`

## O que NÃO fiz e por quê
- Não editei `20261009203548_..._send_weekdays_dnd.sql` (nem qualquer migration existente) — o cartão proíbe; a correção foi
  para a migration nova. Fica registrado em comentário no cartão que o upsert sem guarda e o cabeçalho com delimitador trocado
  ainda existem naquele arquivo da base preparada (fora do meu escopo); o up da minha migration roda DEPOIS dele no ledger.
- Não criei `.test.sh` versionado: o cartão cita só a migration, e o teste versionado da série é do cartão-irmão de testes.
- Não mexi em função, coluna, GRANT nem no default de `dnd_hours`.
