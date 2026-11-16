# Recuperação de trabalho perdido — portar para uma branch nova a partir da `main` — Zapp Web V2

Você trabalha num worktree isolado (seu diretório atual é um checkout limpo da `origin/main`). NUNCA toque na branch `main` remota, nunca force-push, nunca commite em branch que não seja a sua. Commits: Conventional Commits PT-BR (`feat(escopo): assunto ≥10 chars sem ponto`), rodapé obrigatório:
Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Gd4dBhNxQY5xH83gU9ZaZb

ENTRADA: dossiê(s) em {{DOSSIES}} (seção "lacunas"/"Verificação adversarial" diz exatamente o que falta). Refs de origem (`git show <ref>:<arquivo>`, `git diff <merge_base> <ref> -- <arquivo>`) estão no clone principal `/home/user/Zapp_Web_V2` (`git -C /home/user/Zapp_Web_V2 ...`, somente leitura lá).

REGRAS
1. Porte SOMENTE as lacunas marcadas PERDIDA (valor alto/médio/baixo), adaptando ao código atual da `main` (APIs renomeadas, arquivos movidos). Não reintroduza código que a `main` removeu de propósito. Diff mínimo; sem refatoração.
2. Funcionalidade pela metade → complete ponta a ponta: componente importado e usado, rota registrada, hook/serviço chamado, edge registrada em `supabase/config.toml` se for o padrão do repo, migration com RLS, estados erro/loading/vazio, teste existente ajustado. Sem TODO/mock/hardcode.
3. Migrations: arquivo novo em `supabase/migrations/<timestamp>_<slug>.sql`, idempotente (`IF NOT EXISTS`, `CREATE OR REPLACE`), com RLS e grants coerentes com tabelas vizinhas; leia `docs/agentes/banco.md` antes. Confira em produção (MCP `SUPABASE - ZAPP WEB V2 - MCP` `db_query`, SOMENTE SELECT) se o objeto já existe. Nunca DDL pelo MCP.
4. Proibido afrouxar portões: nada de `skip`/`.only`, `eslint-disable`, `@ts-ignore`, `any` novo, baixar threshold, mexer em `.github/workflows`, ampliar `known-violations`/baselines. Se a `main` tem `scripts/ci/*.unit.mjs` que verifica algo que você tocou, rode.
5. Antes de commitar rode no worktree o que couber: `npx tsc --noEmit -p tsconfig.app.json`, `npx eslint <arquivos tocados>`, `npx vitest run <testes relacionados>`; para edges `deno check` se houver `supabase/functions/deno.json`. Só erro introduzido por você conta; erro herdado → anote.
6. Faça 1 commit atômico na branch local `{{BRANCH}}` (crie-a a partir de HEAD). NÃO faça push (o orquestrador faz). 
7. Devolva no schema: arquivos tocados, lacunas portadas (id do item → arquivo), lacunas NÃO portadas com motivo, comandos rodados com resultado (passou/falhou + linha do erro), se há migration (lista), se há edge (lista), riscos.
