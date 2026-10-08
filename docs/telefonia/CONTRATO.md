# Telefonia — Contrato de domínio

Fonte de verdade do módulo Telefonia (`?view=voip`) do ZAPP WEB V2.
Deriva da seção 2.7 do plano `docs/design/PLANO_MELHORIAS_TELEFONIA_100_ETAPAS.md`, com as
divergências medidas no banco oficial em 26/09/2026 (registradas em `docs/design/TELEFONIA_STATUS.md`).

**Revisão final (T92) de 08/10/2026, contra a cabeça do dia `dia/2026-10-08` — commit `c79b2e34c`.**
Nenhuma afirmação abaixo fica sem arquivo e linha de código correspondente (a guarda
`scripts/db-audit/telefonia-docs-revisao.test.mjs` recusa citação de arquivo que não existe); as
medições de banco continuam sendo as de 26/09/2026, marcadas como tais. O estado do snapshot de
contrato (T93) está na seção 10.

## 1. Canal (`calls.channel`)

`'voip' | 'whatsapp'`.

Backfill aplicado na migration `supabase/migrations/20260926800000_calls_telefonia_v2.sql` (reversionada três vezes — ver `docs/design/TELEFONIA_STATUS.md`):
`whatsapp_connection_id IS NOT NULL → 'whatsapp'`, senão `'voip'`.
Evidência no banco oficial antes do backfill: 21 linhas → **10 `whatsapp` / 11 `voip`** (a única trilha que
preenche `whatsapp_connection_id` é o webhook da Evolution; o SIP nunca preenche).

**Canal ≠ transporte.** O filtro de canal do histórico e o canal escolhido para discar são estados
independentes — trocar a aba do histórico **não** muda o segmentado do painel lateral.

## 2. Status persistido (`calls.status`)

União do que existe hoje, sem apagar legado:

```
ringing | answered | ended | missed | busy | failed | cancelled | declined
```

- O CHECK do banco (`calls_status_check`) foi **ampliado** para incluir `cancelled` e `declined`
  (antes: só `ringing|answered|ended|missed|busy|failed`). Ampliação = superconjunto: nenhuma linha
  existente viola, nenhum dado foi reescrito.
- Legados são traduzidos **na leitura**, nunca com `UPDATE` em massa:
  `completed → ended`, `ongoing → answered` (`normalizeStatus` em `src/lib/calls/callStatus.ts:155`).

## 3. Resultado exibido (`toResult(row)` em `src/lib/calls/callStatus.ts:225`)

| Persistido + contexto | Resultado | Rótulo (pt-BR) | Tom |
|---|---|---|---|
| `ended`/`completed` com `answered_at` | `completed` | Concluída | success |
| `ended`/`completed` sem `answered_at`, inbound | `missed` | Perdida | destructive |
| `ended`/`completed` sem `answered_at`, outbound | `no_answer` | Não atendida | destructive |
| `missed` | `missed` | Perdida | destructive |
| `busy` | `busy` | Ocupado | warning |
| `failed` | `failed` | Falhou | muted |
| `cancelled` (cancelada por nós antes de atender) | `cancelled` | Cancelada | muted |
| `declined` (recusada por nós) | `declined` | Recusada | muted |
| `answered`/`ongoing` sem `ended_at` | `in_progress` | Em andamento | primary (pulse) |
| `ringing` sem `ended_at` | `ringing` | Tocando | primary (pulse) |

## 4. Duração

- **`talk_seconds`** (novo) = atendimento → término. É o que aparece na coluna "Duração" e o que entra na média.
- **`duration_seconds`** (legado) permanece no banco, mas **não é exibido**.
- Backfill: só onde `answered_at` e `ended_at` existem. No banco oficial isso deu **0 linhas** (medido: 0 de 21 chamadas com os dois timestamps).
- Formatos: tabela `mm:ss` / `h:mm:ss`; KPI `3m 42s` / `1h 02m` / `45s`; `null | 0` → `—`.

## 5. Identidade e autoria

- **`provider_call_id`** = identidade da chamada no provedor (SIP `Call-ID` / Evolution `data.id` /
  Bitrix `CALL_ID`), **único por canal** (`calls_channel_provider_call_unique`, parcial em `provider_call_id IS NOT NULL`).
- `provider_event_id` continua como está (chave do evento do webhook, unique por conexão).
- O front gera o `id` (uuid) **antes** de discar e atualiza sempre a mesma linha (`upsert_my_call`).
  Uma ligação = uma linha, do primeiro evento ao fim.
