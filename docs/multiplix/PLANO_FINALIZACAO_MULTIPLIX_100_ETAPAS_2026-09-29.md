# PLANO DE FINALIZAÇÃO — MULTIPLIX (ZAPP Web V2) · 100 etapas

**Repo:** `adm01-debug/Zapp_Web_V2` · **Data:** 29/09/2026 · **Base:** `main` @ `a0002bb`
**Sucede:** `PLANO_IMPLEMENTACAO_MULTIPLIX_200_ETAPAS_2026-09-26.md` (11/200 feitas, 74 parciais — ver `AUDITORIA_IMPLEMENTACAO_MULTIPLIX_2026-09-29.md`, que é a origem de cada etapa abaixo).

## Por que 100 e não "as 189 que faltam"

O plano de 26/09 foi escrito antes de existir código. Hoje existe um MVP em produção (nunca usado) com 12 achados de segurança e 18 de correção. Este plano:

1. **Começa pelo que já está no ar** (bloco A): tudo que um staff logado consegue fazer hoje de errado — mandar para qualquer número, editar template durante o envio, mexer no disparo do colega, ignorar quem pediu "PARE" — fecha antes de construir qualquer tela nova.
2. **Agrupa o que o plano anterior espalhava** (ex.: 16 etapas de voz viram 6; 14 de painel de público viram 3) porque agora se sabe o que dá para fazer numa PR só.
3. **Mantém os mesmos portões e a mesma disciplina:** uma fase = uma ou mais branches `claude/<tipo>-multiplix-<slug>-<AAMMDD-HHMM>`; 🔒 PARA = decisão do Joaquim (DDL em produção, custo, dado de terceiro); ⚠️ BLOQUEANTE = trava a fase seguinte; marque `[x]` só com evidência.

Regras que não mudam: DDL do ZAPP segue `CLAUDE.md` §1 (arquivo → PR → merge → `db_query` + ledger na mesma transação → guard verde). DDL do Singu é sempre 🔒 e fica documentada em `supabase/migrations/_foreign/singu/`. Edge function só entra em produção por `deploy-functions.yml` + aprovação. Zero hex, zero fonte nova, só `src/components/ui/`.

---

## BLOCO A — Saneamento do que está em produção (F01–F20)
**Objetivo:** nenhum achado de segurança aberto; o MVP atual passa a ser seguro de ligar. Nada aqui depende de decisão nova (só o DDL pede aprovação de PR).

