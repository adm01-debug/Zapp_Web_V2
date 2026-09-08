# Rollout da integração CRM

Este runbook é o contrato operacional entre o Zapp Web V2 canônico
(`tnnnlkbymytvtqngbbqh`) e o CRM de empresas/contatos
(`pgxfvjmuubtbowutlide`). A ordem é obrigatória para que o frontend nunca
aponte para uma Edge ou uma estrutura de banco ainda ausente.

## Invariantes

- O navegador acessa somente o Supabase canônico e envia o JWT do usuário.
- URL e chave do CRM externo existem apenas como Edge Secrets.
- `contact.id` é a identidade local; telefone é usado somente na descoberta.
- Cada `conversation_closures.id` gera uma única chave `closure:<uuid>`.
- Uma entrega só é concluída depois de o vínculo externo ser persistido.
- Mensagens/transcrições completas não entram na outbox.
- Workers concorrentes usam `FOR UPDATE SKIP LOCKED`; locks com mais de cinco
  minutos são recuperáveis com fencing token; a oitava falha vai para dead-letter.
- O schedule fica inerte enquanto `CRM_SYNC_WORKER_ENABLED` não for exatamente
  `true`; o primeiro processamento é sempre manual e limitado a um item.

## Fase 1 — banco canônico

1. Fazer merge da migration `20260908180000` na `main`.
2. Executar `DB Migrate (production)` com `apply=false`, project ref canônico e
   versão `20260908180000`.
3. Guardar o `runtime_sha256` exibido no dry-run.
4. Reexecutar com `apply=true` e o mesmo hash.
5. Exigir sucesso de ledger, paridade integral e contrato de ACL da outbox.
6. Executar `types-sync`; revisar e integrar somente os artefatos gerados do
   banco canônico.

Rollback: antes de a Edge estar ativa, manter as tabelas e desabilitar apenas o
trigger com `ALTER TABLE conversation_closures DISABLE TRIGGER
trg_enqueue_crm_sync_from_closure`. Não apagar filas para fazer rollback.

## Fase 2 — gateway e worker

1. Cadastrar como GitHub Secrets `EXTERNAL_SUPABASE_URL` e
   `EXTERNAL_SUPABASE_SERVICE_ROLE_KEY` do projeto `pgxfvjmuubtbowutlide`, além
   de `CRON_SECRET`; o workflow valida endpoint, project ref e role antes de
   copiar os dois primeiros para os Edge Secrets canônicos.
2. Não cadastrar nem usar `EXTERNAL_SUPABASE_ANON_KEY`: o gateway falha fechado
   se a credencial server-side não estiver disponível.
3. Fazer merge do gateway com `VITE_CRM_INTEGRATION_ENABLED=false`.
4. Executar `Deploy Edge Functions` somente para `crm-integration`.
5. Exigir no smoke: CORS permitido, origem hostil negada e POST anônimo = 401.
6. Reconciliar toda entrega acumulada antes do cutover com a chave usada pelo
   sincronizador legado. Não drenar enquanto a unicidade externa por
   `p_zapp_conversation_id` não estiver provada.
7. Executar manualmente `CRM Sync Worker` com lote 1. O job primeiro chama
   `health` (leitura sintética sem PII) e só depois processa a fila.
8. Confirmar `external_reachable=true`, fila acessível e zero falhas no lote.
9. Somente depois definir a variável GitHub `CRM_SYNC_WORKER_ENABLED=true`.

Rollback: redeploy da revisão anterior da Edge. A outbox mantém os registros
pendentes para replay posterior; não marcar manualmente como concluídos.

## Fase 3 — ativação do frontend

1. Alterar somente `VITE_CRM_INTEGRATION_ENABLED=true`.
2. Validar em preview com usuário comum: CRM 360, busca e sincronização manual.
3. Validar como admin: tabelas gerenciais e cartão “Saúde da integração”.
4. Publicar na `main` e executar smoke no domínio de produção.
5. Observar por 24 horas: `failed`, `dead_letter`, idade da fila e vínculos
   ausentes devem permanecer em zero.

Rollback: definir a flag como `false`. A coleta durável pelo trigger continua;
o frontend deixa de chamar o gateway sem perda das entregas pendentes.

## Fase 4 — encerramento do modo legado

Esta fase exige acesso administrativo ao projeto CRM externo e não pode ser
inferida a partir do banco canônico.

1. Confirmar que a Edge está usando `EXTERNAL_SUPABASE_SERVICE_ROLE_KEY`.
2. No projeto `pgxfvjmuubtbowutlide`, revogar de `anon` o EXECUTE das RPCs de
   CRM e qualquer SELECT direto concedido apenas para a integração antiga.
3. Repetir smoke positivo pelo gateway e negativo com a anon key externa.
4. Remover os secrets GitHub legados `VITE_CLIENTES_SUPABASE_URL` e
   `VITE_CLIENTES_SUPABASE_ANON_KEY`.
5. Rotacionar a anon key externa se o projeto permitir e registrar a mudança
   no inventário de segredos.

## SLO e resposta a incidentes

- Disponibilidade mensal do gateway: 99,9%.
- Idade da entrega pronta mais antiga: alerta com 15 minutos, incidente com 60.
- `dead_letter > 0` ou `succeeded_without_link > 0`: incidente e bloqueio de
  novas mudanças na integração até triagem.
- Nunca reprocessar por INSERT/UPDATE manual. Corrigir a causa e usar o worker,
  preservando a chave idempotente.
