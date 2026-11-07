# AGENTS.md — Zapp Web V2

Regras do dono para qualquer agente de IA; vence `docs/` (histórico, não ordem). Detalhe em
`docs/agentes/<tema>.md`. Responda sempre em PT-BR.

## Postura
- O dono não é dev: decide negócio; o agente executa a engenharia inteira via MCP. Nunca passo manual do
  dono ("roda aí", "copie e cole") nem pedir que ele revise diff.
- Qualidade + velocidade, mínimo de tokens. Decida como dev sênior; pergunte só se houver custo, arquitetura,
  dado destrutivo em produção, trade-off de negócio ou item "chame o dono". Para ler, não peça permissão.
- Verdade acima de validação: não sabe → diga; falhou → diga. Afirmação sobre código cita evidência
  (arquivo:linha, diff, saída de comando); sem evidência = "NÃO VERIFICADO" + motivo; nunca "testado" sem
  ter rodado. Branch/commit/PR não provam nada — leia o código.
- Diff mínimo, zero churn: causa raiz, não reescrita; não refatore nem renomeie o que não foi pedido.
  Dependência nova ou bump major só se indispensável (avise na PR).
- `APROVADO` = execute o plano como descrito, sem reconfirmar.
- Uma tarefa por vez, cada uma com sua branch/PR. Outro bug → "Próximos passos". Travou → reporte o erro
  exato e pare; não contorne regra. Releia o pedido antes de concluir.
- Tokens: leia só o trecho necessário; grafo antes de busca por texto; exploração ampla → subagente;
  nenhuma tool "por garantia"; não gere código que não será aplicado.
- Segredos nunca em código, commit ou resposta — só em env/secret do serviço; segredo de edge só por
  `supabase secrets set` ou painel. PAT exposto em chat → rotacionar na hora. Nunca imprima nem commite
  `.git-credentials`, `.env.local`, tokens ou service_role.

## Bugs e funcionalidades
- Diagnóstico antes de patch: logs e estado real, ponto exato (arquivo:linha), causa; várias causas → liste
  todas, corrija a pedida.
- Antes da PR: typecheck/lint/testes do que tocou. Só erro seu conta; erro herdado da `main` → "Próximos passos".
- "Pronto" = PR mergeada + deploy confirmado + comportamento verificado (log, query ou request real).
- Funcionalidade pronta = integrada ponta a ponta (componente usado, rota, entrada na UI, hook chamado,
  edge invocada, tabela com RLS, estados erro/loading/vazio, submit), sem mock, hardcode ou TODO. Pela
  metade não é pronto; não cabe na sessão → entregue o funcional e liste o que falta.

## Comunicação
- Resultado primeiro, só o que muda decisão do dono. Sem introdução, recapitulação, narração, hedging,
  disclaimer, lição de moral ou cortesia. Efeito no negócio; técnica só se perguntarem. Resposta
  proporcional; não despeje log — cite a linha que importa. Caminhos, comandos e links completos.
  Destrutivo de verdade: uma linha ("isso apaga X, sem volta — confirma?").
- Toda execução fecha com exatamente 3 "Próximos passos" (`N. [título] — [por quê] · [arquivo]`), por
  impacto, do que você viu, executáveis por você via MCP, para não-dev. É um menu: `1`,
  `1 e 3`, `APROVADO 2`, "todos" ou o bloco devolvido = executar na ordem, sem reconfirmar. Só consulta,
  sugestões já rejeitadas ou nada pendente → `Próximos passos: nada pendente neste escopo.`

## Fluxo Git — detalhe em `docs/agentes/github-ci.md`
- Repo `adm01-debug/Zapp_Web_V2`, `main`, público. Escrita no GitHub: MCP **`GITHUB - MCP - FOREVER`**
  (`github_push_files`); `git push`/`gh` só se o repo for fonte autorizada da sessão.
- Nunca commite em `main`. Só escreva em branch que **você** criou nesta sessão; branch alheia ou já
  existente é somente leitura. Antes do push, confira que o último commit é seu.
- Antes de começar: PR aberta tocando os mesmos arquivos → pare e avise o dono (via `github_graphql`).
- Branch de `main` atualizado: `claude/<fix|feat|chore|infra>-<slug>-<AAMMDD-HHMM>`.
- Commit curto em PT-BR, 1 atômico, `<tipo>(<escopo>): <assunto ≥10 chars, sem ponto>` (hook `commit-msg`).
- PR sempre: título = o que muda; corpo = causa + o que foi verificado, com evidência.
- Mergeie sem aprovação (squash, apague a branch) PR sua pronta: CI verde, sem conflito, escopo comum.
  **Deixe aberta e chame o dono**: DDL/migration em produção; CI/workflows, segredos, Dockerfile,
  stack/Swarm, Traefik; deleção de dado, arquitetura ou custo; conflito com PR de outro agente.
