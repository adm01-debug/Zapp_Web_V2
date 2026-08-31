# Inventário sanitizado de superfícies de segredo e dados sensíveis (Etapa 007)

- **Data:** 2026-08-30 · **Branch:** `chore/excellence-wave-01` · **Executor:** Cline
- **Escopo:** repositório `adm01-debug/zapp-web-v2` (working tree + histórico completo de 6.980 commits), GitHub Actions (via API, somente nomes), código-fonte e configuração.
- **Regra deste documento:** **nenhum valor** — apenas nomes de variáveis, superfícies, formatos e classificações. Nenhum exemplo se assemelha a uma chave real.
- **Ferramentas:** gitleaks 8.30.1 (modo `dir` e `git` histórico completo), grep estrutural (`import.meta.env`, `Deno.env.get`, `process.env`, `secrets.*` em workflows), GitHub REST (secrets/variables/environments — nomes e datas apenas).

## 1. Política de manuseio de segredos (instituída nesta etapa)

1. **Proibido segredo em `VITE_*`**: qualquer variável `VITE_*` é embutida no bundle público do Vite. Permitidos apenas URLs públicos, chaves `anon`/`publishable` (públicas por design, protegidas por RLS) e flags de app.
2. **Proibido segredo em logs e saídas de CI** (local ou remota).
3. **Proibido segredo em plaintext no banco de dados** (tabelas, comentários, defaults).
4. `.env.production` versionado contém **apenas** variáveis públicas (URLs, publishable/anon, flags) — regra já anotada no `.gitignore` e revalidada nesta etapa (§4, A-01).
5. Chaves `anon`/`publishable` do Supabase são públicas por design; mesmo assim existem apenas em: `.env*` locais, GitHub Secrets consumidos no build, e fallbacks documentados em `src/integrations/supabase/`.
6. Segredos novos entram **somente** via: GitHub Secrets (Actions), Supabase Edge Function Secrets (`supabase secrets set`), Vercel Env (dashboard/CLI) — nunca commitados, nunca em chat.
7. Todo segredo tem owner nomeado, escopo e mecanismo de rotação (§2). Rotações são **Classe D** (exigem aprovação explícita do proprietário).
8. Scanner fail-closed em CI é coberto pela etapa 017 do handoff (fora do escopo aqui).

## 2. Inventário por sistema

Owner padrão: **adm01** (onde não houver outro indicado). "Edge env" = ambiente das Supabase Edge Functions.

### 2.1 Supabase — projeto oficial (`tnnnlkbymytvtqngbbqh`)

| Nome | Superfície/ambiente | Consumidor | Classe | Rotação |
|---|---|---|---|---|
| `VITE_SUPABASE_URL` | `.env.production`, GitHub Secret, bundle | frontend | público | n/a (identificador) |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | `.env.production`, GitHub Secret, fallback em `src/integrations/supabase/client.ts`, header de migration cron | frontend + pg_cron | público (JWT `anon`) | Supabase Dashboard → API keys |
| `SUPABASE_URL` / `SUPABASE_ANON_KEY` / `SUPABASE_PUBLISHABLE_KEY` | Edge env (auto-injetado pela plataforma) | edge functions | público/limitado | automático (plataforma) |
| `SUPABASE_SERVICE_ROLE_KEY` | Edge env | edge functions (server-side) | **segredo** | Supabase Dashboard → API keys — **verificar F-04** |
| `SUPABASE_FUNCTIONS_URL` | Edge env | edge functions | interno | n/a |
| `SUPABASE_ACCESS_TOKEN` | GitHub Secret (repo) | workflows `supabase-sync`, `types-sync`, `deploy-functions` | **segredo** | Supabase Dashboard → Access tokens (atualizado 2026-08-29) |
| `SUPABASE_PROJECT_REF` | GitHub Secret (repo) | workflows | identificador | n/a |

### 2.2 Supabase — projetos externos

