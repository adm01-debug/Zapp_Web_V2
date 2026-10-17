# SYNC20-18 — Ambientes: Vercel, preview e variáveis por NOME (plano-sync F19, etapas 191–194/197)

- Cartão: `t_9e3c73bc` · Plano: `docs/plans/PLANO_SINCRONIZACAO_TOTAL_LOCAL_GITHUB_BANCO_300_ETAPAS_2026-10-17.md`
  (commit `67da33fdea`, etapas F19 = 191–200) · Data: 2026-10-17 · Autor: worker (geral)
- **Regra cumprida: SOMENTE LEITURA.** Nenhum deploy, nenhum push, nenhuma variável criada/alterada/removida,
  nenhum DNS/domínio/firewall tocado. Todo comando na Vercel foi `ls`/`inspect`; o único `GET` na API foi leitura.
- **Nenhum valor foi impresso, lido por inteiro ou copiado.** As varreduras usam só o NOME da variável; onde a
  CLI mostraria valor, o valor foi descartado (`awk '$1'`). Vars `Sensitive` aparecem na CLI como `Hidden` e
  ficaram sem inspeção — de propósito.
- Base da comparação: `HEAD` = `dia/2026-10-17` (`d723a90107`), `origin/main` = `a9b4d6c6fb` (o commit que a
  produção está servindo, conferido abaixo). Workspace local da sync, sem tocar em `~/projetos`.

## 1. Comandos (reproduzível)

```
vercel whoami
vercel project ls
vercel project inspect zapp_web_v2
vercel link --yes --project zapp_web_v2 --cwd .tmp/vlink          # link LOCAL em .tmp (gitignored), nada na Vercel
vercel env ls production|preview|development --cwd .tmp/vlink     # só nomes (valor descartado)
vercel inspect zappwebv2-8fllxz1v4-juca1.vercel.app
curl -s "https://api.vercel.com/v9/projects/zapp_web_v2?teamId=juca1"                # link.productionBranch, aliases
curl -s "https://api.vercel.com/v13/deployments/<id>?teamId=juca1"                   # gitSource.ref/sha do deploy
git show HEAD:.env.example | grep -oE '^[A-Za-z_][A-Za-z0-9_]*' | sort
git show HEAD:.env.production | grep -oE '^[A-Za-z_][A-Za-z0-9_]*' | sort
diff <(git show HEAD:.env.production | grep -oE '^[A-Za-z_][A-Za-z0-9_]*' | sort) \
     <(git show origin/main:.env.production | grep -oE '^[A-Za-z_][A-Za-z0-9_]*' | sort)
git grep -n "VITE_[A-Z_]*" -- src | grep -v "__tests__"
```
Credencial da CLI usada só dentro da própria chamada `curl` (lida do arquivo de sessão da CLI, nunca ecoada,
nunca copiada para o repositório).

## 2. Etapa 191 — projeto e branch de produção

| Item | Medido (nome, sem valor) |
|---|---|
| Projeto Vercel | `zapp_web_v2` (ID `prj_J4wb8egzz8…`, time `juca1`/`team_QyN41X0q…`) |
| Repositório ligado | `github.com/adm01-debug/Zapp_Web_V2` (repo público), `sourceless: true` |
| **Branch de produção (declarada)** | **`main`** (`link.productionBranch = "main"`) |
| Aliases de produção | `www.zappweb.app.br`, `zappweb.app.br` (+ `zapp-web-v2.vercel.app`, `zappwebv2-*.vercel.app`) |
| Framework / Node | preset `Vite`, Node `24.x`, região `iad1` |
| Plan / privacidade | `pro` · `private: true` · `gitForkProtection: true` · `autoExposeSystemEnvs: true` |
| Último deploy de produção (real) | `dpl_GjgMJ58Y…`, READY, criado 16/10 21:33 (-03), `gitSource.ref = main`, `gitSource.sha = a9b4d6c6fb` |

**Declarado x real bate:** o deploy que a produção serve saiu de `main` no commit `a9b4d6c6fb` — exatamente o
`origin/main` do dia (`git rev-parse origin/main` = `a9b4d6c6fb`). Nenhum deploy
manual foi feito nesta sync (nenhuma escrita na Vercel em momento algum).

## 3. Etapa 193 — nomes de variáveis por ambiente x `.env.example` (só nomes)

Contagem medida: **Vercel production = 18**, **Vercel preview = 34**, **Vercel development = 0**,
`.env.example` = 24, `.env.production` (versionado) = 9.

