# Auditoria de segurança (leitura) — Edge Functions

- **Data:** 2026-10-07
- **Escopo:** `supabase/functions/**` (74 Edge Functions + `_shared/**`), derivadas de `supabase/config.toml`, `supabase/deployment-manifest.json`, `supabase/migrations/**`, `supabase/schema-catalog.json` e `src/**` apenas para saber quem chama.
- **Modo:** somente leitura. Nenhuma linha de produto foi alterada; nenhuma migration, policy, RPC ou Edge Function foi criada/alterada/aplicada. Nenhum acesso a produção (nem banco, nem deploy, nem segredo lido).
- **Método:** leitura do handler de cada função (`Deno.serve`/handler exportado), do `verify_jwt` de cada função no `deployment-manifest.json` e de `_shared/` (`validation.ts`, `cron-secret-auth.ts`, `webhook-signature.ts`, `hmac-validation.ts`, `request-policy.ts`, `ssrf.ts`, `secure-egress.ts`, `media-egress.ts`, `ai-auth.ts`, `evolution-control-authz.ts`, `voice-copilot-authz.ts`).

## Premissa de fronteira (importa para os vereditos)

`verify_jwt = true` (default) **não é autenticação de usuário**: o gateway Supabase aceita
qualquer JWT válido do projeto, inclusive a **anon key pública** que vai no bundle do
frontend — é o próprio repositório que documenta isso em
`supabase/functions/_shared/ai-auth.ts:1-14`. Portanto, para as **60** funções com
`verify_jwt = true`, a única barreira real é a que a função faz por conta própria
(`requireAuth`, `getUser`, `requireAiIdentity`, papel via `is_admin_or_supervisor`, etc.).
Conferi isso função a função; o resultado é a tabela abaixo e o achado **SEC-EDGE_FUNCTIONS-03**.

As **14** funções com `verify_jwt = false` (`auth-login`, `batch-fetch-avatars`,
`connection-health-check`, `crm-integration`, `csp-report`, `elevenlabs-webhook`,
`evolution-webhook`, `gmail-cron-sync`, `gmail-webhook`, `public-api`,
`searchbox-budget-alert`, `sync-call-records`, `talkx-link`, `whatsapp-webhook`) foram
conferidas uma a uma: cada uma tem guarda interna própria (segredo de cron dedicado no
Vault, HMAC/assinatura bloqueante, token por instância, service role conferido em tempo
constante, `INTERNAL_ALERT_SECRET`, ou auth própria do login).

---

## URGENTE (P0/P1)

| ID | Sev | Função | Uma linha |
|----|-----|--------|-----------|
| SEC-EDGE_FUNCTIONS-01 | **P0** | `external-db-bridge` | `select` com `service_role` (bypassa RLS) em `clientes`, `evolution_contacts`, `evolution_messages`, `evolution_chats` para **qualquer** usuário autenticado, sem papel. |
| SEC-EDGE_FUNCTIONS-02 | **P0** | `external-db-proxy` | O ramo de `update` exige admin/supervisor, mas o ramo de **leitura** (`evolution_contacts`, `evolution_messages`, `media_quarantine`) não exige papel nenhum — mesmo bypass de RLS. |
| SEC-EDGE_FUNCTIONS-03 | **P1** | `fetch-link-preview` | Única função `verify_jwt = true` **sem autenticação interna** e **sem rate limit**: qualquer portador da anon key pública usa a função como fetcher de URL arbitrária e grava na tabela de cache com `service_role`. |

---

## Índice de achados

