# Telefonia — Plano de melhorias — STATUS

> Ledger obrigatório do plano `docs/design/PLANO_MELHORIAS_TELEFONIA_100_ETAPAS.md`.
> Só marque `[x]` com a evidência ao lado. Executor: **Hermes** (WSL, workspace isolado por tarefa).
> O plano foi escrito para o container `claude-code` da VPS; aqui o worktree/branch são os do fluxo
> Hermes (`hermes-tarefa-iniciar`), e toda evidência vive neste arquivo.

Branch: `hermes/telefonia-contrato-dados-26092615475e51` · Base: `001fd463b026a635d67848e326bb4cffe6641452` (`origin/main`)
Workspace: `~/hermes-workspaces/zapp-web-v2-main/telefonia-contrato-dados-26092615475e51`
Rota de banco usada: gateway MCP `supabase-zapp-web-v2-mcp.adm01.workers.dev` (projeto Cloud `tnnnlkbymytvtqngbbqh`), cliente `~/projetos/mcp-clone-bwwbey/zapp_db.py`
Preview: não usado nesta sessão (Fases 0–2 não mudam UI) · Playwright: **browsers instalados, credenciais de QA AUSENTES** (ver Bloqueios)
Provedores (etapa 6): SIP = **Bitrix24 SIP Connector** (`ip.b24-9441-1552764901.bitrixphone.com`, ramal `phone1`, WSS 8089) · WhatsApp = **Evolution GO** (1 linha: `PRINCIPAL`, status `disconnected`) · Evolution reject = **não comprovado** · gravação = **nenhuma fonte comprovada** (sem bucket de gravação, sem webhook REST do Bitrix configurado)
Decisões: **D1=a D2=a D4=a D5=8 D6=não** (recomendações do plano, aplicadas por ausência de resposta antes da sessão) · D3 e D7 **pendentes de evidência** (etapa 6 não conseguiu confirmar; ver Divergências)

---

## CP0 Ambiente        [x] sha=001fd46 · before=**PENDENTE (sem credencial de QA)** · consoleErrors=n/a · gates baseline ok (ver abaixo)

Etapas 1–9:

1. **Worktree/branch** — `hermes-tarefa-iniciar zapp-web-v2-main telefonia-contrato-dados` →
   `~/hermes-workspaces/zapp-web-v2-main/telefonia-contrato-dados-26092615475e51`,
   branch `hermes/telefonia-contrato-dados-26092615475e51` a partir de `origin/main`, `git rev-parse HEAD` = `001fd463b026a635d67848e326bb4cffe6641452`.
   (Desvio deliberado da etapa 1: o plano manda `claude/...` e `/workspace/repos/...`; o fluxo Hermes
   cria `hermes/<slug>-<id>` e `~/hermes-workspaces/...`. Um worktree por tarefa, como o plano exige.)
2. **PRs abertas que tocam a área** — `gh pr list -R adm01-debug/Zapp_Web_V2 --state open` = **vazio** (0 PRs abertas).
   Últimos merges na área: #872 (E17 re-versionada), #871, #870, #869, **#868 `fix(telefonia): recebimento SIP, sessão persistente e integridade de dados das chamadas`**.
   → **sem BLOQUEIO**, mas o #868 mudou o ponto de partida da Fase 3 (ver Divergências).
3. **Ledger** — este arquivo + `docs/design/PLANO_MELHORIAS_TELEFONIA_100_ETAPAS.md` (cópia do plano, 753 linhas) commitados.
4. **Grafo (`graphify`)** — não existe `graphify-out/GRAPH_REPORT.md` no repo e o binário `graphify` não está no WSL → substituído pelo inventário da etapa 5 (grep), conforme regra de divergência.
5. **Inventário de consumidores** (grep em `src/`, excluindo testes):
   | Símbolo | Arquivos que referenciam |
   |---|---|
   | `start-voip-call` | **1** (`src/components/inbox/contact-details/ContactActionButtons.tsx:100`) — emissor **sem consumidor** confirmado |
   | `useSipClient` | 6 |
   | `IncomingCallAlert` | 8 |
   | `useIncomingCallListener` | 4 |
   | `CallDialog` | 13 |
   | `useCalls(` | 3 |
   | `findContactByPhone` | 5 |
   | `useCallSession` | 4 (novo: `src/providers/CallSessionProvider.tsx`, montado em `AppProviders.tsx:79`) |

   Reutilizáveis encontrados: `src/lib/formatters.ts` (`cleanPhone`, `formatBrazilianPhone`, `formatDuration`), `src/lib/avatar-colors.ts` (`getInitials`, `getAvatarColor`), `ContactKpiCard`/`ContactStatsCards` em `src/components/contacts/` (candidatos ao KPI da etapa 56), `ptBR` de `date-fns/locale` já usado em outras views. **Não existe** util de telefone em `src/lib` (só o teste `phoneNormalization.test.ts`, que inlina a própria lógica).