**(A) Está na Vercel (qualquer ambiente) e NÃO em `.env.example` — 20 nomes:**
`NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_SUPABASE_URL`,
`POSTGRES_DATABASE`, `POSTGRES_HOST`, `POSTGRES_PASSWORD`, `POSTGRES_PRISMA_URL`, `POSTGRES_URL`,
`POSTGRES_URL_NON_POOLING`, `POSTGRES_USER`, `SUPABASE_ANON_KEY`, `SUPABASE_JWT_SECRET`,
`SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`,
`VITE_CLIENTES_SUPABASE_ANON_KEY`, `VITE_CLIENTES_SUPABASE_URL`, `VITE_EVOLUTION_API_URL`, `VITE_LOG_LEVEL`.
→ 16 dos 20 (todos os `POSTGRES_*`, `NEXT_PUBLIC_*` e `SUPABASE_*`) estão **só em Preview, escopados à branch
`claude/fix-promogifts-offset-503-260925-1420`** (criados 22d atrás) — resíduo de outra aplicação, não do app.

**(B) Está em `.env.example` e NÃO na Vercel — 10 nomes:**
`EVOLUTION_API_FLAVOR`, `EVOLUTION_INSTANCE_NAME`, `EVOLUTION_INSTANCE_TOKEN`, `GOOGLE_CLIENT_ID`,
`GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`, `PROMOGIFTS_SUPABASE_SERVICE_ROLE_KEY`, `PROMOGIFTS_SUPABASE_URL`,
`VITE_CRM_INTEGRATION_ENABLED`, `VITE_SUPABASE_PUBLISHABLE_KEY`.

**(C) Variáveis exclusivas de Preview (16):** exatamente o bloco `POSTGRES_*`/`NEXT_PUBLIC_*`/`SUPABASE_*` do item (A).
**Development = 0 variáveis** na Vercel (a app usa o banco local do WSL em dev, não `vercel dev`).

## 4. Etapa 194 — variável usada no código x ambiente declarado

`src/` lê exatamente **4** variáveis `VITE_*` (fora de testes):
`VITE_ZAPP_LOCAL_SUPABASE_URL` e `VITE_ZAPP_LOCAL_SUPABASE_ANON_KEY` (`src/config/supabase.ts`),
`VITE_CRM_INTEGRATION_ENABLED` (`src/integrations/supabase/externalClient.ts:13`),
`VITE_SEARCHBOX_MONTHLY_SESSION_LIMIT` (`src/lib/mapboxCostGuard.ts:24`).

| Variável | Usada no código | `.env.example` | `.env.production` | Vercel | Veredito |
|---|---|---|---|---|---|
| `VITE_CRM_INTEGRATION_ENABLED` | sim (`externalClient.ts:13`) | sim | **sim** (`false` no HEAD / `true` no `origin/main`) | **não** | presente por arquivo versionado; **divergência de valor, ver §7** |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | **não** (leitura proibida por guarda) | sim | sim (chave anon real, valor não impresso) | **não** | declarada e não lida: inofensiva, mas é valor versionado (§7-P3) |
| `VITE_SUPABASE_URL` | **não** (leitura proibida por guarda) | sim | sim | **sim** (`Sensitive`, Production+Preview) | **presente no ambiente e ignorada pelo app** — valor não inspecionado (Sensitive); se algum dia alguém afrouxar a guarda, ela aponta para o projeto errado |
| `VITE_SEARCHBOX_MONTHLY_SESSION_LIMIT` | sim (`mapboxCostGuard.ts:24`) | **não** | **não** | **não** | não declarada em lugar nenhum; o código tem default seguro `450` (`DEFAULT_MONTHLY_SESSION_LIMIT`) |
| `VITE_ZAPP_LOCAL_SUPABASE_URL` / `_ANON_KEY` | sim (só dev) | sim | não | não | corretas por desenho: existem só no `.env.example` |

Guardas que sustentam a coluna "não": `scripts/ci/check-supabase-url-import-meta.mjs` e o teste
`src/lib/__tests__/sec-fe-01-supabase-url-import-meta.test.ts` (verde na prova da §8). Eles proíbem
`import.meta.env.VITE_SUPABASE_URL`/`_PUBLISHABLE_KEY` em `src/`. Consequência de desenho: **a URL canônica do
banco em produção é uma constante fixa em `src/config/supabase.ts:3` (endereço do projeto de produção
omitido aqui por regra da fábrica), não a variável da Vercel.

## 5. Etapa 192 — preview e a regra R1 (banco local, sem produção)

Risco medido (nenhuma alteração feita, só registro):
- A Vercel injeta **`VITE_SUPABASE_URL` (Sensitive) em Production E Preview** (build env do deploy confirma a
  presença do nome). O app ignora essa variável por guarda e usa a constante de produção → **um preview da
  Vercel fala com o banco de PRODUÇÃO**, nunca com o banco local.
- O desvio para o banco local exige `import.meta.env.PROD` falso (`src/config/supabase.ts:30`) — e todo build
  da Vercel roda `vite build` (mode `production`), ou seja, `PROD` verdadeiro. O desvio é **inerte em qualquer
  deploy** (preview inclusive).