- **`agent_id`** = responsável no momento do fato e **não é regravado** por eventos seguintes
  (o `ON CONFLICT` de `record_incoming_call_event` usa `COALESCE(calls.agent_id, EXCLUDED.agent_id)`).
- **`answered_by`** = quem atendeu de fato (≠ quem era o responsável).
- **`notes`** = metadado automático do provedor ("Chamada de voz"/"Chamada de vídeo"), **somente leitura** no app,
  e nunca sobrescrito (`COALESCE(calls.notes, EXCLUDED.notes)`).
- **`agent_notes`** = anotação humana, gravada **só** por `set_call_agent_notes` (dono ou admin/supervisor).

## 6. Escopo

- `mine` = `agent_id` = perfil do `auth.uid()`.
- `all` = só para `is_admin_or_supervisor(auth.uid())` — decidido **dentro** da RPC
  (`search_my_calls`, `my_calls_kpi`), nunca pelo front. Foi medido: agente pedindo `scope=all` recebe
  exatamente o mesmo conjunto de `scope=mine`.
- KPIs seguem **escopo + período + canal**. **Não** seguem busca/direção/resultado: o rótulo
  "Minhas ligações · Últimos 7 dias" deixa isso visível. O total do KPI é `total_count` do universo,
  nunca o tamanho da página.

## 7. Decisões de negócio aplicadas

| # | Decisão | Aplicado |
|---|---|---|
| D1 | Ramal SIP compartilhado (`phone1`) | **(a)** manter e sinalizar conflito de registro; ramal por agente fica como P2 |
| D2 | Ligação de saída por WhatsApp | **(a)** só receber eventos; opção visível e desabilitada, com motivo honesto |
| D3 | Gravações | **(a) reconciliar com o Bitrix24** — decidido por Joaquim em 29/09 e **entregue no código** (T71–T74): `sync-call-records` grava o par a partir de `voximplant.statistic.get` (`supabase/functions/sync-call-records/index.ts:121` e `:125`) e `get-call-recording` entrega o áudio com o JWT de quem pede (`supabase/functions/get-call-recording/index.ts:119`). O app **não** captura áudio (`canRecord:false` em `src/hooks/calls/useCallChannels.ts:114`) e o botão só aparece com `recording_status='available'` (`src/components/calls/CallHistoryTable.tsx:99`, `src/components/calls/SelectedCallPanel.tsx:123`). **Pendente de configuração, não de código:** `BITRIX_WEBHOOK_URL` na Edge — sem ela `recording_status` fica `none` em toda chamada |
| D4 | Escopo "Todas as ligações" | **(a)** seletor só para admin/supervisor |
| D5 | Linhas por página | **8** |
| D6 | KPIs respondem a busca/filtros? | **não** (escopo + período + canal, com rótulo explícito) |
| D7 | Recusar chamada WhatsApp | **aberto** — endpoint de rejeição da Evolution GO não comprovado; rótulo honesto ("Ignorar") até prova |

## 8. RPCs do contrato (migration `supabase/migrations/20260926800000_calls_telefonia_v2.sql`)

| RPC | Papel |
|---|---|
| `search_my_calls(p_scope, p_channel, p_direction, p_result, p_from, p_to, p_q, p_limit, p_offset)` | histórico paginado com `total_count`; `p_limit` limitado a 50; ordem `started_at desc, id desc` |
| `my_calls_kpi(p_scope, p_channel, p_from, p_to)` | total, realizadas, recebidas, perdidas recebidas, atendidas, média de conversa |
| `upsert_my_call(...)` | persistência idempotente da chamada VoIP do próprio agente; `agent_id` imutável |
| `set_call_agent_notes(p_call_id, p_notes)` | anotação humana; dono ou admin/supervisor |

Prova comportamental: `scripts/db-audit/calls-telefonia-contract.test.sh` (PostgreSQL 17 descartável,
prova de RLS por ator, IDOR, teto de 50, idempotência e ACL de `anon`; asserções cresceram para cobrir
o 2º bug de autorização abaixo).

**Correção de segurança #2 em `set_call_agent_notes` (27/09, auditoria de 5 agentes pós-deploy):**
`calls.agent_id` aceita NULL (chamada inbound ainda sem agente atribuído) e `if not (v_owner = v_profile
or is_admin_or_supervisor(...))` com `v_owner` NULL avalia para NULL — mesmo bypass do bug original
(20260926900000), agora do lado do dono da chamada em vez do perfil do chamador. Corrigido em
`supabase/migrations/20260927100000_fix_set_call_agent_notes_null_owner.sql` trocando a comparação por
`coalesce(v_owner = v_profile, false)`. Chamada sem dono só pode ser anotada por admin/supervisor.

