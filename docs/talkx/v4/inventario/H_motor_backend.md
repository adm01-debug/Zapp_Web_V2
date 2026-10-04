# H — Motor e backend do Talk X (capacidades × mocks)

Base: `main` `3d09433` (2026-10-01). Somente leitura; banco não consultado (fatos de produção vêm do [README deste diretório](README.md)).

**Abreviações de evidência**
`send` = `supabase/functions/talkx-send/index.ts` · `sched` = `supabase/functions/talkx-scheduler/index.ts` · `link` = `supabase/functions/talkx-link/index.ts` · `report` = `supabase/functions/talkx-report/index.ts` · `reply` / `window` / `resume` / `conn` = `supabase/functions/_shared/talkx-{reply,window,resume-policy,delivery-connection}.ts` · `go-routes` = `_shared/evolution-go-routes.ts` · `go-adapter` = `_shared/evolution-go-adapter.ts` · `evo-send` = `_shared/evolution-send.ts` · `wh-msg` = `_shared/evolution-webhook-messages.ts` · `wh-upd` = `_shared/evolution-webhook-msg-handlers.ts` · `M:<versão>` = `supabase/migrations/<versão>_*.sql` · `editor` = `src/components/talkx/useCampaignEditor.ts` · `useTalkX` = `src/hooks/integrations/useTalkX.ts`.

**Fatos externos ao repo usados abaixo (conferir antes de agir):** limites da plataforma Supabase Edge Functions (wall-clock 150 s free / 400 s pago; request sem resposta em 150 s devolve 504) e `max-rows` do PostgREST (padrão 1000). Nenhum dos dois está versionado no repo; o valor real do projeto não foi verificado.

---

## Mapa do motor hoje

### 1. Rascunho
1. Wizard monta payload e chama RPC `save_talkx_campaign_draft(p_campaign_id, p_expected_revision, p_creation_key, p_payload)` — `useTalkX.ts:240-265`; RPC em `M:20260912130000:20-259` (autoria pelo JWT, `draft_creation_key` idempotente, `revision` otimista, valida conexão `connected`, mídia `^https://`, fuso IANA, janela).
2. Cliente grava evento `created`/`updated` direto na tabela — `editor:547-553`, `src/hooks/integrations/useTalkXEvents.ts:46-51`.
3. Audiência resolvida **no navegador**: segmento → `resolveAudience(rules)` (PostgREST em `contacts`, `.limit(5000)`, só `phone not null`) — `src/hooks/integrations/useTalkXSegments.ts:173-183`; contatos manuais → `selectedContacts` — `editor:555-562`.
4. Supressão filtrada **no navegador** (lista inteira de `talkx_blacklist` + `contacts.in(id, …)`) — `editor:325-338`, `editor:563-570`.
5. RPC `replace_talkx_draft_recipients(p_campaign_id, p_contact_ids)` apaga e reinsere destinatários e grava `total_recipients` — `editor:571`, `M:20260911140000:5-97` (exige `is_contact_visible_to_user`, status `draft|scheduled`).
6. `increment_talkx_template_use` (cliente) — `editor:572`, `useTalkXTemplates.ts:150-153` — **e** trigger `trg_talkx_template_use_count` no banco (`M:20260916130000:18-54`): conta em dobro.

### 2. Agendamento
1. Cliente faz `UPDATE talkx_campaigns SET status='scheduled'` direto (RLS do dono + trigger exige `scheduled_at` futuro e `total_recipients>0`) — `editor:574-577`, `M:20260930420000:118-131`.
2. `pg_cron` `talkx-scheduler-1min` → `net.http_post` (Bearer = **anon key** do Vault, sem `timeout_milliseconds`) — `M:20260909000000:13-26`.
3. `talkx-scheduler` (sem checagem de credencial própria; `verify_jwt=true` por omissão em `supabase/config.toml`) lê `status='scheduled' AND scheduled_at<=now` — `sched:32-36` — e pausadas com motivo automático — `sched:49-54`, decisão em `resume:85-126`.
4. Para cada campanha, **em série e aguardando a resposta**, faz `fetch(talkx-send, {campaignId, action:'start'})` com a service key — `sched:110-119`. Só conta como aceito se `success===true` — `sched:121-124`. Após retomada aceita grava evento `resumed_auto` — `sched:129-140`.

### 3. Início (`talkx-send`, `action=start`)
1. Auth: service key (timing-safe) **ou** JWT com `user_roles` ∈ {admin, supervisor} — `send:122-144`. Sem checagem de dono.
2. Lê campanha — `send:238-244`; conexão precisa estar `connected` com `instance_id` — `send:246-250`, `conn:6-16`; senão pausa com `connection_lost` e devolve 409 — `send:251-261`.
3. Janela/horário comercial no fuso da campanha — `send:266-269`, `window:62-86`. Fora da janela: devolve `{ok:false}` 200 **sem mudar o status** (campanha `scheduled` é re-tentada a cada minuto pelo cron).
4. RPC `transition_talkx_campaign(id,'start')` (lock de linha; aceita origem `draft|scheduled|paused`; **recusa `sending`**) — `send:273-279`, `M:20260916210000:44-59`, overload antigo removido em `M:20260929420000:26`.

### 4. Lote
- **Não existe lote.** Um único `SELECT` traz todos os `pending|sending` com `retry_after` vencido, com join em `contacts` — `send:282-290` — e um `for` percorre a lista inteira dentro da mesma requisição HTTP — `send:402-787`.
- Pré-carga: link rastreável mais antigo da campanha — `send:295-305`; campos customizados em blocos de 200 ids/1000 linhas — `send:314-365`.

### 5. Por destinatário (ordem real)
1. Relê status/limites/janela da campanha — `send:405-411`; fora da janela → pausa com `send_window|business_hours` — `send:412-423`, `resume:34-39`.
2. `claim_talkx_recipient(campaign, recipient, worker, 90)` — `send:425-434`; RPC final em `M:20260912110000:223-314` (lease, `SKIP LOCKED`, marca `skipped` se suprimido, só reclama lease expirado **se o dispatch não começou**).
3. `talkx_recipient_is_suppressed(contact, phone)` — `send:370-379,438-448`; `M:20260912110000:23-50`.
4. Sem telefone → `skipped` — `send:449-458`.
5. Snapshot: variante existente ou sorteio `pickVariant` (peso, `Math.random`) — `send:75-86,480-502`; `personalize()` — `send:29-72,513-519`; RPC `persist_talkx_recipient_message_snapshot` — `send:535-551`, `M:20260912120000:30-94`.
6. Presença `composing` (best-effort) + `sleep(typing_delay)` — `send:566-574`; `go-routes:167-170`.
7. Relê campanha e conexão; se saiu de `sending`/janela/conexão: pausa (com motivo) e `release_talkx_recipient_claim` — `send:578-616`.
8. Segunda checagem de supressão — `send:621-631`.
9. `mark_talkx_recipient_dispatch_started` — `send:634-640`; POST ao provedor com abort de 20 s — `send:643-668` (`sendText`, `sendMedia`, `sendWhatsAppAudio` → `go-routes:62-86`).
10. Resultado: 5xx / corpo inválido / sem id → `outcome_unknown` (quarentena, sem reenvio) — `send:674-694,731-750`, `M:20260911190000:67-115`; OK → `record_talkx_recipient_sent(…, external_id)` — `send:684-692`, `M:20260912110000:52-111`; erro do provedor → `complete_talkx_recipient('failed')` — `send:695-704`.
11. Erro **antes** do POST → `reschedule_talkx_recipient` com backoff 30 s / 2 min / 10 min, 3ª tentativa vira `failed` — `send:708-727`, `M:20260916210000:85-133`.
12. A cada 20 processados relê limites — `send:761-784`; `sleep(send_interval)` — `send:785-786`.