- [x] **F01** · 🔒 Revogar todos os grants de `anon` em `multiplix_dispatches`, `multiplix_recipients`, `multiplix_blocks`; `authenticated` fica só com o mínimo que as policies usam (SELECT/INSERT/UPDATE/DELETE, nunca TRUNCATE/REFERENCES/TRIGGER). Regenerar `scripts/db-audit/grants-baseline.json`. **Feito quando:** `grants-baseline` sem `multiplix_*` em `anon`; `db-guard` verde. — **evidencia:** auditoria do Claude 01/10 (banco vivo): 0 grants anon nas tabelas multiplix + `scripts/db-audit/multiplix-rls.test.sh` no `db-guard.yml:378`
- [x] **F02** · 🔒 `ALTER TABLE ... FORCE ROW LEVEL SECURITY` nas 3 tabelas. **Feito quando:** `relforcerowsecurity = true` nas 3 ao vivo. — **evidencia:** FORCE RLS nas 3 tabelas (banco vivo, auditoria 01/10) + assercao "FORCE RLS ligado" no multiplix-rls.test.sh
- [x] **F03** · 🔒 Policies de `multiplix_blocks` recriadas com `TO authenticated` + `is_admin_or_supervisor` + só em `dispatch.status = 'draft'` para escrita. **Feito quando:** `pg_policy.polroles` sem `public` no módulo. — **evidencia:** policies TO authenticated no replay limpo (multiplix-rls.test.sh, caso F04) + controles positivos por papel
- [x] **F04** · 🔒 Migration consolidadora das policies de `dispatches`/`recipients`: recria as 9 com `TO authenticated` de forma que um replay limpo dê o mesmo estado que o banco vivo (hoje `20260927210000` desfaz o `TO` da `20260927130001`). Nota no cabeçalho da `130001` explicando que o "preserving exact USING" não era verdade. **Feito quando:** `check-migration-drift` + replay em banco de teste = estado vivo. — **evidencia:** multiplix-rls.test.sh: `0` policies com `public` em `pg_policies` apos o replay
- [x] **F05** · 🔒 Trigger `enforce_multiplix_dispatch_mutability` (padrão de `enforce_talkx_campaign_mutability`): `status`, `sent_count`, `failed_count`, `delivered_count`, `outcome_unknown_count`, `total_recipients`, `started_at/paused_at/completed_at` só mudam via `service_role`; `message_template`, `media_*`, `audience_filters`, `whatsapp_connection_id`, `scheduled_at` só em `draft`. Em `recipients`: `authenticated` só pode DELETE em `draft` — nada de UPDATE (não há caso de uso legítimo). **Feito quando:** teste negativo (F20) prova que `UPDATE multiplix_dispatches SET status='sending'` por staff falha. — **evidencia:** `20260929590000_multiplix_mutability_guard.sql` + `20260930300000_multiplix_guards_fail_closed.sql`; no multiplix-rls.test.sh o teste negativo prova que UPDATE de status por staff falha
- [x] **F06** · `multiplix-send`: start/pause/cancel exigem `created_by = profile do JWT` **ou** permissão `multiplix.dispatch.manage_all` (nova no catálogo, atribuída a `admin`). Service-role/cron continuam sem restrição. **Feito quando:** supervisor B recebe 403 no dispatch do supervisor A; teste em `index.test.ts`. — **evidencia:** CORRIGIDO no PR do Bloco A (01/10): o bug era `hasManageAll` avaliado SO quando `is_admin_or_supervisor` era falso. Agora a permissao e sempre avaliada e o gate e papel OU permissao. `multiplix-send/index.test.ts` (36/36): caso novo "admin COM manage_all inicia disparo de OUTRO dono -> permitido"; mutacao M2 mata o caso da permissao sem papel
- [x] **F07** · Trocar `.in('role',[admin,supervisor]).maybeSingle()` por `rpc('is_admin_or_supervisor')` (mesma função que as policies usam). **Feito quando:** usuário com as duas roles passa; teste. — **evidencia:** `multiplix-send/index.ts:111-113` usa `rpc(is_admin_or_supervisor)`; `index.test.ts` cobre "JWT com admin E supervisor passa" (regressao do maybeSingle)
- [x] **F08** · Destinatário nunca vem do navegador: nova RPC `multiplix_create_draft(p_name, p_template, p_company_ids[], p_client_request_id)` **chamada pela edge `multiplix-audience`** (que já tem o escopo do JWT): re-resolve os IDs no Singu com o escopo real, descarta `elegibilidade <> 'apto'`, insere dispatch + recipients numa transação, idempotente por `client_request_id`. O front deixa de fazer INSERT direto (policies de INSERT em `recipients` para `authenticated` são revogadas). **Feito quando:** POST com `destino_e164` forjado no body é ignorado; 2 POSTs iguais = 1 dispatch; falha no meio = 0 linhas. — **evidencia:** `20260929630000_multiplix_create_draft.sql` + `20260929850000_multiplix_revoke_recipient_writes.sql` (INSERT direto por authenticated revogado)
- [x] **F09** · Supressão: `talkx_recipient_is_suppressed(contact_id, phone)` no claim **e** imediatamente antes do POST (mesma dupla do `talkx-send`); resultado `skipped` com motivo "Contato na lista negra (opt-out)". Remover os comentários "sem lista de supressão" em `multiplix-send/index.ts:5-6` e `20260926180000:9-11`. **Feito quando:** número em `talkx_blacklist` não recebe; teste com mock da RPC. — **evidencia:** `talkx_recipient_is_suppressed` no claim; teste "F09: destinatario na lista negra vira skipped" em `index.test.ts`
- [x] **F10** · Agendamento e retomada no cron: `trigger_pending_multiplix_dispatches` (a) promove `scheduled` com `scheduled_at <= now()` via `transition_multiplix_dispatch(start)`; (b) retoma `paused` com `pause_reason = 'outside_window'` quando a janela (`send_window_*`, `schedule_timezone`) volta a abrir; (c) worker grava `pause_reason='outside_window'` ao auto-pausar. Front: "Iniciar" some para `scheduled`. **Feito quando:** dispatch agendado para +3 min sai sozinho; pausado por janela retoma no dia seguinte sem clique. — **evidencia:** `20260929610000_multiplix_cron_window_and_limits.sql` (janela + pausa/retomada) e `20260929600000_multiplix_send_engine_fixes.sql`
- [x] **F11** · Item preso: (a) worker processa **lote** (`MULTIPLIX_BATCH_SIZE`, default 20) por invocação e devolve — o cron reinvoca; nunca mais o público inteiro numa edge; (b) RPC `sweep_multiplix_stuck_recipients()`: `status='sending'` com `delivery_claim_expires_at < now()` e `provider_dispatch_started_at IS NOT NULL` → `outcome_unknown` (nunca `pending`); chamada pelo cron antes do fan-out. **Feito quando:** simulação (kill da edge após `mark_dispatch_started`) termina em `outcome_unknown` em ≤ 4 min e o dispatch conclui. — **evidencia:** F11b (sweep) ja estava: `sweep_multiplix_stuck_recipients` chamado no topo do cron. F11a FECHADO no PR do Bloco A: o `passLoop: for(;;)` virou UMA passada por invocacao (lote `MULTIPLIX_BATCH_SIZE`, default 20) — testes reescritos provam 1 lote por request e a mutacao M1 (dreno de volta) mata os 3 casos
- [x] **F12** · `claim_multiplix_recipient` honra `retry_after` (`AND (retry_after IS NULL OR retry_after <= now())`). **Feito quando:** teste de fila (F57) com 2 workers não pega item em backoff. — **evidencia:** `claim_multiplix_recipient` honra `retry_after`; casos de fila no multiplix-rls.test.sh
- [x] **F13** · `complete_multiplix_dispatch_if_drained` → `completed_with_failures` quando `failed_count + outcome_unknown_count > 0`; CHECK de status e `DISPATCH_STATUS` do front atualizados. **Feito quando:** parcial nunca aparece como "Concluído". — **evidencia:** `complete_multiplix_dispatch_if_drained` com `completed_with_failures`; casos de parcial no multiplix-rls.test.sh
- [x] **F14** · `transition_multiplix_dispatch(cancel)` marca `pending` e `sending` sem `provider_dispatch_started_at` como `cancelled` (novo valor de status de recipient) e grava evento explícito; itens enviados intocados. **Feito quando:** cancelar deixa 0 `pending`. — **evidencia:** `transition_multiplix_dispatch(cancel)` marca pending/sending sem POST como cancelled; caso de cancel no multiplix-rls.test.sh
- [x] **F15** · 🔒 Realtime: `ALTER PUBLICATION ... SET TABLE multiplix_dispatches (id, name, status, total_recipients, sent_count, failed_count, delivered_count, outcome_unknown_count, started_at, paused_at, completed_at, updated_at)` — sem `message_template`/`audience_filters`. Regenerar `realtime-publication-baseline.json`. **Feito quando:** `pg_publication_tables.attnames` sem as 2 colunas. — **evidencia:** `20260929620000_multiplix_realtime_column_scope.sql` — auditoria 01/10 confirma realtime sem `message_template`/`audience_filters`
- [x] **F16** · `elevenlabs-tts/index.ts:26`: log sem trecho do roteiro (só tamanho, voz, modelo). **Feito quando:** grep por `slice(0, 50)`/`substring` no log vazio. — **evidencia:** `elevenlabs-tts/index.ts` loga so tamanho/voz/modelo; deployado
- [x] **F17** · Ritmo e teto (ADR-007 D2): chave `talkx_settings.multiplix_max_recipients_default = 200` (acima exige confirmação explícita na criação — RPC de F08 rejeita sem `p_confirm_over_limit`); cron dispara **1 dispatch por `whatsapp_connection_id` por tick** (hoje até 10 na mesma conexão); worker respeita `daily_limit_per_connection` somando `talkx_recipients` + `multiplix_recipients` enviados no dia; URL do projeto via `current_setting('app.settings.supabase_url')`/vault em vez de literal; Bearer = service-role do vault (não a anon key). **Feito quando:** 2 dispatches na mesma conexão rodam em série; 501º envio do dia é adiado com motivo. — **evidencia:** FECHADO no PR do Bloco A, menos o Bearer (ver nota): F17b `20260930560000_f17b_f17c_conexao_unica_e_cota.sql` impede duas linhas `sending` na mesma conexao (NULL como coringa, porque o worker resolve NULL para "primeira conectada"); F17c retoma `pause_reason=daily_limit` so com `multiplix_connection_daily_usage()>0` E janela aberta. Tetos (`multiplix_max_recipients_default=200`) e URL via vault ja estavam. BEARER: decisao registrada (20261001-101433-cd34) — o vault TEM service-role (`sicoob_service_role_key`), o comentario anterior estava errado e foi corrigido na migration; o gate real e o `x-cron-secret` validado antes do Bearer. DECISAO DO JOAQUIM (20261001-101433-cd34) = **A**: o Bearer anon fica como esta; o gate real documentado e o `x-cron-secret`. F17 FECHADA.
- [ ] **F18** · Verificar ao vivo o drift documentado em `20260926180000` (`SELECT statements FROM supabase_migrations.schema_migrations WHERE version='20260926180000'` × `register-migration.mjs` dry-run do arquivo); reconciliar pelo lado errado; `db-live-guard` verde. **Feito quando:** último run do `db-live-guard.yml` em `main` verde e issue `db-live-guard` fechada. — **progresso:** NOTA (01/10): a premissa da etapa esta REFUTADA. Medi `20260926180000` (dry-run do register-migration x ledger) = IDENTICO, 34 statements. O drift real do db-live-guard e: (a) `20260930390000` arquivo x ledger (o arquivo usa DELETE FROM cron.job, que nao executa: 42501) -> entrada `ledger-divergence/pinned-replay` adicionada em `scripts/db-audit/migration-evidence.json` neste PR; (b) `schema-catalog.json`, `schema-manifest.json`, `grants-baseline.json` defasados -> regenerados pelo workflow `types-sync`, que dispara com push em main tocando `supabase/migrations/**` (ou seja, no merge deste PR); (c) `O_TYPES` caiu por timeout de infraestrutura, nao por drift. Falta: mergear o PR do types-sync e ver o run verde
- [x] **F19** · ADR-007: `ADR-007-multiplix-ponte-singu.md` ganha status **Superseded by** `ADR-007-multiplix-ponte-singu-canal-e-aptidao.md`; a longa registra as 3 decisões finais (secret = `EXTERNAL_SUPABASE_*`; teto 200 + "conexão em risco" valem; telefone de empresa só B2B); as duas entram em `docs/adr/README.md`. **Feito quando:** um único ADR-007 vigente citado pelo plano. — **evidencia:** auditoria 01/10: ADR-007 marcado Superseded by + as duas entradas em `docs/adr/README.md`
- [x] **F20** · ⚠️ `scripts/db-audit/multiplix-rls.test.sh` (padrão de `talkx-delivery-leases.test.sh`): `anon` lê 0 e não trunca; `agent` lê 0; staff lê só o próprio; staff não muda `status` nem `message_template` fora de `draft`; `recipients` sem UPDATE por `authenticated`. Entra no `db-guard.yml`. **Feito quando:** no CI e verde. — **evidencia:** FECHADO no PR do Bloco A: `scripts/db-audit/multiplix-rls.test.sh` ganhou o caso do `agent` (le 0 nas duas tabelas e o TRUNCATE e negado) e o do dono nao-staff (so o proprio; disparo de outro criador = 0), com controles positivos. RESSALVA: "staff le so o proprio" nao e satisfazivel com a RLS vigente — admin/supervisor tem leitura staff-wide por policy (e isso ja e testado positivamente); quem e owner-scoped e o usuario sem papel de staff. Mudar isso e decisao de produto (DDL), nao de teste. DECISAO DO JOAQUIM (20261001-102935-7b92) = **A**: a leitura ampla de admin/supervisor e o desenho vigente e F20 esta satisfeita pelo escopo do dono.

