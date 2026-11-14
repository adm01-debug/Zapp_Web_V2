# Prontidão para produção — Zapp Web V2

> Relatório vivo do objetivo "sistema pronto para produção". Cada item é **OK** (com a prova ao lado) ou **BLOQUEADO** (com o erro exato e o que falta). Inventário levantado do código da `main` em `81f67b0db` (2026-11-12) e do banco/infra de produção ao vivo, só leitura. As seções por categoria trazem as provas reproduzíveis.

## 1. Linha de base (antes de mexer) — `main` @ `81f67b0db`

| verificação | resultado |
|---|---|
| `npx vite build` | exit 0 (14 s) |
| `npx tsc -b --force` | exit 0 |
| `node scripts/ci/lint-ratchet.mjs` | exit 0 — baseline 803, atual 802, novas 0 |
| `npx vitest run` | exit 0 — 1864 arquivos passaram, 5 pulados; **15870 testes passaram**, 19 falhas esperadas, 41 todo |
| `npx vitest run --config vitest.contracts.config.ts` | **exit 1 — 4 falhas** em 3 arquivos (suíte fora do CI) → corrigidas nas PRs #3000, #3001, #3002 |
| `node --test scripts/ci/*.unit.mjs` | exit 0 — 7119 pass, 0 fail, 2 skipped |
| Workflows na `main` | vermelhos/sem verde: `e2e-logado` (grupo authenticated-2-of-3), `e2e-logado-isolado` (dispatch), `db-migrate` (cancelado), `crm-sync-worker` (skipped), `db-live-guard` (agendamento parado), `contexto` (runs cancelados por fila) |

## 2. Resumo do inventário

| categoria | itens | OK | BLOQUEADO |
|---|---|---|---|
| Telas e rotas | 85 | 82 | 3 |
| Edge functions | 94 | 80 | 14 |
| Banco (RLS, advisors, migrations) | 9 | 7 | 2 |
| GitHub Actions | 29 | 25 | 4 |
| Integrações externas | 15 | 8 | 7 |
| Produção ao vivo | 12 | 10 | 2 |
| "Sem pela metade" | 26 | 15 | 11 |
| Extras (storage, realtime, auth, vault, Vercel, GitHub) | 29 | 18 | 11 |

Auditoria independente: 24 provas reexecutadas por amostragem, 21 reproduziram e 2 ficaram desatualizadas pela `main` ter andado (rebaixadas e reconferidas).

## 3. Correções (PR + evidência)