### 6. Entregue / lido / resposta / opt-out (webhook)
- GO envia recibo → adaptador traduz para `messages.update` com `fromMe = (Chat === Sender)` — `go-adapter:169-183`.
- `DELIVERY_ACK` de mensagem nossa → `record_talkx_recipient_delivered(external_id, connection_id)` (lock consultivo, `status='delivered'`, `delivered_count+1`) — `wh-upd:117-126`, `M:20260912110000:113-160`.
- `READ`/`PLAYED`: atualizam só `messages.status`; **nada no Talk X** — `wh-upd:82-84,117`.
- Resposta: `attributeTalkXReply` (72 h fixas, destinatário mais recente sem `replied_at`, `void` sem await) — `wh-msg:329-334`, `reply:13,38-78`; trigger incrementa `replied_count` — `M:20260916140000:14-35`.
- Opt-out: regex de mensagem inteira — `reply:29-30`; só se houve envio Talk X ao contato em 30 dias — `wh-msg:286-291`; RPC `talkx_suppress_contact` (`ON CONFLICT DO NOTHING`) — `wh-msg:292-299`, `M:20260930330000:20-49`; autoresposta fixa só na 1ª vez — `wh-msg:300-318`.

### 7. Pausa automática / retomada / conclusão
- Pausa automática: janela (`send:412-423,772-781`), conexão (`send:251-260,591-603`). Pausa manual: `action=pause` sem motivo — `send:221-231`.
- Retomada: manual = `action=start` de novo (`useTalkX.ts:353-368`); automática = scheduler para `send_window|business_hours|connection_lost` — `resume:25,85-126`.
- Conclusão: `complete_talkx_campaign_if_drained` só é chamada no fim do `for` — `send:789-793`; exige zero `pending|sending` — `M:20260911170000:33-53`.
- Cancelamento: `action=cancel` → `transition_talkx_campaign('cancel')`; destinatários não são tocados — `send:221-231`, `M:20260916210000:65-79`.

### 8. O que **não** acontece
- Campanha em `sending` cuja invocação morreu **não é retomada por ninguém**: o scheduler só olha `scheduled` e `paused` (`sched:32-36,49-54`) e `start` em `sending` é recusado (`M:20260916210000:46-48`). O motor irmão (Multiplix) resolve com lote de 20 (`supabase/functions/multiplix-send/index.ts:246-252`) e re-invocação de `sending` a cada tick (`M:20260929610000:229-255`).
- Destinatário `sending` com `provider_dispatch_started_at` preenchido e lease vencido nunca é reclamado (`M:20260912110000:257-263`) nem reciclado: não existe reaper.

---

## Tabela de capacidades

Legenda de telas: número do mock (`01`…`17`); `—` = requisito interno, não desenhado.

