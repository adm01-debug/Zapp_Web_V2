Especialista: workersql
## O que mudou e por quê
- supabase/migrations/20261013235909_alerta_falha_envio_por_conexao.sql: ramo "ainda presas" passa a exigir `message.external_id is null and message.client_message_id is not null` (o mesmo que o varredor varre); título e mensagem usam `coalesce(connection_name, connection_id::text)`; cabeçalho e `comment on function` atualizados com o critério exato. Edição no lugar porque a migration é nova e não integrada (nada entrou; o próprio relato anterior registra isso), e a devolução manda acrescentar neste arquivo.
- supabase/tests/alerta_falha_envio_por_conexao.sql: fixture `messages` ganha `client_message_id` e `external_id`; presas que devem contar passam a ter `client_message_id` preenchido; novo Canal M com 11 `sending` legadas (6 sem `client_message_id` + 5 com `external_id`) que não deve alertar; nova asserção T4(d).
## Prova
- vermelho antes (teste novo contra migration sem a correção): `docker exec ... psql ... < supabase/tests/alerta_falha_envio_por_conexao.sql` → `ERROR: FALHA: T2 deveria alertar 6 conexoes (Canal A, C, F, I, J, K), alertou 7`
- verde depois (mesmo comando, com a correção): `OK: alerta_falha_envio_por_conexao — T1..T6 verdes` (RC=0, inclui container descartável com `RESET` e checagem como `authenticated`)
- `zapp-verify . --rapido` → `VERIFY: VERDE SEM BANCO` (banco provado pelo teste acima; sem nome de conjunto, como na entrega anterior)
## Pontos da devolução (2026-10-14 11:03, na ordem)
- Ponto 1: ramo "ainda sending" agora tem `and message.external_id is null and message.client_message_id is not null`, idêntico ao `sweep_stale_outbound_sending`; prova: vermelho/verde acima (Canal M contava 11 e alertava; agora conta 0).
- Ponto 2: fixture com as duas colunas; presas que contam têm `client_message_id` preenchido; Canal M (11 legadas) não alerta; T5 segue esperando 6 alertas; prova: mesmo teste (`OK ... T1..T6 verdes`).
- Ponto 3: título e mensagem usam `coalesce(incidente.connection_name, incidente.connection_id::text)`; prova: T5 (conteúdo sem PII) verde no mesmo teste.
## FAIXA DO PAI
- Commit 3889a7364b (migration e teste do varredor `20261013210005`, cartão t_1db58529/PD-78) veio na branch por herança e está no diff porque o pai não foi integrado; trazido conforme a seção DEPENDÊNCIA do cartão. Não é deste cartão e não foi alterado aqui.
## O que NÃO fiz e por quê
- Não criei migration nova: a devolução manda acrescentar no ramo da migration 20261013235909, que nunca foi integrada; o `-- Rollback:` (desagenda + drop + recria job) segue válido e o T6 o executa verde.
- Não mexi em `src/integrations/supabase/types.ts`: nenhuma tabela nova ou alterada no produto.