| ID | Severidade | Tema | Esforço |
|----|-----------|------|---------|
| SEC-EDGE_FUNCTIONS-01 | P0 | Autorização por papel ausente (leitura com service role) — `external-db-bridge` | P |
| SEC-EDGE_FUNCTIONS-02 | P0 | Autorização por papel ausente (leitura com service role) — `external-db-proxy` | P |
| SEC-EDGE_FUNCTIONS-03 | P1 | Autenticação ausente em função exposta (anon key) + sem rate limit — `fetch-link-preview` | P |
| SEC-EDGE_FUNCTIONS-04 | P2 | Enumeração de usuários e `listUsers()` sem paginação/limite — `webauthn` | P |
| SEC-EDGE_FUNCTIONS-05 | P2 | Guarda "cron OU usuário" sem papel e sem rate limit em job de manutenção — `connection-health-check` | P |
| SEC-EDGE_FUNCTIONS-06 | P2 | Leitura do provedor sem escopo por contato (decisão documentada) — `evolution-api` | M |
| SEC-EDGE_FUNCTIONS-07 | P3 | Guarda "cron OU usuário" sem papel em job de manutenção com efeito externo — `batch-fetch-avatars` | P |
| SEC-EDGE_FUNCTIONS-08 | P3 | CORS `Access-Control-Allow-Origin: *` hardcoded, fora do `getCorsHeaders` — `get-call-recording` | P |
| SEC-EDGE_FUNCTIONS-09 | P3 | HTML de e-mail de segurança com campos sem escape + sem rate limit — `detect-new-device` | P |
| SEC-EDGE_FUNCTIONS-10 | P3 | Corpo de erro do provedor devolvido ao cliente em 502 — `talkx-report` | P |

Esforços: **P** = poucas linhas num arquivo; **M** = mexe em fluxo/matriz de autorização.

---

## Achados detalhados

### SEC-EDGE_FUNCTIONS-01 — P0 — `external-db-bridge`: leitura com `service_role` sem papel

- **Evidência:** `supabase/functions/external-db-bridge/index.ts`
  - allowlist de tabelas: linhas 8-14 (`clientes`, `evolution_contacts`, `evolution_messages`, `evolution_chats`, `promogifts_catalog`);
  - autenticação: linhas 88-101 — **só** confere que existe um usuário (`getUser`), seja qual for o papel;
  - leitura privilegiada: linhas 124-144 — `supabaseAdmin.from(table).select(...)` com o cliente `service_role` criado na linha 85 (bypassa a RLS de `contacts`/`messages`).
  - `grep -n "is_admin\|has_role\|user_roles" external-db-bridge/index.ts` → **nenhuma ocorrência**.
- **Cenário de exploração (3 passos):**
  1. Qualquer usuário com sessão válida (papel `agent`, sem nenhuma permissão de gestão) obtém seu próprio JWT.
  2. `POST` em `external-db-bridge` com `{"action":"select","table":"clientes","limit":1000}`.
  3. Recebe a base de clientes inteira (e, com `table:"evolution_messages"`, as conversas) com `service_role`, sem que a RLS do app tenha chance de decidir.
- **Correção sugerida (NÃO aplicada):** antes do `isOperationAllowed`, resolver o papel com o RPC canônico já usado nas funções irmãs e negar sem ele:
  ```ts
  const { data: isAdmin, error: roleError } = await supabaseUser.rpc("is_admin_or_supervisor", { _user_id: userId });
  if (roleError || !isAdmin) return errorResponse("Forbidden", 403, req);
  ```
  (alternativa, se houver consumidor legítimo não-admin: restringir `select` a contatos visíveis ao chamador, como faz `ai-suggest-reply` com `createAuthedClient`).
- **Esforço:** P.

### SEC-EDGE_FUNCTIONS-02 — P0 — `external-db-proxy`: leitura com `service_role` sem papel

- **Evidência:** `supabase/functions/external-db-proxy/index.ts`
  - tabelas de leitura: linha 4 (`evolution_contacts`, `evolution_messages`, `media_quarantine`);
  - o ramo de escrita **exige** papel — linhas 92-108 (`is_admin_or_supervisor` → 403);
  - o ramo de leitura **não exige** — linhas 127-180 montam e executam `ext.from(table).select(...)` sem nenhuma checagem de papel (só a autenticação das linhas 42-59).
- **Cenário de exploração (3 passos):**
  1. Usuário autenticado qualquer (papel `agent`) chama a função com seu JWT.
  2. `POST` `{"table":"evolution_messages","select":"*","limit":500}`.
  3. Recebe mensagens de WhatsApp de contatos que não enxerga no app (a RLS local é contornada porque a query vai ao banco externo com a credencial do servidor).