| ID (B-nnn) | Capacidade | Exigida por (telas) | Hoje (OK/PARCIAL/AUSENTE) | Evidência arquivo:linha | Falta (banco / edge / cron / config) |
|---|---|---|---|---|---|
| CAP-001 | Rascunho com criação idempotente e revisão otimista | 08, 09 | OK | `M:20260912130000:20-259`; `useTalkX.ts:240-265` | — |
| CAP-002 | Snapshot transacional de destinatários (replace) | 08, 09 | OK | `M:20260911140000:5-97`; `editor:571` | — |
| CAP-003 | Resolver audiência no servidor (regras → destinatários) | 08, 09, 03 | AUSENTE | resolução no cliente: `useTalkXSegments.ts:173-183`; `editor:555-562`; grep `rpc(` em `src` não acha RPC de audiência | banco: RPC `talkx_resolve_audience(rules)` paginada; edge: — |
| CAP-004 | Elegibilidade do contato (não excluído, não LID, telefone válido) | 08 ("Elegíveis para envio") | PARCIAL | só `phone not null`: `useTalkXSegments.ts:161-163,174-178`; `is_contact_visible_to_user` não olha `deleted_at`: `M:20260909200000:55-84`; critério oficial em `CLAUDE.md` (Contatos D4) | banco: aplicar `deleted_at IS NULL`, `is_lid_legacy=false`, regex de telefone na RPC de audiência e em `replace_talkx_draft_recipients` |
| CAP-005 | Máquina de estados com lock (start/pause/cancel) | 11, 12, 13, 17 | OK | `M:20260916210000:17-82`; `M:20260929420000:26-30`; `send:221-231,273-279` | — |
| CAP-006 | Agendamento: cron → scheduler → envio | 10, 09, 01 | PARCIAL | `M:20260909000000:13-26`; `sched:32-36,110-119` | cron: `timeout_milliseconds`; edge: scheduler não aguardar o envio; auth própria (ver CAP-085) |
| CAP-007 | Continuidade do envio além de uma invocação (lote + re-invocação de `sending`) | 11, 12, 14 (5.000 / 12.480 destinatários) | AUSENTE | `for` único: `send:402-787`; scheduler ignora `sending`: `sched:32-36,49-54`; `start` de `sending` negado: `M:20260916210000:46-48` | edge: tamanho de lote + orçamento de tempo; cron: re-invocar `sending` (padrão Multiplix `M:20260929610000:229-255`); banco: aceitar `start` idempotente em `sending` |
| CAP-008 | Claim/lease por destinatário, sem envio duplicado | — | OK | `M:20260912110000:223-314`; `send:425-434,634-640` | — |
| CAP-009 | Recuperar destinatário preso em `sending` após dispatch iniciado | — | AUSENTE | claim exclui `provider_dispatch_started_at IS NOT NULL`: `M:20260912110000:257-263`; nenhum reaper (grep `provider_dispatch_started_at` só em `send`/migrations) | banco: RPC/cron que converte lease vencido com dispatch em `outcome_unknown` |
| CAP-010 | Snapshot da mensagem/mídia/variante por destinatário | 12 (coluna Mensagem), 14 | OK | `M:20260912120000:5-94`; `send:463-551` | — |
| CAP-011 | Conclusão automática da campanha | 14, 01 | PARCIAL | RPC ok: `M:20260911170000:5-55`; só chamada no fim do loop: `send:789-793` | cron: chamar `complete_talkx_campaign_if_drained` periodicamente (depende de CAP-007/CAP-009) |
| CAP-012 | Campanha com múltiplos segmentos | 09 ("3 segmentos"), 13 ("2 de 6 segmentos"), 14 | AUSENTE | `talkx_campaigns.segment_id` único: `M:20260908120000:70`; RPC exige 1: `M:20260912130000:108-109` | banco: `talkx_campaign_segments`; RPC de rascunho; (V3 deixa em backlog V100) |
| CAP-013 | Fila por segmento (total/enviadas/restante/progresso, status por segmento) | 11, 13 | AUSENTE | grep `talkx_campaign_segments` = 0 em `supabase/`; catálogo sem a tabela | banco: tabela + RPC de progresso; edge: ordem de envio por segmento |
| CAP-014 | `segment_id` por destinatário | 11, 12, 14 (colunas/abas Segmento) | AUSENTE | colunas de `talkx_recipients` em `supabase/schema-catalog.json` (sem `segment_id`) | banco: coluna + preenchimento no snapshot |
| CAP-015 | Origem do contato por destinatário (Site, Instagram…) | 11 | AUSENTE | `contacts.lead_origin` existe mas 0 preenchidos (contexto); `send:284` não seleciona | dado: popular `lead_origin`; front lê |
| CAP-016 | Entregues (`delivered_at`, `delivered_count`) | 01, 07, 11, 12, 13, 14 | PARCIAL | `wh-upd:117-126`; `M:20260912110000:113-160`; heurística `fromMe`: `go-adapter:181-182`; READ sem ACK não marca: `wh-upd:117` | edge: tratar READ como entregue; validar heurística com envio real; nunca exercido (0 campanhas) |
| CAP-017 | Lidas (`read_at`, contagem) | 07 (funil Leitura), 12 | AUSENTE | sem coluna (contexto + catálogo); `wh-upd:82-84,117` ignora READ no Talk X | banco: `read_at` + RPC; edge: webhook READ/PLAYED |
| CAP-018 | Respostas: atribuição à campanha | 07, 11, 12, 13, 14 | PARCIAL | `reply:38-78`; `wh-msg:329-334` (`void`, sem await); trigger `M:20260916140000:14-35` | edge: await/`waitUntil`; contato LID/duplicado não casa `contact_id` |
| CAP-019 | Janela de resposta configurável | 07 | AUSENTE | 72 h fixas: `reply:13`; `talkx_settings.reply_window_hours` nunca lido (grep `talkx_settings` em `supabase/functions` = 0) | edge: ler setting |
| CAP-020 | Tempo médio de resposta | 13 ("2m 41s"), 01 | AUSENTE | nenhuma RPC devolve; `talkx_campaign_report` sem o campo: `M:20260916190000:56-106` | banco: `avg(replied_at - sent_at)` na RPC |
| CAP-021 | Taxa de resposta por template / segmento / campanha | 02, 04, 05, 07, 14 | PARCIAL | `reply_rate_pct` na view: `M:20260922130000:6-33`; `talkx_benchmarks` by_segment/by_template: `M:20260916220000:60-90`; sem consumidor em `src` (grep) | front: consumir; banco: por template da campanha individual |
| CAP-022 | Opt-out automático por mensagem | 06, 11, 10 | PARCIAL | `wh-msg:280-327`; `reply:29-30` | regex só casa mensagem inteira; "PARE"/"remover" não constam; só texto; só com envio Talk X ≤30 dias (`wh-msg:286-291`) |
| CAP-023 | Palavras-chave de opt-out configuráveis | 06 | AUSENTE | regex fixa `reply:29-30`; grep `optout_keywords` = 0 | banco: tabela; edge: ler com cache |
| CAP-024 | Autoresposta de opt-out configurável | 06 | PARCIAL | texto fixo `wh-msg:307-311`; setting `optout_autoreply` semeado (`M:20260930410000:35`) e não lido | edge: ler setting; seed com texto de confirmação |
| CAP-025 | Idempotência do opt-out | — | OK | `M:20260930330000:40-47`; confirmação só quando cria: `wh-msg:300-319` | — |
| CAP-026 | Opt-outs por campanha | 11 (KPI 18), 14 (KPI 34), 06 (coluna Campanha) | AUSENTE | RPC não recebe/grava `campaign_id`: `M:20260930330000:20-27,40-43`; `wh-msg:292-299` | banco: parâmetro `p_campaign_id`; edge: passar a campanha do envio mais recente |
| CAP-027 | Supressão respeitada no envio (claim + 2 rechecagens) | 09, 10, 11 | OK | `M:20260912110000:268-294`; `send:438-448,621-631` | — |
| CAP-028 | Supressão ao resolver audiência / lançar | 08, 09 | PARCIAL | no cliente: `editor:325-338,563-570`; lista sem paginação; `.in('id', contactIds)` com até 5000 ids na URL | banco: excluir na RPC de audiência (CAP-003) |
| CAP-029 | Contagem de bloqueados visível a quem não é admin | 08 ("Bloqueados por supressão 61") | AUSENTE | SELECT da blacklist só admin/supervisor: `M:20260410103218:20-24`; sem RPC de contagem | banco: RPC `talkx_audience_suppressed_count` |
| CAP-030 | Flag "respeitar supressão" persistida / "Campanhas protegidas" | 06 (126), 10 (checkboxes) | AUSENTE | sem coluna (contexto); flag só em estado do wizard: `editor:563` | banco: `respect_suppression`; RPC de rascunho |
| CAP-031 | Expiração de supressão | 06 (Status) | PARCIAL | respeitada: `M:20260912110000:40,284`; `editor:331-332`; sem caminho de escrita (`TalkXSuppression.tsx:110`); índice ativo ignora `expires_at` (`M:20260930160000:24-26`) → opt-out novo após expirar é descartado | front: campo; banco: índice/RPC considerar expirada |
| CAP-032 | Motivos de supressão personalizados | 06 ("Gerenciar motivos") | AUSENTE | enum fixo de 6: `M:20260910090000:6-13`; front não grava `reason_code`: `TalkXSuppression.tsx:110` | banco: tabela de motivos; front |
| CAP-033 | Trilha de supressão (adicionado/removido, ator) | 06 ("Atividade recente") | PARCIAL | `removed_by/at`: `M:20260910080000:2-4`; tipos `suppression_*` aceitos: `M:20260929730000:33-37`; nenhum escritor (grep `suppression_add` só em tipos) | front/RPC: gravar evento de entidade |
| CAP-034 | Importar / exportar lista de supressão | 06 | AUSENTE | grep `csv`, `xlsx`, `download` em `src/components/talkx` = 0 | front + RPC em lote |
| CAP-035 | Limite de envio por minuto | 09 ("~42 msg/min"), 11, 12 ("200 mensagens/min") | AUSENTE | só intervalo aleatório entre envios: `send:785-786`; teto real ≈ 3–13 msg/min (perfis `talkxShared.tsx:54-58` + digitação) | banco: coluna; edge: token bucket; o teto do mock exige envio paralelo |
| CAP-036 | Limite diário por conexão | 13 ("Dentro do limite da conta") | AUSENTE | `daily_limit_per_connection` semeado (`M:20260930410000:37`), nunca lido | edge: contar `sent_at` do dia por conexão e pausar |
| CAP-037 | Uma campanha por conexão por vez | — | AUSENTE | nenhum guard em `send`/`sched`; Multiplix tem (`M:20260929610000:229-244`) | cron/edge: serializar por `whatsapp_connection_id` |
| CAP-038 | Envio pela conexão escolhida (multi-conexão) | 09, 10 ("Comercial Principal") | PARCIAL | grava/valida conexão: `send:246-250`; o POST usa sempre `EVOLUTION_INSTANCE_TOKEN` global: `evo-send:15-20,40-54`; `send:653-667` não passa token | edge: token por instância (`whatsapp_connections.instance_token_secret_id`) |
| CAP-039 | Janela de envio (início/fim) | 10, 12 | OK | `window:72-81`; CHECK `M:20260911200000:39-50`; pausa/retomada `send:412-423`, `resume:116-124` | — |
| CAP-040 | Horário comercial configurável | 10 ("salvo no perfil da empresa") | PARCIAL | fixo 08–18 seg–sex: `window:82-84`; setting `business_hours` não lido | edge: ler `talkx_settings.business_hours` |
| CAP-041 | Dias da semana de envio | 12 ("Seg – Sex") | AUSENTE | sem coluna; só o fixo de `window:82` | banco: coluna; edge |
| CAP-042 | DND (não perturbe) | 12 ("Respeitar DND") | AUSENTE | grep `dnd` em `supabase/functions/talkx-*`, `_shared/talkx-*` = 0 | definir regra; banco + edge |
| CAP-043 | Fuso horário por campanha | 10 | OK | `M:20260911200000:5-56`; `window:33-55,66-70` | — |
| CAP-044 | Perfis de velocidade | 09, 10 | PARCIAL | `speed_profile` é rótulo; intervalos vêm do cliente: `talkxShared.tsx:54-58`, `M:20260912130000:94-98`; setting `default_speed_profile='balanced'` fora do CHECK (`M:20260908120000:82`) | banco: derivar intervalos do perfil; corrigir seed |
| CAP-045 | Simulação humana (digitando + atraso) | 10 | OK | `send:566-574`; `go-routes:167-170` | — |
| CAP-046 | Editar limites com campanha em andamento | 12 | OK | `M:20260930380000:19-182`; `useTalkX.ts:267-288`; releitura `send:405-411,761-769` | depende de deploy do `send` atual |
| CAP-047 | Retry automático | 11 ("Tentativa de reenvio em 30 segundos") | PARCIAL | só erro pré-POST: `send:708-727`; `M:20260916210000:85-133`; destinatário reagendado não é revisitado na mesma invocação nem por outra (CAP-007) | cron/edge: reprocessar `retry_after` vencido |
| CAP-048 | Retry manual por destinatário | 11 (ícone reenviar) | AUSENTE | ações aceitas: `test`, `start`, `pause`, `cancel` (`send:150,221,233-235`) | edge: `action=retry`; banco: RPC |
| CAP-049 | `outcome_unknown` (quarentena de resultado ambíguo) | — | PARCIAL | quarentena ok: `send:674-694,731-750`; `M:20260911190000:67-115`; sem reconciliação nem ação de resolver | edge/RPC: resolver (reenviar/dar como enviado) com trilha |
| CAP-050 | Queda de conexão → pausa automática | 11, 17 | OK | `send:246-261,584-604`; `conn:6-16` | — |
| CAP-051 | Volta de conexão → retomada automática | 11 | PARCIAL | `sched:49-93`; `resume:104-114`; evento só depois de o envio inteiro responder: `sched:121-140` | depende de deploy; scheduler não aguardar o envio |
| CAP-052 | Recorrência (diária / semanal / personalizada) | 10 | AUSENTE | sem coluna; grep `recurrence` em `supabase/` = 0 | banco: `recurrence`; cron: clonar ocorrência com chave única |
| CAP-053 | Cancelamento marca pendentes | 17 ("contatos pendentes não receberão") | AUSENTE | `cancel` só muda a campanha: `M:20260916210000:65-79`; status `cancelled` não existe no CHECK de destinatário: `M:20260911180000:8-10` | banco: status + update na transição |
| CAP-054 | Pausa manual com motivo e ator | 13 ("pausada manualmente por Admin 01 para…") | AUSENTE | `action=pause` não repassa motivo nem ator: `send:221-231`; RPC não recebe ator | edge: `reason`; banco: `p_actor` |
| CAP-055 | Eventos de ciclo de vida gravados pelo servidor | 10, 11, 12, 13, 14 | PARCIAL | servidor grava só `limits_updated` (`M:20260930380000:176-178`) e `resumed_auto` (`sched:132-138`); `started/scheduled/created` são do cliente (`editor:548-583`); `paused/cancelled/completed/connection_failed/skipped_suppressed` ninguém grava | banco: inserir dentro das RPCs de transição/conclusão |
| CAP-056 | Checklist para retomar persistido | 13 | AUSENTE | tipo `checklist` aceito (`M:20260929730000:36`), sem escritor | front/RPC |
| CAP-057 | Envio de teste | 05 ("Testar"), 08 ("Ver no celular") | PARCIAL | `send:150-210`; usa a 1ª conexão `connected`, dados fictícios, sem assinar mídia privada, sem trilha, sem limite | banco: `talkx_test_sends`; edge: conexão escolhida, rate limit, E.164 |
| CAP-058 | Mídia no envio: imagem, vídeo, documento, áudio | 04, 05, 08, 10 | PARCIAL | `send:96-101,646-659`; `go-routes:71-86`; URL assinada 300 s só p/ `whatsapp-media`/`audio-messages`: `evolution-api-proxy.ts:287-307`; documento vai sem `fileName` | edge: nome do arquivo; bucket próprio na lista |
| CAP-059 | Upload de mídia (bucket, tipos, 16 MB) | 05, 08 | AUSENTE | sem bucket `talkx-media` (contexto); grep `.upload(` em `src/components/talkx` = 0; RPC exige `^https://`: `M:20260912130000:113` | storage: bucket + policies + limite; front: upload |
| CAP-060 | Botões / lista / enquete na mensagem | 04 ("Ver catálogo", CSAT), 09 ("Quero aproveitar agora") | AUSENTE | transporte existe (`go-routes:109-125`), mas `send` só usa texto/mídia/áudio (`send:653-667`); sem colunas no template/campanha | banco: schema de botões; edge: chamar `sendButtons/sendPoll/sendList` |
| CAP-061 | Link rastreável: clique e redirecionamento | 14 | OK | `link:30-68`; `M:20260916280000:13-58`; rate limit `link:42` | usa domínio `…supabase.co` na mensagem (`send:302-305`) |
| CAP-062 | Link rastreável: criação pelo usuário | 08 (`{{link}}`), 14 | AUSENTE | `authenticated` só tem SELECT: `M:20260924224823:34-54`, `M:20260916290000`; grep `talkx_links` em `src` (fora de tipos) = 0 | banco: policy/RPC de escrita; front: UI |
| CAP-063 | Vários links por mensagem / por rótulo | 14 (5 links) | AUSENTE | usa só o link mais antigo: `send:295-305` | edge: placeholder por rótulo |
| CAP-064 | UTM | — | AUSENTE | `talkx_links` sem colunas de UTM: `M:20260916200000:3-10` | banco/edge |
| CAP-065 | Conversões: registro (origem, valor) | 14, 07, 05 | PARCIAL | `link:71-143`; `M:20260916200000:21-29`; IDOR tratado `link:110-122`; `value` sem validação | ver CAP-066 |
| CAP-066 | Conversões: autenticação do endpoint | — | AUSENTE | POST público, só rate limit por IP: `link:71-77`; `verify_jwt=false` em `supabase/config.toml:65-66` | edge: segredo/HMAC |
| CAP-067 | Conversões e cliques legíveis pelo front | 14, 07 | PARCIAL | cliques: policy só do dono (`M:20260922130000:42-55`), sem ramo admin; conversões: sem grant nem policy (`M:20260916290000`) | banco: policies/RPC de relatório |
| CAP-068 | Investimento / receita / ROI | 14, 07 ("Receita influenciada") | AUSENTE | sem coluna `investment`; nenhuma RPC soma `talkx_conversions.value` (grep) | banco: coluna + agregação |
| CAP-069 | A/B: sorteio por peso | 05, 17 | PARCIAL | `send:75-86,500-502`; pesos sem soma obrigatória (`M:20260909150000:11`); se o template tem variantes, o texto editado na campanha é ignorado: `send:504` | banco: constraint; edge: regra de precedência |
| CAP-070 | A/B: métrica por variante | 05, 14 | PARCIAL | `by_variant` só `recipients`/`sent`: `M:20260916190000:88-98`; RPC sem consumidor | banco: entregues/respostas por variante |
| CAP-071 | A/B: vencedor | 05 | AUSENTE | grep `winner`, `vencedor` em `supabase/` = 0 | banco/edge |
| CAP-072 | Variáveis nativas (`nome`, `nome_completo`, `apelido`, `empresa`, `saudacao`) | 04, 05, 08, 09 | OK | `send:15-21,36-42,57,63` | — |
| CAP-073 | Variáveis customizadas por contato | 09 (`{{produto}}`, `{{desconto}}`) | OK | `contact_custom_fields`: `send:314-365,511-519`; chave case-insensitive `send:45-50` | — |
| CAP-074 | Fallback de variável sem valor | 08, 05 | PARCIAL | vira literal `[variavel]` e **é enviado**: `send:65-70`; sem sintaxe de valor padrão dentro da variável (regex `send:55`) | edge: política (bloquear/omitir/padrão) |
| CAP-075 | `{{vendedor}}`, `{{data_atual}}`/`{{data}}`, `{{telefone}}` | 05, 08 | AUSENTE | não estão em `contactValues` (`send:37-42`) → saem como `[vendedor]` | edge: resolver (`assigned_to → profiles.name`, data, telefone) |
| CAP-076 | `{{link}}` por destinatário | 08 | PARCIAL | `send:58-59,302-305,518`; depende de CAP-062 (sem link cadastrado sai `[link]`) | ver CAP-062 |
| CAP-077 | Versões de template | 05, 14 ("v3") | OK | `M:20260909210000:492-604,720-760`; `useTalkXTemplates.ts:157-165` | campanha não guarda a versão usada |
| CAP-078 | Aprovação de template | 04, 09, 13 | PARCIAL | status `draft/review/approved` (`M:20260908120000:48`); dono aprova o próprio (`M:20260909210000:533-535,592`); `start` não exige aprovado (`M:20260916210000:45-59`) | banco: papel para aprovar; exigir aprovado no lançamento |
| CAP-079 | Contador de uso do template | 04 | PARCIAL | trigger `M:20260916130000:18-54` + RPC do cliente `editor:572` → dobro | remover uma das vias |
| CAP-080 | Séries temporais (RPC) | 07, 11, 12, 13, 14 | PARCIAL | `talkx_overview_stats`: agregados atual/anterior + `daily_sends` (`M:20260916180000:15-101`; `active` filtra status inexistente `'running'`, linha 49); `talkx_campaign_report`: `kpis`, `by_status`, `hourly_series`, `by_variant` (`M:20260916190000:41-115`; `sent` só conta `status='sent'`, linha 75); nenhuma consumida (grep em `src`) | banco: corrigir filtros, série por minuto/dia; front: consumir |
| CAP-081 | Mapa de calor (dia × hora) | 07, 14 | AUSENTE | nenhuma RPC; cálculo no cliente com `.limit` (`TalkXAnalytics.tsx:51-58`, `useTalkXInsights.ts:30-35`) | banco: RPC de heatmap |
| CAP-082 | Funil enviado → entregue → lido → respondeu → clicou → converteu | 07, 14 | PARCIAL | contadores existem para enviado/entregue/respondeu; cliques em `talkx_recipients.clicked_at`; lido e conversão sem leitura (CAP-017, CAP-067) | banco: RPC única de funil |
| CAP-083 | Benchmarks / "vs. média" | 01, 02, 03, 04, 13, 14 | PARCIAL | `talkx_benchmarks()` (`M:20260916220000:34-104`); view só com `completed` (`M:20260922130000:33`); sem consumidor; hoje 0 campanhas | front: consumir; sem base histórica |
| CAP-084 | Comparativo de períodos | 07 | PARCIAL | `previous` em `talkx_overview_stats` (`M:20260916180000:60-72`), por `created_at`, sem respostas/receita | banco: ampliar; front |
| CAP-085 | Insights por regra | 07, 11, 12, 14 | PARCIAL | 4 regras no cliente: `useTalkXInsights.ts:90-134`; regra de cliques usa status inexistente `'finished'` (linha 85) | corrigir; mover para RPC |
| CAP-086 | IA (texto/recomendação gerados por modelo) | 02, 03, 04, 07, 09, 11, 12, 14 | AUSENTE | grep `ai-proxy`, `openai`, `anthropic`, `gemini` em `talkx*` = só `TalkXSettings.tsx:15` (flag); `ai_insights=false` | edge: chamada a `ai-proxy` |
| CAP-087 | Previsões (ETA, série "Previsto", taxa projetada, risco de opt-out) | 08, 09, 10, 11 | AUSENTE | nenhuma RPC; estimativa só no cliente (`editor` `estimatedSeconds`) | banco/edge: cálculo com base histórica |
| CAP-088 | Exportar relatório (PDF / CSV) | 14, 06 | AUSENTE | grep `csv`, `window.print`, `pdf` em `src/components/talkx`, `useTalkX*` = 0 | front: export; banco: RPC paginada |
| CAP-089 | Relatório por e-mail | 14 | PARCIAL | `report:28-186`; só o dono (`report:60-71`); só contadores; `skipped` de no máx. 2000 linhas (`report:95-100`); depende de `RESEND_API_KEY` (`report:152-155`) | config: secret/domínio; edge: usar RPC de relatório |
| CAP-090 | Compartilhar relatório | 14 | AUSENTE | grep `share`, `compartilh` em `src/components/talkx` sem fluxo | front (deep link) |
| CAP-091 | Importação de contatos (upload, parsing, matching, conflitos) | 15, 01, 06 | AUSENTE | sem componente (lista de `src/components/talkx`), sem tabelas `talkx_import*` no catálogo | banco + front + edge |
| CAP-092 | Vínculo com CRM externo | 15, 02, 03, 08, 17 | PARCIAL | só selo: `TalkXContactSelector.tsx:11,77`; `crm_contact_links` com 0 linhas (contexto); `audience_source='crm360'` aceito sem resolvedor (`M:20260912130000:106`) | banco: projeção local; edge: consulta ao CRM; filtros |
| CAP-093 | Filtros de audiência por dado comercial (estágio, vendedor, RFM, localização, ticket) | 02, 03, 08 | PARCIAL | campos de `contacts` no builder (`useTalkXSegments.ts:16,63`); `city/state/lead_score/company` vazios em produção (contexto); RFM/ticket fora do banco | dado: popular; CRM (CAP-092) |
| CAP-094 | Estimativa, sobreposição e risco de segmento | 02, 03 | PARCIAL | contagem via PostgREST: `useTalkXSegments.ts:161-168`; sobreposição/risco: nenhuma RPC | banco: RPCs |
| CAP-095 | Multicanal (e-mail etc.) | 01, 04, 07 ("Todos os canais") | AUSENTE | motor só WhatsApp/Evolution (`send:653-667`) | fora do escopo atual |
| CAP-096 | Permissão por papel no banco | 17 ("Sem permissão"), 08 ("Responsável") | PARCIAL | UI/edge restringem a admin/supervisor (`navigation.service.ts:34`; `send:135-143`), mas qualquer autenticado cria rascunho (`M:20260912130000:58-72`), agenda por UPDATE próprio (`M:20260409000457:61-63`; `M:20260930420000:118-131`) e o scheduler dispara com service key (`sched:112-118`) | banco: checar papel nas RPCs/policies ou no `start` |
| CAP-097 | Permissão por tabela (resumo) | — | PARCIAL | campanhas: dono ou admin lê, só dono altera/exclui rascunho (`M:20260409000457:48-67`); destinatários: só via RPC (`M:20260930420000:151-187`); segmentos dono/admin (`M:20260928370000`); templates leitura geral, escrita dono/admin; blacklist só admin (`M:20260409190343:81-88`, `M:20260410103218:20-24`; policy de UPDATE alterada sem ter sido criada em migration: `M:20260910100000:9-12`); eventos (`M:20260929730000:47-61`); settings leitura geral/escrita admin (`M:20260930410000:42-57`, com `GRANT ALL` a `anon` na linha 31); links leitura dono/admin; cliques só dono; conversões ninguém | `send` sem checagem de dono para pause/cancel; ramo admin em cliques |
| CAP-098 | Autenticação do scheduler | — | PARCIAL | nenhuma checagem no handler (`sched:17-27`); cron envia anon key (`M:20260909000000:20`), chave pública do bundle | edge: `x-cron-secret` (padrão Multiplix `M:20260929610000:245-252`) |
| CAP-099 | Realtime | 11, 12 | PARCIAL | publicadas: `talkx_campaigns` (`M:20260826210200:8`), `talkx_recipients` com lista de colunas (`M:20260927420000:9-36`), `talkx_campaign_events`, `talkx_segments`, `talkx_templates` (`M:20260927570000:3-5`); não: blacklist, links, cliques, conversões, settings | banco: incluir colunas novas (`read_at` etc.) na lista ao criá-las |
| CAP-100 | Logs estruturados | 12 ("Logs em Tempo Real"), 14 ("Logs") | PARCIAL | `Logger` JSON com `fn/rid/ms` (`_shared/validation.ts:25-63`); sem `recipient_id`/tentativa; `link`/`reply`/webhook usam `console.warn` solto | edge: campos; tabela de log por destinatário |
| CAP-101 | Alertas e métricas do cron | — | AUSENTE | sem workflow/alerta para Talk X (grep `talkx` em `.github/workflows` = só testes); resultado do scheduler só no log da edge | N8N/issue automática; leitura de `net._http_response` |
| CAP-102 | Idempotência e concorrência | — | OK | 2 schedulers: `start` serializado por `FOR UPDATE` (2º recebe 409); 2 workers: claim com token e `SKIP LOCKED`; lease vencido só reabre sem dispatch; recibo com lock consultivo (`M:20260912110000:75,133`) | pausar e retomar com worker antigo vivo gera 2 workers (ritmo dobra, sem duplicar) |
| CAP-103 | Limites de escala | 12, 14, 07 | PARCIAL | `resolveAudience .limit(5000)` (`useTalkXSegments.ts:173-178`); `send:282-290` sem paginação; blacklist sem limite (`editor:330-332`); `.in('id', contactIds)` (`editor:566`); Analytics `.limit(5000)` (`TalkXAnalytics.tsx:96,109`); monitor `.limit(2000)` (`useTalkXMonitor.ts:46`); supressão `.limit(500)` (`useTalkXSuppression.ts:48`); relatório `.limit(2000)` (`report:100`) | banco: RPCs paginadas/agregadas |
| CAP-104 | LGPD: consentimento | 09 (checkbox), 03 (filtros LGPD) | AUSENTE | `consent_status='unknown'` em todos (contexto); checkbox não persistido (`TalkXWizardDelivery.tsx:232`); envio não consulta | banco: flag + regra |
| CAP-105 | LGPD: retenção | — | AUSENTE | sem job de expurgo para `personalized_message`, `talkx_link_clicks.ua/ip_hash`; comentário "job de limpeza (E89+)" nunca criado (`M:20260910080000:6-8`) | cron de retenção |
| CAP-106 | LGPD: auditoria | 06, 13, 14 | PARCIAL | soft-delete com ator na supressão; eventos append-only (`M:20260929840000:64-65`); maioria gravada pelo cliente (CAP-055); IP com hash (`link:148-154`) | servidor como única fonte de eventos |
| CAP-107 | Integridade dos contadores | — | PARCIAL | trigger protege enviados/entregues/falhas/desconhecidos; `replied_count` fora do guard (`M:20260930420000:138-145`); skips do claim não contam em lugar nenhum (`M:20260912110000:268-294`) | banco: incluir `replied_count`; contador de pulados |
| CAP-108 | Mensagem da campanha no histórico da conversa | 11 (ícone conversa) | PARCIAL | `send` não insere em `messages`; depende do eco `fromMe` do webhook (`wh-msg:77-126`) | edge: inserir no envio ou garantir eco |
| CAP-109 | Excluir / duplicar campanha | 17 | PARCIAL | excluir só rascunho (`M:20260930420000:74-79`); duplicar é só estado do cliente (`TalkXView.tsx:135-137`) | banco: RPC de exclusão com guard; duplicar persistido |
| CAP-110 | Configurações vivas (`talkx_settings`) | 12, 13 | PARCIAL | tabela + RLS ok (`M:20260930410000`); nenhuma chave lida pelo backend (grep `talkx_settings` em `supabase/functions` = 0) | edge: ler as 6 chaves |

