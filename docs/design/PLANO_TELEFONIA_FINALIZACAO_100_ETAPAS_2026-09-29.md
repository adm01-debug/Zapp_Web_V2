# PLANO — Telefonia (`?view=voip`): finalização da implantação (100 etapas) — 2026-09-29

**Status:** PLANEJADO — nada executado.
**Origem:** `AUDITORIA_TELEFONIA_ESTADO_REAL_2026-09-29.md` (26 DONE · 18 PARCIAL · 56 AUSENTE sobre o plano de 26/09).
**Sucede** `PLANO_MELHORIAS_TELEFONIA_100_ETAPAS_2026-09-26.md` (v1.0) e o ledger `TELEFONIA_STATUS.md` (CP0–CP2 fechados). **Este arquivo passa a ser o ledger vivo**: as fases 0–2 do plano anterior estão prontas e não voltam; tudo aqui é o que falta.
**Base:** `main` @ `e433589` · banco com o contrato v2 aplicado (`20260926800000` + `900000` + `20260927100000`) · `src/lib/calls/` (217 testes, 0 consumidores).

> **O que muda em relação ao plano de 26/09:** (1) a Fase 3 recomeça do que a PR #868 já entregou (recebimento SIP, `sessionRef` síncrono, `ActiveCallBar`, provider fino), não do zero; (2) a ordem "contrato → banco → motor → tela" continua, mas a **primeira** entrega de código é ligar o contrato que já existe ao motor — o banco pronto e inerte é o risco nº 1; (3) os bloqueios que travaram o QA (credenciais) viram etapa com dono; (4) D3 e D7 têm decisão-padrão registrada para não travar de novo.

---

## 0. Verdades que todas as etapas respeitam (medidas em 29/09)

| Verdade | Regra derivada |
|---|---|
| As 4 RPCs (`search_my_calls`, `my_calls_kpi`, `upsert_my_call`, `set_call_agent_notes`) e as 9 colunas **já existem** em produção e em `types.ts` | nenhuma etapa cria RPC/coluna nova sem antes provar que a existente não serve; front chama só o que está em `types.ts` |
| `calls.notes` = metadado do provedor (preservado por `COALESCE` na RPC); `agent_notes` = humano | front **nunca** escreve `notes`; anotação só por `set_call_agent_notes` |
| `is_admin_or_supervisor(auth.uid())` é o helper de papel (não `has_role`) | escopo `all` decidido dentro das RPCs; UI só mostra o seletor com o papel |
| 20 de 22 linhas estão presas em `ringing` | o motor novo **sempre** fecha a linha (`ended|missed|failed|cancelled`) no mesmo `id`; a reconciliação das 20 antigas é etapa própria (T1) |
| Existe `whatsapp_connections` `[E2E]` com `status='connected'` | capacidade WhatsApp ignora conexões cujo `name` começa com `[E2E]`; a linha real é `is_default=true` |
| Sem bucket de gravação e sem `BITRIX_WEBHOOK_URL` | D3 = (b) até Joaquim dizer o contrário; nenhum botão de gravação aparece; `recording_url` nunca é renderizado cru |
| Sem endpoint de recusa no Evolution GO comprovado | D7 = (b) "Ignorar" (`declined` local) até prova em contrário |
| Zero cor hardcoded, zero token novo, componentes compartilhados só por prop com default | idem plano anterior (regras 0.2 §8–9) |
| DDL: arquivo → PR → merge → apply por `db_query` + ledger no mesmo turno; versão por `reserve_migration_version('telefonia-final','T##')` | as 2 migrations deste plano (T18, T29) seguem isso; nunca de branch aberta |
| Sessão `claude -p`: uma fase por sessão, ledger atualizado antes de encerrar; credenciais de QA em `/workspace/.secrets/zapp-v2.env` | etapa T05 confirma antes de qualquer screenshot |

### Regras de execução
1. Um commit por fase (`feat(telefonia): fase N — …`), branch nova com carimbo por bloco, PR por bloco. PRs que tocam `AppProviders`/`App.tsx`/`AppShell`/Edge Functions **ficam abertas e chamam Joaquim** (regra 8 do fluxo Git); as demais mergeiam com CI verde.
2. Gates locais após cada fase: `npx tsc -b --force` · `node scripts/ci/lint-ratchet.mjs` · `node scripts/ci/typecheck-ratchet.mjs` · `npm run implicit-any-check` · `npx vitest run src/components/calls src/hooks src/lib/calls src/providers`. Saída colada no corpo da PR.
3. Cada etapa fecha só com evidência (número, arquivo, id) neste arquivo. "Feito" sem evidência não fecha.
4. Máximo 3 iterações por loop visual; na 3ª registra o resíduo.

---

## FASE 0 — Reconciliação e desbloqueio (T01–T08)
*1 PR (docs + script) + 1 tarefa do Joaquim (credenciais). Sem UI.*

**Execução 2026-09-29** (branch `hermes/telefonia-finalizacao-100-etapas-2609291125a556`): T01–T04 e T07 fechadas com evidência; T08 fechado com os gates verdes. **T05 resolvido e verificado; T06 segue aberto por defeito de produção no POST de autenticação** (detalhe em T06 e em "Bloqueios" no fim desta fase).

- [x] **T01** — Ledger: adicionar ao topo de `TELEFONIA_STATUS.md` uma nota de 3 linhas apontando para este arquivo; corrigir "PR-A = #875" para "#875 fechada; conteúdo via #930 + #945" (T9). **Aceite:** nota commitada; nenhuma outra linha do ledger antigo alterada.
  **Feito:** nota de 3 linhas no topo; a linha do CP2 virou `PR-A=**#875** — fechada sem merge; o conteúdo entrou na main por #930 + #945`. Conferido na API: #875 `CLOSED` (branch `hermes/telefonia-contrato-dados-26092615475e51`), #930 `MERGED` 26/09, #945 `MERGED` 27/09. `grep -n 875` no ledger = 1 ocorrência (só a linha do CP2); o item 28 cita apenas "PR-A" e ficou intacto.
