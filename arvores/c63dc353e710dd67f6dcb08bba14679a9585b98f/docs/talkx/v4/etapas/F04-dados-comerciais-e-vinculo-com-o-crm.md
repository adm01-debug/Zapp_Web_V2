# Fase 4 — Dados comerciais e vínculo com o CRM (X036–X041)

> Parte do [plano V4 de 200 etapas](../../PLANO_TALKX_V4_200_ETAPAS_2026-10-01.md). Telas: dados. 6 etapas.
>
> **Entrega da fase:** Contatos do ZAPP ligados aos clientes do CRM, atributos comerciais num lugar só (empresa, cidade, vendedor, estágio, última compra, ticket médio, RFM) e vendas do Bitrix24 virando resultado de campanha.

Cada etapa é uma PR. **Exige antes** lista as etapas que precisam estar na `main` (e, quando há banco ou edge, aplicadas e implantadas). Os IDs `T<tela>-<seq>` em **Fecha** são elementos do [inventário](../inventario/README.md); `CAP-nnn` são capacidades do motor ([inventário do motor](../inventario/H_motor_backend.md)); `dados:<atributo>` são colunas da projeção de dados comerciais; `N<nn>` são [decisões de negócio](../DECISOES.md).

## Abreviações e convenções usadas nesta fase

**Trilha de dados, links, relatório, importação e ajuda** (etapas X036, X037, X038, X039, X040, X041)

28 etapas, na ordem de execução. Base: `main` @ `3d09433` (2026-10-01).

- **CRM 360 = banco `pgxfvjmuubtbowutlide`, sempre somente leitura**, pela edge `crm-integration`. Bitrix24 só leitura, pela edge
  `bitrix-api`. Nenhuma etapa escreve no CRM nem no Bitrix; `sync_contacts` (`bitrix-api/index.ts:137-175`) não é chamada nem alterada.
- **Migration:** versão reservada por `supabase_migrations.reserve_migration_version` (> `20260930530000`); arquivo → PR → merge →
  apply + ledger no mesmo `db_query` → `schema-catalog.json`, `types.ts`, `known-violations.json`.
- **Edge só vale depois de `deploy-functions.yml` disparado e aprovado.** Etapa com "Deploy de edge: sim" só fecha com o deploy confirmado.
- **Um único job no pg_cron para os dados desta trilha** (`talkx-data-jobs`, a cada 5 min, criado em X036). Os demais jobs são linhas em
  `talkx_data_jobs`, disparadas por `talkx_run_data_jobs()`. Motivo: o pg_cron já falha com `job startup timeout`; não somar jobs.
- **E2E não grava em produção:** os testes Playwright desta trilha interceptam as RPCs; a lógica real é provada por teste SQL
  (Postgres descartável) e teste Deno.
- **Chaves `dados:*` entregues** (para os outros blocos citarem): `vinculo_crm`, `vendedor`, `regiao`, `uf`, `cidade`, `empresa`, `ramo`,
  `pessoa_juridica`, `estagio_funil`, `status_cliente`, `score`, `genero`, `aniversario`, `ultima_interacao`, `compras`, `ultima_compra`,
  `ticket_medio`, `total_pedidos`, `valor_total`, `rfm_segmento`, `rfm_recencia`, `rfm_frequencia`, `rfm_monetario`, `origem_lead`,
  `cobertura`.

---

## Etapas

### X036 · Vincular em lote contatos do ZAPP ao CRM 360 por telefone, com trilha e divergências

