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

## Estado operacional do worker (W93, medido em 2026-10-15)

Medição feita na produção (`tnnnlkbymytvtqngbbqh`) **somente com `SELECT`**, e
no GitHub somente por leitura. Nada foi religado nem alterado.

### Quem drena o `crm_sync_outbox` hoje

**Ninguém, de forma automática.**

| Caminho | Estado medido |
|---|---|
| `pg_cron` | 13 jobs ativos em `cron.job`; nenhum chama `crm-integration`, `processOutbox` ou `claim_crm_sync_outbox`. Nenhuma função do banco cita o worker. Nenhuma migration agenda o worker. |
| `.github/workflows/crm-sync-worker.yml` | `schedule` comentado desde o E02 (2026-09-20). Rodou por `workflow_dispatch` uma única vez (2026-09-09, verde, antes de o outbox ter linhas). Último run agendado: 2026-09-22 (`skipped`). |
| `vars.CRM_SYNC_WORKER_ENABLED` | não existe (lista de variáveis do repositório vazia). |
| Edge `crm-integration`, ação `enqueueSync` | **único consumidor ativo.** Quando alguém clica em sincronizar no CRM 360, a Edge enfileira e processa **só o item daquele contato** (`claim_crm_sync_outbox_by_id`). Não drena o resto da fila. |

### Tamanho e idade do outbox

| Status | Linhas | Mais antiga | Mais recente | Erro |
|---|---:|---|---|---|
| `pending` | 474 | 2026-09-26 17:03 UTC | 2026-10-05 18:26 UTC | — (0 tentativas) |
| `failed` | 6 | 2026-10-06 | 2026-10-07 | `CRM_NOT_SYNCED` (1 tentativa cada) |
| `dead_letter` | 1 | 2026-09-27 | — | `CRM_NOT_SYNCED` (8 tentativas) |

- Total de 481 linhas, todas criadas nos últimos 30 dias. **Nenhuma** foi
  concluída (`completed_at` sempre nulo). `crm_contact_links` tem 0 linhas.
- Idade da entrega pronta mais antiga: cerca de **19 dias** (1.641.893 s). O SLO
  abaixo diz incidente a partir de 60 minutos.
- A fila **não cresce** desde 2026-10-07: 0 linhas criadas nos últimos 7 dias.
  Ela está parada, não acumulando.
- 464 das 481 linhas têm chave `closure:<uuid>` mas `closure_id` nulo, ou seja,
  o encerramento de origem foi apagado depois do enfileiramento (`ON DELETE SET
  NULL`). Elas ainda guardam `contact_id`, então o worker as processaria.
- O kill switch `feature_flags.crm.integration` está `true` e o trigger
  `trg_enqueue_crm_sync_from_closure` está habilitado.
- As 7 tentativas reais (failed e dead_letter) falharam todas com
  `CRM_NOT_SYNCED`. Antes de drenar 474 itens, entender esse erro: se ele se
  repetir, o worker empurra a fila inteira para `dead_letter` em 8 rodadas.

### O workflow é operação manual

Até o dono decidir, `crm-sync-worker.yml` serve só para disparo manual (lote de
1 a 10). Não existe drenagem automática para alguém supor que está rodando.

### Como religar o schedule, se o dono decidir

A decisão é do Joaquim. Nenhum agente religa por conta própria.

1. **Antes de religar:** entender o `CRM_NOT_SYNCED` das 7 tentativas e
   cumprir o passo 6 da Fase 2 (reconciliar o acumulado, com a unicidade externa
   por `p_zapp_conversation_id` provada).
2. Disparar o `CRM Sync Worker` manualmente com `batch_size=1` e aprovar no
   environment `producao-edge-functions`. O run precisa sair verde com
   `CRM health: external=ok, queue=ok` e `CRM outbox: processados=1, falhas=0`.
3. Criar a variável de repositório `CRM_SYNC_WORKER_ENABLED=true`
   (Settings → Secrets and variables → Actions → Variables).
4. No YAML, descomentar o bloco `schedule:` com uma cadência compatível com a
   fila e fora do minuto 0, por exemplo `2-57/5 * * * *`. Com lote de até 10
   por run e 474 pendentes, a cada 5 minutos a fila esvazia em cerca de 4 horas. Atualizar o bloco `# docs:` (o `gatilho`)
   e rodar `node scripts/ci/render-workflow-docs.mjs`.
5. **Atenção ao environment:** o job usa `environment: producao-edge-functions`.
   Se esse environment tiver revisor obrigatório, todo run agendado vai pausar
   em `Waiting`. Antes de religar, ou o environment fica sem revisor, ou o
   worker passa para um job do `pg_cron` que chame a Edge, no padrão do
   `multiplix-send-trigger`. Isso exige migration nova, que segue o fluxo da
   seção 0 do `CLAUDE.md`.
6. **Como verificar:** nas 24 horas seguintes, o `get_crm_sync_health()`
   precisa mostrar `pending` caindo, `oldest_ready_age_seconds` abaixo de 900,
   `dead_letter` e `succeeded_without_link` iguais a 0. Para conferir só com
   leitura:

   ```sql
   SELECT status, count(*), min(created_at)
   FROM public.crm_sync_outbox GROUP BY status;
   ```

## SLO e resposta a incidentes

- Disponibilidade mensal do gateway: 99,9%.
- Idade da entrega pronta mais antiga: alerta com 15 minutos, incidente com 60.
- `dead_letter > 0` ou `succeeded_without_link > 0`: incidente e bloqueio de
  novas mudanças na integração até triagem.
- Nunca reprocessar por INSERT/UPDATE manual. Corrigir a causa e usar o worker,
  preservando a chave idempotente.
