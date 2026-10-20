# Auditoria exaustiva — Telefonia (`?view=voip`): estado real em 2026-09-29

**Objeto:** `docs/design/PLANO_MELHORIAS_TELEFONIA_100_ETAPAS.md` (v1.0, 26/09) e seu ledger `docs/design/TELEFONIA_STATUS.md`.
**Base auditada:** `main` @ `e433589` · banco `tnnnlkbymytvtqngbbqh` ao vivo (29/09 ~13:50 UTC) · PRs #868, #875, #930, #945.
**Método:** leitura integral do plano (753 linhas) e do ledger (358 linhas); leitura linha a linha de `VoIPPanel.tsx`, `useSipClient.ts`, `useSipConnection.ts`, `CallSessionProvider.tsx`, `ActiveCallBar.tsx`, `IncomingCallAlert.tsx`, `useCalls.ts`, `useCallHistory.ts`, `get-sip-password/index.ts`, `evolution-webhook-handlers.ts`; grep de consumidores; `information_schema`, `pg_proc`, `pg_policies`, `pg_constraint`, `pg_indexes`, `pg_publication_tables`, ledger e contagens em `calls`.

## 1. Resumo executivo

| | Etapas |
|---|---|
| **DONE** (conferido em código/banco) | **27** |
| **PARCIAL** (existe algo, incompleto ou divergente do plano) | **16** |
| **AUSENTE** | **57** |

1. **Fases 0–2 estão feitas e aplicadas em produção** (CP0–CP2 `[x]` no ledger, confirmado ao vivo): as 9 colunas, 6 CHECKs, 3 índices novos, `calls` na publication e as 4 RPCs (`search_my_calls`, `my_calls_kpi`, `upsert_my_call`, `set_call_agent_notes`) existem, com os dois fixes de segurança (`20260926900000`, `20260927100000`) aplicados. `record_incoming_call_event` preserva `agent_id`/`notes` (`COALESCE` confirmado). Contrato de domínio `src/lib/calls/` com 6 módulos e 217 testes.
2. **Nada disso é usado.** `grep -rln "@/lib/calls" src` fora de `src/lib/calls` = **0 arquivos**. `grep -rn "search_my_calls|my_calls_kpi|upsert_my_call|set_call_agent_notes" src` fora de `types.ts` = **0**. No banco: 22 linhas em `calls`, **0** com `end_reason`, **0** com `provider_call_id`, **0** com `talk_seconds`, **0** com `agent_notes`. O front continua gravando pelo caminho antigo (`useCalls.startCall` → `INSERT` direto sem `channel`/`peer_number`; `addCallNotes` → coluna `notes`, que o contrato reservou ao provedor).
3. **Fase 3 foi feita pela metade pela PR #868 (26/09), antes do plano** — e o ledger registra isso como divergência, não como etapas fechadas. O que existe: `onInvite` + `acceptIncomingCall`/`rejectIncomingCall`, `sessionRef` síncrono, `Terminated` lê `answeredAt`, `CallSessionProvider` (22 linhas, contexto fino sobre `useSipClient`), `ActiveCallBar` (flutuante, canto inferior direito), timer de reconexão cancelado. O que **não** existe: máquina de estados no provider (`session.ts` é código morto), adapters, provisionamento por Edge (`SIP_SERVER`/`SIP_USER`/`SIP_WS_PORT` seguem hardcoded em `useSipClient.ts:15-17`), persistência por `upsert_my_call`, `end_reason`/`talk_seconds`, tratamento de microfone, `BroadcastChannel`, identidade por `metadata.call_id`.
4. **Fases 4–12 (etapas 42–100): 0 concluídas.** A tela atual é a de antes do plano com dois retoques (título "Telefonia", filtros client-side): KPIs calculados sobre `statsRows` (query sem período), sem `PageHeader`, sem seletor de período, sem escopo Minhas/Todas, sem paginação (é "Carregar mais"), sem `NewCallPanel`/`ContactPicker`/`Keypad`, botão "Conectar SIP" ainda visível no `DialPad`, `IncomingCallAlert` ainda abre `CallDialog` e `CallDialog` ainda insere por conta própria quando não recebe `existingCallId`.
5. **Bloqueios do ledger continuam:** credenciais de QA ausentes no host (E.1–E.5, screenshots), gravação sem fonte (D3), recusa WhatsApp sem endpoint comprovado (D7). Nenhum foi resolvido em 3 dias. **Nenhuma chamada real foi homologada** (etapa 100).
6. **Dois fatos novos desde o ledger:** (a) há uma segunda conexão WhatsApp, `[E2E] Conexão WhatsApp Teste` (`E2E_FIXTURE`, `connected`), semeada para o Talk X — a linha real `PRINCIPAL` continua `disconnected`; (b) a PR #875 (PR-A) foi **fechada sem merge** — o conteúdo entrou por #930/#945, o ledger cita #875 como "PR-A" e não registra a substituição.