- **Fase:** 4 · **Tela:** dados · **Camada:** banco + edge + cron · **DDL:** sim · **Deploy de edge:** sim
- **Exige antes:** nenhuma etapa
- **Fecha:** CAP-092, `dados:vinculo_crm`
- **Hoje:** `crm_contact_links` tem 0 linhas. A única escrita é `upsert_crm_contact_link_guarded` dentro de `processRows`, ao encerrar conversa (`supabase/functions/crm-integration/index.ts:218-223`), com `link_source` fixo `'sync_result'` (`supabase/migrations/20260909120000_validate_crm_outbox_acl_and_atomic_merge.sql:254-260`). O CHECK só aceita `phone_lookup|manual|sync_result` (`20260908180000_crm_contact_links_and_sync_outbox.sql:11-12`). Credencial de cron só pode `health` e `processOutbox` (`crm-integration/index.ts:146-148`).
- **Fazer:** Migration: (1) `talkx_data_jobs` (job, intervalo, último início, habilitado) e `talkx_data_sync_runs` (job, gatilho, início/fim, lidos, alterados, ignorados, falhas, `error_code`, `cursor`), usadas por todos os jobs da trilha; (2) `talkx_crm_link_issues` (contato, tipo `ambiguous|external_taken|identity_mismatch`, candidatos, resolução, quem/quando); (3) CHECK de `link_source` ampliado com `bulk_phone` e `import`; (4) RPCs só `service_role`: `talkx_crm_link_candidates(p_after, p_limit)` (contatos visíveis — `deleted_at IS NULL`, `is_lid_legacy=false`, telefone `^[0-9]{10,15}$` — sem vínculo e sem divergência aberta, paginação por chave) e `talkx_crm_link_apply_batch(p_run, p_links)` (grava o vínculo; `23505` vira linha em `talkx_crm_link_issues`, não exceção); (5) `talkx_run_data_jobs()` + job pg_cron `talkx-data-jobs` (5 min, `x-cron-secret` próprio lido do Vault, `timeout_milliseconds`). Edge `crm-integration`: ação `linkBatch` (cron com `TALKX_DATA_CRON_SECRET` ou admin): até 100 candidatos por chamada, variantes do telefone (com/sem 55, com/sem nono dígito), consulta `contact_phones` → `contacts` no CRM; 1 correspondência = vínculo, 2 ou mais = divergência `ambiguous`, 0 = contado como não encontrado; orçamento de 20 s e cursor para continuar. RLS das 3 tabelas: leitura só admin/supervisor. Ajustar `crm-integration/index.test.ts` (o teste "cron credential is scoped to worker and health actions" passa a listar a ação nova).
- **Aceite:** Teste Deno com CRM simulado (1 correspondência, 1 ambíguo, 1 inexistente) → 1 vínculo `bulk_phone`, 1 divergência, contadores do run somam 3. `scripts/db-audit/talkx-crm-link-batch.test.sh`: segunda execução vincula 0; conflito de unicidade vira divergência. Em produção, depois do backlog: `SELECT count(*) FROM crm_contact_links` > 0 e, no último run, `changed + skipped + failed = scanned`.
- **V3:** V88 (troca `talkx_crm_links` + Bitrix por `crm_contact_links` + CRM 360)
- **Negócio:** Os contatos do WhatsApp passam a estar ligados aos clientes do CRM sem ninguém vincular um por um; os casos duvidosos ficam numa lista para revisar.

### X037 · Criar a projeção `talkx_contact_attributes` com RLS e os atributos de fonte local