6. **Provedores reais** — matriz em `docs/telefonia/CAPACIDADES.md` (commitada junto). Respostas às 4 perguntas da seção 1.5:
   - (a) SIP = **Bitrix24 SIP Connector** (hardcoded em `src/hooks/communication/useSipClient.ts:15-17`); senha vem do segredo `SIP_PASSWORD` via Edge `get-sip-password`.
   - (b) WhatsApp: **não existe linha `wpp2`**. Existe **1** linha em `whatsapp_connections`: `Promo Brindes WhatsApp`, `instance_id=PRINCIPAL`, `phone_number=551146375517`, `status=disconnected`, `is_default=true`. A tabela **não tem coluna `integration`/`provider`** (premissa do plano não existe no schema) e não há como distinguir Baileys/Cloud pelo banco. Flavor do provedor: **Evolution GO** (`EVOLUTION_API_FLAVOR=go`).
   - (c) Endpoint de recusa de chamada no Evolution: **não comprovado** (nenhum handler de reject/hangup em `evolution-webhook-handlers.ts`, `useIncomingCallListener.ts` ou `IncomingCallAlert.tsx`).
   - (d) Ramal `phone1` **compartilhado**: sim, `get-sip-password` devolve um único segredo → D1=a.
7. **QA tooling** — Playwright 1.63 com browsers em `~/.cache/ms-playwright` (ok). **Credenciais `ZAPP_QA_EMAIL`/`ZAPP_QA_PASSWORD` não existem neste host** (não estão em `~/.secrets` nem nos `.env` do repo; no container do Claude Code vivem em `/workspace/.secrets/zapp-v2.env`). Pergunta ao dono feita; tarefa segue nas fases que não precisam de preview. Papel do usuário de QA: **não verificado** (banco tem 3 `admin`, 3 `agent`, **0 `supervisor`**).
8. **Baseline dos gates** (branch, antes de qualquer mudança):
   - `npx tsc -b --force` → **exit 0**
   - `node scripts/ci/lint-ratchet.mjs` → ver log abaixo
   - `node scripts/ci/typecheck-ratchet.mjs`, `npm run implicit-any-check` → ver log abaixo
   - `npx vitest run src/components/calls src/hooks src/lib/calls` → ver log abaixo
   (saídas literais registradas ao final deste arquivo, seção "Log de gates")
9. **Screenshot ANTES (`00-before.png`)** — **NÃO EXECUTADO**: exige login de QA. Registrado em Bloqueios.

---

## CP1 Contrato        [x] commits `feat(telefonia): fase 1...` + `refactor(telefonia): unifica EndReason...` · testes lib/calls=217 (6 arquivos, 100% verde) · deps react/supabase=0

Etapas 10–17 — `src/lib/calls/` (6 módulos puros + 6 arquivos de teste):

| Módulo | Conteúdo | Teste |
|---|---|---|
| `callStatus.ts` | `CallChannel`, `CallDirection`, `PersistedStatus`, `CallResult`, `EndReason`; `normalizeStatus` (legado `completed→ended`, `ongoing→answered`); `toResult` (as 10 linhas da tabela 2.7); `RESULT_LABEL` pt-BR; `RESULT_TONE`; `sipCodeToEndReason` | `__tests__/callStatus.test.ts` |
| `duration.ts` | `talkSeconds` (`talk_seconds ?? diff(answered,ended)`), `formatClock`, `formatTalk`, `—` para nulo/0 | `__tests__/duration.test.ts` |
| `phone.ts` | `normalizeE164BR`, `formatPhoneBR`, `phonesMatchExact` (comparação exata; **nunca** por sufixo de 8 dígitos) sobre `cleanPhone`/`formatBrazilianPhone` de `src/lib/formatters.ts` | `__tests__/phone.test.ts` |
| `capabilities.ts` | `ChannelCapability`, `CapabilityReason`, `describeReason` em linguagem operacional | `__tests__/capabilities.test.ts` |
| `session.ts` | máquina de estados pura do Apêndice C (`reduce`, `initialState`, `endReasonFor`) com invariantes e transições inválidas → estado inalterado + `warn` | `__tests__/session.test.ts` (tabela completa de transições válidas + 10 inválidas) |
| `events.ts` | contrato `zapp:start-call` (`StartCallPayload`, `dispatchStartCall`, `onStartCall`) com compatibilidade do evento legado `start-voip-call` | `__tests__/events.test.ts` (_round-trip_ + conversão do legado) |