- [x] **T02** — Decisões-padrão registradas na seção 10: D1=a, D2=a, **D3=b**, D4=a, D5=8, D6=não, **D7=b**. **Aceite:** seção 10 preenchida; Joaquim pode mudar D3/D7.
  **Feito:** seção 10 com Data `2026-09-29` e Quem nas 7 linhas; D3 e D7 anotadas como reabrível/revisável por Joaquim.
- [x] **T03** — Reconciliar as 20 linhas presas em `ringing`. **Aceite:** 0 linhas `ringing` com mais de 1 dia; ids registrados.
  **Feito:** antes = **20** linhas (`count(*) … status='ringing' AND started_at < now() - interval '1 day'`); antes-imagem dos campos alterados salva em `/tmp/telefonia-t03/antes-campos.tsv`; `UPDATE … RETURNING id, status, end_reason, ended_at` devolveu **20 ids**; depois = **0** linhas presas. Nota: as 22 linhas ficaram em `ended=2 / failed=20` (nada mais em `ringing`).
  **Ids (20):** `83b09e54-642b-413f-98d4-617207a6b314`, `2f340d83-7152-4123-9e82-f1bf33eebc0a`, `ce56060b-d5db-4b46-b458-de87b5714082`, `2b000cd5-4b86-47f8-8d91-1d0c7abda152`, `be63ba4f-b938-4801-95ac-0031dc6c00eb`, `ad3d41d0-94dc-4b80-8d68-c6c0bf8a5262`, `08ebf0b3-0cbc-48bc-a06b-d68dba25488e`, `152d1e97-7a4e-4fa4-ad53-80c87f140230`, `f221e1b1-4a3b-4f62-bce0-e05a457ea659`, `aebbec1a-a53a-470b-a80b-abb85f65530b`, `daf289f1-e75b-4293-8f31-9172e2eeff36`, `3c621ccd-48e1-45f0-9558-99a7db9323ce`, `21b85bcf-0ec6-46d2-bb33-f2ef5fb59fd2`, `3fb17cfc-08c4-4f79-aa40-53d56abd01aa`, `77ebab5f-a016-48f2-9c2d-ba115f6a1223`, `368196bf-e7bb-49ef-94f6-19a3b788a993`, `4847cd55-ee2e-460a-8220-d4c412929902`, `3707b43e-f13a-4253-9b29-a83198918be1`, `cce36823-b1a1-4d4b-b3b1-78ffaa177d7e`, `6a63d651-8174-4e0f-a606-9e3b8d5d386d`.
- [x] **T04** — Script `scripts/db-audit/telefonia-snapshot.mjs` → `docs/design/telefonia-baseline-2026-09-29/pos-fase-0.json`. **Aceite:** arquivo commitado; script roda com `DESTINO_URL`.
  **Feito:** `telefonia-snapshot.sql` (escopo `calls`: 23 colunas, 3 policies, 11 constraints, 8 índices, as 5 funções com assinatura/atributos/`pg_get_functiondef`, publicação de realtime e contagens) + `telefonia-snapshot.mjs` (confere identidade com `database-identity.mjs` antes de consultar, exit 2 sem `DESTINO_URL` ou com projeto divergente, suprime stderr). Baseline commitado: 26.019 bytes, `counts = {total: 22, ended: 2, failed: 20, voip: 12, whatsapp: 10, inbound: 10, outbound: 12, ringing_older_than_1_day: 0}`.
  **Divergência de caminho:** não existe `DESTINO_URL` neste WSL, então o JSON foi gerado pelo **mesmo SQL** pela rota canônica do projeto (`zapp_db.py` → gateway `supabase-zapp-web-v2-mcp`, service_role, projeto `tnnnlkbymytvtqngbbqh`); o script com `DESTINO_URL` é o caminho oficial e fica pronto para a próxima execução.
- [x] **T05** — **Joaquim:** gravar `ZAPP_QA_EMAIL`/`ZAPP_QA_PASSWORD` em `/workspace/.secrets/zapp-v2.env` do container `claude-code`. **RESOLVIDO e VERIFICADO 29/09 no ambiente Hermes/WSL:** `/workspace` existe aqui e o arquivo exporta `ZAPP_QA_EMAIL` (29 chars), `ZAPP_QA_PASSWORD` (28) e `ZAPP_QA_URL` (40) — o `source` funciona. **Achado:** `ZAPP_QA_URL` é a URL do **Supabase** (`tnnnlkbymytvtqngbbqh.supabase.co`), não a do app; a URL do app é `https://zapp-web-v2.vercel.app`.
- [ ] **T06** — `00-before.png` + `consoleErrors`. **BLOQUEADO 29/09 por DEFEITO DE PRODUÇÃO** (e não mais por T05, que está resolvido): não se obtém sessão autenticada porque o **caminho de POST de autenticação do projeto `tnnnlkbymytvtqngbbqh` nunca responde**. Evidência (reproduzida fora do browser): `POST /functions/v1/auth-login` → timeout de 25s com 0 bytes no `curl`, e a requisição do browser segue pendente após 90s; `POST /auth/v1/token?grant_type=password` com apikey válida → timeout de 15–25s **inclusive com e-mail/senha falsos** (portanto o travamento é anterior à credencial, não é a conta de QA). No mesmo host e no mesmo minuto: `GET /functions/v1/auth-login` → 405 em 0,4s, `GET /rest/v1/` → 401 em 0,1s, preflight `OPTIONS` → 200 em 0,2s. Harness pronto, versionado **fora do repo** como o plano manda: `/workspace/qa/tel/00-before.mjs` (+ `diag-login.mjs`), dependendo só de `PLAYWRIGHT_BASE_URL`/`E2E_TEST_EMAIL`/`E2E_TEST_PASSWORD`.
- [x] **T07** — `voip-security-gaps.test.ts` → apagar; criar `calls-access.test.ts`. **Aceite:** 0 `expect(true).toBe(true)` em `src/components/calls`.
  **Feito:** arquivo antigo removido (`git rm`); `src/components/calls/__tests__/calls-access.test.ts` com 3 `it.todo` nomeando a etapa dona (T43/T45, T13/T66, T13) + 2 lacunas herdadas que nenhuma etapa deste plano cobre (espera/transferência/conferência; SRTP explícito). `grep -rn "expect(true).toBe" src/components/calls` = **0**.