**Contagem:** OK 17 · PARCIAL 48 · AUSENTE 45 (110 capacidades).

---

## Riscos de produção antes da primeira campanha real

Ordem de gravidade. O motor nunca rodou em produção (0 campanhas).

1. **Campanha órfã em `sending`.** O envio é um `for` com `sleep` dentro de uma única requisição (`send:402-787`). Com o perfil padrão (8–20 s + digitação 1,5–4 s) cabem ≈ 8 destinatários em 150 s e ≈ 22 em 400 s. Quando a plataforma encerra a invocação, ninguém continua: o scheduler só lê `scheduled`/`paused` (`sched:32-36,49-54`) e `start` em `sending` é negado (`M:20260916210000:46-48`). Saída manual hoje: pausar e retomar, repetidamente.
2. **Destinatário preso para sempre.** Se a invocação morre entre `mark_talkx_recipient_dispatch_started` (`send:634-640`) e `record_talkx_recipient_sent` (`send:687-691`), a linha fica `sending` com dispatch marcado; o claim a exclui (`M:20260912110000:257-263`) e a campanha nunca conclui (`M:20260911170000:37-44`). A mensagem pode ter saído sem registro.
3. **Erro falso no lançamento.** O navegador aguarda o loop inteiro (`useTalkX.ts:353-368`; comentário em `TalkXCampaignScheduled.tsx:143-145`). Passado o tempo de resposta do gateway, o operador vê "Erro ao iniciar"/"A campanha não foi iniciada" (`editor:581-582`) com mensagens saindo, e o evento `started` não é gravado (`editor:583`).
4. **Agente dispara campanha.** Papel só é checado na UI e na edge. Qualquer usuário autenticado cria rascunho, grava destinatários e muda para `scheduled` por UPDATE próprio; o cron dispara com service key (ver CAP-096).
5. **Truncamento silencioso em 1000 linhas.** `send:282-290` não pagina; `resolveAudience` pede 5000 (`useTalkXSegments.ts:178`); a blacklist do wizard vem sem paginação (`editor:330-332`). Base atual: 2.504 contatos visíveis. Efeito: audiência cortada sem aviso e, somado ao risco 1, o restante nunca é enviado. (O envio em si continua protegido contra suprimidos — CAP-027.)
6. **Texto errado para o cliente.** Variável sem valor sai literal: `{{vendedor}}`, `{{data_atual}}`, `{{telefone}}`, `{{link}}` sem link cadastrado viram `[vendedor]` etc. (`send:59,65-70`). Template com variantes A/B ignora o texto editado na campanha (`send:504`).
7. **Risco para o número de atendimento.** O POST usa sempre o token global da instância (`evo-send:40-54`), não a conexão escolhida; não há limite diário (CAP-036), nem uma campanha por conexão (CAP-037); pausar/retomar com worker vivo dobra o ritmo (CAP-102). Campanha, Multiplix e inbox compartilham a instância `PRINCIPAL`.
8. **Entregues podem ficar em zero.** O recibo só conta se `fromMe` for verdadeiro, e no GO isso é inferido por `Chat === Sender` (`go-adapter:181-182`) — nunca exercido com Talk X; `READ` sem `DELIVERY_ACK` não marca entrega (`wh-upd:117`); "Lidas" não existe (CAP-017).
9. **Opt-out com falhas de cobertura.** "PARE" (texto do próprio seed `optout_autoreply`) e "remover" não casam a regex; frase com a palavra não casa (`reply:22-30`); supressão expirada impede o registro de um novo opt-out (`ON CONFLICT DO NOTHING` sobre índice que ignora `expires_at`: `M:20260930330000:44`, `M:20260930160000:24-26`); o opt-out não guarda a campanha (CAP-026).
10. **Audiência inclui contatos fora do critério de visível.** Excluídos (`deleted_at`), LID legados e telefones inválidos não são filtrados (CAP-004); 3.106 linhas contra 2.504 visíveis.
11. **Retry que não acontece.** Erro pré-envio reagenda com `retry_after` (`send:708-727`), mas a lista em memória não revisita o destinatário e nenhuma outra invocação o pega; a campanha fica `sending` com pendentes.
12. **Lançamento quebra com supressão por telefone.** `contacts.in('id', contactIds)` com milhares de UUIDs na URL (`editor:566`) — só ocorre quando existir ao menos uma supressão com telefone; hoje há 0.
13. **Versão implantada desconhecida** (seção seguinte). Se o `talkx-scheduler` no ar for anterior à V03, pausa manual volta a enviar sozinha em ~1 min (P1-2 da auditoria de 29/09).
14. **Scheduler exposto e frágil.** Sem credencial própria (CAP-098); aguarda cada `talkx-send` em série (`sched:110-119`); cron sem `timeout_milliseconds` (`M:20260909000000:17-24`; o do Multiplix usa 30000).
15. **Endpoints públicos de link.** POST de conversão sem autenticação (`link:71-143`); a URL enviada ao cliente é `https://<projeto>.supabase.co/functions/v1/talkx-link?...` (`send:302-305`) e, em erro, redireciona para a raiz do projeto (`link:58-62`).
16. **Cancelar não encerra a fila.** Pendentes ficam `pending` para sempre (CAP-053); relatório mostra "Pendentes" em campanha cancelada (`report:112`).
17. **Mídia.** Documento sem nome de arquivo (`send:655-657` não envia `fileName`; `go-routes:75`); teste de template não assina mídia privada (`send:182-191`), então o teste falha onde o envio real funcionaria.

