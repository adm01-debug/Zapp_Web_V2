# Telefonia — Contrato de domínio

Fonte de verdade do módulo Telefonia (`?view=voip`) do ZAPP WEB V2.
Deriva da seção 2.7 do plano `docs/design/PLANO_MELHORIAS_TELEFONIA_100_ETAPAS.md`, com as
divergências medidas no banco oficial em 26/09/2026 (registradas em `docs/design/TELEFONIA_STATUS.md`).

## 1. Canal (`calls.channel`)

`'voip' | 'whatsapp'`.

Backfill aplicado na migration `20260926190000_calls_telefonia_v2.sql`:
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
  `completed → ended`, `ongoing → answered` (`normalizeStatus` em `src/lib/calls/callStatus.ts`).

## 3. Resultado exibido (`toResult(row)` em `src/lib/calls/callStatus.ts`)

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
| D3 | Gravações | **aberto** — nenhuma fonte comprovada (sem bucket de Storage, sem webhook REST do Bitrix). `recording_status` fica `none` e nenhum botão é renderizado |
| D4 | Escopo "Todas as ligações" | **(a)** seletor só para admin/supervisor |
| D5 | Linhas por página | **8** |
| D6 | KPIs respondem a busca/filtros? | **não** (escopo + período + canal, com rótulo explícito) |
| D7 | Recusar chamada WhatsApp | **aberto** — endpoint de rejeição da Evolution GO não comprovado; rótulo honesto ("Ignorar") até prova |

## 8. RPCs do contrato (migration `20260926190000_calls_telefonia_v2.sql`)

| RPC | Papel |
|---|---|
| `search_my_calls(p_scope, p_channel, p_direction, p_result, p_from, p_to, p_q, p_limit, p_offset)` | histórico paginado com `total_count`; `p_limit` limitado a 50; ordem `started_at desc, id desc` |
| `my_calls_kpi(p_scope, p_channel, p_from, p_to)` | total, realizadas, recebidas, perdidas recebidas, atendidas, média de conversa |
| `upsert_my_call(...)` | persistência idempotente da chamada VoIP do próprio agente; `agent_id` imutável |
| `set_call_agent_notes(p_call_id, p_notes)` | anotação humana; dono ou admin/supervisor |

Prova comportamental: `scripts/db-audit/calls-telefonia-contract.test.sh` (PostgreSQL 17 descartável,
61 asserções, incluindo RLS por ator, IDOR, teto de 50, idempotência e ACL de `anon`).

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