> **Portão A:** F01–F17 mergeadas **e aplicadas** (DDL + deploy das edges); F18 verde; F20 no CI. Sem isso, nenhuma tela nova.

---

## BLOCO B — Ponte Singu auditável (F21–F29)
**Objetivo:** as 5 RPCs que o módulo chama passam a existir no repo, com guard próprio, testadas e medidas.

- [ ] **F21** · 🔒 Versionar as 5 RPCs do Singu (`multiplix_search_audience`, `multiplix_count_audience`, `multiplix_resolve_recipients`, `multiplix_list_ramos`, `multiplix_list_ufs`) em `supabase/migrations/_foreign/singu/` a partir do `pg_get_functiondef` ao vivo (exige sessão com MCP do Singu), com README dizendo que o `db-guard` não as aplica. Corrigir na mesma PR o que a leitura revelar de E016 (`deleted_at IS NULL`, `is_duplicate = false`), E017 ("Não informado" explícito, ordem por frequência), E014 (4 ramos de destino: `contact_phones is_whatsapp AND is_primary` → `contacts.whatsapp` → `company_phones` só B2B → `destino_invalido`). **Feito quando:** arquivos no repo idênticos ao banco (`md5(pg_get_functiondef)` registrado no README).
- [ ] **F22** · 🔒 Guard interno nas RPCs: a edge assina `p_scope` (permissões + e-mail + `exp`) com HMAC-SHA256 usando secret `MULTIPLIX_SCOPE_HMAC_SECRET` (novo, nas edges do ZAPP e no vault do Singu); a RPC recusa assinatura inválida/expirada. Assim a `EXTERNAL_SUPABASE_SERVICE_ROLE_KEY` sozinha (que `crm-integration` também tem) deixa de conceder `admin`. **Feito quando:** chamada direta com a service key e `p_scope_permissions=['multiplix.audience.admin']` sem assinatura → erro.
- [ ] **F23** · Prova de contagem: script `scripts/db-audit/multiplix-audience-parity.mjs` compara `multiplix_count_audience` × query direta para cada filtro isolado (papel×3, ramo, UF, texto) e combinado; `multiplix_count_audience` sem filtro = `companies_ativas`. **Feito quando:** 8 pares iguais registrados em `PONTE_SINGU.md`.
- [ ] **F24** · ⚠️ Teste de escopo com 3 perfis reais (vendedor com carteira, Compras, Logística) + escopo forjado no body ignorado: `scripts/db-audit/multiplix-scope.test.sh`. Pré-requisito: criar no ZAPP 3 contas de teste com as permissões de F25 (hoje só existem admin/agent/CI). **Feito quando:** cada perfil só vê e só **conta** o que a matriz permite; no CI.
- [ ] **F25** · Matriz perfil × papel × escopo em `PERMISSOES.md` + `role_permissions`: `admin` → `multiplix.audience.admin` + `multiplix.dispatch.manage_all`; `supervisor` → `suppliers` + `carriers` + `customers.all` + `multiplix.dispatch.create`; `agent` → `customers.own` + `multiplix.dispatch.create`. Nav e `ViewRouter` por permissão nomeada `multiplix.dispatch.create` (não por `STAFF_ROLES`). **Feito quando:** `agent` sem a permissão não vê nem acessa por URL; migration de seed registrada.
- [ ] **F26** · Cache de 5 min de ramos e UFs na edge (`Map` + TTL por isolate) com header `x-cache: HIT|MISS`. **Feito quando:** segundo request em 5 min não chama o Singu (log).
- [ ] **F27** · `multiplix_resolve_recipients` em lotes de 1.000 (paginação interna na edge, sem teto silencioso — o teto de política de F17 vira erro nomeado); retorno inclui papéis da empresa e `last_interaction_at`. **Feito quando:** 1.000 IDs resolvidos em < 1 s (medido e registrado).
- [ ] **F28** · 🔒 `EXPLAIN ANALYZE` da busca combinada em 57k empresas; índices só se o plano pedir (`companies(is_supplier)`, `(is_carrier)`, `(ramo_atividade)`, `company_addresses(company_id, is_primary)`). **Feito quando:** busca < 500 ms; `EXPLAIN` anexado em `PONTE_SINGU.md`.
- [ ] **F29** · `docs/multiplix/PONTE_SINGU.md` (contrato das 5 RPCs, guard, escopo, cache, medições) + `docs/crm-external-grants.md` atualizado com as RPCs `multiplix_*` e o caminho de fechamento do GATE C (F97). **Feito quando:** mergeado.