### 14 falhas do scheduler em 24 h — causa provável pelo código

Com 0 campanhas o scheduler faz 2 consultas e responde (`sched:32-100`); `talkx-send` não é chamado. Hipóteses, da mais para a menos provável (nenhuma confirmada — exigiria ler `net._http_response`/`cron.job_run_details`/logs da edge):

1. **Timeout do `pg_net`.** `net.http_post` sem `timeout_milliseconds` (`M:20260909000000:17-24`) usa o padrão curto da extensão; cold start da edge (imports de `esm.sh` no boot, `sched:11`) estoura esporadicamente. ~1% de 1.440 execuções é coerente. O cron do Multiplix já fixa 30000 (`M:20260929610000:253`).
2. **HTTP 500 do próprio handler** quando a leitura de `talkx_campaigns` falha (`sched:38-41`) ou qualquer exceção (`sched:167-172`) — erro transitório de PostgREST/pooler.
3. **Falha no nível do pg_cron** (conexão indisponível ao iniciar o job) — fora do código do repo.

Quando houver campanha real, a falha vira regra: o scheduler aguarda o envio completo (`sched:110-119`) e o `pg_net` desiste antes.

---

## Estado de deploy

**O que o repo permite afirmar**
- Deploy de edge é manual: `workflow_dispatch` na `main` (`.github/workflows/deploy-functions.yml:21-33,87-92`), com tag `edge-deploy/<data>-<sha8>-<run>` ao final (`:373-391`). Merge não implanta.
- `verify_jwt`: só `talkx-link` é `false` (`supabase/config.toml:65-66`); `talkx-send`, `talkx-scheduler`, `talkx-report` ficam `true` por omissão (confirmado em `supabase/deployment-manifest.json`).
- O manifesto guarda o `source_sha256` de cada função (`talkx-send` `381a9d79…`, `talkx-scheduler` `d03bd2fe…`, `talkx-link` `61f00581…`, `talkx-report` `5027acc9…`) — comparável com o remoto por `scripts/edge-deploy/collect-remote.mjs`, que exige token (não executado).
- Registros de deploy encontrados em docs:
  - `docs/talkx/HANDOFF_SESSAO_03.md:54` — `talkx-scheduler` e `talkx-send` "deployadas" (início de setembro, sem run id).
  - `docs/migration/HANDOFF.md:237,246` — `talkx-send` v13 com `verify_jwt=true` restaurado (migração de agosto).
  - `docs/audits/AUDITORIA_PARIDADE_LOCAL_GITHUB_SUPABASE_2026-09-22.md:25,316` — último artefato localizado é de 16/09, escopo `talkx-link`; paridade main↔edges "não comprovada".
  - `docs/audits/AUDITORIA_MODULO_CONTATOS_2026-09-29.md:136` — run 36453264732 (28/09 16:44Z), `talkx-report` no ar.
