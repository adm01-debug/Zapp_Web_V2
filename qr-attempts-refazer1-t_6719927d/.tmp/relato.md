Especialista: senior (area-sql-banco)
## O que mudou e por quê
- supabase/tests/qr_attempts.sql:197-204: duas asserções novas de TTL relativo com criado_em obsoleto (T4f aceita 60 s depois de created_at de 1 h atrás; T4g recusa 61 min depois, o exemplo exato da recusa) — o TC anterior só ancorava em now(), não cobria os dois lados do relativo.
- supabase/migrations/20261012110945_qr_attempts.sql: nenhuma linha mudada (byte a byte igual ao trabalho anterior; diff confirma).

## Prova (Postgres 17 descartável, docker postgres:17-bookworm, psql -X -v ON_ERROR_STOP=1)
- verde depois: TC novo + DDL do trabalho anterior → exit=0, 32 NOTICE PASS, `PASS: TC qr_attempts — contrato do cartao, FK CASCADE, dominio de status, clamp de TTL, ... e rollback executavel.` (log .tmp/verde-tc-novo.log)
- vermelho antes (DDL absoluta `expires_at >= now() - interval '300 seconds' AND expires_at <= now()`): TC → exit=3, `t_7af815d8 FALHOU [T4d sem expires_at explicito o TTL default e de 60 s]: esperado OK 1, obtido ERRO 23514 ... violates check constraint "qr_attempts_ttl_check"` (log .tmp/vermelho-ddl-buggy.log)
- vermelho isolado do T4f (sonda .tmp/sonda-t4f.sql, só tabela+CHECK absoluto): exit=3, `ERROR: new row for relation "probe_qr" violates check constraint "probe_ttl"`; mesma sonda com CHECK relativo → exit=0, `INSERT 0 1` (logs .tmp/vermelho-t4f-isolado.log e .tmp/verde-t4f-isolado.log)
- modo vermelho do TC (-v sem_guarda=1) intacto: exit=3, `t_7af815d8 FALHOU [T6 usuario comum NAO insere (RLS)]: esperava erro SQLSTATE 42501, veio: OK 1` (log .tmp/vermelho-sem-guarda.log)

## Pontos do revisor
- Ponto 1: não procede como descrito porque a DDL citada já aplica a correção — `git show 09da0ae9d6:supabase/migrations/20261012110945_qr_attempts.sql` contém `expires_at >= created_at + interval '15 seconds' AND expires_at <= created_at + interval '300 seconds'`, sem `ok_before` em nenhum ponto do arquivo; a prova verde acima (32 PASS contra essa DDL, incluindo T4d de default 60 s e T4b/T4c de clamp) confirma o comportamento relativo executando o SQL real. Não reescrevi a migration para não gerar churn sem efeito.
- Ponto 2: resolvido e provado — o TC (com T4b/T4c) falha contra DDL absoluta (exit=3, T4d 23514 no log .tmp/vermelho-ddl-buggy.log) e passa contra a DDL relativa (exit=0, 32 PASS no log .tmp/verde-tc-novo.log); a DDL `+ 15`/`+ 300` literalmente sem `interval` sequer cria a tabela (`ERROR: operator does not exist: timestamp with time zone - integer` no log .tmp/vermelho-ddl-buggy.log da primeira variante).
- Ponto 3: resolvido em supabase/tests/qr_attempts.sql:197-204 — T4f (obsoleto+60 s aceito, OK 1) e T4g (obsoleto+61 min recusado, 23514); T4f falha sem a correção (sonda isolada exit=3 contra CHECK absoluto, exit=0 com `INSERT 0 1` contra CHECK relativo).

## O que NÃO fiz e por quê
- Não alterei a migration, o types.ts nem nenhum outro arquivo: a DDL do trabalho anterior já estava correta (prova verde executando o SQL real) e o TC estendido cobre o que faltava. Diff desta entrega: só supabase/tests/qr_attempts.sql (+8 linhas) e este relato.
- Não apliquei migration em banco local de tarefa nem rodei hermes-tarefa-fechar: ambos estão congelados para agentes nesta sessão (guarda CONGELADO sem MODO_V2; git clone/branch também bloqueados). Entrega em arquivos no workspace abaixo + anexos, para o integrador aplicar o TC sobre a branch v2/qr-attempts-2610121044ac76.

## Arquivos desta entrega (workspace ~/hermes-workspaces/Zapp_Web_V2/qr-attempts-refazer1-t_6719927d/)
- supabase/tests/qr_attempts.sql (modificado, +8 linhas: T4f/T4g)
- supabase/migrations/20261012110945_qr_attempts.sql (cópia idêntica à do trabalho anterior, referência da prova)
- supabase/migrations/20251215025014_fcc5bc79-55e3-4972-8765-6a7840fdce5a.sql (dependência aplicada pelo TC, inalterada)
- .tmp/relato.md (este arquivo)
- .tmp/verde-tc-novo.log, .tmp/vermelho-ddl-buggy.log, .tmp/vermelho-t4f-isolado.log, .tmp/verde-t4f-isolado.log, .tmp/vermelho-sem-guarda.log, .tmp/sonda-t4f.sql, .tmp/sonda-t4f-fix.sql, .tmp/buggy/20261012110945_qr_attempts.sql