> **Portão B:** F22 e F24 verdes; F21 no repo.

---

## BLOCO C — Modelo de dados v2 (F30–F35)
**Todas 🔒 PARA (DDL em produção).** Uma PR só, aplicada no mesmo turno do merge, `types-sync` na sequência.

- [ ] **F30** · Enums `multiplix_dispatch_status`, `multiplix_recipient_status`, `multiplix_item_status`, `multiplix_block_type`, `multiplix_eligibility` — **mantendo os valores em inglês já usados** (`draft, scheduled, sending, paused, completed, completed_with_failures, failed, cancelled`; `pending, sending, sent, delivered, read, failed, skipped, cancelled, outcome_unknown`; `text, voice_ai, audio_recorded, file`; `eligible, no_destination, suppressed, out_of_scope, media_pending, connection_unavailable, requires_template`), convertendo as colunas `text` com `USING`. `src/types/multiplix.ts` gerado a partir deles. **Feito quando:** nenhum CHECK de status em texto solto; `types.ts` expõe os enums.
- [ ] **F31** · `multiplix_dispatches`: `created_by NOT NULL`, `dispatch_version int NOT NULL DEFAULT 1`, `audience_version int NOT NULL DEFAULT 1`, `origin text` (`manual|audience|crm360|contacts`), FK real em `whatsapp_connection_id`, `client_request_id uuid UNIQUE`. `multiplix_recipients`: `singu_contact_id uuid`, `eligibility multiplix_eligibility NOT NULL`, `eligibility_reason text`, `variables_snapshot jsonb`, `audience_version int`, `inclusion_reason text`, **UNIQUE `(dispatch_id, destino_e164)`**. **Feito quando:** 2 contatos com o mesmo número no mesmo dispatch = 1 linha + aviso.
- [ ] **F32** · `multiplix_delivery_items` (recipient × block: `status multiplix_item_status`, `attempt_count`, `next_attempt_at`, `lease_token`, `lease_until`, `worker_id`, `external_id`, `idempotency_key text UNIQUE` = sha256`(dispatch_id, dispatch_version, recipient_id, block_id)`, `error_class`, `error_message`, `sent_at/delivered_at/read_at`); índice parcial `(status, next_attempt_at) WHERE status IN ('pending','failed_transient')`; `(dispatch_id, status)`; `multiplix_dispatches(created_by, created_at DESC)`. As 10 RPCs `*_multiplix_recipient*` ganham equivalentes `*_multiplix_item*` com a mesma assinatura (claim em lote, lease, snapshot, mark, sent, complete, release, reschedule, sweep). **Feito quando:** `EXPLAIN` do claim usa o índice parcial; RPCs antigas marcadas deprecated.
- [ ] **F33** · `multiplix_blocks`: `content jsonb NOT NULL` (texto/roteiro/asset/legenda), `content_version int`, `content_hash text`, `asset_id uuid`, `personalization_mode text` (`same_audio|personalized`), tipos = enum de F30; migrar `template_text/voice_script/media_url/media_caption` para `content`. RPC `reorder_multiplix_blocks(dispatch_id, block_ids[])` atômica. **Feito quando:** sem buraco/duplicata em `(dispatch_id, block_order)` após reordenar; worker (F56) lê a tabela.
- [ ] **F34** · `multiplix_events` append-only (`dispatch_id`, `recipient_id`, `item_id`, `kind`, `payload jsonb`, `correlation_id uuid`, `created_at`); trigger que rejeita UPDATE/DELETE; RLS leitura via dispatch. **Feito quando:** `UPDATE multiplix_events` falha por trigger.
- [ ] **F35** · `multiplix_audiences` (`kind rule|static_list`, `definition jsonb`, `owner_id`, `shared_with_roles text[]`, `last_used_at`, `cached_count`) + `multiplix_audience_members` (`audience_id`, `singu_company_id`, `singu_contact_id`, `added_reason`). RLS: próprias + compartilhadas com a role. **Feito quando:** regra dinâmica e lista estática distinguíveis; F20 estendido às 8 tabelas.

> **Portão C:** PR aprovada pelo Joaquim e aplicada; `types-sync` mergeado; F20 cobre 8 tabelas.

---

## BLOCO D — `_shared/messaging` (F36–F43)
**Objetivo:** `talkx-send` e `multiplix-send` param de ser dois códigos. Diff mínimo em cada um.

