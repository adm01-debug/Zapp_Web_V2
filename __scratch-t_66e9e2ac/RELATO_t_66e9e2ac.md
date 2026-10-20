Especialista: semisenior (area-sql-banco)
# [refazer 1] snapshot-copiloto-sem-resposta — pontos da recusa resolvidos

## O que mudou e por quê
- supabase/migrations/20261015090000_supervisor_copilot_snapshot.sql (NOVO, substitui o 20261013230013 do PG-01 que nunca integrou): RPC + ramo UNION ALL 'Sem fila' (queueId NULL) com as 4 métricas, incluindo slaBreachedToday por `queue_id is null`; cabeçalho -- Rollback: com DROP ... CASCADE executável.
- supabase/tests/supervisor_copilot_snapshot.sql (NOVO): T1–T8 idênticos ao PG-01 + T9 (deltas antes/depois, à prova de seed do retrato).
- src/integrations/supabase/types.ts (+1 linha: `supervisor_copilot_snapshot: { Args: never; Returns: Json }`).

FAIXA DO PAI: nenhum commit trazido (sem cherry-pick; PG-01 lido via git show). O arquivo 20261013230013 do PG-01 NÃO faz parte da entrega.

## Pontos do revisor
- Ponto 1 (contato sem fila invisível): resolvido — ramo 'Sem fila' no queue_rows; mesma CTE open_contacts/latest_sla e mesmos filtros. Prova: T9.
- Ponto 2 (nome/versão novos, sem tocar 20261013230013): resolvido — migration nova 20261015090000 (livre na base dia/2026-10-14; `ls-tree` mostra 0 arquivos 20261015*); arquivo do PG-01 ausente da entrega.
- Ponto 3 (rollback executável com CASCADE + teste fecha lacuna): resolvido — `-- Rollback:` = `drop function if exists public.supervisor_copilot_snapshot() cascade;` (+ nota de restauração). Prova abaixo.

## Prova (banco local descartável scs-t66e9e2ac, `zapp-db-local up`: 793 ok de 816, seed ok; 21 falhas pré-existentes em migrations antigas, 0 com "copilot" no falhas.tsv)
- Vermelho (função ANTIGA do PG-01 instalada): T1–T8 OK + `ERROR: T9 FALHOU: linha Sem fila ausente: [...]` — o teste falha sem a correção.
- Verde (migration nova): T1 OK … T9 OK — 9 notices OK, zero FALHOU/ERROR:
  `NOTICE: T9 OK: conversa sem fila aparece em Sem fila (queueId NULL) e segue no atendente`
- Rollback: `DROP FUNCTION` → `select count(*) from pg_proc` = 0 e EXECUTE inexistente; reaplicação → authenticated=t, anon=f.
- Passada de efeito colateral: função somente SELECT (0 ocorrências de INSERT/UPDATE/DELETE/TRUNCATE na migration); leitura não dispara gatilho; únicos objetos novos no `check-diferencas.txt` são a função + 3 grants; chamadores: só types.ts/teste/migration; patch types.ts aplica na base (`Hunk #1 succeeded at 12102`).

## Entrega (CONGELADO sem MODO_V2: iniciar/fechar bloqueados; entrega em patches, sem commit)
- 001-migration.patch (9878 bytes), 002-test.patch (17620 bytes), 003-types.patch (355 bytes); total 27853 caracteres (< 90k).
- Como aplicar na base dia/2026-10-14: os 2 arquivos novos vão para os mesmos caminhos; `patch -p1 < 003-types.patch`.
- NÃO CONCLUÍDO via branch: falta o integrador aplicar os patches e rodar o teste no conjunto da tarefa.