- `docs/talkx/OPERACAO.md` (§4, §9) e `docs/talkx/CHANGELOG_TALKX.md` não registram nenhum deploy.

**O que não dá para afirmar**
- Qual versão de `talkx-send`, `talkx-scheduler` e `evolution-webhook` está no ar. Não há registro de deploy posterior a V03 (motivo de pausa + política de retomada), V07 (webhook passa a chamar `talkx_suppress_contact`) e às correções de 30/09–01/10. O clone local tem 1 commit e nenhuma tag (`git tag -l` vazio), então as tags `edge-deploy/*` não estão disponíveis aqui.
- Se os secrets existem nas edges: `EVOLUTION_INSTANCE_TOKEN`, `EVOLUTION_API_URL/KEY`, `RESEND_API_KEY`, `TALKX_LINK_IP_SALT` (este tem fallback: `link:23`).
- Se os segredos do Vault usados pelo cron (`talkx_scheduler_url`, `talkx_anon_key`) estão corretos e qual é o comando efetivo do job (a migration diz "já criado via MCP", `M:20260909000000:11`).
- Se o domínio `promobrindes.com.br` está verificado no Resend (`report:162`).

**Consequência prática:** antes de qualquer disparo real, comparar os 5 digests (`talkx-send`, `talkx-scheduler`, `talkx-link`, `talkx-report`, `evolution-webhook`) com o manifesto e reimplantar o que divergir.