| PR | o que corrige | estado |
|---|---|---|
| [#2987](https://github.com/adm01-debug/Zapp_Web_V2/pull/2987) | harness E2E isolado: 8ª rotina (`mark_outbound_post_started`) com dono `postgres` — suíte logada voltou a rodar (grupos 1 e 3 verdes no run 43210181927) | mergeada (87c5e97) |
| [#2988](https://github.com/adm01-debug/Zapp_Web_V2/pull/2988) | front compatível com o types-sync da migration 20261111160000 (types-sync verde: run 43204745973) | mergeada (0a1e73f), no ar |
| [#2991](https://github.com/adm01-debug/Zapp_Web_V2/pull/2991) | teste de navegação sem retry: 3×22 min estouravam os 55 min do controller e o erro real sumia | mergeada (cfa8959) |
| [#3000](https://github.com/adm01-debug/Zapp_Web_V2/pull/3000) | contrato cobre os 7 schemas RADAR AI | mergeada (8e6f413) |
| [#3001](https://github.com/adm01-debug/Zapp_Web_V2/pull/3001) | 7 edges RADAR sem o regex de backtracking (parseJsonObject) | mergeada (eb93d55) |
| [#3002](https://github.com/adm01-debug/Zapp_Web_V2/pull/3002) | badge do RADAR com contraste AA | mergeada (fb5d023) |
| [#3003](https://github.com/adm01-debug/Zapp_Web_V2/pull/3003) | chat de equipe: não-membro não vê botões inertes | mergeada (2bfcdbd) |
| [#3004](https://github.com/adm01-debug/Zapp_Web_V2/pull/3004) | "Encaminhar" arquivo funcionando nas 3 vistas | mergeada (51bd8cb) |
| [#3005](https://github.com/adm01-debug/Zapp_Web_V2/pull/3005) | "Copiado" só no sucesso | mergeada (546c6f5) |
| [#3006](https://github.com/adm01-debug/Zapp_Web_V2/pull/3006) | "Copiar e-mail" com retorno | mergeada (fe4959b) |
| [#3007](https://github.com/adm01-debug/Zapp_Web_V2/pull/3007) | testes de NotFound, VerifyEmail e MetaCAPI | mergeada (7c3ef80) |
| [#3009](https://github.com/adm01-debug/Zapp_Web_V2/pull/3009) | relatório da campanha Talk X ligado (campanha concluída) | entregue no pacote [#3035](https://github.com/adm01-debug/Zapp_Web_V2/pull/3035) (cb6576b) |
| [#3010](https://github.com/adm01-debug/Zapp_Web_V2/pull/3010) | contexto: `/auth` e `/2fa` deixam de sair como protegidas | mergeada (7bdbe2e) |
| [#3012](https://github.com/adm01-debug/Zapp_Web_V2/pull/3012) | testes das 12 edges sem cobertura | entregue no pacote [#3035](https://github.com/adm01-debug/Zapp_Web_V2/pull/3035) (cb6576b) |
| [#3015](https://github.com/adm01-debug/Zapp_Web_V2/pull/3015) | "Reenviar e-mail" da verificação sem e-mail vazio | mergeada (af1bc25) |
| [#3035](https://github.com/adm01-debug/Zapp_Web_V2/pull/3035) | pacote de 20 PRs aprovadas num único merge (inclui #3009, #3012, #3025, #3026, #2932, #3031) | mergeada (cb6576b), front e edges no ar em 13/11 16:27 |
| [#3046](https://github.com/adm01-debug/Zapp_Web_V2/pull/3046) | pacote 2: #3038, #3039, #2996, #3013, #3014, #3042, #3044 num único ciclo de CI. Antes do merge: vitest 16176 passed (main 16149, nenhum removido), contratos 1461/1461, deno 2448 passed, ci-unit 7190 pass, tsc/build/lint-ratchet 0. CI Gate, Build e TypeCheck verdes no head `69eb669` | mergeada (f32855d) em 14/11 00:12; Vercel Production `success` (deploy 7779585529); Deploy Edge Functions run 43532560007 `success` (00:28, inclui message-delivery e evolution-webhook). Workflows do commit f32855d: CI/CD Pipeline 43532560008 `success`, types-sync 43532560028 `success`, DB Guard, Front release targets e Talk X placar `success` |
| [#3042](https://github.com/adm01-debug/Zapp_Web_V2/pull/3042) (no #3046) | tela de login sem 401: `whatsapp_connections` e `get-sip-password` não são chamados sem usuário; linha SIP derrubada no logout/troca de usuário/unmount | no ar: Playwright em `zapp-web-v2.vercel.app/auth`, 2 execuções de 20 s, bundle `index-BFcZjmP_.js` → 0 requisições ao Supabase, 0 erros de console (antes: 2×401) |
| [#3044](https://github.com/adm01-debug/Zapp_Web_V2/pull/3044) (no #3046) | Gmail com conta a reconectar não dispara sync de marcadores nem repete 409 | no ar (f32855d); efeito em tela depende de login (conta em `reauth_required`) |
| [#3038](https://github.com/adm01-debug/Zapp_Web_V2/pull/3038) / [#3039](https://github.com/adm01-debug/Zapp_Web_V2/pull/3039) (no #3046) | link `?cid=` do Team Chat espera o perfil; `ci-local` lê workflows do HEAD e espelha o db-guard | no ar (f32855d) |
| [#3041](https://github.com/adm01-debug/Zapp_Web_V2/pull/3041) | "Conectar" do WhatsApp sem 500 | fechada: substituída por [#3045](https://github.com/adm01-debug/Zapp_Web_V2/pull/3045) (098a648, outro agente, escopo maior) |
| Migrations do pacote 2 aplicadas em produção (aprovadas pelo dono) | `20261112170000` (resolução manual só em `sending`, recusa desfecho NULL), `20261112171000` (filtro "Cancelado" do Talk X), `20261112172000` (autor real do motivo, rótulo único, índice da FK). Cada uma: DDL + INSERT no ledger num único `db_query`, depois do deploy das edges. Prova: ledger 1109 → 1112; md5 dos `statements` = md5 do dry-run do `register-migration.mjs` (`252645…`, `2eb42c…`, `535134…`); corpo da 171 sem `'cancelled'` = md5 de produção anterior `98e2fafa…`; ACL e `SECURITY DEFINER` iguais; no ar `p_status='cancelled'` → OK (`total=0`), `'bogus'` → 22023 | aplicadas em 14/11 ~00:36 UTC; depois do deploy (00:12→00:40): `cron` 199 execuções / 0 falhas, `pg_net` 102 respostas / 0 ≥400, `webhook_failures` 0 |
| Migrations aplicadas em produção (aprovadas pelo dono) | 20261107180000, 20261108100000, 20261108204000, 20261111160000, 20261111170000 — ledger e objetos idênticos aos arquivos (validação rodada 1) | aplicadas |

Cada PR acima tem teste que falha antes e passa depois, e revisão independente APROVA (registrada no corpo da PR).

## 4. PRs aguardando decisão do dono

| PR | por quê |
|---|---|
| [#3037](https://github.com/adm01-debug/Zapp_Web_V2/pull/3037) (outro agente, aberta) | as migrations `20261113130000`, `20261113130100` e `20261113130300` já estão no ledger de produção sem estarem na `main` (DDL aplicado antes do merge). Pedido de merge ou revert comentado na PR. Fora isso, as 1106 versões da `main` (antes do pacote 2) batem com o ledger: md5 `fe48c414a16cf44745ec812848c941cd` dos dois lados |
| [#3045](https://github.com/adm01-debug/Zapp_Web_V2/pull/3045) (outro agente, mergeada) | a migration `20261113150000_audit_logs_trilha_conexao_rapida` está na `main` e **não** está no ledger (consulta de 13/11 22:44). Apply é do dono/agente autor |
| [#3057](https://github.com/adm01-debug/Zapp_Web_V2/pull/3057) (outro agente, aberta) | DDL: revoga MAINTAIN de anon/authenticated nas relações de `public` (item "anon com MAINTAIN" da seção 5) |
| Proposta — tela de Telefonia para o admin | hoje `get-sip-password` lê só `SIP_*` globais das edges e ignora as credenciais por usuário de `voip_profile_credentials` (gravadas pelo admin em `VoipRamalField`). Mudança de arquitetura: aguarda o dono |

## 5. BLOQUEADO — depende do dono

| item | erro exato | o que falta |
|---|---|---|
| WhatsApp "Promo Brindes" (instância PRINCIPAL) | `status=disconnected`, "Reconexão automática esgotada — gere um novo QR Code" | ler o QR na tela Conexões com o celular |
| Gmail | `sync_status=reauth_required`, `invalid_grant`; `GMAIL_OIDC_AUDIENCE/EMAIL` ausentes | reconectar a conta; criar os secrets |
| Telefonia SIP | `SIP_PASSWORD` ausente → 503 `SIP_NOT_CONFIGURED` | secret |
| Bitrix (reconciliação de chamadas) | `BITRIX_WEBHOOK_URL` ausente | secret |
| Talk X rastreio de clique | `TALKX_CONVERT_SECRET`/`TALKX_LINK_BASE_URL` ausentes → 503 | secrets antes do 1º disparo |
| IA (LLM e voz) | OpenRouter/DeepSeek HTTP 402/401; ElevenLabs 401; `ELEVENLABS_AGENT_ID` ausente | créditos/chaves |
| CRM outbox | 474 pendentes, segredos do Vault ausentes | decisão W93 + segredos |
| `sicoob-bridge`, `sicoob-bridge-reply` | em produção sem código no repo | trazer fonte ou apagar |
| Workflows `db-migrate`, `crm-sync-worker`, agendamento do `db-live-guard`, dispatch `e2e-logado-isolado` (network-proof-contexts) | aprovação de ambiente / cron comentado / cron sem disparo desde 19/10 / Chromium sem rota padrão no runner | decisão no próprio workflow (regra: não mexer em CI) |
| Auth | `site_url` em host protegido pela Vercel (convite quebra); SMTP padrão (2 e-mails/h); cadastro aberto, senha mín. 6 | configuração |
| Produto | follow-up sem motor; Meta CAPI em demonstração; placeholders "em breve"; tela "API Pública" inalcançável; seletor de idioma sem tradução; 247 arquivos sem uso | decisão de produto |
| Abas "Audiências"/"Modelos" do Talk X | botões sem ação (`TalkXSegments.tsx:390-391`) | arquivo em PR aberta de outro agente (#2932); correção desenhada |
| Telefonia SIP — porta WSS do FaleFácil | o navegador precisa de `wss://{servidor}:{porta}/ws`; a conta informada usa `transport=tcp` | o dono confirma com o FaleFácil a porta WSS e grava `SIP_*` como secret das edges; a senha exposta no chat deve ser trocada |
| Aviso de entrega ambígua em conversas de grupo | `ChatPanel.tsx:500` monta `UnconfirmedMessagesPanel` só com `contactId`; as 3 montagens do `ChatPanel` são por contato (achado do Devin na #3046, verificado) | o inbox ainda não abre conversa de grupo; ligar o `groupId` faz parte dessa entrega |
| E2E isolado — escopo `network-proof-contexts` | run 42827413676: `contexts-proof-failed` (Chromium e WebKit com `native.online=false` em topologia `loopback-only`) | é uma medição, não a suíte; "corrigir" o critério afrouxaria a prova. A suíte completa (`scope=full-suite`) é o teste que vale para login e telas Suíte completa verde em 14/11 (run 43540540725 attempt 2). |
| Banco (dono) | 157 mensagens legadas presas em `sending`; anon com MAINTAIN em 104 relações; resolução manual sem autor registrado | saneamento/DDL |


---

## Telas/rotas do front — inventário com prova

Base: worktree limpo `main` @ `81f67b0db` (só leitura). Produção Vercel confirmada no mesmo commit: API `/v6/deployments?target=production` → `dpl_DnngsBgz7em3qwXDjXnmwRh2JfbF READY 81f67b0db` (2026-11-12 13:07 UTC).
Fontes: `origin/contexto:docs/contexto/codigo/rotas.json` (18 urls, 55 vistas, 61 itens de menu), `src/routes/AppRoutes.tsx` (rotas URL), `src/pages/ViewRouter.tsx` + `src/pages/lazyViews.ts` (vistas `?view=`), `src/services/navigation.service.ts` (menu).

**Execução de testes (rodado aqui):** `npx vitest run <75 arquivos>` → `numTotalTests 643, numPassedTests 643, numFailedTests 0, success true` (235 suítes). Relatório: `vitest-rotas.json`.
**E2E:** não executado aqui (exige conjunto local isolado). Status citado do CI real.
**Produção:** toda URL responde 200 com o mesmo shell SPA (inclusive rota inexistente `/rota-inexistente-xyz` → 200), então o curl prova só que o shell serve. Prova complementar: as 18 `` path:`...` `` estão no bundle de produção `/assets/index-CFJIkylk.js` (grep: 1 ocorrência cada, incl. `` path:`*` `` e `` to:`/?view=multiplix` ``) e os 18 chunks lazy das páginas respondem 200 (ex.: `VerifyEmail-B14Pl-xr.js 200 4201B`, `NotFound-CDX-btqg.js 200 2185B`).

### Resumo
- Total de itens: 85 (18 rotas URL + 55 vistas `?view=` + 8 itens de menu internos do Gmail + 4 conferências globais)
- OK: 82 · BLOQUEADO: 3 (em 14/11 as conferências "Produção = HEAD", "E2E Y09" e "`rotas.json` protegida" passaram a OK)

### Rotas URL (`src/routes/AppRoutes.tsx`)

| item | status | prova |
|---|---|---|
| `/` → Index (ProtectedRoute) | OK | Registro AppRoutes.tsx:94, import :10 → src/pages/Index.tsx:198 (export default). Unit: src/pages/__tests__/Index.keyboard-dashboard-view.test.tsx:146 (5/5 passou). E2E: 78 `goto('/')` em e2e/. curl prod 200 (SPA, shell `index-CFJIkylk.js`). |
| `/*` → NotFound | BLOQUEADO | Registro AppRoutes.tsx:159, import :12 → src/pages/NotFound.tsx:81; chunk prod `NotFound-CDX-btqg.js` 200. **Sem teste que monte a tela real**: único uso é `vi.mock('../../../pages/NotFound')` em src/components/errors/__tests__/AppRoutes.errorBoundary.test.tsx:59; nenhum spec E2E abre rota inexistente. |
| `/2fa` → TwoFactorAuth | OK | Registro AppRoutes.tsx:100, import :17 → src/pages/TwoFactorAuth.tsx:14. Unit: src/pages/__tests__/twoFactorAuth.retrySaida.test.tsx:46 (3/3 passou). curl prod 200 (SPA, shell `index-CFJIkylk.js`); path no bundle. |
| `/access-denied` → AccessDenied | OK | Registro AppRoutes.tsx:93, import :25 → src/pages/AccessDenied.tsx:17. Unit: src/pages/__tests__/AccessDenied.test.tsx:30 (7/7 passou). curl prod 200 (SPA, shell `index-CFJIkylk.js`); chunk `AccessDenied-Bw9GJ9VL.js` 200. |
| `/admin/rate-limit` → RateLimitDashboard (admin) | OK | Registro AppRoutes.tsx:150-157, import :23 → src/pages/admin/RateLimitDashboard.tsx:40. Unit: src/pages/admin/__tests__/RateLimitDashboard.logs.test.tsx:86 (12/12 passou). Prod: chunk 200. |
| `/admin/roles` → RolesPage (admin) | OK | Registro AppRoutes.tsx:142-149, import :22 → src/pages/admin/RolesPage.tsx:22. Unit: src/pages/admin/__tests__/RolesPage.loadError.test.tsx:54 (2/2 passou). Prod: curl 200, chunk 200. |
| `/auth` → Auth | OK | Registro AppRoutes.tsx:95, import :11 → src/pages/Auth.tsx:16. Unit: src/pages/__tests__/Auth.coluna-v3.test.tsx:55 (7/7 passou). E2E: e2e/auth.spec.ts:4 (projetos chromium/firefox-auth/webkit-auth, playwright.config.ts:64,266,273). curl prod 200 (SPA, shell `index-CFJIkylk.js`). |
| `/auth/callback` → SSOCallback | OK | Registro AppRoutes.tsx:99, import :16 → src/pages/SSOCallback.tsx:30. Unit: src/pages/__tests__/SSOCallback.erro-sanitizado.test.tsx:33 (3/3 passou). curl prod 200 (SPA, shell `index-CFJIkylk.js`); chunk 200. |
| `/chat-popup/:contactId` → ChatPopup | OK | Registro AppRoutes.tsx:102-109, import :26 → src/pages/ChatPopup.tsx:74. Unit: src/pages/__tests__/ChatPopup.a11y.test.tsx:60 (5/5 passou). Prod: chunk 200. |
| `/forgot-password` → ForgotPassword | OK | Registro AppRoutes.tsx:96, import :13 → src/pages/ForgotPassword.tsx:17. Unit: src/pages/__tests__/ForgotPassword.test.tsx:51 (6/6 passou). curl prod 200 (SPA, shell `index-CFJIkylk.js`); chunk 200. |
| `/install` → Install | OK | Registro AppRoutes.tsx:101, import :24 → src/pages/Install.tsx:158. Unit: src/pages/__tests__/Install.limpeza-listeners.test.tsx:18 (2/2 passou). curl prod 200 (SPA, shell `index-CFJIkylk.js`). |
| `/multiplix` → Navigate `/?view=multiplix` | OK | Registro AppRoutes.tsx:158. Unit: src/routes/__tests__/AppRoutes.multiplixCurta.test.tsx:41 (2/2 passou). curl prod 200 (SPA, shell `index-CFJIkylk.js`); `` to:`/?view=multiplix` `` no bundle. |
| `/queue/:id` → QueueDetails | OK | Registro AppRoutes.tsx:110-117, import :18 → src/pages/QueueDetails.tsx:22. Unit: src/pages/queue-details/__tests__/QueueDetails.erro.test.tsx:83 (3/3 passou). Prod: chunk 200. |
| `/queues/comparison` → QueuesComparison | OK | Registro AppRoutes.tsx:118-125, import :19 → src/pages/QueuesComparison.tsx:9. Unit: src/pages/__tests__/QueuesComparisonSLA.landmarks.test.tsx:74/89 (2/2 passou). Prod: curl 200, chunk 200. |
| `/reset-password` → ResetPassword | OK | Registro AppRoutes.tsx:97, import :14 → src/pages/ResetPassword.tsx:27. Unit: src/pages/__tests__/ResetPassword.acessivel.test.tsx:65 (5/5 passou). curl prod 200 (SPA, shell `index-CFJIkylk.js`); chunk 200. |
| `/sla` → SLADashboard (página) | OK | Registro AppRoutes.tsx:126-133, import :20 → src/pages/SLADashboard.tsx:30. Unit: src/pages/__tests__/SLADashboard.sidebar-navegacao.test.tsx:67/85/112 (4/4 passou). Prod: curl 200, chunk 200. |
| `/sla/history` → SLAHistory | OK | Registro AppRoutes.tsx:134-141, import :21 → src/pages/SLAHistory.tsx:36. Unit: src/pages/__tests__/SLADashboard.sidebar-navegacao.test.tsx:133 e QueuesComparisonSLA.landmarks.test.tsx:98 (passou). Prod: chunk 200. |
| `/verify-email` → VerifyEmail | BLOQUEADO | Registro AppRoutes.tsx:98, import :15 → src/pages/VerifyEmail.tsx:12; curl prod 200 (SPA, shell `index-CFJIkylk.js`); chunk `VerifyEmail-B14Pl-xr.js` 200. **Nenhum teste**: `grep -rln "verify-email\|VerifyEmail"` em src/**/*.test.* e e2e/ = 0 arquivos. |

### Vistas `?view=` (ViewRouter.tsx VIEW_MAP:46-102 + SPECIAL_VIEWS:105-111; acesso por `NavigationService.canAccess`, navigation.service.ts:195-206)

Todas as 54 entradas de `lazyViews.ts` resolvem para arquivo existente com o export importado (script de conferência: 0 MISSING/0 NOEXPORT; `AchievementsSystem` exporta em AchievementsSystem.tsx:26).

| item | status | prova |
|---|---|---|
| view `inbox` | OK | Registro: navigation.service.ts:56 'Chat' · ViewRouter.tsx:47 · lazyViews.ts:5 → src/components/inbox/RealtimeInboxView.tsx:140. E2E: e2e/navegacao-modulos.spec.ts:97. Unit: src/components/inbox/__tests__/RealtimeInboxView.atalhos-teclado.test.tsx:90 (5/5 passou). |
| view `dashboard` | OK | Registro: navigation.service.ts:65 'Dashboard' · ViewRouter.tsx:48 · lazyViews.ts:6 → src/components/dashboard/DashboardView.tsx:93. E2E: e2e/navegacao-modulos.spec.ts:107. Unit: src/components/dashboard/__tests__/DashboardView.test.tsx:76 (8/8 passou). |
| view `agents` | OK | Registro: navigation.service.ts:122 'Equipe' · ViewRouter.tsx:49 · lazyViews.ts:8 → src/components/agents/AgentsView.tsx:35. E2E: e2e/navegacao-modulos.spec.ts:157. Unit: src/components/agents/__tests__/AgentsView.actions.test.tsx:72 (5/5 passou). |
| view `queues` | OK | Registro: navigation.service.ts:77 'Filas' · ViewRouter.tsx:50 · lazyViews.ts:9 → src/components/queues/QueuesView.tsx:47. E2E: e2e/navegacao-modulos.spec.ts:116. Unit: src/components/queues/__tests__/QueuesView.test.tsx:114 (2/2 passou). |
| view `contacts` | OK | Registro: navigation.service.ts:59 'Contatos' · ViewRouter.tsx:51 · lazyViews.ts:10 → src/components/contacts/ContactsView.tsx:23. E2E: e2e/navegacao-modulos.spec.ts:100. Unit: src/hooks/contacts/__tests__/ContactsView.v2Flags.test.tsx:266 (7/7 passou). |
| view `groups` | OK | Registro: navigation.service.ts:79 'Grupos' · ViewRouter.tsx:52 · lazyViews.ts:17 → src/components/groups/GroupsView.tsx:31. E2E: e2e/navegacao-modulos.spec.ts:118. Unit: src/components/groups/__tests__/GroupsView.test.tsx:86 (17/17 passou). |
| view `connections` | OK | Registro: navigation.service.ts:111 'Conexões' · ViewRouter.tsx:53 · lazyViews.ts:11 → src/components/connections/ConnectionsView.tsx:32. E2E: e2e/navegacao-modulos.spec.ts:147. Unit: src/components/connections/__tests__/ConnectionsView.desconectar.test.tsx:107 (7/7 passou). |
| view `wallet` | OK | Registro: navigation.service.ts:76 'Carteira' · ViewRouter.tsx:54 · lazyViews.ts:13 → src/components/wallet/ClientWalletView.tsx:19. E2E: e2e/navegacao-modulos.spec.ts:115. Unit: src/components/wallet/__tests__/ClientWalletView.test.tsx:38 (9/9 passou). |
| view `catalog` | OK | Registro: navigation.service.ts:61 'Catálogo' · ViewRouter.tsx:55 · lazyViews.ts:16 → src/components/catalog/ExternalProductManagement.tsx:265. E2E: e2e/navegacao-modulos.spec.ts:102. Unit: src/components/catalog/__tests__/ExternalProductManagement.test.tsx:84 (36/36 passou). |
| view `transcriptions` | OK | Registro: navigation.service.ts:156 'Transcrições' · ViewRouter.tsx:56 · lazyViews.ts:18 → src/components/transcriptions/TranscriptionsHistoryView.tsx:24. E2E: —. Unit: src/components/transcriptions/__tests__/TranscriptionsHistoryView.paginacao.test.tsx:90 (2/2 passou). |
| view `admin` | OK | Registro: navigation.service.ts:130 'Admin' · ViewRouter.tsx:57 · lazyViews.ts:14 → src/components/admin/AdminView.tsx:61. E2E: e2e/navegacao-modulos.spec.ts:161 (somenteAdmin: só ausência); e2e/a11y-config-admin.spec.ts:160. Unit: src/components/admin/__tests__/AdminView.a11y.test.tsx:65 (11/11 passou). |
| view `supervisao` | OK | Registro: navigation.service.ts:129 'Supervisão' · ViewRouter.tsx:58 · lazyViews.ts:15 → src/components/admin/SupervisaoView.tsx:25. E2E: e2e/navegacao-modulos.spec.ts:160. Unit: src/components/admin/__tests__/SupervisaoView.test.tsx:50 (5/5 passou). |
| view `sentiment` | OK | Registro: navigation.service.ts:102 'Sentimento' · ViewRouter.tsx:59 · lazyViews.ts:7 → src/components/dashboard/SentimentAlertsDashboard.tsx:11. E2E: e2e/navegacao-modulos.spec.ts:139. Unit: src/components/dashboard/__tests__/SentimentAlertsDashboard.a11y.test.tsx:53 (6/6 passou). |
| view `reports` | OK | Registro: navigation.service.ts:100 'Relatórios' · ViewRouter.tsx:60 · lazyViews.ts:19 → src/components/reports/AdvancedReportsView.tsx:36. E2E: e2e/navegacao-modulos.spec.ts:137. Unit: src/components/reports/__tests__/AdvancedReportsView.periodComparison.test.tsx:156 (5/5 passou). |
| view `security` | OK | Registro: navigation.service.ts:123 'Segurança' · ViewRouter.tsx:61 · lazyViews.ts:20 → src/components/security/SecurityView.tsx:26. E2E: e2e/navegacao-modulos.spec.ts:158. Unit: src/components/security/__tests__/SecurityView.supervisor.test.tsx:40 (3/3 passou). |
| view `settings` | OK | Registro: navigation.service.ts:136 'Configurações' · ViewRouter.tsx:62 · lazyViews.ts:12 → src/components/settings/SettingsView.tsx:73. E2E: e2e/navegacao-modulos.spec.ts:165. Unit: src/components/settings/__tests__/SettingsView.test.tsx:80 (11/11 passou). |
| view `docs` | OK | Registro: navigation.service.ts:135 'Documentação' · ViewRouter.tsx:63 · lazyViews.ts:22 → src/components/docs/SystemFeaturesView.tsx:10. E2E: e2e/navegacao-modulos.spec.ts:164. Unit: src/components/docs/__tests__/SystemFeaturesView.test.tsx:23 (4/4 passou). |
| view `chatbot` | OK | Registro: navigation.service.ts:87 'Chatbot' · ViewRouter.tsx:64 · lazyViews.ts:23 → src/components/chatbot/ChatbotFlowsView.tsx:42. E2E: e2e/navegacao-modulos.spec.ts:125. Unit: src/components/chatbot/__tests__/ChatbotFlowsView.a11y.test.tsx:91 (6/6 passou). |
| view `automations` | OK | Registro: navigation.service.ts:88 'Automações' · ViewRouter.tsx:65 · lazyViews.ts:24 → src/components/automations/AutomationsManager.tsx:15. E2E: e2e/navegacao-modulos.spec.ts:126. Unit: src/components/automations/__tests__/AutomationsManager.confirmacaoExclusao.test.tsx:46 (2/2 passou). |
| view `integrations` | OK | Registro: navigation.service.ts:112 'Integrações' · ViewRouter.tsx:66 · lazyViews.ts:25 → src/components/integrations/IntegrationsHub.tsx:46. E2E: e2e/navegacao-modulos.spec.ts:148. Unit: src/components/integrations/__tests__/N8nIntegrationView.test.tsx:58 (3/3 passou). |
| view `privacy` | OK | Registro: navigation.service.ts:124 'LGPD' · ViewRouter.tsx:67 · lazyViews.ts:26 → src/components/compliance/LGPDComplianceView.tsx:14. E2E: e2e/navegacao-modulos.spec.ts:159. Unit: src/components/compliance/__tests__/LGPDComplianceView.test.tsx:43 (3/3 passou). |
| view `tasks` | OK | Registro: navigation.service.ts:63 'Tarefas' · ViewRouter.tsx:68 · lazyViews.ts:21 → src/components/tasks/TasksModule.tsx:54. E2E: e2e/navegacao-modulos.spec.ts:104. Unit: src/components/tasks/__tests__/TasksModule.test.tsx:32 (42/42 passou). |
| view `knowledge` | OK | Registro: navigation.service.ts:90 'Base de Conhecimento' · ViewRouter.tsx:69 · lazyViews.ts:27 → src/components/knowledge/KnowledgeBaseView.tsx:30. E2E: e2e/navegacao-modulos.spec.ts:128. Unit: src/components/knowledge/__tests__/KnowledgeBaseView.erro.test.tsx:40 (3/3 passou). |
| view `wa-flows` | OK | Registro: navigation.service.ts:89 'WhatsApp Flows' · ViewRouter.tsx:70 · lazyViews.ts:28 → src/components/whatsapp-flows/WhatsAppFlowsBuilder.tsx:57. E2E: e2e/navegacao-modulos.spec.ts:127. Unit: src/components/whatsapp-flows/__tests__/WhatsAppFlowsBuilder.salvar.test.tsx:70 (4/4 passou). |
| view `meta-capi` | BLOQUEADO | Registro: navigation.service.ts:146 'Meta CAPI' · ViewRouter.tsx:71 · lazyViews.ts:29 → src/components/meta-capi/MetaCAPIView.tsx:23. E2E: e2e/navegacao-modulos.spec.ts:171. Unit: NENHUM. **Sem teste unit** que monte `MetaCAPIView` (grep em src/**/*.test.* = 0). Única cobertura é e2e/navegacao-modulos.spec.ts:171, cujo teste :1329 FALHOU 3x na última suíte logada concluída da main (run 43216785856, job 131186396197). |
| view `diagnostics` | OK | Registro: navigation.service.ts:157 'Diagnóstico' · ViewRouter.tsx:72 · lazyViews.ts:30 → src/components/diagnostics/DiagnosticsView.tsx:91. E2E: —. Unit: src/components/diagnostics/__tests__/DiagnosticsView.health.test.tsx:97 (7/7 passou). |
| view `voip` | OK | Registro: navigation.service.ts:62 'Telefonia' · ViewRouter.tsx:73 · lazyViews.ts:31 → src/components/calls/TelefoniaView.tsx:60. E2E: e2e/navegacao-modulos.spec.ts:103. Unit: src/components/calls/__tests__/TelefoniaView.painel.test.tsx:104 (14/14 passou). |
| view `google-calendar` | OK | Registro: navigation.service.ts:147 'Calendário' · ViewRouter.tsx:74 · lazyViews.ts:32 → src/components/integrations/GoogleCalendarIntegration.tsx:15. E2E: e2e/navegacao-modulos.spec.ts:172. Unit: src/components/integrations/__tests__/GoogleCalendarIntegration.test.tsx:16 (2/2 passou). |
| view `themes` | OK | Registro: navigation.service.ts:134 'Skins' · ViewRouter.tsx:75 · lazyViews.ts:33 → src/components/settings/ThemeCustomizer.tsx:18. E2E: e2e/navegacao-modulos.spec.ts:163. Unit: src/components/settings/__tests__/ThemeCustomizer.test.tsx:42 (8/8 passou). |
| view `schedule` | OK | Registro: navigation.service.ts:78 'Agendamentos' · ViewRouter.tsx:76 · lazyViews.ts:34 → src/components/schedule/ScheduleCalendarView.tsx:45. E2E: e2e/navegacao-modulos.spec.ts:117. Unit: src/components/schedule/__tests__/ScheduleCalendarView.agenda.test.tsx:100 (3/3 passou). |
| view `warroom` | OK | Registro: navigation.service.ts:101 'War Room' · ViewRouter.tsx:77 · lazyViews.ts:35 → src/components/dashboard/WarRoomDashboard.tsx:36. E2E: e2e/navegacao-modulos.spec.ts:138. Unit: src/components/dashboard/__tests__/WarRoomDashboard.estados.test.tsx:26 (1/1 passou). |
| view `wa-templates` | OK | Registro: navigation.service.ts:93 'Templates WA' · ViewRouter.tsx:78 · lazyViews.ts:36 → src/components/catalog/WhatsAppTemplatesManager.tsx:25. E2E: e2e/navegacao-modulos.spec.ts:131. Unit: src/components/catalog/__tests__/WhatsAppTemplatesManager.a11y.test.tsx:108 (4/4 passou). |
| view `omnichannel` | OK | Registro: navigation.service.ts:115 'Canais Omnichannel' · ViewRouter.tsx:79 · lazyViews.ts:37 → src/components/omnichannel/OmnichannelManager.tsx:48. E2E: e2e/navegacao-modulos.spec.ts:151. Unit: src/components/omnichannel/__tests__/OmnichannelManager.a11y.test.tsx:45 (1/1 passou). |
| view `churn` | OK | Registro: navigation.service.ts:91 'Previsão Churn' · ViewRouter.tsx:80 · lazyViews.ts:38 → src/components/ai/ChurnPredictionDashboard.tsx:49. E2E: e2e/navegacao-modulos.spec.ts:129. Unit: src/components/ai/__tests__/ChurnPredictionDashboard.test.tsx:41 (37/37 passou). |
| view `ticket-classifier` | OK | Registro: navigation.service.ts:92 'Classificador IA' · ViewRouter.tsx:81 · lazyViews.ts:39 → src/components/ai/AutoTicketClassifier.tsx:109. E2E: e2e/navegacao-modulos.spec.ts:130. Unit: src/components/ai/__tests__/AutoTicketClassifier.test.tsx:31 (45/45 passou). |
| view `performance` | OK | Registro: navigation.service.ts:158 'Performance' · ViewRouter.tsx:82 · lazyViews.ts:40 → src/components/performance/PerformanceMonitor.tsx:25. E2E: —. Unit: src/components/performance/__tests__/PerformanceMonitor.test.tsx:97 (38/38 passou). |
| view `omni-inbox` | OK | Registro: navigation.service.ts:113 'Omnichannel' · ViewRouter.tsx:83 · lazyViews.ts:41 → src/components/omnichannel/OmnichannelInbox.tsx:145. E2E: e2e/navegacao-modulos.spec.ts:149. Unit: src/components/omnichannel/__tests__/OmnichannelInbox.test.tsx:197 (47/47 passou). |
| view `audit-logs` | OK | Registro: navigation.service.ts:155 'Auditoria' · ViewRouter.tsx:84 · lazyViews.ts:42 → src/components/security/AuditLogDashboard.tsx:58. E2E: —. Unit: src/components/security/__tests__/AuditLogDashboard.test.tsx:109 (31/31 passou). |
| view `telemetry` | OK | Registro: navigation.service.ts:159 'Telemetria BD' · ViewRouter.tsx:85 · lazyViews.ts:43 → src/pages/AdminTelemetriaPage.tsx:28. E2E: —. Unit: src/pages/admin-telemetria/__tests__/AdminTelemetriaPage.leitura-falha.test.tsx:65 (6/6 passou). |
| view `nps` | OK | Registro: navigation.service.ts:103 'NPS' · ViewRouter.tsx:86 · lazyViews.ts:44 → src/components/nps/NPSDashboard.tsx:45. E2E: e2e/navegacao-modulos.spec.ts:140. Unit: src/components/nps/__tests__/NPSDashboard.test.tsx:28 (3/3 passou). |
| view `team-chat` | OK | Registro: navigation.service.ts:57 'Teams' · ViewRouter.tsx:87 · lazyViews.ts:46 → src/components/team-chat/TeamChatView.tsx:13. E2E: e2e/navegacao-modulos.spec.ts:98. Unit: src/components/team-chat/__tests__/team-chat-notifications-mount.test.ts:110 (2/2 passou). |
| view `email-chat` | OK | Registro: navigation.service.ts:58 'Email' · ViewRouter.tsx:88 · lazyViews.ts:48 → src/components/email/EmailChatInbox.tsx:55. E2E: e2e/navegacao-modulos.spec.ts:99. Unit: src/components/email/__tests__/EmailChatInbox.buscaEstados.test.tsx:103 (8/8 passou). |
| view `gmail` | OK | Registro: navigation.service.ts:114 'Gmail' · ViewRouter.tsx:89 · lazyViews.ts:47 → src/components/gmail/GmailInboxView.tsx:46. E2E: e2e/navegacao-modulos.spec.ts:150. Unit: src/components/gmail/__tests__/GmailInboxView.test.tsx:206 (25/25 passou). |
| view `public-api` | BLOQUEADO | Registro: SEM ITEM DE MENU · ViewRouter.tsx:90 · lazyViews.ts:49 → src/components/admin/PublicApiDashboard.tsx:6. E2E: —. Unit: src/components/admin/__tests__/PublicApiDashboard.disabled.test.tsx:13 (2/2 passou). **Inalcançável:** sem item em navigation.service.ts → `canAccess` devolve false para id desconhecido (navigation.service.ts:201-202) → ViewRouter.tsx:134/144 sempre rende `RestrictedView`. Componente registrado que nunca renderiza (código morto; teste PublicApiDashboard.disabled.test.tsx:9 confirma ausência no menu). |
| view `gmail-webhook` | OK | Registro: navigation.service.ts:161 'Gmail Webhook' · ViewRouter.tsx:91 · lazyViews.ts:50 → src/components/admin/GmailWebhookMonitor.tsx:35. E2E: —. Unit: src/components/admin/__tests__/GmailWebhookMonitor.falha-consulta.test.tsx:75 (5/5 passou). |
| view `media-migration` | OK | Registro: navigation.service.ts:162 'Migração Mídia' · ViewRouter.tsx:92 · lazyViews.ts:51 → src/components/admin/MediaMigrationTool.tsx:48. E2E: —. Unit: src/components/admin/__tests__/MediaMigrationTool.test.tsx:121 (9/9 passou). |
| view `crm360` | OK | Registro: navigation.service.ts:75 'CRM 360°' · ViewRouter.tsx:93 · lazyViews.ts:52 → src/components/crm360/CRM360ExplorerView.tsx:21. E2E: e2e/navegacao-modulos.spec.ts:114 (somenteAdmin: só ausência). Unit: src/components/crm360/__tests__/CRM360ExplorerView.carregando.test.tsx:18 (1/1 passou). E2E só confere ausência p/ supervisor; montagem provada pelo unit. |
| view `ai-usage` | OK | Registro: navigation.service.ts:160 'Consumo IA' · ViewRouter.tsx:94 · lazyViews.ts:53 → src/components/admin/AIUsageDashboard.tsx:14. E2E: —. Unit: src/components/admin/__tests__/AIUsageDashboard.estado-a11y.test.tsx:89 (8/8 passou). |
| view `search-insights` | OK | Registro: navigation.service.ts:133 'Insights de Busca' · ViewRouter.tsx:95 · lazyViews.ts:54 → src/components/admin/SearchInsightsView.tsx:101. E2E: e2e/navegacao-modulos.spec.ts:162. Unit: src/components/admin/__tests__/SearchInsightsView.test.tsx:32 (6/6 passou). |
| view `sla` | OK | Registro: navigation.service.ts:104 'SLA' · ViewRouter.tsx:96 · lazyViews.ts:45 → src/components/queues/SLADashboard.tsx:22. E2E: e2e/navegacao-modulos.spec.ts:141. Unit: src/components/queues/__tests__/SLADashboard.redundancia.test.tsx:51 (2/2 passou). |
| view `talkx` | OK | Registro: navigation.service.ts:86 'Campanhas' · ViewRouter.tsx:97 · lazyViews.ts:55 → src/components/talkx/TalkXView.tsx:84. E2E: e2e/navegacao-modulos.spec.ts:124. Unit: src/components/talkx/__tests__/TalkXView.carregamento.test.tsx:73 (3/3 passou). |
| view `talkx-kit` | OK | Registro: SEM ITEM DE MENU · ViewRouter.tsx:99 · lazyViews.ts:58 → src/components/talkx/__dev__/TalkXKit.tsx:104. E2E: e2e/talkx-kit.spec.ts. Unit: src/components/talkx/__dev__/__tests__/TalkXKit.test.tsx:36 (17/17 passou). Sem menu por desenho: gate DEV/`VITE_TALKX_KIT=1` (ViewRouter.tsx:133; forcedState.ts:46); gate testado em src/pages/__tests__/ViewRouter.talkx-kit-gate.test.tsx (2/2 passou). |
| view `multiplix` | OK | Registro: navigation.service.ts:60 'Multiplix' · ViewRouter.tsx:100 · lazyViews.ts:59 → src/components/multiplix/MultiplixView.tsx:100. E2E: e2e/navegacao-modulos.spec.ts:101. Unit: src/components/multiplix/__tests__/MultiplixView.contagem.test.tsx:98 (4/4 passou). |
| view `evolution-monitor` | OK | Registro: navigation.service.ts:163 'Monitor Evolution' · ViewRouter.tsx:101 · lazyViews.ts:60 → src/components/monitoring/EvolutionMonitoringDashboard.tsx:73. E2E: e2e/monitoring.spec.ts:48,129. Unit: src/components/monitoring/__tests__/EvolutionMonitoringDashboard.pauses.test.tsx:79 (1/1 passou). |
| view `achievements` | OK | Registro: navigation.service.ts:64 'Conquistas' · ViewRouter.tsx:106 · lazyViews.ts:61 → src/components/gamification/AchievementsSystem.tsx:26. E2E: e2e/navegacao-modulos.spec.ts:106. Unit: src/components/gamification/__tests__/AchievementsSystem.test.tsx:83 (5/5 passou). |

### Itens de menu internos (Gmail — `src/components/gmail/GmailLabelSidebar.tsx`)

| item | status | prova |
|---|---|---|
| Inbox (`INBOX`) | OK | Definido GmailLabelSidebar.tsx:15; clique → `onSelectLabel(entry.id)` :102 → `selectFolder` em GmailInboxView.tsx:163-166. Unit: src/components/gmail/__tests__/GmailLabelSidebar.test.tsx (10/10 passou). |
| Não lidos (`UNREAD`) | OK | GmailLabelSidebar.tsx:16; mesmo encadeamento :102 → GmailInboxView.tsx:166; GmailLabelSidebar.test.tsx (10/10 passou). |
| Favoritos (`STARRED`) | OK | GmailLabelSidebar.tsx:17; idem; GmailLabelSidebar.test.tsx (10/10 passou). |
| Importantes (`IMPORTANT`) | OK | GmailLabelSidebar.tsx:18; idem; GmailLabelSidebar.test.tsx (10/10 passou). |
| Enviados (`SENT`) | OK | GmailLabelSidebar.tsx:19; idem; GmailLabelSidebar.test.tsx (10/10 passou). |
| Rascunhos (`DRAFT`) | OK | GmailLabelSidebar.tsx:20; idem; GmailLabelSidebar.test.tsx (10/10 passou). |
| Spam (`SPAM`) | OK | GmailLabelSidebar.tsx:21; idem; GmailLabelSidebar.test.tsx (10/10 passou). |
| Lixeira (`TRASH`) | OK | GmailLabelSidebar.tsx:22; idem; GmailLabelSidebar.test.tsx (10/10 passou). |

### Conferências globais

| item | status | prova |
|---|---|---|
| Inventário contexto × código (contagens) | OK | rotas.json: 18 urls = 18 `<Route>` em AppRoutes.tsx:93-159; 55 vistas = 54 VIEW_MAP + 1 SPECIAL (achievements); 61 menu = 53 itens em navigation.service.ts (10 primários :56-65, 34 em grupos :75-147, 9 avançados :155-163) + 8 rótulos Gmail. Script: "nav sem view: []"; "view sem nav: ['public-api','talkx-kit']". Nenhum item de menu sem destino. Destinos de navegação fora do VIEW_MAP achados no código são abas internas (`goals`/`team` = abas do Dashboard, DashboardView.tsx:80,83) ou redirect legado (`pipeline`/`tags`, useNavigationHistory.ts:98-112) — não são menus quebrados. |
| Produção = HEAD e rotas no bundle | OK | **14/11 (fechamento):** `main` = `a97aeacf5`; status Vercel desse commit `success` (deploy Production 7780500314, 01:21:59Z); `zapp-web-v2.vercel.app` serve `assets/index-Ch82fXMJ.js` e as 18/18 rotas de `rotas.json` estão no bundle (`path:` com crase). Histórico anterior: Vercel prod `81f67b0db` READY; 18/18 `path:` no bundle `index-CFJIkylk.js` (244734B); 18/18 chunks lazy de página HTTP 200. |
| E2E de navegação por todos os módulos (Y09) na main | OK | **14/11:** `e2e-logado.yml` run 43540368513 (main `a97aeacf5`), artefato `playwright-report-logado-authenticated-2-of-3`: `results-summary.json` com 21/21 casos de `navegacao-modulos.spec.ts` `passed`, incl. `:1362` (42 entradas, desktop) e `:1440` (42 entradas, celular 390x844); grupo inteiro 84/84 `passed`. Histórico anterior: e2e/navegacao-modulos.spec.ts:1329 ("abre as 42 entradas mapeadas…") **falhou 3x (retry #1, #2)** na última suíte logada concluída da main: workflow e2e-logado.yml run 43216785856 (sha d8854eb31), job 131186396197 `authenticated-2-of-3` → `{"success":false,"code":"browser-suite-failed"}`; artefato `results-summary.json`: `reasons: [PLAYWRIGHT_REPORT_INVALID_SHAPE]`, `browser-result-diagnostic.json`: `error_code: ETIMEDOUT`, relatório Playwright ausente (ENOENT) → asserção exata que falhou não está no artefato. Issue aberta #2913 "[e2e-logado] Suíte logada quebrada na main". Run de 81f67b0db (43235977461) ainda `pending`. Os 2 commits depois de d8854eb31 só tocam docs e playwright.config.ts:1 linha (geolocation chromium-mapa). |
| `rotas.json` fiel ao roteador (flag `protegida`) | OK | **14/11:** corrigido pela #3010 (7bdbe2e); `origin/contexto` (34075672b) traz `/auth` e `/2fa` com `protegida: false`, 18 urls. Histórico anterior: rotas.json marca `/auth` e `/2fa` como `protegida: true`, mas AppRoutes.tsx:95 e :100 não têm `ProtectedRoute` (wrappers `[]` no próprio JSON). Causa: scripts/ai-context/gerar.mjs:341 testa `/Protected\|Private\|Auth\|Guard\|Require\|Admin/i` sobre `tags` que inclui o próprio componente → `Auth` e `TwoFactorAuth` casam com `Auth`. Agentes que leem o contexto recebem rota pública como protegida. |

---

## Edge functions (supabase/functions, exceto _shared)

**Resultado: 94 itens — 80 OK, 14 BLOQUEADO.** Produção tem 94 funções; o repo (main 81f67b0db) tem 92. Todas as 94 respondem ao OPTIONS (200) e as 92 do repo rodam exatamente o bundle que o deploy da main publicou. Os bloqueios: 2 funções em produção sem código no repo (`sicoob-bridge`, `sicoob-bridge-reply`) e 12 funções sem nenhum arquivo de teste.

### Provas globais (valem para todas as linhas)
| item | estado | prova |
|---|---|---|
| Inventário de produção | OK | `GET https://api.supabase.com/v1/projects/tnnnlkbymytvtqngbbqh/functions` → HTTP 200, 94 funções, todas `ACTIVE` (consulta de 2026-11-12) |
| Repo x produção | BLOQUEADO | repo tem 92 pastas (`ls supabase/functions`, sem `_shared` e `deno.json`); comparando as listas: só em produção = `{sicoob-bridge, sicoob-bridge-reply}`; só no repo = `{}` |
| Manifesto = código da main | OK | `node scripts/edge-deploy/generate-manifest.mjs --check` no worktree 81f67b0db → `Edge manifest OK: 92 functions, 176 source files, sha256=d3d065dc…64fa`, exit 0 |
| Último deploy verde na main | OK | run **43189662194** (push, `success`, 2026-11-12T09:14Z, sha **6f90c933209e**); os 26 passos com `success`, incluindo 19 Deploy, 20 manifesto remoto pós-deploy, 21 smoke por função e 22 saúde pós-deploy |
| O deploy cobre o HEAD | OK | `git merge-base --is-ancestor 6f90c9332 81f67b0db` → é ancestral; `git diff --stat 6f90c9332 81f67b0db -- supabase/functions supabase/config.toml supabase/deployment-manifest.json` → vazio (os 9 commits seguintes não mexem em edge) |
| Atestado do run | OK | artefato `edge-deployment-evidence-43189662194-1` (id 13929554801): `deployment-manifest.json` igual byte a byte (`cmp`) ao da main; `edge-deployment-attestation.json` tem git_sha 6f90c933, source_manifest_sha256 d3d065dc…64fa, 92 funções, inventário estável em 7 amostras seguidas; `edge-smoke-evidence.json` dá total 92, passed 92, failed 0 |
| Bundle no ar = bundle atestado | OK | para as 92: `ezbr_sha256`, `version` e `verify_jwt` de produção agora iguais a `remote_bundle_sha256`/`remote_version` do atestado, e `local_source_sha256` do atestado igual a `source_sha256` do manifesto da main → **0 divergências em 92** |
| Arranque sem BOOT_ERROR | OK | `curl -X OPTIONS -H "Origin: https://zapp-web-v2.vercel.app" -H "Access-Control-Request-Method: POST" https://tnnnlkbymytvtqngbbqh.supabase.co/functions/v1/<nome>` nas 94 → **94× HTTP 200**, nenhum 5xx (2026-11-12T14:15Z) |

### Por função
Legenda: (a) produção · (b) bundle = main · (c) preflight · (d) teste

| item | estado | prova |
|---|---|---|
| ai-auto-tag | OK | (a) ACTIVE v617 updated_at 2026-11-10T17:52Z verify_jwt=True; (b) ezbr f62fdc60be85 = bundle atestado no run 43189662194 (sha 6f90c933); source_sha256 07f9eaad488b = manifesto da main 81f67b0d; smoke do run passed=True; (c) OPTIONS 200; (d) supabase/functions/ai-auto-tag/auth.test.ts, supabase/functions/ai-auto-tag/index.test.ts |
| ai-churn-analysis | OK | (a) ACTIVE v604 updated_at 2026-11-10T17:52Z verify_jwt=True; (b) ezbr c618161e559c = bundle atestado no run 43189662194 (sha 6f90c933); source_sha256 ff26ec33a0e2 = manifesto da main 81f67b0d; smoke do run passed=True; (c) OPTIONS 200; (d) supabase/functions/ai-churn-analysis/churn-risk.test.ts |
| ai-classify-tickets | OK | (a) ACTIVE v603 updated_at 2026-11-10T17:52Z verify_jwt=True; (b) ezbr 6d03c2290d8f = bundle atestado no run 43189662194 (sha 6f90c933); source_sha256 550d04ffddcf = manifesto da main 81f67b0d; smoke do run passed=True; (c) OPTIONS 200; (d) tests/contracts/_adv_edge_legacy_producers.test.ts:301-302 (lê o index.ts e afirma o fallback de prioridade) |
| ai-conversation-analysis | OK | (a) ACTIVE v614 updated_at 2026-11-10T17:52Z verify_jwt=True; (b) ezbr 27b356c656c7 = bundle atestado no run 43189662194 (sha 6f90c933); source_sha256 afaff2e55e90 = manifesto da main 81f67b0d; smoke do run passed=True; (c) OPTIONS 200; (d) supabase/functions/ai-conversation-analysis/limite-por-usuario.test.ts, supabase/functions/ai-conversation-analysis/sem-tags-no-prompt.test.ts |
| ai-conversation-summary | OK | (a) ACTIVE v612 updated_at 2026-11-10T17:52Z verify_jwt=True; (b) ezbr 6c173d3f7b63 = bundle atestado no run 43189662194 (sha 6f90c933); source_sha256 6e7de89491ef = manifesto da main 81f67b0d; smoke do run passed=True; (c) OPTIONS 200; (d) supabase/functions/ai-conversation-summary/contact-context.test.ts |
| ai-deadline-calculator | BLOQUEADO | (a) ACTIVE v2 updated_at 2026-11-10T17:52Z verify_jwt=True; (b) ezbr e5f004978baa = bundle atestado no run 43189662194 (sha 6f90c933); source_sha256 7aced243d898 = manifesto da main 81f67b0d; smoke do run passed=True; (c) OPTIONS 200; (d) SEM TESTE: nenhum arquivo de teste em supabase/functions/ai-deadline-calculator/ nem teste em tests/, src/, scripts/ ou e2e/ que cite "ai-deadline-calculator" |
| ai-enhance-message | OK | (a) ACTIVE v610 updated_at 2026-11-10T17:52Z verify_jwt=True; (b) ezbr 7d9e0d780fe8 = bundle atestado no run 43189662194 (sha 6f90c933); source_sha256 0b6927d35088 = manifesto da main 81f67b0d; smoke do run passed=True; (c) OPTIONS 200; (d) tests/contracts/ai-central-routing-ratchet.contract.test.ts:118 (CONSUMIDORES_MIGRADOS; describe (2) afirma o fonte) |
| ai-jobs-worker | OK | (a) ACTIVE v165 updated_at 2026-11-11T17:41Z verify_jwt=True; (b) ezbr 4250f77e9252 = bundle atestado no run 43189662194 (sha 6f90c933); source_sha256 9ca24f6c33ec = manifesto da main 81f67b0d; smoke do run passed=True; (c) OPTIONS 200; (d) supabase/functions/ai-jobs-worker/index.test.ts |
| ai-kb-ingest | OK | (a) ACTIVE v8 updated_at 2026-11-09T22:35Z verify_jwt=True; (b) ezbr cbce11b0c02b = bundle atestado no run 43189662194 (sha 6f90c933); source_sha256 0bde586374f3 = manifesto da main 81f67b0d; smoke do run passed=True; (c) OPTIONS 200; (d) supabase/functions/ai-kb-ingest/index.test.ts |
| ai-lead-temperature | BLOQUEADO | (a) ACTIVE v2 updated_at 2026-11-10T17:52Z verify_jwt=True; (b) ezbr 78b52655e307 = bundle atestado no run 43189662194 (sha 6f90c933); source_sha256 ea4de657d386 = manifesto da main 81f67b0d; smoke do run passed=True; (c) OPTIONS 200; (d) SEM TESTE: nenhum arquivo de teste em supabase/functions/ai-lead-temperature/ nem teste em tests/, src/, scripts/ ou e2e/ que cite "ai-lead-temperature" |
| ai-loss-risk | BLOQUEADO | (a) ACTIVE v2 updated_at 2026-11-10T17:52Z verify_jwt=True; (b) ezbr b88acbc2c91f = bundle atestado no run 43189662194 (sha 6f90c933); source_sha256 2a19d1a19cc5 = manifesto da main 81f67b0d; smoke do run passed=True; (c) OPTIONS 200; (d) SEM TESTE: nenhum arquivo de teste em supabase/functions/ai-loss-risk/ nem teste em tests/, src/, scripts/ ou e2e/ que cite "ai-loss-risk" |
| ai-multimodal-analysis | BLOQUEADO | (a) ACTIVE v2 updated_at 2026-11-10T17:52Z verify_jwt=True; (b) ezbr 665f2d0d53cd = bundle atestado no run 43189662194 (sha 6f90c933); source_sha256 ff603f083695 = manifesto da main 81f67b0d; smoke do run passed=True; (c) OPTIONS 200; (d) SEM TESTE: nenhum arquivo de teste em supabase/functions/ai-multimodal-analysis/ nem teste em tests/, src/, scripts/ ou e2e/ que cite "ai-multimodal-analysis" |
| ai-objection-handler | BLOQUEADO | (a) ACTIVE v2 updated_at 2026-11-10T17:52Z verify_jwt=True; (b) ezbr 4cee4c3d4586 = bundle atestado no run 43189662194 (sha 6f90c933); source_sha256 2402cc3805ef = manifesto da main 81f67b0d; smoke do run passed=True; (c) OPTIONS 200; (d) SEM TESTE: nenhum arquivo de teste em supabase/functions/ai-objection-handler/ nem teste em tests/, src/, scripts/ ou e2e/ que cite "ai-objection-handler" |
| ai-price-anchor | BLOQUEADO | (a) ACTIVE v2 updated_at 2026-11-10T17:52Z verify_jwt=True; (b) ezbr c0d7e59bed50 = bundle atestado no run 43189662194 (sha 6f90c933); source_sha256 f071d33b5e6a = manifesto da main 81f67b0d; smoke do run passed=True; (c) OPTIONS 200; (d) SEM TESTE: nenhum arquivo de teste em supabase/functions/ai-price-anchor/ nem teste em tests/, src/, scripts/ ou e2e/ que cite "ai-price-anchor" |
| ai-product-recommendation | BLOQUEADO | (a) ACTIVE v2 updated_at 2026-11-10T17:52Z verify_jwt=True; (b) ezbr 61b198aacd56 = bundle atestado no run 43189662194 (sha 6f90c933); source_sha256 f2cfbe791d84 = manifesto da main 81f67b0d; smoke do run passed=True; (c) OPTIONS 200; (d) SEM TESTE: nenhum arquivo de teste em supabase/functions/ai-product-recommendation/ nem teste em tests/, src/, scripts/ ou e2e/ que cite "ai-product-recommendation" |
| ai-proxy | OK | (a) ACTIVE v614 updated_at 2026-11-10T17:52Z verify_jwt=True; (b) ezbr 3cee9f6c760a = bundle atestado no run 43189662194 (sha 6f90c933); source_sha256 61f89632eb7f = manifesto da main 81f67b0d; smoke do run passed=True; (c) OPTIONS 200; (d) supabase/functions/ai-proxy/index.test.ts |
| ai-suggest-reply | OK | (a) ACTIVE v611 updated_at 2026-11-10T17:52Z verify_jwt=True; (b) ezbr 46f5d8dcdcaa = bundle atestado no run 43189662194 (sha 6f90c933); source_sha256 d1bfd50075ad = manifesto da main 81f67b0d; smoke do run passed=True; (c) OPTIONS 200; (d) supabase/functions/ai-suggest-reply/index.test.ts |
| ai-transcribe-audio | OK | (a) ACTIVE v601 updated_at 2026-11-10T17:52Z verify_jwt=True; (b) ezbr 115e58ef97ea = bundle atestado no run 43189662194 (sha 6f90c933); source_sha256 3c267fbc45bb = manifesto da main 81f67b0d; smoke do run passed=True; (c) OPTIONS 200; (d) supabase/functions/ai-transcribe-audio/index.test.ts |
| ai-usage-outbox-drain | OK | (a) ACTIVE v6 updated_at 2026-11-09T22:35Z verify_jwt=False; (b) ezbr 5727974df046 = bundle atestado no run 43189662194 (sha 6f90c933); source_sha256 8c6d96a5a910 = manifesto da main 81f67b0d; smoke do run passed=True; (c) OPTIONS 200; (d) supabase/functions/ai-usage-outbox-drain/index.test.ts |
| approve-password-reset | OK | (a) ACTIVE v598 updated_at 2026-11-10T17:52Z verify_jwt=True; (b) ezbr a1035b02e3e3 = bundle atestado no run 43189662194 (sha 6f90c933); source_sha256 0a0406872548 = manifesto da main 81f67b0d; smoke do run passed=True; (c) OPTIONS 200; (d) supabase/functions/approve-password-reset/index.test.ts |
| auth-login | OK | (a) ACTIVE v562 updated_at 2026-11-09T22:35Z verify_jwt=False; (b) ezbr 1fc423776238 = bundle atestado no run 43189662194 (sha 6f90c933); source_sha256 d875faa437b2 = manifesto da main 81f67b0d; smoke do run passed=True; (c) OPTIONS 200; (d) supabase/functions/auth-login/index.test.ts |
| auto-close-conversations | OK | (a) ACTIVE v593 updated_at 2026-11-09T22:35Z verify_jwt=True; (b) ezbr c646730ea29c = bundle atestado no run 43189662194 (sha 6f90c933); source_sha256 55451fbb1373 = manifesto da main 81f67b0d; smoke do run passed=True; (c) OPTIONS 200; (d) supabase/functions/auto-close-conversations/index.test.ts |
| automation-suggest-reply | OK | (a) ACTIVE v5 updated_at 2026-11-09T22:35Z verify_jwt=True; (b) ezbr 90b9a11260b8 = bundle atestado no run 43189662194 (sha 6f90c933); source_sha256 4231755fd6dd = manifesto da main 81f67b0d; smoke do run passed=True; (c) OPTIONS 200; (d) supabase/functions/automation-suggest-reply/index.test.ts |
| batch-fetch-avatars | BLOQUEADO | (a) ACTIVE v604 updated_at 2026-11-09T22:35Z verify_jwt=False; (b) ezbr 75068bfea23e = bundle atestado no run 43189662194 (sha 6f90c933); source_sha256 080c44b79b6f = manifesto da main 81f67b0d; smoke do run passed=True; (c) OPTIONS 200; (d) SEM TESTE: só mock de invoke no front (src/hooks/inbox/__tests__/useInboxBulkActions.test.ts:718); nenhum teste do código da edge |
| bitrix-api | OK | (a) ACTIVE v593 updated_at 2026-11-09T22:35Z verify_jwt=True; (b) ezbr 900b55eaae3a = bundle atestado no run 43189662194 (sha 6f90c933); source_sha256 08e3459441f3 = manifesto da main 81f67b0d; smoke do run passed=True; (c) OPTIONS 200; (d) supabase/functions/bitrix-api/index.test.ts |
| chatbot-l1 | OK | (a) ACTIVE v611 updated_at 2026-11-10T17:52Z verify_jwt=True; (b) ezbr db1439f9f7f3 = bundle atestado no run 43189662194 (sha 6f90c933); source_sha256 4052a89f2b5a = manifesto da main 81f67b0d; smoke do run passed=True; (c) OPTIONS 200; (d) supabase/functions/chatbot-l1/index.test.ts |
| classify-audio-meme | OK | (a) ACTIVE v606 updated_at 2026-11-10T17:52Z verify_jwt=True; (b) ezbr 7b36a9e36d6c = bundle atestado no run 43189662194 (sha 6f90c933); source_sha256 f6e743f824a2 = manifesto da main 81f67b0d; smoke do run passed=True; (c) OPTIONS 200; (d) supabase/functions/classify-audio-meme/index.test.ts |
| classify-emoji | OK | (a) ACTIVE v608 updated_at 2026-11-10T17:52Z verify_jwt=True; (b) ezbr 6f673236cb41 = bundle atestado no run 43189662194 (sha 6f90c933); source_sha256 24cc7c01e922 = manifesto da main 81f67b0d; smoke do run passed=True; (c) OPTIONS 200; (d) supabase/functions/classify-emoji/index.test.ts |
| classify-sticker | OK | (a) ACTIVE v609 updated_at 2026-11-10T17:52Z verify_jwt=True; (b) ezbr 89777c6ab98c = bundle atestado no run 43189662194 (sha 6f90c933); source_sha256 df15827323e2 = manifesto da main 81f67b0d; smoke do run passed=True; (c) OPTIONS 200; (d) supabase/functions/classify-sticker/index.test.ts |
| cleanup-rate-limit-logs | OK | (a) ACTIVE v593 updated_at 2026-11-12T03:02Z verify_jwt=True; (b) ezbr 3f3df3a14eb6 = bundle atestado no run 43189662194 (sha 6f90c933); source_sha256 aba4f321fce3 = manifesto da main 81f67b0d; smoke do run passed=True; (c) OPTIONS 200; (d) supabase/functions/cleanup-rate-limit-logs/index.test.ts |
| connection-health-check | OK | (a) ACTIVE v605 updated_at 2026-11-10T10:00Z verify_jwt=False; (b) ezbr b4da6ebdfba4 = bundle atestado no run 43189662194 (sha 6f90c933); source_sha256 ac5b14234da6 = manifesto da main 81f67b0d; smoke do run passed=True; (c) OPTIONS 200; (d) supabase/functions/connection-health-check/index.test.ts |
| copilot-live | BLOQUEADO | (a) ACTIVE v7 updated_at 2026-11-10T17:52Z verify_jwt=True; (b) ezbr 3d224919ed17 = bundle atestado no run 43189662194 (sha 6f90c933); source_sha256 5d198189651d = manifesto da main 81f67b0d; smoke do run passed=True; (c) OPTIONS 200; (d) SEM TESTE: nenhum arquivo de teste em supabase/functions/copilot-live/ nem teste em tests/, src/, scripts/ ou e2e/ que cite "copilot-live" |
| create-user | OK | (a) ACTIVE v593 updated_at 2026-11-09T22:35Z verify_jwt=True; (b) ezbr 6d63e17e5e68 = bundle atestado no run 43189662194 (sha 6f90c933); source_sha256 5adb8d3eaa4f = manifesto da main 81f67b0d; smoke do run passed=True; (c) OPTIONS 200; (d) supabase/functions/create-user/index.test.ts |
| crm-integration | OK | (a) ACTIVE v554 updated_at 2026-11-09T22:35Z verify_jwt=False; (b) ezbr 8ee5fe66dd27 = bundle atestado no run 43189662194 (sha 6f90c933); source_sha256 776d950af2be = manifesto da main 81f67b0d; smoke do run passed=True; (c) OPTIONS 200; (d) supabase/functions/crm-integration/index.test.ts |
| csp-report | BLOQUEADO | (a) ACTIVE v563 updated_at 2026-11-09T22:35Z verify_jwt=False; (b) ezbr 8deb12788d94 = bundle atestado no run 43189662194 (sha 6f90c933); source_sha256 5f4c1b12d1f4 = manifesto da main 81f67b0d; smoke do run passed=True; (c) OPTIONS 200; (d) SEM TESTE: nenhum arquivo de teste em supabase/functions/csp-report/ nem teste em tests/, src/, scripts/ ou e2e/ que cite "csp-report" |
| detect-new-device | OK | (a) ACTIVE v598 updated_at 2026-11-10T17:52Z verify_jwt=True; (b) ezbr 99e7f0b5eace = bundle atestado no run 43189662194 (sha 6f90c933); source_sha256 122a2280dd13 = manifesto da main 81f67b0d; smoke do run passed=True; (c) OPTIONS 200; (d) supabase/functions/detect-new-device/index.test.ts |
| elevenlabs-agent-token | OK | (a) ACTIVE v590 updated_at 2026-11-09T22:35Z verify_jwt=True; (b) ezbr 701d67606bcd = bundle atestado no run 43189662194 (sha 6f90c933); source_sha256 a7e4ea832d67 = manifesto da main 81f67b0d; smoke do run passed=True; (c) OPTIONS 200; (d) supabase/functions/elevenlabs-agent-token/index.test.ts |
| elevenlabs-dialogue | OK | (a) ACTIVE v595 updated_at 2026-11-10T17:52Z verify_jwt=True; (b) ezbr 2b5b011e55d5 = bundle atestado no run 43189662194 (sha 6f90c933); source_sha256 28144bb40025 = manifesto da main 81f67b0d; smoke do run passed=True; (c) OPTIONS 200; (d) supabase/functions/elevenlabs-dialogue/index.test.ts |
| elevenlabs-scribe-token | OK | (a) ACTIVE v590 updated_at 2026-11-09T22:35Z verify_jwt=True; (b) ezbr f25e70e54574 = bundle atestado no run 43189662194 (sha 6f90c933); source_sha256 b107edb6efa3 = manifesto da main 81f67b0d; smoke do run passed=True; (c) OPTIONS 200; (d) supabase/functions/elevenlabs-scribe-token/index.test.ts |
| elevenlabs-sfx | OK | (a) ACTIVE v595 updated_at 2026-11-10T17:52Z verify_jwt=True; (b) ezbr 69562b6a0ec7 = bundle atestado no run 43189662194 (sha 6f90c933); source_sha256 11fd125e0e36 = manifesto da main 81f67b0d; smoke do run passed=True; (c) OPTIONS 200; (d) supabase/functions/elevenlabs-sfx/index.test.ts, supabase/functions/elevenlabs-sfx/request.test.ts |
| elevenlabs-sts | OK | (a) ACTIVE v591 updated_at 2026-11-10T17:52Z verify_jwt=True; (b) ezbr 22f2ad5333bf = bundle atestado no run 43189662194 (sha 6f90c933); source_sha256 cd212f543f16 = manifesto da main 81f67b0d; smoke do run passed=True; (c) OPTIONS 200; (d) supabase/functions/elevenlabs-sts/index.test.ts |
| elevenlabs-tts | OK | (a) ACTIVE v596 updated_at 2026-11-10T17:52Z verify_jwt=True; (b) ezbr 942cdab3c2f6 = bundle atestado no run 43189662194 (sha 6f90c933); source_sha256 b52a471f8ede = manifesto da main 81f67b0d; smoke do run passed=True; (c) OPTIONS 200; (d) supabase/functions/elevenlabs-tts/index.test.ts |
| elevenlabs-tts-stream | OK | (a) ACTIVE v596 updated_at 2026-11-10T17:52Z verify_jwt=True; (b) ezbr d41a61bb0691 = bundle atestado no run 43189662194 (sha 6f90c933); source_sha256 f5a619d45c0b = manifesto da main 81f67b0d; smoke do run passed=True; (c) OPTIONS 200; (d) supabase/functions/elevenlabs-tts-stream/index.test.ts |
| elevenlabs-voice-design | OK | (a) ACTIVE v595 updated_at 2026-11-10T17:52Z verify_jwt=True; (b) ezbr faf80d15fd90 = bundle atestado no run 43189662194 (sha 6f90c933); source_sha256 cb1a952632a1 = manifesto da main 81f67b0d; smoke do run passed=True; (c) OPTIONS 200; (d) supabase/functions/elevenlabs-voice-design/index.test.ts |
| elevenlabs-webhook | OK | (a) ACTIVE v633 updated_at 2026-11-10T17:52Z verify_jwt=False; (b) ezbr 6058daa685ea = bundle atestado no run 43189662194 (sha 6f90c933); source_sha256 b19df4eb9b83 = manifesto da main 81f67b0d; smoke do run passed=True; (c) OPTIONS 200; (d) supabase/functions/elevenlabs-webhook/index.test.ts |
| evolution-api | OK | (a) ACTIVE v610 updated_at 2026-11-10T17:52Z verify_jwt=True; (b) ezbr 56183dd622e3 = bundle atestado no run 43189662194 (sha 6f90c933); source_sha256 289c8459b03c = manifesto da main 81f67b0d; smoke do run passed=True; (c) OPTIONS 200; (d) supabase/functions/evolution-api/index.test.ts, supabase/functions/evolution-api/session-flavor-routes.test.ts |
| evolution-sync | OK | (a) ACTIVE v600 updated_at 2026-11-09T22:35Z verify_jwt=True; (b) ezbr 60a14afcdd32 = bundle atestado no run 43189662194 (sha 6f90c933); source_sha256 e2f9364dc921 = manifesto da main 81f67b0d; smoke do run passed=True; (c) OPTIONS 200; (d) supabase/functions/evolution-sync/index.test.ts |
| evolution-webhook | OK | (a) ACTIVE v678 updated_at 2026-11-11T17:41Z verify_jwt=False; (b) ezbr 642695218fd6 = bundle atestado no run 43189662194 (sha 6f90c933); source_sha256 8c7f248028c1 = manifesto da main 81f67b0d; smoke do run passed=True; (c) OPTIONS 200; (d) supabase/functions/evolution-webhook/index.test.ts |
| external-db-bridge | OK | (a) ACTIVE v597 updated_at 2026-11-12T09:15Z verify_jwt=True; (b) ezbr d8f1591f206d = bundle atestado no run 43189662194 (sha 6f90c933); source_sha256 8334cfea60d6 = manifesto da main 81f67b0d; smoke do run passed=True; (c) OPTIONS 200; (d) supabase/functions/external-db-bridge/index.test.ts |
| external-db-proxy | OK | (a) ACTIVE v600 updated_at 2026-11-12T03:02Z verify_jwt=True; (b) ezbr 5749c8589196 = bundle atestado no run 43189662194 (sha 6f90c933); source_sha256 4f471f35d5a6 = manifesto da main 81f67b0d; smoke do run passed=True; (c) OPTIONS 200; (d) supabase/functions/external-db-proxy/index.test.ts |
| fetch-link-preview | OK | (a) ACTIVE v594 updated_at 2026-11-09T22:35Z verify_jwt=True; (b) ezbr 311865bdeec4 = bundle atestado no run 43189662194 (sha 6f90c933); source_sha256 dd51a73adbd4 = manifesto da main 81f67b0d; smoke do run passed=True; (c) OPTIONS 200; (d) supabase/functions/fetch-link-preview/__tests__/image-proxy.test.ts, supabase/functions/fetch-link-preview/index.test.ts |
| get-call-recording | OK | (a) ACTIVE v13 updated_at 2026-11-09T22:35Z verify_jwt=True; (b) ezbr eb85cbc99477 = bundle atestado no run 43189662194 (sha 6f90c933); source_sha256 9546255dd079 = manifesto da main 81f67b0d; smoke do run passed=True; (c) OPTIONS 200; (d) supabase/functions/get-call-recording/index.test.ts |
| get-mapbox-token | BLOQUEADO | (a) ACTIVE v589 updated_at 2026-11-09T22:35Z verify_jwt=True; (b) ezbr adaf16b1747e = bundle atestado no run 43189662194 (sha 6f90c933); source_sha256 dae16055e08c = manifesto da main 81f67b0d; smoke do run passed=True; (c) OPTIONS 200; (d) SEM TESTE: só mockada em e2e/location-picker.spec.ts:22 e e2e/contact-address.spec.ts:23 e no front; nenhum teste do código da edge |
| get-sip-password | OK | (a) ACTIVE v592 updated_at 2026-11-09T22:35Z verify_jwt=True; (b) ezbr 02c6266c0fd7 = bundle atestado no run 43189662194 (sha 6f90c933); source_sha256 6e17092126d4 = manifesto da main 81f67b0d; smoke do run passed=True; (c) OPTIONS 200; (d) supabase/functions/get-sip-password/index.test.ts |
| gmail-cron-sync | OK | (a) ACTIVE v610 updated_at 2026-11-09T22:35Z verify_jwt=False; (b) ezbr 9a0b80d7bdac = bundle atestado no run 43189662194 (sha 6f90c933); source_sha256 b097e00673e2 = manifesto da main 81f67b0d; smoke do run passed=True; (c) OPTIONS 200; (d) supabase/functions/gmail-cron-sync/reauth-e-backoff.test.ts |
| gmail-oauth | OK | (a) ACTIVE v603 updated_at 2026-11-12T07:19Z verify_jwt=True; (b) ezbr 162562716465 = bundle atestado no run 43189662194 (sha 6f90c933); source_sha256 15ff8c33689d = manifesto da main 81f67b0d; smoke do run passed=True; (c) OPTIONS 200; (d) supabase/functions/gmail-oauth/index.test.ts |
| gmail-send | OK | (a) ACTIVE v601 updated_at 2026-11-10T17:52Z verify_jwt=True; (b) ezbr 12c26ed84930 = bundle atestado no run 43189662194 (sha 6f90c933); source_sha256 640ac3535dd0 = manifesto da main 81f67b0d; smoke do run passed=True; (c) OPTIONS 200; (d) supabase/functions/gmail-send/index.test.ts, supabase/functions/gmail-send/reauth-409.test.ts, supabase/functions/gmail-send/trash-persistencia.test.ts |
| gmail-sync | OK | (a) ACTIVE v599 updated_at 2026-11-09T22:35Z verify_jwt=True; (b) ezbr 8d6d462ea26c = bundle atestado no run 43189662194 (sha 6f90c933); source_sha256 d91c9dfbccec = manifesto da main 81f67b0d; smoke do run passed=True; (c) OPTIONS 200; (d) supabase/functions/gmail-sync/gmail-labels-mutation.test.ts, supabase/functions/gmail-sync/gmail-labels-schema.test.ts, supabase/functions/gmail-sync/reauth-backoff.test.ts |
| gmail-webhook | OK | (a) ACTIVE v628 updated_at 2026-11-09T22:35Z verify_jwt=False; (b) ezbr bbefe73f7b90 = bundle atestado no run 43189662194 (sha 6f90c933); source_sha256 8103a26ef1c8 = manifesto da main 81f67b0d; smoke do run passed=True; (c) OPTIONS 200; (d) supabase/functions/gmail-webhook/attachments.test.ts, supabase/functions/gmail-webhook/history-404-cas.test.ts |
| health | OK | (a) ACTIVE v8 updated_at 2026-11-09T22:35Z verify_jwt=True; (b) ezbr 9346a8e7018a = bundle atestado no run 43189662194 (sha 6f90c933); source_sha256 b70a24e71a83 = manifesto da main 81f67b0d; smoke do run passed=True; (c) OPTIONS 200; (d) supabase/functions/health/index.test.ts |
| invite-user | OK | (a) ACTIVE v6 updated_at 2026-11-09T22:35Z verify_jwt=True; (b) ezbr 1cef8cc8f3b1 = bundle atestado no run 43189662194 (sha 6f90c933); source_sha256 0d27b1f7a17b = manifesto da main 81f67b0d; smoke do run passed=True; (c) OPTIONS 200; (d) supabase/functions/invite-user/index.test.ts |
| message-delivery | OK | (a) ACTIVE v549 updated_at 2026-11-11T17:41Z verify_jwt=True; (b) ezbr 5bca42c0ff9a = bundle atestado no run 43189662194 (sha 6f90c933); source_sha256 a1ae3f885190 = manifesto da main 81f67b0d; smoke do run passed=True; (c) OPTIONS 200; (d) supabase/functions/message-delivery/index.test.ts |
| metrics | OK | (a) ACTIVE v8 updated_at 2026-11-09T22:35Z verify_jwt=True; (b) ezbr e3c953e03ddf = bundle atestado no run 43189662194 (sha 6f90c933); source_sha256 28cfae0b0e7b = manifesto da main 81f67b0d; smoke do run passed=True; (c) OPTIONS 200; (d) supabase/functions/metrics/index.test.ts |
| migrate-media-storage | OK | (a) ACTIVE v596 updated_at 2026-11-09T22:35Z verify_jwt=True; (b) ezbr a6cb63d877f7 = bundle atestado no run 43189662194 (sha 6f90c933); source_sha256 b17c77630748 = manifesto da main 81f67b0d; smoke do run passed=True; (c) OPTIONS 200; (d) supabase/functions/migrate-media-storage/__tests__/index.test.ts |
| multiplix-audience | OK | (a) ACTIVE v473 updated_at 2026-11-09T22:35Z verify_jwt=True; (b) ezbr c950a32314d4 = bundle atestado no run 43189662194 (sha 6f90c933); source_sha256 925b8ab80b9b = manifesto da main 81f67b0d; smoke do run passed=True; (c) OPTIONS 200; (d) supabase/functions/multiplix-audience/index.test.ts |
| multiplix-dispatch | OK | (a) ACTIVE v153 updated_at 2026-11-09T22:35Z verify_jwt=True; (b) ezbr 987688700817 = bundle atestado no run 43189662194 (sha 6f90c933); source_sha256 3b4889203539 = manifesto da main 81f67b0d; smoke do run passed=True; (c) OPTIONS 200; (d) supabase/functions/multiplix-dispatch/__tests__/draft.test.ts, supabase/functions/multiplix-dispatch/__tests__/f53-rate-limit.test.ts, supabase/functions/multiplix-dispatch/actions/__tests__/audience.test.ts (+4) |
| multiplix-send | OK | (a) ACTIVE v489 updated_at 2026-11-09T22:35Z verify_jwt=True; (b) ezbr 0b9ba18b3f0f = bundle atestado no run 43189662194 (sha 6f90c933); source_sha256 3ae4dc39b8e1 = manifesto da main 81f67b0d; smoke do run passed=True; (c) OPTIONS 200; (d) supabase/functions/multiplix-send/index.test.ts |
| multiplix-voices | OK | (a) ACTIVE v12 updated_at 2026-11-09T22:35Z verify_jwt=True; (b) ezbr 4bcc023fb275 = bundle atestado no run 43189662194 (sha 6f90c933); source_sha256 b1fb7e0a8576 = manifesto da main 81f67b0d; smoke do run passed=True; (c) OPTIONS 200; (d) supabase/functions/multiplix-voices/index.test.ts |
| promogifts-catalog | OK | (a) ACTIVE v623 updated_at 2026-11-09T22:35Z verify_jwt=True; (b) ezbr 080929a07d5c = bundle atestado no run 43189662194 (sha 6f90c933); source_sha256 fbbb1addb4db = manifesto da main 81f67b0d; smoke do run passed=True; (c) OPTIONS 200; (d) supabase/functions/promogifts-catalog/index.actions.test.ts, supabase/functions/promogifts-catalog/index.test.ts, supabase/functions/promogifts-catalog/pagination.test.ts |
| public-api | OK | (a) ACTIVE v635 updated_at 2026-11-09T22:35Z verify_jwt=False; (b) ezbr 79a695cd9c27 = bundle atestado no run 43189662194 (sha 6f90c933); source_sha256 aad7988fd57d = manifesto da main 81f67b0d; smoke do run passed=True; (c) OPTIONS 200; (d) supabase/functions/public-api/index.test.ts |
| recover-corrupted-audios | OK | (a) ACTIVE v596 updated_at 2026-11-09T22:35Z verify_jwt=True; (b) ezbr 1fe3854fdfbd = bundle atestado no run 43189662194 (sha 6f90c933); source_sha256 a2ec9d28653c = manifesto da main 81f67b0d; smoke do run passed=True; (c) OPTIONS 200; (d) supabase/functions/recover-corrupted-audios/index.test.ts |
| recover-message-media | OK | (a) ACTIVE v5 updated_at 2026-11-09T22:35Z verify_jwt=True; (b) ezbr c379701df87c = bundle atestado no run 43189662194 (sha 6f90c933); source_sha256 ae964130a38f = manifesto da main 81f67b0d; smoke do run passed=True; (c) OPTIONS 200; (d) supabase/functions/recover-message-media/index.test.ts |
| revoke-auth-sessions | OK | (a) ACTIVE v14 updated_at 2026-11-10T17:52Z verify_jwt=True; (b) ezbr c2e7a9de0d29 = bundle atestado no run 43189662194 (sha 6f90c933); source_sha256 1a7067d43e6d = manifesto da main 81f67b0d; smoke do run passed=True; (c) OPTIONS 200; (d) supabase/functions/revoke-auth-sessions/index.test.ts |
| searchbox-budget-alert | OK | (a) ACTIVE v84 updated_at 2026-11-09T22:35Z verify_jwt=False; (b) ezbr 0705d0068236 = bundle atestado no run 43189662194 (sha 6f90c933); source_sha256 1d665df73eda = manifesto da main 81f67b0d; smoke do run passed=True; (c) OPTIONS 200; (d) supabase/functions/searchbox-budget-alert/index.test.ts |
| send-email | OK | (a) ACTIVE v595 updated_at 2026-11-10T17:52Z verify_jwt=True; (b) ezbr eafcf1f597cf = bundle atestado no run 43189662194 (sha 6f90c933); source_sha256 26ab7b2b3b45 = manifesto da main 81f67b0d; smoke do run passed=True; (c) OPTIONS 200; (d) supabase/functions/send-email/index.test.ts |
| send-rate-limit-alert | OK | (a) ACTIVE v598 updated_at 2026-11-10T17:52Z verify_jwt=True; (b) ezbr f9b70f319768 = bundle atestado no run 43189662194 (sha 6f90c933); source_sha256 ad62481ea410 = manifesto da main 81f67b0d; smoke do run passed=True; (c) OPTIONS 200; (d) supabase/functions/send-rate-limit-alert/index.test.ts |
| send-scheduled-report | OK | (a) ACTIVE v600 updated_at 2026-11-10T17:52Z verify_jwt=True; (b) ezbr cd1aa3c730de = bundle atestado no run 43189662194 (sha 6f90c933); source_sha256 a735e990f6f4 = manifesto da main 81f67b0d; smoke do run passed=True; (c) OPTIONS 200; (d) supabase/functions/send-scheduled-report/index.test.ts |
| sentiment-alert | OK | (a) ACTIVE v602 updated_at 2026-11-10T17:52Z verify_jwt=True; (b) ezbr c0f01581e63e = bundle atestado no run 43189662194 (sha 6f90c933); source_sha256 464ccb484461 = manifesto da main 81f67b0d; smoke do run passed=True; (c) OPTIONS 200; (d) supabase/functions/sentiment-alert/index.test.ts |
| sicoob-bridge | BLOQUEADO | (a) ACTIVE v582 updated_at 2026-09-29T12:57Z verify_jwt=True; (b) sem pasta supabase/functions/sicoob-bridge na main; só em orphan_allowlist (supabase/deployment-manifest.json:15); entrypoint remoto supabase/functions/sicoob-bridge/index.ts; (c) OPTIONS 200; (d) sem fonte, sem teste |
| sicoob-bridge-reply | BLOQUEADO | (a) ACTIVE v582 updated_at 2026-09-29T12:57Z verify_jwt=True; (b) sem pasta supabase/functions/sicoob-bridge-reply na main; só em orphan_allowlist (supabase/deployment-manifest.json:15); entrypoint remoto supabase/functions/sicoob-bridge-reply/index.ts; (c) OPTIONS 200; (d) sem fonte, sem teste |
| status | OK | (a) ACTIVE v8 updated_at 2026-11-09T22:35Z verify_jwt=True; (b) ezbr 87523d137c65 = bundle atestado no run 43189662194 (sha 6f90c933); source_sha256 8f425e5e573d = manifesto da main 81f67b0d; smoke do run passed=True; (c) OPTIONS 200; (d) supabase/functions/status/index.test.ts |
| sync-call-records | OK | (a) ACTIVE v13 updated_at 2026-11-09T22:35Z verify_jwt=False; (b) ezbr 2ebd039925ae = bundle atestado no run 43189662194 (sha 6f90c933); source_sha256 ab2760eeebc4 = manifesto da main 81f67b0d; smoke do run passed=True; (c) OPTIONS 200; (d) supabase/functions/sync-call-records/index.test.ts |
| talkx-ai | OK | (a) ACTIVE v8 updated_at 2026-11-09T22:35Z verify_jwt=True; (b) ezbr 7cfe33a5a7a7 = bundle atestado no run 43189662194 (sha 6f90c933); source_sha256 6d97ce47cf5f = manifesto da main 81f67b0d; smoke do run passed=True; (c) OPTIONS 200; (d) supabase/functions/talkx-ai/index.test.ts |
| talkx-link | OK | (a) ACTIVE v514 updated_at 2026-11-09T22:35Z verify_jwt=False; (b) ezbr 1eadbc066b38 = bundle atestado no run 43189662194 (sha 6f90c933); source_sha256 a544609ddc63 = manifesto da main 81f67b0d; smoke do run passed=True; (c) OPTIONS 200; (d) supabase/functions/talkx-link/index.test.ts |
| talkx-report | OK | (a) ACTIVE v513 updated_at 2026-11-09T22:35Z verify_jwt=True; (b) ezbr ed693d0e239d = bundle atestado no run 43189662194 (sha 6f90c933); source_sha256 adf60638fd44 = manifesto da main 81f67b0d; smoke do run passed=True; (c) OPTIONS 200; (d) supabase/functions/talkx-report/index.test.ts |
| talkx-scheduler | OK | (a) ACTIVE v598 updated_at 2026-11-09T22:35Z verify_jwt=True; (b) ezbr 2a530bb8fe93 = bundle atestado no run 43189662194 (sha 6f90c933); source_sha256 3bf400cc2133 = manifesto da main 81f67b0d; smoke do run passed=True; (c) OPTIONS 200; (d) supabase/functions/talkx-scheduler/index.test.ts |
| talkx-send | OK | (a) ACTIVE v623 updated_at 2026-11-11T17:41Z verify_jwt=True; (b) ezbr a38d2f631df3 = bundle atestado no run 43189662194 (sha 6f90c933); source_sha256 d56f2c4d59b9 = manifesto da main 81f67b0d; smoke do run passed=True; (c) OPTIONS 200; (d) supabase/functions/talkx-send/engine.integration.test.ts, supabase/functions/talkx-send/f43-correlation.test.ts, supabase/functions/talkx-send/index.test.ts (+8) |
| talkx-storage-purge | OK | (a) ACTIVE v8 updated_at 2026-11-09T22:35Z verify_jwt=True; (b) ezbr 55b72e10fb36 = bundle atestado no run 43189662194 (sha 6f90c933); source_sha256 8928c79df090 = manifesto da main 81f67b0d; smoke do run passed=True; (c) OPTIONS 200; (d) supabase/functions/talkx-storage-purge/index.test.ts |
| voice-agent | BLOQUEADO | (a) ACTIVE v601 updated_at 2026-11-09T22:35Z verify_jwt=True; (b) ezbr 99290a77fb4b = bundle atestado no run 43189662194 (sha 6f90c933); source_sha256 f526eb519b04 = manifesto da main 81f67b0d; smoke do run passed=True; (c) OPTIONS 200; (d) SEM TESTE: só aparece na allowlist de dívida DIVIDA_IA_033 (tests/contracts/ai-central-routing-ratchet.contract.test.ts:140); nenhum teste do comportamento |
| voice-changer | OK | (a) ACTIVE v589 updated_at 2026-11-09T22:35Z verify_jwt=True; (b) ezbr b8b018c89220 = bundle atestado no run 43189662194 (sha 6f90c933); source_sha256 886fd9ee17a2 = manifesto da main 81f67b0d; smoke do run passed=True; (c) OPTIONS 200; (d) supabase/functions/voice-changer/index.test.ts |
| voice-copilot-action | OK | (a) ACTIVE v592 updated_at 2026-11-09T22:35Z verify_jwt=True; (b) ezbr f9f73beaf37e = bundle atestado no run 43189662194 (sha 6f90c933); source_sha256 b8833a0e2581 = manifesto da main 81f67b0d; smoke do run passed=True; (c) OPTIONS 200; (d) supabase/functions/voice-copilot-action/index.test.ts, supabase/functions/voice-copilot-action/voice-copilot-catalog.test.ts |
| webauthn | OK | (a) ACTIVE v597 updated_at 2026-11-10T17:52Z verify_jwt=True; (b) ezbr 1d48728901ed = bundle atestado no run 43189662194 (sha 6f90c933); source_sha256 12db2973fc8d = manifesto da main 81f67b0d; smoke do run passed=True; (c) OPTIONS 200; (d) supabase/functions/webauthn/index.test.ts, supabase/functions/webauthn/verify.test.ts |
| webhook-diagnostic | OK | (a) ACTIVE v601 updated_at 2026-11-09T22:35Z verify_jwt=True; (b) ezbr a238167436df = bundle atestado no run 43189662194 (sha 6f90c933); source_sha256 ade3e25c3941 = manifesto da main 81f67b0d; smoke do run passed=True; (c) OPTIONS 200; (d) supabase/functions/webhook-diagnostic/diagnostic-authz.test.ts, supabase/functions/webhook-diagnostic/diagnostic-message-flow.test.ts, supabase/functions/webhook-diagnostic/diagnostic.test.ts (+1) |
| whatsapp-webhook | OK | (a) ACTIVE v627 updated_at 2026-11-09T22:35Z verify_jwt=False; (b) ezbr 7e6acc3909f0 = bundle atestado no run 43189662194 (sha 6f90c933); source_sha256 6e9bf48c1718 = manifesto da main 81f67b0d; smoke do run passed=True; (c) OPTIONS 200; (d) supabase/functions/whatsapp-webhook/index.test.ts |

### Bloqueios
- **sicoob-bridge / sicoob-bridge-reply**: no ar (ACTIVE, v582, atualizadas em 2026-09-29T12:57Z, verify_jwt=true, respondem ao OPTIONS com 200), mas não existe pasta para elas na main. Ficam de fora do controle do deploy por estarem em `orphan_allowlist` (`supabase/deployment-manifest.json:15`; teste `scripts/edge-deploy/manifest.unit.mjs:255-279` "sicoob-bridge/-reply SEGUEM NO AR"). Sem fonte, ninguém consegue auditar nem reconstruir o código que está rodando. Para resolver: trazer a fonte para o repo, ou o dono decidir apagar as duas (apagar é destrutivo em produção e exige o dono).
- **12 funções sem teste**: ai-deadline-calculator, ai-lead-temperature, ai-loss-risk, ai-multimodal-analysis, ai-objection-handler, ai-price-anchor, ai-product-recommendation, batch-fetch-avatars, copilot-live, csp-report, get-mapbox-token, voice-agent. Para cada uma não achei arquivo `*.test.ts` na pasta da função, nem teste em `tests/`, `src/`, `scripts/` ou `e2e/` que leia o código dela. Busca feita em 2475 arquivos de teste de `git ls-files`. As referências que existem para batch-fetch-avatars, get-mapbox-token e voice-agent são mocks do front ou allowlist de dívida, não testam a edge. Para resolver: criar um `supabase/functions/<nome>/index.test.ts` por função.

### Observações
- O critério (c) foi um preflight OPTIONS, que não altera dado e prova que o worker sobe (sem 503 BOOT_ERROR). Não exercita a lógica do POST. A lógica é coberta pelo smoke positivo/negativo do run 43189662194 (92/92 passed), que só existe para as funções do manifesto.
- Para (d) contei os testes estáticos de contrato que leem o fonte da função: ai-classify-tickets (`tests/contracts/_adv_edge_legacy_producers.test.ts:301-302`) e ai-enhance-message (`tests/contracts/ai-central-routing-ratchet.contract.test.ts:118`). Neste item só verifiquei que o arquivo de teste existe; não rodei `deno test`.

---

# Banco — inventário de produção (`tnnnlkbymytvtqngbbqh`)

Base: worktree `main` @ `81f67b0db`. Coleta 2026-11-12, só leitura (Management API `database/query/read-only`, MCP `SUPABASE - ZAPP WEB V2 - MCP` `db_query` só SELECT).

## Resumo

| item | status | prova |
|---|---|---|
| B1. Schemas expostos | OK | `GET /v1/projects/tnnnlkbymytvtqngbbqh/postgrest` HTTP 200 → `db_schema: "public,graphql_public"`; `graphql_public` tem 0 tabelas/views (query pg_class retornou só `public`). (`/config/postgrest` deu HTTP 404 `Cannot GET`; endpoint correto é `/postgrest`.) |
| B1. Tabelas com grant anon/authenticated têm RLS + ≥1 policy | OK | 211 tabelas em `public`; 187 com grant (has_table_privilege) → todas `relrowsecurity=true` e policies≥1; 0 violações (`bad=[]`). |
| B1. Tabelas sem policy (RLS on, 0 policies) | OK | 18 tabelas — todas sem nenhum grant a anon/authenticated (has_table_privilege=false para S/I/U/D); batem 1:1 com as 18 lints INFO `rls_enabled_no_policy` do advisor. |
| B1. Views expostas | OK | 13 views com grant a authenticated, todas `security_invoker=true/on` (reloptions) → herdam RLS das tabelas base; advisor sem `security_definer_view`. |
| B1. Grant a anon | OK | Recorte SELECT/INSERT/UPDATE/DELETE: só `password_reset_requests` (anon:INSERT) — RLS on, 5 policies. |
| B1b. MAINTAIN para anon | BLOQUEADO | `has_table_privilege('anon', oid, 'MAINTAIN')` = 104 relações de `public` (consulta de 2026-11-12). `information_schema.table_privileges` não lista MAINTAIN, por isso a amostragem B1 não pegou. Revogar é DDL de permissão em produção → decisão do dono. |
| B2. Advisor segurança — ERROR | OK | `GET .../advisors/security` HTTP 200: 220 lints, 0 ERROR. WARN=202, INFO=18. |
| B2. Advisor performance — ERROR | OK | `GET .../advisors/performance` HTTP 200: 860 lints, 0 ERROR. WARN=505, INFO=355. |
| B3. Migrations repo x ledger | BLOQUEADO | Em 2026-11-12 ~21h o ledger passou a 1106 versões (max `20261112160000 talkx_blacklist_reconcilia_e_higiene`) e a `main` `b2813f832` tem 1105 arquivos: a versão sobrando vem da PR [#3027](https://github.com/adm01-debug/Zapp_Web_V2/pull/3027), de outro agente, aberta e não mergeada (DDL aplicado antes do merge). Resolve quando a #3027 for mergeada. Medição anterior: `supabase/migrations/*.sql` (raiz; `_foreign/` 10 e `_superseded/` 13 ignorados por `docs/agentes/banco.md:90`) = 1105 arquivos, 1105 versões únicas, 0 sem prefixo; `supabase_migrations.schema_migrations` = 1105 versões (min 20251215024517, max 20261111181000). Faltando no banco: 0. Sobrando no banco: 0. |

## B2. Contagem de lints

| advisor | nível | lint | qtd |
|---|---|---|---|
| security | INFO | `rls_enabled_no_policy` | 18 |
| security | WARN | `auth_leaked_password_protection` | 1 |
| security | WARN | `authenticated_security_definer_function_executable` | 195 |
| security | WARN | `function_search_path_mutable` | 6 |
| performance | INFO | `auth_db_connections_absolute` | 1 |
| performance | INFO | `no_primary_key` | 10 |
| performance | INFO | `unindexed_foreign_keys` | 8 |
| performance | INFO | `unused_index` | 336 |
| performance | WARN | `auth_rls_initplan` | 428 |
| performance | WARN | `multiple_permissive_policies` | 77 |

WARN de segurança relevantes (não bloqueiam pela regra, só contados): `function_search_path_mutable` em `public.ai_is_canonical_priority`, `ai_is_canonical_sentiment`, `ai_text_array`, `ai_is_canonical_urgency`, `ai_is_canonical_churn_risk`, `copilot_sessions_updated_at`; `auth_leaked_password_protection` (Auth) desligado; 195× `authenticated_security_definer_function_executable`.

## B1. Detalhe por relação (schema `public`)

Legenda grants: `S/I/U/D` = SELECT/INSERT/UPDATE/DELETE via `has_table_privilege`; `—` = nenhum grant a anon/authenticated.

| relação | tipo | RLS | force | policies | grants anon/authenticated | status |
|---|---|---|---|---|---|---|
| `_rb_message_reactions_contato_20261007001008` | table | on | off | 0 | — | OK (sem grant) |
| `_rb_message_reactions_one_per_agent_20261107121000` | table | on | off | 1 | — | OK (sem grant) |
| `_zapp_fn_before` | table | on | off | 0 | — | OK (sem grant) |
| `_zapp_mig133_log` | table | on | off | 0 | — | OK (sem grant) |
| `agent_achievements` | table | on | off | 2 | auth:S,auth:I,auth:U,auth:D | OK |
| `agent_mini_game_xp_daily` | table | on | off | 0 | — | OK (sem grant) |
| `agent_presence` | table | on | off | 3 | auth:S,auth:I,auth:U,auth:D | OK |
| `agent_skills` | table | on | off | 2 | auth:S,auth:I,auth:U,auth:D | OK |
| `agent_stats` | table | on | off | 3 | auth:S,auth:I,auth:U,auth:D | OK |
| `agent_visibility_grants` | table | on | off | 2 | auth:S,auth:I,auth:U,auth:D | OK |
| `ai_budget_reservations` | table | on | off | 0 | — | OK (sem grant) |
| `ai_conversation_tags` | table | on | off | 5 | auth:S,auth:I,auth:U,auth:D | OK |
| `ai_jobs` | table | on | off | 0 | — | OK (sem grant) |
| `ai_model_prices` | table | on | off | 1 | auth:S,auth:I,auth:U,auth:D | OK |
| `ai_providers` | table | on | off | 4 | auth:S,auth:I,auth:U,auth:D | OK |
| `ai_usage_logs` | table | on | off | 3 | auth:S,auth:I,auth:U,auth:D | OK |
| `ai_usage_outbox` | table | on | off | 1 | — | OK (sem grant) |
| `allowed_countries` | table | on | off | 3 | auth:S,auth:I,auth:U,auth:D | OK |
| `app_settings` | table | on | off | 1 | auth:S,auth:I,auth:U,auth:D | OK |
| `audio_meme_favorites` | table | on | off | 1 | auth:S,auth:I,auth:U,auth:D | OK |
| `audio_memes` | table | on | off | 4 | auth:S,auth:I,auth:U,auth:D | OK |
| `audit_logs` | table | on | off | 4 | auth:S | OK |
| `auto_close_config` | table | on | off | 2 | auth:S,auth:I,auth:U,auth:D | OK |
| `automations` | table | on | off | 4 | auth:S,auth:I,auth:U,auth:D | OK |
| `away_messages` | table | on | off | 2 | auth:S,auth:I,auth:U,auth:D | OK |
| `blocked_countries` | table | on | off | 3 | auth:S,auth:I,auth:U,auth:D | OK |
| `blocked_ips` | table | on | off | 4 | auth:S,auth:I,auth:U,auth:D | OK |
| `business_hours` | table | on | off | 2 | auth:S,auth:I,auth:U,auth:D | OK |
| `calls` | table | on | off | 3 | auth:S,auth:I,auth:U,auth:D | OK |
| `campaign_ab_variants` | table | on | off | 4 | auth:S,auth:I,auth:U,auth:D | OK |
| `campaign_contacts` | table | on | off | 3 | auth:S,auth:I,auth:U,auth:D | OK |
| `campaigns` | table | on | off | 3 | auth:S,auth:I,auth:U,auth:D | OK |
| `catalog_favorites` | table | on | off | 1 | auth:S,auth:I,auth:U,auth:D | OK |
| `catalog_rate_limit_hits` | table | on | off | 0 | — | OK (sem grant) |
| `catalog_rate_limits` | table | on | off | 0 | — | OK (sem grant) |
| `catalog_send_events` | table | on | off | 2 | auth:S,auth:I | OK |
| `catalog_send_stats` | view | off | off | 0 | auth:S,auth:I,auth:U,auth:D | OK (view security_invoker) |
| `channel_connections` | table | on | off | 1 | auth:S,auth:I,auth:U,auth:D | OK |
| `channel_connections_safe` | view | off | off | 0 | auth:S,auth:I,auth:U,auth:D | OK (view security_invoker) |
| `channel_routing_rules` | table | on | off | 2 | auth:S,auth:I,auth:U,auth:D | OK |
| `chatbot_executions` | table | on | off | 2 | auth:S,auth:I,auth:U,auth:D | OK |
| `chatbot_flows` | table | on | off | 3 | auth:S,auth:I,auth:U,auth:D | OK |
| `client_wallet_rules` | table | on | off | 2 | auth:S,auth:I,auth:U,auth:D | OK |
| `connection_alert_preferences` | table | on | off | 4 | auth:S,auth:I,auth:U | OK |
| `connection_health_logs` | table | on | off | 3 | auth:S,auth:I,auth:U,auth:D | OK |
| `contact_block_audit` | table | on | off | 4 | auth:S | OK |
| `contact_custom_fields` | table | on | off | 4 | auth:S,auth:I,auth:U,auth:D | OK |
| `contact_deletion_audit` | table | on | off | 4 | auth:S | OK |
| `contact_identity_map` | table | on | off | 1 | auth:S,auth:I,auth:U,auth:D | OK |
| `contact_notes` | table | on | off | 4 | auth:S,auth:I,auth:U,auth:D | OK |
| `contact_protection_policy` | table | on | off | 4 | auth:S,auth:I,auth:U,auth:D | OK |
| `contacts` | table | on | off | 3 | auth:S,auth:I,auth:U,auth:D | OK |
| `conversation_analyses` | table | on | off | 2 | auth:S,auth:I,auth:U,auth:D | OK |
| `conversation_closures` | table | on | off | 2 | auth:S,auth:I,auth:U,auth:D | OK |
| `conversation_events` | table | on | off | 2 | auth:S,auth:I,auth:U,auth:D | OK |
| `conversation_memory` | table | on | off | 3 | auth:S,auth:I,auth:U,auth:D | OK |
| `conversation_sla` | table | on | off | 3 | auth:S,auth:I,auth:U,auth:D | OK |
| `conversation_snoozes` | table | on | off | 3 | auth:S,auth:I,auth:U,auth:D | OK |
| `conversation_tasks` | table | on | off | 5 | auth:S,auth:I,auth:U,auth:D | OK |
| `copilot_conversation_scores` | table | on | off | 3 | auth:S,auth:I,auth:U,auth:D | OK |
| `copilot_feedback` | table | on | off | 2 | auth:S,auth:I,auth:U,auth:D | OK |
| `copilot_help_requests` | table | on | off | 2 | auth:S,auth:I,auth:U,auth:D | OK |
| `copilot_insights` | table | on | off | 2 | auth:S,auth:I,auth:U,auth:D | OK |
| `copilot_learning_moments` | table | on | off | 2 | auth:S,auth:I,auth:U,auth:D | OK |
| `copilot_objection_catalog` | table | on | off | 2 | auth:S,auth:I,auth:U,auth:D | OK |
| `copilot_outcomes` | table | on | off | 2 | auth:S,auth:I,auth:U,auth:D | OK |
| `copilot_seller_settings` | table | on | off | 3 | auth:S,auth:I,auth:U,auth:D | OK |
| `copilot_sessions` | table | on | off | 2 | auth:S,auth:I,auth:U,auth:D | OK |
| `copilot_usage` | table | on | off | 2 | auth:S,auth:I,auth:U,auth:D | OK |
| `crisis_room_alerts` | table | on | off | 4 | auth:S,auth:I,auth:U,auth:D | OK |
| `crm_contact_links` | table | on | off | 2 | auth:S | OK |
| `crm_sync_outbox` | table | on | off | 1 | auth:S | OK |
| `csat_auto_config` | table | on | off | 2 | auth:S,auth:I,auth:U,auth:D | OK |
| `csat_surveys` | table | on | off | 3 | auth:S,auth:I,auth:U,auth:D | OK |
| `custom_emojis` | table | on | off | 4 | auth:S,auth:I,auth:U,auth:D | OK |
| `deal_activities` | table | on | off | 3 | auth:S,auth:I,auth:U,auth:D | OK |
| `department_audit_logs` | table | on | off | 1 | auth:S | OK |
| `department_invitations` | table | on | off | 2 | auth:S,auth:I,auth:U,auth:D | OK |
| `department_invites` | table | on | off | 3 | auth:S,auth:I,auth:U,auth:D | OK |
| `departments` | table | on | off | 2 | — | OK (sem grant) |
| `edge_rate_limits` | table | on | off | 0 | — | OK (sem grant) |
| `email_attachments` | table | on | off | 2 | auth:S,auth:I,auth:U,auth:D | OK |
| `email_labels` | table | on | off | 2 | auth:S,auth:I,auth:U,auth:D | OK |
| `email_messages` | table | on | off | 2 | auth:S,auth:I,auth:U,auth:D | OK |
| `email_signatures` | table | on | off | 4 | auth:S,auth:I,auth:U,auth:D | OK |
| `email_threads` | table | on | off | 3 | auth:S,auth:I,auth:U,auth:D | OK |
| `entity_versions` | table | on | off | 2 | auth:S,auth:I,auth:U,auth:D | OK |
| `favorite_contacts` | table | on | off | 4 | auth:S,auth:I,auth:U,auth:D | OK |
| `feature_flags` | table | on | off | 4 | auth:S,auth:I,auth:U,auth:D | OK |
| `followup_executions` | table | on | off | 2 | auth:S,auth:I,auth:U,auth:D | OK |
| `followup_sequences` | table | on | off | 2 | auth:S,auth:I,auth:U,auth:D | OK |
| `followup_steps` | table | on | off | 2 | auth:S,auth:I,auth:U,auth:D | OK |
| `geo_blocking_settings` | table | on | off | 2 | auth:S,auth:I,auth:U,auth:D | OK |
| `global_settings` | table | on | off | 2 | auth:S,auth:I,auth:U,auth:D | OK |
| `gmail_accounts` | table | on | off | 4 | auth:S,auth:I,auth:U,auth:D | OK |
| `gmail_accounts_safe` | view | off | off | 0 | auth:S,auth:I,auth:U,auth:D | OK (view security_invoker) |
| `gmail_oauth_states` | table | on | off | 0 | — | OK (sem grant) |
| `goals_configurations` | table | on | off | 2 | auth:S,auth:I,auth:U,auth:D | OK |
| `instance_pauses` | table | on | off | 1 | auth:S | OK |
| `ip_whitelist` | table | on | off | 2 | auth:S,auth:I,auth:U,auth:D | OK |
| `knowledge_base_articles` | table | on | off | 2 | auth:S,auth:I,auth:U,auth:D | OK |
| `knowledge_base_files` | table | on | off | 2 | auth:S,auth:I,auth:U,auth:D | OK |
| `link_preview_cache` | table | on | off | 0 | — | OK (sem grant) |
| `link_preview_cache_metrics` | table | on | off | 2 | auth:S,auth:I,auth:U,auth:D | OK |
| `login_attempts` | table | on | off | 4 | auth:S,auth:I,auth:U,auth:D | OK |
| `message_attempts` | table | on | off | 1 | auth:S | OK |
| `message_favorites` | table | on | off | 3 | auth:S,auth:I,auth:U,auth:D | OK |
| `message_pins` | table | on | off | 1 | auth:S,auth:I,auth:U,auth:D | OK |
| `message_reactions` | table | on | off | 5 | auth:S,auth:I,auth:U,auth:D | OK |
| `message_reports` | table | on | off | 2 | auth:S,auth:I,auth:U,auth:D | OK |
| `message_templates` | table | on | off | 4 | auth:S,auth:I,auth:U,auth:D | OK |
| `messages` | table | on | off | 3 | auth:S,auth:I,auth:U,auth:D | OK |
| `meta_capi_events` | table | on | off | 2 | auth:S,auth:I,auth:U,auth:D | OK |
| `mfa_sessions` | table | on | off | 1 | auth:S,auth:I,auth:U,auth:D | OK |
| `multiplix_audience_members` | table | on | on | 4 | auth:S,auth:I,auth:U,auth:D | OK |
| `multiplix_audiences` | table | on | on | 4 | auth:S,auth:I,auth:U,auth:D | OK |
| `multiplix_blocks` | table | on | on | 4 | auth:S,auth:I,auth:U,auth:D | OK |
| `multiplix_delivery_items` | table | on | off | 1 | auth:S | OK |
| `multiplix_dispatches` | table | on | on | 3 | auth:S,auth:D | OK |
| `multiplix_events` | table | on | off | 1 | auth:S | OK |
| `multiplix_recipients` | table | on | on | 2 | auth:S,auth:D | OK |
| `multiplix_voice_assets` | table | on | on | 1 | auth:S | OK |
| `multiplix_voice_grants` | table | on | on | 2 | auth:S | OK |
| `notifications` | table | on | off | 4 | auth:S,auth:I,auth:D | OK |
| `nps_surveys` | table | on | off | 4 | auth:S,auth:I,auth:U,auth:D | OK |
| `number_reputation` | table | on | off | 3 | auth:S,auth:I,auth:U,auth:D | OK |
| `outbox_events` | table | on | off | 1 | — | OK (sem grant) |
| `passkey_credentials` | table | on | off | 3 | auth:S,auth:I,auth:D | OK |
| `password_reset_requests` | table | on | off | 5 | anon:I,auth:S,auth:I,auth:U,auth:D | OK |
| `password_reset_requests_safe` | view | off | off | 0 | auth:S,auth:I,auth:U,auth:D | OK (view security_invoker) |
| `performance_snapshots` | table | on | off | 4 | auth:S,auth:I,auth:U,auth:D | OK |
| `permissions` | table | on | off | 2 | auth:S,auth:I,auth:U,auth:D | OK |
| `pinned_conversations` | table | on | off | 4 | auth:S,auth:I,auth:U,auth:D | OK |
| `playbooks` | table | on | off | 4 | auth:S,auth:I,auth:U,auth:D | OK |
| `products` | table | on | off | 3 | auth:S,auth:I,auth:U,auth:D | OK |
| `profiles` | table | on | off | 6 | auth:S,auth:I,auth:U,auth:D | OK |
| `profiles_public` | view | off | off | 0 | auth:S,auth:I,auth:U,auth:D | OK (view security_invoker) |
| `qr_attempts` | table | on | off | 1 | auth:S | OK |
| `query_telemetry` | table | on | off | 3 | auth:S,auth:I,auth:U,auth:D | OK |
| `queue_goals` | table | on | off | 2 | auth:S,auth:I,auth:U,auth:D | OK |
| `queue_members` | table | on | off | 2 | auth:S,auth:I,auth:U,auth:D | OK |
| `queue_positions` | table | on | off | 2 | auth:S,auth:I,auth:U,auth:D | OK |
| `queue_skill_requirements` | table | on | off | 2 | auth:S,auth:I,auth:U,auth:D | OK |
| `queues` | table | on | off | 2 | auth:S,auth:I,auth:U,auth:D | OK |
| `rate_limit_configs` | table | on | off | 2 | auth:S,auth:I,auth:U,auth:D | OK |
| `rate_limit_logs` | table | on | off | 2 | auth:S,auth:I,auth:U,auth:D | OK |
| `reconnection_logs` | table | on | off | 1 | auth:S | OK |
| `reminders` | table | on | off | 1 | auth:S,auth:I,auth:U,auth:D | OK |
| `role_permissions` | table | on | off | 2 | auth:S,auth:I,auth:U,auth:D | OK |
| `sales_deals` | table | on | off | 4 | auth:S,auth:I,auth:U,auth:D | OK |
| `sales_pipeline_stages` | table | on | off | 2 | auth:S,auth:I,auth:U,auth:D | OK |
| `saved_filters` | table | on | off | 5 | auth:S,auth:I,auth:U,auth:D | OK |
| `scheduled_messages` | table | on | off | 4 | auth:S,auth:I,auth:U,auth:D | OK |
| `scheduled_report_configs` | table | on | off | 4 | auth:S,auth:I,auth:U,auth:D | OK |
| `scheduled_reports` | table | on | off | 3 | auth:S,auth:I,auth:U,auth:D | OK |
| `search_events` | table | on | off | 0 | — | OK (sem grant) |
| `searchbox_budget_alert_cron` | table | on | off | 0 | — | OK (sem grant) |
| `searchbox_budget_alert_emails` | table | on | off | 0 | — | OK (sem grant) |
| `searchbox_usage_daily` | view | off | off | 0 | auth:S,auth:I,auth:U,auth:D | OK (view security_invoker) |
| `security_acl_alerts` | table | on | off | 1 | auth:S | OK |
| `security_alerts` | table | on | off | 3 | auth:S,auth:I,auth:U,auth:D | OK |
| `sicoob_contact_mapping` | table | on | off | 2 | auth:S,auth:I,auth:U,auth:D | OK |
| `sla_alert_events` | table | on | off | 1 | auth:S,auth:I,auth:U,auth:D | OK |
| `sla_alert_preferences` | table | on | off | 3 | auth:S,auth:I,auth:U,auth:D | OK |
| `sla_configurations` | table | on | off | 2 | auth:S,auth:I,auth:U,auth:D | OK |
| `sla_rules` | table | on | off | 4 | auth:S,auth:I,auth:U,auth:D | OK |
| `stickers` | table | on | off | 4 | auth:S,auth:I,auth:U,auth:D | OK |
| `talkx_alerts` | table | on | off | 1 | auth:S,auth:I,auth:U,auth:D | OK |
| `talkx_blacklist` | table | on | off | 5 | auth:S,auth:I,auth:U,auth:D | OK |
| `talkx_campaign_events` | table | on | off | 2 | auth:S,auth:I | OK |
| `talkx_campaign_metrics` | view | off | off | 0 | auth:S,auth:I,auth:U,auth:D | OK (view security_invoker) |
| `talkx_campaign_optouts` | view | off | off | 0 | auth:S,auth:I,auth:U,auth:D | OK (view security_invoker) |
| `talkx_campaign_segments` | table | on | off | 5 | auth:S,auth:I,auth:U,auth:D | OK |
| `talkx_campaigns` | table | on | off | 5 | auth:S,auth:I,auth:U,auth:D | OK |
| `talkx_contact_attributes` | table | on | off | 1 | auth:S | OK |
| `talkx_conversions` | table | on | off | 1 | auth:S | OK |
| `talkx_data_jobs` | table | on | off | 1 | auth:S | OK |
| `talkx_delivery_log` | table | on | off | 1 | auth:S,auth:I,auth:U,auth:D | OK |
| `talkx_engine_health` | view | off | off | 0 | auth:S,auth:I,auth:U,auth:D | OK (view security_invoker) |
| `talkx_help_views` | table | on | off | 2 | auth:S,auth:I | OK |
| `talkx_link_clicks` | table | on | off | 1 | auth:S | OK |
| `talkx_links` | table | on | off | 2 | auth:S | OK |
| `talkx_optout_keywords` | table | on | off | 2 | auth:S,auth:I,auth:U,auth:D | OK |
| `talkx_recipients` | table | on | off | 4 | auth:S,auth:I,auth:U,auth:D | OK |
| `talkx_segment_fields` | table | on | off | 2 | auth:S | OK |
| `talkx_segment_library_history` | table | on | off | 1 | auth:S | OK |
| `talkx_segment_versions` | table | on | off | 1 | auth:S | OK |
| `talkx_segments` | table | on | off | 4 | auth:S,auth:I,auth:U,auth:D | OK |
| `talkx_settings` | table | on | off | 2 | auth:S,auth:I,auth:U,auth:D | OK |
| `talkx_storage_purge_queue` | table | on | off | 0 | — | OK (sem grant) |
| `talkx_suppression_reasons` | table | on | off | 3 | auth:S | OK |
| `talkx_template_variants` | table | on | off | 4 | auth:S,auth:I,auth:U,auth:D | OK |
| `talkx_template_versions` | table | on | off | 1 | auth:S | OK |
| `talkx_templates` | table | on | off | 4 | auth:S,auth:I,auth:U,auth:D | OK |
| `talkx_test_send_claims` | table | on | off | 0 | — | OK (sem grant) |
| `talkx_test_sends` | table | on | off | 2 | — | OK (sem grant) |
| `team_chat_media_acl_r2_db_020_rb` | table | on | off | 0 | — | OK (sem grant) |
| `team_conversation_members` | table | on | off | 4 | auth:S,auth:I,auth:D | OK |
| `team_conversations` | table | on | off | 4 | auth:S,auth:I,auth:D | OK |
| `team_message_reactions` | table | on | off | 5 | auth:S,auth:I,auth:U,auth:D | OK |
| `team_message_read_state` | view | off | off | 0 | auth:S,auth:I,auth:U,auth:D | OK (view security_invoker) |
| `team_message_receipts` | table | on | off | 3 | auth:S,auth:I,auth:U | OK |
| `team_messages` | table | on | off | 4 | auth:S,auth:I,auth:D | OK |
| `training_sessions` | table | on | off | 4 | auth:S,auth:I,auth:U,auth:D | OK |
| `user_devices` | table | on | off | 5 | auth:S,auth:I,auth:U,auth:D | OK |
| `user_roles` | table | on | off | 2 | auth:S,auth:I,auth:U,auth:D | OK |
| `user_service_accounts` | table | on | off | 5 | auth:S,auth:I,auth:U,auth:D | OK |
| `user_sessions` | table | on | off | 4 | auth:S,auth:I,auth:U,auth:D | OK |
| `user_settings` | table | on | off | 3 | auth:S,auth:I,auth:U,auth:D | OK |
| `voice_command_logs` | table | on | off | 3 | auth:S,auth:I,auth:U,auth:D | OK |
| `voip_profile_credentials` | table | on | off | 0 | — | OK (sem grant) |
| `warroom_alerts` | table | on | off | 4 | auth:S,auth:I,auth:U,auth:D | OK |
| `webauthn_challenges` | table | on | off | 2 | auth:S,auth:I,auth:U,auth:D | OK |
| `webhook_failures` | table | on | off | 1 | — | OK (sem grant) |
| `webhook_rate_limits` | table | on | off | 4 | auth:S,auth:I,auth:U,auth:D | OK |
| `whatsapp_connection_queues` | table | on | off | 2 | auth:S,auth:I,auth:U,auth:D | OK |
| `whatsapp_connections` | table | on | off | 4 | auth:S,auth:I,auth:U,auth:D | OK |
| `whatsapp_connections_agent` | view | off | off | 0 | auth:S,auth:I,auth:U,auth:D | OK (view security_invoker) |
| `whatsapp_connections_public` | view | off | off | 0 | auth:S,auth:I,auth:U,auth:D | OK (view security_invoker) |
| `whatsapp_connections_safe` | view | off | off | 0 | auth:S,auth:I,auth:U,auth:D | OK (view security_invoker) |
| `whatsapp_flows` | table | on | off | 2 | auth:S,auth:I,auth:U,auth:D | OK |
| `whatsapp_groups` | table | on | off | 2 | auth:S,auth:I,auth:U,auth:D | OK |
| `whatsapp_templates` | table | on | off | 3 | auth:S,auth:I,auth:U,auth:D | OK |
| `whisper_messages` | table | on | off | 4 | auth:S,auth:I,auth:D | OK |

## Observações

- `public.departments`: RLS on, 2 policies, mas **nenhum** grant a authenticated/anon — leitura direta pelo PostgREST falha com permission denied. Não é violação de RLS; fora do escopo desta categoria checar se o front lê essa tabela direto.
- Mesma situação (2 policies sem grant): `talkx_test_sends`; 1 policy sem grant: `_rb_message_reactions_one_per_agent_20261107121000`, `ai_usage_outbox`, `outbox_events`, `webhook_failures`.
- Tabelas de backup/rollback em `public` (`_rb_*`, `_zapp_fn_before`, `_zapp_mig133_log`, `team_chat_media_acl_r2_db_020_rb`) sem grant — seguras, mas são lixo exposto no schema da API.

---

## GitHub Actions — inventário por workflow (main @ 81f67b0db)

Fonte: `GET /repos/adm01-debug/Zapp_Web_V2/actions/workflows` (29 registros; 28 `active` + `auto-update-pr-branch.yml` `disabled_manually`), runs via `GET /actions/workflows/<id>/runs`, jobs via `GET /actions/runs/<id>/jobs`, logs via `GET /actions/jobs/<id>/logs` e artefatos baixados. Consulta feita em 2026-11-12 ~14:20 UTC. Arquivos citados = worktree limpo em `81f67b0db`.

Resultado: **29 itens · 25 OK · 4 BLOQUEADO** (28 workflows ativos + 1 linha à parte para o agendamento do `db-live-guard`). Em 14/11 o `e2e-logado.yml` (run 43540368513) e o `e2e-logado-isolado.yml` (suíte completa, run 43540540725) passaram de BLOQUEADO a OK; a prova de rede `network-proof-contexts` continua registrada como achado na seção 5.

| item | estado | prova |
|---|---|---|
| ci.yml (CI/CD Pipeline) | OK | run main `43224335325` (push, 81f67b0db) `completed/success` 14:19Z. Os 10 últimos runs da main estão todos verdes. |
| db-guard.yml | OK | run main `43224335290` (push, 81f67b0db) `success`. Os 10 últimos runs da main estão verdes. |
| deploy-functions.yml | OK | run main `43189662194` (push, 6f90c9332) `success`. Os 8 últimos estão verdes. |
| codeql.yml | OK | run `43192262198` (schedule, 2026-11-12 09:31) `success`. Os 8 últimos, diários, estão verdes. |
| front-release-targets.yml | OK (com falha intermitente) | Runs `43257829418` (cfa8959b9) e `43288958082` (cca5655b8) `failure` no step "Confirmar release V2 no alias Vercel": o agendado demora na fila e compara o alias com o SHA antigo do agendamento (`scripts/vercel/verify-release-targets.mjs`). Último run `43318816243` (b2813f832, 22:19Z) `success`. |
| talkx-status-regen.yml | OK | run `43224335250` (push, 81f67b0db) `success`. |
| settings-guard.yml | OK | run `43174279420` (schedule, 2026-11-12 07:18) `success`. Os 8 últimos estão verdes. |
| branch-hygiene-audit.yml | OK | run `42582604190` (schedule, 2026-11-09) `success`. O cron de 02/11 (`41409678874`) também está verde. |
| inventario-estado-semanal.yml | OK | run `42600911030` (schedule, 2026-11-09) `success`. |
| types-sync.yml | OK | último run `43204745973` (dispatch, 0a1e73f2a, 10:56Z) `success`. Os 7 runs anteriores falharam (`43197369978`…`43121058346`); o run verde seguinte encerrou a série. |
| db-live-guard.yml (última execução) | OK | run `42678012070` (dispatch, fe6c6b0bf, 2026-11-09) `success`. Desde 20/10: 7 dispatches verdes e 1 cancelado. |
| db-live-guard.yml (agendamento semanal) | BLOQUEADO | O cron `'13 6 * * 1'` está em `.github/workflows/db-live-guard.yml:20-21` e também nos commits `4b9585052`, `c543c6ade`, `d96e1e71e` e `49af49e25`. Mesmo assim, o último run `event=schedule` é `39212157834` (2026-10-19, `failure`). Não há run agendado em 26/10, 02/11 ou 09/11. No mesmo período, outros crons de segunda dispararam: types-sync `42569740842` e `41396453042`, talkx-status-regen `42581410513`. Causa não identificável pela API pública: o histórico de habilitar/desabilitar está no audit log, que exige admin. Na prática, a guarda viva semanal do banco só roda quando alguém dispara à mão. |
| e2e-logado.yml | OK | **14/11:** run `43540368513` (workflow_run, main `a97aeacf5`, já com o pacote #3046) `success` nos 5 grupos (authenticated-1/2/3-of-3, deslogado-principal, deslogado-secundario) e "Recuperacao da suite logada" `success`; o anterior `43528057385` (`098a648f6`) também `success`. A causa abaixo (retries estourando o teto de 55 min) foi corrigida pela #2991 e a falha de navegação pelos #3025/#3026 (no pacote #3035). Histórico anterior (até 12/11): Gatilho: `workflow_run` do CI na main (`.github/workflows/e2e-logado.yml:12-17`). **Até 12/11, desde que virou `workflow_run`, nunca tinha passado:** `?event=workflow_run&status=success` retorna `total_count 0`, e o último verde da main é `37040113129` (push, 2026-10-02). Último run concluído: `43216785856` (d8854eb31) `failure`. Os shards 1-of-3, 3-of-3 e os dois deslogados passaram. O job `131186396197` (`authenticated-2-of-3`) rodou de 12:39 a 13:40: a etapa `real-browser-suite` foi de 12:45:36 a 13:40:36, exatamente 55 min, e terminou com `{"code":"browser-suite-failed","report_ready":true}`. No artefato, `browser-result-diagnostic.json` traz `"signal":"SIGPIPE","error_code":"ETIMEDOUT","report":{"read":"missing"}`, e `browser-suite.log` termina em `navegacao-modulos.spec.ts:1329 … (retry #2)`. **Causa raiz:** cada tentativa tem `test.setTimeout(22 * 60_000)` (`e2e/navegacao-modulos.spec.ts:1335`). Com `RETRIES_LOGADOS = process.env.CI ? 2 : 0` (`playwright.config.ts:26`), são 3 tentativas, cerca de 66 min. Isso passa do teto `55 * 60_000` do controller (`scripts/e2e-isolated/run.mjs:190`), que mata o Playwright antes do relatório. Por isso a falha real da 1ª tentativa fica invisível. Os 500 de `gmail-oauth` (`GOOGLE_CLIENT_ID is not configured`, edge.log) e os 503 de `get-sip-password` aparecem no log, mas a spec já os prevê (`navegacao-modulos.spec.ts:228,280`); não são a causa. **Correção = código (PR normal):** a PR #2991 (`claude/fix-e2e-navegacao-sem-retry-261112-0938`, head `04ba509d4`, aberta, 15 checks verdes e o `CI Gate` em andamento) põe `retries: 0` na spec. Depois disso o erro real da 1ª tentativa ainda precisa ser lido e corrigido. Em andamento: `43223919080` (65cf385, shards 1 e 2 ainda rodando) e `43235977461` (81f67b0, pendente). |
| e2e-logado-isolado.yml | OK (suíte completa) / achado (`network-proof-contexts`) | **14/11:** dispatch `scope=full-suite` na `main` `a97aeacf5` (com o pacote #3046), run 43540540725 attempt 2 → `success` nos 5 grupos (authenticated-1/2/3-of-3, deslogado-principal, deslogado-secundario). Na attempt 1, 1 de 27 testes de telefonia falhou só no Firefox (`e2e/telefonia.spec.ts:283`, 1º clique do teclado não registrou); o mesmo grupo passou no `e2e-logado.yml` no mesmo SHA (run 43540368513, `success`) e na reexecução única. Histórico anterior (até 13/11, já superado pelo run de 14/11): Gatilhos: `workflow_dispatch` + `pull_request` com paths (`.github/workflows/e2e-logado-isolado.yml:10-31`). Pelo gatilho de PR está verde: `43219155880` `success`, e os 7 runs de PR seguintes também. O dispatch anterior na main, `42827413676` (be1c0c7eb, 2026-11-10), foi `failure`. Falhou o job `129868381361` "Medir conectividade nativa", com `ZAPP_PROOF_SCOPE: network-proof-contexts` e `{"status":"failed","native_online_all":false,"test_default_online_all":false}`. O `report.json` do artefato `13770008520` mostra `failure_code: contexts-proof-failed`: chromium e webkit com `native.online=false`, firefox com `true`, na topologia `loopback-only`. O código vem de `scripts/e2e-isolated/network-contexts.mjs:57`, agregado em `network-contexts-policy.mjs:82-83`. É uma prova de diagnóstico de rede, não a suíte. O dispatch verde anterior na main era `42146525683` (2026-11-06). **Correção = código (PR normal)** em `scripts/e2e-isolated/`: tratar `navigator.onLine=false` do Chromium/WebKit sem rota externa. Antes disso, um dispatch `scope=full-suite`/`login` na main daria uma prova verde atual. |
| db-migrate.yml | BLOQUEADO | Gatilho: só `workflow_dispatch` (`.github/workflows/db-migrate.yml:33-53`), job com `environment: producao-ddl` (`:75`). Último run: `41384024756` (2026-11-02, e31de44cc) `cancelled`. O job `125080780081` não tem nenhum step, o log já expirou (`BlobNotFound`) e não há artefato. O deployment `7483649920` do ambiente `producao-ddl` ficou `waiting` às 03:36:36 e passou a `error` às 03:42:17. **Causa:** o run ficou parado na aprovação do ambiente protegido `producao-ddl` e foi cancelado ou rejeitado sem executar nada. Último verde: `37355720430` (2026-10-05); o run seguinte, `37355980323`, falhou em "Validar registro no ledger". **Correção = dono:** aprovação de ambiente e apply em produção são dele (AGENTS.md: DDL em produção). Nada a corrigir no código. |
| crm-sync-worker.yml | BLOQUEADO | O cron está comentado (`.github/workflows/crm-sync-worker.yml:32-33`); sobra `workflow_dispatch` (`:34`). O job tem `if: github.event_name == 'workflow_dispatch' \|\| vars.CRM_SYNC_WORKER_ENABLED == 'true'` (`:55`). Último run: `35717413825` (schedule, 2026-09-22) `skipped`, um dos 1635 runs, quase todos `skipped`. O único verde é `34346349408` (dispatch, 2026-09-09). O próprio arquivo diz "decisao pendente do dono (W93)" (`:7`) e "vars.CRM_SYNC_WORKER_ENABLED nao existe" (`:15`). Não deu para ler as variáveis do repo (proxy: "Access to this GitHub Actions path is not permitted"). **Correção = dono:** decidir se o CRM sync entra em operação (variável + cron, roteiro em `docs/runbooks/CRM_INTEGRATION_ROLLOUT.md`). |
| contexto.yml | BLOQUEADO | Último run concluído: `43232256505` `cancelled`. Ele e `43230674425`, `43227547843` e `43225329121` foram todos cancelados com 0 jobs: ficaram pendentes no grupo `concurrency: contexto` com `cancel-in-progress: false` (`.github/workflows/contexto.yml:57-59`) e o GitHub os trocou por pendentes mais novos. Último run executado: `43222761393` `success` (65cf385). A branch `origin/contexto` está em `4d4b44868` ("@ main 65cf385", 13:39Z), mas a main está em `81f67b0db` (13:07Z), então o contexto não reflete o HEAD. O run `43229057756` esperou 24 min por runner: o job "O que precisa rodar" foi criado 13:40:01 e começou 14:04:07, e os 3 produtores seguem `queued`. Fila do repo: 13 runs `queued` e 9 `in_progress`. **Causa:** a fila de runners está saturada pelos runs de PR. Não é defeito do workflow. **Correção:** nenhuma no código; resolve quando a fila esvaziar. Se repetir, reduzir o cron `3-59/10` (`contexto.yml:45`); isso mexe em workflow, então cabe ao dono. |
| e2e-talkx.yml | OK | Gatilho `pull_request` com paths + dispatch (`.github/workflows/e2e-talkx.yml:26-44`). Único run na main: `42144001711` (dispatch) `success`. As falhas recentes são de PRs de branch (`43228596312`, `43212627282`), fora da main. |
| check-talkx-pr-body.yml | OK | Só roda em `pull_request` (`.github/workflows/check-talkx-pr-body.yml:10-13`), então não tem run na main. Último run: `43230461922` `success`. |
| notifica-falha-main.yml | OK | Gatilho `workflow_run` (`.github/workflows/notifica-falha-main.yml:10-22`) com `if: github.event.workflow_run.conclusion == 'failure'` (`:35`). O `skipped` do baseline (`43229875089`) é o comportamento esperado quando o upstream não falhou. Última execução real: `43229623007` (81f67b0db) `success`. |
| targeted-ledger-evidence.yml | OK | Só `workflow_dispatch` (`:10-20`). Último run: `36041611976` (2026-09-24) `success`; os 4 runs estão verdes. |
| vercel-env-cleanup.yml | OK | Só `workflow_dispatch` (`:16-24`). Último run: `42644793494` (2026-11-09) `success`; os 4 runs estão verdes. |
| automation-local.yml | OK (registro órfão) | Registrado como `active` (id 413366359), mas o arquivo não está na main: `git ls-tree HEAD .github/workflows/` não o lista. Veio da PR #2926, `closed` sem merge. Só tem 2 runs, de `pull_request` na branch dela, ambos `success` (`42836236326`). Não roda na main. |
| patch-plano.yml | OK (registro órfão) | Registrado como `active` (id 399286549), sem arquivo na main nem no histórico raso. Run único: `40674519047`, dispatch na branch `claude/sharp-faraday-qfortu`, `success`. Não roda na main. |
| talkx-pr-body.yml | OK (registro órfão) | Registrado como `active` (id 391099676), sem arquivo na main; quem faz o papel dele hoje é `check-talkx-pr-body.yml`. Run único: `39958689471`, PR de 2026-10-23, `success`. |
| dynamic/copilot-pull-request-reviewer | OK | Workflow dinâmico do GitHub, roda só em PR. Dos 10 últimos runs, 9 são `success`. O mais recente, `43137464897` (branch `claude/fix-esm-supabase-import-261108-2320`), falhou na infra do próprio GitHub: `curl: (22) … error: 401` ao baixar `copilot-developer-action` (job `130916136598`). Os runs seguintes do mesmo workflow, em outras PRs, estão verdes. Nada no repo a corrigir. |
| dynamic/copilot-swe-agent/copilot | OK | Workflow dinâmico. O baseline dizia `sem-run`, mas a API mostra 16 runs; o último é `43136275066` (2026-11-12) `success`. |
| dynamic/dependabot/dependabot-updates | OK | Último run: `42633016817` (2026-11-09) `success`. |
| dynamic/dependabot/update-graph | OK | Último run: `41632838492` (2026-11-03) `success`. |

### Fora da contagem
- `auto-update-pr-branch.yml` está `disabled_manually` (id 366925501), embora o próprio arquivo diga "Reativado em 23/10/2026" (`.github/workflows/auto-update-pr-branch.yml:27`). O último run, `43020893736` (2026-11-11 12:30), foi `success`, então foi desabilitado depois disso. Pela API pública não dá para saber quem desabilitou nem por quê. Cabe ao dono decidir se reativa ou se corrige o comentário.

---

## Integrações externas

Coleta: 2026-11-12 ~14:25 UTC. Base: `main` @ `81f67b0db` (worktree limpo). Produção `tnnnlkbymytvtqngbbqh` só leitura (SELECT via MCP `SUPABASE - ZAPP WEB V2 - MCP`; Management API só GET; nenhum valor de segredo lido ou impresso — só nomes, `updated_at` e comparação de digest de URLs públicas).

**Placar: 15 itens — 8 OK, 7 BLOQUEADO.**

| item | estado | prova |
|---|---|---|
| WhatsApp — conexão real `PRINCIPAL` (Evolution GO) | BLOQUEADO | `whatsapp_connections` (`instance_id='PRINCIPAL'`, `is_default=true`): `status=disconnected`, `health_status=disconnected`, `retry_count=3`, `health_reason="Reconexão automática esgotada — gere um novo QR Code na tela Conexões."`, `last_health_check=2026-11-12T14:22:03Z`. `connection_health_logs` 24h: 288/288 checks `disconnected`; nenhum `connected` em toda a tabela (log mais antigo 2026-11-05T14:27 já `disconnected`). `messages` últimos 7 dias: só 3 linhas, todas `sender=agent, status=failed` (última 2026-11-12T13:47) — nenhuma mensagem recebida. **Falta: o dono escanear o QR em Conexões** (runbook `docs/agentes/evolution-go.md:21-36`). |
| Evolution GO — API alcançável + pipeline de health-check | OK | Edge `connection-health-check` ACTIVE v605 e `evolution-api` ACTIVE v610 (`GET /v1/projects/.../functions`); cron `connection-health-check` 288/288 `succeeded` em 24h; último check respondeu em `health_response_ms=1079` com status de sessão (`disconnected`), não erro de rede; secrets presentes: `EVOLUTION_API_FLAVOR, EVOLUTION_API_KEY, EVOLUTION_API_URL, EVOLUTION_INSTANCE_NAME, EVOLUTION_INSTANCE_TOKEN, EVOLUTION_WEBHOOK_SECRET`; `webhook_failures` 7d = 0 linhas. |
| Fixture E2E `[E2E] Conexão WhatsApp Teste` | OK | Linha presente em `whatsapp_connections` (`instance_id=E2E_FIXTURE`, `status=connected`, `updated_at=2026-09-28T20:21`). Não tocada. Obs.: o status é carimbo da fixture, não sessão viva. |
| Gmail — secrets OAuth em produção | OK | `GET /v1/projects/tnnnlkbymytvtqngbbqh/secrets` → HTTP 200, 37 nomes, inclui `GOOGLE_CLIENT_ID` (upd 2026-08-28), `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`. Edge `gmail-oauth` ACTIVE v603 lê exatamente esses 3. |
| Gmail — conta conectada sincronizando | BLOQUEADO | `gmail_accounts_safe`: 1 conta `is_active=true`, `sync_status=reauth_required`, `last_error="Sessão do Gmail expirada — reconecte a conta: Gmail token refresh rejected (400): {"error": "invalid_grant" ..."`, `token_expires_at=2026-10-26`. `email_messages` última 2026-10-08T17:30 (nada novo há ~5 semanas). Cron `gmail-incremental-sync` roda 288/288 OK, mas não há token válido. **Falta: o dono reconectar a conta Google na tela de E-mail.** |
| Telefonia SIP (softphone) | BLOQUEADO | Secret `SIP_PASSWORD` **ausente** da lista de 37 secrets. `supabase/functions/get-sip-password/index.ts:73-77`: sem ele responde `503 {code:'SIP_NOT_CONFIGURED'}`. Tabela `calls`: últimas `voip` = 10 `failed` (última 2026-09-26), 2 `ended` (2026-09-05). **Falta: credencial SIP da linha (dono) gravada como secret de edge.** |
| Reconciliação de chamadas (Bitrix) | BLOQUEADO | Secret `BITRIX_WEBHOOK_URL` **ausente**. `supabase/functions/sync-call-records/index.ts:163-166`: sem ele devolve `reconciliados: 0, motivo: "BITRIX_WEBHOOK_URL nao configurado"`. **Falta: URL do webhook Bitrix (dono).** |
| CRM externo `pgxfvjmuubtbowutlide` — projeto e apontamento | OK | `GET /v1/projects/pgxfvjmuubtbowutlide/health` → HTTP 200, `db` e `rest` `ACTIVE_HEALTHY`. Digest SHA-256 de `EXTERNAL_SUPABASE_URL` = `https://pgxfvjmuubtbowutlide.supabase.co` (match `True`). Edge `crm-integration` ACTIVE v554. |
| CRM — fila de sincronização (outbox) | BLOQUEADO | `crm_sync_outbox`: **474 `pending`** criados 2026-09-26→2026-10-05, `attempt_count=0`, nenhum travado; 6 `failed` + 1 `dead_letter` com `CRM_NOT_SYNCED`; `crm_contact_links` = 0. Causa: cron `crm-sync-outbox` executa `public.trigger_crm_sync_outbox()`, que retorna 0 quando `crm_sync_outbox_cron_enabled()` é false — e é false: flag `crm.integration=true`, mas `vault.secrets` não tem `crm_sync_outbox_url` (0) nem `crm_sync_outbox_cron_secret` (0). O cron aparece 720/720 "succeeded" mas não chama nada. **Falta: criar os 2 segredos no Vault (segredo → só com o dono).** |
| Catálogo `doufsxqlfjyuvxuezpln` | OK | `GET /v1/projects/doufsxqlfjyuvxuezpln/health` → HTTP 200, `db`/`rest` `ACTIVE_HEALTHY`. Digest de `PROMOGIFTS_SUPABASE_URL` = `https://doufsxqlfjyuvxuezpln.supabase.co` (match `True`); `PROMOGIFTS_SUPABASE_SERVICE_ROLE_KEY` presente; edge `promogifts-catalog` ACTIVE v623. Uso: `catalog_send_events` 1 `sent` (2026-10-11), 1 `failed` (2026-10-02). |
| IA — configuração (provedores, chaves, orçamento) | OK | `ai_providers` ativos: DeepSeek (`deepseek-v4-flash`, default, `DEEPSEEK_API_KEY`), GLM (`glm-5.3`, `GLM_API_KEY`), OpenRouter (`google/gemini-3.8-flash`, `OPENROUTER_API_KEY`); os 3 secrets existem. Orçamento: funções `ai_budget_reserve/settle/release/reconcile` existem; `ai_budget_reservations` 6 linhas, todas `released` (nenhuma presa); cron `searchbox-budget-alert` 1/1 OK; `ai_usage_outbox` 4 processadas, 0 pendentes. |
| IA — chamada real a provedor LLM | BLOQUEADO | `ai_usage_logs`: último `success` de `ai-proxy` em 2026-09-15. Depois: OpenRouter `HTTP 402` (2026-10-01, sem crédito), DeepSeek `HTTP 402` (2026-09-30) e `HTTP 401` (2026-10-02 voice-agent, 2026-10-05 ai-proxy). `DEEPSEEK_API_KEY` foi trocada em 2026-10-06T11:56, mas **nenhuma chamada LLM registrada desde então** (30 dias: só ElevenLabs). Provar exige invocar `ai-proxy`, que grava `ai_usage_logs` e gasta crédito — proibido nesta varredura. `ai_jobs` 7d = 0. **Falta: 1 chamada real autorizada; crédito OpenRouter (dono).** |
| IA voz — ElevenLabs TTS | BLOQUEADO | `ai_usage_logs`: `elevenlabs-tts` `error` "ElevenLabs HTTP 401" (2026-11-07T20:25, modelo `eleven_v3`); `elevenlabs-scribe-token` 7 `success` (último 2026-11-10). Mesma `ELEVENLABS_API_KEY` (upd 2026-08-27) funciona para STT e não para TTS → permissão/plano da chave. **Falta: dono revisar escopo/plano da chave ElevenLabs.** |
| Vercel — deploy de produção do último commit da `main` | BLOQUEADO (desatualizado — ver auditoria; revalidar no fechamento) | `GET /v6/deployments?projectId=prj_J4wb8egzz8iL1CJnSOXJDtqnbvRp&teamId=...&target=production&limit=3` → `dpl_DnngsBgz7em3qwXDjXnmwRh2JfbF` **READY**, sha `81f67b0db663d171686a85a1549e43099258d01c` (2026-11-12T13:07 UTC); `git ls-remote ... refs/heads/main` = mesmo sha. `https://zapp-web-v2.vercel.app/` HTTP 200; `/version.json` → `{"buildId":"81f67b0db663..."}`. Anteriores READY: `65cf385`, `d8854eb`. |
| Cron jobs (pg_cron) | OK | `cron.job`: 27 jobs, 27 ativos. `cron.job_run_details` 24h: 9.803 execuções, **0 `failed`** (ex.: `dispatch-scheduled-messages` 1440/1440, `talkx-scheduler-1min` 1440/1440, `connection-health-check` 288/288). `net._http_response` (janela 08:25–14:24 UTC): 1.260 respostas, todas HTTP 200. Ressalva: "succeeded" não garante efeito — ver CRM outbox (no-op). |

### Bloqueios que dependem do dono
1. Escanear QR do WhatsApp `PRINCIPAL` (desconectado desde ≤2026-11-05; atendimento por WhatsApp parado).
2. Reconectar a conta Gmail (`invalid_grant`).
3. Fornecer `SIP_PASSWORD` e `BITRIX_WEBHOOK_URL`.
4. Criar no Vault `crm_sync_outbox_url` e `crm_sync_outbox_cron_secret` (474 fechamentos não enviados ao CRM).
5. Crédito OpenRouter + autorizar 1 chamada de teste de IA; revisar plano/escopo ElevenLabs (TTS 401).

---

## Produção ao vivo (desde o último deploy)

Coleta: 2026-11-12 ~14:27–14:35 UTC. Janela de logs: últimas 24h (≈ 2026-11-11 14:30 → 2026-11-12 14:30 UTC).
Tudo somente leitura (GET/OPTIONS, SELECT, Management API logs). Nenhuma escrita, nenhuma edge que altere dado.

**Resultado:** 12 itens · 10 OK · 2 BLOQUEADO. Front e edges no ar com o último commit da `main`; 3 problemas reais em produção (abaixo).

| item | status | prova |
|---|---|---|
| 1a. Último deploy do front (Vercel) | OK | `GET /v6/deployments?projectId=prj_J4wb…&target=production&limit=5` → mais novo `dpl_GfjzQRibwcHtwpYDMsJdJAWzNWuo` `READY`, `target=production`, sha `cfa8959b9035e745d5f997e16f2ca51e76bee376` (= HEAD de `main`, `GET /repos/.../commits/main` → mesmo sha, "fix(e2e): navegação sem retry… (#2991)", 14:25:10Z). Alias `zapp-web-v2.vercel.app` → `GET /v4/aliases/zapp-web-v2.vercel.app` → `deploymentId=dpl_GfjzQRibwcHtwpYDMsJdJAWzNWuo`. `GET https://zapp-web-v2.vercel.app/version.json` → `{"buildId":"cfa8959b9035e745d5f997e16f2ca51e76bee376"}`. Build: 593 stdout / 18 stderr, só warnings (Tailwind classe ambígua `motion-safe:duration-[120ms]`, chunk >1200 kB, Node 26.x em vez de 24.x por `engines: ">=24"`), "Build Completed [17s]". O worktree base `81f67b0db` = deploy anterior `dpl_DnngsBgz7em3qwXDjXnmwRh2JfbF` READY. |
| 1b. Último run do `deploy-functions.yml` | OK | `GET /actions/workflows/deploy-functions.yml/runs?per_page=5` → `43189662194` push/main sha `6f90c9332` `completed/success` 2026-11-12T09:14:10Z (https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/43189662194); os 5 últimos são `success`. Edges estão atuais: `git diff --name-only 6f90c9332 cfa8959b9 -- supabase/functions` → vazio (10 commits depois, nenhum toca edge). |
| 2a. Erros de runtime na Vercel | BLOQUEADO | MCP `get_runtime_errors` e `get_runtime_logs` → `403 forbidden: "The specified project does not exist or you do not have access."` (requestId `…jwbdc-1794493668356…`). REST `GET /v1/projects/prj_J4wb…/deployments/dpl_Gfjz…/runtime-logs` → `curl: (28) Operation timed out after 25001 ms with 0 bytes received`. Falta: token Vercel com escopo de Observability/logs. Contexto: o deploy só tem a saída estática (`lambdas: [('.', 'READY')]`, `functions: None`, repo sem `api/`), então não há função serverless que gere erro de runtime; os erros do navegador estão no item 2d. |
| 2b. Endpoint de logs da Management API | OK | `GET /v1/projects/tnnnlkbymytvtqngbbqh/analytics/endpoints/logs.all` → `HTTP 410 {"message":"The logs.all endpoint has been removed. Use GET /v1/projects/{ref}/analytics/endpoints/logs instead…"}`. O substituto `…/analytics/endpoints/logs` (ClickHouse, tabela única `logs`, filtro por `source`) funciona → HTTP 200 nos itens 2c/2e. Obs.: rajadas de consultas → `429 ThrottlerException: Too Many Requests`. |
| 2c. Erros de edge function (24h) | OK (com achados) | `select log_attributes['response.status_code'] st, count() … from logs where source='function_edge_logs' group by st` → 200:6966, 401:2110, **503:36, 502:3, 520:1, 500:1**, 404:22, 409:10, 410:4, 204:35. 5xx por rota: **`/functions/v1/get-sip-password` 503 ×36 + 500 ×1** (primeiro 2026-11-11T16:14:48, último **2026-11-12T14:26:46**, depois do deploy); `multiplix-audience` 502 ×3 (último 11:52:37); `talkx-scheduler` 520 ×1 (2026-11-11T18:50). Causa em `function_logs`: `{"fn":"get-sip-password","msg":"SIP_PASSWORD is not configured"}` (último 14:26:46) → segredo `SIP_PASSWORD` ausente na edge; `multiplix-audience`: `"Singu request failed" status 502` + `code MULTIPLIX_RPC ok:false`. Outros ERROR: `[Evolution GO] rota de instância sem credencial resolvida (/chat/sendPresence/E2E_FIXTURE)` ×11; `[instance-token] PRINCIPAL: sem token no Vault — fallback EVOLUTION_INSTANCE_TOKEN (remover em E21)` ×9; `gmail-sync completed 409 reauth_required:true` ×2. |
| 2d. Erros sem log de plataforma (pg_net, cron, dead-letter, erro de front) | OK | `db_query` (MCP ZAPP WEB V2): `net._http_response` 24h: total 1260, **status ≥500: 0**, erro/timeout: 0; `cron.job_run_details` 24h: 9803 execuções, **failed: 0**; `public.webhook_failures` 24h: 0, não resolvidos (total): 0; `public.audit_logs action='client_error'` 24h: **2**, desde o deploy (14:25:43Z): 0. Os 2 são chunk velho depois de deploy: `TypeError: Failed to fetch dynamically imported module …/assets/AIConversationAssistant-Bj7FogW1.js` (06:53, buildId `a082adc179bb`) e `…/assets/TasksModule-BAaOgT-6.js` (11-11 23:40, ErrorBoundary). |
| 2e. Erros do Postgres (24h) | OK (com achados) | `select … from logs where source='postgres_logs' and log_attributes['parsed.error_severity'] in ('ERROR','FATAL','PANIC')`: **`permission denied for table whatsapp_connections` ×2466** (usuário `authenticator`, app `PostgREST 14.5`, query `SELECT id, name, status, is_default FROM whatsapp_connections…`, de 11-11 17:00 a **11-12 14:25:46**); `permission denied for schema auth` ×65 (usuário `snapshot_reader`, `SELECT count(*) AS c FROM auth.users`, até 14:29:41); `column messages.delivery_post_started_at does not exist` ×7 + `delivery_post_started_at` ×1 (último 11-11 23:41); o resto são 1–4 ocorrências de SQL ad hoc (syntax error, coluna inexistente). Sem FATAL/PANIC. Origem dos 2466: a única consulta do front com essa lista de colunas é `src/hooks/calls/useCallChannels.ts:280-285` (`.select('id, name, status, is_default')`); `authenticated` tem SELECT nas 4 colunas e `anon` não tem nenhum grant (`information_schema.column_privileges`/`table_privileges`). Logo o erro vem de chamada sem sessão (role anon): o efeito em `useCallChannels.ts:274-297` depende só de `[connectionId]`, sem checar `user` (o efeito anterior, linha 272, usa `[user]`). Ligação com o efeito: PLAUSÍVEL, não reproduzida. |
| 2f. 401 em massa no gateway (`edge_logs`) | OK (achado) | `edge_logs` 24h: 401 ×106486 contra 200 ×94508; 500 ×1. Top 401: `rpc/inbox_unread_total` 25923, `rpc/rpc_queue_goal_metrics` 25923, `rpc/log_audit_event` 25899, `GET /auth/v1/health` 25865, `GET /rest/v1/whatsapp_connections` 1810. Origem por referer: `http://localhost:5173/` (3 navegadores, 1 IP cada: 18774 + 16465 + 16277 + 130); de `https://zapp-web-v2.vercel.app/` só 141. Ou seja, quase tudo é dev server/E2E local apontando para o banco de produção, não usuário real. |
| 3a. Front no ar | OK | `GET https://zapp-web-v2.vercel.app/` → `200 text/html 12810B`; entry `/assets/index-CajrGWcZ.js` → 200, 244734B; `/assets/client-CFIv40dp.js` → 200; rota profunda `GET /inbox` → 200 (SPA rewrite). O bundle aponta para `https://tnnnlkbymytvtqngbbqh.supabase.co` (+ `pgxfvjmuubtbowutlide` = CRM externo, só leitura). Obs.: `zappweb.app.br` aparece na lista de aliases do deploy, mas `GET https://zappweb.app.br/version.json` → `gitSha a329d9950b…, builtAt 2026-10-16` (outro build: a V3, como diz o AGENTS.md). |
| 3b. Auth health com a chave anon pública | OK | A chave anon saiu do bundle (JWT `ref=tnnnlkbymytvtqngbbqh, role=anon`; não impressa). `GET /auth/v1/health` com apikey → `200 {"version":"v2.197.0","name":"GoTrue",…}`; sem apikey → 401. `GET /auth/v1/settings` → 200 (`google: true`, `anonymous_users: false`). |
| 3c. REST com anon | OK | Não existe tabela pública com leitura liberada para anon, por desenho: `db_query` cruzando `table_privileges(grantee='anon', SELECT)` × `pg_policies` com role anon/public → **0 linhas**; funções `public` com EXECUTE para anon (estáveis) → **0 linhas**. PostgREST no ar e fechado: `GET /rest/v1/whatsapp_connections?select=id&limit=1` (anon) → `401 {"code":"42501","message":"permission denied for table whatsapp_connections"}`; `GET /rest/v1/` → `401 "Only the service_role API key can be used for this endpoint."` |
| 3d. OPTIONS nas edges principais | OK | `OPTIONS /functions/v1/{fn}` com `Origin: https://zapp-web-v2.vercel.app`: `message-delivery` → 200 (0.42s), `evolution-webhook` → 200 (0.46s), `gmail-oauth` → 200 (0.43s); as três devolvem `access-control-allow-origin: https://zapp-web-v2.vercel.app`, `allow-methods: GET, POST, PUT, PATCH, DELETE, OPTIONS`, `allow-headers: authorization, x-client-info, apikey, content-type, …`. As três existem em `supabase/functions/`. |
| 3e. Login de usuário E2E (fixture) | BLOQUEADO | A credencial só existe como segredo do GitHub (`E2E_TEST_EMAIL`/`E2E_TEST_PASSWORD`, `.github/workflows/ci.yml:487`, `e2e-talkx.yml`); não está no ambiente local (`env` sem variáveis E2E_*; `.env.example`/`.env.production` sem elas) nem documentada em texto. Não criei usuário (proibido). Indireto: CI da `main` `43224335325` (sha `81f67b0db`) com job `🎭 E2E Tests (Playwright)` = success; o CI de `cfa8959b9` (`43236985081`) estava `queued` na coleta. Falta: rodar o login com a credencial de fixture num job do CI ou o dono expor um usuário de fixture para smoke. |

### Achados que mudam decisão
1. **Softphone/ligações quebrado em produção:** `get-sip-password` responde 503 desde 2026-11-11 16:14 (37 falhas em 24h, a última às 14:26 de hoje) porque o segredo `SIP_PASSWORD` não está configurado na edge. Correção = definir o segredo → **só o dono** (regra de segredos).
2. **2466 erros/dia de `permission denied for table whatsapp_connections`** (PostgREST, role anon), compatíveis com `useCallChannels.ts:274-297` disparando sem sessão. Ruído de log + chamada inútil; corrigível no front (fix comum).
3. **`multiplix-audience` 502** (3×, "Singu request failed" / `MULTIPLIX_RPC`): falha no RPC externo do Singu/Multiplix.
4. Ruído: ~100 mil 401/dia vêm de `localhost:5173` (dev/E2E local apontando para produção), não de usuário. `snapshot_reader` tenta ler `auth.users` 65×/dia sem permissão (automação de snapshot).

---

# Sem pela metade — código de produção (main `81f67b0db`)

Escopo: 1957 arquivos `.ts/.tsx` em `src/` e `supabase/functions/`, excluindo `__tests__/`, `*.test.*`, `*.spec.*`, `__dev__/`, `mocks/`. Não há `api/` nem `server/` no repositório. Worktree só leitura; produção consultada só com SELECT.

Ferramentas usadas (scripts no scratchpad, nenhum no repo):
- `grep` de marcadores (TODO, FIXME, WIP, XXX, HACK, mock, fake, stub, "em breve") sobre `prodfiles.txt`.
- `emptycatch.mjs`: acha `catch {}` vazios ou só com comentário. Achou 184; 183 têm comentário de justificativa e 1 está dentro de um comentário.
- `btn.cjs`: AST do TypeScript que lista `<Button>`/`<button>` sem `onClick`, `type=submit`, `asChild`, `form` nem spread. Achou 146: 108 estão dentro de Trigger do Radix e 38 foram revisados um a um.
- `orphans.cjs`: grafo de imports (estático e `import()`) a partir de `src/main.tsx`. Achou **247 de 1771 arquivos de `src/` inalcançáveis**, confirmado pelo `dist/` do mesmo HEAD: strings dos órfãos aparecem em 0 chunks; as de telas alcançáveis aparecem.
- `crud.cjs`: lista, por tabela, as operações `.from('t').insert/update/delete/upsert` feitas pelo front alcançável.
- Rotas: os `path=` de `src/routes/AppRoutes.tsx` comparados com os `navigate/to=/href`, e os ids de `?view=` comparados com `navigation.service.ts` e o `VIEW_MAP`.

## Resultado

| item | estado | prova |
|---|---|---|
| 1. Marcadores TODO/FIXME/WIP/XXX/HACK | OK (exceto o B10) | São 31 ocorrências. 27 são a palavra "TODO" em português, no sentido de "todo/inteiro" (ex.: `supabase/functions/talkx-ai/index.ts:496` "em TODO caminho", `src/lib/journey/stats.ts:12`). Os "WIP" são a trava de limite do Kanban (`src/hooks/tasks/workItemMachine.ts:36` "WIP hard em 'doing'"). `SL-XXX` é id de etapa (`src/hooks/team-chat/useTeamFiles.ts:9`). `supabase/functions/_shared/evolution-go-routes.ts:240` cita o fonte da GO. Só 2 marcam pendência de verdade, e as duas estão em código morto (ver B10): `src/components/tasks/list/taskRowCells.tsx:17` e `src/hooks/payments/usePaymentLinks.ts:2`. |
| 2. `catch {}` vazio em fluxo de usuário | OK (exceto o B9) | `emptycatch.mjs`: 184 blocos, todos com comentário dizendo o porquê. São de três tipos: storage indisponível (ex.: `src/components/inbox/ConversationListSidebar.tsx:52`), erro que o hook já mostra em toast (ex.: `src/components/inbox/TransferDialog.tsx:93`, `src/components/mfa/MFAEnroll.tsx:25`, que é coberto por `src/hooks/auth/useMFA.ts:142` `toast.error`) e corpo não-JSON (`src/components/agents/inviteErrors.ts:18`). `src/components/tasks/shared/sheet/PainelRodape.tsx:49` não finge sucesso: `setCopiado(true)` só roda quando a cópia dá certo. |
| 3. `.catch(() => {})` / `.catch(() => null)` | OK (exceto o B8) | São 59 + 29 ocorrências, todas em `audio.play()`, `reader/body.cancel()`, `removeChannel` ou `resp.json().catch(()=>null)` em edge seguido de checagem (ex.: `supabase/functions/talkx-send/index.ts:390`). Nenhuma transforma falha de gravação em sucesso. |
| 4. Ref de projeto e chave hardcoded no front | OK (justificado) | `src/integrations/supabase/client.ts:7-17` fixa o banco oficial `tnnnlkbymytvtqngbbqh` e a anon key (o JWT decodificado mostra `"role":"anon"`, que é pública). O comentário explica que `VITE_SUPABASE_*` apontaria para o Lovable `vpkmqeumtxhrwgawxdrl`. `src/hooks/auth/useAuthForm.ts:218-219` cita os ids só em comentário. As refs de CRM e Catálogo (`src/types/externalDB.ts:3`, `supabase/functions/multiplix-audience/index.ts:11`) são bancos externos lidos de propósito. Nenhuma chave `sk_`, service_role ou `AIza` foi encontrada. |
| 5. E-mails hardcoded | OK (justificado) | Os remetentes `*@promobrindes.com.br` nas edges (ex.: `supabase/functions/send-email/index.ts:47`, `supabase/functions/talkx-report/index.ts:207`) são o domínio verificado de envio. `supabase/functions/searchbox-budget-alert/index.ts:16` (`DESTINATARIO = "adm01@..."`) é o alerta de custo do administrador, com um único destinatário de propósito. Os demais são placeholders de input (`src/components/email/EmailChatReplyBar.tsx:237`, `src/components/admin/AdminView.tsx:414`). |
| 6. URLs hardcoded | OK (justificado) | `https://talkx-link.example/__probe__` (`supabase/functions/talkx-send/index.ts:626,1366`) é só a sonda que valida variáveis antes do lançamento e nunca vai ao cliente. Ela entra em `personalize(...)` só para preencher `probe.unknown`. `https://ai.gateway.lovable.dev` (`supabase/functions/_shared/ai-providers.ts:96`) é um provedor de IA que exige o segredo `LOVABLE_API_KEY` (`supabase/functions/ai-proxy/index.ts:324`). `CANONICAL_APP_ORIGIN` (`supabase/functions/approve-password-reset/index.ts:16`) e `cors-origins.ts:14-20` são a origem canônica, por segurança. |
| 7. Provedor/dados fake em produção | OK | O provedor `fake` só existe com `DENO_ENV=test` e em qualquer outro caso nega o envio (`supabase/functions/_shared/providers/registry.ts:74-78`, `fake/index.ts:59`). `singu-adapter.mock.ts` está fora do grafo (lista de órfãos). `supabase/functions/talkx-send/_test-utils.ts` não é importado por código de produção (o `grep _test-utils` fora de `*.test.ts` volta vazio). |
| 8. Rotas do React Router referenciadas e não registradas | OK | 17 `path=` em `AppRoutes.tsx`, mais `/access-denied` (registrada por spread, `src/routes/AppRoutes.tsx:93`). Os 11 destinos de `navigate/to=/href` estão todos registrados. Script: `comm` entre `refs.txt` e `routes.txt` sem diferença. |
| 9. Views `?view=` sem tela | OK (exceto o B11) | Os 53 ids de `navigation.service.ts` comparados com as 54 chaves do `VIEW_MAP`: "nav sem view" é só `achievements`, que está em `SPECIAL_VIEWS` (`src/pages/ViewRouter.tsx:105-111`). Os ids de `navigateToView(...)` fora do menu (`hub`, `pipeline`, `tags`) são estado local (`src/components/integrations/IntegrationsHub.tsx:52`) ou redirecionamento legado (`src/hooks/system/useNavigationHistory.ts:348`). O `FallbackView` "em desenvolvimento" (`ViewRouter.tsx:230`) não é alcançado por nenhum item de menu. |
| 10. Handlers vazios `on*={() => {}}` | OK (exceto o B7) | `src/components/calls/IncomingCallAlert.tsx:227` `onAnswer` é noop porque a chamada já entra com `initialStatus="answered"`. `src/components/inbox/contact-details/ContactHeaderSection.tsx:260` `onStartCall` é noop porque a ação real é o `dispatchStartCall` (`ContactActionButtons.tsx:161,168`). `src/components/contacts/ContactDetailPanel.tsx:323` mantém o diálogo fechado sem WhatsApp. `src/components/dashboard/SatisfactionMetrics.tsx:239` é um select de opção única. |
| 11. Fallbacks "em breve" na lista do inbox | OK | Os toasts "em breve" de `src/components/inbox/VirtualizedRealtimeList.tsx:448,733` só aparecem sem handler. O único consumidor passa todos: `src/components/inbox/ConversationListSidebar.tsx:608-620` (onPin, onFavorite, onResolve, onTransfer, onSnooze, onArchive, onReopen). |
| 12. Botão "Vídeo" com toast "em breve" | OK | `src/components/inbox/contact-details/ContactActionButtons.tsx:175-181` só aparece com `useFeatureFlag('video_call', false)` (linha 137). Em produção, `select key, enabled from public.feature_flags where key='video_call'` retorna 0 linhas, então o botão fica oculto. |
| 13. Botões sem onClick / sem submit | OK (exceto B3, B4, B6 e B10) | `btn.cjs`: 146 sem ação própria. 108 estão sob DropdownMenu/Popover/Dialog/AlertDialog/SheetTrigger. Dos 38 restantes: prévias visuais (`HighContrastToggle.tsx:317`, `BorderRadiusControl.tsx:79-97`, `FlowComponentPreview.tsx:101`, `TalkXMessagePreview.tsx:256`), clique que sobe ao pai (`TrainingMode.tsx:230` sob `Card onClick` na linha 222, `PersonalStickers.tsx:64` sob `div onClick`, `CallHistoryTable.tsx:114` sob a linha com `onClick`, linha 50), `trigger=` passado a um componente (`ContactDetailPanel.tsx:326`, `ChatInputToolbars.tsx:150`, `TalkXMessageEditor.tsx:136`) ou desabilitados por estado com motivo (`CRMAutoSync.tsx:69,134`, `GmailIntegrationCard.tsx:278`, `CatalogProductCard.tsx:366,511`). |
| 14. CRUD: insert sem update/delete | OK (exceto o B1) | `crud.cjs` + leitura: `allowed_countries`/`blocked_countries` têm delete (`src/hooks/system/useGeoBlocking.ts:194`), `role_permissions` também (`src/hooks/system/usePermissions.ts:160-161`), assim como `user_roles` (`src/pages/admin/useRolesPageState.ts:88`). `catalog_send_events`, `copilot_feedback` e `csat_surveys` são de só-inserção por natureza (eventos e respostas). `business_hours`, `away_messages`, `user_settings` e `contact_custom_fields` são configurações gravadas por upsert. |
| 15. Ação de edge "not implemented" | OK | `supabase/functions/multiplix-dispatch/index.ts:434` `PENDING_ACTIONS = [] as const`, então o 501 das linhas 485-490 é um ramo vazio. Ação desconhecida volta 400. |
| B1. Sequências de follow-up sem motor | BLOQUEADO | Em Configurações, a tela cria, ativa e exclui sequências (`src/components/settings/FollowUpSequences.tsx:48,62,78,86`, importada em `SettingsView.tsx:3`), mas nada as executa. O `grep -rln "followup_" supabase/functions` volta vazio. No banco: `followup_sequences`, `followup_steps` e `followup_executions` têm funcs=0, triggers=0 e cron=0, e as três tabelas estão com 0 linhas. Também não há edição: só `update({ is_active })` (linha 78), sem botão Editar. Correção: o dono decide entre implementar o executor (edge + cron que leia os passos e envie) ou tirar a tela. |
| B2. Relatório da campanha Talk X pronto e não ligado | BLOQUEADO | `src/components/talkx/report/TalkXCampaignReport.tsx` (364 linhas, com exportação CSV/PDF via `src/lib/talkxCsv.ts` e `src/lib/talkxReportPdf.ts`) e mais 5 arquivos de `report/` estão fora do grafo. Nenhum import fora de testes. O `dist/` tem 0 chunks com "Números consolidados da campanha". `src/components/talkx/talkxRoute.ts:185-187` diz "a tela de relatório ainda não existe", e a campanha `completed` cai no monitor. Correção: adicionar a tela `report` em `talkxRoute.ts` (SCREENS e `screenForStatus` para completed/cancelled) e renderizar `TalkXCampaignReport` em `TalkXView.tsx`. |
| B3. "Encaminhar" travado em "Disponível em breve" com o encaminhamento funcionando | BLOQUEADO | `src/components/inbox/tabs/FileCard.tsx:183-190`, `FilesListView.tsx:143` e `FilesTableView.tsx:244` mostram o botão com `disabled`. Só que o `FileCard` recebe `onForward` (linhas 35 e 53, sem uso), `FilesContent.tsx:308` passa `actions.onForward(item)`, e o mesmo encaminhamento já funciona no painel (`FileDetailPanel.tsx:189` `onClick={() => onForward(item)}`). Correção: trocar `disabled`/`title` por `onClick={onForward}` nos 3 lugares. |
| B4. Abas "Audiências" e "Modelos" não fazem nada | BLOQUEADO | `src/components/talkx/TalkXSegments.tsx:390-391`: `<button type="button">` habilitado, com hover e sem `onClick`. O usuário clica e nada acontece. As abas vizinhas (389, 392) estão `disabled`. Correção: ligar às telas existentes do Talk X ou marcar `disabled` com motivo, como as vizinhas. |
| B5. Módulo Meta CAPI no menu em modo "demonstração" | BLOQUEADO | Item no menu (`src/services/navigation.service.ts:146`). A tela diz "Funcionalidade em demonstração… o envio para a Meta Conversions API ainda não foi implementado" (`src/components/meta-capi/MetaCAPIView.tsx:56-60`), e o botão "Configurar" fica sempre `disabled` (linhas 45-47). O texto está presente em 3 chunks do `dist/`. Correção: o dono decide entre implementar o envio à Meta ou tirar do menu. |
| B6. Placeholders "em breve" visíveis | BLOQUEADO | São 6 lugares. (1) `src/components/team-chat/TeamChatHeader.tsx:154-166` "Performance (em breve)" sempre `disabled`, enquanto `src/components/team-chat/TeamPerformancePanel.tsx` (56 linhas) existe e está órfão. (2) `src/components/inbox/VideoFullscreen.tsx:108` "Baixar" sempre `disabled`. (3) `src/components/talkx/TalkXCampaignScheduled.tsx:461` repetição "Personalizado (em breve)". (4) Os filtros `lead_score`/`risk_score` aparecem "Em breve" (`src/hooks/integrations/useTalkXSegments.ts:88-98`, `segments/RuleRow.tsx:38-41`). (5) `src/components/talkx/TalkXAudienceFilters.tsx:203,268` desabilitado "sem dados ainda". (6) `TalkXSegments.tsx:389,392` "Regras Avançadas" e "Insights com IA". Correção: para cada um, o dono decide entre implementar ou remover. O (1) é o mais barato: ligar `TeamPerformancePanel` ao botão. |
| B7. Botões inertes no chat de equipe para quem não é membro | BLOQUEADO | Na visão bloqueada, `src/components/team-chat/TeamChatPanel.tsx:82-83` passa `onToggleSearch={() => {}}`, `onAddMembers={() => {}}` e `onToggleMute={() => {}}`. O cabeçalho mostra esses botões mesmo assim (`TeamChatHeader.tsx:123` busca, `:176` adicionar membros em grupo, `:223-224` silenciar, que aparece porque o noop é truthy), e o clique não faz nada. Correção: na visão bloqueada, não passar os handlers (`undefined`) e esconder os botões quando faltarem. |
| B8. "Copiado" aparece mesmo quando a cópia falha | BLOQUEADO | `src/components/copilot/QuoteDraftCard.tsx:23-25`: `navigator.clipboard.writeText(...).catch(() => {}); setCopied(true);`. O sucesso é mostrado antes de a promessa resolver, mesmo se ela falhar. O componente está ativo via `RadarPhase8to15Panel.tsx:21`. Correção: `await` dentro de try, `setCopied(true)` só no sucesso e `toast.error` no catch. |
| B9. "Copiar e-mail" sem nenhum retorno | BLOQUEADO | `src/components/email/EmailContactPanel.tsx:86-88`: `try { await navigator.clipboard.writeText(displayEmail); } catch { /* … */ }`. Não há toast nem estado em nenhum dos dois casos, então o usuário não sabe se copiou (o botão está na linha 104). Correção: `toast.success('E-mail copiado')` e `toast.error` no catch. |
| B10. Código morto e stubs (247 arquivos inalcançáveis) | BLOQUEADO | `orphans.cjs`: 247 de 1771 arquivos de `src/` não são alcançados a partir de `src/main.tsx`. Batem com o `dist/` (ex.: "usePaymentLinks: não implementado" em 0 chunks). Os casos de "pela metade": `src/hooks/payments/usePaymentLinks.ts` (stub que sempre lança) e `src/components/payments/PaymentLinksView.tsx:113`, que afirma "A criação de links funciona normalmente e fica salva no sistema" quando não existe tabela de pagamento (`information_schema` sem tabela `%payment%` em public). `src/components/tasks/list/taskRowCells.tsx:17-31` é um TODO com stub e não é importado. 7 hooks marcados "stub" (`useSupervisorInsights`, `usePdfExtraction`, `useAudioTranscription`, `useCopilotLearning`, `useLearningMoment`, `useSupervisorDashboard`, `useWhisperChannel`) e, ao todo, 46 de `src/hooks/copilot/` estão órfãos. `src/components/mfa/MFABackupCodes.tsx:30-41` gera códigos de backup no navegador sem gravar nem validar no servidor. `src/components/inbox/chat/ChatMessageInput.tsx:166` tem o botão Emojis sem ação (o componente inteiro está órfão). Também estão órfãos `TalkXInteractiveEditor`, `TalkXMediaDropzone`, `tracking/TalkXOperationalTimeline`, `reports/ScheduledReportsManager` (duplicado do de `dashboard/`, em uso) e `services/crm/singu-adapter*`. Lista completa no apêndice. Correção: um PR de limpeza removendo os órfãos sem uso planejado, e para Payment, MFA backup e Copilot o dono decide entre remover ou implementar. |
| B11. Tela "API Pública" registrada e inalcançável | BLOQUEADO | `src/pages/ViewRouter.tsx:90` registra `'public-api'`, mas não há item com esse id em `navigation.service.ts` (`grep public-api` só acha o ViewRouter). `NavigationService.canAccess` devolve `false` para id desconhecido (`src/services/navigation.service.ts:195-202`), então a tela nunca abre e mostra `RestrictedView`. O componente (`src/components/admin/PublicApiDashboard.tsx`) é só o aviso "API pública temporariamente desativada". Correção: remover a entrada e o lazy (`src/pages/lazyViews.ts:49`) enquanto a API pública estiver suspensa, ou, se o dono quiser o aviso visível, adicionar um item de menu restrito a admin. |

## Apêndice: os 247 arquivos de `src/` inalcançáveis a partir de `src/main.tsx`

```
src/types/contactSingu.ts
src/components/ErrorBoundary.tsx
src/components/talkx/talkxCampaignDraft.ts
src/components/talkx/useTalkXMediaUpload.ts
src/components/talkx/report/TalkXReportFunnel.tsx
src/components/talkx/report/TalkXReportPerformance.tsx
src/components/talkx/report/TalkXReportHeatmap.tsx
src/components/talkx/report/talkxReportData.ts
src/components/talkx/report/talkxReportCharts.ts
src/components/talkx/report/TalkXCampaignReport.tsx
src/components/talkx/TalkXInteractiveEditor.tsx
src/components/talkx/talkxInteractive.ts
src/components/talkx/TalkXMediaDropzone.tsx
src/components/talkx/TalkXHelp.tsx
src/components/talkx/tracking/TalkXOperationalTimeline.tsx
src/components/talkx/tracking/talkxTimelineCopy.ts
src/components/talkx/tracking/talkxSegmentProgress.ts
src/components/talkx/tracking/TalkXSegmentProgressTable.tsx
src/components/talkx/help/recordTalkXHelpView.ts
src/components/ai/ticketClassification.ts
src/components/SearchInput.tsx
src/components/effects/ScrollEffects.tsx
src/components/effects/ParallaxContainer.tsx
src/components/ui/use-toast.ts
src/components/ui/SkeletonList.tsx
src/components/ui/form.tsx
src/components/ui/empty-states.tsx
src/components/tasks/shared/DateLabel.tsx
src/components/tasks/shared/TaskCheckbox.tsx
src/components/tasks/list/taskRowCells.tsx
src/components/gamification/AchievementDetailDialog.tsx
src/components/calls/DialPad.tsx
src/components/team-chat/TransferConversationDialog.tsx
src/components/team-chat/TeamChatA11y.tsx
src/components/team-chat/GroupManagementDialog.tsx
src/components/team-chat/TeamPerformancePanel.tsx
src/components/team-chat/EnterDepartmentByCode.tsx
src/components/team-chat/ParticipantStatsGraph.tsx
src/components/mfa/MFABackupCodes.tsx
src/components/CommandPalette.tsx
src/components/performance/OptimizedImage.tsx
src/components/performance/index.ts
src/components/performance/metricThresholds.ts
src/components/performance/LazyRoutes.tsx
src/components/performance/Prefetcher.tsx
src/components/performance/VirtualizedList.tsx
src/components/contacts/contactsMotion.ts
src/components/contacts/contactDisplay.ts
src/components/settings/ConnectionAlertPreferences.tsx
src/components/a11y/KeyboardNavigation.tsx
src/components/cognitive/FeatureSpotlight.tsx
src/components/cognitive/ProgressiveDisclosure.tsx
src/components/payments/PaymentLinksView.tsx
src/components/copilot/ObjectionCard.tsx
src/components/copilot/RadarPhase8Panel.tsx
src/components/copilot/TransparencyLabel.tsx
src/components/copilot/index.ts
src/components/copilot/RadarPhase10Panel.tsx
src/components/copilot/SpeedToLeadAlert.tsx
src/components/copilot/RadarPhase9Panel.tsx
src/components/reports/ScheduledReportsManager.tsx
src/components/reports/ScheduledReportConfigs.tsx
src/components/inbox/BusinessHoursBadge.tsx
src/components/inbox/MessageContextActions.tsx
src/components/inbox/SpeedSelector.tsx
src/components/inbox/AnalysisBadges.tsx
src/components/inbox/MessagePreview.tsx
src/components/inbox/tabs/journey/JourneyFilters.tsx
src/components/inbox/tabs/journey/JourneyTimeline.tsx
src/components/inbox/tabs/journey/JourneyStatsHero.tsx
src/components/inbox/tabs/journey/JourneyEventCard.tsx
src/components/inbox/templates/TemplateEditorDialog.tsx
src/components/inbox/chat/index.ts
src/components/inbox/chat/AIEnhanceButton.tsx
src/components/inbox/chat/ChatMessageInput.tsx
src/components/inbox/chat/ChatHeaderToolbar.tsx
src/components/inbox/chat/InputExtraTools.tsx
src/components/inbox/chat/ChatAssignedBar.tsx
src/components/inbox/chat/dialogKeys.ts
src/components/inbox/KeyboardShortcutsHelp.tsx
src/components/inbox/LinkPreview.tsx
src/components/inbox/AIToolsPopover.tsx
src/components/inbox/copilot/DecisionMakerBadge.tsx
src/components/inbox/copilot/RadarPanel.tsx
src/components/inbox/copilot/OccasionAlert.tsx
src/components/inbox/copilot/MissingQuestions.tsx
src/components/inbox/copilot/RadarCards.tsx
src/components/inbox/copilot/InsightCard.tsx
src/components/inbox/copilot/BrindeMeter.tsx
src/components/inbox/copilot/StakeholdersCard.tsx
src/components/inbox/copilot/StageIndicator.tsx
src/components/inbox/copilot/RadarLive.tsx
src/components/inbox/SentimentIndicator.tsx
src/components/inbox/linkPreviewUtils.ts
src/components/inbox/TemplatesWithVariables.tsx
src/components/dashboard/SentimentHelpers.tsx
src/components/dashboard/metrics/index.ts
src/components/dashboard/metrics/GoalProgressRing.tsx
src/components/dashboard/metrics/TrendIndicator.tsx
src/components/dashboard/metrics/AnimatedMetricCard.tsx
src/components/dashboard/metrics/MetricComparison.tsx
src/components/dashboard/metrics/types.ts
src/components/dashboard/MetricComponents.tsx
src/components/dashboard/SatisfactionAgentRanking.tsx
src/components/dashboard/DraggableWidgetContainer.tsx
src/hooks/admin/useSupervisorQueue.ts
src/hooks/ui/useDeepLinks.ts
src/hooks/ui/useSwipeGesture.ts
src/hooks/ui/index.ts
src/hooks/ui/useLoadingState.ts
src/hooks/ui/usePrefetchOnHover.ts
src/hooks/ui/useParallax.ts
src/hooks/ui/useKeyboardShortcuts.ts
src/hooks/shortcuts/index.ts
src/hooks/crm/index.ts
src/hooks/crm/useVisibleAgents.ts
src/hooks/auth/index.ts
src/hooks/auth/useSecureProfile.ts
src/hooks/tasks/useWorkItemDraft.ts
src/hooks/tasks/useMyTasks.ts
src/hooks/tasks/workItemBoardGroups.ts
src/hooks/gamification/index.ts
src/hooks/business/useBusinessHoursCheck.ts
src/hooks/business/index.ts
src/hooks/voice/index.ts
src/hooks/gmail/index.ts
src/hooks/team-chat/useTeamMessageSearch.ts
src/hooks/team-chat/index.ts
src/hooks/team-chat/useRedeemDepartmentInvite.ts
src/hooks/team-chat/useTeamPresence.ts
src/hooks/team-chat/useTeamFiles.ts
src/hooks/team-chat/useTeamPerformance.ts
src/hooks/team-chat/useTeamTyping.ts
src/hooks/team-chat/useParticipantStats.ts
src/hooks/evolution/index.ts
src/hooks/chat/useAutomationSuggestions.ts
src/hooks/chat/index.ts
src/hooks/chat/useMessageStatus.ts
src/hooks/chat/journey/useJourneyCalls.ts
src/hooks/chat/journey/useJourneyEmails.ts
src/hooks/chat/journey/useJourneyActors.ts
src/hooks/chat/useChatKeyboardNavigation.ts
src/hooks/chat/useSavedFilters.ts
src/hooks/chat/useScheduledReports.ts
src/hooks/realtime/index.ts
src/hooks/performance/index.ts
src/hooks/performance/useDataOptimization.ts
src/hooks/performance/useMonitoring.ts
src/hooks/performance/useObservers.ts
src/hooks/sip/index.ts
src/hooks/contacts/useContainerColumns.ts
src/hooks/integrations/index.ts
src/hooks/integrations/useKnowledgeBaseSearch.ts
src/hooks/integrations/useTalkXCampaignList.ts
src/hooks/integrations/useTalkXCampaignTimeline.ts
src/hooks/communication/index.ts
src/hooks/reactions/index.ts
src/hooks/payments/usePaymentLinks.ts
src/hooks/copilot/useSilenceDetector.ts
src/hooks/copilot/usePromptVersioning.ts
src/hooks/copilot/useFirstResponseScript.ts
src/hooks/copilot/useLgpdFilter.ts
src/hooks/copilot/useProductRecommendation.ts
src/hooks/copilot/useCostDashboard.ts
src/hooks/copilot/index.ts
src/hooks/copilot/useHonestUrgency.ts
src/hooks/copilot/useVouPensarDetector.ts
src/hooks/copilot/useMockupTrigger.ts
src/hooks/copilot/useSupervisorInsights.ts
src/hooks/copilot/useTradeOffer.ts
src/hooks/copilot/usePdfExtraction.ts
src/hooks/copilot/useGhostText.ts
src/hooks/copilot/useFollowUpContent.ts
src/hooks/copilot/useAudioTranscription.ts
src/hooks/copilot/useFreightEstimate.ts
src/hooks/copilot/useCopilotSupervisor.ts
src/hooks/copilot/useAudioTone.ts
src/hooks/copilot/useMinQuantityAlert.ts
src/hooks/copilot/useRadarPanel.ts
src/hooks/copilot/useCopilotLearning.ts
src/hooks/copilot/useBattleCard.ts
src/hooks/copilot/useConversationScore.ts
src/hooks/copilot/useMediaPrivacy.ts
src/hooks/copilot/usePostRejection.ts
src/hooks/copilot/useAiJudge.ts
src/hooks/copilot/useUrgencyEscalation.ts
src/hooks/copilot/useImageAnalysis.ts
src/hooks/copilot/useLogoAnalysis.ts
src/hooks/copilot/useBiasChecker.ts
src/hooks/copilot/useLearningMoment.ts
src/hooks/copilot/usePIIDetector.ts
src/hooks/copilot/useSupervisorDashboard.ts
src/hooks/copilot/useWhisperChannel.ts
src/hooks/copilot/useOccasionKits.ts
src/hooks/copilot/useLiveScoring.ts
src/hooks/copilot/useSpeedToLead.ts
src/hooks/copilot/useFollowUpTiming.ts
src/hooks/copilot/useNegotiationGuard.ts
src/hooks/copilot/useVendorAuthorization.ts
src/hooks/copilot/useStallDetector.ts
src/hooks/copilot/useNonAnnoyingFollowUp.ts
src/hooks/copilot/useDataMasking.ts
src/hooks/copilot/useBrandColors.ts
src/hooks/copilot/useMinQuantityAlternative.ts
src/hooks/system/index.ts
src/hooks/system/usePrefetch.ts
src/hooks/system/useInfiniteScroll.ts
src/hooks/system/useResourcePrefetch.ts
src/hooks/system/useDuplicate.ts
src/hooks/system/useIdleCallback.ts
src/hooks/system/useCRUD.ts
src/hooks/system/useSearch.ts
src/hooks/system/useSkillBasedAssign.ts
src/hooks/system/useSupabaseMutation.ts
src/hooks/inbox/index.ts
src/hooks/dashboard/index.ts
src/hooks/sla/useContactSlaTimeline.ts
src/hooks/sla/index.ts
src/hooks/sticker-picker/index.ts
src/hooks/groups/index.ts
src/hooks/analytics/index.ts
src/hooks/analytics/usePerformanceOptimizations.ts
src/hooks/analytics/useSentimentTrend.ts
src/hooks/analytics/usePerformance.ts
src/services/index.ts
src/services/crm/singu-adapter.ts
src/services/crm/singu-adapter.mock.ts
src/services/evolution.service.ts
src/segments/segmentRules.ts
src/data/copilot/commercial-calendar.ts
src/data/copilot/brinde-questions.ts
src/data/copilot/winning-plays.ts
src/lib/supervisorPriority.ts
src/lib/talkxReportPdf.ts
src/lib/a11y.ts
src/lib/audio/gravacaoFormato.ts
src/lib/calls/MediaTransport.ts
src/lib/calls/WhatsAppCallEngine.ts
src/lib/runGuard.ts
src/lib/aiJobs/status.ts
src/lib/journey/stats.ts
src/lib/zappSchemas.ts
src/lib/talkxCsv.ts
src/lib/engagementScore.ts
src/lib/chartColors.ts
src/lib/mentionText.ts
src/i18n/team-chat.ts```

---

## Auditoria — reexecução de provas, categorias não inventariadas e linhas sem prova

Coleta: 2026-11-12 14:35–14:50 UTC. Base de código: worktree limpo `wt-base` @ `81f67b0db`. **A `main` já está em `cfa8959b9`** (`git ls-remote … refs/heads/main` → `cfa8959b9035…`; PR #2991 mergeada 14:25:11Z). Os 10 commits entre os dois não tocam `supabase/functions` (inv-producao 1b). Tudo foi feito só com leitura: SELECT pelo MCP `SUPABASE - ZAPP WEB V2 - MCP`, GET na Management API, Vercel e GitHub, OPTIONS em edge e GET anon no REST. Nenhum token ou valor de segredo foi impresso: dos segredos só listei nomes.

### Parte 1 — reexecução de 3+ OKs por arquivo

| arquivo | item reexecutado | resultado | prova (reexecutada agora) |
|---|---|---|---|
| inv-rotas | `/2fa` → TwoFactorAuth | REPRODUZ | `AppRoutes.tsx:100` = `<Route path="/2fa" element={<TwoFactorAuth />} />`; `npx vitest run twoFactorAuth.retrySaida.test.tsx RealtimeInboxView.atalhos-teclado.test.tsx` → `Test Files 2 passed, Tests 8 passed` (3+5) |
| inv-rotas | view `inbox` | REPRODUZ | `navigation.service.ts:56` `{ id: 'inbox', … label: 'Chat' }`; `ViewRouter.tsx:47` `'inbox': Views.RealtimeInboxView`; `lazyViews.ts:5` importa `@/components/inbox/RealtimeInboxView` |
| inv-rotas | "Produção = HEAD e rotas no bundle" | **NÃO REPRODUZ → rebaixado para BLOQUEADO (desatualizado)** | O bundle citado `/assets/index-CFJIkylk.js` → **HTTP 404**. A produção agora serve `version.json` = `cfa8959b9035…` com o entry `/assets/index-CajrGWcZ.js` (200, 244734B). A parte de conteúdo se mantém: há 18/18 `` path:`…` `` e 1× `` to:`/?view=multiplix` `` no bundle novo. O que não vale mais é "Vercel prod = `81f67b0db`" (produção = `cfa8959b9`). A linha 3 do cabeçalho tem o mesmo problema. |
| inv-edges | Inventário de produção (94 ACTIVE) | REPRODUZ | `GET /v1/projects/tnnnlkbymytvtqngbbqh/functions` → HTTP 200, `94 {'ACTIVE'}`; o repo tem 92 pastas (`ls supabase/functions` sem `_shared`/`deno.json` = 92) |
| inv-edges | Manifesto = código da main | REPRODUZ | `node scripts/edge-deploy/generate-manifest.mjs --check` → `Edge manifest OK: 92 functions, 176 source files, sha256=d3d065dc…64fa`, exit 0 |
| inv-edges | `evolution-webhook` (a)+(c) | REPRODUZ | API: `version 678, verify_jwt False`; `OPTIONS /functions/v1/evolution-webhook` com Origin de produção → 200 |
| inv-banco | B3 migrations repo × ledger | REPRODUZ | `ls supabase/migrations/*.sql \| wc -l` = 1105; `count(*) schema_migrations` = 1105, faixa `20251215024517..20261111181000` |
| inv-banco | B1 grant a anon | REPRODUZ | `information_schema.table_privileges grantee='anon' schema public` → só `password_reset_requests:INSERT` |
| inv-banco | B2 advisor segurança 0 ERROR | REPRODUZ | `GET …/advisors/security` HTTP 200 → 220 lints, `{'WARN': 202, 'INFO': 18}` |
| inv-workflows | ci.yml | REPRODUZ | run `43224335325` "CI/CD Pipeline" push `81f67b0db` completed/success |
| inv-workflows | deploy-functions.yml / codeql.yml | REPRODUZ | `43189662194` push `6f90c9332` success; `43192262198` schedule success |
| inv-workflows | automation-local.yml (registro órfão) | REPRODUZ | `GET /actions/workflows` total 29; id 413366359 `active`; `ls wt-base/.github/workflows` (22 arquivos) não tem `automation-local`/`patch-plano`/`talkx-pr-body.yml` |
| inv-workflows | (linha BLOQUEADO e2e-logado) "PR #2991 … aberta" | **DESATUALIZADO** | `GET /pulls/2991` → `closed`, `merged_at 2026-11-12T14:25:11Z`, merge `cfa8959b9`. e2e-logado na main: `43235977461` (81f67b0) ainda `pending`, `43223919080` `in_progress`. Nenhum run desde o fix. |
| inv-integracoes | Gmail — secrets OAuth | REPRODUZ | `GET …/secrets` HTTP 200, 37 nomes, inclui `GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI` |
| inv-integracoes | Catálogo `doufsxqlfjyuvxuezpln` | REPRODUZ | `GET /v1/projects/doufsxqlfjyuvxuezpln/health?services=db,rest` → 200, `db`/`rest` `ACTIVE_HEALTHY` |
| inv-integracoes | Cron jobs | REPRODUZ | `cron.job` 27/27 ativos; 24h: 9803 execuções, 0 `failed`; `net._http_response` 1260, 0 com ≥500/erro/timeout |
| inv-integracoes | "Vercel — deploy de produção do último commit da main" | **NÃO REPRODUZ → rebaixado para BLOQUEADO (desatualizado)** | A linha afirma sha `81f67b0db` = main. Agora a main está em `cfa8959b9` e a produção também: `dpl_GfjzQRibwcHtwpYDMsJdJAWzNWuo READY cfa8959b9`, e `dpl_Dnngs…` (81f67b0) virou o deploy anterior. O deploy está OK, mas o fato registrado na linha mudou (o correto está em inv-producao 1a). |
| inv-metade | #12 botão Vídeo oculto | REPRODUZ | `select count(*) from feature_flags where key='video_call'` = 0 |
| inv-metade | #15 multiplix-dispatch 501 vazio | REPRODUZ | `multiplix-dispatch/index.ts:434` `export const PENDING_ACTIONS = [] as const;` e 501 nas linhas 485-490 |
| inv-metade | #4 ref/anon fixos em client.ts | REPRODUZ | `src/integrations/supabase/client.ts:7-17`: comentário "Banco oficial … tnnnlkbymytvtqngbbqh" + anon key fixa (JWT `role: anon`) |
| inv-metade | "Não há `api/` nem `server/`" | REPRODUZ | `ls -d api server` → `No such file or directory` (as duas) |
| inv-producao | 1a front = HEAD | REPRODUZ | `GET /version.json` → `{"buildId":"cfa8959b9035e745d5f997e16f2ca51e76bee376"}`; `/` 200 12810B; entry `index-CajrGWcZ.js` 200 244734B |
| inv-producao | 3c REST anon fechado | REPRODUZ | `GET /rest/v1/whatsapp_connections?select=id&limit=1` (anon) → 401 `{"code":"42501","message":"permission denied for table whatsapp_connections"}` |
| inv-producao | 2d pg_net/cron | REPRODUZ | Mesma query da integração: net 1260/0 erro, cron 9803/0 failed |

**Placar da Parte 1:** 24 provas reexecutadas. 21 reproduzem. **2 OKs não reproduzem e foram rebaixados** (inv-rotas "Produção = HEAD e rotas no bundle" e inv-integracoes "Vercel — deploy de produção do último commit da main"). 1 trecho de linha BLOQUEADO está desatualizado (inv-workflows e2e-logado: "PR #2991 aberta"). As três falhas têm a mesma causa: a `main` avançou de `81f67b0db` para `cfa8959b9` depois da coleta.

### Parte 2 — categorias que não estavam inventariadas

**Placar: 29 itens — 18 OK, 11 BLOQUEADO.**

| item | status | prova |
|---|---|---|
| X1. `api/` e `server/` (funções serverless) | OK | Nenhum dos dois existe (`ls -d api server` → erro nos dois). `vercel.json` só tem `headers`/`rewrites` (chaves: `$schema, framework, buildCommand, outputDirectory, installCommand, ignoreCommand, headers, rewrites`). Não há função serverless no Vercel. |
| X2. Storage — buckets × código | OK | `storage.buckets` = 9: `audio-memes`(pub, 542 obj), `team-chat-files`(0), `voice-changer-tmp`(0), `avatars`(3631), `custom-emojis`(pub, 0), `whatsapp-media`(9719), `audio-messages`(5716), `multiplix-voice`(0), `stickers`(pub, 0). Todo bucket citado no código existe: `storage.from('…')` → audio-memes 8, audio-messages 6, avatars 5, custom-emojis 4, stickers 11, whatsapp-media 9. Por constante: `team-chat-files` (`src/hooks/team-chat/uploadTeamMedia.ts:16`), `voice-changer-tmp` (`src/lib/storage_object_upload.ts:53`), `multiplix-voice` (`supabase/functions/_shared/multiplix-content.ts:33`). |
| X3. Storage — RLS e policies por bucket | OK | `storage.objects` `relrowsecurity=true`, 34 policies, todas `authenticated` (nenhuma para anon). Policies por bucket (S/I/U/D): audio-memes 1/1/1/2, team-chat-files 1/1/0/2, voice-changer-tmp 1/1/1/1, avatars 1/1/1/1, custom-emojis 1/1/1/1, whatsapp-media 2/1/0/1, audio-messages 3/1/1/1, stickers 1/1/1/1. `multiplix-voice` tem 0/0/0/0 de propósito: `supabase/migrations/20261003132707_f64_voz_assets_e_grants.sql:27` diz "Sem policy em storage.objects", e o acesso é por URL assinada da edge `multiplix-voices` (`index.ts:6,23`). |
| X4. Storage — buckets públicos | OK | `public=true` só em `audio-memes`, `custom-emojis` e `stickers`. O conteúdo é recreativo (memes, emoji, figurinha), não é dado de cliente. Mídia de cliente (`whatsapp-media`, `audio-messages`, `avatars`, `team-chat-files`) é privada. Obs.: em bucket público a leitura pela URL `/object/public/` ignora RLS, então os 542 áudios de meme podem ser lidos por quem tiver a URL. |
| X5. Realtime — tabelas publicadas com RLS | OK | `supabase_realtime` publica 36 tabelas `public.*`. Tabelas publicadas sem RLS: `null` (0). Publicadas sem policy SELECT: `null` (0). 18 têm `REPLICA IDENTITY FULL` (ex.: messages, contacts, whatsapp_connections). |
| X6. Realtime — front assina só o que está publicado | OK | Varredura de `postgres_changes` em `src/` (sem testes): 26 tabelas com `table:` literal, **0 fora da publicação**. Os 10 casos dinâmicos usam tabelas publicadas (`conversation_tasks` em `useMyWorkItems.ts:~271`, `messages` em `useRealtimeDashboard.ts:~244`) ou são comentário/mock. |
| X7. Realtime — broadcast/presence (`realtime.messages`) | OK | `realtime.messages` `relrowsecurity=true`, policies `realtime_topic_insert_autorizado:INSERT` e `realtime_topic_select_autorizado:SELECT`. |
| X8. Filas pgmq | OK | Não há pgmq: `pg_namespace nspname='pgmq'` = 0, e as extensões são só `plpgsql, pg_stat_statements, uuid-ossp, pgcrypto, supabase_vault, pg_cron, pg_net, pg_trgm`. As filas são tabelas outbox: `ai_usage_outbox`, `outbox_events` (0 linhas) e `crm_sync_outbox` (474 pendentes, já BLOQUEADO em inv-integracoes). |
| X9. Webhooks de entrada — guarda própria nas 15 edges com `verify_jwt=false` | OK | Lista da API: `ai-usage-outbox-drain, auth-login, batch-fetch-avatars, connection-health-check, crm-integration, csp-report, elevenlabs-webhook, evolution-webhook, gmail-cron-sync, gmail-webhook, public-api, searchbox-budget-alert, sync-call-records, talkx-link, whatsapp-webhook`. A guarda de cada uma no código: x-cron-secret em tempo constante (`ai-usage-outbox-drain/index.ts:21-22`, `connection-health-check:7,603`, `gmail-cron-sync:60-61`, `searchbox-budget-alert:25`, `batch-fetch-avatars:26,38`); HMAC/assinatura (`evolution-webhook:24,30`, `elevenlabs-webhook:5`, `talkx-link:11`, `whatsapp-webhook:105-113`, `gmail-webhook` OIDC `:5,80-81`); comparação com service role (`sync-call-records:159`); `requireAuth`/HMAC (`crm-integration:3,86`); `public-api` desligada (`index.ts:7` → 410). `auth-login` e `csp-report` são públicas por natureza (login, e relatório CSP apontado por `Reporting-Endpoints`). |
| X10. `whatsapp-webhook` (Meta Cloud API) | OK | Falha fechada: sem `WHATSAPP_APP_SECRET` (ausente dos 37 secrets) responde 401 antes de qualquer efeito (`whatsapp-webhook/index.ts:100-113`). O canal Meta não é usado: `public.channel_connections` tem 0 linhas. Obs.: se o canal Meta for ligado, o webhook precisa do secret. |
| X11. `gmail-webhook` (push do Gmail/PubSub) | BLOQUEADO | `GMAIL_OIDC_AUDIENCE` e `GMAIL_OIDC_EMAIL` estão ausentes dos 37 secrets, e o código os trata como OBRIGATÓRIOS (`gmail-webhook/index.ts:73-81`), então o push é recusado. A entrada de e-mail depende só do cron `gmail-incremental-sync` (288/24h). Logs de 7 dias da rota: só 4×200 (preflight). Falta: o dono definir os 2 secrets (é configuração de segredo). O sync também está parado por `invalid_grant` (inv-integracoes). |
| X12. `talkx-link` (rastreio de clique e conversão das campanhas) | BLOQUEADO | `TALKX_CONVERT_SECRET` está ausente → o clique responde `503 Service unavailable` (`talkx-link/index.ts:99-101`) e o POST de conversão também (`:179-181`). `TALKX_LINK_BASE_URL` também está ausente (`talkx-send/index.ts:604`). Hoje não há efeito real porque nenhuma campanha foi enviada: `talkx_campaigns` = 9 `draft`, 1 `cancelled`, última criada em 2026-11-02. Falta: secrets (dono) antes do primeiro disparo com link. |
| X13. `elevenlabs-agent-token` (agente de voz) | BLOQUEADO | `ELEVENLABS_AGENT_ID` ausente dos secrets; `requireEnv('ELEVENLABS_AGENT_ID')` na linha 38 lança erro antes de chamar a ElevenLabs. Logs de 7 dias: 4×200 e 1×401 na rota, nenhuma emissão de token comprovada. Falta: o dono fornecer o ID do agente (secret). |
| X14. Variáveis de ambiente das edges × secrets | BLOQUEADO | 56 nomes lidos via `Deno.env.get`/`requireEnv` fora de testes. **28 não têm secret**: `BITRIX_WEBHOOK_URL, ELEVENLABS_AGENT_ID, EVOLUTION_VPS_SUPABASE_ANON_KEY, EVOLUTION_VPS_SUPABASE_URL, EVOLUTION_WEBHOOK_ENFORCE, GMAIL_CAS_JWT, GMAIL_CAS_POSTGREST_URL, GMAIL_OIDC_AUDIENCE, GMAIL_OIDC_EMAIL, GMAIL_OIDC_JWKS_URL, INTERNAL_ALERT_SECRET, MEDIA_EGRESS_ALLOWED_HOSTS, MEDIA_EGRESS_ALLOWED_ORIGINS, MESSAGING_MEDIA_MAX_BYTES, MULTIPLIX_BATCH_SIZE, PROVIDER_UNDER_TEST, SIP_PASSWORD, SUPABASE_PUBLISHABLE_KEY, TALKX_BATCH_BUDGET_MS, TALKX_BATCH_SIZE, TALKX_CONVERT_SECRET, TALKX_ENGINE_ANON_JWT, TALKX_ENGINE_JWT, TALKX_ENGINE_POSTGREST_URL, TALKX_LINK_BASE_URL, TRUSTED_EMAIL_DOMAINS, WHATSAPP_APP_SECRET, ZAPP_BUILD_ID`. O efeito está provado em 7 deles (SIP_PASSWORD e BITRIX em inv-integracoes; X10–X13). Falta conferir, no código, se os outros 21 têm valor padrão seguro. |
| X15. Cron — cada job rodando | OK | Os 27 jobs estão `active` e o último run de cada um está dentro do período do agendamento (ex.: `dispatch-scheduled-messages` 14:38, `talkx-scheduler-1min` 14:38, `searchbox-budget-alert` 12:00 de hoje, `vacuum-contacts-daily` 03:42 de hoje). Contagem de 24h bate com o schedule (1440 para `* * * * *`, 288 para 5 min, 24 por hora, 1 diário). Ressalva da inv-integracoes mantida: `crm-sync-outbox` não faz nada. |
| X16. Vault — segredos que o SQL lê | BLOQUEADO | O `vault.secrets` tem 14 nomes. Faltam 3 que funções de produção leem: `crm_sync_outbox_url` e `crm_sync_outbox_cron_secret` (já na inv-integracoes) e **`searchbox_alert_cron_secret`**. `public.searchbox_budget_alert_tick()` faz `net.http_post(... 'x-cron-secret', (SELECT decrypted_secret … WHERE name='searchbox_alert_cron_secret'))` quando o mês passa de 400 sessões, e a edge exige `CRON_SECRET` (`searchbox-budget-alert/index.ts:25`). Com o header nulo, o e-mail de alerta de custo vai ser recusado. Ainda não aconteceu: `searchbox_usage_daily` do mês = 0 sessões e `searchbox_budget_alert_emails` = 0. Falta: o dono criar o segredo no Vault. |
| X17. PWA — manifesto e ícones | OK | `index.html:14` `<link rel="manifest" href="/manifest.json">`; produção: `/manifest.json` 200 `application/json` (`name "ZAPP Web - Plataforma de Atendimento"`, `display standalone`), `/icons/icon-192x192.png` 200 `image/png`, `/icons/icon-512x512.png` 200. |
| X18. Service worker | OK | Desligado de propósito: `src/config/service_worker.ts` `SERVICE_WORKER_ENABLED = false` e `PUSH_NOTIFICATIONS_ENABLED = SERVICE_WORKER_ENABLED`. `useServiceWorker` (montado em `src/App.tsx:143`) só remove registros antigos e caches legados (`useServiceWorker.ts:14-36`). Não há VitePWA no `vite.config.ts` (grep vazio). `/sw.js` em produção devolve o HTML do SPA (200 `text/html`), ou seja, não existe SW servido. |
| X19. i18n — seletor de idioma | BLOQUEADO | Está pela metade. A tela Configurações mostra o seletor (`GlobalSettingsSection.tsx:67` `<LanguageSelector />`) com Português/English/Español (`src/i18n/index.ts:341-342`; recursos `pt` `:6`, `en` `:126`, `es` `:246`), mas **nenhuma tela usa tradução**: `useTranslation(`/`i18n.t(`/`t('x.y')` fora de testes aparece só em `LanguageSelector.tsx:14`, e lá o `t` é desestruturado e nunca chamado. Os textos da UI estão fixos em PT-BR, então trocar o idioma não muda nada na tela. Correção: tirar o seletor ou mostrar "só português" (diff pequeno), ou ligar a tradução (projeto grande; decisão do dono). |
| X20. Auth — link do convite de usuário | BLOQUEADO | Falha latente. A config de Auth (`GET …/config/auth` 200) tem `site_url = https://zappwebv2-juca1.vercel.app/`, e esse host responde **302 "Protected by Vercel Authentication"**. A edge `invite-user` chama `inviteUserByEmail(email, { data: { role } })` **sem `redirectTo`** (`supabase/functions/invite-user/index.ts:131-134`), então o link do e-mail volta para o `site_url` protegido e o convidado cai na tela de login da Vercel. Nenhum convite foi enviado ainda: `auth.users` = 10 e `invited_at` nulo em todos. O reset de senha não tem o problema porque passa `redirectTo` (`approve-password-reset/index.ts:211,216`). Correção: `redirectTo` no invite (código) e/ou `site_url` = `https://zapp-web-v2.vercel.app` (config de Auth; o dono decide). |
| X21. Auth — envio de e-mail (SMTP) | BLOQUEADO | Não há SMTP próprio (`smtp_host` vazio), então vale o SMTP padrão do Supabase com `rate_limit_email_sent = 2` por hora. Reset de senha, convite e confirmação de cadastro ficam limitados a 2 e-mails por hora no projeto inteiro. Existe o secret `RESEND_API_KEY` nas edges, mas ele não está ligado ao Auth. Falta: o dono configurar o SMTP do Auth (credencial). |
| X22. Auth — MFA | OK | `mfa_totp_enroll_enabled=true`, `mfa_totp_verify_enabled=true`; a rota `/2fa` existe e tem teste (Parte 1). |
| X23. Auth — política de cadastro e senha | BLOQUEADO | Precisa de decisão do dono: `disable_signup=false` (qualquer um cria conta pelo `AuthService.signUp`, `src/services/auth.service.ts:172-178`), `password_min_length=6`, `password_hibp_enabled=false` (advisor WARN `auth_leaked_password_protection`) e `security_captcha_enabled=false`. Para app interno com convite, cadastro aberto é risco. Mudar é configuração de Auth em produção, então cabe ao dono. |
| X24. Vercel — variáveis de ambiente | BLOQUEADO | `GET /v9/projects/…/env` → 8 variáveis. Em produção: `VITE_EVOLUTION_API_URL` (plain), `VITE_CLIENTES_SUPABASE_URL`, `VITE_CLIENTES_SUPABASE_ANON_KEY` e `VITE_SUPABASE_URL` (sensitive). As três primeiras **não são lidas pelo código** (grep em `src/` = 0) e `VITE_SUPABASE_URL` é ignorada de propósito (`client.ts:8-10`). Hoje nenhuma entra no bundle (o Vite só embute variável referenciada), mas `VITE_EVOLUTION_API_URL` contraria a regra "EVOLUTION_* só nas edges" (AGENTS.md). Preview tem 4 sobras `NEXT_PUBLIC_*`/`SUPABASE_PUBLISHABLE_KEY`. Falta: limpeza (o workflow `vercel-env-cleanup.yml` existe; o dono decide). |
| X25. Vercel — domínios | OK | Domínios do projeto: `zappweb.app.br` (redireciona para `www`), `www.zappweb.app.br` e `zapp-web-v2.vercel.app`, todos `verified`. Aliases `zappweb.app.br`/`www` → `dpl_GfjzQRibwcHtwpYDMsJdJAWzNWuo` (V2). Mesmo assim o DNS real de `zappweb.app.br` responde `server: nginx` com `version.json` `gitSha a329d9950b…, builtAt 2026-10-16` (V3), de acordo com o AGENTS.md. Obs.: se o DNS voltar para a Vercel, o domínio passa a servir a V2. |
| X26. Vercel — cabeçalhos de segurança | OK | `curl -I https://zapp-web-v2.vercel.app/` → `strict-transport-security: max-age=63072000; includeSubDomains; preload`, `x-frame-options: DENY`, `x-content-type-options: nosniff`, `reporting-endpoints: csp="…/functions/v1/csp-report"`, `content-security-policy-report-only: default-src 'self'; …`. Obs.: o CSP está só em Report-Only, não bloqueia. |
| X27. GitHub — alertas e proteção da main | OK | MCP GitHub: alertas Dependabot habilitados (`get_vulnerability_alerts_status` → 204); alertas abertos: Dependabot `[]`, code scanning `[]`, secret scanning `[]`. Proteção da `main`: `strict:true`, checks `🏗️ Build`, `🔎 TypeCheck`, `✅ CI Gate (required check)`, `enforce_admins:true`, `required_linear_history:true`, `allow_force_pushes:false`, idêntica a `scripts/ci/github-settings-baseline.json`. (A REST com `gh auth token` dá 403 "Resource not accessible by integration"; por isso usei o MCP.) |
| X28. Automações `scripts/<nome>/` com README | OK | 23 pastas; 22 com `README.md`. `scripts/db/` tem `README-seed-contatos-redesign.md` para o único script dela. |
| X29. Contexto gerado (`origin/contexto`) em dia com a main | BLOQUEADO | `git log -1 origin/contexto` → `4d4b44868 … @ main 65cf385` (13:39Z), mas a main está em `cfa8959b9`. Está 2 merges atrás. Confirma a inv-workflows (`contexto.yml`: runs cancelados por fila). Quem lê o contexto agora recebe um estado antigo. |

(X1–X29 = 29 linhas: 18 OK, 11 BLOQUEADO. X9 cobre 15 edges e X3 cobre 9 buckets.)

### Parte 3 — linhas com "não verificado", afirmação sem prova ou status fora do padrão

Nenhuma linha usa literalmente "não verificado". Encontrei estas:

| arquivo:linha | problema |
|---|---|
| inv-producao.md:16 (2e) | O status é "OK (com achados)", mas a atribuição dos 2466 `permission denied for table whatsapp_connections` a `useCallChannels.ts:274-297` está marcada pelo próprio autor como "PLAUSÍVEL, não reproduzida". Falta prova para essa parte. |
| inv-rotas.md:7 e as linhas de vistas com "E2E: e2e/navegacao-modulos.spec.ts:NNN" | O E2E é citado como cobertura, mas o próprio arquivo diz "E2E: não executado aqui" e a suíte `navegacao-modulos.spec.ts:1329` está quebrada na main (linha "E2E de navegação…" BLOQUEADO). Nessas linhas o OK se apoia só no teste unitário com mocks. A citação de E2E não prova nada. |
| inv-rotas.md:117 "Produção = HEAD e rotas no bundle" | Desatualizada (Parte 1): bundle 404, produção = `cfa8959b9`. |
| inv-rotas.md:3 (cabeçalho) | "Produção Vercel confirmada no mesmo commit 81f67b0db" está desatualizado. |
| inv-integracoes.md:22 ("Vercel — deploy de produção do último commit da main") | Desatualizada (Parte 1). |
| inv-workflows.md:21 (e2e-logado) | "a PR #2991 … aberta" está desatualizado: foi mergeada às 14:25:11Z. |
| inv-workflows.md:20 (db-live-guard agendamento) | BLOQUEADO correto. A causa ficou sem prova ("não identificável pela API pública"; precisa de audit log/admin). |
| inv-workflows.md:24 (crm-sync-worker) | BLOQUEADO correto. "Não deu para ler as variáveis do repo" (proxy bloqueia o path). |
| inv-metade.md:17,18,19,25,26,29,30 | Status "OK (exceto o Bn)": linha mista. A exceção já tem linha BLOQUEADO própria, mas o status não segue o padrão OK/BLOQUEADO. |
| inv-metade.md:20,21,22 | Status "OK (justificado)" fora do padrão. A prova existe (arquivo:linha). |
| inv-producao.md:14,16,17 | Status "OK (com achados)"/"OK (achado)" fora do padrão. São itens com defeito real em produção (503 `get-sip-password`, 2466 erros/dia, 100 mil 401/dia vindos de localhost), e o status deixa isso escondido. |
| inv-workflows.md:31,32,33 | Status "OK (registro órfão)" fora do padrão. Reexecutei a prova de automation-local (Parte 1). |
| inv-edges.md / inv-banco.md | Nenhuma linha sem prova encontrada. |
