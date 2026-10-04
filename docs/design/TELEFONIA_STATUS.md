# Telefonia — Plano de melhorias — STATUS

> Ledger obrigatório do plano `docs/design/PLANO_MELHORIAS_TELEFONIA_100_ETAPAS.md`.
> Só marque `[x]` com a evidência ao lado. Executor: **Hermes** (WSL, workspace isolado por tarefa).
> O plano foi escrito para o container `claude-code` da VPS; aqui o worktree/branch são os do fluxo
> Hermes (`hermes-tarefa-iniciar`), e toda evidência vive neste arquivo.

> **Superado em 2026-09-29.** O plano vivo passa a ser
> `docs/design/PLANO_TELEFONIA_FINALIZACAO_100_ETAPAS_2026-09-29.md` (T01–T100), escrito a partir de
> `AUDITORIA_TELEFONIA_ESTADO_REAL_2026-09-29.md`. O histórico abaixo fica como registro das fases 0–2 (CP0–CP2).

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

## CP2 Banco (gate)    [x] PR-A=**#875** — **fechada sem merge**; o conteúdo entrou na `main` por **#930 + #945** · schema efetivo medido · backfill: wa=10 voip=11 (+ 0 talk_seconds) · rls_test=PASS 61/61 · **APLICADO EM PRODUÇÃO (26/09)**