---

## Cobertura de testes

**Unitários (Vitest, front)** — 87 testes em 10 arquivos: `src/components/talkx/__tests__/TalkX.test.tsx` (32), `useCampaignEditor.test.tsx` (24), `talkxSharedPersonalizePreview.test.ts` (6), `TalkXView.route.test.tsx` (5), `talkxWizardRoute.test.ts` (4), `TalkXSuppression.authoring.test.tsx` (2), `talkxMessageSnapshot.test.ts` (2), `talkxCampaignDraft.test.ts` (1); `src/hooks/integrations/__tests__/useTalkXMonitor.test.ts` (6), `useTalkXSegments.test.ts` (5). Supabase é mockado.

**Deno (edge)** — rodam no CI (`.github/workflows/ci.yml:76-100`):
- `talkx-send/index.test.ts`: 29 testes — `personalize` (10), auth (6), `start` (6: feliz, 404, sem conexão, janela fechada, suprimido, 5xx → `outcome_unknown`), `test` (2), `pause`/`cancel`/ação inválida (3), sabor GO (2). Tudo com Supabase, RPCs e `fetch` falsos (`talkx-send/_test-utils.ts:64-166`), sempre **1 destinatário** e intervalos 0.
- `talkx-report/index.test.ts`: 1 (`escHtml`).
- `_shared/__tests__/talkx-resume-policy.test.ts`: 10; `talkx-delivery-connection.test.ts`: 1.