- **Correção sugerida (NÃO aplicada):** mover a checagem de papel para fora do `if (action === 'update')`, aplicando-a antes de montar a query de leitura (mesmo RPC `is_admin_or_supervisor`). Se existir consumidor legítimo não-admin, decidir explicitamente qual projeção ele pode ler e restringir `select` a essa lista de colunas.
- **Esforço:** P.

### SEC-EDGE_FUNCTIONS-03 — P1 — `fetch-link-preview`: função exposta sem autenticação interna e sem rate limit

- **Evidência:** `supabase/functions/fetch-link-preview/index.ts`
  - o handler (linhas 206-274) faz `handleCors` e lê `body.url`, e **não** chama `requireAuth`/`getUser` nem qualquer guarda (`grep -n "enforceRateLimit\|checkRateLimit\|requireAuth\|getUser"` → nenhuma ocorrência);
  - no `supabase/deployment-manifest.json`, a função está com `verify_jwt = true`; como a anon key é um JWT válido do projeto, ela passa o gateway (mesma premissa documentada em `_shared/ai-auth.ts:1-14`);
  - a função grava cache com `service_role` (`dbCacheSet`, linhas 50-64 e chamada na 254) e faz egress de URL arbitrária via proxy (`fetchPreviewViaSecureEgress`, linha 146).
- **Cenário de exploração (3 passos):**
  1. Um visitante anônimo lê a anon key pública no bundle do frontend.
  2. Chama `fetch-link-preview` com `{"url":"<url-alvo>"}` usando essa chave como Bearer.
  3. Usa a função como fetcher de páginas arbitrárias (limitado ao proxy de egresso e a metadados de preview) e enche/contamina `link_preview_cache` (linhas no banco por URL) sem nenhum limite.
- **Correção sugerida (NÃO aplicada):** exigir usuário autenticado (`requireAuth`) e aplicar `enforceRateLimit` por usuário/IP antes do cache — igual às demais funções de egresso do projeto. Alternativa mínima, se o preview tiver de ficar público: `enforceRateLimit` por IP com chave dedicada e teto de entradas por IP.
- **Esforço:** P.

### SEC-EDGE_FUNCTIONS-04 — P2 — `webauthn`: enumeração de usuários e `listUsers()` sem paginação

- **Evidência:** `supabase/functions/webauthn/index.ts`
  - ação `authentication-options`, linhas 142-165: com um `userEmail` no corpo, chama `supabaseAdmin.auth.admin.listUsers()` (linha 148, **sem paginação**) e, se achar o usuário, devolve `allowCredentials` (linhas 152-163) — a resposta revela que a conta existe;
  - a função não tem `checkRateLimit`/`enforceRateLimit` em nenhum ponto (`grep` → nenhuma ocorrência), então o teste pode ser repetido sem custo;
  - o gateway aceita a anon key (a tela de login não tem sessão), então o oráculo é alcançável por quem tem a chave pública.
- **Cenário de exploração (3 passos):**
  1. Chamar `webauthn` com `{"action":"authentication-options","userEmail":"<email>"}` usando a anon key.
  2. Comparar respostas: `allowCredentials` não vazio ⇒ a conta existe e tem passkey; vazio/`undefined` ⇒ não existe.
  3. Repetir para enumerar contas (sem rate limit).
- **Correção sugerida (NÃO aplicada):** (a) responder de forma idêntica quando o e-mail não existe e quando existe sem passkey registrada (ex.: sempre devolver `allowCredentials` só quando houver credencial **e** não diferenciar status/corpo), (b) trocar `listUsers()` por uma consulta paginada/filtrada (`listUsers({ page, perPage })` ou RPC `get_passkey_credentials_by_email`), (c) `enforceRateLimit` por IP na ação pública.
- **Esforço:** P.

### SEC-EDGE_FUNCTIONS-05 — P2 — `connection-health-check`: "cron OU usuário" sem papel e sem rate limit

- **Evidência:** `supabase/functions/connection-health-check/index.ts`
  - guarda: linhas 6-7 e 33-36 (`isAuthorizedCronOrUser`) — aceita o segredo do cron **ou qualquer usuário autenticado**, sem exigir papel;
  - efeito: varre todas as `whatsapp_connections` (linhas 55-58) chamando o provedor (`/instance/connectionState`) e, na ramificação de alerta, envia e-mail para **todos** os admins (linhas 133-135);
  - não há `checkRateLimit`/`enforceRateLimit` no arquivo.