- [ ] **F36** · `supabase/functions/_shared/messaging/` (`index.ts`, `types.ts`) com os contratos de personalização, E.164, elegibilidade, mídia, adaptador, classificação de erro, correlação. **Feito quando:** importável pelos dois `*-send`.
- [ ] **F37** · `personalize()` extraído do `talkx-send` (4 built-ins + `{{link}}` + campos customizados, `[variavel]` como fallback, nunca `''` silencioso, `hasOwnProperty`, passe único); `multiplix-send` passa a usá-lo e o teste `index.test.ts:20-23` que consagra `''` é corrigido. **Feito quando:** os 9 testes de `personalize` do TalkX rodam também para o Multiplix.
- [ ] **F38** · E.164 BR extraído de `_shared/evolution-helpers.ts` (`normalizePhone`, `generatePhoneVariants`) sem reescrever; testes de 9º dígito, DDD, inválido. **Feito quando:** `multiplix-send:295` deixa de usar `replace(/\D/g)`.
- [ ] **F39** · `eligibility(recipient, ctx)` → `{class, reason}` cobrindo as 7 classes do enum (`talkx_blacklist`, destino válido, escopo, conexão, mídia, `requires_template` reservado). **Feito quando:** unit cobre as 7.
- [ ] **F40** · `prepareMedia(url)` → tipo real (magic bytes), tamanho, acessibilidade (HEAD), signed URL com TTL do envio, `fileName` obrigatório para documento. **Feito quando:** arquivo expirado ou > limite bloqueia o item com `media_pending`.
- [ ] **F41** · Adaptador Evolution GO: `capabilities()` (texto, imagem, documento, áudio, PTT, limite de caracteres) + `send(item)` que já aplica presença `composing`/`recording` e usa `evolution-go-routes.ts`. **Feito quando:** `talkx-send` e `multiplix-send` chamam o mesmo `send()`.
- [ ] **F42** · `classifyProviderError(status, body)` → `transient | permanent | unknown` + backoff com teto (30 s/2 min/10 min, dead letter na 4ª) aplicado **também** a erro de provedor (hoje só pré-POST); mapa código→texto para operador (E095). **Feito quando:** opt-out e número inexistente nunca reententam; 429/5xx reententam e param.
- [ ] **F43** · ⚠️ Refatorar `talkx-send` **e** `multiplix-send` para consumir `_shared/messaging` (remover as 5 funções duplicadas + loop), `correlation_id` gerado por request e propagado ao log/webhook, logger sem conteúdo. Regressão obrigatória: `e2e/talkx.spec.ts`, unit dos dois `index.test.ts`, `tests/contracts`. **Feito quando:** suíte verde sem snapshot alterado; `diff --stat` do `talkx-send` só remove.

> **Portão D:** F43 verde.

---

## BLOCO E — API de domínio `multiplix-dispatch` (F44–F54)
**Objetivo:** preparar ≠ revisar ≠ confirmar ≠ executar. O front nunca mais fala com as tabelas direto.

- [ ] **F44** · Edge `multiplix-dispatch` (CORS, JWT, escopo do JWT, `correlation_id`): `draft.create` (absorve F08), `draft.get`, `draft.update` (título, conexão, agendamento), `draft.discard`. Front migra `useMultiplixDispatches` para a edge; policies de INSERT/UPDATE de `authenticated` em `dispatches` revogadas. **Feito quando:** rascunho sobrevive a refresh e troca de dispositivo; `types.ts` sem acesso direto do front às tabelas de escrita.
- [ ] **F45** · `blocks.upsert/delete/reorder` (via RPC de F33) + versionamento: editar bloco = `content_version++` e `asset_id = NULL` se roteiro/voz/parâmetro mudaram. **Feito quando:** asset invalidado ao mudar roteiro.
- [ ] **F46** · `audience.select`: `(manual ∪ públicos aplicados) ∩ filtros − exclusões`, tudo no servidor via `multiplix_resolve_recipients`; exclusão manual vence inclusão; modo "contato principal por empresa" (`contact_phones.is_primary`, `contacts.role`) sinalizando quando não há dado. **Feito quando:** reaplicar público não traz de volta um excluído; modo ligado = 1 por empresa quando há dado.
- [ ] **F47** · ⚠️ "Selecionar todos os N resultados" materializa via `count` + `resolve` paginado (F27); o único teto é o de política (F17), sempre nomeado. **Feito quando:** público de 5.001 retorna íntegro ou erro `over_policy_limit` explícito — nunca 500 em silêncio.
- [ ] **F48** · `preview(recipient_id)` → texto final e ativo exato por bloco (mesma função que o worker usa) + `validate` (placeholder desconhecido, variável em bloco `same_audio`, campo ausente → substituição aprovada ou exclusão, nunca inventar). **Feito quando:** preview === payload do worker; erros nomeados.
- [ ] **F49** · `eligibility.summary` → `{total, eligible, no_destination, suppressed, out_of_scope, company_without_person}` + frase legível da consulta ("Fornecedor OU transportadora · SP · ramo Embalagens · excluir lista X") + `inclusion_reason` por linha. **Feito quando:** soma bate com `count(*)` no banco.
- [ ] **F50** · `estimate` → mensagens (aptos × blocos), versões de roteiro (`DISTINCT` dos roteiros finais), caracteres/consumo de voz. **Feito quando:** três números de dado real.
- [ ] **F51** · ⚠️ `confirm`: revalida (F49), congela público e blocos (snapshot em `variables_snapshot`/`content` + `dispatch_version++`), gera `multiplix_delivery_items` **na mesma transação** (RPC), muda para `scheduled`/`sending`; idempotente por `(dispatch_id, dispatch_version)` — 2 POSTs = 1 execução; qualquer alteração depois exige nova revisão (F05 bloqueia). **Feito quando:** falha no meio = 0 itens; 5 cliques = 1 confirmação.
- [ ] **F52** · `status` → agregado, por destinatário, por bloco; `sent ≠ delivered ≠ read ≠ replied` separados. **Feito quando:** 4 estados na resposta.
- [ ] **F53** · Rate limit por usuário e por conexão nas edges `multiplix-dispatch`, `multiplix-audience`, `multiplix-send` com `429` + `Retry-After`. **Feito quando:** header presente.
- [ ] **F54** · `tests/contracts/multiplix-dispatch.contract.test.ts`, `multiplix-audience.contract.test.ts`, `messaging-adapter.contract.test.ts` (mock: sucesso, transitório, permanente, timeout) no `ci.yml`. **Feito quando:** no CI e verdes.

> **Portão E:** F47 e F51 verdes.

---

## BLOCO F — Worker por item (F55–F59)

