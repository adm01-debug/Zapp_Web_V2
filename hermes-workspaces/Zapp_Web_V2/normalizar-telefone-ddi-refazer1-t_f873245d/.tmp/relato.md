Especialista: workersql
## O que mudou e por quê (código inalterado; só o relato)
- supabase/migrations/20261013051843_normalize_contact_phone_ddi.sql (novo): `normalize_contact_phone()` passa a tirar não-dígitos e, se o resultado tiver 10-11 dígitos (brasileiro sem DDI), prefixar 55; 12+ dígitos ficam intactos (idempotente). Backfill dos legados de 10-11 dígitos com tabela de apoio `public._rb_normalize_contact_phone_ddi` (id + telefone anterior) para o rollback; linhas cuja forma com 55 já existe em outro contato são puladas (SKIP, sem apagar/sobrescrever) e anunciadas por RAISE NOTICE com contagem, sem telefone. `-- Rollback:` em SQL executável (restaura função antiga, telefones anteriores, apaga a apoio).
- supabase/tests/normalize_contact_phone_ddi.sql (novo): prova comportamental da trigger REAL em Postgres descartável (RED antes, G1–G7 depois, R com o bloco de rollback extraído do próprio arquivo da migration).
- Diff deste cartão (`git show --stat 2b575fbcb`): 2 files changed, 384 insertions(+), só os 2 arquivos acima.
## Pontos da recusa
- Ponto 1: primeira linha agora é exatamente `Especialista: workersql` (antes: `Especialista: worker (sql) (area-sql-banco)`).
- Ponto 2: prova abaixo com comandos literais, saída literal e EXIT. Sem `<pg>`, sem pseudocódigo.
- Ponto 3: cortada a prosa além do cartão/recusa (seções sobre GRANT/RLS, updated_at como seção própria, schema-manifest/workflow, blocos G5/G6 como prosa do relato, aviso redundante). As linhas G4/G5/G6 aparecem abaixo só como saída literal do arquivo de teste, não como afirmação do relato; updated_at é citado só porque o critério do cartão exige "sem reescrever updated_at" (G4 prova).
- Ponto 4: os "5 legados" do G1 são 5 linhas-fixture criadas pelo próprio teste no Postgres descartável — nunca li nem listeicontato de produção (R1); a migration aplicada no teste é o mesmo arquivo que roda nos 5 reais.
## Prova (execução minha, neste workspace)
- `docker run --rm -d --name pg-normphone-ref1 -v "$PWD:/repo:ro" -e POSTGRES_PASSWORD=test_only postgres:17-alpine` → container `pg-normphone-ref1` no ar.
- `docker exec -i pg-normphone-ref1 psql -X -q -v ON_ERROR_STOP=1 -U postgres -d postgres -v mig=/repo/supabase/migrations/20261013051843_normalize_contact_phone_ddi.sql -v rollback_file=/repo/.tmp/rollback.sql < supabase/tests/normalize_contact_phone_ddi.sql` → EXIT=0, saída literal:
```
NOTICE:  RED OK: trigger antiga deixa 10-11 digitos sem DDI (defeito confirmado)
psql:/repo/supabase/migrations/20261013051843_normalize_contact_phone_ddi.sql:78: NOTICE:  normalize_contact_phone_ddi: 1 contato(s) de 10-11 digitos cuja forma com 55 ja existe em outro contato: PRESERVADOS sem alteracao (nenhuma linha apagada ou sobrescrita).
NOTICE:  G1 OK: backfill pos 55 nos 5 legados de 10-11 digitos
NOTICE:  G2 OK: estrangeiro (12 digitos) e numero ja com 55 (13) preservados
NOTICE:  G3 OK: colisao preservada, nenhuma linha apagada/sobrescrita (9 contatos)
NOTICE:  G4 OK: updated_at preservado no backfill
NOTICE:  G5 OK: 11/10 digitos ganham 55; 13 fica; regravar nao duplica
NOTICE:  G6 OK: authenticated insere com normalizacao; chamada direta negada (42501)
psql:/repo/supabase/migrations/20261013051843_normalize_contact_phone_ddi.sql:58: NOTICE:  relation "_rb_normalize_contact_phone_ddi" already exists, skipping
psql:/repo/supabase/migrations/20261013051843_normalize_contact_phone_ddi.sql:78: NOTICE:  normalize_contact_phone_ddi: 1 contato(s) de 10-11 digitos cuja forma com 55 ja existe em outro contato: PRESERVADOS sem alteracao (nenhuma linha apagada ou sobrescrita).
NOTICE:  G7 OK: reaplicacao idempotente (telefones estaveis; apoio sem duplicar)
NOTICE:  R OK: rollback devolveu dados, removeu a tabela de apoio e restaurou a funcao
NOTICE:  normalize_contact_phone_ddi: TODAS as assercoes passaram (RED/G1-G7/R)
```
- Container descartável removido (`docker rm -f pg-normphone-ref1`); o teste roda em transação que termina em ROLLBACK.
- Verificação: `zapp-verify . --rapido` → VERIFY_EXIT=0, saída literal:
```
OK      db_guard        0s
OK      tipos          82s
OK      lint            0s
OK      migrations      1s
AVISO   banco_local  NÃO VERIFICADO: sem nome de conjunto (passe o nome como terceiro argumento)
VERIFY: VERDE SEM BANCO (83s) — o banco NÃO foi verificado; registros em /home/joaquim_ataides/.local/state/zapp-verify/dbc4650e4d67
```
(O AVISO banco_local é o comportamento esperado sem nome de conjunto; o banco foi provado acima no Postgres descartável com EXIT=0.)