- **Cenário de exploração (3 passos):**
  1. Usuário autenticado qualquer (papel `agent`) chama a função repetidamente.
  2. Cada chamada polla o provedor para todas as conexões e dispara alertas/e-mails aos admins.
  3. Sem rate limit, o chamador gera carga no provedor e enxurrada de e-mails internos.
- **Correção sugerida (NÃO aplicada):** manter o caminho do cron por segredo dedicado e, no caminho de Bearer de usuário, exigir `is_admin_or_supervisor`; somar `enforceRateLimit` (ex.: 6/min por usuário). O comentário do arquivo já diz que o front é consumidor legítimo (painel de diagnóstico) — o painel é de admin.
- **Esforço:** P.

### SEC-EDGE_FUNCTIONS-06 — P2 — `evolution-api`: ações de LEITURA sem escopo por contato

- **Evidência:** `supabase/functions/evolution-api/index.ts` + `_shared/evolution-control-authz.ts`
  - o gate global exige apenas JWT válido (linhas 61-66);
  - a matriz classifica `control`/`send` (`_shared/evolution-control-authz.ts:190-195`, deny-by-default) e **`read`** fica liberado para qualquer autenticado (`READ_ACTIONS`, linhas 135-182);
  - entre as leituras estão `find-messages`, `find-contacts` e `get-media-base64`, que devolvem conteúdo do provedor por instância, **sem** casar o contato com `is_contact_visible_to_user` (o `send` casa, o `read` não).
- **Cenário de exploração (3 passos):**
  1. Um `agent` autenticado chama `action: "find-messages"` passando um `remoteJid`/número de um contato que não é dele.
  2. Como a leitura não é escopada, a função repassa ao provedor e devolve as mensagens daquele chat.
  3. O mesmo vale para `find-contacts` e `get-media-base64`.
- **Ressalva honesta:** o próprio código declara que "a leitura sensível de diagnóstico é tratada separadamente" e que o modelo é single-tenant — ou seja, é uma decisão de projeto, não um esquecimento. Registro aqui porque é a única classe de operação da função que devolve dado de terceiro sem escopo por contato, e o restante da área (envio, controle, IA) já usa esse escopo.
- **Correção sugerida (NÃO aplicada):** aplicar o mesmo `is_contact_visible_to_user` (ou admin/supervisor) às leituras que devolvem conteúdo por alvo (`find-messages`, `find-contacts`, `get-media-base64`), mantendo globais só as realmente globais (`list-instances`, `status`, `instance-info`).
- **Esforço:** M.

### SEC-EDGE_FUNCTIONS-07 — P3 — `batch-fetch-avatars`: "cron OU usuário" sem papel

- **Evidência:** `supabase/functions/batch-fetch-avatars/index.ts`
  - guarda: linhas 5 e 34-40 (`isAuthorizedCronOrUser`) — segredo do cron **ou** qualquer usuário autenticado;
  - efeito: seleciona até 500 contatos (linha 59) e dispara chamadas ao provedor para baixar avatar.
  - Atenuação existente: `checkRateLimit(..., 5, 60_000)` na linha 44.
- **Cenário de exploração (3 passos):**
  1. Usuário autenticado qualquer chama a função.
  2. Dispara até 500 buscas de avatar no provedor (Evolution), gravando mídia.
  3. Repetindo a cada minuto (limite 5/min por IP), mantém carga externa.
- **Correção sugerida (NÃO aplicada):** no caminho Bearer de usuário, exigir `is_admin_or_supervisor` (o consumidor legítimo citado no comentário é o front autenticado, mas a função mexe em contatos de toda a base).
- **Esforço:** P.

### SEC-EDGE_FUNCTIONS-08 — P3 — `get-call-recording`: CORS `*` hardcoded