- [ ] **F55** · Worker (`multiplix-send` renomeado internamente para papel de worker; o cron continua chamando) processa `multiplix_delivery_items` em lote (claim `FOR UPDATE SKIP LOCKED ... LIMIT N`, lease + heartbeat a cada 30 s), 1 dispatch por conexão por vez, ritmo humanizado, teto/hora e diário (F17). **Feito quando:** 2 workers simultâneos não pegam o mesmo item; limites respeitados sob carga simulada.
- [ ] **F56** · Ordem por destinatário: item do bloco `k` só é elegível quando o bloco `k-1` do mesmo destinatário está `sent`; mídia via `prepareMedia` (F40) com `fileName`; PTT via adaptador com presença `recording`. **Feito quando:** teste com 3 blocos mantém ordem; PDF chega com nome.
- [ ] **F57** · ⚠️ Testes de fila em `scripts/db-audit/multiplix-delivery-leases.test.sh` + unit: 2 workers, lease expira e volta, pausa para em 1 ciclo (em voo terminam), cancel encerra pendentes, timeout → `outcome_unknown` sem reenvio (simulação não duplica). **Feito quando:** no CI e verde.
- [ ] **F58** · Reconciliação: webhook `DELIVERY_ACK`/`READ` com `external_id` que casa item `outcome_unknown` → `sent`/`delivered`/`read` (mesmo mecanismo E87); sweeper de F11 migrado para itens. **Feito quando:** `outcome_unknown` resolvido pelo evento em teste.
- [ ] **F59** · 🔒 Política de recálculo do público agendado (recomendação: recalcular elegibilidade — supressão, conexão, escopo — na hora do disparo, **sem** re-resolver o público) registrada no ADR-007 e implementada; dead letter consultável (`multiplix_delivery_items WHERE status='failed_permanent'` + evento) no monitor; agendamento em `America/Sao_Paulo` disparando sozinho (F10 validado com itens). **Feito quando:** dispara sozinho no horário; dead letter visível.

> **Portão F:** F57 e F58 verdes.

---

## BLOCO G — Canal e eventos (F60–F63)

- [ ] **F60** · `whatsapp_connections` declara capacidades e limites (`capabilities jsonb`: ptt, document, max_chars, hourly_limit); seleção da conexão por departamento/`whatsapp_connection_queues` (padrão = do departamento do operador); "conexão em risco" (ADR D2.4): 3 falhas permanentes consecutivas ou `TemporaryBan`/`ConnectFailure` no webhook → pausa **todos** os dispatches da conexão com `pause_reason='connection_at_risk'` + alerta; retomada manual. **Feito quando:** simulação pausa e alerta; revisão bloqueia bloco incompatível com a conexão.
- [ ] **F61** · `error_message` legível para operador (mapa de F42) + código cru em `multiplix_events`. **Feito quando:** "Número não existe no WhatsApp", não JSON do provedor.
- [ ] **F62** · `evolution-webhook`: `READ`/`PLAYED` → `read_at`; resposta do contato correlacionada (estender `_shared/talkx-reply.ts` para `multiplix_delivery_items` dentro de `reply_window_hours`) com flag `attribution = linked | inferred`. **Feito quando:** enviado/entregue/lido/respondido separados no monitor; flag persistida.
- [ ] **F63** · ⚠️ Teste real de PTT: gerar no ElevenLabs `opus_48000_64` e `mp3_44100_128`, enviar ambos por `sendWhatsAppAudio` para número interno; registrar em `CANAL.md` qual chega como nota de voz; fixar `output_format`. **Feito quando:** resultado real em `CANAL.md` §5.

> **Portão G:** F63 registrado; F60 simulado.

---

## BLOCO H — Voz (F64–F69)

- [ ] **F64** · 🔒 `multiplix_voice_assets` (hash, caminho, duração, caracteres, modelo, `created_by`, `invalidated_at`) + `multiplix_voice_grants` (voice_id, titular, roles/perfis, `revoked_at`, origem) + edge `multiplix-voices` (lista só vozes com grant do chamador; revogação impede geração **e** recuperação do asset). **Feito quando:** sem grant = lista vazia; revogado → 403 em preparar e em assinar URL.
- [ ] **F65** · Edge `multiplix-prepare-voice` em fila: 1 chamada ao `elevenlabs-tts` por roteiro **distinto** (hash = sha256(roteiro final, voice_id, modelo, voice_settings)); asset gravado em bucket privado `multiplix-voice/<departamento>/` com signed URL de TTL do envio; respeita 20 req/min. **Feito quando:** 50 contatos com roteiro comum = 1 chamada; URL sem assinatura = 403.
- [ ] **F66** · Estimativa de consumo (caracteres × versões × modelo, ±5% do realizado) + 🔒 teto por envio e por departamento (ultrapassar exige confirmação explícita, gravada em evento); `elevenlabs-webhook` documentado em `CANAL.md` §3. **Feito quando:** estimativa vs realizado em 3 envios reais dentro de ±5%.
- [ ] **F67** · Modo `same_audio` (variável no roteiro bloqueia a revisão) e `personalized` (N versões = `DISTINCT` dos roteiros finais, contador visível); invalidação automática ao mudar roteiro/voz/parâmetro (F45). **Feito quando:** nunca usa o nome do primeiro contato; contador bate.
- [ ] **F68** · Gravação: reutilizar `src/hooks/communication/useAudioRecorder.ts` + `src/utils/audioToMp3.ts` do Chat (pausar/retomar/refazer), upload para o bucket privado vinculado ao bloco, codec conforme F63 (Chrome e Safari audíveis). **Feito quando:** sobrevive a refresh; mesmo componente do Chat.
- [ ] **F69** · Falha de TTS/upload → item `media_pending`, envio não sai pela metade (bloco de voz pendente segura o destinatário inteiro). **Feito quando:** erro de TTS não vira texto solto.

> **Portão H:** F65, F66, F67 verdes.

---

## BLOCO I — Front (F70–F87)
**Fidelidade de design:** tokens de `src/styles/tokens.css`, Outfit/Plus Jakarta pelos tokens, `src/components/ui/`, grid 1.02/1.58/0.98 em rem, zero hex, três áreas simultâneas (não wizard).

