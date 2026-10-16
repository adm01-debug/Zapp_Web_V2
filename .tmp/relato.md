Especialista: workersql
## O que mudou e por quê
- Nenhum arquivo de código foi alterado neste refazer. A migration supabase/migrations/20261013012531_custom_emoji_use_rpc.sql e o teste supabase/tests/custom_emoji_use_rpc_increment.sql foram trazidos intactos do commit 9e0ee270d (git diff 9e0ee270d -- migration teste vazio, exit 0). Só o relato foi reescrito para cumprir o formato exigido.

## Prova
- a verificação supabase/tests/custom_emoji_use_rpc_increment.sql ... PASS, PB-35 OK, exit 0, rodada agora em PostgreSQL 17 descartável (docker postgres:17-alpine), como papel real authenticated.
- verde depois (com a migration aplicada): exit 0, saída real:
NOTICE:  PASS [T1 RPC devolve 1 no primeiro uso do emoji alheio (dono e outro)] -> 1
NOTICE:  PASS [T2 segunda chamada devolve 2 (acumula)] -> 2
NOTICE:  PASS [T10 anon NAO executa o RPC (42501)] -> ERRO 42501
PB-35 OK: o atendente comum sobe o use_count de emoji alheio pelo RPC;
exit 0
- vermelha antes (sem a correção, -v sem_correcao=1, migration nova não aplicada): exit 3, saída real:
ERROR:  PB-35 FALHOU [T1 RPC devolve 1 no primeiro uso do emoji alheio (dono e outro)]: esperado 1, obtido ERRO 42883
exit 3

## Pontos do revisor
- Ponto 1: resolvido — primeira linha agora é exatamente Especialista: workersql, sem parênteses nem skill (conferir com head -1 .tmp/relato.md).
- Ponto 2: resolvido — incluída acima a linha literal da verificação supabase/tests/custom_emoji_use_rpc_increment.sql ... PASS, PB-35 OK, exit 0, com a saída REAL colada do terminal (trechos PASS + PB-35 OK + exit 0 no verde; PB-35 FALHOU + ERRO 42883 + exit 3 no vermelho), ambos rodados agora neste workspace.
- Ponto 3: resolvido — migration e teste não tocados; git diff 9e0ee270d -- supabase/migrations/20261013012531_custom_emoji_use_rpc.sql supabase/tests/custom_emoji_use_rpc_increment.sql vazio (exit 0), bytes idênticos aos recusados.

## O que NÃO fiz e por quê
- Não alterei a RPC, a ACL nem o teste: o ponto 3 da recusa proíbe tocar nesses arquivos.