- **Evidência:** `supabase/functions/get-call-recording/index.ts:34`
  ```ts
  const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, content-type, range" };
  ```
  — o resto do projeto usa `getCorsHeaders(req)` (`_shared/validation.ts:126-142`), com allowlist exata de origem. É a **única** função com `*` hardcoded (`grep -rn "Allow-Origin.*\*" --include=index.ts` → só esta).
- **Cenário de exploração (3 passos):** não é bypass de autenticação (a função exige Bearer e a RLS decide o dono da chamada, linhas 51-74). O risco é ampliação de superfície: um `Access-Control-Allow-Origin: *` permite que qualquer site leia a resposta **se** o navegador não exigir credenciais; como o JWT vem no header `Authorization` (não cookie), o vetor prático é limitado a vazamento de metadados de áudio por páginas de terceiros que consigam a resposta.
- **Correção sugerida (NÃO aplicada):** usar `getCorsHeaders(req)` como nas demais funções (mantendo os headers de Range/Content-Type por cima).
- **Esforço:** P.

### SEC-EDGE_FUNCTIONS-09 — P3 — `detect-new-device`: HTML do e-mail sem escape + sem rate limit

- **Evidência:** `supabase/functions/detect-new-device/index.ts`
  - `device_name`, `browser`, `os` e o IP entram no HTML do e-mail sem escape: linhas 173-177 (`${device_name}`, `${browser}`, `${os}`, `${clientIp}`) dentro do template das linhas 160-185;
  - `device_name`/`browser`/`os` vêm do corpo do chamador (schema `DetectNewDeviceSchema`, linha 114);
  - a função não tem rate limit.
- **Cenário de exploração (3 passos):**
  1. Usuário autenticado chama a função com `device_name` contendo marcação HTML.
  2. A função insere o valor e envia o e-mail de "novo dispositivo" para o próprio usuário com o HTML injetado.
  3. Sem rate limit, pode disparar muitos e-mails (para si) e gravar linhas de `security_alerts`.
- **Correção sugerida (NÃO aplicada):** escapar os campos com `escapeHtml` (já existe em `_shared/notification-events.ts`, usado por `sentiment-alert`) antes de interpolar no template; somar `enforceRateLimit` por usuário.
- **Esforço:** P.

### SEC-EDGE_FUNCTIONS-10 — P3 — `talkx-report`: corpo de erro do provedor devolvido ao cliente

- **Evidência:** `supabase/functions/talkx-report/index.ts:214-217`
  ```ts
  const body = await emailRes.text();
  log.error('Resend error', { status: emailRes.status, body });
  return jsonErr(req, { ok: false, reason: 'resend_error', detail: body }, 502);
  ```
  — o corpo cru do erro do provedor (Resend) volta ao cliente no campo `detail`. A mensagem crua de erro do provedor pode trazer detalhes de configuração/conta.
- **Cenário de exploração (3 passos):** o chamador (dono da campanha) provoca uma falha do Resend e lê o `detail` na resposta, obtendo mensagem interna do provedor de e-mail.
- **Correção sugerida (NÃO aplicada):** manter o corpo no log do servidor e devolver código estável (`{ ok:false, reason:'resend_error', code: emailRes.status }`), sem o `detail` cru.
- **Esforço:** P.

---

## Veredito por função (74)

Legenda: **OK** = guarda própria conferida e adequada; **cron** = segredo dedicado do cron no Vault; **HMAC** = assinatura bloqueante; **ver achado N**; **SR** = exige `service_role`; **A/S** = exige admin/supervisor.