- **Fase:** 4 · **Tela:** dados · **Camada:** banco + cron · **DDL:** sim · **Deploy de edge:** não
- **Exige antes:** X036
- **Fecha:** CAP-092, CAP-093, `dados:vendedor`, `dados:regiao`, `dados:uf` (pelo DDD), `dados:estagio_funil` (funil local), `dados:ultima_interacao`
- **Hoje:** A tabela não existe (`grep -c talkx_contact_attributes supabase/schema-catalog.json` = 0). O construtor de segmentos só filtra 14 colunas de `contacts` (`src/hooks/integrations/useTalkXSegments.ts:14-79`); `city`, `state`, `company`, `lead_score` estão vazias em produção. Região por DDD existe só no navegador (`src/components/contacts/getRegionFromPhone.ts:2-33`).
- **Fazer:** Migration cria `talkx_contact_attributes` (PK `contact_id` → `contacts`, `ON DELETE CASCADE`) com: `company_name`, `company_segment` (ramo), `is_company` (pessoa jurídica), `city`, `state` (UF), `region`, `salesperson_name`, `salesperson_profile_id`, `funnel_stage`, `customer_status`, `last_purchase_at`, `avg_ticket`, `orders_count`, `total_spent`, `rfm_recency_days`, `rfm_frequency`, `rfm_monetary`, `rfm_segment`, `score`, `gender`, `birth_date` (+ `birth_month`/`birth_day` gerados), `last_message_at`, `sources` jsonb (por atributo: origem `crm360|bitrix24|local|ddd|import` e data), `crm_synced_at`, `purchases_synced_at`, `updated_at`. Índices nas colunas de filtro. RLS: SELECT para `authenticated` quando `is_admin_or_supervisor(auth.uid())` ou `is_contact_visible_to_user(contact_id, auth.uid())`; nenhum INSERT/UPDATE/DELETE para `authenticated`; `anon` sem grant. Função `talkx_refresh_local_attributes(p_limit)` (linha em `talkx_data_jobs`, de hora em hora) preenche o que já tem fonte local: vendedor (`contacts.assigned_to` → `profiles.name`), UF e região pelo DDD (tabela `talkx_ddd_regions`, portada de `getRegionFromPhone.ts`, origem `ddd`), estágio do funil local (`sales_deals.stage_id` → `sales_pipeline_stages.name`) e última mensagem (`max(messages.created_at)` por contato).
- **Aceite:** `scripts/db-audit/talkx-contact-attributes.test.sh`: agente só lê linhas de contatos visíveis; `INSERT` por `authenticated` → 42501; `anon` sem grant; após a função em fixture de 5 contatos, vendedor/UF/região iguais ao esperado. `supabase-usage-guard.mjs` com `novas: 0`. Em produção: `SELECT count(*) FILTER (WHERE salesperson_name IS NOT NULL) FROM talkx_contact_attributes` ≈ 2.787.
- **V3:** V89 (projeção local em vez de `talkx_crm_links` + cache)
- **Negócio:** Passa a existir um lugar único com os dados comerciais de cada contato; vendedor responsável e região já aparecem preenchidos.

### X038 · Atualizar a projeção com dados do CRM 360 por job em lotes, com limite e métricas

- **Fase:** 4 · **Tela:** dados · **Camada:** edge + banco + cron · **DDL:** sim · **Deploy de edge:** sim
- **Exige antes:** X036, X037
- **Fecha:** CAP-092, CAP-093, `dados:empresa`, `dados:ramo`, `dados:pessoa_juridica`, `dados:cidade`, `dados:uf` (do CRM), `dados:status_cliente`, `dados:estagio_funil` (do CRM), `dados:score`, `dados:genero`, `dados:aniversario`
- **Hoje:** `contactLookupBatch` exige usuário logado e devolve só dados de empresa por telefone, 100 por chamada (`crm-integration/index.ts:271-299`); `select` no CRM exige admin (`:311-322`). O resultado fica só em cache do navegador (`src/hooks/crm/useExternalContact360Batch.ts:17-26,43-49`); nada grava dado comercial no ZAPP.
- **Fazer:** RPCs só `service_role`: `talkx_attributes_next_batch(p_limit)` (vínculos com `crm_synced_at` mais antigo ou nulo) e `talkx_upsert_contact_attributes_batch(p_rows)`. Ação `attributesBatch` em `crm-integration` (cron dedicado ou admin): lê no CRM `contacts` (`sexo`, `data_nascimento`, `relationship_stage`, `relationship_score`, `source`), `companies` (nome, `ramo_atividade`, CNPJ presente), `customers` (`vendedor_nome`, `cliente_ativado`, `ticket_medio`, `data_ultima_compra`, `valor_total_compras`, total de pedidos) e `company_addresses` (cidade, UF) e grava a projeção. Precedência: vendedor local vence o do CRM; cidade/UF do CRM vencem o DDD; valores de compra do CRM só entram quando não há compra local (X039) e ficam marcados `crm360` em `sources`; o RFM do CRM (parado desde 12/04) não é copiado. Limites: 100 por lote, 20 s por invocação, 2.000 contatos por execução, cada contato revisto a cada 24 h. Timeout do CRM encerra o lote sem apagar valor existente. Cada execução grava `talkx_data_sync_runs`.
- **Aceite:** Teste Deno com CRM simulado: 3 vínculos → 3 linhas com os campos e `sources` esperados; CRM em timeout → run com `error_code='CRM_TIMEOUT'` e projeção intacta; cron chamando `select`/`mutate` continua 403. Em produção após um ciclo: `SELECT count(*) FILTER (WHERE crm_synced_at IS NOT NULL) FROM talkx_contact_attributes` = `SELECT count(*) FROM crm_contact_links`, e último run com `failed = 0`.
- **V3:** V89
- **Negócio:** Empresa, cidade, UF, situação do cliente, estágio, score, gênero e aniversário passam a ser atualizados sozinhos todo dia, prontos para filtrar campanhas.