- [ ] **F70** · Fundação visual: substituir `--zapp-border`/`--zapp-surface-1` (inexistentes em `src/`) por tokens reais; zero px arbitrário (`text-[13px]`, `min-w-[130px]`, `max-h-[480px]`); só `ui/` (sem `<button>` cru, sem import de `talkx/talkxShared`); strings em `src/i18n/`; `DISPATCH_STATUS` único em `src/types/multiplix.ts`; remover comentários "#958" para o grep de `#` ficar vazio. **Feito quando:** `grep -rn "#" src/components/multiplix/` vazio; nenhum `[NNpx]`.
- [ ] **F71** · Nav: "Multiplix · NOVO" sob COMUNICAÇÃO, por permissão nomeada (F25); rota `/multiplix` além de `?view=`. **Feito quando:** sem permissão não vê nem acessa por URL; `Sidebar.test.tsx` atualizado.
- [ ] **F72** · `MultiplixView` = 3 regiões simultâneas (01 PÚBLICO / 02 COMPOSIÇÃO / 03 PRÉVIA & REVISÃO) + rodapé fixo, grid do protótipo; estado de composição em `src/hooks/multiplix/` com React Query (ADR-001) contra a edge de F44; `MultiplixComposerDialog` removido. **Feito quando:** bate com o protótipo em 1920×1080 (revisão lado a lado).
- [ ] **F73** · Painel 01: busca com debounce e sem acento; papel **multi-seleção**; ramo combobox com busca + "Não informado"; UF dinâmica; ⚠️ seleção persistente ao trocar filtro (remover `setSelected(new Set())` de `runSearch`). **Feito quando:** 3 trocas de filtro, contagem intacta; empresa com 2 papéis aparece nos 2.
- [ ] **F74** · Lista virtualizada (`@tanstack/react-virtual`, já usado no Chat) + "Selecionar todos os N resultados" com N do servidor (F47). **Feito quando:** 5.000 linhas a 60 fps; N ≠ página atual.
- [ ] **F75** · Exclusões explícitas; "N fora do filtro atual · seleção preservada"; salvar público (regra × lista, com aviso) e aplicar público (tamanho da regra ≠ aptos); popover do contato (origem, destino, elegibilidade, motivo, empresa, papéis); entrada por CRM 360 e Contatos preservando escopo. **Feito quando:** os 6 campos no popover; funciona dos 2 módulos.
- [ ] **F76** · Painel 02 — bloco de texto: autosize, contador contra `capabilities().max_chars`, variáveis por botão com validação ao digitar (`{{telefone}}` acusa na hora), duplicar/remover com confirmação só com conteúdo, reordenação por teclado e arrastar (bloqueada durante gravação). **Feito quando:** só teclado funciona; acima do limite bloqueia revisão.
- [ ] **F77** · Blocos voz IA (voz autorizada via F64, alternador único/personalizado, player com asset e duração reais), gravação (F68, com estado/tempo/refazer; falha de mic preserva o resto) e arquivo (upload real + validação F40). **Feito quando:** os 3 tipos aparecem na prévia e no envio.
- [ ] **F78** · "N contatos × M blocos = N×M mensagens" sempre visível; autosave no servidor com indicador (áudio gravado sinalizado como não persistido até o upload); título sugerido (público + assunto), editável, opcional. **Feito quando:** fechar/reabrir em outra máquina preserva tudo; dá para enviar sem nomear.
- [ ] **F79** · Painel 03: seletor de destinatário sem alterar composição; bolhas = exatamente o que sai (F48); motivo por status; painel de aptidão real (Aptos / Sem destino / Suprimidos / Fora do escopo / Empresa sem pessoa); modal "quem entra" com ação por contato e export dos excluídos; modal de revisão com números de F49/F50; confirmação com aceite explícito que congela (F51) e anti-duplo-clique; agendamento real em `America/Sao_Paulo`; 🔒 envio de teste (conta como mensagem; quem pode). **Feito quando:** 10 trocas de destinatário sem "alterado"; 5 cliques = 1 execução; soma do painel bate com o banco.
- [ ] **F80** · Monitor: estado de erro (não skeleton eterno), `attempt_count`/`external_id`/erro legível por destinatário, paginação de destinatários (sem `limit(500)`), "Iniciar" só em `draft`, contadores todos por realtime. **Feito quando:** qualquer falha explicável na tela.
- [ ] **F81** · Detalhe por bloco (parcial com rótulo próprio) + histórico com filtros (status, período, dono, conexão) e paginação keyset. **Feito quando:** sem carregar tudo; caso parcial visível.
- [ ] **F82** · "Repetir com inteligência": não respondidos / falhas corrigíveis / novos no público, sempre passando por nova revisão. **Feito quando:** nunca reenvia cego.
- [ ] **F83** · Exportação CSV/JSON pela edge (F44) respeitando escopo — reintroduz o que `4704424` removeu, agora no servidor. **Feito quando:** outro departamento exporta zero.
- [ ] **F84** · Sala de retornos = visão filtrada do Chat via `crm_contact_links` (sem inbox novo); atribuição `linked` × `inferred` com visual distinto; criar tarefa a partir da resposta sem vazar conversa de outro fornecedor. **Feito quando:** linha abre a conversa original; teste de isolamento.
- [ ] **F85** · Registrar cada envio como interação no Singu via `sync_interaction_from_zapp` (atualiza `last_interaction_at`). **Feito quando:** timeline do contato no Singu mostra o Multiplix.
- [ ] **F86** · Acessibilidade: fluxo inteiro por teclado; foco visível, trap e retorno nos modais e na troca lista↔monitor; nomes acessíveis + `aria-live` em contadores/progresso/erros; contraste AA (≥ 4.5:1) nos estados semânticos; `prefers-reduced-motion` (onda de áudio parada, `motion-reduce` nos `animate-*`). **Feito quando:** percorrido sem mouse; nenhum par < 4.5:1.
- [ ] **F87** · Responsivo em 1920×1080, 1440×900, 1024×1000, 390×844 sem rolagem horizontal (Playwright); render isolado por linha (memo); `bundle-budget` e `performance-budget.json` verdes sem subir baseline. **Feito quando:** CI verde.

> **Portão I:** F73, F79, F86 verdes.

---

## BLOCO J — Testes, observabilidade e rollout (F88–F100)