| Nome | Projeto (ref) | Superfície | Classe | Rotação |
|---|---|---|---|---|
| `VITE_CLIENTES_SUPABASE_URL` / `VITE_CLIENTES_SUPABASE_ANON_KEY` | `pgxfvjmuubtbowutlide` | `.env.production`, GitHub Secrets, fallback em `externalClient.ts` | público | Dashboard do projeto |
| `EXTERNAL_SUPABASE_URL` / `EXTERNAL_SUPABASE_ANON_KEY` | `pgxfvjmuubtbowutlide` | Edge env | público/limitado | Dashboard do projeto |
| `PROMOGIFTS_SUPABASE_URL` / `PROMOGIFTS_SUPABASE_ANON_KEY` | a confirmar | Edge env + `.env.example` | público/limitado | Dashboard do projeto (owner a confirmar) |
| (histórico) chaves `anon` do projeto `allrjhkpuscmgbsnmjlv` | legado | `.env` removido do HEAD (F-05) | público | n/a |

### 2.3 GitHub Actions (repo `adm01-debug/zapp-web-v2`) — enumerado via API em 2026-08-30

| Secret | Criado | Atualizado | Consumidor |
|---|---|---|---|
| `CRON_SECRET` | 2026-08-29 | 2026-08-29 | workflows + edge functions (mesmo nome em `Deno.env.get`) |
| `DESTINO_URL` | 2026-08-28 | 2026-08-28 | workflow `db-live-guard` |
| `SUPABASE_ACCESS_TOKEN` | 2026-08-28 | 2026-08-29 | workflows Supabase CLI |
| `SUPABASE_PROJECT_REF` | 2026-08-28 | 2026-08-28 | workflows Supabase CLI |
| `VITE_CLIENTES_SUPABASE_ANON_KEY` | 2026-08-27 | 2026-08-27 | build no CI |
| `VITE_CLIENTES_SUPABASE_URL` | 2026-08-27 | 2026-08-27 | build no CI |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | 2026-08-27 | 2026-08-27 | build no CI |
| `VITE_SUPABASE_URL` | 2026-08-27 | 2026-08-27 | build no CI |

- **Ausente no repo:** `TYPES_SYNC_PR_TOKEN` (referenciado em workflow; pode existir em nível de organização ou estar faltando) → **F-06**.
- Actions variables: **nenhuma**. Environments: `copilot`, `db-ledger-evidence` (branch policy), `Preview`, `Production` — **0 environment secrets** em todos os quatro.

### 2.4 Evolution API / WhatsApp (Hostinger)

| Nome | Superfície | Classe | Rotação |
|---|---|---|---|
| `EVOLUTION_API_URL`, `EVOLUTION_API_FLAVOR`, `EVOLUTION_INSTANCE_NAME` | `.env.example` + Edge env | config (URL/sabor/instância) | painel Evolution na Hostinger |
| `EVOLUTION_API_KEY` | `.env.example` + Edge env | **segredo** | painel Evolution na Hostinger — **ver F-01** |
| `EVOLUTION_INSTANCE_TOKEN` | `.env.example` + Edge env | **segredo** | painel Evolution na Hostinger |
| `VITE_EVOLUTION_API_URL` | `.env.production` | público (URL) | n/a |
| `WHATSAPP_VERIFY_TOKEN` | Edge env | **segredo** | Meta for Developers |
| `WEBHOOK_SECRET` | Edge env | **segredo** | config da edge function — **ver F-02** |

### 2.5 Google (Gmail)

| Nome | Superfície | Classe | Rotação |
|---|---|---|---|
| `GOOGLE_CLIENT_ID`, `GOOGLE_REDIRECT_URI` | `.env.example` (server-side OAuth) | config sensível | Google Cloud Console |
| `GOOGLE_CLIENT_SECRET` | `.env.example` | **segredo** | Google Cloud Console |

### 2.6 LLMs

| Nome | Superfície | Classe | Rotação |
|---|---|---|---|
| `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GROQ_API_KEY` | `.env.example` | **segredo** | consoles respectivos |
| `OPENROUTER_API_KEY` | Edge env | **segredo** | OpenRouter dashboard |

### 2.7 E-mail transacional

| Nome | Superfície | Classe | Rotação |
|---|---|---|---|
| `RESEND_API_KEY` | Edge env | **segredo** | Resend dashboard |

### 2.8 Bitrix / Sicoob / Chatbot