**SQL em Postgres 17 descartável** (`.github/workflows/db-guard.yml:287-410`): histórico de template, FK `saved_by`, policy da blacklist, limites (4 arquivos), escape hatch, guards fail-closed, replay de settings, supressão por telefone, view invoker, snapshot de destinatários, save de rascunho, leases, snapshot de mensagem, transições (2), overload no PostgREST, contrato de eventos. `db-live-guard.yml:152-171` confere ao vivo a view e a assinatura da transição.

**Contratos estáticos (leitura de fonte, `scripts/db-audit/*.test.mjs`)**: scheduler (1), analytics (8), leases (8), links E90 (14), fuso (4), navegação (1). Protegem contra regressão de texto, não comportamento.

**E2E (Playwright)** — `e2e/talkx.spec.ts`, 7 testes: visão geral, abrir wizard, ajuda, abas, campos do passo 1, stepper, avançar ao passo 2. Roda pós-merge (`e2e-logado.yml:73`) e em push de branch (`e2e-talkx-pr.yml:20-29,62`), sem ser obrigatório.

**Lacunas**
- Nenhum teste de `talkx-link` (handler), do handler do `talkx-scheduler`, de `talkx-reply`, do opt-out/entregue/resposta no webhook, nem de `pickVariant`.
- Nenhum teste do loop com mais de 1 destinatário, de `retry_after`, de orçamento de tempo ou de reentrada em `sending`.
- Nenhum teste de papel (agente agendando campanha) nem de RLS por tabela do módulo.
- Nenhum teste de carga ou de `max-rows`.
- **Regressão visual: não existe** — `toHaveScreenshot`/`toMatchSnapshot` têm 0 ocorrências em `e2e/` e `src/`.
- **Stub da Evolution para E2E de envio: não existe** — 0 `page.route`/MSW em `e2e/`; nenhum spec lança campanha.
- As 4 RPCs de agregação não têm teste de resultado (só grants) e não têm consumidor.

---

## Etapas do V3 relacionadas e lacunas do próprio V3

Fonte: `docs/talkx/PLANO_TALKX_V3_100_ETAPAS_2026-09-29.md`. V11 já está na `main`.

| Etapa | Cobre | Não cobre (lacuna) |
|---|---|---|
| V11 eventos (feito) | tipos novos, alvo de entidade | escritor de cada tipo (fica para V12/V19/V71–V80) |
| V12 servidor grava ciclo de vida | `started/paused/resumed/cancelled/completed` nas RPCs | a RPC roda como service role: precisa receber o ator por parâmetro; `skipped_suppressed` agregado só aparece na V80 |
| V13 pausa com motivo, retomada idempotente | `reason`, `resume` sem erro em `sending` | não diz que `start` em `sending` deve **continuar o envio** (CAP-007) |
| V14 cancelar marca pendentes | status `cancelled` de destinatário | incluir o status na lista de colunas do realtime e no claim |
| V15 contadores | `replied_count` no guard, `use_count` único | contador de pulados pelo claim (CAP-107) |
| V16 séries | `sent`+`delivered`, 7 dias, alcance distinto | filtro `'running'` inexistente em `talkx_overview_stats`; série por minuto do monitor |
| V17 lidas | `read_at`, RPC, webhook | READ sem ACK deve marcar entrega; heurística `Chat === Sender` do adaptador GO |
| V18 respostas | janela por setting, tempo médio | `void` sem await no webhook; contato LID/duplicado |
| V19 retry manual, `outcome_unknown`, conexão | `action=retry`, eventos, logger | quem reprocessa `retry_after` automático; reconciliação com o provedor; reaper de `sending` com dispatch (CAP-009) |
| V20 limite diário e horário comercial | `daily_limit`, `business_hours` | limite por minuto (mock 12: "200 mensagens/min"), dias da semana, DND, uma campanha por conexão |
| V27 mídia | bucket `talkx-media`, upload, URL assinada | lista fixa de buckets em `evolution-api-proxy.ts:290`; CHECK `^https://` em templates/variantes/RPC; nome de arquivo do documento; assinatura no envio de teste |
| V30 recorrência | `recurrence`, clone pelo scheduler | idempotência do clone (2 schedulers simultâneos → 2 campanhas); auth do scheduler |
| V81 UI de links | RLS de escrita, slug, `{{link}}` | vários links por mensagem (mock 14 lista 5); UTM; domínio próprio em vez de `supabase.co` (cita `VITE_TALKX_LINK_BASE` sem redirecionador) |
| V82 conversão autenticada | segredo/HMAC, relatório de links | leitura de `talkx_conversions` pelo front (sem grant/policy); validação de `value` |
| V83 insights | corrigir regra, `apply()`, flag de IA | regras continuam no cliente com `.limit(2000)` |
| V84 configurações vivas | backend lê as 6 chaves | seed inválido `default_speed_profile='balanced'`; `GRANT ALL` a `anon` em `talkx_settings` |
| V85 alertas | N8N, Sentry | alerta de "sending sem `sent_at` >30 min" detecta o risco 1, não corrige; sem leitura de `net._http_response` |
| V86–V87 importação | tabelas, CSV, matcher | mock 15 aceita `.xlsx`; `contacts` não tem coluna de documento (CPF/CNPJ) |
| V88–V90 CRM 360 | vínculos, pendentes, conversão via Bitrix | o CRM real do projeto é o Supabase `pgxfvjmuubtbowutlide` + `crm_contact_links` (já existe, 0 linhas); `talkx_crm_links` duplicaria; mock mostra HubSpot/Salesforce/Pipedrive/RD |
| V98 banco limpo | replay, ledger, catálogo | policy `talkx_blacklist_update` alterada sem criação em migration (`M:20260910100000`) |
| V99 smoke | 5 contatos internos, ciclo completo | 5 contatos cabem em uma invocação: não expõe o risco 1; falta caso com ≥ 50 destinatários e com queda de invocação |

**Sem etapa nenhuma no V3**
1. Continuidade do worker: lote, orçamento de tempo, re-invocação de `sending` (CAP-007) e reaper (CAP-009).
2. Papel no banco: agente agenda e o cron dispara (CAP-096).
3. Autenticação do scheduler (CAP-098).
4. Resolver audiência no servidor, com paginação e elegibilidade (CAP-003, CAP-004, CAP-103).
5. Multi-segmento, fila por segmento e `segment_id` por destinatário — só em backlog (V100), mas pedidos pelos mocks 09, 11, 12, 13 e 14.
6. Botões, lista e enquete (mocks 04 e 09).
7. Conexão escolhida de fato usada no envio (token por instância) e serialização por conexão.
8. Política para variável sem valor e sem fallback (hoje envia `[variavel]`); V65 só acrescenta `{{x|padrão}}`.
9. Precedência entre texto editado na campanha e variantes A/B; vencedor do A/B.
10. Opt-out gravando a campanha (V33 presume `talkx_blacklist.campaign_id`, V78 não manda preencher); novo opt-out após supressão expirada.
11. Retenção e consentimento LGPD (`consent_status`, expurgo).
12. Previsões do servidor (ETA, "Previsto", taxa projetada, risco de opt-out) e "Receita influenciada".