Gate do CP1: `grep -c "from 'react'\|supabase" src/lib/calls/*.ts` = **0** (nenhum módulo de domínio
depende de React ou Supabase). Resultado: `npx vitest run src/lib/calls` → **6 arquivos, 217 testes, exit 0**.

### Reconciliação do CP1 (26/09) — duas uniões de `EndReason` eram um defeito real

Os dois subagentes que escreveram os módulos em paralelo declararam `EndReason` cada um por conta própria:
`session.ts` tinha uma união local de 8 valores e `callStatus.ts` a união canônica de 11 (com
`hangup_local`, `hangup_remote`, `busy_here`). Pior: `persistedStatusForEndReason` (session.ts) não tratava
esses 3 valores → devolveria `undefined` e a Fase 3 gravaria `calls.status` inválido (ou nada) numa ligação
atendida que cai. Consolidado num único dono:

- `session.ts` agora **importa** `EndReason`, `PersistedStatus` e `sipCodeToEndReason` de `./callStatus` e os
  reexporta (a cópia local do mapa SIP foi apagada);
- `persistedStatusForEndReason` cobre a união inteira: `hangup_local`/`hangup_remote` → `ended`,
  `busy_here` → `missed`;
- 2 testes novos: uma tabela exaustiva que falha se qualquer valor devolver `undefined`, e um teste de
  identidade (`sipCodeToEndReason === callStatus.sipCodeToEndReason`) que impede a cópia de voltar;
- **prova de mutação**: trocando `busy_here → 'ended'` no código, 5 testes quebram; revertido, 217 voltam a
  passar (`npx vitest run src/lib/calls` → 6 arquivos/217, `npx tsc -b --force` → exit 0).

### Divergências internas dos módulos, aceitas e registradas

| Ponto | Decisão | Motivo |
|---|---|---|
| `487 → cancelled` (etapa 10) vs `487 → no_answer` (etapa 88) | **etapa 10 vence** | é ela que governa o mapa do front; a etapa 88 é reconciliação com o Bitrix e pode divergir sem quebrar a UI |
| `connecting` ganha saídas (`HANGUP_LOCAL→cancelled`, `HANGUP_REMOTE→no_answer`, `FAILED→failed`) | aceito, marcado como extensão no teste | sem isso o estado é beco sem saída |
| `ringing_in` continua estrito (`ACCEPT`/`REJECT`/`CANCEL_REMOTE`/`TIMEOUT`) | aceito | `BYE` remoto tocando chega como `CANCEL_REMOTE`, conforme o plano |
| `ending` colapsa para `ended` na mesma chamada | aceito, mas `ending` é aceito como estado de entrada | a tabela diz `ending→ended`; sem colapsar, a persistência de entrada em `ended` nunca ocorreria |
| `INVITE_RECEIVED` com sessão ocupada → mesma referência, **sem** `warn` | aceito | é linha da tabela, não transição inválida (`busyHereOutcome()` = `{missed, busy}`) |
| `zapp:start-call` em `document`, legado `start-voip-call` em `window` | aceito | o emissor real (`ContactActionButtons.tsx:100`) usa `window.dispatchEvent`; os dois são removidos no cleanup |

## CP2 Banco (gate)    [~] PR-A=**#875** · schema efetivo medido · backfill: wa=10 voip=11 (+ 0 talk_seconds) · rls_test=PASS 61/61 · **AGUARDANDO APROVAÇÃO — nada aplicado em produção**

**Parada obrigatória do plano (regra 7 da seção 0.2).** A migration existe, foi provada em PostgreSQL 17
descartável e **não** foi aplicada no projeto Cloud `tnnnlkbymytvtqngbbqh`.

- Arquivo: `supabase/migrations/20260926190000_calls_telefonia_v2.sql`
- `sha256` do arquivo (para conferência): `5b0981f347aa2d6bda0d3a666d5a0853467b72835a846937337b71f36cdf4b49`
- Versão (14 dígitos): `20260926190000`

Dois caminhos de aplicação, ambos exigindo o "APROVADO" do dono:

