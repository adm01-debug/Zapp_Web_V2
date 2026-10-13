Especialista: worker (sql) (area-sql-banco)

## O que mudou e por quê
- supabase/migrations/20261013235909_alerta_falha_envio_por_conexao.sql (nova): cria a função de
  manutenção `public.alert_outbound_failure_rate()` e agenda no pg_cron (`*/5 * * * *`, job
  `alerta-falha-envio-por-conexao`). Ela calcula POR CONEXÃO, na última hora, os envios com desfecho
  terminal (`sent`/`delivered`/`read`/`failed`/`outcome_unknown`), a taxa de falha, as mensagens
  presas em `sending` (último toque > 15 min E sem lease vivo — o mesmo critério do varredor da
  migration 20261013210005) e as `outcome_unknown`. Dispara com amostra >= 20 envios e taxa >= 20%,
  OU mais de 10 presas. Grava UM alerta `critical` em `warroom_alerts` com `dedupe_key` estável
  `envio-falha:<conexao>:<hora>` (ON CONFLICT sobre o índice único parcial `ux_warroom_alerts_dedupe_key`),
  então rodar de novo na mesma hora não duplica. O limiar é fixo na função (sem parâmetro/edição
  por tela). O alerta NÃO carrega telefone nem conteúdo de mensagem: só o NOME da conexão e as
  contagens. Som/push existentes reagem ao INSERT na tabela (nada novo no front). ACL: REVOKE de
  PUBLIC/anon/authenticated/service_role — só o dono/cron executa.
- supabase/tests/alerta_falha_envio_por_conexao.sql (nova): suíte T1..T6 em Postgres 17 descartável
  (mesmo padrão do cartão pai t_bc890f8a), aplicando a migration VERBATIM, terminando em ROLLBACK.

## Prova
- vermelho antes (sem a migration): `docker exec -i ... psql -v sem_migration=1 ...` →
  `ERROR: function "public.alert_outbound_failure_rate()" does not exist` (aborta em T1, RC=3).
- verde depois: `docker exec -i ... psql -v mig=/repo/supabase/migrations/20261013235909_alerta_falha_envio_por_conexao.sql ...`
  → `OK: alerta_falha_envio_por_conexao — T1..T6 verdes` (RC=0).
- T1 ACL (authenticated/anon/service_role sem EXECUTE; job agendado 1x, authenticated negado em execução).
- T2/T3 taxa: Canal A 24% (amostra 25) alerta, Canal B 50% com amostra 10 não, Canal F 20% exatos
  (amostra 20) alerta, Canal G 15% não — 3 alertas no total, exatamente os esperados.
- T4 presas: Canal C 11 alerta; Canal D 10 não; Canal E 12 com lease vivo não; Canal H 12 recentes não.
- T5 conteúdo/PII: `critical`/`envio-falha`, `dedupe_key` estável, texto com conexão/taxa/sem confirmação;
  nenhum alerta contém `5511999999999` nem o texto das mensagens; 2ª passada na mesma hora insere 0.
- T6 rollback (extraído do arquivo): dropa a função e desagenda o job; reaplicar volta ao estado.

## O que NÃO fiz e por quê
- `src/integrations/supabase/types.ts` não mudou: nenhuma tabela/coluna/RPC nova exposta ao cliente
  (`warroom_alerts.dedupe_key` já existe desde 20261006155408 e a função é só do cron). O cartão cita
  o arquivo como "só se o schema exposto mudar".
- Nada de retry configurável por tela (fora de escopo); limiar fixo na função.
- `supabase/schema-manifest.json` não foi tocado à mão (gerado por scripts/db-audit/manifest.sql);
  uma função nova entra nele na regeneração do pipeline.
- Não criei script em scripts/db-audit/: a prova é a suíte .sql em supabase/tests/, que não entra no
  inventário de scripts do CI (check-test-inventory cobre scripts/db-audit/*.test.sh e
  supabase/functions/*.test.ts). Registrar a suíte num passo do db-guard.yml fica para worker (ci).
