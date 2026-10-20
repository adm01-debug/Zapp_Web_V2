- Verificação rápida (zapp-verify --rapido) no fechar: OK db_guard 0s;OK tipos 24s;OK lint 0s;OK migrations 1s

## FATOS MEDIDOS PELO FECHAR (13/10 02:36, gerados por máquina: valem mais que números escritos à mão)
```
 .../20261013051843_normalize_contact_phone_ddi.sql | 106 ++++++++
 supabase/tests/normalize_contact_phone_ddi.sql     | 278 +++++++++++++++++++++
 2 files changed, 384 insertions(+)
```
- Nenhum arquivo de teste alterado neste cartão
- Portão do integrador (mesmo Jev da fila) simulado no fechar: revisar — caminho sensível: supabase/migrations/20261013051843_normalize_contact_phone_ddi.sql, supabase/tests/normalize_contact_phone_ddi.sql; padrão sensível: caminho:supabase/migrations/, caminho:supabase/tests/, padrão:\bDROP\b, padrão:\bGRANT\b, padrão:\bREVOKE\b, padrão:search_path

Especialista: worker (sql) (area-sql-banco)

## O que mudou e por quê
- supabase/migrations/20261013051843_normalize_contact_phone_ddi.sql (novo): o gatilho trg_normalize_contact_phone passou a acrescentar o DDI 55 — depois de tirar os não-dígitos, se o número for brasileiro SEM DDI (10 ou 11 dígitos) vira '55'||número; números com 12+ dígitos (já com DDI ou estrangeiros) ficam intactos. Idempotente (o resultado nunca volta a casar '[0-9]{10,11}'). Backfill das linhas legadas de 10-11 dígitos numa única transação. `-- Rollback:` com o bloco SQL executável (restaura a função antiga, os telefones anteriores e apaga a tabela de apoio), provado.
- supabase/tests/normalize_contact_phone_ddi.sql (novo): prova comportamental da trigger REAL em Postgres descartável; RED antes, G1–G7 depois, e o bloco de rollback extraído do próprio arquivo da migration (BLOCO R).

## Como o cartão foi cumprido
- Trigger por formato: 10-11 dígitos → ganha 55; estrangeiro (ex.: 12 dígitos tipo 351…) preservado; número já com 55 (13 dígitos) preservado (G2).
- Backfill dos legados (o banco local não tem os 5 contatos reais; a superfície reproduz o cenário com 5 linhas de 10-11 dígitos — G1). A migration é a mesma que roda nos 5.
- Colisão (G3): a linha legada cuja forma com '55' JÁ existe em outro contato NÃO é tocada — nenhuma linha apagada nem sobrescrita; a contagem total fica igual e a migration anuncia o caso por RAISE NOTICE (sem telefone). A constraint contacts_phone_key continua valendo: um INSERT novo que normalize para um telefone existente estoura unique_violation (falha alta, não silenciosa).
- Idempotência (G7): reaplicar a migration não muda telefone algum e não duplica a tabela de apoio.
- Papel real (G6): `authenticated` INSERE contato normalmente — a trigger dispara e o número ganha 55 sem exigir EXECUTE na função; chamar public.normalize_contact_phone() direto é NEGADO (42501), re-afirmando o fechamento de 20260905010000.
- Efeitos colaterais (passada do meu histórico de recusas): (a) o backfill PRESERVA updated_at — desligo/religo o gatilho genérico update_contacts_updated_at em volta do UPDATE, então normalizar a forma não reescreve a data nem dispara "recém-atualizado"; provado em G4. (b) nada de GRANT/papel novo; o REVOKE re-afirma a trava já existente. (c) a migration não toca RLS de contacts nem qualquer outra função. (d) a tabela de apoio public._rb_normalize_contact_phone_ddi guarda só id + telefone anterior (para o rollback ser real), nasce com RLS ligada e REVOKE ALL de PUBLIC/anon/authenticated, e o rollback a apaga.

## O que NÃO fiz e por quê
- Não listei os 5 contatos do banco de PRODUÇÃO: a R1 e as regras de 07-08/10 proíbem acesso a produção. Reproduzi o mesmo cenário no banco local/descartável com fixtures equivalentes.
- Não criei índice, policy nem GRANT; nada além do gatilho, do backfill e da tabela de apoio do rollback.
- Não toquei supabase/schema-manifest.json nem workflows (motor/CI é de outro especialista).

## Prova
- vermelho antes: `docker exec -i <pg> psql -v ON_ERROR_STOP=1 … < supabase/tests/normalize_contact_phone_ddi.sql` → na trigger antiga, L1 fica '11988880001' (11 dígitos, sem 55): `NOTICE: RED OK: trigger antiga deixa 10-11 digitos sem DDI (defeito confirmado)`.
- verde depois (saída real, EXIT=0):
```
NOTICE:  RED OK: trigger antiga deixa 10-11 digitos sem DDI (defeito confirmado)
NOTICE:  normalize_contact_phone_ddi: 1 contato(s) de 10-11 digitos cuja forma com 55 ja existe em outro contato: PRESERVADOS sem alteracao (nenhuma linha apagada ou sobrescrita).
NOTICE:  G1 OK: backfill pos 55 nos 5 legados de 10-11 digitos
NOTICE:  G2 OK: estrangeiro (12 digitos) e numero ja com 55 (13) preservados
NOTICE:  G3 OK: colisao preservada, nenhuma linha apagada/sobrescrita (9 contatos)
NOTICE:  G4 OK: updated_at preservado no backfill
NOTICE:  G5 OK: 11/10 digitos ganham 55; 13 fica; regravar nao duplica
NOTICE:  G6 OK: authenticated insere com normalizacao; chamada direta negada (42501)
NOTICE:  G7 OK: reaplicacao idempotente (telefones estaveis; apoio sem duplicar)
NOTICE:  R OK: rollback devolveu dados, removeu a tabela de apoio e restaurou a funcao
NOTICE:  normalize_contact_phone_ddi: TODAS as assercoes passaram (RED/G1-G7/R)
EXIT=0
```
- banco local da tarefa: `hermes-db-migrar supabase/migrations/20261013051843_normalize_contact_phone_ddi.sql` → `APLICADA no banco LOCAL 'v2-2610130213e4d6' (produção não foi tocada).`
- verificação: `zapp-verify . --rapido` → `VERIFY: VERDE SEM BANCO (180s)`.