| Caminho | Como | Observação |
|---|---|---|
| **A — pelo repo (recomendado)** | merge da #875 na `main` → workflow **DB Migrate** com `apply=false` (dry-run, exige `migration_version=20260926190000` e `confirm_project_ref=tnnnlkbymytvtqngbbqh`) → rodar de novo com `apply=true` + `confirm_runtime_sha256` do dry-run | o workflow só roda **na main** e para no environment **`producao-ddl`** (aprovação humana + aviso de card). É o único caminho com preflight/backup do próprio repo |
| **B — pelo chat (o do plano)** | aplicar o SQL pelo MCP oficial do projeto (`db_query`) | mais rápido, sem preflight nem prova de destino; só com APROVADO explícito |

Depois do apply: conferir `select version, name from supabase_migrations.schema_migrations order by version desc limit 3`
(esperado: `20260926190000` no topo) e o frescor de `types.ts`. O workflow **db-live-guard** compara o schema vivo
com o repo — deve ficar verde depois do apply + merge.

Etapas 18–28:

- **19. Migration** `supabase/migrations/20260926190000_calls_telefonia_v2.sql` (versão > `max(version)` = `20260926180000`).
  Aditiva: 9 colunas, 4 CHECKs (`NOT VALID` + `VALIDATE`), backfill de `channel`/`talk_seconds`, 2 índices,
  entrada em `supabase_realtime`, 4 RPCs novas + `CREATE OR REPLACE` de `record_incoming_call_event` (diff ≤ 15 linhas).
- **20/21/22/23. RPCs** `search_my_calls`, `my_calls_kpi`, `upsert_my_call`, `set_call_agent_notes` e o ajuste
  de `record_incoming_call_event` (agora `NOT`: `agent_id = COALESCE(calls.agent_id, EXCLUDED.agent_id)` e
  `notes = COALESCE(calls.notes, EXCLUDED.notes)`; `channel='whatsapp'`, `provider_call_id`, `peer_number`,
  `peer_name`; `talk_seconds` calculado quando `ended_at` chega com `answered_at`).
- **24. Realtime** — `calls` estava **fora** da publicação; a migration adiciona dentro de guarda de idempotência.
- **25. Gravações (D3)** — nenhum bucket de gravação e nenhum `BITRIX_WEBHOOK_URL`: nada de policy criada,
  `recording_status` fica `none`. Decisão registrada.
- **26. Prova de RLS/contrato** — `scripts/db-audit/calls-telefonia-contract.test.sh` no harness oficial do repo
  (`retry-disposable-postgres-test.sh`, PostgreSQL 17 descartável): **61 asserções PASS, exit 0**.
  Cobre: escopo `mine`/`all` por ator (agente, outro agente, admin), IDOR em `upsert_my_call` e
  `set_call_agent_notes`, chamada sem dono, filtros, busca por nome e por dígitos, `total_count` fora da página,
  teto de 50 linhas, paginação sem repetição, preservação de `agent_id`/`notes` em evento repetido,
  cálculo de `talk_seconds`, CHECKs ampliados, ACL (`anon`/PUBLIC sem EXECUTE) e idempotência da migration.
  O teste foi **registrado no CI** (`.github/workflows/db-guard.yml`, job "Contrato DB offline").
- **27. `types.ts`** — edição aditiva manual: 9 colunas em `Row`/`Insert`/`Update` + 4 RPCs na ordem alfabética do gerador.
  `npx tsc -b --force` → **exit 0**.
- **28. PR-A** — aberta com o título `infra(telefonia): contrato de dados — colunas aditivas, RPCs e prova de RLS`.
  **PARADO AQUI.** Nenhum `apply_migration` foi executado: DDL em produção depende do "APROVADO" do Joaquim.

### Três decisões de engenharia dentro da Fase 2 (todas justificadas no arquivo da migration)

1. **CHECK de status ampliado.** `calls_status_check` já existia e aceitava só
   `ringing|answered|ended|missed|busy|failed`. A máquina de estados do Apêndice C grava `cancelled` e
   `declined`; a alteração **amplia** o domínio (superconjunto) — nenhuma linha existente viola, nada é
   removido nem reescrito. Prova: 21 linhas atuais só têm `ringing` e `ended`.
2. **`set_call_agent_notes` é `SECURITY DEFINER`.** A policy de UPDATE de `calls` só permite o **dono**, então
   o admin/supervisor do Apêndice B.4 não conseguiria gravar numa função `SECURITY INVOKER`
   (descoberto pela própria prova de RLS: a asserção "admin também pode anotar" falhou). Optei por fechar a
   autorização **dentro** da RPC (dono OU `is_admin_or_supervisor`) em vez de ampliar a policy de escrita da
   tabela, que valeria para qualquer caminho de código.