| Função | `verify_jwt` | Guarda conferida | Verdicto |
|---|---|---|---|
| ai-auto-tag | true | `requireAuth` + `enforceAiGuards` + visibilidade de contato | OK |
| ai-churn-analysis | true | `getUser` + `enforceAiGuards` + RLS de contatos | OK |
| ai-classify-tickets | true | `getUser` + `enforceAiGuards`; lê tags pelo cliente do chamador (RLS) | OK |
| ai-conversation-analysis | true | `requireAuth` + visibilidade de contato | OK |
| ai-conversation-summary | true | `requireAuth` + `resolveVisibleContactId` + revalidação de contexto | OK |
| ai-enhance-message | true | `requireAuth` | OK |
| ai-jobs-worker | true | `isAuthorizedCronOrUser` (cron) | OK |
| ai-proxy | true | `requireAuth` + A/S no ramo de diagnóstico | OK |
| ai-suggest-reply | true | `requireAuth` + `enforceAiGuards` + `createAuthedClient` | OK |
| ai-transcribe-audio | true | `requireAiIdentityOrService` + `assertMessageVisibleToCaller` | OK |
| approve-password-reset | true | `getUser` + A/S | OK |
| auth-login | false | política de rede + rate limit por IP e e-mail + lockout | OK |
| auto-close-conversations | true | JWT + A/S antes do service role | OK |
| batch-fetch-avatars | false | cron OU usuário + rate limit 5/min | ver achado 07 |
| bitrix-api | true | `getUser` + A/S em **toda** ação + `zod` | OK |
| chatbot-l1 | true | `requireAuth` OU HMAC + visibilidade de contato | OK |
| classify-audio-meme | true | `requireAiIdentity` | OK |
| classify-emoji | true | `requireAiIdentity` | OK |
| classify-sticker | true | `requireAiIdentityOrService` | OK |
| cleanup-rate-limit-logs | true | JWT + A/S **antes** do service role | OK |
| connection-health-check | false | cron OU usuário, **sem papel nem rate limit** | ver achado 05 |
| create-user | true | `getUser` + papel `admin` em `user_roles` + rate limit | OK |
| crm-integration | false | SR / cron (restringe ações) / JWT+A/S + rate limit | OK |
| csp-report | false | público por desenho; corpo limitado (8 KB) + rate limit | OK |
| detect-new-device | true | `getUser` + schema | ver achado 09 |
| elevenlabs-agent-token | true | `requireAuth` + `enforceRateLimit` | OK |
| elevenlabs-dialogue | true | `requireAuth` + rate limit | OK |
| elevenlabs-scribe-token | true | `requireAuth` + rate limit | OK |
| elevenlabs-sfx | true | `requireAuth` + rate limit | OK |
| elevenlabs-sts | true | `requireAuth` + rate limit | OK |
| elevenlabs-tts | true | `requireAuth` + rate limit | OK |
| elevenlabs-tts-stream | true | `requireAuth` + rate limit | OK |
| elevenlabs-voice-design | true | `requireAuth` + rate limit | OK |
| elevenlabs-webhook | false | HMAC bloqueante + dedupe por UNIQUE | OK |
| evolution-api | true | JWT + matriz por ação (control/send/read) | ver achado 06 |
| evolution-sync | true | `getUser` + A/S | OK |
| evolution-webhook | false | HMAC bloqueante OU token por instância (fail-closed) | OK |
| external-db-bridge | true | `getUser` apenas | **ver achado 01** |
| external-db-proxy | true | `getUser`; A/S só no `update` | **ver achado 02** |
| fetch-link-preview | true | **nenhuma** guarda interna, sem rate limit | **ver achado 03** |
| get-call-recording | true | `getUser` + RLS decide o dono | ver achado 08 |
| get-mapbox-token | true | `requireAuth` + `enforceRateLimit` | OK |
| get-sip-password | true | Bearer + `getClaims` + perfil ativo + rate limit | OK |
| gmail-cron-sync | false | `x-cron-secret` contra `CRON_SECRET` | OK |
| gmail-oauth | true | `getUser` (injetado) | OK |
| gmail-send | true | `getUser` + conta vinculada a `user_id` | OK |
| gmail-sync | true | `getUser` + conta vinculada a `user_id` | OK |
| gmail-webhook | false | OIDC do Pub/Sub (RS256 contra JWKS) | OK |
| message-delivery | true | `requireAuth` + perfil ativo + lease por RPC + claim token | OK |
| migrate-media-storage | true | `getUser` + A/S | OK |
| multiplix-audience | true | `requireAuth` + escopo resolvido no servidor | OK |
| multiplix-dispatch | true | `requireAuth` + escopo | OK |
| multiplix-send | true | SR / cron / JWT + A/S por RPC | OK |
| multiplix-voices | true | `requireAuth` + papel/escopo por grant | OK |
| promogifts-catalog | true | `getUser` + rate limit em tabela + credencial própria | OK |
| public-api | false | kill switch: responde 410 sem tocar nada | OK |
| recover-corrupted-audios | true | `getUser` + A/S | OK |
| revoke-auth-sessions | true | JWT + A/S para revogar sessão de terceiro | OK |
| searchbox-budget-alert | false | `x-cron-secret` contra `CRON_SECRET` | OK |
| send-email | true | JWT + A/S (`is_admin_or_supervisor`) | OK |
| send-rate-limit-alert | true | `X-Internal-Secret` obrigatório + tempo constante (fail-closed) | OK |
| send-scheduled-report | true | JWT + A/S **antes** do service role | OK |
| sentiment-alert | true | `requireAuth` + rate limit + RLS de `conversation_analyses` | OK |
| sync-call-records | false | `Bearer` conferido contra a `service_role` | OK |
| talkx-link | false | HMAC v1 (+janela de compatibilidade) e rate limit | OK |
| talkx-report | true | `getUser` + dono da campanha | ver achado 10 |
| talkx-scheduler | true | `x-cron-secret` do Vault OU service key (fail-closed) | OK |
| talkx-send | true | SR / cron / JWT + A/S por RPC | OK |
| voice-agent | true | `requireAiIdentity` | OK |
| voice-changer | true | `requireAuth` + `enforceRateLimit` | OK |
| voice-copilot-action | true | `requireAuth` + visibilidade + papel na reatribuição | OK |
| webauthn | true | JWT do dono nas ações de registro; enumeração na de login | ver achado 04 |
| webhook-diagnostic | true | `getUser` + A/S | OK |
| whatsapp-webhook | false | HMAC bloqueante (fail-closed sem `WHATSAPP_APP_SECRET`) | OK |