- [x] **T08** — Fechamento Fase 0: PR docs+script; seção 11 com o número. **Aceite:** CI verde.
  **Feito:** gates locais = `tsc -b --force` exit 0 · `vitest run src/components/calls src/lib/calls src/hooks/communication src/hooks/sip src/providers` exit 0 (**272 passed, 5 todo**) · `lint-ratchet` novas=0 · `typecheck-ratchet` novas=0 · `implicit-any` 0 · `supabase-usage-guard` novas=0 · `check-migration-drift` exit 0 (estrutura local; sem `DESTINO_URL`). CI do PR na seção 11.

**Bloqueios desta fase:** T05 resolvido e verificado. T06 e toda a verificação visual (`00-before.png`, `measure.mjs`, `colors.mjs`, `func.mjs`, `axe.mjs`) permanecem impossíveis enquanto o POST de autenticação do projeto não responder — **defeito de produção, não de ambiente**: reproduzido com `curl`, fora do browser, inclusive com credencial falsa. Harness pronto em `/workspace/qa/tel/`. Vale para T06, T42, T54, T61, T70, T80, T81–T84, T95 e a homologação T96.

## FASE 1 — Motor: ligar o contrato ao que existe (T09–T22)
*1 PR (`src/hooks`, `src/providers`, `src/lib/calls/adapters`). Toca `AppProviders`/`App.tsx` → fica aberta e chama Joaquim.*

- [ ] **T09** — `src/lib/calls/adapters/CallAdapter.ts` (interface) + `SipCallAdapter.ts`: **mover** de `useSipClient.ts` para o adapter os blocos de UA/Inviter/Invitation/mídia/DTMF (`:39-49`, `:83-120`, `:122-239`) sem reescrever a lógica; `useSipClient.test.ts` (27 testes) continua verde apontando para o adapter. **Aceite:** 27 testes verdes; `useSipClient.ts` < 120 linhas. → **FEITO 29/09.** `CallAdapter.ts` (76 linhas) + `SipCallAdapter.ts` (147); nenhuma chamada de `sip.js` resta no hook. **Divergência:** foi preciso um terceiro arquivo, `CallEngine.ts` (controlador sem React), porque só mover os touchpoints de `sip.js` deixava o hook em 238 linhas — o `< 120` do aceite exige que a orquestração (bookkeeping de sessão, cronômetro, registro, discar/atender/recusar/desligar/mute/DTMF) saia do hook, que é o que `:122-239` pedia. O motor recebe estado/toast/banco por `CallEngineSink` e o transporte por `CallAdapter`; não importa `sip.js` nem `@/lib/logger` como valor. Evidência: `vitest useSipClient.test.ts` → **27 passed**; `wc -l useSipClient.ts` → **113**; `tsc -b --force` → exit 0.
- [ ] **T10** — `CallSessionProvider` ganha a máquina de estados: estado = `reduce()` de `src/lib/calls/session.ts` (hoje 0 consumidores); `sessionId` no `DIAL`/`INVITE_RECEIVED`; API `dial/accept/reject/hangup/toggleMute/sendDTMF/openDialer`; `useCallSession()` mantém os campos que `VoIPPanel`/`DialPad`/`ActiveCallBar` consomem hoje (`sipStatus, callStatus, callDuration, isMuted, currentNumber, callDirection`) derivados do estado novo, para a UI antiga não quebrar antes da Fase 4. **Aceite:** teste do provider: `dial` → `MemoryRouter` navega → estado mantido; `grep -rln "@/lib/calls" src --exclude-dir=lib` ≥ 1.
- [ ] **T11** — Persistência por `upsert_my_call` (substitui `useCalls.startCall/answerCall/endCall/missCall` no fluxo SIP): em `DIAL` (`status='ringing'`, `channel='voip'`, `peer_number`, `contact_id` via `phonesMatchExact`, `provider_call_id` = SIP `Call-ID`), em `ESTABLISHED` (`answered`, `answered_at`), na entrada de `ended` (`status`, `ended_at`, `end_reason`, `talk_seconds`); mesmo `id` (uuid gerado no front) nas 3 chamadas; `error` → toast + retry idempotente ×3 + log com `sessionId`. **Aceite:** teste observa 3 RPCs no mesmo `id`; 1 chamada real de teste no preview gera linha com `end_reason` e `provider_call_id` preenchidos (ids aqui).
- [ ] **T12** — `end_reason` no encerramento: `sipCodeToEndReason(lastResponse?.statusCode)` ou `hangup_local|hangup_remote`; `persistedStatusForEndReason` do `session.ts`. **Aceite:** testes: atendida+bye local → `ended`/`hangup_local`; 486 → `busy`; cancel local → `cancelled`; remoto após atendida → `ended`/`hangup_remote`; 480 → `missed`/`no_answer`.
- [ ] **T13** — `useCalls.addCallNotes` → `set_call_agent_notes` (grava `agent_notes`); `useCalls.startCall/answerCall/endCall/missCall` marcados `@deprecated` e usados só pelo `CallDialog` até T21. **Aceite:** `grep -rn "update({ notes" src` vazio; asserts de T07 verdes.
- [ ] **T14** — `findContactByPhone` → `phonesMatchExact`/`normalizeE164BR` de `src/lib/calls/phone.ts`; **remover** o fallback por sufixo (`useSipClient.ts:70-73`). **Aceite:** teste: dois contatos com o mesmo final de 8 dígitos → nenhum vínculo quando o número não bate exato. → **FEITO 29/09.** O fallback `ilike '%<8 últimos>'` saiu; a consulta passou a buscar variantes de grafia (`phoneQueryVariants`) e a decisão é em E.164 completo (`pickUniquePhoneMatch`, que exige **um único** casamento). Ambos os helpers moraram em `src/lib/calls/phone.ts` (etapa 12), testáveis sem React nem banco. Evidência: 6 testes novos em `phone.test.ts` — inclusive o caso que o fallback antigo vinculava errado (contato no DDD 11, chamada do DDD 85, mesmo final de 8 dígitos) → `null`; suíte `src/lib/calls src/hooks/communication …` → **278 passed / 5 todo**.
- [ ] **T15** — Provisionamento por Edge: `get-sip-password` devolve `{ server, user, wsPort, password, profileId }` lendo `SIP_SERVER`/`SIP_USER`/`SIP_WS_PORT` (defaults = valores atuais); front remove `SIP_*` hardcoded; registro automático ao autenticar; 403/`Registration failed` → `reason='line_in_use'`. Deploy da função **só** por `deploy-functions.yml` + aprovação (merge ≠ deploy). **Aceite:** `curl` com JWT do QA devolve 5 campos; `grep -rn "bitrixphone" src` vazio; run do `deploy-functions` verde citado aqui.
- [ ] **T16** — `useSipConnection`: status `idle|connecting|registered|reconnecting|unavailable`; guard `if (uaRef.current) return`; backoff mantido; `unavailable` após 5 tentativas. **Aceite:** teste com `vi.useFakeTimers()`: unmount durante backoff não cria UA; 6ª falha → `unavailable`.
- [ ] **T17** — Microfone: `getUserMedia({audio:true})` antes de `dial/accept`; `NotAllowedError`/`NotFoundError`/`NotReadableError` → 3 mensagens operacionais (`describeReason`); `ondevicechange` reavalia. **Aceite:** 3 mensagens em teste.
- [ ] **T18** — Mute e DTMF: `setMuted` atua nas tracks e devolve o estado **lido**; `sendDTMF` só em `active`; `data-keypad-scope` para o teclado físico. **Aceite:** teste `toggleMute → track.enabled === false`; DTMF em `ringing` = no-op + warn. → **FEITO 29/09 (parcial).** O mute saiu invertido: `setMuted(session, muted)` agora grava `track.enabled = !muted` e devolve o **estado lido** das tracks (`null` sem mídia, e aí o motor usa a intenção); o motor usa o que o adapter leu em vez de adivinhar. `sendDTMF` ganhou dono único do guarda "só em `Established`" no adapter, com `warn`. Provas: 9 testes novos em `src/lib/calls/adapters/__tests__/CallEngine.test.ts` (adapter real, só as idas ao `sip.js` dubladas) — incluindo o aceite literal; **mutação** reintroduzindo `enabled = muted` derruba exatamente 3 deles na asserção (`expected true to be false`), revertida volta a 9/9. **Falta nesta etapa:** `data-keypad-scope` para o teclado físico, que só existe depois de o `Keypad` ser extraído (T58) — fica para lá, declarado aqui para não parecer esquecimento.
- [ ] **T19** — `useIncomingCallListener`: identidade por `metadata.call_id` (fallback `event_id`); ignora notificação cuja chamada já está `ended|missed|failed` (`select status from calls where id=…` via RLS). **Aceite:** teste: 2 notificações do mesmo `call_id` → 1 alerta; chamada encerrada → 0 alertas.
- [ ] **T20** — `BroadcastChannel('zapp-call-session')`: aba líder registra UA; seguidoras não registram e mostram "Ligação em andamento em outra aba"; `INVITE_RECEIVED` durante `active` → `missed`/`busy_here` + toast. **Aceite:** teste unitário do eleitor.
- [ ] **T21** — `CallDialog` deixa de inserir (`:65-76`), consome o provider (sem `isMuted/isSpeakerOn` locais; alto-falante só se `setSinkId` existir); `IncomingCallAlert`: Atender → `accept()`, Recusar → `reject()` (persiste `declined`), Ignorar → silencia; timeout vive na máquina. **Aceite:** teste: abrir diálogo → 0 inserts; Recusar → linha `declined`.
- [ ] **T22** — Fechamento Fase 1: gates; tabela "cenário → status/end_reason" (8 linhas) obtida dos testes; PR aberta chamando Joaquim (toca `AppProviders`). **Aceite:** tabela aqui; CI verde; número da PR na seção 11.