3. **`company_name` removido do retorno de `search_my_calls`** (estava no Apêndice B.1): não existe tabela
   `public.companies` nem `contacts.company_id` neste banco.

### Não foi feito nesta sessão (e por quê)

- `apply_migration` no projeto Cloud `tnnnlkbymytvtqngbbqh`: **proibido pelo plano** (regra 7 da seção 0.2) — espera o gate humano.
- `supabase/schema-catalog.json`: é regenerado a partir do banco vivo (job `db-live-guard`), então só muda depois do apply.
- Screenshot `00-before.png` e QA E.1–E.5: bloqueados por falta de credencial de QA (ver Bloqueios).

### Schema efetivo de `public.calls` (etapa 18 — medido no banco Cloud, não na migration)

- **Colunas hoje (14)**: `id, contact_id, agent_id, whatsapp_connection_id, direction, status, started_at, answered_at, ended_at, duration_seconds, recording_url, notes, created_at, provider_event_id`.
  → **Nenhuma** das 9 colunas aditivas do Apêndice A existe. `direction` e `status` são `NOT NULL`; `status` tem default `'ringing'`.
- **Linhas**: 21 no total · 10 com `whatsapp_connection_id` · 11 com `agent_id` · 10 **sem** `agent_id` · **0** com `answered_at` e `ended_at` juntos (⇒ backfill de `talk_seconds` = **0 linhas**, backfill de `channel` = 11 `voip` / 10 `whatsapp`).
- **Status gravados hoje**: 19 × `ringing` (10 inbound, 9 outbound) e 2 × `ended` (outbound). Nenhum legado `completed`/`ongoing`, nenhum `missed`.
- **Policies (3, todas `authenticated`)**: `Users can view own calls` (SELECT: próprio `agent_id` **ou** `is_admin_or_supervisor(auth.uid())`), `Users can insert calls` (INSERT, mesmo WITH CHECK), `Users can update their calls` (UPDATE, USING só dono).
  → **NÃO é preciso criar** `calls_insert_own`/`calls_update_own` (etapa 22 do plano é condicional e a condição é falsa). O helper do repo é **`is_admin_or_supervisor(uuid)`**, não `has_role(...)` como o plano supôs.
- **Realtime**: `public.calls` **NÃO** está em `supabase_realtime` → etapa 24 é obrigatória (tabela vazia na consulta `pg_publication_tables`).
- **Índices**: `calls_pkey`, `calls_connection_provider_event_unique` (unique parcial em `whatsapp_connection_id, provider_event_id`), `idx_calls_agent_id`, `idx_calls_contact_id`, `idx_calls_whatsapp_connection_id`. Nenhum composto por `(agent_id, started_at)`.
- **RPCs existentes**: só `record_incoming_call_event(p_contact_id, p_whatsapp_connection_id, p_status, p_is_video, p_provider_event_id, p_should_notify)` — `SECURITY DEFINER`; status aceitos `ringing|answered|ended|missed|busy|failed`; `ON CONFLICT (whatsapp_connection_id, provider_event_id) WHERE provider_event_id IS NOT NULL`; **regrava `agent_id = EXCLUDED.agent_id` e `notes = EXCLUDED.notes`** (o defeito que o plano aponta). `search_my_calls`, `my_calls_kpi`, `upsert_my_call`, `set_call_agent_notes` **não existem**.
  Helpers úteis confirmados: `public.has_role(_user_id uuid, _role app_role)`, `public.is_admin_or_supervisor(uuid)`, `public.search_contacts(...)` (10 args).
- **Ledger de migrations**: 502 registros, `max(version) = 20260926180000` → a migration desta tarefa precisa usar versão estritamente maior.
- **Storage**: buckets existentes = `audio-memes, audio-messages, avatars, custom-emojis, stickers, team-chat-files, whatsapp-media`. **Nenhum bucket de gravação** → etapa 25 não tem policy a criar; `recording_status` fica `none` até prova em contrário.

---

## Divergências plano × código