**RPC do webhook (`record_incoming_call_event`).** Fora da tabela acima porque quem chama é o webhook
da Evolution, com `service_role` (`supabase/functions/_shared/evolution-webhook-handlers.ts:314`). Ela
é uma das 5 funções do escopo do snapshot de contrato (seção 10) e mudou duas vezes depois de 29/09:
`supabase/migrations/20261002531230_t26_record_incoming_call_event_direction.sql` (T26) acrescentou
`p_direction text`, usado como `coalesce(p_direction, 'inbound')` nas duas inserções; e
`supabase/migrations/20261004172554_fecha_record_incoming_call_event.sql` (M-DB-02, P0 de segurança)
derrubou o overload de 6 argumentos e deixou `EXECUTE` só para `service_role`.

## 9. Glossário de rótulos (linguagem operacional — nada de jargão na tela do agente)

| Situação técnica | O que a tela diz |
|---|---|
| `sipStatus === 'registered'` | "VoIP disponível" |
| backoff de reconexão | "Reconectando…" |
| sem provisionamento / 403 / rede | "Telefone indisponível" |
| `getUserMedia` → `NotAllowedError` | "Microfone bloqueado — libere no navegador" |
| `getUserMedia` → `NotFoundError` | "Nenhum microfone encontrado" |
| `getUserMedia` → `NotReadableError` | "Microfone em uso por outro programa" |
| linha WhatsApp sem originação | "Ligação por WhatsApp não disponível nesta linha" |
| linha já registrada por outro usuário | "Linha em uso por outro usuário" |

**Proibido na tela do agente:** SIP, WSS, porta, segredo, Supabase, "Adicione o segredo SIP_PASSWORD".

## 10. Revisão final (T92) e snapshot do contrato (T93)

**T92 — revisão contra o código final.** Este contrato e `docs/telefonia/CAPACIDADES.md` foram
revisados em **08/10/2026** contra a cabeça do dia `dia/2026-10-08` (commit `c79b2e34c`). O que estava
sem linha de código correspondente e foi corrigido: a citação do `onInvite` (o arquivo saiu de
`src/hooks/communication/`, hoje é `src/hooks/sip/useSipConnection.ts:103`), a do `handleCallEvent`
(hoje `supabase/functions/_shared/evolution-webhook-handlers.ts:270`) e o **D3** de gravações, que
descrevia como "aberto" uma integração já entregue (seção 7). A guarda
`scripts/db-audit/telefonia-docs-revisao.test.mjs` recusa citação de arquivo inexistente nos dois
documentos.

**T93 — snapshot final.** O snapshot é produzido por `scripts/db-audit/telefonia-snapshot.mjs`, que
exige `DESTINO_URL` do banco canônico (a identidade é conferida antes de qualquer consulta; sem ela o
script sai com código 2 e não escreve nada). O único snapshot vivo no repositório é
`docs/design/telefonia-baseline-2026-09-29/pos-fase-0.json` (29/09/2026: 22 chamadas, 23 colunas, 8
índices, 3 policies, 11 constraints, funções do escopo com o ACL daquele dia). A **execução** do
snapshot final é ato de dono (credencial de produção) e **não** foi feita por agente — nenhum arquivo
de snapshot final foi inventado, e nenhuma medida foi estimada.

O que o aceite do T93 pede ("só as 0–1 migrations deste plano aparecem") é conferível sem credencial
contra o retrato canônico já commitado (`supabase/schema-catalog.json`,
`supabase/schema-manifest.json` e `scripts/db-audit/realtime-publication-baseline.json`, gerados do
banco canônico): comparado com `docs/design/telefonia-baseline-2026-09-29/pos-fase-0.json`, o contrato de `public.calls` **não mudou** — as
mesmas 23 colunas, os mesmos 8 índices, as mesmas 3 policies, os mesmos 11 constraints (incluindo
`calls_status_check` com `cancelled`/`declined` e `calls_recording_status_check` com
`none/pending/available/failed`) e `calls` continua na publicação `supabase_realtime`. A única
diferença nas 5 funções do escopo é `record_incoming_call_event`, pela T26 (overload novo com
`p_direction`) e pelo M-DB-02 (overload de 6 argumentos derrubado, `EXECUTE` só para `service_role`).