## FASE 2 — Canais e click-to-call (T23–T32)
*1 PR (`src/hooks/calls/useCallChannels.ts`, adapter WhatsApp, webhook, inbox). Toca Edge Function → aberta + Joaquim.*

- [ ] **T23** — `useCallChannels()`: VoIP = `sipStatus==='registered' && mic !== 'blocked'` (+`reason`); WhatsApp = da conexão `is_default=true` do usuário **excluindo `name LIKE '[E2E]%'`**: `{ canDial:false, canReceive: status==='connected', canReject:false, reason:'whatsapp_no_outbound' }`. **Aceite:** 3 fixtures (registrado, reconectando, sem mic) + fixture `[E2E]` ignorada.
- [ ] **T24** — `WhatsAppCallAdapter.ts`: `dial` → `NotSupported`; `accept` → `answered_by` + abre a conversa do contato no inbox ("Atenda no aparelho da linha; a conversa foi aberta aqui"); `reject` → `declined` local, rótulo "Ignorar" (D7=b). **Aceite:** adapter testado nos 2 ramos.
- [ ] **T25** — `handleCallEvent`: mapear `offer/ringing→ringing`, `accept→answered`, `reject|timeout→missed`, `terminate→ended`; `p_provider_event_id = data.id`; direção por `fromMe/isOutgoing`; timestamp `data.date`. Fixture anonimizada em `supabase/functions/_shared/__fixtures__/evolution-call-*.json` a partir de `webhook_events` reais (se não houver nenhum `terminate` gravado, registrar e manter defensivo). **Aceite:** teste da função com as fixtures; `deploy-functions` verde citado.
- [ ] **T26** — `record_incoming_call_event`: **só se T25 precisar** de campo novo (ex.: `p_direction`) — migration própria `T26_record_incoming_call_event_direction.sql` (`CREATE OR REPLACE`, diff ≤ 10 linhas, versão reservada); caso contrário, "não necessária" aqui. **Aceite:** decisão registrada; se DDL, ledger + `types-sync`.
- [ ] **T27** — `IncomingCallAlert` com `CallChannelBadge`, botões conforme capacidades (Atender/Recusar/Ignorar), toque para em `ACCEPT|REJECT|TIMEOUT|HANGUP_REMOTE`. **Aceite:** teste: toque inicia em `INVITE_RECEIVED` e para nos 4 eventos.
- [ ] **T28** — Término sincronizado: Realtime em `calls` (`agent_id=eq.<meu perfil>`) → `terminate/timeout` do webhook → `HANGUP_REMOTE` na `call_id` em curso; alerta fecha sozinho. **Aceite:** teste com fake timers + evento.
- [ ] **T29** — Click-to-call unificado: `ContactActionButtons`/`ContactHeaderSection`/`ChatHeader` chamam `dispatchStartCall({ contactId, phone, name, channel, connectionId, source })`; **único consumidor** = `CallSessionProvider.openDialer` → `?view=voip` com o painel pré-preenchido; remover emissão de `start-voip-call` e o `CallDialog` de `ContactHeaderSection.tsx:210-214`. **Aceite:** `grep -rn "start-voip-call" src` só em `events.ts` (constante legada) ou vazio; 3 origens testadas.
- [ ] **T30** — Linha de origem: `connectionId` da conversa prevalece; fora do inbox, `is_default`; painel mostra "pela linha <nome>". **Aceite:** texto correto nos 2 casos.
- [ ] **T31** — `CAPACIDADES.md` atualizado com o que o código faz **após** T23–T30 (data, commit). **Aceite:** tabela igual ao código.
- [ ] **T32** — Fechamento Fase 2: gates; `grep start-voip-call` = 0 emissores; PR aberta chamando Joaquim. **Aceite:** seção 11.