- Conflito: rebase em `main`; `--force-with-lease` só na sua branch.
- Merge = produção: confira o deploy e reporte. CI vermelha do seu merge → `fix:` em branch nova na mesma
  sessão. PR `BEHIND` → atualize a branch; nunca mexa no `strict`.
- Fim: link da PR + estado (mergeada / aguardando o dono / CI vermelha).

## Banco — ler `docs/agentes/banco.md` antes de SQL, migration ou deploy
- Oficial: Supabase Cloud **`tnnnlkbymytvtqngbbqh`** (`https://tnnnlkbymytvtqngbbqh.supabase.co`, PG 17.6),
  SQL pelo MCP **`SUPABASE - ZAPP WEB V2 - MCP`**.
- NÃO escrever em: `uqysyzndkfiwfztbqvsl` e `vpkmqeumtxhrwgawxdrl` (Lovable; MCP de nome quase igual ao
  oficial — confira qual carregou), self-hosted AtomicaBR, nem nos externos somente leitura
  `pgxfvjmuubtbowutlide` (CRM) e `doufsxqlfjyuvxuezpln` (Catálogo).
- Diagnóstico = produção só leitura. Teste = Postgres descartável (`scripts/db-audit/`). Dev server sem
  `VITE_ZAPP_LOCAL_SUPABASE_*` aponta para produção.
- DDL: arquivo em `supabase/migrations/` → PR → merge → deploy do código → apply. Nunca DDL de branch aberta;
  `REVOKE`/`DROP`/rename só depois do deploy do código; o ledger ao vivo é a verdade — nunca renomeie
  migration. Destrutivo, segredos e rotação de chaves: só com o dono.

## Serviços — detalhe em `docs/agentes/`
- **Evolution GO** — ler `evolution-go.md` ao mexer em conexão/QR. VPS Hostinger `srv1481814.hstgr.cloud`,
  Docker `evolution-go-rxj2`, instância `PRINCIPAL`, MCP `HOSTINGER` (não Portainer). `EVOLUTION_*` só nas
  edges. Fixtures de E2E em produção: **não apagar** (`regras-dominio.md`).
- **Vercel** — ler `vercel-deploy.md` ao confirmar deploy ou mexer em env/domínio. Projeto `zapp_web_v2`
  (`prj_J4wb8egzz8iL1CJnSOXJDtqnbvRp`), alias `https://zapp-web-v2.vercel.app`; `zappweb.app.br` serve a
  V3. Merge em `main` = deploy do front; edges pelo `deploy-functions.yml` (confirme o run; nunca deploy
  manual). Nunca segredo de servidor no Vercel; `VITE_*` é público.
- **GitHub/CI** — ler `github-ci.md` ao mexer em settings, branch protection ou workflows. Required checks
  `✅ CI Gate`, `🏗️ Build`, `🔎 TypeCheck`; `strict=true`; squash only. Mudou perímetro → atualize
  `scripts/ci/github-settings-baseline.json` na mesma PR. `docs/ci/README.md` é gerado.

## Stack e comandos — detalhe em `docs/agentes/mapa-repo.md`
- Vite + React + TypeScript (`src/`), Supabase (`supabase/functions/`, `supabase/migrations/`), Playwright
  (`e2e/`), **bun** (`bun install --frozen-lockfile`; `npm ci` falha), Node 24.
- `npx vitest run <caminho>`; `npx tsc --noEmit -p tsconfig.app.json` (completo `bun run typecheck`);
  `npx eslint <arquivos>`; `bun run test:e2e`; guards `node --test scripts/ci/*.unit.mjs`.
- Antes de qualquer tarefa: `git show origin/contexto:docs/contexto/00-INDEX.md` (gerado). `inventario/estado/`
  antes de grep. `docs/PRONTO_PRODUCAO.md` = o que está quebrado e onde fica cada fluxo.
- Automação em `scripts/<nome>/` com README (leia antes de alterar); nunca em `supabase/` nem `src/`.

## Grafo de código (graphify)
Grafo em `graphify-out/` (`bun run graph:setup`, precisa de `uv`/`pipx`). Quando `graphify-out/graph.json`
existir: `graphify query "<pergunta>"`, `graphify path "<A>" "<B>"`, `graphify explain "<conceito>"` antes
de buscar por texto; `GRAPH_REPORT.md` só para revisão ampla. Alterou código ou o report não é do HEAD
atual → `graphify update .` (só AST). Em nuvem, `.claude/hooks/session-start.sh` gera o grafo em segundo
plano — siga sem ele até terminar.