### X039 · Trazer negócios ganhos do Bitrix24 para `contact_purchases` em modo somente leitura

- **Fase:** 4 · **Tela:** dados · **Camada:** banco + edge + cron · **DDL:** sim · **Deploy de edge:** sim
- **Exige antes:** X036
- **Fecha:** CAP-093, `dados:compras`
- **Hoje:** `contact_purchases` tem 0 linhas e nenhuma chave de origem (colunas em `supabase/schema-catalog.json`: sem `source`/`external_id`). `bitrix-api` exige JWT de admin/supervisor (`supabase/functions/bitrix-api/index.ts:28-43,74-79`), `list` não pagina (`:91-94`) e `sync_contacts` sobrescreve nome, e-mail e empresa em `contacts` (`:137-175`). No CRM, `customer_purchases` tem 0 linhas e só 2 clientes têm última compra.
- **Fazer:** Migration: `contact_purchases` ganha `source` e `external_id` com índice único `(source, external_id)`; RPC `talkx_upsert_purchases_batch(p_rows)` só `service_role`. Edge `bitrix-api`: ação `pull_won_deals`, aceita só `x-cron-secret` dedicado ou admin; chama apenas `crm.deal.list` (negócios com etapa de sucesso, paginação por `start`, ordenado por `DATE_MODIFY`, marca d'água em `talkx_data_sync_runs.cursor`) e `crm.contact.list` (telefones dos `CONTACT_ID`); casa o telefone normalizado com `contacts.phone` (critério de contato visível) e grava título, valor, moeda, data de fechamento, `source='bitrix24'`, `external_id` = ID do negócio. Negócio sem contato correspondente é contado em `skipped`; não cria contato. Linha em `talkx_data_jobs` (a cada 60 min, 500 negócios por execução). Sem `BITRIX_WEBHOOK_URL`: run com `error_code='bitrix_not_configured'`, sem 500.
- **Aceite:** Teste Deno com `fetch` simulado: 2 páginas de negócios → N compras; reexecução → 0 novas; negócio alterado → valor atualizado; asserção de que só `crm.deal.list` e `crm.contact.list` foram chamados. Em produção: `SELECT count(*), max(purchased_at) FROM contact_purchases WHERE source='bitrix24'` e conferência de 3 negócios contra o Bitrix24.
- **V3:** V90 (troca o webhook `ONCRMDEALUPDATE` por leitura agendada)
- **Negócio:** As vendas fechadas no Bitrix24 passam a aparecer no ZAPP ligadas ao contato, sem risco de sobrescrever cadastro.

### X040 · Calcular recência, frequência, valor e segmento RFM a partir das compras locais

- **Fase:** 4 · **Tela:** dados · **Camada:** banco + cron · **DDL:** sim · **Deploy de edge:** não
- **Exige antes:** X037, X039
- **Fecha:** CAP-093, `dados:ultima_compra`, `dados:ticket_medio`, `dados:total_pedidos`, `dados:valor_total`, `dados:rfm_segmento`, `dados:rfm_recencia`, `dados:rfm_frequencia`, `dados:rfm_monetario`
- **Hoje:** Não há cálculo local. O RFM vem do CRM (`company_rfm_scores`: 48.614 de 48.615 "Hibernating", calculado em 2026-04-12) e só aparece como selo (`src/components/talkx/TalkXContactSelector.tsx:24-37`).
- **Fazer:** Função `talkx_recompute_purchase_metrics(p_limit)` (SQL; linha em `talkx_data_jobs`: 1×/dia e após `pull_won_deals` com alterações). Por contato com compra: `last_purchase_at`, `orders_count`, `total_spent`, `avg_ticket`, `rfm_recency_days`, `rfm_frequency`, `rfm_monetary`. Notas R/F/M de 1 a 5 por faixas em `talkx_settings.rfm_bands` (recência 30/90/180/365 dias; frequência 1, 2, 3–4, 5–9, 10+; valor por faixas configuráveis); com 100 ou mais compradores, valor por quintis. Segmento por tabela de decisão versionada na migration: Campeões, Leais, Em potencial, Novos, Em risco, Hibernando, Perdidos. Contato sem compra fica com os campos nulos — não vira "Hibernando". Fuso `America/Sao_Paulo`.
- **Aceite:** `scripts/db-audit/talkx-rfm.test.sh`: 12 contatos com compras conhecidas e segmento esperado calculado à parte; contato sem compra → `rfm_segment IS NULL`; reexecução → `changed = 0`.
- **V3:** —
- **Negócio:** "Última compra", "ticket médio" e "Campeões / Em risco" passam a refletir as vendas reais de hoje, não um cálculo parado desde abril.

### X041 · Registrar negócio ganho como conversão na janela de atribuição; receita e ROI

- **Fase:** 4 · **Tela:** motor, 14, 07 · **Camada:** banco + cron · **DDL:** sim · **Deploy de edge:** não
- **Exige antes:** X021, X028, X039
- **Fecha:** CAP-065 (conversão automática), CAP-068
- **Dependências, em detalhe:** X039 (`dados:compras`), X021 ; CAP-016 (`sent_at`/entregues, trilha do motor)
- **Hoje:** Nenhuma rotina liga compra a campanha e nenhuma função soma `talkx_conversions.value` (`grep -rln "talkx_conversions" supabase/migrations` só devolve criação, índices e grants). `talkx_settings` não tem janela de atribuição.
- **Fazer:** Função `talkx_attribute_purchases(p_since)` (SQL; linha em `talkx_data_jobs`, logo após `pull_won_deals`): para cada compra `source='bitrix24'` ainda não atribuída, procura o envio mais recente ao mesmo contato (`talkx_recipients.sent_at`) anterior à compra e dentro de `talkx_settings.attribution_window_days` (padrão 30) — último toque: uma compra conta para uma campanha — e grava por `record_talkx_conversion` com `source='deal'`, `external_ref` = `external_id` da compra, valor da compra. Função `talkx_campaign_revenue(p_campaign)` (INVOKER): conversões, receita, investimento e ROI = (receita − investimento) / investimento, nulo sem investimento > 0. Seed validado das chaves `attribution_window_days` e `conversion_max_value` em `talkx_settings` (ajustar `scripts/db-audit/talkx-settings-replay-idempotent.test.sh`).
- **Aceite:** `scripts/db-audit/talkx-attribution.test.sh`: compra 5 dias após o envio → 1 conversão na campanha certa; compra 40 dias depois → nenhuma; dois envios antes da compra → vai para o mais recente; reexecução → 0 novas; `talkx_campaign_revenue` devolve ROI nulo sem investimento e 2.694% para receita 8.940 e investimento 320.
- **V3:** V90, V39
- **Negócio:** Venda fechada no Bitrix24 até 30 dias depois da mensagem entra sozinha como resultado da campanha, e o ROI é calculado a partir do investimento informado.