## FASE 3 — Shell, header, disponibilidade, período, KPIs (T33–T42)
*1 PR de front. CI verde mergeia.*

- [ ] **T33** — `ViewRouter.tsx:33`: `'voip'` em `COMPACT_GUTTER_VIEWS`. `TelefoniaView.tsx` (`flex flex-col gap-4 min-w-0`, `data-testid="tel-view"`); `VoIPPanel.tsx` → `export { TelefoniaView as VoIPPanel }`. **Aceite:** `contentX = 278 ±6` (E.2) ou, sem QA, snapshot RTL do container.
- [ ] **T34** — `PageHeader.tsx`: prop `icon?: ReactNode` (default = markup atual). `TelefoniaView` usa `PageHeader variant="plain" icon={<Phone/>} title="Telefonia" subtitle="Suas ligações por VoIP e WhatsApp" topRight={<TelefoniaTopActions/>}`. Remover `motion.div` do título. **Aceite:** snapshots de Contatos/Dashboard inalterados.
- [ ] **T35** — `TelefoniaTopActions.tsx` + `PeriodSelect.tsx`: chips VoIP/WhatsApp (dot + `Tooltip` com `describeReason`) e `Select` de período (Hoje/Ontem/7d/30d/Este mês/Mês passado). **Aceite:** 3 controles h 40 ±2; rótulos refletem `useCallChannels`.
- [ ] **T36** — `src/hooks/calls/useTelefoniaFilters.ts`: `period|channel|dir|result|q|page|scope|call` em `useSearchParams` (defaults `7d|all|all|all||1|mine|`); `setFilter` reseta `page=1`. **Aceite:** reload mantém filtros; teste do hook.
- [ ] **T37** — `src/hooks/calls/useCallsKpi.ts`: `useQuery(['calls-kpi', scope, channel, from, to])` → **`my_calls_kpi`** (já existe); `staleTime 30_000`; invalidação por fim de sessão + Realtime `calls` filtrado. **Aceite:** teste: evento realtime → refetch; 1 request por refetch.
- [ ] **T38** — `CallKpiCard.tsx` (`h-[78px]`, tile 44, valor 26 px, `data-testid="tel-kpi-card|tile|value"`); mapa Total/Realizadas/Recebidas/Perdidas (`missed_inbound`)/Duração média (`formatTalk(avg_talk_seconds)`, "—" sem atendidas). Substitui o cálculo client-side sobre `statsRows`. **Aceite:** 5 cards h 78 ±4; KPI Total == `total_count` de `search_my_calls` no mesmo filtro.
- [ ] **T39** — Grid `grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3`; skeleton 5×78; erro → card "Não foi possível carregar os indicadores" + "Tentar novamente". **Aceite:** sem CLS.
- [ ] **T40** — Remover do `DialPad`/view: "Conectar SIP"/"Desconectar" (`DialPad.tsx:100-104`), `onConnect`/`onDisconnect` (registro é automático, T15). Atualizar `VoIPPanel.test.tsx` e `DialPad.test.tsx` para o contrato novo. **Aceite:** `grep -c "Conectar SIP" src/components/calls` = 0; vitest verde.
- [ ] **T41** — `useCallHistory.ts` deixa de ser usado pela view (T45 substitui); marcar `@deprecated` e remover em T92 se nenhum outro consumidor. **Aceite:** `grep -rn useCallHistory src` só no próprio arquivo/testes até T92.
- [ ] **T42** — Fechamento Fase 3: gates; `05-after.png` (se T05 resolvido). **Aceite:** seção 11.

## FASE 4 — Histórico (T43–T54)
*1 PR de front.*