| Nome | Superfície | Classe | Rotação |
|---|---|---|---|
| `BITRIX_WEBHOOK_URL` | Edge env | **segredo** (URL autenticada) | Bitrix → webhooks |
| `SICOOB_GIFTS_URL`, `SICOOB_GIFTS_BRIDGE_SECRET` | Edge env | **segredo** | config da ponte |
| `CHATBOT_L1_WEBHOOK_SECRET` | Edge env | **segredo** | config da edge function |

### 2.9 Observabilidade e flags de app (não secretas)

- `VITE_SENTRY_DSN`, `VITE_SENTRY_ENVIRONMENT` — `.env.example` — DSN público por design.
- `VITE_APP_NAME`, `VITE_APP_ENV`, `VITE_ENABLE_ANALYTICS`, `VITE_ENABLE_DEBUG`, `VITE_ENABLE_GAMIFICATION`, `VITE_ENABLE_GMAIL_INTEGRATION`, `VITE_LOG_LEVEL`.

### 2.10 MCP (Cloudflare Worker) — referência cruzada (etapa 006)

- URL autenticada do MCP `supabase-zapp-web-v2-mcp`: **segredo exposto em chat** — decisão `ACCEPTED_TEMPORARY_RISK` (adm01, prazo 2026-09-06) registrada em `docs/handoffs/cline_execution_log_2026_08_30.md` §5.6. Ausência do valor comprovada no repo e no histórico (§5.6).

### 2.11 Vercel — referência cruzada (etapa 006)

- Credencial Vercel exposta em chat — **decisão pendente** (§3 do diário).
- Envs Vercel presumidas = variáveis `VITE_*` públicas (SPA estático); **enumeração autenticada pendente** (sem conta/API nesta sessão).

### 2.12 Lalamove (legado — removido do HEAD)

- Credenciais Lalamove versionadas entre 2026-03-23 e 2026-04-12 em `Credencias - Lalamove.txt` e 7 arquivos `lalamove_*` — **exposição histórica** → **F-03**.

## 3. Pendências de enumeração remota (não bloqueiam o inventário local)

- **Supabase Edge Function Secrets:** listagem exige CLI/dashboard autenticado; nomes inferidos do código (§2.1–2.8) cobrem 23 variáveis `Deno.env.get`.
- **Vercel envs:** sem acesso autenticado (etapa 005 BLOCKED).
- **Hostinger/Evolution:** sem MCP nesta sessão (etapa 005 BLOCKED).
- **GitHub org-level:** confirmar existência de `TYPES_SYNC_PR_TOKEN` (F-06).

## 4. Achados do scanner (classificados, sem valores)

Legenda: **FP** = falso positivo · **PUB** = público por design · **SUSP** = segredo real suspeito · **HIST** = exposição histórica (fora do HEAD) · **MOCK** = dado de teste.