1. **A Fase 3 já foi parcialmente feita pelo PR #868 (mergeado 26/09 17:19, depois de `c660ff96`).**
   O plano afirma "SIP só de saída; não há `onInvite`" e "`useSipClient` é instanciado dentro da view".
   Realidade: existe `src/hooks/sip/__tests__/useSipConnection.test.ts`, `useSipConnection.ts` já monta
   `onInvite` (linha 54) e existe `src/providers/CallSessionProvider.tsx` (22 linhas) montado em
   `AppProviders.tsx:79`, com `useCallSession()` em uso em 4 arquivos.
   **Ajuste proposto (não executado nesta sessão)**: a Sessão 2 deve começar re-lendo `onInvite`,
   `useSipConnection` e `CallSessionProvider` e reduzir o escopo das etapas 29–32 ao que realmente falta
   (o provider hoje é um contexto fino sobre `useSipClient` — não tem máquina de estados nem adapters).
   `src/lib/calls/` **não existia** e é o que esta sessão está criando.
2. **Policies de escrita já existem** com nomes diferentes dos do plano e usando `is_admin_or_supervisor`
   em vez de `has_role`. Migration não recria policy; as RPCs usam o helper que já está nas policies.
3. **`whatsapp_connections` não tem `integration`/`provider`** e **não existe a linha `wpp2`**: há uma única
   conexão, `PRINCIPAL`, `disconnected`. A etapa 42 (capacidade por flavor) precisa de outra fonte de verdade
   — hoje o código só tem `instance_id`/`status`/`health_status`. `canDial` de WhatsApp = `false` por falta de
   endpoint de originação, não por flavor.
4. **Sem bucket de gravação e sem `BITRIX_WEBHOOK_URL`** (só a linha comentada `# VITE_BITRIX_WEBHOOK_URL` no
   `.env.example`) → Fase 9 tende a "pulada"; depende do dono confirmar o webhook REST do Bitrix24.
5. **`graphify` indisponível** neste host (etapa 4 substituída por grep).
6. **Etapa 9 / CP0 (screenshot ANTES) bloqueada** por falta de credencial de QA (ver Bloqueios).

## Iterações do loop visual (máx 3 por fase)
- (nenhuma ainda — Fases 0–2 não têm loop visual)

## Bloqueios
- **Credenciais de QA ausentes** (`ZAPP_QA_EMAIL`/`ZAPP_QA_PASSWORD`): bloqueia etapa 7, etapa 9
  (`00-before.png`) e, na Sessão 2, os checkpoints visuais CP5–CP12 (E.1–E.5). Não há como obter do host.
- **Gravação**: nenhuma fonte comprovada (sem bucket, sem webhook Bitrix). D3 fica em aberto.
- **Recusa de chamada WhatsApp (D7)**: endpoint do Evolution GO não comprovado.

## Log de gates (saída literal resumida)

**Baseline, antes de qualquer mudança** (mesma árvore, branch da tarefa em `001fd46`):
```
npx tsc -b --force                          -> exit 0
node scripts/ci/lint-ratchet.mjs            -> baseline=1031, atual=1019, novas=0 -> exit 0
node scripts/ci/typecheck-ratchet.mjs       -> baseline=0, atual=0, novas=0 -> exit 0
npm run implicit-any-check                  -> exit 0
npx vitest run (suíte inteira)              -> 122 arquivos, 1113 testes passando, 6 todo -> exit 0
npm run db:guard (depois da migration)      -> violações novas: 0 · 504 arquivos válidos -> exit 0
```

**Depois das Fases 1–2:**
```
npx tsc -b --force                          -> exit 0
npx vitest run src/lib/calls                -> 6 arquivos, 215 testes passando -> exit 0
npx vitest run src/components/calls src/hooks src/lib/calls   (MESMO filtro do baseline)
                                            -> 128 arquivos passando +1 skip, 1328 testes (antes: 122/1113) -> exit 0
npx vitest run (suíte inteira do repo)      -> 290 arquivos passando +1 skip, 4029 testes, 41 todo -> exit 0
bash scripts/db-audit/retry-disposable-postgres-test.sh \
     bash scripts/db-audit/calls-telefonia-contract.test.sh
                                            -> 61 asserções [PASS], "Telefonia v2 data contract (PostgreSQL 17): PASS" -> exit 0
npm run db:guard                            -> "Violacoes totais: 0 | novas: 0" -> exit 0
```

Honestidade sobre as medições: o delta no mesmo filtro é **+215 testes** (exatamente os arquivos novos de
`src/lib/calls`), sem nenhum teste removido ou alterado. A suíte completa do repo (4029 testes) foi medida
**depois** do trabalho; o baseline completo não foi executado antes — o número de comparação confiável é o do
filtro idêntico (1113 → 1328). O gate que decide a regressão em produção é o CI do PR.