- [ ] **T43** — `CallHistoryCard.tsx`: título "Histórico de ligações" + `Badge total_count` + escopo (texto "Minhas ligações" ou `Select` Minhas/Todas para admin/supervisor via `useUserRole`). **Aceite:** seletor só com papel; muda `scope` na URL.
- [ ] **T44** — Abas de canal (Radix `Tabs`, sublinhado 2 px `primary`, `data-testid="tel-channel-tab"`): Todos/VoIP/WhatsApp. **Aceite:** ativa h 40 ±2.
- [ ] **T45** — `src/hooks/calls/useMyCalls.ts`: `useQuery(['calls', …])` → **`search_my_calls(p_limit=8, p_offset=(page-1)*8)`** (já existe); `keepPreviousData`; `{ rows, total, pages }`; `page > pages` → `page=1`. **Aceite:** teste com mock; página 2 ≠ página 1.
- [ ] **T46** — `CallHistoryToolbar.tsx`: busca (debounce 300 ms → `q`), `Select` Direção, `Select` Resultado (8 opções da tabela 2.7 via `RESULT_LABEL`). **Aceite:** 3 controles h 40 ±2 na mesma linha.
- [ ] **T47** — `CallHistoryTable.tsx`: colunas Contato · Canal · Direção · Resultado · Data e hora · Duração · Ações; `tr h-[57px]`, selecionada `bg-primary/5 border-l-2 border-l-primary` + `aria-selected`; `data-testid="tel-row"`. **Aceite:** linhas 57 ±3.
- [ ] **T48** — Célula Contato: avatar 40 (`getAvatarColor`/`getInitials`; foto se `contact_avatar_url`), `peer_name ?? contact_name ?? formatPhoneBR(peer_number)`, "Número não identificado". **Aceite:** 3 variantes em teste.
- [ ] **T49** — `CallChannelBadge.tsx` (WhatsApp `success`, VoIP `primary`) — reutilizado em alerta/painéis/`ActiveCallBar`. **Aceite:** componente testado.
- [ ] **T50** — `CallDirectionCell.tsx` + `CallResultCell.tsx` (dot + `RESULT_LABEL`, tons via `RESULT_TONE` resolvidos em classe no componente; `in_progress|ringing` `animate-pulse` sob reduced-motion). **Aceite:** matriz 10 × 2 em snapshot.
- [ ] **T51** — Data `dd MMM · HH:mm` (ptBR, mês minúsculo) e duração `formatClock(talkSeconds(row))`, `—` sem atendimento. **Aceite:** 4 casos.
- [ ] **T52** — Ações: "Ligar de volta" → `openDialer({ phone, contactId, channel, autoDial:true })` (respeita capacidade); "Ouvir gravação" **só** se `recording_status==='available'` (hoje nunca). **Aceite:** Play ausente em todas as linhas reais.
- [ ] **T53** — `CallsPagination.tsx` (janela de 7, `aria-current`) + 4 estados do corpo (loading 8×57, vazio por filtro + "Limpar filtros", vazio total + "Fazer uma ligação", erro + "Tentar novamente"). **Aceite:** pager 36 ±2; teste dos 4 estados.
- [ ] **T54** — Fechamento Fase 4: gates; `06-after.png`. **Aceite:** seção 11.

## FASE 5 — Painel lateral: Nova ligação (T55–T61)
*1 PR de front.*

- [ ] **T55** — Layout `xl:grid-cols-[minmax(0,1fr)_408px]` (`aside sticky top-4`, `data-testid="tel-side-panel"`); abaixo de `xl` o painel vem depois do histórico. **Aceite:** painel 408 ±8 em 1672; sem overflow em 1366.
- [ ] **T56** — `NewCallPanel.tsx`: segmentado VoIP/WhatsApp (`role="radiogroup"`, persistido em `localStorage['tel:new-call-channel']`, **independente** das abas do histórico; opção sem `canDial` → `disabled` + `Tooltip`). **Aceite:** trocar aba do histórico não muda o segmentado (teste).
- [ ] **T57** — `ContactPicker.tsx`: `search_contacts` via `contact.service.ts` (limit 6, debounce 300 ms), lista navegável ↑↓/Enter, chip do contato selecionado, só dígitos → número direto; pré-preenchido pelo `openDialer`. **Aceite:** h 40 / chip 60 ±4; busca funciona.
- [ ] **T58** — `Keypad.tsx` extraído de `DialPad.tsx` (`{ onKey, disabled, mode:'edit'|'dtmf' }`); `DialPad` compõe `Keypad` mantendo export/props; teclado físico sob `data-keypad-scope`. **Aceite:** `DialPad.test` (39) verde; 12 teclas 46 ±2.
- [ ] **T59** — Display do número (`formatPhoneBR` ao vivo, `Delete`); `normalizeE164BR` inválido → CTA `disabled` + "Número incompleto". **Aceite:** 3 entradas testadas.
- [ ] **T60** — CTA "Ligar via VoIP | WhatsApp": `canDial=false` → `disabled` + `describeReason`; `reconnecting` → "Reconectando…"; `dialing` → "Cancelar"; hint "Confira o número antes de ligar." **Aceite:** 4 estados em teste.
- [ ] **T61** — Fechamento Fase 5: gates; `07-after.png`. **Aceite:** seção 11.

## FASE 6 — Chamada ativa e ligação selecionada (T62–T70)
*1 PR de front.*

- [ ] **T62** — `ActiveCallPanel.tsx` no slot do `NewCallPanel` quando `state.kind !== 'idle'` (`AnimatePresence` 120 ms): estado (`aria-live`), contato (avatar 56, `CallChannelBadge`), timer `formatClock` só em `active`, linha de origem. **Aceite:** 5 estados renderizam.
- [ ] **T63** — Controles: Mute (`aria-pressed`), Teclado DTMF, Encerrar; em `ringing_in`: Atender + Recusar/Ignorar por `canReject`. **Aceite:** clique → ação do provider (spy).
- [ ] **T64** — Pós-chamada (3 s): resumo "Ligação encerrada · 02:36" + anotação rápida (`set_call_agent_notes`) + "Ligar novamente" + "Fechar". **Aceite:** salvar → toast + linha atualizada.
- [ ] **T65** — `SelectedCallPanel.tsx` (`data-testid="tel-selected-panel"`): vazio / com seleção; `end_reason` humano ("Cancelada por você", "Recusada", …). **Aceite:** 3 estados em teste.
- [ ] **T66** — Notas: `agent_notes` editável (dono/admin/supervisor) via `set_call_agent_notes` + `invalidateQueries(['calls'])`; `notes` do provedor como metadado somente leitura. **Aceite:** teste: RPC chamada com `agent_notes`; `notes` intocado.
- [ ] **T67** — `RecordingPlayer.tsx` + `useCallRecording(callId)`: renderiza **só** se `recording_status==='available'`; remove o `<audio src={recording_url}>` cru (T6); sem `get-call-recording` enquanto D3=b, o componente devolve `null`. **Aceite:** `grep -n "recording_url" src/components/calls` = 0 fora do tipo.
- [ ] **T68** — Seleção: clique/Enter → `call=<id>` na URL; `Esc` limpa; deep link `?view=voip&call=<id>` carrega a linha via `search_my_calls` filtrada ou `calls.select(...).eq('id')` (RLS). **Aceite:** deep link testado.
- [ ] **T69** — `ActiveCallBar` migra para o slot no topo do `main` do `AppShell` (`h-12`, render condicional) com `CallChannelBadge` e clique → `?view=voip`; sai de `App.tsx:63`. Toca `AppShell` → PR aberta + Joaquim. **Aceite:** `03-activebar.png` no inbox durante `dialing`.
- [ ] **T70** — Fechamento Fase 6: gates; `08-after.png`. **Aceite:** seção 11.