## 2. Estado ao vivo (medido)

### 2.1 Banco (`public.calls`)
- Colunas (23): as 14 originais + `channel, provider_call_id, peer_number, peer_name, answered_by, end_reason, agent_notes, recording_status, talk_seconds`. ✅
- CHECKs: `calls_status_check` (8 valores, inclui `cancelled`/`declined`), `calls_channel_check`, `calls_end_reason_check` (11 valores), `calls_recording_status_check`, `calls_direction_check`, `calls_provider_event_id_length`. ✅
- Índices: `calls_agent_started_idx (agent_id, started_at DESC, id DESC)`, `calls_channel_provider_call_unique` (parcial), `idx_calls_answered_by` + os 4 antigos. ✅
- Publication `supabase_realtime`: `calls` presente. ✅
- Policies (3, `authenticated`): SELECT dono ou `is_admin_or_supervisor`; INSERT idem; UPDATE só dono. ✅ (plano previa criar `calls_insert_own`/`calls_update_own` só se faltassem — não faltavam.)
- RPCs: `search_my_calls` (9 args, INVOKER), `my_calls_kpi` (4 args, INVOKER), `upsert_my_call` (12 args, INVOKER), `set_call_agent_notes` (SECDEF, guardas `v_profile is null` e `coalesce(v_owner = v_profile,false)` ✅), `record_incoming_call_event` (service_role, `COALESCE` de `agent_id`/`notes` ✅). `proacl` sem `anon`/PUBLIC. ✅
- Ledger: `20260926800000 calls_telefonia_v2`, `20260926900000`, `20260927100000` — arquivos em `main`, paridade ok. ✅
- **Dados:** 22 linhas (12 `voip`, 10 `whatsapp`); 10 sem `agent_id` (inbound WhatsApp sem `assigned_to`); status `ringing/inbound` 10, `ringing/outbound` 10, `ended/outbound` 2; **0** `answered_at`+`ended_at`; **0** `end_reason`; **0** `provider_call_id`; **0** `talk_seconds`; **0** `agent_notes`; `recording_status` = `none` em todas; última chamada `2026-09-26 20:13 UTC`. → 20 das 22 linhas estão **presas em `ringing`** para sempre (nunca receberam `ended`/`missed`): o motor antigo não fecha a linha quando o INVITE falha antes de `Terminated`, e o webhook WhatsApp só grava `ringing` (o Evolution GO não manda `terminate`/`timeout` ou o handler não os mapeia — a normalização só cobre `offer/ringing`).
- Storage: nenhum bucket `record*`/`call*`. Sem `BITRIX_WEBHOOK_URL`. → D3 = (b), gravação inexistente.
- `whatsapp_connections`: `PRINCIPAL` (`disconnected`, default) + `[E2E] Conexão WhatsApp Teste` (`connected`, fixture). Sem coluna de flavor.