---

## Verificado e SEM problema (para provar cobertura)

1. **SSRF de URL vinda do usuário.** `fetch-link-preview` não faz `fetch` direto: passa pelo egresso com IP fixado (`_shared/secure-egress.ts`) — o achado 03 é de **auth/rate limit**, não de SSRF. Mídia disparada por webhook usa `_shared/media-egress.ts` (allowlist de destino + revalidação a cada redirect + teto de bytes). URLs de Storage passam por `_shared/ssrf.ts` (`parseApprovedStorageUrl`: origem exata do projeto, bucket em allowlist, rejeita `..`/`\`/NUL, decodifica duas vezes). `ai-image-input.ts`/`ai-transcribe-audio` só baixam objeto do bucket aprovado sob a identidade do chamador.
2. **Webhooks sem assinatura.** `evolution-webhook` (HMAC bloqueante OU `instanceToken` por instância, `EVOLUTION_WEBHOOK_ENFORCE='token'` por padrão = fail-closed), `whatsapp-webhook` (HMAC Meta bloqueante; sem `WHATSAPP_APP_SECRET` → 401), `elevenlabs-webhook` (assinatura + timestamp com tolerância + dedupe por UNIQUE), `gmail-webhook` (OIDC RS256 contra JWKS), `talkx-link` (HMAC v1 com `external_ref` no payload assinado). Nenhum webhook processa sem verificar.
3. **Segredo de cron.** `ai-jobs-worker`, `batch-fetch-avatars`, `connection-health-check` usam `_shared/cron-secret-auth.ts` (segredo dedicado por job no Vault, `timingSafeStringEqual`, fail-closed se a leitura falhar, e a anon key não entra). `talkx-scheduler` e `gmail-cron-sync`/`searchbox-budget-alert` fazem o mesmo. `send-rate-limit-alert` exige `INTERNAL_ALERT_SECRET` não vazio em tempo constante.
4. **Uso de `service_role`.** Todas as funções que escrevem com service role validam a identidade antes de criar o cliente privilegiado: `create-user`, `bitrix-api`, `migrate-media-storage`, `recover-corrupted-audios`, `cleanup-rate-limit-logs`, `send-scheduled-report`, `auto-close-conversations`, `webhook-diagnostic`, `evolution-sync`, `approve-password-reset` (todos exigem A/S ou dono). A exceção são os achados 01 e 02 (service role no **ramo de leitura** sem papel).
5. **Autorização por papel onde há escrita privilegiada.** `is_admin_or_supervisor` confere em `bitrix-api`, `crm-integration`, `evolution-api` (controle), `multiplix-*`, `talkx-send`, `send-email`, `cleanup-rate-limit-logs`, `send-scheduled-report`, `auto-close-conversations`, `webhook-diagnostic`, `recover-corrupted-audios`, `migrate-media-storage`, `external-db-proxy` (update), `approve-password-reset`, `create-user`, `ai-proxy` (diagnóstico), `voice-copilot-action` (reatribuição).
6. **Escopo por contato na IA.** `ai-suggest-reply`, `ai-conversation-summary`, `ai-conversation-analysis`, `ai-auto-tag`, `ai-churn-analysis`, `chatbot-l1`, `sentiment-alert` validam visibilidade com o cliente do **chamador** (RLS real) antes de ler com service role — sem IDOR de contato nesses caminhos.
7. **Rate limit.** Presente (por usuário ou IP) em `auth-login` (IP e e-mail), `get-sip-password`, `get-mapbox-token`, `voice-changer`, `message-delivery`, `sentiment-alert`, `talkx-link`, `promogifts-catalog`, `csp-report`, `create-user`, `batch-fetch-avatars`, `bitrix-api`(A/S) e nas funções ElevenLabs. Ausente apenas onde apontado (`fetch-link-preview`, `connection-health-check`, `webauthn`, `detect-new-device`) e nas funções de egresso puro já cobertas por guarda mais forte.
8. **Validação de entrada.** Funções com corpo rico usam `zod` (ou `_shared/schemas.ts` + `parseBody`/`safeParse`), com `max`/`enum`/`uuid`; `bitrix-api` usa `z.object`; `whatsapp-webhook` usa `z.object` com `safeParse`. As funções sem schema formal (`evolution-api`, `talkx-send`, `multiplix-send`, `voice-copilot-action`, `webhook-diagnostic`, `recover-corrupted-audios`, `external-db-proxy`) fazem validação manual campo a campo e allowlists.
9. **Log com segredo/PII.** Varredura por `log.info/warn/error` e `console.*` com `token|password|secret|apiKey|authorization|cpf|cnpj` **não** encontrou segredo ou PII sendo registrado: as ocorrências são mensagens de configuração ausente (`"X is not configured"`), status HTTP e contagens. `evolution-webhook` trunca o JID antes de logar (`substring(0,6)`). `errorResponse`/`internalErrorResponse` substituem o corpo por `Internal server error` em 5xx, então o padrão `errorResponse(msg, 500)` **não** vaza mensagem ao cliente.
10. **Respostas com mais dados que o necessário.** `elevenlabs-*` devolve só o token pedido; `talkx-report` e `sentiment-alert` não devolvem PII de terceiro além do necessário (exceto o `detail` do achado 10); `webhook-diagnostic` (A/S) devolve diagnóstico. Não encontrei `select('*')` devolvido ao cliente fora das leituras já apontadas nos achados 01/02.
11. **`config.toml`.** As 14 exceções de `verify_jwt` são todas justificadas por autenticação própria (webhooks, cron, login, kill switch) e conferem com o `deployment-manifest.json` (`verify_jwt_true: 60`, `verify_jwt_false: 14`).

## Limitações desta revisão

- Só o repositório foi lido (regra do cartão). Não verifiquei RLS/policies no banco, secrets provisionados no Dashboard, nem o comportamento do proxy de egresso — ausência de `PREVIEW_EGRESS_*` ou `WHATSAPP_APP_SECRET` faz a função falhar fechado, mas isso é comportamento em runtime, não observado aqui.
- A severidade segue a regra do cartão (P0 = vazamento/escrita indevida explorável por usuário autenticado **ou** anônimo); por isso os achados 01 e 02 entram como P0 mesmo exigindo sessão.
- Não auditei os `index.ts` linha a linha de `multiplix-send` (1084 linhas), `talkx-send` (1271), `evolution-api` (1042) e `ai-proxy` (926) além dos pontos de autenticação/autorização/egresso — os vereditos dessas funções são sobre o gate, não sobre a regra de negócio.