## FASE 7 — Gravações (T71–T74) — condicional a D3
- [ ] **T71** — Se Joaquim confirmar webhook REST do Bitrix24 (`voximplant.statistic.get` acessível): registrar aqui e seguir T72–T73. Senão: **D3=b mantido**, T72–T73 marcados "não se aplica", pular para T74. **Aceite:** decisão datada.
- [ ] **T72** — Edge `sync-call-records` (N8N a cada 5 min): casa por `peer_number` + `started_at ±90 s`, preenche `provider_call_id`, `recording_url`, `talk_seconds`, `end_reason`, `recording_status`; nunca cria chamada. **Aceite:** 1 chamada real reconciliada (ids) ou "0 registros".
- [ ] **T73** — Edge `get-call-recording` (JWT → RLS → stream com `Range`, sem expor URL; rate limit). **Aceite:** A → 200; B → 403; sem JWT → 401.
- [ ] **T74** — Fechamento Fase 7: commit "fase 7 — reconciliação" ou "fase 7 pulada — sem fonte"; `CAPACIDADES.md` atualizado. **Aceite:** seção 11.

## FASE 8 — Motion, a11y, responsivo (T75–T80)
*1 PR de front.*

- [ ] **T75** — Motion (seção 2.8 do plano anterior): KPI fade 150 ms, troca de painel 120 ms, `animate-pulse` em Tocando/Reconectando, `whileTap 0.98`; **remover** stagger por linha e `motion.div` do título; tudo sob `useReducedMotion`. **Aceite:** `emulateMedia({reducedMotion:'reduce'})` → `transitionDuration==='0s'` em KPIs/linhas/painéis.
- [ ] **T76** — A11y: `aria-label` em todo ícone-botão; `<caption sr-only>`; linhas `tabIndex=0` + ↑↓/Enter; `focus-visible:ring-2`; `aria-live` na chamada; contraste muted/card ≥ 4.5 (medido nos tokens; se falhar, registrar, não trocar cor). **Aceite:** axe `serious/critical` = 0.
- [ ] **T77** — Responsivo 1366 (painel 360 em `xl`, 408 em `2xl`), <1280 painel vira `Sheet` (botão "Nova ligação" no `topRight` + `ActiveCallBar`), 390 (`CallRowMobile`, KPIs 2 col, chips roláveis). **Aceite:** `10-1366/1024/mobile.png` sem `scrollWidth > innerWidth`.
- [ ] **T78** — Auditoria de contraste WCAG nos 3 temas (light/dark/alto-contraste) em `telefonia-baseline-2026-09-29/contraste.md`. **Aceite:** tabela ≥ 4.5:1 ou resíduo registrado.
- [ ] **T79** — `eslint-baseline.json`: zerar as violações reais dos 18 pontos de `calls/communication/sip` tocados e remover as entradas. **Aceite:** nenhuma entrada `src/components/calls|src/hooks/communication/useSip|src/hooks/sip` no baseline.
- [ ] **T80** — Fechamento Fase 8: gates; 3 screenshots + axe. **Aceite:** seção 11.

## FASE 9 — QA automatizado (T81–T88)
*Scripts em `/workspace/qa/tel/` (fora do repo) + 1 PR de testes.*

- [ ] **T81** — `measure.mjs` (E.2): `contentX, chips, kpi, kpiTile, tab, toolbar, rows, pager, panel, segmented, picker, key, cta, selectedPanel, kpiTotal==historyCount, scrollW/innerW, reducedMotion`. **Aceite:** todos `OK` (máx 3 iterações registradas).
- [ ] **T82** — `colors.mjs` (E.3): ΔE ≤ 2 contra os tokens computados da página; `git diff origin/main -- src ':!src/lib' | grep -cE "#[0-9a-fA-F]{6}|hsl\(|rgb\("` = 0; `11-light.png`, `11-skin.png`. **Aceite:** tabela aqui.
- [ ] **T83** — `func.mjs` (E.5, 20 checks): período muda KPIs · aba VoIP · busca nome · busca número · Direção · Resultado · página 2/volta · deep link · selecionar/Esc · picker · teclado físico · WhatsApp desabilitado com motivo · CTA sem número · discar `+5511000000000` → `dialing` → Cancelar → linha `cancelled` **real** · `ActiveCallBar` em `?view=inbox` · notas salvam · 2 abas líder/seguidora · seletor Minhas/Todas · console sem `error`. **Aceite:** JSON `{ok, fail, consoleErrors}` aqui; 20/20.
- [ ] **T84** — `axe.mjs` (E.5): tela ociosa + painel ativo. **Aceite:** 0 `serious/critical`.
- [ ] **T85** — Testes de código: `useSipClient.test`/adapter cobrem invite+cancel, established+bye, 486/480/603, reconexão cancelada no unmount, mute nas tracks, DTMF só ativo; provider mantém sessão na navegação; `lib/calls` 100 % branches (`vitest --coverage` só na pasta); tabela 4 estados; `NewCallPanel` 4 CTAs; `IncomingCallAlert` 3 capacidades; `calls-access.test.ts` (T07) sem `todo`. **Aceite:** contagem antes/depois e cobertura aqui; `npx vitest run` inteiro verde.
- [ ] **T86** — E2E `e2e/telefonia.spec.ts` (usuário de QA): abrir módulo, KPIs, filtros, página 2, painel, notas; habilitar no `e2e-logado.yml`. **Aceite:** verde nos 3 browsers.
- [ ] **T87** — `HOMOLOGACAO.md` em `docs/telefonia/` com o roteiro de áudio (Apêndice G do plano anterior) e a tabela vazia de 9 cenários. **Aceite:** commitado.
- [ ] **T88** — Fechamento Fase 9: PR de testes mergeada. **Aceite:** seção 11.

## FASE 10 — Gates, entrega e homologação (T89–T100)

