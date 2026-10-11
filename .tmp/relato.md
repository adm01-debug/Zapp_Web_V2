Especialista: worker (sql) (area-sql-banco)

## O que mudou e por quê
- supabase/migrations/20261011180000_indeterminate_optout_outbox.sql (nova, única): corrige a falha da entrega anterior e mantém o desenho aprovado do #190. A migration anterior (20261007095739) fazia `ALTER TABLE` e `INSERT` em `public.inbound_message_effects`, tabela que vem do cartão #69 (migration 20261005224959) e que NÃO está na base `dia/2026-10-11` — daí o `ERROR: relation "public.inbound_message_effects" does not exist` no integrator. A nova migration garante a tabela na forma canônica do #69 com `CREATE TABLE IF NOT EXISTS` (mesmos nomes de CHECK e de índices): cria sozinha quando a #69 falta e converge sem erro quando ela já estiver aplicada. Somei ao cabeçalho o bloco de rollback no formato executável.
- Decisão de opt-out: `p_opt_out_decision` obrigatório (matched|not_matched|indeterminate|NULL); 'indeterminate' enfileira `optout_resolve` na MESMA transação do ingest (junto da mensagem inbound) e NUNCA suprime/atribui otimisticamente. A drenagem reavalia pela fonte autoritativa `talkx_match_optout` (sem lista fixa de palavras no SQL): casou → só supressão; não casou → libera as atribuições uma vez; exceção → conserva a pendência com `last_error` para a reentrega.
- Idempotência por redelivery: UNIQUE (whatsapp_connection_id, external_id, effect) + `ON CONFLICT DO NOTHING`.

## Prova
- aplica limpo: `hermes-db-migrar supabase/migrations/20261011180000_indeterminate_optout_outbox.sql` →
  `CREATE TABLE / CREATE INDEX x2 / ALTER TABLE / REVOKE / GRANT / COMMENT / ALTER TABLE / COMMENT / CREATE FUNCTION x2 / ... / COMMIT`
  e `APLICADA no banco LOCAL 'v2-261011174827ce' (produção não foi tocada)` (exit 0).
- rollback reverte e reaplica: `zapp-db-local psql . v2-261011174827ce < .tmp/rollback.sql` →
  `R1_tabela_sobrando=0`, `R1_drain_sobrando=0`, `R1_ingest_12_args_sobrando=0`, `R1_ingest_8_args_ok=1`;
  reaplicando a migration → `tabela=1  ingest12=1  drain=1`.
- comportamento (`.tmp/proof.sql`, saída real):
  - `1_outcome=inserted`, `1_resolve=1 pendente=true`, `1_sem_supressao=0`
  - `2_outcome=updated`, `2_total=1` (redelivery do mesmo external_id idempotente)
  - `3_ok_invalido_rejeitado` (decisão fora do contrato → SQLSTATE 22023)
  - `4_drenagem={"talkx_reply":{...,"attributed":false},"optout_status":null,"pending_failed":0,...}` e `4_baixada=1`
  - `5_supressao=1` (matched + keyword do chamador), `6_fromme_efeitos=0`
  - `7_rls=true`, `7_policies=0`

## O que NÃO fiz e por quê
- Não adicionei arquivo de teste: o cartão passa só a migration; um `.test.sh` novo exigiria passo em `.github/workflows/db-guard.yml`, fora do escopo.
- Não toquei no ingest de 8/11 argumentos nem em Edge/telas: a mudaça entra como sobrecarga de 12 argumentos (aridade disjunta), então a chamada atual continua resolvendo na função existente.
- Efeito colateral documentado: se a #69 já estiver na base, o rollback desta migration também remove a outbox que ela criou (o inverse exato inclui o que esta migration cria quando a #69 falta). No caso real de hoje — sem a #69 na base — o rollback é o inverse exato.

## Sobre o aviso automático "SEM DDL/migration"
- Não procede. Este é um cartão de banco: a entrega É a migration, o único arquivo do diff (o rodapé-padrão "sem DDL/migration" do template veio copiado de cartões de front). O trabalho anterior do mesmo cartão também era esta migration. Repito o mesmo comando.

## Sobre o juiz automático (o gatilho e o teste)
- "nenhum teste no diff": o cartão passa só a migration — um `.test.sh` novo exigiria passo em `.github/workflows/db-guard.yml`, fora dos arquivos permitidos. A prova comportamental é real e está colada acima (`.tmp/proof.sql` na db local): sem a migration não existe a outbox/`optout_resolve` e `1_resolve=1 pendente=true` falharia; com ela passa.
- "UPDATE em messages regrava updated_at em TODAS as linhas": não procede — todo UPDATE do arquivo tem `WHERE id = <uma linha>`: `UPDATE public.messages ... WHERE id = v_existing.id` e `UPDATE public.contacts SET ..., updated_at = now() WHERE id = v_contact.id`, idênticos ao ingest já existente (20260905050000, linhas 70/86/102). Não há UPDATE sem WHERE nem em massa.
