# Triagem semântica de uma branch/PR fechada contra a `main` — Zapp Web V2

Repo local: `/home/user/Zapp_Web_V2` (clone completo; `origin/main` = estado atual da main; refs `refs/remotes/origin/<branch>` e `refs/remotes/pr/<n>` disponíveis). Scratch: `/tmp/claude-0/-home-user-Zapp-Web-V2/19ff5006-3a0f-568b-84a1-eb12d2182604/scratchpad`.

REGRAS DURAS
- Git SOMENTE leitura: `git show`, `git diff`, `git log`, `git grep <padrão> origin/main -- <paths>`, `git ls-tree`. NUNCA `checkout`, `switch`, `reset`, `stash`, `merge`, `rebase`, `commit`, `worktree`. Outros agentes rodam em paralelo neste mesmo clone.
- Não edite nenhum arquivo do repo. Escreva só o dossiê no scratch (caminho abaixo).
- Verdade acima de validação: toda afirmação com evidência (arquivo:linha, SHA, saída de comando/consulta). Comentários de fechamento de PR e triagens anteriores são HIPÓTESES a verificar, não prova.
- Banco: se a branch traz migration/função SQL, consulte produção SOMENTE LEITURA via MCP `SUPABASE - ZAPP WEB V2 - MCP` (ferramenta `db_query`, carregue com ToolSearch `select:mcp__SUPABASE_-_ZAPP_WEB_V2_-_MCP__db_query`): `select version,name from supabase_migrations.schema_migrations where version in (...)`, `select proname from pg_proc where proname in (...)`, `select tablename from pg_tables where tablename in (...)`, `select policyname from pg_policies where tablename=...`. Nunca INSERT/UPDATE/DDL.
- Para contexto de PR (corpo, comentários, por que foi fechada) use o MCP GitHub via ToolSearch `select:mcp__GITHUB_-_MCP_-_FOREVER__github_graphql` com `repository(owner:"adm01-debug",name:"Zapp_Web_V2"){pullRequest(number:N){title body comments(last:5){nodes{body}}}}`. Opcional; só se precisar.
- Antes de grep em massa em `src/`, pode usar `graphify query "<pergunta>"` (grafo em `graphify-out/`), útil para achar onde um conceito vive hoje na main.

ENTRADA
O JSON do item está em `{{PATH}}`. Campos: `ref` (branch ou refs/remotes/pr/N), `merge_base`, `tip`, `files[]` com `status` (IDENTICAL_TO_MAIN, BOTH_CHANGED, MAIN_UNCHANGED_SINCE_BASE, NEW_FILE_ABSENT_IN_MAIN, DELETED_IN_BRANCH), `hunk` (PRESENT_BYTE / PRESENT_REVERSE_APPLIES = já está na main com prova mecânica; ABSENT_APPLIES_CLEAN = o patch aplica limpo na main, ou seja, NÃO está lá; CONFLICT = precisa análise), e `line_check` (`missing_in_main` = linhas adicionadas pela branch que não existem na versão da main; `missing_sample`; `removed_still_in_main` = linhas que a branch removia e a main ainda tem; `same_basename_in_main` = arquivo novo que pode ter sido movido). Também `prs_with_same_tip`/`pr`, `closure_comment` (o que o agente que fechou alegou) e `triagem_2804` (caixa de uma triagem anterior, 2026-11-08).

O QUE FAZER
1. Entenda o propósito da branch: `git log --format='%h %s' {{MB}}..{{REF}}` e `git diff --stat {{MB}} {{REF}}`.
2. Para CADA arquivo com lacuna (`missing_in_main>0`, `removed_still_in_main>0`, `DELETED_IN_BRANCH`, `NEW_FILE_ABSENT_IN_MAIN`, `ABSENT_APPLIES_CLEAN`): leia o diff daquele arquivo (`git diff {{MB}} {{REF}} -- <arquivo>`) e decida, hunk a hunk, se a intenção já está na main de outra forma (arquivo movido/renomeado, refatorado, mesmo comportamento com outro texto — prove com `git grep`/`git show origin/main:<arquivo>` e número de linha), se ficou OBSOLETA (o código-alvo foi removido/substituído de propósito na main — cite o commit: `git log -S'<trecho>' --oneline origin/main -- <arquivo>`), ou se é TRABALHO PERDIDO (não está na main e ainda faz sentido no código atual).
3. Classifique cada lacuna com `valor` para o negócio: alto (corrige bug real, segurança, fluxo crítico: WhatsApp/Evolution, inbox, envio, contatos, login), médio (feature/UX útil, teste que protege comportamento), baixo (docs, relatório, cosmético), nenhum (ruído, duplicata, artefato gerado).
4. Veredito do item:
   - `INCORPORADA`: toda lacuna já está na main (prova por arquivo).
   - `OBSOLETA`: o que falta não faz mais sentido (alvo removido/substituído de propósito, ou abordagem superada por outra já na main que cobre a mesma necessidade). Cite a prova.
   - `PERDIDA_TOTAL`: nada do trabalho útil está na main.
   - `PERDIDA_PARCIAL`: parte entrou, parte não (ou a funcionalidade foi deixada pela metade: lista exata do que falta para ficar completa de ponta a ponta — rota, UI, hook, edge, tabela/RLS, teste).
   - `DECISAO_DONO`: SÓ quando a lacuna (a) cria custo externo recorrente (ex.: chamada de LLM por mensagem) ou (b) CONTRADIZ uma regra de negócio vigente na main (ex.: muda permissão/cores/fluxo de forma oposta ao que a main faz hoje). Mudanças de banco (DDL/migration/RPC/RLS), edges e workflows NÃO são motivo de DECISAO_DONO: o dono já autorizou backend e banco. Registre o tipo em `tipos`.
5. `apagar_branch_seguro` = true SOMENTE se veredito INCORPORADA ou OBSOLETA com prova completa para TODOS os arquivos. Qualquer dúvida → false.
6. Escreva o dossiê em `/tmp/claude-0/-home-user-Zapp-Web-V2/19ff5006-3a0f-568b-84a1-eb12d2182604/scratchpad/dossies/{{ID}}.md` (PT-BR, curto: propósito, tabela arquivo × achado × evidência, veredito, lacunas a recuperar com caminho dos arquivos e trechos relevantes do diff — cole os hunks essenciais das lacunas PERDIDAS para que outro agente consiga portar sem reler a branch).
7. Devolva o resultado estruturado (schema). Seja econômico: não reproduza diffs inteiros na resposta; o dossiê é o lugar deles.
