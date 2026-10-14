Especialista: workersql

[refazer 1] — 4 pontos do revisor (todos no monitor `public.alert_outbound_failure_rate()`, migration 20261013235909; a migration é NOVA e não integrada, por isso corrigi no lugar em vez de criar outra).

O que mudou (só o monitor e o teste do monitor):
1) Contagem de "presas" furada pelo varredor. O varredor (`sweep_stale_outbound_sending`, 20261013210005) roda no MESMO `*/5` e converte as presas em `failed` antes de o monitor contá-las. Agora a CTE `presas` soma duas fontes: (a) linhas ainda em `sending`, sem lease vivo e último toque `coalesce(delivery_claim_expires_at, updated_at)` há mais de 15 min — mesmo critério do varredor; (b) linhas JÁ varridas na janela: `status='failed'` e `delivery_failure_reason='nao_despachada'` com `updated_at` na última hora.
2) Conexão resolvida com o mesmo coalesce do claim. `presas` e `janela` passaram a `left join public.contacts` e usam `coalesce(message.whatsapp_connection_id, contact.whatsapp_connection_id)` (como o `claim_outbound_message`), então a linha sem conexão no próprio `messages` é atribuída à conexão do contato.
3) Texto do alerta disparado só por presas. O ramo "sem taxa estourada" deixou de dizer "amostra insuficiente (N envios terminais…)"; agora diz `N de M envios terminais da última hora falharam (não bateu o limiar de taxa)` seguido de `Presas em envio (mais de 15 min): X.` e `Sem confirmação: Y.`.
4) Comentário do T6 reescrito: não afirma mais ser "extraído do arquivo" (o SQL do rollback é mantido em sincronia à mão com o bloco `-- Rollback:` da migration).

Prova (vermelho antes, verde depois; Postgres 17 descartável, docker):
- VERMELHO (`-v sem_migration=1`): `ERROR: function "public.alert_outbound_failure_rate()" does not exist` em T1, RC=3.
- VERDE (`-v mig=/repo/supabase/migrations/20261013235909_alerta_falha_envio_por_conexao.sql`): `OK: alerta_falha_envio_por_conexao — T1..T6 verdes`, RC=0.
- `zapp-verify . --rapido`: `VERIFY: VERDE SEM BANCO`, RC=0 (db_guard OK, tipos OK, lint OK, migrations OK).
- Cobertura nova no teste T2–T5: Canal J (11 varridas na janela, nenhuma em `sending`) alerta; Canal L (10 varridas) não; Canal K (6 presas + 5 varridas) alerta; Canal I (11 presas com `whatsapp_connection_id` nulo, contato d2 aponta p/ c9) alerta e o `dedupe_key` sai com o id c9 — prova a atribuição via contato. T5 confere que o alerta do Canal J traz `Presas em envio (mais de 15 min): 11` e NÃO contém "insuficiente". Alerta esperado subiu de 3 para 6.

FAIXA DO PAI (herdada por dependência, não escrita neste cartão):
`453e6b69f9` (merge-base com `dia/2026-10-13`) → `a03db8ad0` = varredor/claim 20261013210005 + teste.
`git diff --name-only 453e6b69f9...HEAD`:
  .tmp/relato.md
  supabase/migrations/20261013210005_outbound_sweeper_e_claim_por_papel.sql
  supabase/migrations/20261013235909_alerta_falha_envio_por_conexao.sql
  supabase/tests/alerta_falha_envio_por_conexao.sql
  supabase/tests/outbound_sweeper_e_claim_por_papel.sql

Riscos preservados: nada de DDL sobre dado existente; GRANT/REVOKE e `search_path` intactos; sem PII no texto do alerta (T5 confere); dedupe_key por conexão+hora mantém a idempotência (T5: 2ª execução não insere, total segue 6).

Rodapé do cartão (regras permanentes) copiado no template: este é cartão de banco, então o rodapé "não traz DDL/migration" não se aplica.

PROVA
```
VERMELHO: ERROR: function "public.alert_outbound_failure_rate()" does not exist  (RC=3)
VERDE: OK: alerta_falha_envio_por_conexao — T1..T6 verdes  (RC=0)
zapp-verify: VERIFY: VERDE SEM BANCO (21s)  (RC=0)
```
