# PLANO VERCEL — ZAPP WEB V2 — 190 ETAPAS (V001–V190) — 2026-10-18

> **Executor-alvo:** agente de IA (Sonnet). **Escopo:** exclusivamente o projeto Vercel
> `zapp_web_v2` (`prj_J4wb8egzz8iL1CJnSOXJDtqnbvRp`, time `juca1` / `team_QyN41X0q8hrqhW80AwokbFLv`)
> e os arquivos do repositório que governam o deploy (`vercel.json`, `vite.config.ts`, `index.html`,
> `public/`, `src/main.tsx`, CORS das edge functions). Nada fora disso.
>
> **Princípios:** qualidade (resolver na causa, sem retrabalho) + velocidade (ordem por impacto,
> etapas atômicas) + economia (diff mínimo, sem leitura de arquivo inteiro, sem tool "por garantia").

---

## 0. Diagnóstico — o que foi medido ao vivo em 2026-10-18

Fonte: MCP Vercel (`get_project`, `filter_project_envs`, `list_project_domains`, `get_domain_config`,
`list_deployments`, `get_deployment`, `list_billing_charges`, `count_pageviews`, `list_drains`,
`get_rolling_release_config`), status de commit do GitHub e leitura do código em `main` (`e322d37`).

| # | Achado | Evidência | Severidade |
|---|---|---|---|
| A01 | **Domínio próprio não chega na Vercel.** `zappweb.app.br` e `www.zappweb.app.br` têm registro A `209.142.67.51` (DNS em `e/f.sec.dns.br` = Registro.br). Vercel marca `misconfigured: true` nos dois e recomenda A `76.76.21.21` / CNAME `cname.vercel-dns.com`. Produção real hoje = só `zapp-web-v2.vercel.app`. | `get_domain_config` | **P0** |
| A02 | **Domínio canônico errado para o CORS.** Na Vercel o apex redireciona 308 → `www.zappweb.app.br`, mas o CORS das edge functions (`supabase/functions/_shared/cors-origins.ts` + `scripts/edge-deploy/allowed-origins.json`) aceita `zappweb.app.br` e **não** aceita `www.zappweb.app.br`. No dia em que o DNS for corrigido, toda chamada de edge function feita a partir do `www` cai no `FALLBACK_ORIGIN` e o navegador bloqueia. | `list_project_domains` + código | **P0** |
| A03 | **Segredos de outro banco no ambiente Preview.** A integração `icfg_l6F3AhnOcvXqyj1eMSD7Jpxb` (Supabase Marketplace) injetou 17 variáveis presas à branch morta `claude/fix-promogifts-offset-503-260925-1420`, entre elas `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_SECRET_KEY`, `SUPABASE_JWT_SECRET`, `POSTGRES_PASSWORD`, `POSTGRES_URL*` — todas com `securityIssues: ["readable-secret"]`. O SPA não lê nenhuma delas. | `filter_project_envs` | **P0** |
| A04 | **Chaves de servidor sem uso no projeto.** `EVOLUTION_API_KEY`, `EVOLUTION_API_URL`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GROQ_API_KEY` (Production+Preview). O projeto não tem `api/` nem functions — são só superfície de vazamento. | `filter_project_envs` + `ls api` vazio | P1 |
| A05 | **Variáveis configuradas e nunca lidas pelo front:** `VITE_APP_NAME`, `VITE_APP_ENV`, `VITE_ENABLE_ANALYTICS`, `VITE_ENABLE_DEBUG`, `VITE_ENABLE_GAMIFICATION`, `VITE_ENABLE_GMAIL_INTEGRATION`, `VITE_LOG_LEVEL`, `VITE_EVOLUTION_API_URL`, `VITE_CLIENTES_SUPABASE_URL`, `VITE_CLIENTES_SUPABASE_ANON_KEY`, `VITE_SENTRY_DSN`, `VITE_SENTRY_ENVIRONMENT`. `VITE_SUPABASE_URL` é injetada mas **ignorada de propósito** (`src/integrations/supabase/client.ts`). | `grep -rhoE "VITE_[A-Z0-9_]+" src` | P2 |
| A06 | **Variáveis lidas e nunca configuradas:** `VITE_CRM_INTEGRATION_ENABLED` (`src/integrations/supabase/externalClient.ts`), `VITE_SEARCHBOX_MONTHLY_SESSION_LIMIT` (`src/lib/mapboxCostGuard.ts`), `VITE_APP_VERSION`. Comportamento em produção = default do código, sem decisão registrada. | idem | P1 |
| A07 | **Build em todo push de toda branch.** 40 deploys de preview em ~5 h (18/10), quase todos de commits que só mexem em `docs/`, `supabase/`, `scripts/`, `.github/`. `Build CPU Minutes` = **US$ 0,714/dia** — maior custo variável do time (≈ US$ 21/mês). Sem `ignoreCommand`. | `list_deployments` + `list_billing_charges` (16→17/10) | P1 (custo) |
| A08 | **Produção quebrou 3× em `main` sem ninguém ver.** Deploys de produção `ERROR` em 16/10 (`dpl_FM69…`, `dpl_BqKV…`, `dpl_F4GC…`); o status `Vercel` não é check obrigatório e não há alerta — a `main` avança e a produção fica presa na versão anterior em silêncio. | `list_deployments state=ERROR` + `list_commit_statuses` | P1 |
| A09 | **Cache ruim.** Regra `/((?!assets/).*)` → `no-store` vale também para `favicon`, `icons/`, `manifest.json`, `patterns/*.webp`, `vendor/lamejs-1.2.1.min.js`, `notification.mp3` (rebaixados a cada visita). `/assets/*` (com hash) não tem `immutable` explícito. | `vercel.json` | P2 (perf/custo) |
| A10 | **Source maps publicados à toa.** `vite.config.ts` gera `sourcemap: 'hidden'` em produção "para o Sentry", mas `VITE_SENTRY_DSN` não é lido em lugar nenhum do `src/`. Resultado: `.map` públicos em `/assets/` + tempo de build. | código | P2 |
| A11 | **CSP só em Report-Only** desde a criação, e o endpoint `csp-report` só loga (não grava). Sem processo para promover a enforce. | `vercel.json` + `supabase/functions/csp-report` | P2 |
| A12 | **App interno indexável.** `public/robots.txt` libera tudo; não há `X-Robots-Tag`. | `public/robots.txt` | P2 |
| A13 | **Web Analytics desligado** (`web_analytics_not_enabled`); Speed Insights está instrumentado (`src/lib/speed-insights.ts`, E36). | `count_pageviews` | P3 |
| A14 | **Sem drain de logs** e o token do MCP recebe **403** em `get_runtime_logs`, `get_runtime_errors`, `list_deployment_events` (log de build) e `web_fetch_vercel_url` — o agente não consegue provar nada pós-deploy. | chamadas MCP | **P0 (bloqueia verificação)** |
| A15 | **Projeto legado `zapp-web`** (`prj_OsErjUqsrMbwwC7S1LVfawmNgEce`) com deploy de produção `READY` de set/2026 e 3 aliases públicos (`zapp-web-theta.vercel.app`, `zapp-web-juca1.vercel.app`, `zapp-web-git-main-juca1.vercel.app`): versão velha do app acessível. | `get_project` | P1 |
| A16 | **Sem política de retenção de deploys**: centenas de previews (incl. `ERROR`) acumulando. | `list_deployments` | P3 |
| A17 | **Configuração implícita**: `buildCommand`/`outputDirectory`/`framework` não estão no `vercel.json` (dependem do painel). Node `24.x` no painel, `.nvmrc`=24, `engines` ok. Região `iad1`. | `get_project` + `vercel.json` | P3 |
| A18 | **Rewrite `/l/:slug`** (encurtador do Talk X) depende de `talkx-link` e não tem teste de contrato do lado Vercel. | `vercel.json` | P3 |
| A19 | **CLAUDE.md não tem seção Vercel** (projeto, domínio canônico, envs, regras) — cada sessão redescobre do zero. | CLAUDE.md | P2 |

**Não é bug (não "consertar"):** `ssoProtection = all_except_custom_domains` (previews protegidos é o desejado);
`installCommand` com `--ignore-scripts` (correto); `VITE_SUPABASE_URL` ignorada pelo client (decisão documentada
em `src/config/supabase.ts`); `ORIGIN_PATTERNS` aceitar previews `zappwebv2-*-juca1.vercel.app` (desejado para QA).

---

## 1. Regras para o agente executor (ler antes da V001)

1. **Uma etapa por vez, na ordem.** Cada etapa tem `Faça`, `Prova` e `Pronto quando`. Só avance com a prova obtida.
   Sem prova → marque `NÃO VERIFICADO` no registro de execução e **não** diga que funcionou.
2. **Git:** siga a seção 0 do `CLAUDE.md` (commits na branch local do dia `dia/AAAA-MM-DD`, um PR por lote,
   push só quando o Joaquim pedir). Prefixos `fix:`/`chore:`/`feat:` em PT-BR, citando a etapa: `fix(vercel): … (V0xx)`.
3. **Mudança no painel Vercel = produção.** Toda escrita via MCP Vercel (`edit_project_env`, `create_project_env`,
   `update_project`, domínio, firewall) é ação de produção: execute só as etapas marcadas `Tipo: MCP-Vercel (escrita)`
   e registre antes/depois (`get_project`/`filter_project_envs`).
4. **Segredos:** nunca use `decrypt=true`, nunca imprima valor de variável, nunca cole chave em commit/PR/log.
   Rotação de chave = **só o Joaquim** (CLAUDE.md seção 0).
5. **Etapas `Tipo: Joaquim`** são ações humanas (DNS no Registro.br, aprovação de custo, exclusão irreversível).
   O agente prepara tudo (valores exatos, URL do painel), pede em **uma** mensagem e **pula** para a próxima etapa
   que não dependa daquela. Nunca invente que foi feito.
6. **Ferramenta ausente no MCP** (ex.: não existe `delete_project_env` nem `update_project_domain`): tente o
   fallback de CLI indicado no próprio erro do MCP (`vercel env rm`, `vercel api …`). Se a CLI não estiver
   autenticada, gere o passo para o Joaquim com a URL exata do painel e siga.
7. **IDs fixos (não descobrir de novo):** time `team_QyN41X0q8hrqhW80AwokbFLv` (slug `juca1`), projeto
   `prj_J4wb8egzz8iL1CJnSOXJDtqnbvRp` (nome `zapp_web_v2`), legado `prj_OsErjUqsrMbwwC7S1LVfawmNgEce`,
   integração Supabase `icfg_l6F3AhnOcvXqyj1eMSD7Jpxb`. Algumas rotas do MCP devolvem 404 com `teamId` —
   nesse caso repita **sem** `teamId` (o escopo padrão do token é `juca1`).
8. **Economia:** leia trechos (`sed -n`, `grep -n`), não arquivos inteiros; não repita saídas de tool no relatório.
9. **Registro:** ao fim de cada fase, acrescente uma linha por etapa em
   `docs/plans/PLANO_VERCEL_190_ETAPAS_2026-10-18.execucao.md` (`V0xx | feito/pulado/bloqueado | prova curta`).
10. **Parada obrigatória:** se uma etapa revelar que o achado do diagnóstico estava errado, pare a fase, registre
    a divergência e corrija a tabela da seção 0 neste arquivo no mesmo commit.

---

## FASE 1 — Pré-requisitos de verificação (V001–V012)

### V001 — Registro de execução
- **Tipo:** Código
- **Faça:** criar `docs/plans/PLANO_VERCEL_190_ETAPAS_2026-10-18.execucao.md` com cabeçalho (data, commit de `main`, executor) e tabela vazia `Etapa | Estado | Prova`.
- **Prova:** arquivo existe.
- **Pronto quando:** commit `chore(vercel): registro de execucao do plano (V001)`.

### V002 — Liberar escopo do token Vercel para o projeto (destrava A14)
- **Tipo:** Joaquim
- **Faça:** pedir ao Joaquim para reconectar o MCP Vercel autorizando o time `juca1` **e** o projeto `zapp_web_v2` (o erro do `web_fetch_vercel_url` diz "update their Vercel connection to authorize the deployment's project and team").
- **Prova:** `mcp__Vercel__get_runtime_logs(projectId=prj_J4wb…, teamId=team_QyN4…, since="1h")` responde sem 403.
- **Pronto quando:** as 4 rotas abaixo respondem: `get_runtime_logs`, `get_runtime_errors`, `list_deployment_events`, `web_fetch_vercel_url`. Enquanto não: etapas que dependem delas registram `NÃO VERIFICADO`.

### V003 — Snapshot "antes" do projeto
- **Tipo:** MCP-Vercel (leitura)
- **Faça:** `get_project(idOrName="zapp_web_v2")` + `list_project_domains` + `filter_project_envs` (sem decrypt). Salvar **só chaves, targets, gitBranch, type, configurationId** (nunca `value`) em `docs/audits/vercel-snapshot-2026-10-18-antes.json`.
- **Prova:** `grep -c '"value"' docs/audits/vercel-snapshot-2026-10-18-antes.json` = 0.
- **Pronto quando:** commit `chore(vercel): snapshot antes (V003)`.

### V004 — Log de build dos 3 deploys de produção com ERROR
- **Tipo:** MCP-Vercel (leitura) — depende de V002
- **Faça:** `list_deployment_events(idOrUrl=…, direction="backward", limit=60)` para `dpl_FM69Zxz8qTffNhtLQ3XkhHR9Fa3Z`, `dpl_BqKVTym1Cmf2WxEmYLF646LWN9Yc`, `dpl_F4GCrNUfLZESnkTW8mLeHFW6YHRw`. Extrair a linha de erro.
- **Prova:** a mensagem de erro de cada um registrada no `.execucao.md`.
- **Pronto quando:** causa raiz classificada (tipo/TS, dependência, limite, config). Se a causa ainda existir em `main`, abrir etapa extra antes da V005.

### V005 — Confirmar que a `main` atual builda
- **Tipo:** Código
- **Faça:** `bun install --frozen-lockfile --ignore-scripts && bun run build` no clone, em `main` atualizada.
- **Prova:** exit 0 e `dist/index.html` existe.
- **Pronto quando:** build verde registrado (tempo em segundos).

### V006 — Medir composição do `dist/`
- **Tipo:** Código
- **Faça:** `du -sh dist; find dist -name '*.map' | wc -l; du -ch dist/assets/*.map | tail -1; ls dist | head -50`.
- **Prova:** números registrados (total, nº de `.map`, peso dos `.map`).
- **Pronto quando:** baseline salvo para comparar na V104.

### V007 — Baseline de custo do projeto (7 dias)
- **Tipo:** MCP-Vercel (leitura)
- **Faça:** `list_billing_charges` em janelas de **1 dia** (a de 30 dias estoura 4 MB) de 11/10 a 18/10; somar `Build CPU Minutes`, `Deployment Storage`, `Fast Data Transfer`, `CDN Requests`. Se o registro trouxer tag de projeto, filtrar `zapp_web_v2`.
- **Prova:** tabela dia × serviço no `.execucao.md`.
- **Pronto quando:** custo médio diário de build anotado (referência: US$ 0,714 em 16→17/10).

### V008 — Baseline de volume de deploys
- **Tipo:** MCP-Vercel (leitura)
- **Faça:** `list_deployments(projectId="zapp_web_v2", since=<7 dias atrás em ms>, limit=100)` paginando; contar por `target` (production/null) e `state`.
- **Prova:** contagens registradas.
- **Pronto quando:** baseline "deploys/dia" e "% ERROR" anotados.

### V009 — Classificar commits que geraram preview
- **Tipo:** Código
- **Faça:** para os SHAs da V008, `git diff --name-only <sha>^ <sha>` e classificar: toca front (`src/`, `public/`, `index.html`, `package.json`, `bun.lock`, `vite.config.ts`, `vercel.json`, `tailwind.config.ts`, `postcss.config.js`, `tsconfig*.json`, `components.json`) ou não.
- **Prova:** % de deploys que **não** tocam front.
- **Pronto quando:** número registrado (justifica a Fase 4).

### V010 — Verificar proteção do alias de produção
- **Tipo:** MCP-Vercel (leitura) — depende de V002
- **Faça:** `web_fetch_vercel_url("https://zapp-web-v2.vercel.app/version.json")` e conferir se a resposta é o JSON do build ou tela de login Vercel.
- **Prova:** corpo da resposta (só o `buildId`).
- **Pronto quando:** registrado se `zapp-web-v2.vercel.app` é público (esperado: público).

### V011 — Conferir `buildId` em produção = SHA do último deploy READY
- **Tipo:** MCP-Vercel (leitura)
- **Faça:** comparar `buildId` da V010 com `githubCommitSha` do último deploy `target=production` `READY`.
- **Prova:** igualdade.
- **Pronto quando:** confirmado; divergência = alias apontando para deploy errado → parar e reportar.

### V012 — Fechar Fase 1
- **Tipo:** Código
- **Faça:** atualizar `.execucao.md` com V001–V011.
- **Pronto quando:** commit `chore(vercel): fase 1 concluida (V012)`.

---

## FASE 2 — Domínio próprio, DNS e CORS (V013–V040) — **P0**

> Decisão técnica (tomada pelo tech lead, sem custo): **domínio canônico = `zappweb.app.br` (apex)**,
> `www` redireciona 308 para o apex. Motivo: o apex já está no CORS, no `allowed-origins.json` e no
> smoke das edges — zero mudança de código de edge function. Inverter o redirect atual (apex→www).

### V013 — Confirmar onde o DNS está hospedado
- **Tipo:** MCP-Vercel (leitura)
- **Faça:** `get_domain_config(domain="zappweb.app.br", strict="true")` e idem para `www.zappweb.app.br`.
- **Prova:** `nameservers` = `e.sec.dns.br`/`f.sec.dns.br` (Registro.br), `aValues` = `209.142.67.51`, `misconfigured: true`.
- **Pronto quando:** estado registrado.

### V014 — Identificar o que responde hoje em `209.142.67.51`
- **Tipo:** Código
- **Faça:** `curl -sI --max-time 10 http://209.142.67.51 -H 'Host: zappweb.app.br'` (se o proxy bloquear, registrar e seguir).
- **Prova:** cabeçalho `Server` ou bloqueio registrado.
- **Pronto quando:** sabido se há outro serviço (parking do registrador, hospedagem antiga) — entra no pedido da V016.

### V015 — Checar registros que não podem ser perdidos
- **Tipo:** Joaquim (informação)
- **Faça:** pedir ao Joaquim print/lista da zona DNS de `zappweb.app.br` no Registro.br (MX, TXT/SPF/DKIM, outros subdomínios).
- **Pronto quando:** lista recebida. **Sem ela não mexer no DNS** (risco de derrubar e-mail).

### V016 — Pedido de ajuste de DNS (uma mensagem só)
- **Tipo:** Joaquim
- **Faça:** enviar ao Joaquim, em linguagem de negócio, exatamente:
  - `zappweb.app.br` → registro **A** = `76.76.21.21` (remover `209.142.67.51`);
  - `www.zappweb.app.br` → **CNAME** = `cname.vercel-dns.com.` (remover o A atual);
  - manter MX/TXT da V015 intactos.
- **Pronto quando:** Joaquim confirma que salvou.

### V017 — Inverter o redirect (apex canônico)
- **Tipo:** MCP-Vercel (escrita)
- **Faça:** remover o `redirect` de `zappweb.app.br` e configurar `www.zappweb.app.br` com `redirect: "zappweb.app.br"`, `redirectStatusCode: 308`. Ferramenta: não há `update_project_domain` no MCP → fallback `vercel api /v9/projects/prj_J4wb8egzz8iL1CJnSOXJDtqnbvRp/domains/<domínio> --method PATCH` com `{"redirect":…, "redirectStatusCode":308}`; sem CLI autenticada → pedir ao Joaquim em `https://vercel.com/juca1/zapp_web_v2/settings/domains`.
- **Prova:** `list_project_domains` mostra apex `redirect: null` e `www` `redirect: "zappweb.app.br"`.
- **Pronto quando:** estado confirmado por leitura.

### V018 — Verificar propagação e certificado
- **Tipo:** MCP-Vercel (leitura)
- **Faça:** repetir `get_domain_config` para os dois nomes a cada execução até `misconfigured: false` (no máximo 3 tentativas nesta sessão; depois registrar `aguardando propagação` e seguir).
- **Prova:** `misconfigured: false` nos dois.
- **Pronto quando:** ambos corretos.

### V019 — Garantir alias de produção nos dois nomes
- **Tipo:** MCP-Vercel (leitura)
- **Faça:** `get_deployment(<último production READY>)` → campo `alias` contém `zappweb.app.br` e `www.zappweb.app.br`.
- **Pronto quando:** confirmado.

### V020 — CORS: tornar o `www` explícito também (defesa)
- **Tipo:** Código
- **Faça:** mesmo com redirect, o navegador pode chegar ao `www` por cache/HSTS antigo. Adicionar `'https://www.zappweb.app.br'` em `EXACT_ALLOWED_ORIGINS` (`supabase/functions/_shared/cors-origins.ts`) **e** em `scripts/edge-deploy/allowed-origins.json` → `exact` (são espelhos obrigatórios, ver comentário W61).
- **Prova:** `grep -n "www.zappweb" supabase/functions/_shared/cors-origins.ts scripts/edge-deploy/allowed-origins.json` → 2 linhas.
- **Pronto quando:** diff de 2 linhas.

### V021 — Testes de CORS
- **Tipo:** Código
- **Faça:** localizar testes existentes (`grep -rln "EXACT_ALLOWED_ORIGINS\|allowed-origins" supabase scripts tests`) e acrescentar caso `www` aceito; rodar a suíte que os contém (deno test do arquivo ou `node --test` do unit `.mjs`).
- **Prova:** testes verdes.
- **Pronto quando:** commit `fix(cors): aceita www.zappweb.app.br (V020-V021)`.

### V022 — Mudar o `FALLBACK_ORIGIN` para o canônico?
- **Tipo:** Decisão técnica (registrar, não mudar agora)
- **Faça:** manter `https://zapp-web-v2.vercel.app` como fallback até V018 concluída; após o domínio funcionar por 7 dias, trocar para `https://zappweb.app.br` (V185).
- **Pronto quando:** decisão registrada no `.execucao.md`.

### V023 — Deploy das edge functions com o CORS novo
- **Tipo:** Lote do dia (sessão que fez o push)
- **Faça:** após merge, disparar `deploy-functions.yml` (exige aprovação do Joaquim no environment `producao-edge-functions`). **Merge não deploya edge** (CLAUDE.md).
- **Prova:** run concluído `success` + smoke de CORS do próprio workflow listando a origem nova.
- **Pronto quando:** run verde registrado.

### V024 — Supabase Auth: Site URL e Redirect URLs
- **Tipo:** Joaquim (o MCP do projeto não altera config de Auth)
- **Faça:** pedir ao Joaquim para conferir em `https://supabase.com/dashboard/project/tnnnlkbymytvtqngbbqh/auth/url-configuration`: Site URL = `https://zappweb.app.br`; Redirect URLs contém `https://zappweb.app.br/**`, `https://www.zappweb.app.br/**`, `https://zapp-web-v2.vercel.app/**`, `https://zappwebv2-*-juca1.vercel.app/**`.
- **Pronto quando:** confirmado. Sem isso, reset de senha/magic link/OAuth apontam para o domínio errado.

### V025 — Origem dos links de e-mail gerados no front
- **Tipo:** Código
- **Faça:** `grep -rn "redirectTo\|emailRedirectTo\|window.location.origin" src --include=*.ts --include=*.tsx | grep -v test | head -30`; confirmar que usam `window.location.origin` (e não domínio fixo).
- **Prova:** lista revisada.
- **Pronto quando:** nenhum domínio Vercel fixo; se houver, corrigir para `window.location.origin` (diff mínimo).

### V026 — Domínios fixos no código
- **Tipo:** Código
- **Faça:** `grep -rn "zapp-web-v2.vercel.app\|zappweb.app.br" src supabase/functions public index.html | grep -v test`.
- **Prova:** lista.
- **Pronto quando:** cada ocorrência classificada (CORS = ok; links absolutos para usuário → trocar para o canônico).

### V027 — Links do Talk X (`/l/:slug`) no domínio canônico
- **Tipo:** Código (leitura)
- **Faça:** `grep -rn "/l/" supabase/functions/talkx-* src/components/talkx | head`; identificar qual base de URL gera o link curto enviado ao cliente final.
- **Prova:** arquivo:linha da montagem do link.
- **Pronto quando:** registrado se a base é configurável (secret/settings) ou fixa.

### V028 — Base do link curto = domínio canônico
- **Tipo:** Código ou Joaquim
- **Faça:** se fixa no código e apontando para `.vercel.app`, trocar para `https://zappweb.app.br` (só após V018); se for secret de edge, preparar pedido ao Joaquim com nome do secret e valor.
- **Pronto quando:** link curto novo sai com o domínio próprio.

### V029 — Smoke do rewrite `/l/:slug`
- **Tipo:** MCP-Vercel (leitura) — depende de V002
- **Faça:** `web_fetch_vercel_url("https://zapp-web-v2.vercel.app/l/<slug-de-teste-existente>")` (pegar slug real via `SELECT slug FROM talkx_links LIMIT 1` — confirme o nome da tabela no catálogo antes).
- **Prova:** resposta 3xx para o destino ou corpo esperado da `talkx-link`.
- **Pronto quando:** comportamento registrado.

### V030 — Manifest/PWA no domínio novo
- **Tipo:** Código (leitura)
- **Faça:** conferir `public/manifest.json` (`start_url: "/"`, `scope: "/"`) — relativo, ok. Nada a mudar se continuar relativo.
- **Pronto quando:** registrado.

### V031 — Allowlist de origem em outras edges / webhooks
- **Tipo:** Código
- **Faça:** `grep -rn "vercel.app" supabase/functions --include=*.ts | grep -v cors-origins | head`.
- **Pronto quando:** toda ocorrência fora do CORS central revisada; adicionar o canônico onde houver lista própria.

### V032 — CSP `connect-src`/`form-action` com domínio próprio
- **Tipo:** Código (leitura)
- **Faça:** CSP usa `'self'` — já cobre os dois nomes. Registrar "nada a fazer".
- **Pronto quando:** registrado.

### V033 — Teste E2E de fumaça no domínio próprio (opcional após propagação)
- **Tipo:** Código
- **Faça:** se `e2e/` tiver spec de login com base configurável (`PLAYWRIGHT_BASE_URL`/similar), registrar comando para o Joaquim/CI rodar contra `https://zappweb.app.br`. Não rodar contra produção daqui sem autorização.
- **Pronto quando:** comando registrado.

### V034 — Atualizar `docs/` que citam o domínio
- **Tipo:** Código
- **Faça:** `grep -rln "zapp-web-v2.vercel.app" README.md docs/POP-*.md 2>/dev/null` → trocar para o canônico **só** em documentação de uso (POP), não em histórico de auditoria.
- **Pronto quando:** commit `docs: dominio canonico zappweb.app.br (V034)`.

### V035 — HSTS no domínio próprio
- **Tipo:** Código (verificação)
- **Faça:** após V018, `web_fetch_vercel_url("https://zappweb.app.br/")` e conferir `strict-transport-security` (a Vercel envia por padrão `max-age=63072000`).
- **Pronto quando:** presente. **Não** adicionar `preload` (irreversível na prática).

### V036 — Redirect `http→https` e `www→apex`
- **Tipo:** Verificação
- **Faça:** conferir 308 de `http://www.zappweb.app.br` para `https://zappweb.app.br`.
- **Pronto quando:** registrado.

### V037 — Remover a origem do `zappwebv2-juca1.vercel.app` do uso cotidiano
- **Tipo:** Decisão registrada
- **Faça:** o alias padrão `zappwebv2-juca1.vercel.app` não está no CORS (de propósito, W61). Registrar no CLAUDE.md (V180) que ele não deve ser usado por usuários.
- **Pronto quando:** registrado.

### V038 — Comunicar a URL oficial
- **Tipo:** Joaquim (informação)
- **Faça:** depois de V018+V023+V024, avisar o Joaquim: "URL oficial = https://zappweb.app.br".
- **Pronto quando:** avisado.

### V039 — Monitor de domínio
- **Tipo:** Código
- **Faça:** acrescentar no script de verificação da Fase 7 (V160) a checagem `get_domain_config(...).misconfigured === false`.
- **Pronto quando:** coberto pela V160.

### V040 — Fechar Fase 2
- **Tipo:** Código
- **Faça:** atualizar `.execucao.md`.
- **Pronto quando:** commit `chore(vercel): fase 2 concluida (V040)`.

---

## FASE 3 — Segredos e variáveis de ambiente (V041–V075) — **P0/P1**

### V041 — Descobrir o banco das variáveis da integração
- **Tipo:** MCP-Vercel (leitura)
- **Faça:** `get_configuration(id="icfg_l6F3AhnOcvXqyj1eMSD7Jpxb")` (ou `list_integration_configurations`) — identificar qual projeto Supabase foi conectado (sem decrypt). Se só o valor revelar, **não** decriptar: registrar "projeto desconhecido".
- **Prova:** nome/ref do projeto Supabase ou "desconhecido".
- **Pronto quando:** registrado.

### V042 — Confirmar que nada no repo lê essas variáveis
- **Tipo:** Código
- **Faça:** `grep -rn "POSTGRES_\|SUPABASE_SERVICE_ROLE_KEY\|SUPABASE_JWT_SECRET\|SUPABASE_SECRET_KEY\|NEXT_PUBLIC_" src vite.config.ts vercel.json index.html`.
- **Prova:** zero ocorrências em código de build do front.
- **Pronto quando:** confirmado.

### V043 — Desconectar a integração Supabase do projeto `zapp_web_v2`
- **Tipo:** MCP-Vercel (escrita) ou Joaquim
- **Faça:** remover o projeto `zapp_web_v2` da integração `icfg_l6F3…` (Settings → Integrations → Supabase → Manage → Projects). Se a integração atende outros projetos do time, **só** desvincular este projeto.
- **Prova:** `filter_project_envs` não lista mais nenhuma variável com `configurationId: icfg_l6F3…`.
- **Pronto quando:** 0 variáveis da integração.

### V044 — Remover sobras manuais (se a desconexão não apagar)
- **Tipo:** MCP-Vercel (escrita) / CLI / Joaquim
- **Faça:** para cada id restante (`76LLP36xC5ZwIoof`, `MhtHaQCeRDfCpCn3`, `lbGgfYLPa1OdWeHc`, `JpOdQwp1M5SorPEK`, `v6ftIG4o86RoCzrZ`, `8pog6ZmfPeQhxtya`, `cC3ArC4oVSsL6C5b`, `3oVLNkoOt5CRqoKJ`, `DD3GymNFl8gZOZ5h`, `sgAgl7w2pzvP34KQ`, `96Ee6DNvoC2lpw6W`, `EyaPPL3QMgyaZ9oY`, `Q75ew0Ch8IH5d228`, `2pRjfCD3WT9Qn6h9`, `jI1tj23mfqnpwrss`, `11sgXxSQ3hRwfxeV`): `vercel env rm` / `vercel api /v9/projects/prj_J4wb…/env/<id> --method DELETE`; sem CLI → lista para o Joaquim.
- **Prova:** `filter_project_envs` sem essas chaves.
- **Pronto quando:** zero.

### V045 — Rotação dos segredos expostos
- **Tipo:** Joaquim (decisão)
- **Faça:** informar ao Joaquim: `service_role`, `JWT secret` e senha Postgres do projeto da V041 ficaram legíveis por qualquer membro do time Vercel desde 25/09. Recomendação: rotacionar se o projeto for de produção. Rotação é exclusiva dele.
- **Pronto quando:** decisão registrada (rotacionar / aceitar risco).

### V046 — Confirmar que o projeto não tem functions
- **Tipo:** Código
- **Faça:** `ls api 2>/dev/null; grep -n '"functions"' vercel.json`; e `get_deployment(<prod>)` campo `type` (hoje `LAMBDAS` é o rótulo padrão) — conferir que a saída é estática.
- **Pronto quando:** confirmado "sem serverless".

### V047 — Remover `OPENAI_API_KEY`
- **Tipo:** MCP-Vercel (escrita)/CLI/Joaquim
- **Faça:** apagar `JdqHZbHPEBMa3leb`. A chave real das IAs vive nos secrets das edge functions (Supabase), não na Vercel.
- **Prova:** `filter_project_envs` sem a chave.
- **Pronto quando:** removida.

### V048 — Remover `ANTHROPIC_API_KEY` (`ijQ3uQmqjg5z25jL`)
- **Tipo:** idem V047
- **Pronto quando:** removida.

### V049 — Remover `GROQ_API_KEY` (`ZOrarBIwm1r3Mejt`)
- **Tipo:** idem V047
- **Pronto quando:** removida.

### V050 — Remover `EVOLUTION_API_KEY` (`KeQiwRP7W9xhSWdY`)
- **Tipo:** idem V047 (a chave da Evolution GO vive em secret de edge, CLAUDE.md seção 2)
- **Pronto quando:** removida.

### V051 — Remover `EVOLUTION_API_URL` (`5oQlrV2pZA6mtvS3`)
- **Tipo:** idem V047
- **Pronto quando:** removida.

### V052 — Recomendar rotação das chaves de IA/Evolution
- **Tipo:** Joaquim (decisão)
- **Faça:** se os valores na Vercel forem os mesmos das edges, ficaram em local desnecessário. Recomendação de rotação = decisão do Joaquim.
- **Pronto quando:** registrada.

### V053 — Inventário definitivo de `VITE_*` lidas
- **Tipo:** Código
- **Faça:** `grep -rhoE "import\.meta\.env\.[A-Z0-9_]+|VITE_[A-Z0-9_]+" src vite.config.ts | sort -u` + procurar acesso dinâmico `import.meta.env\[`.
- **Prova:** lista final salva no `.execucao.md`.
- **Pronto quando:** lista fechada (base para V054–V066).

### V054 — `VITE_LOG_LEVEL` é lida?
- **Tipo:** Código
- **Faça:** `grep -rn "LOG_LEVEL" src/lib/logger* src/lib/*.ts`.
- **Pronto quando:** se lida → manter `warn`; se não → incluir na remoção (V058).

### V055 — `VITE_SENTRY_*`
- **Tipo:** Código + decisão técnica
- **Faça:** `grep -rni "sentry" src package.json`. Hoje nada lê o DSN → remover `VITE_SENTRY_DSN` (`fj3Tb29DJ1yV0LsN`) e `VITE_SENTRY_ENVIRONMENT` (`AdhkR0emaYivkR0y`).
- **Pronto quando:** removidas (ou mantidas se a V053 achar leitor).

### V056 — `VITE_CLIENTES_SUPABASE_*`
- **Tipo:** Código
- **Faça:** `grep -rn "CLIENTES\|pgxfvjmuubtbowutlide" src | head` — o client externo usa outro mecanismo? Se nada lê → remover `NGKqJjJqKquVkOp8` e `hJyy1CodQu3pj2u2`.
- **Pronto quando:** decidido por evidência.

### V057 — `VITE_EVOLUTION_API_URL` (`W1VC8RAz9MLt87It`)
- **Tipo:** Código
- **Faça:** confirmar zero leitura; remover (expor a URL da Evolution no bundle não tem uso).
- **Pronto quando:** removida.

### V058 — `VITE_APP_NAME`, `VITE_APP_ENV`, `VITE_ENABLE_*` (6 chaves)
- **Tipo:** MCP-Vercel (escrita)/CLI/Joaquim
- **Faça:** remover `hqnzJQ5zOoEzsRuU`, `jlaJxTimoz43RzlZ`, `u77A1o3jFngjMJun`, `beA9B5mZYm8Rvzq4`, `ta5nqn6AhVqnclc3`, `WExfHCHARYGiPrj4` (e `VITE_LOG_LEVEL` se V054 = não lida).
- **Pronto quando:** removidas.

### V059 — `VITE_SUPABASE_URL` (`i6IxbjGSSfcEZ0rP`)
- **Tipo:** Código + MCP-Vercel
- **Faça:** o client ignora de propósito; `src/hooks/integrations/useTalkXTemplates.ts:194` cita o mesmo motivo. Remover a variável elimina a armadilha ("a hospedagem injeta apontando para outro projeto"). Antes, conferir `grep -rn "VITE_SUPABASE_URL" src --include=*.ts* | grep -v test | grep -v "//"` = só comentários.
- **Pronto quando:** removida, e comentários de `client.ts`/`supabase.ts` mantidos (continuam corretos).

### V060 — `VITE_CRM_INTEGRATION_ENABLED` (lida, não configurada)
- **Tipo:** Código (leitura) + Joaquim (negócio)
- **Faça:** ler `src/integrations/supabase/externalClient.ts:1-40`; descrever ao Joaquim o efeito atual (integração CRM ligada/desligada em produção) e recomendar.
- **Pronto quando:** decisão registrada; se "ligar", criar a variável `Production` via `create_project_env` (type `plain`, valor `true`).

### V061 — `VITE_SEARCHBOX_MONTHLY_SESSION_LIMIT`
- **Tipo:** Código (leitura)
- **Faça:** ler `src/lib/mapboxCostGuard.ts:15-40`; registrar o default efetivo e se ele é o desejado (guarda de custo Mapbox).
- **Pronto quando:** registrado; criar variável só se o default for inadequado.

### V062 — `VITE_APP_VERSION`
- **Tipo:** Código
- **Faça:** só usado no kit de dev (`TalkXKit.tsx`). Nada a configurar. Registrar.
- **Pronto quando:** registrado.

### V063 — Ambiente Development
- **Tipo:** Decisão registrada
- **Faça:** nenhuma variável tem target `development`; desenvolvimento usa banco local (CLAUDE.md seção 0). Não criar.
- **Pronto quando:** registrado.

### V064 — Tipos das variáveis restantes
- **Tipo:** MCP-Vercel (escrita)
- **Faça:** variáveis públicas (`VITE_*` que vão para o bundle) devem ser `plain`; marcadas como `sensitive` só atrapalham auditoria. Para cada `VITE_*` restante com `type: sensitive`, recriar como `plain` (valor via Joaquim se não for conhecido; nunca decriptar).
- **Pronto quando:** restantes com tipo coerente, ou registrado "mantido".

### V065 — Snapshot "depois" de envs
- **Tipo:** MCP-Vercel (leitura)
- **Faça:** repetir V003 → `docs/audits/vercel-snapshot-2026-10-18-depois-envs.json`.
- **Prova:** `securityIssues` não contém `readable-secret` em nenhuma linha.
- **Pronto quando:** commit `chore(vercel): snapshot pos-limpeza de envs (V065)`.

### V066 — Redeploy de produção após a limpeza
- **Tipo:** MCP-Vercel (escrita)
- **Faça:** variáveis só entram em build novo. Disparar redeploy do último production `READY` (`create_deployment` com `deploymentId` de origem / `request_promote`) **ou** aguardar o próximo merge em `main`.
- **Prova:** novo deploy `READY` + `version.json` (V010) com SHA esperado.
- **Pronto quando:** produção rebuildada sem as variáveis.

### V067 — Smoke funcional pós-limpeza
- **Tipo:** MCP-Vercel (leitura) — depende de V002
- **Faça:** `get_runtime_errors(since="2h")` + `web_fetch_vercel_url` de `/` e `/version.json`.
- **Pronto quando:** sem erro novo.

### V068 — Guard de variáveis no repositório
- **Tipo:** Código
- **Faça:** criar `scripts/ci/vercel-env-baseline.json` com a **lista de chaves** esperadas por target (sem valores) e `scripts/ci/vercel-env-baseline.unit.mjs` que valida: toda chave `VITE_*` lida no `src/` está no baseline ou tem default documentado; nenhuma chave do baseline fora do padrão `VITE_*`.
- **Prova:** `node --test scripts/ci/vercel-env-baseline.unit.mjs` verde.
- **Pronto quando:** commit `feat(ci): baseline de envs da Vercel (V068)`.

### V069 — Plugar o unit no runner existente
- **Tipo:** Código
- **Faça:** conferir como `scripts/ci/*.unit.mjs` é executado no CI (`grep -n "unit.mjs" .github/workflows/ci.yml package.json`) e garantir que o novo arquivo entra no mesmo glob, sem novo job.
- **Pronto quando:** aparece no runner existente.

### V070 — Proibir segredo de servidor na Vercel (regra escrita)
- **Tipo:** Código (doc)
- **Faça:** registrar na seção Vercel do CLAUDE.md (V180): "Vercel só guarda `VITE_*` públicas. Chave de servidor vai para secret de edge function."
- **Pronto quando:** coberto na V180.

### V071 — `.env.example` coerente
- **Tipo:** Código
- **Faça:** `ls .env*`; se existir `.env.example`, alinhar com o baseline da V068 (só nomes, sem valores reais).
- **Pronto quando:** coerente ou "não existe".

### V072 — Variável por branch
- **Tipo:** MCP-Vercel (leitura)
- **Faça:** `filter_project_envs` → nenhuma linha com `gitBranch` preenchido deve restar.
- **Pronto quando:** zero.

### V073 — Shared env vars do time
- **Tipo:** MCP-Vercel (leitura)
- **Faça:** verificar se há variáveis compartilhadas do time ligadas a `zapp_web_v2` (`get_shared_env_var`/painel). Registrar.
- **Pronto quando:** registrado.

### V074 — Revisar membros com acesso ao projeto
- **Tipo:** MCP-Vercel (leitura)
- **Faça:** `list_team_members` — registrar quantos membros e papéis (as variáveis "readable-secret" eram visíveis a todos).
- **Pronto quando:** registrado (decisão de seats é do Joaquim, fora deste plano).

### V075 — Fechar Fase 3
- **Pronto quando:** `.execucao.md` atualizado + commit `chore(vercel): fase 3 concluida (V075)`.

---

## FASE 4 — Economia de build (V076–V100) — **P1 custo**

### V076 — Script `ignoreCommand`
- **Tipo:** Código
- **Faça:** criar `scripts/vercel/ignore-build.sh` (POSIX `sh`, sem bashismos):
  - exit **1** (= construir) se `VERCEL_ENV=production` **e** o diff tocar front;
  - exit **1** se o diff tocar front em preview;
  - exit **0** (= pular) caso contrário;
  - base do diff: `$VERCEL_GIT_PREVIOUS_SHA` se existir no clone (`git cat-file -e`), senão `HEAD^`; se nenhum existir (primeiro commit da branch / clone raso), **construir** (fail-open).
  - lista de caminhos de front: `src/ public/ index.html package.json bun.lock vite.config.ts vercel.json tailwind.config.ts postcss.config.js tsconfig.json tsconfig.app.json tsconfig.node.json components.json scripts/vercel/`.
- **Prova:** `sh -n scripts/vercel/ignore-build.sh` ok.
- **Pronto quando:** arquivo com `+x`.

### V077 — Testes do script
- **Tipo:** Código
- **Faça:** `scripts/vercel/ignore-build.unit.mjs` com `node:test`: cria repo git temporário, commits que tocam só `docs/` (espera 0), `src/` (espera 1), `vercel.json` (espera 1), sem base (espera 1).
- **Prova:** `node --test scripts/vercel/ignore-build.unit.mjs` verde.
- **Pronto quando:** 4 casos verdes.

### V078 — Validar contra o histórico real
- **Tipo:** Código
- **Faça:** rodar o script para os SHAs da V009 (simulando `VERCEL_GIT_PREVIOUS_SHA=<sha^>`), comparar com a classificação da V009.
- **Prova:** 100% de concordância.
- **Pronto quando:** registrado "% de builds que seriam pulados".

### V079 — Ligar no `vercel.json`
- **Tipo:** Código
- **Faça:** adicionar `"ignoreCommand": "sh scripts/vercel/ignore-build.sh"` ao `vercel.json`.
- **Prova:** `node -e "JSON.parse(require('fs').readFileSync('vercel.json','utf8')).ignoreCommand"`.
- **Pronto quando:** commit `feat(vercel): pula build sem mudanca de front (V076-V079)`.

### V080 — Provar no preview do próprio PR
- **Tipo:** MCP-Vercel (leitura)
- **Faça:** no PR do lote, um commit só de `docs/` → deploy com estado `CANCELED`/"Ignored Build Step"; commit que toca `vercel.json` → `READY`.
- **Prova:** `list_deployments(branch=<branch do PR>)` mostrando os dois estados.
- **Pronto quando:** os dois comportamentos vistos.

### V081 — Status do GitHub com build ignorado
- **Tipo:** Verificação
- **Faça:** confirmar que o status `Vercel` no commit ignorado fica `success` ("Ignored") e não `pending` eterno (não é required check, mas não deve parecer travado).
- **Pronto quando:** registrado.

### V082 — Produção: não pular quando muda dependência
- **Tipo:** Código (revisão)
- **Faça:** confirmar que `package.json`/`bun.lock` estão na lista (atualização do Dependabot precisa rebuildar).
- **Pronto quando:** confirmado.

### V083 — Previews de branches de agente sem PR
- **Tipo:** Decisão técnica (registrar)
- **Faça:** avaliar desligar preview para branches sem PR via `git.deploymentEnabled` (`{"main": true, "claude/**": false, …}`). **Não aplicar**: previews são usados para QA de PR e o `ignoreCommand` já remove o grosso. Reavaliar na V098 com os números.
- **Pronto quando:** registrado.

### V084 — Fila de build
- **Tipo:** MCP-Vercel (leitura)
- **Faça:** registrar `buildQueueConfiguration` (hoje compatível com `SKIP_NAMESPACE_QUEUE`) e se builds concorrentes estão sendo enfileirados (tempo entre `created` e `buildingAt` nos deploys da V008).
- **Pronto quando:** média de espera registrada.

### V085 — Máquina de build
- **Tipo:** MCP-Vercel (leitura)
- **Faça:** registrar tipo de máquina (padrão). Build da produção levou ~21 s (`buildingAt`→`ready`); **não** subir para máquina maior (custo sem ganho).
- **Pronto quando:** registrado.

### V086 — Cancelar builds obsoletos da mesma branch
- **Tipo:** MCP-Vercel (escrita)
- **Faça:** verificar no painel (Settings → Git) a opção de cancelar deploys anteriores da mesma branch quando chega commit novo; ligar se existir e estiver desligada (via `update_project` se o campo existir; senão Joaquim).
- **Pronto quando:** ligado ou registrado "indisponível".

### V087 — `installCommand` com cache
- **Tipo:** Verificação
- **Faça:** confirmar no log de build (V004, deploy READY) que o cache de `node_modules` é restaurado ("Restored build cache").
- **Pronto quando:** registrado.

### V088 — Source maps fora do build de produção
- **Tipo:** Código
- **Faça:** em `vite.config.ts`, `sourcemap: isProd ? "hidden" : true` → `sourcemap: isProd ? false : true` e atualizar o comentário (sem Sentry configurado; reativar quando houver upload de maps). Diff de ~4 linhas.
- **Prova:** `bun run build && find dist -name '*.map' | wc -l` = 0.
- **Pronto quando:** commit `perf(build): sem source maps publicos em producao (V088)`.

### V089 — Medir ganho da V088
- **Tipo:** Código
- **Faça:** comparar tempo de build e tamanho do `dist/` com V005/V006.
- **Pronto quando:** números registrados.

### V090 — Orçamento de bundle continua verde
- **Tipo:** Código
- **Faça:** `node scripts/ci/bundle-budget.mjs` (ver uso no `ci.yml`).
- **Pronto quando:** verde.

### V091 — `reportCompressedSize:false` e `optimizeDeps.force`
- **Tipo:** Código (revisão)
- **Faça:** `optimizeDeps.force: true` só afeta `vite dev`; registrar que não pesa no build Vercel. Não mexer.
- **Pronto quando:** registrado.

### V092 — Retenção de deploys
- **Tipo:** MCP-Vercel (escrita) ou Joaquim
- **Faça:** configurar retenção: Preview 30 dias, Production 1 ano (mantém candidatos a rollback), Canceled/Errored 7 dias (Settings → Security → Deployment Retention).
- **Prova:** leitura do projeto mostrando a política (ou print do Joaquim).
- **Pronto quando:** aplicada.

### V093 — Build duplicado CI × Vercel
- **Tipo:** Decisão registrada
- **Faça:** o job `🏗️ Build` do `ci.yml` é check obrigatório e roda o mesmo `vite build`. Manter (é a trava do merge). Registrar que a Vercel não substitui o check.
- **Pronto quando:** registrado.

### V094 — Preview só com assets (sem functions)
- **Tipo:** Verificação
- **Faça:** confirmar no billing que `Function Invocations`/`Fluid Active CPU` são ~0 para o projeto (são de outro projeto do time).
- **Pronto quando:** registrado.

### V095 — Medir 7 dias depois
- **Tipo:** MCP-Vercel (leitura) — agendar
- **Faça:** repetir V007/V008 sete dias após o merge da V079.
- **Pronto quando:** redução de `Build CPU Minutes` registrada (meta: −60%).

### V096 — Se a meta não for atingida
- **Tipo:** Decisão técnica
- **Faça:** se redução < 40%, aplicar a alternativa da V083 (desligar preview de `claude/**`, `dia/**` sem PR) com aval do Joaquim.
- **Pronto quando:** decidido.

### V097 — Documentar o ignore no CLAUDE.md
- **Pronto quando:** coberto na V180 (linha "commit só de docs/CI não gera deploy").

### V098 — Revisar a lista de caminhos a cada novo arquivo de config
- **Tipo:** Código
- **Faça:** adicionar ao `vercel-config.unit.mjs` (V156) asserção de que todo arquivo de config na raiz lido pelo Vite (`vite.config.ts`, `tailwind.config.ts`, `postcss.config.js`, `tsconfig*.json`, `index.html`) está na lista do `ignore-build.sh`.
- **Pronto quando:** coberto na V156.

### V099 — Comunicar economia
- **Tipo:** Joaquim (informação)
- **Faça:** uma linha com custo antes/depois.
- **Pronto quando:** enviado após V095.

### V100 — Fechar Fase 4
- **Pronto quando:** `.execucao.md` + commit `chore(vercel): fase 4 concluida (V100)`.

---

## FASE 5 — Cache, cabeçalhos e performance de entrega (V101–V125)

### V101 — Mapear tudo que sai em `dist/` fora de `assets/`
- **Tipo:** Código
- **Faça:** `cd dist && find . -type f ! -path './assets/*' | sort`.
- **Prova:** lista (esperado: `index.html`, `version.json`, `favicon.*`, `apple-touch-icon.png`, `icons/*`, `manifest.json`, `notification.mp3`, `patterns/*`, `vendor/*`, `robots.txt`, `placeholder.svg`).
- **Pronto quando:** lista registrada.

### V102 — Desenhar a política de cache (regras mutuamente exclusivas)
- **Tipo:** Decisão técnica (aplicada na V103)
- **Faça:** três classes:
  1. `/assets/(.*)` (hash no nome) → `public, max-age=31536000, immutable`;
  2. estáticos sem hash e versionados no nome (`/vendor/(.*)`, `/patterns/(.*)`) → `public, max-age=31536000, immutable` (nome já carrega versão: `lamejs-1.2.1`, `chat-brindes-640`);
  3. estáticos sem hash e sem versão (`/icons/(.*)`, `/favicon.ico`, `/favicon.svg`, `/apple-touch-icon.png`, `/notification.mp3`, `/manifest.json`, `/robots.txt`, `/placeholder.svg`) → `public, max-age=86400, must-revalidate`;
  4. `index.html`, rotas SPA e `/version.json` → `no-store, max-age=0` (mantém o comportamento atual que garante versão nova).
- **Pronto quando:** tabela registrada.

### V103 — Aplicar no `vercel.json`
- **Tipo:** Código
- **Faça:** substituir a regra `"/((?!assets/).*)"` por regras com padrões que **não se sobrepõem** (a negação passa a excluir `assets/|vendor/|patterns/|icons/` e os arquivos da classe 3). Manter o bloco de segurança `/(.*)` intacto e em último lugar.
- **Prova:** `node -e` parse do JSON ok + teste da V104.
- **Pronto quando:** diff restrito ao array `headers`.

### V104 — Teste de contrato dos cabeçalhos
- **Tipo:** Código
- **Faça:** em `scripts/ci/vercel-config.unit.mjs` (criado aqui, ampliado na V156): para uma lista de caminhos de exemplo (`/assets/index-abc.js`, `/vendor/lamejs-1.2.1.min.js`, `/icons/icon-192x192.png`, `/`, `/inbox`, `/version.json`), aplicar os `source` do `vercel.json` como regex (sintaxe path-to-regexp → converter) e afirmar **exatamente um** `Cache-Control` com o valor esperado.
- **Prova:** `node --test scripts/ci/vercel-config.unit.mjs` verde.
- **Pronto quando:** commit `perf(vercel): cache por classe de arquivo (V101-V104)`.

### V105 — Verificar no preview
- **Tipo:** MCP-Vercel (leitura) — depende de V002
- **Faça:** `web_fetch_vercel_url` no preview do PR para `/assets/<um arquivo real>`, `/vendor/lamejs-1.2.1.min.js`, `/icons/icon-192x192.png`, `/inbox`, `/version.json` — conferir `cache-control`.
- **Pronto quando:** 5/5 conforme V102.

### V106 — `version.json` + recarga de chunk
- **Tipo:** Código (leitura)
- **Faça:** ler `src/lib/chunkReload.ts` e onde `version.json` é consultado; confirmar que após deploy um cliente com aba aberta recarrega ao falhar import dinâmico (assets antigos somem do alias novo).
- **Prova:** arquivo:linha do handler + teste existente `error-boundary-chunk-reload.test.tsx` verde.
- **Pronto quando:** registrado.

### V107 — Skew Protection
- **Tipo:** Decisão técnica
- **Faça:** consultar `search_vercel_documentation("Skew Protection Vite")`. Se suportado para SPA Vite sem framework, avaliar ligar (Pro inclui); se não, registrar que o `chunkReload` é a defesa.
- **Pronto quando:** decidido com fonte citada.

### V108 — Pré-carregamento de fontes
- **Tipo:** Código (revisão)
- **Faça:** `index.html` faz `preload` do CSS do Google Fonts **e** carrega o mesmo `stylesheet` bloqueante. Avaliar trocar o `<link rel="stylesheet">` por `media="print" onload="this.media='all'"` + `<noscript>`. Medir LCP antes/depois no Speed Insights (V112). Aplicar só se o orçamento de LCP estiver ruim.
- **Pronto quando:** decisão por dado.

### V109 — Self-host de fontes?
- **Tipo:** Decisão registrada
- **Faça:** não fazer agora (aumenta `total-assets`, ganho incerto). Registrar.
- **Pronto quando:** registrado.

### V110 — Compressão
- **Tipo:** Verificação
- **Faça:** confirmar `content-encoding: br` em `/assets/*.js` via `web_fetch_vercel_url` (Vercel comprime automaticamente).
- **Pronto quando:** registrado.

### V111 — Região
- **Tipo:** Decisão registrada
- **Faça:** saída é estática (CDN global); a região `iad1` só afetaria functions, que não existem. O rewrite externo `/l/:slug` sai do edge mais próximo. Não mudar.
- **Pronto quando:** registrado.

### V112 — Speed Insights recebendo dados
- **Tipo:** MCP-Vercel (leitura)
- **Faça:** consultar métricas de Speed Insights do projeto (observability query / painel) dos últimos 7 dias: LCP, INP, CLS p75 por rota.
- **Prova:** números registrados ou "zero datapoints".
- **Pronto quando:** registrado; zero datapoints → V113.

### V113 — Corrigir coleta de Speed Insights (se zerada)
- **Tipo:** Código
- **Faça:** conferir que `initSpeedInsights` roda em produção (sem gate de DEV) e que a CSP permite o script (`/_vercel/speed-insights/script.js` é same-origin → `'self'` ok) e o beacon (`/_vercel/speed-insights/vitals` → `connect-src 'self'`).
- **Pronto quando:** dados aparecendo em até 24 h.

### V114 — Web Analytics: decisão
- **Tipo:** Joaquim (custo)
- **Faça:** apresentar: Web Analytics dá visitas/rotas mais usadas; custo por evento (US$ 0,0004 no dia medido em outro projeto). Recomendação: **não ligar** — app interno com poucos usuários; Speed Insights cobre performance.
- **Pronto quando:** decisão registrada.

### V115 — Preconnect para o Supabase
- **Tipo:** Código
- **Faça:** adicionar `<link rel="preconnect" href="https://tnnnlkbymytvtqngbbqh.supabase.co" crossorigin />` no `index.html` (primeira chamada do app é auth no Supabase).
- **Prova:** build ok + orçamento ok.
- **Pronto quando:** commit `perf(html): preconnect ao Supabase (V115)`.

### V116 — `dns-prefetch` para o CRM externo
- **Tipo:** Código (avaliar)
- **Faça:** só se a V056 provar uso direto de `pgxfvjmuubtbowutlide.supabase.co` no carregamento inicial. Caso contrário, não.
- **Pronto quando:** decidido.

### V117 — `notification.mp3` e áudio
- **Tipo:** Código (leitura)
- **Faça:** confirmar que o arquivo é carregado sob demanda (não no boot).
- **Pronto quando:** registrado.

### V118 — Tamanho de `public/`
- **Tipo:** Código
- **Faça:** `du -ah public | sort -h | tail -10`; nenhum arquivo > 200 KB sem justificativa.
- **Pronto quando:** registrado.

### V119 — `placeholder.svg`
- **Tipo:** Código
- **Faça:** `grep -rn "placeholder.svg" src index.html`; se zero, remover de `public/`.
- **Pronto quando:** removido ou mantido com uso.

### V120 — `robots.txt` (ver V131)
- **Pronto quando:** coberto na V131.

### V121 — 404 de SPA
- **Tipo:** Verificação
- **Faça:** rota inexistente (`/nao-existe-xyz`) devolve `index.html` 200 e o app mostra a tela de 404 interna — comportamento atual do rewrite. Arquivos ausentes em `/assets/` devem devolver **404 real** (não `index.html`), senão o `chunkReload` recebe HTML como JS.
- **Prova:** `web_fetch_vercel_url(".../assets/nao-existe.js")` → 404.
- **Pronto quando:** confirmado (o rewrite exclui `assets/` — conferir também `vendor/`, `patterns/`, `icons/`).

### V122 — Rewrite SPA não deve capturar estáticos ausentes
- **Tipo:** Código
- **Faça:** se V121 mostrar `vendor/`/`icons/` ausentes caindo no `index.html`, incluir esses prefixos na negação do rewrite SPA.
- **Pronto quando:** 404 real para estáticos ausentes; teste na V156.

### V123 — Cabeçalho `X-Robots-Tag` nos previews
- **Pronto quando:** coberto na V132.

### V124 — Medir após 7 dias
- **Tipo:** MCP-Vercel (leitura)
- **Faça:** comparar `Fast Data Transfer`/`CDN Requests` (V007) após as mudanças de cache.
- **Pronto quando:** registrado.

### V125 — Fechar Fase 5
- **Pronto quando:** `.execucao.md` + commit `chore(vercel): fase 5 concluida (V125)`.

---

## FASE 6 — Segurança de borda (V126–V150)

### V126 — Coletar relatórios de CSP
- **Tipo:** MCP-Supabase (leitura) — depende de logs
- **Faça:** `csp-report` só loga. Ler os logs da edge `csp-report` dos últimos 7 dias (painel Supabase → Edge Functions → csp-report → Logs, ou pedir ao Joaquim export). Agrupar por `violated-directive` + `blocked-uri`.
- **Prova:** tabela de violações registrada.
- **Pronto quando:** lista fechada.

### V127 — Ajustar a CSP às violações legítimas
- **Tipo:** Código
- **Faça:** para cada violação legítima (ex.: Mapbox `blob:`/workers, `doufsxqlfjyuvxuezpln.supabase.co` se chamado do front, `wss://` específicos), adicionar a origem mínima. Trocar `connect-src … wss:` genérico por hosts explícitos se os relatórios permitirem.
- **Pronto quando:** commit `fix(csp): origens legitimas (V127)`.

### V128 — `script-src 'unsafe-inline'`
- **Tipo:** Código (avaliar)
- **Faça:** `index.html` tem 3 scripts inline (tema, flag de boot, diagnóstico). Calcular o hash SHA-256 de cada um (`node -e` com `crypto`) e listar como `'sha256-…'`; manter `'unsafe-inline'` no Report-Only por enquanto para comparar.
- **Pronto quando:** hashes calculados e teste (V156) que recalcula e compara com o `vercel.json` (quebra se alguém editar o inline sem atualizar a CSP).

### V129 — Promover CSP para enforce
- **Tipo:** Código + Joaquim (aval de risco de tela branca)
- **Faça:** após 7 dias sem violação nova com a CSP ajustada, duplicar o cabeçalho como `Content-Security-Policy` (enforce) mantendo o `-Report-Only` com a versão mais restrita (sem `unsafe-inline`).
- **Pronto quando:** em produção sem erro novo em `get_runtime_errors`/Speed Insights por 48 h.

### V130 — `report-to` moderno
- **Tipo:** Código
- **Faça:** adicionar `Reporting-Endpoints: csp="https://tnnnlkbymytvtqngbbqh.supabase.co/functions/v1/csp-report"` e `report-to csp` na CSP (mantendo `report-uri` para navegadores antigos). Conferir que `csp-report` aceita `application/reports+json`.
- **Pronto quando:** aplicado ou registrado incompatível.

### V131 — `robots.txt` bloqueando tudo
- **Tipo:** Código
- **Faça:** `public/robots.txt` → `User-agent: *\nDisallow: /`. (App interno de atendimento; nada a indexar.)
- **Pronto quando:** commit `chore(seo): app interno fora de indexacao (V131)`.

### V132 — `X-Robots-Tag: noindex, nofollow`
- **Tipo:** Código
- **Faça:** adicionar ao bloco `/(.*)` de segurança do `vercel.json`.
- **Prova:** teste V156.
- **Pronto quando:** aplicado.

### V133 — `Cross-Origin-Opener-Policy`
- **Tipo:** Código (avaliar)
- **Faça:** adicionar `Cross-Origin-Opener-Policy: same-origin-allow-popups` (OAuth do Google/Gmail abre popup — `same-origin` quebraria). Testar o fluxo de conexão Gmail no preview antes.
- **Pronto quando:** aplicado com fluxo OAuth validado ou registrado incompatível.

### V134 — `Cross-Origin-Resource-Policy`
- **Tipo:** Decisão registrada
- **Faça:** `same-origin` em `/assets/` poderia quebrar o Speed Insights/terceiros. Não aplicar.
- **Pronto quando:** registrado.

### V135 — `Permissions-Policy`
- **Tipo:** Código (revisão)
- **Faça:** `camera=()` bloqueia câmera; conferir se alguma tela usa câmera (`grep -rn "getUserMedia\|video: true" src`). Telefonia usa microfone (`microphone=(self)` ok).
- **Pronto quando:** coerente com o uso real.

### V136 — `X-Frame-Options: DENY` vs `frame-ancestors 'none'`
- **Tipo:** Decisão registrada
- **Faça:** redundantes e coerentes. Manter os dois.
- **Pronto quando:** registrado.

### V137 — Firewall: estado atual
- **Tipo:** MCP-Vercel (leitura)
- **Faça:** `get_firewall_config(projectId=prj_J4wb…, configVersion="active")` devolveu 404 "Seawall Config not found" = nenhuma regra custom. Confirmar pelo painel `https://vercel.com/juca1/zapp_web_v2/firewall`.
- **Pronto quando:** registrado.

### V138 — Regra de bloqueio de caminhos de varredura
- **Tipo:** MCP-Vercel (escrita)
- **Faça:** criar regra custom "deny" para paths típicos de scanner que nunca existem no SPA: `/wp-admin`, `/wp-login.php`, `/.env`, `/.git/`, `/phpmyadmin`, `/xmlrpc.php` (via `put_firewall_config`/`update_firewall_config`). Regras custom não têm custo por request no Pro.
- **Prova:** `get_firewall_config` mostra a regra ativa.
- **Pronto quando:** ativa.

### V139 — Rate limit no `/l/:slug`
- **Tipo:** Joaquim (custo) + MCP-Vercel
- **Faça:** `Firewall Rate Limit Requests` é cobrado. Recomendação: **não** ligar enquanto não houver abuso (a edge `talkx-link` já tem a própria proteção — conferir em `supabase/functions/talkx-link`).
- **Pronto quando:** decisão registrada.

### V140 — Bot protection / Attack Challenge Mode
- **Tipo:** Decisão registrada
- **Faça:** registrar procedimento de emergência: `update_attack_challenge_mode(projectId, enabled=true)` em caso de ataque; desligar ao fim.
- **Pronto quando:** procedimento no CLAUDE.md (V180).

### V141 — OWASP managed rules
- **Tipo:** Joaquim (custo)
- **Faça:** cobrado por request/bytes. Recomendação: não ligar (SPA estático, sem backend na Vercel).
- **Pronto quando:** decisão registrada.

### V142 — Deployment Protection revisada
- **Tipo:** MCP-Vercel (leitura)
- **Faça:** confirmar `ssoProtection.deploymentType = all_except_custom_domains` e que `zapp-web-v2.vercel.app` (alias de produção) continua público (V010) — senão usuários ficam travados na tela de login da Vercel.
- **Pronto quando:** registrado.

### V143 — Protection Bypass para automação
- **Tipo:** Decisão técnica
- **Faça:** se algum workflow E2E precisar testar preview protegido, usar "Protection Bypass for Automation" (secret no GitHub) — só criar quando um workflow pedir. Não criar agora.
- **Pronto quando:** registrado.

### V144 — Fork protection
- **Tipo:** MCP-Vercel (leitura)
- **Faça:** confirmar `gitForkProtection` ligado (repo é público: PR de fork não pode buildar com as variáveis).
- **Pronto quando:** confirmado (ligar via `update_project` se estiver desligado).

### V145 — Comentários da Vercel nos PRs / Toolbar
- **Tipo:** Decisão registrada
- **Faça:** a Vercel Toolbar injeta `vercel.live` (já na CSP). Se ninguém usa comentários de preview, desligar a Toolbar em produção (Settings → General → Vercel Toolbar) e remover `https://vercel.live`/`wss://vercel.live` da CSP de produção. Decisão do Joaquim (é ferramenta de revisão visual).
- **Pronto quando:** decidido.

### V146 — Logs de auditoria do time
- **Tipo:** MCP-Vercel (leitura)
- **Faça:** `list_user_events` filtrando o projeto nos últimos 30 dias: quem mexeu em envs/domínios.
- **Pronto quando:** registrado (base para a seção Vercel do CLAUDE.md).

### V147 — Webhooks da Vercel
- **Tipo:** MCP-Vercel (leitura)
- **Faça:** `get_webhooks` — registrar se existe algum apontando para endpoint externo desconhecido.
- **Pronto quando:** registrado; desconhecido → reportar ao Joaquim.

### V148 — Deploy hooks
- **Tipo:** Painel (leitura)
- **Faça:** conferir em Settings → Git → Deploy Hooks se há hook antigo (URL secreta que dispara deploy). Remover se não usado.
- **Pronto quando:** registrado/removido.

### V149 — Snapshot de segurança
- **Tipo:** MCP-Vercel (leitura)
- **Faça:** `docs/audits/vercel-snapshot-2026-10-18-depois-seguranca.json` (mesmo formato da V003 + firewall + protection).
- **Pronto quando:** commit.

### V150 — Fechar Fase 6
- **Pronto quando:** `.execucao.md` + commit `chore(vercel): fase 6 concluida (V150)`.

---

## FASE 7 — Confiabilidade do deploy e observabilidade (V151–V172)

### V151 — Alerta de deploy de produção com ERROR
- **Tipo:** Código
- **Faça:** o workflow `notifica-falha-main.yml` já existe. Ler o gatilho (`sed -n 1,60p`). Acrescentar o evento `deployment_status` (o app Vercel publica Deployment Status no GitHub) com filtro `state == 'failure' && environment == 'Production'`, reaproveitando o passo de abertura/comentário de issue. **Não** criar workflow novo.
- **Prova:** contrato/unit dos workflows (`scripts/ci/*workflow*.unit.mjs`) verde.
- **Pronto quando:** commit `feat(ci): alerta de deploy Vercel de producao com falha (V151)`.

### V152 — Confirmar que a Vercel publica `deployment_status`
- **Tipo:** GitHub (leitura)
- **Faça:** `github_list_deployments(owner=adm01-debug, repo=Zapp_Web_V2, environment=Production, per_page=5)` + `github_list_deployment_statuses` de um deles.
- **Pronto quando:** status `success`/`failure` presentes (senão a V151 precisa de outro gatilho: `status` com `context == 'Vercel'`).

### V153 — Teste do alerta
- **Tipo:** Verificação
- **Faça:** só provar com o próximo erro real ou via `workflow_dispatch` de teste se o workflow tiver; não forçar deploy quebrado em produção.
- **Pronto quando:** prova registrada quando ocorrer.

### V154 — Rollback documentado
- **Tipo:** Código (doc)
- **Faça:** registrar no CLAUDE.md (V180) o procedimento: `list_deployments(target=production, rollbackCandidate=true)` → `request_rollback`/`request_promote` do último bom → conferir `version.json`.
- **Pronto quando:** coberto na V180.

### V155 — Explicitar build no `vercel.json`
- **Tipo:** Código
- **Faça:** adicionar `"framework": "vite"`, `"buildCommand": "bun run build"`, `"outputDirectory": "dist"` (hoje implícitos no painel). Mesmo comportamento, agora versionado.
- **Prova:** deploy de preview `READY` + `version.json`.
- **Pronto quando:** commit `chore(vercel): build explicito no vercel.json (V155)`.

### V156 — `scripts/ci/vercel-config.unit.mjs` completo
- **Tipo:** Código
- **Faça:** ampliar o teste da V104 para cobrir: (a) JSON válido com `$schema`; (b) `installCommand` mantém `--frozen-lockfile --ignore-scripts`; (c) rewrite SPA exclui `assets/`, `vendor/`, `patterns/`, `icons/`, `version.json`; (d) rewrite `/l/:slug` aponta para `tnnnlkbymytvtqngbbqh` (banco oficial); (e) bloco de segurança contém `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`, `X-Robots-Tag`, CSP; (f) CSP `connect-src` contém o banco oficial e **não** contém `uqysyzndkfiwfztbqvsl`/`vpkmqeumtxhrwgawxdrl`; (g) hashes dos scripts inline do `index.html` batem com a CSP (se V128 aplicada); (h) lista do `ignore-build.sh` cobre os configs da raiz (V098); (i) `ignoreCommand` presente.
- **Prova:** `node --test scripts/ci/vercel-config.unit.mjs` verde e entra no runner existente (V069).
- **Pronto quando:** commit `test(ci): contrato do vercel.json (V156)`.

### V157 — Verificação pós-deploy (script)
- **Tipo:** Código
- **Faça:** `scripts/vercel/verify-production.mjs` (Node, sem dependência nova): recebe a URL (default `https://zappweb.app.br`, fallback `https://zapp-web-v2.vercel.app`), busca `/version.json`, compara com SHA informado, checa `cache-control` de `/` e de um asset lido do `index.html`, e o 404 de `/assets/nao-existe.js`. Saída `::error::`/exit 1 em divergência.
- **Prova:** `node --test` de um unit com `fetch` mockado.
- **Pronto quando:** commit `feat(vercel): verificacao pos-deploy (V157)`.

### V158 — Plugar a verificação no fluxo de merge
- **Tipo:** Código
- **Faça:** chamar `verify-production.mjs` a partir do evento `deployment_status` `success` de Production (mesmo workflow da V151), com o SHA do deployment. Falha → mesma issue de alerta.
- **Pronto quando:** commit.

### V159 — Drain de logs: decisão
- **Tipo:** Joaquim (custo)
- **Faça:** `Drains Volume` é cobrado; projeto é estático (logs = só requests). Recomendação: **não** criar drain; usar `get_runtime_logs` sob demanda (após V002).
- **Pronto quando:** decisão registrada.

### V160 — Checagem diária de saúde Vercel
- **Tipo:** Código
- **Faça:** no `settings-guard.yml` (já roda 1x/dia — confirmar no arquivo), acrescentar passo que chama a API da Vercel **somente leitura** com `VERCEL_TOKEN` (secret a ser criado pelo Joaquim, escopo leitura do time): domínio `misconfigured=false`, nenhuma env com `readable-secret`, nenhuma env fora do baseline (V068), último deploy de produção `READY`. Se o secret não existir: o passo marca "NÃO VERIFICÁVEL" (padrão do `settings-guard`), não falha.
- **Pronto quando:** commit + pedido do secret ao Joaquim (nome `VERCEL_READONLY_TOKEN`).

### V161 — Secret `VERCEL_READONLY_TOKEN`
- **Tipo:** Joaquim
- **Faça:** pedir criação do token (Account → Tokens, escopo time `juca1`, expiração 1 ano) e cadastro como secret do repo.
- **Pronto quando:** `github_list_actions_secrets` mostra o nome.

### V162 — Baseline de configuração Vercel
- **Tipo:** Código
- **Faça:** `scripts/ci/vercel-settings-baseline.json` (domínios + redirect, protection, framework, nodeVersion `24.x`, retention, fork protection, lista de chaves de env) — lido pela V160.
- **Pronto quando:** commit.

### V163 — Speed Insights no orçamento
- **Tipo:** Código
- **Faça:** `performance-budget.json` já declara metas de campo (LCP/INP/CLS). Registrar no `.execucao.md` o p75 real (V112) vs meta.
- **Pronto quando:** registrado; meta estourada → etapa extra de performance (fora deste plano).

### V164 — Runtime errors semanais
- **Tipo:** MCP-Vercel (leitura) — depende de V002
- **Faça:** `get_runtime_errors(since="7d")`. Projeto estático deve ter zero; qualquer cluster → investigar origem (rewrite `/l/:slug`?).
- **Pronto quando:** registrado.

### V165 — Observability Plus
- **Tipo:** Decisão registrada
- **Faça:** billing mostra `Observability Events` US$ 0,016/dia no time; conferir `get_observability_configuration_projects` se `zapp_web_v2` contribui. Se sim e não há uso, desabilitar para o projeto.
- **Pronto quando:** decidido.

### V166 — Rolling Releases
- **Tipo:** Decisão registrada
- **Faça:** `rollingRelease: null`. Para SPA interno com poucos usuários, não vale o custo/complexidade. Não ligar.
- **Pronto quando:** registrado.

### V167 — Notificações por e-mail da Vercel
- **Tipo:** Joaquim (preferência)
- **Faça:** sugerir ligar notificação de "Deployment Failed — Production" para o e-mail do Joaquim (Account → Notifications). Redundante com V151 mas custo zero.
- **Pronto quando:** decidido.

### V168 — Check `Vercel` como obrigatório?
- **Tipo:** Decisão técnica
- **Faça:** **não** tornar required: com `ignoreCommand`, commits sem front não geram build e o check poderia ficar ausente, travando merges (mesmo problema documentado no CLAUDE.md para `Contrato DB vivo`). O `🏗️ Build` do CI já é a trava.
- **Pronto quando:** registrado no CLAUDE.md (V180).

### V169 — Promover só após CI verde?
- **Tipo:** Decisão técnica
- **Faça:** avaliar "Wait for checks before promoting" (Vercel + GitHub checks) no projeto. Com `strict=true` e 6 checks obrigatórios, a `main` só recebe código verde; não é necessário. Registrar.
- **Pronto quando:** registrado.

### V170 — Ensaio de rollback
- **Tipo:** Joaquim (aval) + MCP-Vercel
- **Faça:** em horário sem uso, executar rollback para o deploy anterior e voltar (`request_rollback` → `version.json` → `request_promote` do atual). Mede o tempo real de recuperação.
- **Pronto quando:** tempo registrado.

### V171 — Snapshot "depois" geral
- **Tipo:** MCP-Vercel (leitura)
- **Faça:** `docs/audits/vercel-snapshot-2026-10-18-depois.json`.
- **Pronto quando:** commit.

### V172 — Fechar Fase 7
- **Pronto quando:** `.execucao.md` + commit `chore(vercel): fase 7 concluida (V172)`.

---

## FASE 8 — Higiene, legado e documentação (V173–V190)

### V173 — Projeto legado `zapp-web`: o que serve
- **Tipo:** MCP-Vercel (leitura)
- **Faça:** `get_project("zapp-web")`, `filter_project_envs("zapp-web")` (sem decrypt) e `list_deployments(projectId="zapp-web", limit=5)`. Registrar para qual banco o build aponta (pela lista de chaves) e se o repo ligado é este.
- **Pronto quando:** registrado.

### V174 — Tráfego no legado
- **Tipo:** MCP-Vercel (leitura) — depende de V002
- **Faça:** `get_runtime_logs(projectId=prj_OsEr…, since="7d", group_by="requestPath")`.
- **Pronto quando:** registrado se alguém ainda acessa.

### V175 — Pausar o legado (reversível)
- **Tipo:** MCP-Vercel (escrita)
- **Faça:** `pause_project(prj_OsErjUqsrMbwwC7S1LVfawmNgEce)` — tira do ar sem apagar.
- **Prova:** aliases `zapp-web-*.vercel.app` deixam de servir o app.
- **Pronto quando:** pausado.

### V176 — Excluir o legado
- **Tipo:** Joaquim (irreversível)
- **Faça:** após 14 dias pausado sem reclamação: "isso apaga o projeto `zapp-web` e seus deploys, sem volta — confirma?". Com OK: `get_project_deletion_link` → Joaquim conclui.
- **Pronto quando:** projeto inexistente em `list_projects(search="zapp")`.

### V177 — Previews `ERROR` antigos
- **Tipo:** Decisão registrada
- **Faça:** a retenção (V092) limpa sozinha. Não apagar em massa manualmente.
- **Pronto quando:** registrado.

### V178 — Branches de preview com env própria
- **Pronto quando:** coberto pela V072 (zero `gitBranch`).

### V179 — `.vercelignore`
- **Tipo:** Código (avaliar)
- **Faça:** builds vêm do Git (clone completo); `.vercelignore` só afeta upload por CLI. Não criar. Registrar.
- **Pronto quando:** registrado.

### V180 — Seção "Vercel" no CLAUDE.md
- **Tipo:** Código
- **Faça:** acrescentar seção curta (tabela) ao `CLAUDE.md`:
  - projeto/time/IDs; domínio canônico `zappweb.app.br` (`www` → apex 308); alias técnico `zapp-web-v2.vercel.app`; `zappwebv2-juca1.vercel.app` não é para usuário;
  - "merge em `main` = deploy do front (Vercel); edge function só via `deploy-functions.yml`";
  - "Vercel guarda só `VITE_*` públicas — chave de servidor vai para secret de edge";
  - `ignoreCommand`: commit sem front não gera deploy (isso não é falha);
  - check `Vercel` não é required (motivo V168);
  - rollback (V154), Attack Challenge Mode (V140);
  - contratos: `scripts/ci/vercel-config.unit.mjs`, `vercel-env-baseline`, `vercel-settings-baseline`.
- **Prova:** guard `check-claude-md.unit.mjs` (GA02) continua verde.
- **Pronto quando:** commit `docs(claude-md): secao Vercel (V180)`.

### V181 — Inventário de CI gerado
- **Tipo:** Código
- **Faça:** se V151/V160 mudaram workflows, rodar `node scripts/ci/render-workflow-docs.mjs` e commitar `docs/ci/README.md` (o `--check` reprova divergência).
- **Pronto quando:** `--check` verde.

### V182 — Baselines de lint/guard
- **Tipo:** Código
- **Faça:** se algum guard (eslint-baseline, workflow-contracts, ci-docs-baseline) reprovar por causa dos arquivos novos, atualizar a baseline **no mesmo commit** — sem relaxar regra.
- **Pronto quando:** CI local verde.

### V183 — Portão local antes do PR
- **Tipo:** Código
- **Faça:** `bun run typecheck && bun run lint && bun run test && bun run build && node --test scripts/ci/*.unit.mjs scripts/vercel/*.unit.mjs`.
- **Prova:** tudo exit 0 (erros pré-existentes em `main` anotados com arquivo:linha, não "consertados" fora de escopo).
- **Pronto quando:** registrado.

### V184 — PR do lote
- **Tipo:** Git (quando o Joaquim pedir push)
- **Faça:** PR com título `Vercel: domínio canônico, limpeza de segredos, economia de build e cache (V001–V190)`; corpo = achados A01–A19 resolvidos + provas + pendências do Joaquim.
- **Pronto quando:** 6 checks verdes e merge.

### V185 — Fallback de CORS para o canônico
- **Tipo:** Código (7 dias após V018)
- **Faça:** `FALLBACK_ORIGIN` → `https://zappweb.app.br`; deploy de edge (V023).
- **Pronto quando:** em produção.

### V186 — Revisão de custo 30 dias
- **Tipo:** MCP-Vercel (leitura)
- **Faça:** repetir V007 para 30 dias (janelas diárias) e comparar.
- **Pronto quando:** relatório de 5 linhas ao Joaquim.

### V187 — Reconferir domínio e envs
- **Tipo:** MCP-Vercel (leitura)
- **Faça:** `get_domain_config` (2 nomes) + `filter_project_envs` vs baseline.
- **Pronto quando:** sem divergência.

### V188 — Reconferir CSP enforce
- **Tipo:** Verificação
- **Faça:** 7 dias após V129: sem violação nova legítima.
- **Pronto quando:** registrado.

### V189 — Atualizar este plano
- **Tipo:** Código
- **Faça:** marcar no topo deste arquivo "EXECUTADO até V…" e mover pendências humanas para uma lista final.
- **Pronto quando:** commit.

### V190 — Encerramento
- **Tipo:** Joaquim (informação)
- **Faça:** relatório final: o que mudou em produção (domínio, segredos removidos, economia medida, cache), o que ficou pendente dele (DNS, rotação, exclusão do legado, token de leitura), links de PR e runs.
- **Pronto quando:** enviado.

---

## Apêndice A — Pendências que só o Joaquim resolve (resumo)

| Etapa | Ação | Por que é dele |
|---|---|---|
| V002 | Reconectar MCP Vercel com acesso ao projeto | credencial |
| V015/V016 | Zona DNS no Registro.br (A/CNAME) | conta do registrador |
| V024 | Site URL/Redirect URLs do Supabase Auth | painel Supabase |
| V045/V052 | Rotação de chaves expostas | regra do CLAUDE.md |
| V060 | Ligar ou não a integração CRM em produção | negócio |
| V114/V139/V141/V159 | Web Analytics, rate limit, OWASP, drain | custo |
| V161 | Token de leitura da Vercel | credencial |
| V170 | Ensaio de rollback | janela sem uso |
| V176 | Excluir projeto legado | irreversível |

## Apêndice B — Ordem mínima se houver pouco tempo

V002 → V043/V044 (segredos) → V047–V051 → V016/V017/V020 (domínio) → V076–V079 (economia) → V103/V104 (cache) → V088 (maps) → V151 (alerta) → V180 (CLAUDE.md).
