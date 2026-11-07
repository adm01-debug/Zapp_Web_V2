# Vercel e deploy — referência para agentes

Ler quando for confirmar um deploy, mexer em env vars do Vercel, domínio ou deploy de edge functions.

| O que | Valor |
|---|---|
| Projeto | `zapp_web_v2` (ID: `prj_J4wb8egzz8iL1CJnSOXJDtqnbvRp`) |
| Team | `juca1` / `team_QyN41X0q8hrqhW80AwokbFLv` |
| Alias de projeto V2 | `https://zapp-web-v2.vercel.app` (é o `FALLBACK_ORIGIN` em `supabase/functions/_shared/cors-origins.ts`) |
| Domínio principal | `https://zappweb.app.br` serve a **V3**, não este projeto (`/version.json` lá expõe contrato V3 com `gitSha`/`releaseId`; o alias acima expõe o contrato V2 com `buildId` igual ao SHA da `main`). O workflow `front-release-targets.yml` monitora as duas trilhas separadamente. |
| Preview URL pattern | `https://zappwebv2-{hash}-juca1.vercel.app` |
| Região | `iad1` |
| Framework / build / output | Vite + React · `bun run build` · `dist/` · Node 24.x |
| Ignorar build | `sh scripts/vercel/ignore-build.sh` |
| MCP Vercel | ferramentas `mcp__Vercel__*` — escrita = ação de produção |
| Projeto legado | `zapp-web` (`prj_OsErjUqsrMbwwC7S1LVfawmNgEce`) ainda existe; **não é o projeto atual** |

## Deploy e edge functions

- **Front (Vercel):** deploy automático na `main` — merge em `main` = deploy em produção.
- **Edge functions:** deploy automático quando o push na `main` altera código implantável em
  `supabase/functions/` ou `supabase/config.toml` (exceto `*.test.ts`, `.md` e `fixtures/`), pelo
  `deploy-functions.yml`. O environment `producao-edge-functions` restringe a branch e não exige revisor.
  `workflow_dispatch` é para rollback (`source_ref`), função única, dry-run e rotação de secrets.
  Confirme o run após o merge; não execute `supabase functions deploy` direto em produção.

Retificação de 2026-10-07 — Edge Functions: o registro histórico de deploy manual de edges foi
superado pela regra acima (deploy automático no push da `main`).

## Regras de env vars no Vercel

- **Nunca** colocar chaves de servidor (OPENAI, ANTHROPIC, GROQ, EVOLUTION) — não há serverless neste projeto.
- **Nunca** colocar `POSTGRES_*`, `SUPABASE_SERVICE_ROLE_KEY` ou `SUPABASE_JWT_SECRET` — são do back-end.
- `VITE_ZAPP_LOCAL_SUPABASE_*` são **apenas para dev local**, não devem existir no Vercel.
- Vars `VITE_*` vão para o bundle e são públicas — nunca segredo com prefixo `VITE_`.
- Baseline de vars esperadas: `scripts/ci/vercel-env-baseline.json`; snapshot "antes":
  `docs/audits/vercel-snapshot-2026-10-18-antes.json`.

## Pendências de Vercel (dependem de ação no dashboard)

1. Redirect: apex canônico, `www` → apex.
2. Remover 17 vars de integração morta + 5 chaves de servidor + `VITE_*` não lidas.
3. Pausar e apagar o projeto legado `zapp-web`.
4. Trocar `FALLBACK_ORIGIN` para o domínio próprio 7 dias depois do DNS estabilizar.