- A fixture de E2E lê por padrão o `.env.production` versionado, isto é, o projeto de produção
  (`e2e/fixtures/supabase-env.ts:10-15`). Rodar E2E apontando para preview exige override consciente.
- Preview de PR está habilitado para todos os branches (`previewCommentsEnabled: true`); o último preview é da
  branch `claude/serene-allen-ojclyz` (PR #2021), commit `cee4ae39d386...`, verificação do GitHub `unverified`.
- `gitForkProtection: true` (fork de terceiro não ganha preview com variáveis de produção) — ponto a favor.

**Veredito etapa 192:** o ambiente de preview **não** aponta para o banco local; aponta para produção. Isso é
proibido pela R1 para uso por agente. Dono do ajuste (fora deste cartão): worker (ci) — decidir se o preview da
Vercel deve ostentar `VITE_SUPABASE_URL` e/ou ser restringido a branches internos.

## 6. Etapa 197 — DNS, domínio, firewall, stack

Nada foi tocado: nenhuma chamada de escrita em domínio/DNS, nenhum `add`/`rm` de alias, nenhum deploy, nenhuma
variável criada/alterada/removida. Os aliases foram apenas **lidos** (§2).

## 7. Divergências HEAD x origin (nomes e valores nominais)

- **Nomes: idênticos.** `.env.production` e `.env.example` do `HEAD` (`dia/2026-10-17`) têm exatamente o mesmo
  conjunto de nomes que `origin/main` — `diff` de NOMES vazio nos dois arquivos (o conteúdo de
  `.env.production` difere em 1 linha de valor, abaixo).
- **Valor divergente (1 linha): `VITE_CRM_INTEGRATION_ENABLED`.**
  - `merge-base` (`7a15852791`) = `false`; `origin/main` = **`true`**; `HEAD` (`dia/2026-10-17`) = **`false`**.
  - O `true` vem de `71be24f84e feat(crm): liga VITE_CRM_INTEGRATION_ENABLED em produção (Fase 9) (#1919)`, que
    existe **só no lado `origin/main`**; o lado `dia` não recebeu o commit.
  - **P1 — regressão silenciosa no sync:** `.env.production` é versionado e é o arquivo que o `vite build` da
    Vercel carrega (mode production). Quando a árvore da `dia` chegar à `main`, o próximo deploy automático
    religa/desliga o gate da integração CRM **para `false`**, derrubando a Fase 9 sem nenhum aviso de CI.
    Dono: quem conduz o merge da F16 (ordem de merge) — decidir `true`/`false` **antes** do merge, não depois.
- **P3 — valor versionado:** `.env.production` está no Git e carrega o valor real de `VITE_SUPABASE_PUBLISHABLE_KEY`
  (JWT 208 chars, claims `role=anon` e `ref` do projeto de produção — omitidos). É chave pública por desenho
  (a doc do arquivo diz "SAFE TO COMMIT", ela vai embutida no bundle), porém o mesmo arquivo é fonte primária do
  E2E — logo o repo público dá o endereço+chave anon do banco de produção. Registrado, não alterado.
- **P3 — `.env.example` sem `VITE_EVOLUTION_API_URL` e `VITE_LOG_LEVEL`** (usadas em produção via `.env.production`):
  quem sobe o projeto do zero pelo `.env.example` não as conhece.
- **P3 — 16 variáveis de outra app** no bloco Preview (§3-A) com escopo de branch — candidatas a limpeza na F18,
  não neste cartão.

## 8. Prova (o que foi rodado, verde)

```
npx vitest run src/lib/__tests__/sec-fe-01-supabase-url-import-meta.test.ts
```
Cobre a afirmação central da §4: `src/` **não** lê `import.meta.env.VITE_SUPABASE_URL`. Resultado registrado no
relato (`.tmp/relato.md`). Todas as demais linhas desta nota saem das saídas cruas dos comandos da §1.

## 9. O que NÃO fiz e por quê

- Deploy, push, PR, merge, alterar variável, DNS, domínio, firewall, stack: proibidos pelo cartão e pelo modo V2.
- Nenhum valor de variável foi lido/impresso/copiado; vars `Sensitive` ficaram como `Hidden` (sem inspeção).
- O `vercel link` rodou em `.tmp/vlink` (gitignored) e baixou um `VERCEL_OIDC_TOKEN` **local**, dentro de `.tmp`;
  nada foi criado na Vercel. Diretório descartável, fora do commit.
- Etapas 195/196/198/199/200 (acompanhar deploy pós-merge, lock do `bun.lock`, URLs nos PRs, custo, gate) não são
  deste cartão: 195/196/198 dependem do merge (F16/F08) e 199 não teve custo novo a pedir.
- Diff deste cartão: 1 arquivo novo, este documento. Zero código, teste, guarda, baseline ou configuração tocada.