| ID | Local | Detecção | Classificação | Ação |
|---|---|---|---|---|
| A-01 | `.env.production` (2 linhas) | JWTs com payload `role=anon` (refs oficial + clientes); demais chaves são URLs/flags (classificação por forma) | **PUB** | nenhuma |
| F-01 | `docs/TROUBLESHOOTING.md` L72 e L89 | header `apikey:` com valor de 44/51 chars, alfanumérico misto, sem formato de placeholder | **SUSP** (Evolution API key) | **rotação (Classe D) + sanitização do doc — pendentes de aprovação** |
| F-02 | `docs/EVOLUTION_WEBHOOKS_DOCUMENTATION.md` L75 e `tmp/EVOLUTION_WEBHOOKS_DOCUMENTATION.md` L75 (arquivos tracked) | `x-webhook-secret:` com valor de 88 chars | **SUSP** (webhook secret Evolution) | idem F-01 |
| F-03 | `Credencias - Lalamove.txt` + 7 arquivos `lalamove_*` (histórico; commitados 2026-03-23, removidos 2026-04-12) | chaves de 32–72 chars, formato de credencial de API | **HIST + SUSP** | **decisão: rotacionar/encerrar conta Lalamove se ainda ativa**; rewrite de histórico não planejado (registrado como risco aceito documental) |
| F-04 | `supabase/functions/migrate-helper/` (histórico; removido 2026-08-28, commit `1f2e9120` com mensagem indicando exposição pública de `SERVICE_ROLE_KEY`) | `ACCESS_KEY` hardcoded + endpoint público | **HIST + SUSP** | **confirmar rotação da `SUPABASE_SERVICE_ROLE_KEY` do projeto oficial pós-2026-08-28** |
| F-05 | `.env` no histórico (removido 2026-04-10, commit `5949e03c` "R-001 security fix") | apenas chaves `VITE_*`/`SUPABASE_PUBLISHABLE_KEY` com JWTs `role=anon` (incl. projeto legado `allrjhkpuscmgbsnmjlv`) | **HIST / PUB** | nenhuma (somente anon públicas) |
| F-06 | `.github/workflows/types-sync.yml` | `secrets.TYPES_SYNC_PR_TOKEN` referenciado, ausente nos 8 repo secrets | config pendente | confirmar existência em nível de organização ou criar |
| F-07 | `src/integrations/supabase/client.ts`, `externalClient.ts`, migration `20260829110000_gmail_incremental_sync_cron.sql` | JWTs `role=anon` hardcoded como fallback/valor de cron | **PUB** (baixa prioridade) | centralizar em `lib/env.ts` em etapa futura |
| F-08 | `docs/CRM360_TECHNICAL_DOCS.md` L69 | fragmento com prefixo de JWT (23 chars) que não decodifica | **FP** (exemplo truncado) | nenhuma |
| F-09 | `supabase/schema-manifest.json` (496 ocorrências) | hex de 32 chars com padrão keyword+valor | **FP** (identificadores/fingerprints estruturais do manifest gerado) | nenhuma |
| F-10 | `src/test/ai-usage-shared.test.ts` | JWT de teste com payload mock | **MOCK / FP** | nenhuma |
| F-11 | `docs/PROMPT_LOVABLE_CRM360_INTEGRATION.md` | JWT `role=anon` em doc de integração | **PUB** | nenhuma |

- **GitHub secret scanning:** 0 alertas abertos (2026-08-30) — consistente com os achados (formatos não-padrão ou anon públicas).

## 5. Verificação do aceite da etapa

| Critério | Resultado |
|---|---|
| 100% dos nomes referenciados com owner/escopo/rotação | **Sim**, exceto `TYPES_SYNC_PR_TOKEN` (F-06, owner GitHub-org a confirmar) e `PROMOGIFTS_*` (owner a confirmar) |
| Zero segredo real versionado no HEAD | **Não** — F-01 e F-02 (Evolution) aguardam rotação + sanitização (Classe D, aprovação do proprietário) |
| Inventário cobre repo + GitHub + código + histórico | **Sim** (gitleaks dir + git completo, 6.980 commits) |
| Enumeração remota (Vercel, Supabase secrets store, Hostinger) | **Pendente** por falta de acesso autenticado (§3) — não bloqueia, pois os nomes são inferidos do código |
| Política de manuseio definida | **Sim** (§1) |

**Estado da etapa:** IN_PROGRESS até a decisão/execução de F-01 e F-02 (e confirmação de F-03/F-04/F-06).

## 6. Método e limitações

1. **Varredura estática:** gitleaks 8.30.1 com `--redact=100` na primeira passada; passadas seguintes com saída piped para classificadores Node que emitem apenas prefixo/comprimento/claims JWT (`role`, `iss`, `ref`) — nenhum valor integral foi lido ou registrado.
2. **Classificação de JWTs:** decodificação somente do payload (role/iss/ref); nenhuma assinatura validada, nenhum token testado contra serviços.
3. **Histórico:** `git log -S`/`-G` e `git log --follow` nos arquivos sinalizados; datas de inclusão/remoção registradas acima.
4. **Não executado (fora de escopo/limitação):** enumeração de secrets do Supabase (CLI), Vercel e Hostinger; validação ativa de qualquer credencial contra serviços; rewrite de histórico Git; rotações (Classe D).
5. **Risco residual conhecido:** valores SUSP permanecem no histórico e (para F-01/F-02) no HEAD até a aprovação das correções; credencial MCP e credencial Vercel seguem os trâmites da etapa 006.


