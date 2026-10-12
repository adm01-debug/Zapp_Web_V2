Especialista: workersql

O codigo ja estava certo: conclui o que o cartao pediu (o relato) e reproduzi/corrigi um defeito real no TESTE — vermelho antes, verde depois. Ponto a ponto.

## O que mudou e por que (diff desta rodada)
- supabase/tests/contacts_waiting_por_atribuicao.sql: o bloco C0 agora REMOVE a chave (`DELETE FROM public.feature_flags WHERE key = 'inbox.status-fsm';`) e reexecuta a migration real (`\i /tmp/20261011174630_contacts_waiting_por_atribuicao.sql`) ANTES de conferir. A chave ja existe no banco local (o seed local a insere LIGADA) e o contrato em prova e o da MIGRATION: chave AUSENTE nasce DESLIGADA. Sem isso o C0 leria a chave do seed e a suite fica VERMELHA em qualquer banco local de pe (reproduzido abaixo).
- supabase/migrations/20261011174630_contacts_waiting_por_atribuicao.sql: uma linha nova, `ALTER TABLE public._rb_contacts_waiting_por_atribuicao ENABLE ROW LEVEL SECURITY;` (item 5, que autoriza). Nada mais na migration.
- O resto do diff da branch e o backfill com flag segura, do refazer anterior.

## Prova (banco LOCAL descartavel cwait45; suite supabase/tests/contacts_waiting_por_atribuicao.sql; migration aplicada e recopiada p/ /tmp do container)
- VERMELHO (antes da correcao, banco local padrao, migration real): `zapp-db-local psql . cwait45 -v ON_ERROR_STOP=1 < supabase/tests/contacts_waiting_por_atribuicao.sql` → `ERROR:  C0 FALHOU: flag nova deveria nascer desligada, veio t` (rc=3). Era o teste que estava errado, nao a migration: o seed local liga a chave.
- VERDE (depois, migration real): mesma suite → `suite OK (C0 flag nasce off, C1 flag off, C2 tira responsavel, C3 atribui, C4 terminal) -- 5 grupo(s) verificado(s)` / `C5 flag desligada OK` / `C5 flag ligada OK` / `C5 idempotencia OK (migration real preservou o carimbo sentinela)` (rc=0).
- VERMELHO do C5 (item 3, pedido literal): `\i` da migration SEM o predicado da flag no bloco de backfill → `ERROR:  C5 FALHOU: migration real com flag desligada alterou o estado (waiting / 2026-10-12 10:51:17.068756+00)` (rc=3); mutante em `.tmp/mut_full.sql`, saida em `.tmp/saida_mut_full.sql.txt`.
  - Detalhe honesto: removendo o predicado SO do INSERT ou SO do UPDATE a suite continua VERDE (rc=0) — com a flag desligada o INSERT nao captura nada e o UPDATE nao tem o que mover. O vermelho exige remover o predicado do bloco INTEIRO; por isso ele precisa estar nos dois lados.
- VERMELHO do C0 (defeito do ponto 1, migration criando a chave ligada): `.tmp/mut_flag_on.sql` → `ERROR:  C0 FALHOU: flag nova deveria nascer desligada, veio t` (rc=3).
- Rollback executado de verdade (linhas `--   ` do cabecalho, copiadas sem alteracao): antes `waiting | 2026-10-12 10:52:52.941174+00`; depois `open | 2026-01-01 00:00:00+00`, `tabela_interna = (nulo)`, `funcao = 0`, `gatilho = 0`, `inbox.status-fsm | enabled = t` (a chave NAO e apagada). rc=0. Script `.tmp/prova_rollback.sql`.

## Pontos da recusa anterior, numerados
- Ponto 1 (flag nasce desligada): resolvido (`INSERT ... false ... ON CONFLICT (key) DO NOTHING`, linhas 29-35). Provado verde (C0) e vermelho no mutante que liga a chave. Efeito colateral: se a chave JA existir ligada, continua ligada — de proposito, para a promocao nao mexer no valor vigente.
- Ponto 2 (rollback nao apaga a chave): resolvido — restaura os contatos pelos valores capturados, derruba gatilho/funcao/tabela e NAO apaga a flag. Provado acima.
- Ponto 3 (C5 usa carimbo sentinela): resolvido — carimba 2026-02-02 e confere que a reexecucao idempotente nao o reescreve (`C5 idempotencia OK`).
- Ponto 4 (relato): este relato, ponto a ponto, com a saida colada.

## Itens 2 e 5 do "Corrigir"
- Item 2 — efeito em PRODUCAO: a flag nasce DESLIGADA. Enquanto a chave `inbox.status-fsm` nao for ligada, o gatilho `trg_contacts_assignment_status_sync` nao age e o backfill NAO captura nada (o `AND EXISTS (... feature_flags ... enabled IS TRUE)` e falso). Como o backfill e carimbo unico (roda so na aplicacao da migration), as conversas abertas sem responsavel com mensagem — ~315 na producao, numero do cartao — continuam `open` depois da migration e NAO viram `waiting` sozinhas ao ligar a chave. PASSO OPERACIONAL: depois de ligar a chave, reexecutar o bloco de backfill da migration 20261011174630 para promover essas conversas; a tabela `_rb_...` guarda os valores anteriores e permite desfazer.
- Item 5 — contagem no banco LOCAL, antes/depois (`.tmp/prova_contagem.sql`): `elegiveis = 0` (contatos `open`, sem responsavel, com mensagem) ANTES; depois do backfill com a flag ligada `rb_linhas = 0 | waiting = 0`. No banco local sintetico NAO existe contato elegivel: a base local prova o mecanismo, nao o volume. O ~315 e numero do cartao (producao), nao medido por mim. RLS da `_rb_contacts_waiting_por_atribuicao`: `relrowsecurity = t`, `relforcerowsecurity = f`; grants so para `postgres` e `service_role`; `anon` e `authenticated` sem privilegio ALGUM. Escolhi LIGAR a RLS na migration, alem do `REVOKE ALL` que ja existia.

## O que NAO fiz e por que
- Nao mexi no restante da migration nem em funcao/gatilho: o codigo ja estava correto e o cartao manda corrigir so o relato.
- Nao apaguei o teste nem criei `scripts/db-audit/*.test.sh` novo (a suite e `supabase/tests/*.sql`, rodada pelo passo do `.github/workflows/db-guard.yml`).
- Nao citei identificador, URL nem contagem do banco de producao.