- [ ] **F88** · Unit: elegibilidade (7 classes), personalização (4 built-ins + custom), idempotência de `confirm`, backoff/classificação. **Feito quando:** no `ci.yml`.
- [ ] **F89** · Integração da fila contra banco de teste: confirma, drena, pausa, cancela, reconcilia (`outcome_unknown` → ack). **Feito quando:** verde.
- [ ] **F90** · `e2e/multiplix.spec.ts` no `e2e-logado.yml` (seleção persistente, prévia, confirmação bloqueada por placeholder inválido, monitor) + teste de escopo ponta a ponta (lista, contagem, histórico, mídia, export) + degradação (Singu fora → erro claro, Chat intocado). **Feito quando:** os 3 no CI.
- [ ] **F91** · Observabilidade: `correlation_id` rastreado do clique ao webhook em 1 envio real (sem conteúdo no log); métricas com dono e ação em `docs/runbooks/slo.md` (tempo de fila, falhas por classe, latência de voz, consumo estimado × real, não conciliados, conexão em risco); `docs/runbooks/multiplix-incidentes.md` (fila travada, worker morto, TTS fora, conexão caída, consumo estourado, Singu indisponível) referenciado em `INCIDENT-RUNBOOK.md`. **Feito quando:** 1 envio real rastreado; runbook mergeado.
- [ ] **F92** · Feature flag `multiplix_enabled_departments` em `global_settings` (kill switch sem deploy: desligar esconde rota e nav) + telemetria (abrir, confirmar, erro). **Feito quando:** desligar esconde tudo em < 1 min sem deploy.
- [ ] **F93** · Guards do banco: `schema-catalog.json`, `schema-manifest.json`, `grants-baseline.json`, `realtime-publication-baseline.json`, `known-violations.json` regenerados; `check-migration-drift` e `supabase-usage-guard` verdes cobrindo as 8+ tabelas. **Feito quando:** `db-guard` e `db-live-guard` verdes.
- [ ] **F94** · Docs: `docs/multiplix/SCHEMA.md`, `ARQUITETURA.md` (padrão de `docs/talkx/ARQUITETURA.md`: mermaid + métrica→fonte), `COMPONENTES.md`, receita de módulo completa (`lazyViews` + nav + permissão + flag) em `DESIGN_TOKENS_MAP.md`. **Feito quando:** mergeado.
- [ ] **F95** · Piloto Compras: fornecedores reais (84 com pessoa + WhatsApp; 285 com telefone de empresa), teto de destinatários e de voz — 5 envios reais revisados com o operador. **Feito quando:** 5 envios registrados com `correlation_id` e feedback.
- [ ] **F96** · Piloto Logística: transportadoras (58 com pessoa) — 3 envios reais; ajustes só do que os operadores apontaram (PRs mergeadas). **Feito quando:** 3 envios + PRs de ajuste.
- [ ] **F97** · 🔒 Fechar o **GATE C**: migrar as chamadas restantes (`crm-integration`, CRM 360) para o caminho com service key + guard (F22), revogar `GRANT EXECUTE ... TO anon` das 5 RPCs antigas do Singu, `has_function_privilege('anon', …) = false` nas 5, Chat/CRM 360 intactos; `docs/crm-external-grants.md` com o estado final. **Feito quando:** as 5 sem `anon` e nada quebrou.
- [ ] **F98** · 🔒 Go-live para os demais departamentos + 72 h de monitoramento com as métricas de F91. **Feito quando:** aprovado e métricas estáveis por 3 dias.
- [ ] **F99** · `graphify update . --force` com `GRAPH_REPORT.md` no commit de HEAD (E001) + `docs/multiplix/CHANGELOG_MULTIPLIX.md`, `CHANGELOG.md`, `docs/README.md`, `docs/COMPLETE_SYSTEM_FEATURES.md`. **Feito quando:** mergeado; report com commit = HEAD.
- [ ] **F100** · `docs/handoffs/HANDOFF_MULTIPLIX_<data>.md` (o que ficou fora, dívidas, evoluções: linguagem natural, pressão de contato, tarefas automáticas) + retro em `docs/audits/` comparando este plano com o executado + decisão sobre a flag (remover ou manter como kill switch). **Feito quando:** 100/100 marcados com evidência.

> **Portão J:** F90, F91, F97 verdes; F98 aprovado.

---

## Riscos que este plano herda (e onde cada um fecha)

| Risco | Fecha em |
|---|---|
| Staff manda para qualquer número / edita durante o envio / mexe no disparo alheio | F05, F06, F08 |
| Quem pediu "PARE" recebe Multiplix | F09 |
| Item preso para sempre, cron em loop | F11, F58 |
| Agendado nunca sai; pausado por janela nunca volta | F10 |
| Bloqueio da conexão por fan-out (10 dispatches na mesma instância) | F17, F55, F60 |
| Service key do Singu = admin do público | F22 |
| RPCs do Singu invisíveis ao repo (drift silencioso) | F21, F23 |
| Fork `talkx-send`/`multiplix-send` divergindo | F36–F43 |
| Envio duplicado ao mesmo número | F31 |
| Reenvio cego após timeout | F32, F51, F57 |
| Custo de voz descontrolado | F65, F66 |
| "N contatos" = "N mensagens" | F50, F78 |
| Singu fora derruba o módulo | F26, F90 |

---

## Fluxo Git por bloco

| Bloco | Branch | Merge |
|---|---|---|
| A | `claude/fix-multiplix-hardening-*` (1 PR de DDL + 1 de edge/front) | **PR aberta** (DDL) · autônomo (edge/front) com F20 verde |
| B | `claude/infra-multiplix-ponte-singu-*` | **PR aberta** — DDL Singu + secret |
| C | `claude/infra-multiplix-schema-v2-*` | **PR aberta** — DDL ZAPP |
| D | `claude/chore-multiplix-shared-messaging-*` | Autônomo com F43 verde |
| E | `claude/feat-multiplix-api-*` | Autônomo |
| F | `claude/feat-multiplix-worker-*` | **PR aberta** se tocar cron |
| G | `claude/feat-multiplix-canal-*` | Autônomo (webhook = regressão obrigatória) |
| H | `claude/feat-multiplix-voz-*` | **PR aberta** — custo |
| I | `claude/feat-multiplix-ui-<painel>-*` | Autônomo com CI verde |
| J | `claude/chore-multiplix-rollout-*` | **PR aberta** (flag, GATE C, go-live) |

Antes de cada branch: `github_list_pull_requests` e conferir sobreposição com `multiplix*`, `_shared/messaging`, `evolution-webhook`, `talkx-send`. Escrita pelo `GITHUB - MCP - FOREVER` ou `git push` direto quando disponível. Merge em `main` = Vercel em produção; edge só sobe por `deploy-functions.yml`.

---

## Progresso

```
Bloco A  [~]  19/20    Bloco F  [ ]  0/5
Bloco B  [ ]  0/9      Bloco G  [ ]  0/4
Bloco C  [ ]  0/6      Bloco H  [ ]  0/6
Bloco D  [ ]  0/8      Bloco I  [ ]  0/18
Bloco E  [ ]  0/11     Bloco J  [ ]  0/13
                       TOTAL    [~]  19/100
```

> Atualizado em 01/10/2026 (Hora oficial do Brasil): o Bloco A estava marcado 0/20 e isso era
> falso — a auditoria do Claude contra o banco vivo encontrou 15 etapas prontas (F01-F05, F07-F10,
> F12-F16, F19), e o PR do Portao A fechou F06 (bug do `manage_all`), F11a (um lote por invocacao),
> F17b/F17c (conexao unica + retomada por cota) e F20 (escopo de leitura no CI). Cada caixa `[x]`
> acima carrega a evidencia na propria linha. F18 segue aberta: a premissa (drift em
> `20260926180000`) foi refutada por medicao, o drift real ja tem conserto no repo, e falta o PR do
> `types-sync` (disparado pelo merge) mais o run verde do `db-live-guard`.