### 2.2 Código (`main` @ `e433589`)
| Arquivo | Linhas | Estado |
|---|---|---|
| `src/components/calls/VoIPPanel.tsx` | 351 | Título "Telefonia" + subtítulo ✅; 5 KPIs client-side sobre `statsRows` (sem período, `Math.round(avg/60)min`); filtros busca/canal/direção/resultado client-side via `useCallHistory` (`.from('calls').eq('agent_id')`, `.range()`, "Carregar mais"); detalhe lateral com `<audio src={recording_url}>` cru e notas em `notes`; `DialPad` no lugar do painel "Nova ligação"; `motion.div` no título e stagger por linha (que o plano manda remover) |
| `src/components/calls/DialPad.tsx` | 239 | Botão "Conectar SIP"/"Desconectar" (`:100-104`); `Keypad` **não** extraído |
| `src/components/calls/CallDialog.tsx` | 283 | `startCall` ao abrir quando sem `existingCallId` (`:65-76`); `isMuted`/`isSpeakerOn` locais (`:55-56`); aberto direto por `ContactHeaderSection.tsx:212` |
| `src/components/calls/IncomingCallAlert.tsx` | 171 | Toque WebAudio com preferência de silêncio ✅; Atender → `answerCall` + `CallDialog`; Recusar → `missCall` (não `declined`); timeout 30 s fixo; sem canal |
| `src/components/calls/ActiveCallBar.tsx` | 72 | Existe (#868): `fixed bottom-24 right-4`, some em `?view=voip`, Mute/Encerrar/Atender ✅; sem `CallChannelBadge`, sem clique → `?view=voip`, sem "em outra aba"; **não** está no `AppShell` como o plano pede (está em `App.tsx:63`) |
| `src/providers/CallSessionProvider.tsx` | 22 | Contexto fino: `useSipClient()` montado 1× (sessão sobrevive à navegação ✅); sem máquina de estados, sem adapters, sem `openDialer`, sem capacidades |
| `src/hooks/communication/useSipClient.ts` | 268 | `onInvite` via `useSipConnection` ✅; `sessionRef` síncrono ✅; `Terminated` lê `answeredAtRef` ✅; persistência por `useCalls` (`startCall`/`answerCall`/`endCall`/`missCall` = INSERT + UPDATEs diretos, sem `channel`/`peer_number`/`end_reason`/`talk_seconds`/`provider_call_id`); `SIP_SERVER/USER/WS_PORT` hardcoded; `findContactByPhone` ainda tem fallback por sufixo de 8 dígitos (`:70-73`, agora "só se único") — o plano proíbe; `toggleMute` lê `isMuted` do estado, não das tracks; sem `getUserMedia` prévio/erros de microfone |
| `src/hooks/sip/useSipConnection.ts` | 104 | `reconnectTimeoutRef` cancelado em `disconnect` ✅; backoff 2→30 s, 5 tentativas ✅; status só `disconnected|connecting|registered|error` (sem `reconnecting`/`unavailable`); sem guard de UA único; `connect` recursivo em `onDisconnect` |
| `src/hooks/communication/useIncomingCallListener.ts` | 146 | Dedupe por `notification.id` + `metadata.event_id` (35 s); `metadata.call_id` tipado mas **não usado** como identidade; não ignora chamada já encerrada |
| `src/hooks/communication/useCalls.ts` | 194 | `addCallNotes` → `update({ notes })` (`:156`) — grava na coluna do provedor |
| `src/hooks/communication/useCallHistory.ts` | — | `useInfiniteQuery` direto em `calls` + busca em `contacts` (`ilike`, `limit(200)`) — ignora `search_my_calls`/`my_calls_kpi` |
| `src/lib/calls/*` | 6 módulos | 217 testes ✅; **0 importadores** |
| `supabase/functions/get-sip-password/index.ts` | — | Devolve `{ password, profileId }` — sem `server/user/wsPort` |
| `supabase/functions/_shared/evolution-webhook-handlers.ts` | `handleCallEvent :245-295` | Só `normalizeEvolutionCallStatus` + RPC; sem `terminate/timeout/accept/reject`, sem direção (`fromMe`), sem timestamp do provedor; sem fixtures |
| `src/components/inbox/contact-details/ContactActionButtons.tsx:127` | — | Ainda emite `start-voip-call` (0 consumidores; `events.ts` só define a constante legada) |
| `src/pages/ViewRouter.tsx:33` | — | `COMPACT_GUTTER_VIEWS = {dashboard, talkx, catalog}` — `voip` fora |
| `src/components/layout/PageHeader.tsx` | — | Sem prop `icon` |
| Testes | — | `VoIPPanel.test` 9, `DialPad.test` 39, `ActiveCallBar.test` 4, `useSipClient.test` 27, `useSipConnection.test` 3; `voip-security-gaps.test.ts` ainda tautológico (1 `expect(true)`); sem `calls-access.test.ts`; sem E2E; 18 entradas de `calls/communication/sip` no `eslint-baseline.json` |
| Docs | — | `CONTRATO.md` ✅, `CAPACIDADES.md` ✅ (26/09), `HOMOLOGACAO.md` ✗ |

## 3. Status etapa por etapa

Legenda: ✅ DONE · ◐ PARCIAL · ✗ AUSENTE · ⛔ bloqueado (registrado no ledger).

### Fase 0 — Preparação (1–9) — 6 ✅ · 1 ◐ · 2 ⛔
| Etapa | Status | Evidência |
|---|---|---|
| 1 worktree/branch | ✅ | ledger (fluxo Hermes, desvio registrado) |
| 2 PRs abertas | ✅ | ledger (0 PRs; #868 anotada) |
| 3 ledger | ✅ | `TELEFONIA_STATUS.md` commitado |
| 4 grafo | ◐ | `graphify` indisponível; substituído por grep (aceito pelo plano) |
| 5 inventário | ✅ | tabela no ledger |
| 6 provedores | ✅ | `CAPACIDADES.md` (SIP Bitrix; 1 linha `PRINCIPAL`; sem reject; sem gravação) |
| 7 QA tooling | ⛔ | credenciais ausentes no host; papel do QA não verificado |
| 8 baseline gates | ✅ | 5 comandos exit 0 no ledger |
| 9 `00-before.png` | ⛔ | mesmo bloqueio |

### Fase 1 — Contrato de domínio (10–17) — 8 ✅
`callStatus.ts`, `duration.ts`, `phone.ts`, `capabilities.ts`, `session.ts`, `events.ts` + 6 testes (217), `CONTRATO.md`, commit. Gate `deps react/supabase = 0` ✅. **Ressalva:** tudo sem consumidor (ver seção 1.2).

### Fase 2 — Banco (18–28) — 11 ✅
18 schema efetivo ✅ · 19 migration (`20260926800000`, reversionada 3×) ✅ · 20 `search_my_calls` ✅ · 21 `my_calls_kpi` ✅ · 22 `upsert_my_call` (policies já existiam) ✅ · 23 `set_call_agent_notes` + `record_incoming_call_event` (`COALESCE`) ✅ · 24 publication ✅ · 25 D3=(b) registrado ✅ · 26 prova de RLS (61 asserts, no CI `db-guard.yml:263`) ✅ · 27 `types.ts` (4 RPCs + 9 colunas) ✅ · 28 PR-A ✅ (aplicada 26/09; **#875 fechada sem merge**, conteúdo via #930; +#945 fix #4).

### Fase 3 — Motor (29–41) — 0 ✅ · 8 ◐ · 5 ✗
| Etapa | Status | Evidência |
|---|---|---|
| 29 adapters | ✗ | `src/lib/calls/adapters/` não existe |
| 30 provider com máquina | ◐ | provider existe e sessão sobrevive à navegação; sem `reduce`/`session.ts`, sem `openDialer`, sem `capabilities` |
| 31 provisionamento por Edge | ✗ | `get-sip-password` só `password`; `SIP_*` hardcoded; registro manual ("Conectar SIP") |
| 32 reconexão | ◐ | timer cancelado + backoff ✅; sem `reconnecting`/`unavailable`, sem guard de UA único |
| 33 corridas | ◐ | `sessionRef` síncrono ✅; segundo `dial` → toast ✅; sem `sessionId`/`reduce(DIAL)`; `hangup` em `dialing` → `cancel()` ✅ |
| 34 resultado no encerramento | ◐ | lê `answeredAt` ✅; **sem `end_reason`** (0 linhas no banco), sem `sipCodeToEndReason` |
| 35 persistência por `upsert_my_call` | ✗ | `useCalls` INSERT/UPDATE diretos; sem `channel`/`peer_number`/`provider_call_id`/`talk_seconds`; erro não gera retry |
| 36 recebimento SIP | ◐ | `onInvite`, `accept`, `reject`, busy 486 ✅ (27 testes); sem `provider_call_id`, sem `cancelled_remote`, sem homologação real |
| 37 microfone | ✗ | nenhum `getUserMedia`/`NotAllowedError` |
| 38 mute pelas tracks | ◐ | `toggleMute` altera tracks mas devolve estado local; `CallDialog` mantém `isMuted`/`isSpeakerOn` próprios |
| 39 DTMF contextual | ◐ | só em `Established` ✅; sem `data-keypad-scope` |
| 40 `ActiveCallBar` | ◐ | existe (#868) fora do `AppShell`, sem badge de canal, sem navegar para `?view=voip` |
| 41 alerta/identidade | ✗ | identidade por `notification.id`+`event_id`; Atender abre `CallDialog`; Recusar = `missCall`; `CallDialog` ainda insere sem `existingCallId` |

### Fase 4 — WhatsApp e click-to-call (42–50) — 0 ✅ · 1 ◐ · 8 ✗
42 `useCallChannels` ✗ · 43 `WhatsAppCallAdapter` ✗ · 44 `handleCallEvent` completo ✗ (só `ringing`; 10 linhas presas em `ringing` provam) · 45 alerta com canal/capacidades ◐ (toque + silêncio ✅; sem canal/Ignorar) · 46 término sincronizado ✗ · 47 `zapp:start-call` ✗ (`start-voip-call` ainda emitido, 0 consumidores; `ContactHeaderSection` abre `CallDialog` direto) · 48 linha de origem ✗ · 49 `BroadcastChannel` ✗ · 50 commit ✗.

### Fase 5 — Shell, header, KPIs (51–59) — 0 ✅ · 2 ◐ · 7 ✗
51 `TelefoniaView` + gutter ✗ · 52 `PageHeader icon` ✗ (título via `h2` + `motion.div`) · 53 chips de canal + período ✗ · 54 `useTelefoniaFilters` (URL) ✗ (estado local) · 55 `useCallsKpi` → `my_calls_kpi` ✗ · 56 `CallKpiCard` ◐ (5 cards, mas client-side e sem período) · 57 grid/skeleton ◐ · 58 remover Configurações ◐→ aba removida ✅ mas "Conectar SIP" permanece no `DialPad` · 59 ✗.

### Fase 6 — Histórico (60–71) — 0 ✅ · 3 ◐ · 9 ✗
60 card + escopo Minhas/Todas ✗ · 61 abas de canal ◐ (é `Select`) · 62 toolbar ◐ (busca/direção/resultado existem; sem abas, sem `w-[180px]`) · 63 `useMyCalls` → `search_my_calls` ✗ · 64 tabela ✗ (cards) · 65 célula contato ◐ (nome ou "Chamada recebida/realizada"; sem avatar/`formatPhoneBR`) · 66 `CallChannelBadge` ✗ · 67 `CallDirectionCell`/`CallResultCell` ✗ · 68 data/duração (`dd MMM · HH:mm`, `formatClock`) ✗ · 69 ações (ligar de volta/ouvir) ✗ · 70 paginação/estados ✗ · 71 ✗.

### Fase 7 — Nova ligação (72–78) — 0 ✅ · 7 ✗
Layout `[1fr_360px]` existe mas com `DialPad` legado; sem `NewCallPanel`, segmentado, `ContactPicker`, `Keypad`, display formatado, CTA por capacidade.

### Fase 8 — Chamada ativa e selecionada (79–86) — 0 ✅ · 2 ◐ · 6 ✗
79 `ActiveCallPanel` ✗ · 80 controles ◐ (no `DialPad`/`CallDialog`) · 81 pós-chamada ✗ · 82 `SelectedCallPanel` ◐ (detalhe existe; sem `end_reason` humano, sem `data-testid`) · 83 notas em `agent_notes` via RPC ✗ (grava `notes`) · 84 `RecordingPlayer`/`get-call-recording` ✗ (`<audio src>` cru) · 85 deep link `&call=` ✗ · 86 ✗.

### Fase 9 — Gravações (87–91) — 1 ✅ · 4 ✗ (condicional)
87 decisão: **D3=(b), pulada** ✅ registrado (sem bucket, sem Bitrix). 88–90 não se aplicam enquanto não houver fonte; 91 commit "pulada" ✗ (não formalizado).

### Fase 10 — Motion, a11y, responsivo (92–94) — 0 ✅ · 3 ✗
Stagger e `motion.div` do título continuam; sem `useReducedMotion`; sem axe; sem `Sheet` mobile.

### Fase 11 — QA automatizado (95–97) — 0 ✅ · 1 ◐ · 2 ⛔
95 visual ⛔ · 96 funcional ⛔ (credenciais) · 97 testes de código ◐ (`useSipClient.test` 27 cobre invite/cancel/bye/486; `voip-security-gaps.test.ts` tautológico; sem `calls-access.test.ts`; sem cobertura medida).

### Fase 12 — Entrega (98–100) — 0 ✅ · 3 ✗
98 gates ✗ · 99 PR-B ✗ · 100 homologação de áudio ✗ (nenhuma chamada real registrada com `end_reason`).

### Totais por fase
| Fase | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | **Σ** |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| ✅ | 6 | 8 | 11 | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 0 | 0 | 0 | **26** |
| ◐ | 1 | 0 | 0 | 8 | 1 | 2 | 3 | 0 | 2 | 0 | 0 | 1 | 0 | **18** |
| ✗/⛔ | 2 | 0 | 0 | 5 | 8 | 7 | 9 | 7 | 6 | 4 | 3 | 2 | 3 | **56** |

## 4. Defeitos e riscos encontrados (além do que o plano já listava)

| # | Sev. | Achado | Prova |
|---|---|---|---|
| T1 | P1 | **20 de 22 chamadas presas em `ringing`** (10 inbound WhatsApp, 10 outbound VoIP). O motor não fecha a linha quando o INVITE falha antes de `Terminated` e o webhook nunca recebe/mapeia `terminate`/`timeout`. KPIs e histórico mostram "Tocando" para sempre. | `status_dist` ao vivo; `handleCallEvent:283` |
| T2 | P1 | Contrato de dados aplicado e **inerte**: 0 consumidores das 4 RPCs e dos 6 módulos de domínio; 0 linhas com `end_reason`/`talk_seconds`/`provider_call_id`/`agent_notes`. O risco é o mesmo do Team Chat: "banco pronto" sem front acaba virando drift quando alguém "corrigir" o schema por outro caminho. | greps da seção 1.2 |
| T3 | P1 | `addCallNotes` grava em `notes` — coluna que o contrato (CONTRATO.md §autoria) reservou ao provedor e que `record_incoming_call_event` preserva com `COALESCE`. Anotação humana de hoje será sobrescrita/ignorada quando o motor novo entrar. | `useCalls.ts:156` |
| T4 | P2 | `findContactByPhone` mantém fallback por sufixo de 8 dígitos (`ilike '%12345678'`), que o plano proíbe (etapa 12: `phonesMatchExact`, "sem correspondência por sufixo"). Mitigado por "só se único", mas ainda vincula contato errado com 2 números diferentes de mesmo final quando só 1 está cadastrado. | `useSipClient.ts:70-73` |
| T5 | P2 | `CallDialog` continua inserindo em `calls` ao abrir sem `existingCallId` — e `ContactHeaderSection.tsx:212` abre exatamente assim (click-to-call do inbox cria linha `ringing` sem discar nada). Contribui para T1. | `CallDialog.tsx:65-76` |
| T6 | P2 | `<audio controls src={recording_url}>` renderiza a URL crua se algum dia `recording_url` for preenchido — sem `get-call-recording`, sem RLS de mídia. Hoje inofensivo (0 URLs). | `VoIPPanel.tsx:310` |
| T7 | P2 | `ActiveCallBar` montada em `App.tsx` (não no `AppShell`) e flutuante sobre `VoiceCopilotFAB`/`ScrollToTop` — o plano pede slot no topo do `main`. Funciona, mas o layout final da Fase 5 vai colidir. | `ActiveCallBar.tsx:23` |
| T8 | P3 | `start-voip-call` emitido sem consumidor desde antes do plano; `events.ts` só declara a constante legada. Botão "Ligar (VoIP)" do menu de ações do contato não faz nada além de abrir o diálogo. | `ContactActionButtons.tsx:127` |
| T9 | P3 | Ledger cita PR-A = #875 (fechada sem merge); o merge real foi #930 + #945. Rastreabilidade quebrada para quem ler o ledger. | GitHub |
| T10 | P3 | `[E2E] Conexão WhatsApp Teste` (`connected`) agora existe: qualquer capacidade "WhatsApp disponível" derivada de `status='connected'` sem filtrar fixtures vai acender verde por causa dela. | `whatsapp_connections` ao vivo |

## 5. O que falta — consolidado

**A. Ligar o contrato ao motor (Fase 3 real):** provider com `session.ts`, `upsert_my_call` em `DIAL/ESTABLISHED/fim` com `end_reason`/`talk_seconds`/`provider_call_id`/`peer_number`, provisionamento por `get-sip-password` estendida, `useSipConnection` com `reconnecting/unavailable` + UA único, microfone, mute pelas tracks, identidade por `call_id`, `CallDialog` sem insert, `findContactByPhone` exato, fechar as 20 linhas presas.
**B. Canais (Fase 4):** `useCallChannels` (excluindo fixtures `[E2E]`), adapters, `handleCallEvent` completo com fixtures, `zapp:start-call` com consumidor único, `BroadcastChannel`.
**C. Tela inteira (Fases 5–8):** `TelefoniaView`, `PageHeader icon`, chips + período, filtros na URL, KPIs e histórico pelas RPCs, tabela paginada (8/pág), `NewCallPanel`/`ContactPicker`/`Keypad`, `ActiveCallPanel`, `SelectedCallPanel` com `agent_notes` via RPC, `RecordingPlayer` condicionado a `recording_status`.
**D. Qualidade (Fases 10–12):** motion sob `useReducedMotion`, a11y, mobile `Sheet`, QA E.1–E.5 (precisa das credenciais), testes reais, PR-B, homologação de áudio com 9 cenários reais.
**E. Bloqueios a resolver por Joaquim:** credenciais de QA no host da sessão; D3 (gravação: confirmar se existe webhook REST do Bitrix24) e D7 (recusa WhatsApp no Evolution GO).

---

*Auditoria feita em 2026-09-29 contra `main` @ `e433589` e banco ao vivo. Plano sucessor: `PLANO_TELEFONIA_FINALIZACAO_100_ETAPAS_2026-09-29.md` (mesma pasta).*