- [ ] **T89** — Gates completos: `tsc`, `lint-ratchet`, `typecheck-ratchet`, `implicit-any`, `npm run lint`, `npx vitest run`, `npm run build`, `bundle-budget` (chunk `calls` Δ ≤ +12 KB gz). **Aceite:** 8 saídas exit 0 aqui.
- [ ] **T90** — Remover o alias `VoIPPanel` se `grep -rn VoIPPanel src` só apontar para o próprio arquivo e `ViewRouter`. **Aceite:** grep aqui.
- [ ] **T91** — `useCalls.startCall/answerCall/endCall/missCall` e `useCallHistory` removidos se sem consumidor (T13/T41). **Aceite:** `grep -rn "useCallHistory\|startCall(" src` vazio fora de testes apagados.
- [ ] **T92** — `CAPACIDADES.md` e `CONTRATO.md` revisados contra o código final (data, commit). **Aceite:** nenhuma afirmação sem linha de código correspondente.
- [ ] **T93** — Snapshot final `telefonia-baseline-2026-09-29/final.json` (T04) + diff contra `pos-fase-0.json`. **Aceite:** diff commitado; só as 0–1 migrations deste plano (T26) aparecem.
- [ ] **T94** — Deploy das Edge Functions tocadas (`get-sip-password`, `evolution-webhook`, e T72/T73 se houver) via `deploy-functions.yml` + aprovação `producao-edge-functions`; run verde citado. **Aceite:** `curl` de `get-sip-password` em produção devolve 5 campos.
- [ ] **T95** — Verificação de produção: deployment Vercel `READY` para o SHA do último merge; `12-prod.png`; `measure.mjs`/`colors.mjs` contra produção. **Aceite:** tabelas aqui.
- [ ] **T96** — Homologação de áudio (roteiro T87) com um agente real: VoIP saída atendida / não atendida / ocupada · VoIP entrada atendida / recusada / perdida · WhatsApp entrada tocando / perdida · navegação durante a chamada · 2 abas. Cada cenário = 1 linha real em `calls` com `id, status, end_reason, talk_seconds, provider_call_id`. **Aceite:** tabela de 9 cenários com ids reais aqui. **Só aqui o módulo é "pronto".**
- [ ] **T97** — Reconciliação pós-homologação: `SELECT count(*) FROM calls WHERE status='ringing' AND started_at < now() - interval '1 hour'` = 0 (nenhuma linha nova presa). **Aceite:** consulta aqui.
- [ ] **T98** — Decisões D1–D7 finais na seção 10 com data e quem decidiu; o que **não** está prometido (saída por WhatsApp, gravação se D3=b, ramal por agente, seleção de dispositivo de áudio) listado no corpo da última PR. **Aceite:** seção 10 completa.
- [ ] **T99** — CLAUDE.md ganha seção "Telefonia" (provedor SIP, secret, RPCs canônicas, `notes` × `agent_notes`, pasta de docs, regra "merge ≠ deploy de Edge"). **Aceite:** seção presente, sem tocar o resto.
- [ ] **T100** — Encerramento: este arquivo com checklist final, links das PRs e "Pendências/resíduos" honesto; `TELEFONIA_STATUS.md` recebe linha final "superado por …". **Aceite:** ambos no mesmo PR.

---

## 10. Decisões (T02 / T98)

| # | Decisão | Valor | Data | Quem |
|---|---|---|---|---|
| D1 | Ramal SIP | (a) `phone1` compartilhado + detecção de conflito | 2026-09-29 | padrão do plano (executor: Hermes) — revisável por Joaquim |
| D2 | Saída por WhatsApp | (a) só eventos | 2026-09-29 | padrão do plano (executor: Hermes) — revisável por Joaquim |
| D3 | Gravações | **reconciliar com o Bitrix24 (`voximplant.statistic.get`)** — a opção "nenhuma" foi descartada | 2026-09-29 | **DECIDIDO por Joaquim em 29/09** — a Fase 7 passa a implementar a integração |
| D4 | Escopo "Todas" | (a) admin/supervisor | 2026-09-29 | padrão do plano (executor: Hermes) — revisável por Joaquim |
| D5 | Linhas por página | 8 | 2026-09-29 | padrão do plano (executor: Hermes) — revisável por Joaquim |
| D6 | KPIs seguem busca/filtros | não | 2026-09-29 | padrão do plano (executor: Hermes) — revisável por Joaquim |
| D7 | Recusar WhatsApp | **(b) "Ignorar"** | 2026-09-29 | padrão do plano (executor: Hermes) — "Ignorar" = `declined` local, sem endpoint de recusa comprovado no Evolution GO |

## 11. Mapa de PRs

| Fase | Etapas | Tipo | Gate | PR | Merge/apply |
|---|---|---|---|---|---|
| 0 | T01–T08 | docs + script + DML (T03) | CI verde; T03 com `RETURNING` | **#1181** | merge pelo `hermes-tarefa-mergear` (sem DDL pendente) |
| 1 | T09–T22 | motor (toca `AppProviders`, Edge) | **Aguarda Joaquim** | **#1193** (T09 + T14; T10–T22 pendentes) | não mergear com a fase pela metade |
| 2 | T23–T32 | canais + webhook + inbox | **Aguarda Joaquim** (Edge) | — | — |
| 3 | T33–T42 | shell/header/KPIs | CI verde | — | — |
| 4 | T43–T54 | histórico | CI verde | — | — |
| 5 | T55–T61 | nova ligação | CI verde | — | — |
| 6 | T62–T70 | painéis + `AppShell` | **Aguarda Joaquim** (T69) | — | — |
| 7 | T71–T74 | gravações (condicional) | Edge → Joaquim | — | — |
| 8 | T75–T80 | motion/a11y/responsivo | CI verde | — | — |
| 9 | T81–T88 | QA + testes | CI verde | — | — |
| 10 | T89–T100 | entrega + homologação | Joaquim (deploy, homologação) | — | — |

**Ordem obrigatória:** 0 → 1 → 2 → 3 → 4 → 5 → 6 → (7) → 8 → 9 → 10. Fases 3–5 podem ser paralelizadas por arquivo depois de 2 mergeada.

*Plano criado em 2026-09-29 a partir da auditoria do mesmo dia. Nenhuma etapa executada.*