**Aplicado no projeto Cloud `tnnnlkbymytvtqngbbqh` em 26/09** via `db_query` + registro no ledger (mesma
transação, PR #930 mergeada antes): `20260926800000_calls_telefonia_v2.sql` (`rows_affected: 1`) seguida
de `20260926900000_fix_set_call_agent_notes_null_profile.sql` (`rows_affected: 1`, `max(version)` reconferido
ao vivo antes de cada apply). Verificado ao vivo: ledger com as duas versions no topo e
`pg_get_functiondef(set_call_agent_notes) LIKE '%v_profile is null%'` = `true` (guarda de autorização ativa).

### Correção de segurança #4 (27/09, auditoria de 5 agentes pós-deploy — CRÍTICO, mesmo padrão do #3)

Nova rodada de auditoria (Joaquim pediu validação exaustiva de tudo aplicado) achou um SEGUNDO bypass em
`set_call_agent_notes`, confirmado independentemente por 2 dos 5 agentes (um deles reproduziu em produção
dentro de `DO ... RAISE EXCEPTION` para garantir rollback — sem tocar dado real, confirmado por
`agent_notes`/marcas de auditoria = 0 após o teste): `calls.agent_id` aceita NULL (chamada inbound ainda
sem agente atribuído — **10 das 22 chamadas em produção têm `agent_id IS NULL`**) e
`if not (v_owner = v_profile or is_admin_or_supervisor(...))` com `v_owner` NULL avalia para NULL — o mesmo
bypass do bug #3, agora do lado do DONO da chamada em vez do perfil do chamador. Qualquer `authenticated`
com perfil (não precisa ser dono nem admin) conseguia sobrescrever `agent_notes` dessas 10 chamadas.

`upsert_my_call` **não** tem esse problema: usa `WHERE calls.agent_id = v_profile` no UPDATE (um `WHERE`
com NULL nunca "passa" por engano) seguido de `if v_id is null then raise exception`, não uma comparação
direta dentro de `IF`.

- Arquivo: `supabase/migrations/20260927100000_fix_set_call_agent_notes_null_owner.sql`
- Fix: troca `v_owner = v_profile` por `coalesce(v_owner = v_profile, false)` — chamada sem dono só pode
  ser anotada por admin/supervisor.
- Teste novo em `scripts/db-audit/calls-telefonia-contract.test.sh`: insere chamada com `agent_id NULL`,
  confirma que agente comum falha e admin ainda consegue anotar.
- **PR #945 mergeada em 27/09; DDL aplicado em produção (ver ledger `20260927100000`).**

**Achados da mesma auditoria fora do escopo desta correção (não tocados aqui, ver Próximos Passos):**
`handle_new_user_role` tem o mesmo padrão (`v_allowed` NULL quando `NEW.email` é NULL — login
anônimo/telefone — pula a checagem de domínio permitido); `get_profile_role_for_check` vaza papel/permissão
de qualquer usuário para qualquer autenticado; `CallDialog.tsx` tem 4 botões ícone sem `aria-label`; a
mesma injeção de `.or()` corrigida no #917 (`useCallHistory.ts`) ainda existe, sem escape, em
`useCatalogContactSearch.ts`, `useGlobalSearchData.ts` e `useNewConversation.ts` (fora do módulo de
Telefonia); `schema-catalog.json` está desatualizado (não reflete as 9 colunas/4 RPCs do #800000, embora
`types.ts` já esteja sincronizado); e a versão `20260926430000` (`multiplix_delivery_receipts`) está no
ledger sem arquivo correspondente no repo (mesmo padrão do incidente E40 do CLAUDE.md) — descoberta ao
conferir paridade 1:1 no range desta tarefa, não relacionada à Telefonia.

### Correção de segurança #3 (26/09, achado de auditoria de 5 agentes — CRÍTICO, corrigido antes do apply)

`set_call_agent_notes` tinha bypass de autorização: se o `auth.uid()` do chamador não tem linha em
`public.profiles` (ex.: conta recém-criada antes do trigger de criação de perfil rodar, ou perfil
apagado manualmente), `v_profile` fica `NULL`. Em PL/pgSQL, `if not (v_owner = NULL or ...)` avalia
para `NULL` (nem TRUE nem FALSE), e `IF NULL THEN` é tratado como falso — o bloco de exceção era
**pulado silenciosamente**, caindo direto no `UPDATE`: qualquer autenticado sem perfil conseguia
sobrescrever `agent_notes` de qualquer chamada de qualquer agente, sem ser dono nem admin/supervisor.
`upsert_my_call` já tinha a guarda certa (`if v_profile is null then raise exception ...`);
`set_call_agent_notes` não tinha o equivalente.

**Corrigido em arquivo NOVO, não editando `20260926800000_calls_telefonia_v2.sql`** (essa migration já
está mergeada em `main` — editar o conteúdo de uma migration existente mantendo o mesmo nome é
exatamente o que o guard "Rejeitar edicao de migration ja existente" de `.github/workflows/db-guard.yml`
(PR #902, em revisão) passa a bloquear, e é a causa raiz dos drifts de setembro que o CLAUDE.md já
documenta — regra 7 da seção 1): `20260926900000_fix_set_call_agent_notes_null_profile.sql`, um
`CREATE OR REPLACE FUNCTION` idempotente com a guarda de `v_profile is null`. Aplicar **depois** de
`20260926800000` (versão maior, mesma ordem). Adicionado também o caso de teste que faltava
(`authenticated sem linha em profiles`) em `scripts/db-audit/calls-telefonia-contract.test.sh`, que só
cobria "terceiro **com** perfil" e por isso não pegou o bug — o script agora aplica os dois arquivos em
sequência antes dos testes funcionais.

- Arquivo: `supabase/migrations/20260926900000_fix_set_call_agent_notes_null_profile.sql`
- `sha256` do arquivo (para conferência): `119708d6047ff99150cb3b876eb7bf77e07b91beca0637b1d02c9b4a6640d350`
- Versão (14 dígitos): `20260926900000`

**Nota (versões atualizadas pela colisão #3, ver seção abaixo):** os números `20260926500000` e
`20260926300000` citados no texto acima (antes desta nota) já foram substituídos pelos atuais
`20260926900000`/`20260926800000` — a numeração original ficou obsoleta enquanto esta correção era
preparada, exatamente como as colisões #1 e #2 documentadas logo abaixo.

### Correção de versão #3 (26/09, revisão Claude — 3ª colisão, `20260926300000` ficou pra trás)

Antes de aplicar (regra 6 da seção 1: conferir `max(version)` ao vivo imediatamente antes do apply),
`SELECT max(version)` voltou `20260926420000` — **maior** que `20260926300000` (a versão vigente até
aqui desta migration). Entre o merge da #897 (que fixou a 2ª colisão) e este apply, quatro migrations
não relacionadas foram registradas por sessões paralelas: `restrict_gmail_accounts_cascade` (240000),
`e17_fk_indexes` (250000), `add_fk_support_indexes` (410000) e `ai_usage_query_telemetry_set_null`
(420000) — confirmado lendo o ledger, nenhuma toca `calls` nem as 4 RPCs do Apêndice B. Sem conflito de
conteúdo, mas aplicar `300000` agora seria out-of-order (ficaria intercalada ANTES de migrations já
aplicadas, mesmo padrão dos drifts de setembro — CLAUDE.md, seção 1, regra 2).

Ambos os arquivos desta tarefa foram reversionados no MESMO PR, preservando a ordem relativa (base
antes da correção de segurança): `20260926300000_calls_telefonia_v2.sql` → `20260926800000_calls_telefonia_v2.sql`
e `20260926500000_fix_set_call_agent_notes_null_profile.sql` → `20260926900000_fix_set_call_agent_notes_null_profile.sql`.
Margem grande de propósito acima do `max(version)` de `20260926420000` medido nesta correção, dada a
velocidade de colisão observada nesta janela (3 colisões na mesma migration em um único dia). Rename
puro em ambos — conteúdo SQL idêntico, só cabeçalho e `comment on function` (que citava a própria
versão) mudaram. `max(version)` conferido ao vivo de novo imediatamente antes do apply real.

### Correção de versão #2 (26/09, revisão Claude — colisão nova)

A versão 20260926300000 acima já é a SEGUNDA reversão. Entre o merge da #885 (que fixou 190000 -> 210000) e o momento do apply, outra sessão registrou uma migration totalmente não relacionada (`restrict_gmail_accounts_cascade`, FK de `gmail_accounts`) sob a MESMA versão 20260926210000 — colisão real, não fantasma (a migration dela aplicou de verdade, confirmado lendo os 2 statements no ledger). `max(version)` pulou de 20260926200000 -> 210000 -> 220000 em menos de 20 minutos: concorrência muito alta nesta janela. Reversionado para 20260926300000 (margem grande de propósito) e a versão foi conferida ao vivo de novo imediatamente antes do apply.

### Correção de versão (26/09, revisão Claude — leia antes de aplicar)

Entre a escrita deste ledger e agora, a PR #872 mergeou **e teve seu DDL aplicado** (`20260926200000
e17_referential_integrity_fks`, confirmado ao vivo: `max(version)` do ledger oficial é `20260926200000`).
Isso tornou a versão original desta migration (`20260926190000`) obsoleta — ficaria **atrás** do que já está
no banco, o mesmo padrão de out-of-order que causou os drifts de setembro (CLAUDE.md, seção 1, regra 2).

Arquivo **reversionado** (rename puro, mesmo procedimento do #872, conteúdo SQL idêntico — só o cabeçalho do
arquivo mudou): `20260926190000_calls_telefonia_v2.sql` → `20260926300000_calls_telefonia_v2.sql`.
As três linhas abaixo ("Arquivo", "sha256", "Versão") e as referências a `migration_version=20260926190000`
no restante desta seção estão **desatualizadas** por esta correção — use sempre `20260926300000`. O aviso
"aplique a minha (190000) primeiro" logo abaixo **não se aplica mais**: a `200000` já está no banco, então
aplicar a `210000` depois dela é a ordem correta e não exige nenhum cuidado extra de sequenciamento.

- Arquivo: `supabase/migrations/20260926800000_calls_telefonia_v2.sql`
- `sha256` do arquivo (para conferência): `f7d1204cabcc9ed87b2a56048a68ca89be1ea1cef9dc719246175b0fb79e8dc0`
- Versão (14 dígitos): `20260926800000`

**Depois da correção de versão #3, o apply é dos DOIS arquivos, nesta ordem** (`20260926800000` primeiro,
`20260926900000` depois — versão maior, aplica por cima da mesma função): pular o segundo deixa o bypass de
`set_call_agent_notes` em produção.

Dois caminhos de aplicação, ambos exigindo o "APROVADO" do dono:

| Caminho | Como | Observação |
|---|---|---|
| **A — pelo repo (recomendado)** | merge desta correção na `main` → workflow **DB Migrate** com `apply=false` (dry-run, exige `migration_version=20260926800000` e `confirm_project_ref=tnnnlkbymytvtqngbbqh`) → rodar de novo com `apply=true` + `confirm_runtime_sha256` do dry-run; repetir para `migration_version=20260926900000` | o workflow só roda **na main** e para no environment **`producao-ddl`** (aprovação humana + aviso de card). É o único caminho com preflight/backup do próprio repo |
| **B — pelo chat (o do plano)** | aplicar os dois SQL pelo MCP oficial do projeto (`db_query`), na ordem `800000` → `900000`, cada um com seu `INSERT` no ledger | mais rápido, sem preflight nem prova de destino; só com APROVADO explícito |

Depois do apply: conferir `select version, name from supabase_migrations.schema_migrations order by version desc limit 3`
(esperado: `20260926900000` no topo, `20260926800000` logo abaixo) e o frescor de `types.ts`. O workflow
**db-live-guard** compara o schema vivo com o repo — deve ficar verde depois do apply + merge.

**Nota histórica (obsoleta, mantida por transparência — ver correção acima): "existe outra migration pendente
na `main`".** No momento em que esta seção foi escrita originalmente, `20260926200000_e17_referential_integrity_fks.sql`
(PR #872) ainda não tinha sido aplicada, e a recomendação era aplicar `20260926190000` antes dela para não
"ficar atrás" no histórico. Isso mudou: a #872 aplicou primeiro, então a reversão para `20260926300000` é o
que resolve a ordem agora — não há mais decisão de sequenciamento a tomar.

Etapas 18–28:

- **19. Migration** `supabase/migrations/20260926800000_calls_telefonia_v2.sql` (versão > `max(version)`, ver correções de versão acima — arquivo já reversionado 3x).
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
- **Ledger de migrations**: 502 registros, `max(version) = 20260926180000` (medido em 26/09, antes do apply da #872 — ver correção acima) → a migration desta tarefa precisa usar versão estritamente maior que o `max(version)` **no momento do apply**, não no momento em que este número foi medido.
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
bash scripts/db-audit/retry-disposable-postgres-test.sh \\
     bash scripts/db-audit/calls-telefonia-contract.test.sh
                                            -> 61 asserções [PASS], "Telefonia v2 data contract (PostgreSQL 17): PASS" -> exit 0
npm run db:guard                            -> "Violacoes totais: 0 | novas: 0" -> exit 0
```

Honestidade sobre as medições: o delta no mesmo filtro é **+215 testes** (exatamente os arquivos novos de
`src/lib/calls`), sem nenhum teste removido ou alterado. A suíte completa do repo (4029 testes) foi medida
**depois** do trabalho; o baseline completo não foi executado antes — o número de comparação confiável é o do
filtro idêntico (1113 → 1328). O gate que decide a regressão em produção é o CI do PR.

## Fase 1-B — T15 e T16 (01/10/2026 · executor: Hermes)

**T15 — provisionamento por Edge.** O host/usuario/porta SIP sairam do front e passaram a vir da funcao
`get-sip-password` (`{ server, user, wsPort, password, profileId }`, lendo `SIP_SERVER`/`SIP_USER`/`SIP_WS_PORT`),
e o 403 do REGISTER virou "linha em uso por outro usuario" em vez de erro generico. Os defaults moram **so** na
funcao — decisao deliberada: o front sobe na hora (Vercel) e a Edge so depois do deploy, entao um fallback no
front seria host velho silencioso. PR **#1384**, `MERGE_SHA=e27367b2`, deploy de producao verde, nenhuma DDL.

**T16 — estados da conexao.** `useSipConnection` passou a `idle|connecting|registered|reconnecting|unavailable`,
com guarda "um UA por vez", unmount durante o backoff nao cria UserAgent orfao e a 6a falha seguida vira
`unavailable` (para de tentar). Detalhe medido: o retry reusa `connect`, entao ele limpa os refs antes de
reentrar — senao a propria guarda impediria a reconexao.

```
npx tsc -b --force                              -> exit 0
bun run test:coverage                           -> 371 arquivos, 4879 testes passando | 38 todo -> exit 0
bun run test:contracts                          -> 27 arquivos, 601 testes passando -> exit 0
node scripts/ci/typecheck-ratchet.mjs           -> nenhum novo erro de tipo -> exit 0
node scripts/ci/lint-ratchet.mjs                -> nenhuma nova divida -> exit 0
node scripts/ci/implicit-any-ratchet.mjs        -> 0 (baseline 0) -> exit 0
node scripts/edge-deploy/generate-manifest.mjs --check  -> Edge manifest OK (67 functions) -> exit 0
node scripts/ci/check-workflow-pins.mjs         -> exit 0
```

**Flake registrado (nao e do diff):** sob a suite completa **com cobertura**, `TasksModule.test.tsx`
("a busca anda no campo na hora e vira filtro depois do debounce, ja na URL") falhou 1x por timing
(`expected '' to contain 'q=liga'`). O diff nao toca `src/components/tasks` nem nada que o modulo importe, e o
arquivo passa **3/3 isolado** sob a mesma config de cobertura. Mesmo padrao de flake de timing que ja apareceu
no E2E de `auth.spec.ts` em 01/10.

## Fase 1-B — T17 (01/10/2026 · executor: Hermes)

**T17 — gate de microfone.** Antes de discar e de atender, o app sonda `getUserMedia({ audio: true })` e
traduz a negativa em motivo operacional (`mic_blocked` / `mic_missing` / `mic_busy`, ids que já existiam em
`capabilities.ts`). Antes disso a negativa caía no `catch` do adapter e virava "Erro ao ligar" genérico — o
agente não sabia se era permissão, aparelho faltando ou outro programa usando o microfone.

- O gate vive no funil real (`useSipClient.makeCall`/`acceptIncomingCall`), porque o painel VoIP chama o SIP
  direto, sem passar pelo provider.
- A sondagem **devolve as tracks** (`stop()`): sondar não é usar, e sem isso o microfone ficaria quente.
- `ondevicechange` re-sonda **apenas quem tinha motivo** (não abre prompt de permissão a cada troca de aparelho).
- **Ordem no provider:** o `dial` despachava `DIAL` antes de chamar o SIP; negativa de microfone deixaria a
  máquina presa em `dialing`. O gate passou a ser aguardado **antes** do despacho.
- **Orçamento preservado:** `useSipClient.ts` com **115 linhas** (aceite T09 pede < 120) — o bloco de
  provisionamento saiu para `src/lib/calls/sipProvisioning.ts`.

```
npx tsc -b --force                              -> exit 0
bun run test:coverage                           -> 379 arquivos, 4933 testes passando | 38 todo -> exit 0
bun run test:contracts                          -> 27 arquivos, 758 testes passando -> exit 0
node scripts/ci/typecheck-ratchet.mjs           -> nenhum novo erro de tipo -> exit 0
node scripts/ci/lint-ratchet.mjs                -> nenhuma nova divida -> exit 0
node scripts/ci/implicit-any-ratchet.mjs        -> 0 (baseline 0) -> exit 0
node scripts/edge-deploy/generate-manifest.mjs --check  -> exit 0
node scripts/ci/check-workflow-pins.mjs         -> exit 0
```

**Mutação (vermelho antes):** sem o gate no dial caem 3 testes; sem o gate no accept cai 1; sem o `stop()`
das tracks cai 1; apagando o mapeamento do `NotFoundError` cai 1. Restaurado, 44/44 verdes.

**Armadilha medida (registro):** guardar cópia de `.ts`/`.tsx` em `.tmp/` **dentro** da árvore do repo faz o
`lint-ratchet` acusar a própria cópia como dívida nova (o eslint varre `.tmp`). Rascunho de código aqui só com
sufixo `.bak`.

## Fase 1-B — T19 (01/10/2026 · executor: Hermes)

**T19 — identidade da notificação e alerta de chamada encerrada.**

Dois defeitos reais, ambos produzindo o mesmo sintoma (alerta tocando para uma ligação que não existe
mais):

1. **Identidade era o `event_id`.** O provedor reenvia a MESMA chamada com `event_id` novo; como a
   chave de deduplicação era só o `event_id`, cada reenvio tocava um alerta novo. Agora a chave é o
   `call_id`, com `event_id` só como fallback de quem ainda emite sem ele.
2. **Nada perguntava se a chamada ainda existia.** Notificação entregue com atraso (fila/replay do
   provedor) tocava o alerta de uma ligação já encerrada. Agora o hook consulta `calls.status` pelo
   `call_id` e descarta a notificação quando a linha já terminou.

- A regra de "chamada acabada" virou `isFinishedStatus` em `src/lib/calls/callStatus.ts` — módulo puro,
  sem React e sem Supabase, que até aqui tinha zero consumidores reais.
- **Fail-open por decisão:** sem linha visível à RLS, `id` fora do formato uuid ou erro de consulta → o
  alerta **toca**. Perder ligação é pior que mostrar uma a mais.
- Sem `call_id` no metadata (notificação legada), **nada muda**: não consulta o banco e o comportamento
  antigo é preservado (pinado por teste).

```
npx tsc -b --force                              -> exit 0
bun run test:coverage                           -> 381 arquivos, 4978 testes passando | 38 todo -> exit 0
bun run test:contracts                          -> 797 testes passando -> exit 0
bun run build + bundle-budget.mjs               -> 340,4 KB de 341 KB -> exit 0
node scripts/ci/typecheck-ratchet.mjs           -> nenhum novo erro de tipo -> exit 0
node scripts/ci/lint-ratchet.mjs                -> nenhuma nova divida -> exit 0
node scripts/ci/implicit-any-ratchet.mjs        -> 0 (baseline 0) -> exit 0
```

**Mutação (vermelho antes):** chave de volta para `event_id` derruba 1 · sem o filtro de chamada
encerrada caem 6 · `isFinishedStatus` esquecendo `cancelled` derruba 2 · consultar sem a guarda de
`call_id` derruba 5 · invertendo o fail-open caem 3. Restaurado, suíte limpa.

## Fase 1-B — T20 (01/10/2026 · executor: Hermes)

**T20 — uma aba por linha.** Duas abas do app abertas tentavam registrar o mesmo ramal no SIP ao mesmo
tempo. Agora há eleição de aba líder por `BroadcastChannel('zapp-call-session')`: só a líder abre o
REGISTER, e a outra vira seguidora com o motivo **"Ligação em andamento em outra aba"** na tela.

- **Lock com TTL** (`localStorage`, `zapp.call.tab-leader`): a líder renova a cada 3 s com validade de 10 s;
  sem renovação, o lock caduca e a seguidora assume — é o que salva a linha quando a aba líder morre sem
  avisar.
- **Jitter de 120 ms + releitura do lock** na reivindicação: duas abas subindo juntas nunca elegem duas
  líderes.
- **Sem `BroadcastChannel`** (ou com ele lançando) o modo é aba única e a aba assume: o app nunca fica sem
  registro por falta de canal.
- **Portão no funil**: `useSipConnection.connect` recusa criar o UA quando a aba não é líder — é o único
  caminho de registro, então não há como furar por outro botão.
- **2ª chamada com a linha ocupada** deixou de ser muda: o `CallEngine` avisa o sink (`onBusyHere`), que
  persiste a nova chamada como `missed`/`busy_here` **com id próprio** e avisa o agente — a chamada em
  curso não é tocada (o `return` cedo do ramo ocupado continua).

### Dois buracos encontrados na validação (não na leitura do relatório)

Os quatro agentes entregaram tudo verde. Mesmo assim, medindo o workspace:

1. **`claimLeadership()` não era chamado por ninguém em produção** — só o próprio store e os mocks dos
   testes. Como o módulo nasce seguidora, o portão recém-criado faria o app **nunca registrar a linha**:
   telefonia inteira morta, com a suíte 100% verde. Corrigido no boot do painel (`VoIPPanel`), com teste.
2. **O TTL não salvava ninguém** — só havia promoção por `RELEASE` ou claim explícito, então a aba líder
   morrendo sem avisar deixava a linha sem registro em silêncio. O tick passou a decidir por papel: líder
   renova, seguidora **lê o TTL** e assume quando o lock caduca. TTL que ninguém consulta não é proteção,
   é enfeite. Teste: *"a aba líder morre sem avisar: a seguidora assume sozinha depois do TTL"*.

### Aceite do T09 preservado (não maquiado)

O plano (`:63`) exige `useSipClient.ts < 120 linhas`. Com o T20 o arquivo chegou a **151**. Voltou a
**98** extraindo o papel de aba (`useTabLeaderRole`) e a construção do sink do motor
(`useCallEngineSink`) — movimentação mecânica, mesmos deps, nenhum teste enfraquecido.

### Correções de premissa (com o código citado)

- **Não é 486.** Registro duplicado do mesmo ramal dá **403** — tratado desde o T15 em
  `useSipConnection.ts:118-126` como `line_in_use_other_user` ("Linha em uso por outro usuário"). O 486 é
  emitido **por nós** (`CallEngine.ts:126`) quando já estamos em chamada. A eleição evita o conflito de
  REGISTER (e o cenário pior: a 2ª aba "rouba" o registro e a 1ª continua achando que está registrada,
  perdendo chamada em silêncio) — não um 486.
- **`busyHereOutcome()` gravava o par errado.** Devolvia `endReason:'busy'` enquanto o comentário acima
  dele, a tabela `persistedStatusForEndReason` e o **título do próprio teste** diziam `busy_here`. O teste
  chegou a asserir o valor defeituoso: quem fosse consertar via vermelho e desistiria. Agora é o par
  canônico `(missed, busy_here)`, com asserção extra amarrando par e tabela.

```
npx tsc -b --force                        -> exit 0
bun run test:coverage                     -> 386 arquivos, 5118 testes passando | 38 todo -> exit 0
bun run test:contracts                    -> 30 arquivos, 681 testes passando -> exit 0
bun run build + bundle-budget.mjs         -> 337,3 KB de 341 KB -> exit 0
typecheck/lint/implicit-any ratchet       -> 0 novas -> exit 0
manifesto de deploy + workflow-pins       -> exit 0
```

### Mutação (verificada pelo executor, com restauração provada)

| Quebra aplicada | Teste que cai |
|---|---|
| remover `considerPromotion()` do tick | "a aba líder morre sem avisar: a seguidora assume sozinha depois do TTL" |
| remover `claimLeadership()` do boot do painel | "T20: reivindica a liderança da aba ao montar (a eleição começa)" |
| remover `sink.onBusyHere(...)` | "2º INVITE com a sessão ativa: recusa 486, avisa o sink e não toca a sessão em curso" |
| `busyHereOutcome()` de volta para `'busy'` | "a segunda chamada ocupada é registrada fora da máquina como missed/busy_here" |
| remover o portão do `connect` | "aba SEGUIDORA não registra" |

### Decisões do executor

- **Boot no `VoIPPanel`, não no `AppProviders`** — `AppProviders`/`App.tsx` são escopo do T22 (o plano
  manda chamar o Joaquim para essa etapa). O painel é onde a linha é registrada hoje.
- **A seguidora promove passando pelo `claimLeadership()`** (jitter + releitura), nunca assumindo direto:
  com 2+ seguidoras, assumir na hora criaria duas líderes.
- **`LEADER_TTL_MS`/`HEARTBEAT`/`JITTER` exportados** para o teste poder medir o TTL em vez de dormir 10 s.
- **Não foi tocado**: `AppProviders`, `App.tsx`, `CallDialog`/`IncomingCallAlert` (T21), RLS, banco.

## Fase 1-B — T21 (01/10/2026 · executor: Hermes)

**T21 — o diálogo de chamada para de escrever no banco e passa a consumir o provider.**

O `CallDialog` inseria uma linha em `calls` a cada abertura (`startCall` → `.from('calls').insert`) e
mantinha o mudo como estado local que não silenciava nada. Agora ele não escreve: quem registra é o motor,
pela RPC `upsert_my_call` (T11).

- **Diálogo**: `dial(contact.phone)` no lugar do insert; estado visual de `session.status`; cronômetro de
  `callDuration` (timer local removido); **Mudo real** (`isMuted` + `toggleMute()`); Encerrar → `hangup()`;
  Atender → `accept()`. Guarda de discagem única (`discouRef`).
- **Alto-falante removido**: o plano condiciona o botão a `setSinkId`, que **não existe em nenhum lugar de
  `src/`** — o botão era cosmético. Fica comentado no arquivo para voltar quando a função existir.
- **Alerta de chamada recebida**: Atender → `accept()`, Recusar → `reject()` (persiste `declined`), Ignorar
  segue só silenciando.
- **Timeout do toque vai para a máquina**: `RING_TIMEOUT_MS = 30_000` armado em `ringing_in`, com cleanup ao
  sair do estado e no unmount.

### Aceite do plano, verificado

1. **"Abrir o diálogo → 0 inserts"** — medido: o arquivo tem **zero** ocorrências de
   `useCalls`/`startCall`/`.insert(`/`.upsert(`. O teste espiona os quatro caminhos legados e o
   `supabase.from('calls').insert`: todos com zero chamadas, e ainda há um teste que lê o **fonte** para
   garantir que o arquivo não volta a falar com o banco.
2. **"Recusar → linha `declined`"** — a cadeia foi conferida elo por elo antes de eu aceitar o trabalho:
   `motivoNaoAtendida({endedBy:'reject'})` → `declined` (`persistence.ts:136-137`) ·
   `persistedStatusForEndReason('declined')` → `declined` (`session.ts:152-153`, tem caso próprio e **não**
   cai no `?? 'ended'`) · `calls_status_check` aceita `declined` · e o payload real da persistência já é
   asserido em `useSipClient.test.ts:627`.

### Decisões do executor

- **`TIMEOUT` da máquina persiste `missed`, não `timeout`** (`session.ts:149-151`). É o desfecho correto: uma
  chamada recebida que ninguém atendeu é perdida. Não mudei a máquina — ela já estava pronta e testada.
- **`whatsappConnectionId` mantida na interface como `@deprecated`** para não quebrar os dois chamadores
  (`ChatDialogs`, `ContactHeaderSection`) fora do escopo desta etapa.
- **"Ignorar" não é um botão separado** neste componente: é o `dismissCall` do próprio alerta, e continua sem
  escrever desfecho nenhum.
- **A máquina não foi tocada** (`session.ts` intacto): o T21 só liga quem faltava ligar.

```
npx tsc -b --force                        -> exit 0
bun run test:coverage                     -> 400 arquivos, 5233 testes -> exit 0
bun run test:contracts                    -> 33 arquivos, 733 testes -> exit 0
bun run build + bundle-budget.mjs         -> 336,3 KB de 341 KB -> exit 0
typecheck/lint/implicit-any ratchet       -> 0 novas -> exit 0
manifesto de deploy                       -> exit 0
```

### Prova por mutação (medida pelo executor, com restauração provada)

| Quebra aplicada | Teste que cai |
|---|---|
| remover `dial(contact.phone)` | "disca pelo provider e não toca em nenhum caminho de escrita da tabela `calls`" (+1) |
| remover `accept()` no Atender | "Atender chama accept() do provider e NÃO chama mais o legado answerCall" |
| remover `reject()` no Recusar | "Recusar chama reject() do provider e NÃO chama mais missCall" |
| remover `dispatch({type:'TIMEOUT'})` | "chamada ENTRADA que ninguém atende encerra sozinha pelo TIMEOUT da máquina" |

## Achados fora do escopo (NÃO corrigidos)

- **Split-brain de discagem ainda existe fora desta etapa**: `VoIPPanel.tsx:366-370` passa ao `DialPad` os
  métodos **crus** do `useSipClient` (`makeCall`, `hangUp`, `acceptIncomingCall`, `toggleMute`, `sendDTMF`),
  e `ActiveCallBar.tsx:51,61,72` faz o mesmo. Ou seja: discar pelo painel **não** passa pela máquina (não
  despacha `DIAL`, não cria sessão) enquanto discar pelo diálogo passa — as duas entradas divergem. O texto do
  T21 nomeia apenas `CallDialog` e `IncomingCallAlert`, então não toquei nesses arquivos; isso precisa de
  etapa própria (e é o que fecha a Fase 1 junto com o T22).
- **`setSinkId` continua inexistente**: o alto-falante volta a existir quando houver seleção de dispositivo
  de saída.


## Fase 1 — T22 (fechamento da fase · 01/10/2026 · executor: Hermes)

**Gates** (medidos no branch e conferidos pelo CI): `tsc -b --force` 0 · suíte completa verde · contratos
verdes · bundle dentro do budget · ratchets de lint/typecheck/implicit-any com **0 novas**.

**A tabela do aceite, obtida dos testes** — 8 linhas, uma por `PersistedStatus`, cada uma com o teste que a
prova, todas ponta a ponta no caminho do motor SIP (evento SIP → gravação na RPC `upsert_my_call`):



**Tabela do aceite — cenário → status/end_reason (8 linhas, uma por `PersistedStatus`), cada uma com o teste que a prova.** Todas ponta a ponta no caminho do motor SIP (evento SIP → gravação na RPC `upsert_my_call`), sem misturar com o produtor do WhatsApp:

| # | cenário (o que aconteceu na chamada) | status | end_reason | teste que prova |
|---|---|---|---|---|
| 1 | em curso antes de atender: saída discada ou entrada recebida | `ringing` | — (não grava motivo) | `useSipClient.test.ts:380` (saída) e `:560` (entrada) |
| 2 | atendida (`ESTABLISHED`) | `answered` | — (`answered_at` preenchido) | `useSipClient.test.ts:404` |
| 3 | atendida e encerrada (local ou remoto) **ou** saída encerrada sem atendimento | `ended` | `hangup_local` / `hangup_remote` / `no_answer` | `useSipClient.test.ts:692`, `:706` e `:426` |
| 4 | entrada que ninguém atendeu (watchdog) **ou** 2ª chamada com a linha ocupada | `missed` | `timeout` / `busy_here` | `useSipClient.test.ts:743` e `:924` |
| 5 | saída cujo INVITE recebe resposta final **486** | `busy` | `busy` | `useSipClient.test.ts:958` **(novo neste fecho)** |
| 6 | falha ao discar (o `invite` rejeita) | `failed` | `failed` | `useSipClient.test.ts:980` **(novo neste fecho)** |
| 7 | desligada/cancelada antes de atender | `cancelled` | `cancelled` | `useSipClient.test.ts:719` |
| 8 | recusada na entrada | `declined` | `declined` | `useSipClient.test.ts:609` |

**Por que duas linhas nasceram aqui:** na auditoria do fecho, `busy` e `failed` só tinham as *metades* testadas no motor SIP (o `CallEngine` entregando o `outcome` e o `persistence.ts` mapeando o `outcome` → status, em testes separados); a prova ponta a ponta existia **apenas** pelo canal WhatsApp, que é outro produtor. As duas linhas foram fechadas com teste que parte do evento SIP e chega até o `p_status` gravado, com mutação provando que ele morde.


### Duas descobertas na auditoria do fecho

1. **O "toca `AppProviders`" não era ordem de mudança.** A eleição de aba já sobe globalmente:
   `AppProviders:79` monta o `CallSessionProvider`, que chama `useSipClient:86` → `useTabLeaderRole` →
   `tabLeaderStore:296` (`subscribe`/`startTick`) → `considerPromotion()`. A aba vira líder sozinha em até
   ~3,1 s após o boot, **sem o painel de Telefonia nunca ter sido aberto**; o `claimLeadership()` no
   `VoIPPanel` só antecipa isso para ~120 ms. Nada precisou mudar no `AppProviders` e o achado que eu havia
   aberto no T20 fica **resolvido** — não virou um "achado eterno".
2. **A Fase 1 não tinha as 8 linhas comprovadas: tinha 6.** `busy` e `failed` só tinham as *metades* testadas
   no motor SIP (o `CallEngine` entregando o `outcome`; o `persistence.ts` mapeando o `outcome` → status, em
   testes separados) — a prova ponta a ponta existia **apenas** pelo canal WhatsApp, que é outro produtor.
   Um aceite "8 linhas obtidas dos testes" só se sustentaria misturando os dois produtores. **Os dois testes
   que faltavam foram escritos neste fecho** (`useSipClient.test.ts:958` e `:980`), com mutação provando que
   mordem.

### Risco conhecido, não resolvido aqui

**Nenhum teste unitário renderiza `AppProviders`/`App`** (verificado por busca): a rede que pegaria uma
regressão nesses dois arquivos é o **E2E**, e não existe spec de VoIP/aba-líder. Fica registrado como risco
da fase, não como surpresa futura.
