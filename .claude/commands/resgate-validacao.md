# /resgate-validacao — Validação exaustiva do resgate Zapp Web V2

Comando do Claude Code (online). Papel: **dev sênior com PhD em banco de dados**, coordenando **5 agentes especializados** (subagentes) para testar, simular e auditar **tudo o que o próprio processo de resgate já implementou** (goals L1/L2/O1): tags `resgate/*`, mapa, branches/PRs de cluster mergeadas, migrations, edge functions, front. Objetivo: encontrar **falhas, regressões, gaps e meias-entregas** com evidência, e corrigir só o que o resgate quebrou.

Idioma: PT-BR. Repo: `adm01-debug/Zapp_Web_V2` (público, deploy Vercel no merge). Produção Supabase: MCP `SUPABASE - ZAPP WEB V2 - MCP`, **somente leitura** neste comando.

---

## 0. Leitura obrigatória antes de qualquer coisa

1. `CLAUDE.md`, `AGENTS.md`, `CONTRIBUTING.md`, `TESTING_CONVENTION.md` (convenções de migration, `reserve_migration_version()`, `db-migrate.yml`, gates de CI, ratchet de typecheck).
2. `docs/resgate/MAPA_2026-10-24.md` (clusters, cabeças, peças, vereditos, tags).
3. `resgate-online/` se existir no main (progresso.json, dossiês, RELATORIO_RESGATE.md) e `analise-prs/` se existir em alguma ref (prs.json, baseline/, regras-de-negocio.md).
4. PRs abertas relevantes ao contexto (não mexer nelas): #2244 (75 erros de typecheck herdados no main — tudo que bater nisso é **HERDADO**, não regressão), #2241 (auditoria Supabase: anon write, UPDATE sem WITH CHECK, FKs sem índice — usar como lista de verificação do agente BANCO), #2245, #2219, #2211.

## 1. Regras (valem para o coordenador e para os 5 agentes)

- **Escrita no GitHub** só por branch nova `claude/fix-<slug>-<AAMMDD-HHMM>` a partir do main atual + PR; merge só pelo critério da seção 7. Proibido: push em `main`, force-push, apagar branch/tag, fechar/editar/comentar PR alheia, tocar `.github/workflows`, Dockerfile, segredos.
- **Produção**: nenhuma escrita (sem `apply_migration`, `db_*` de escrita, `deploy_edge_function`, `functions_invoke` com efeito colateral). Invocação de edge function só com payload inócuo (dry-run/validação) e registrada no relatório com request/response resumidos.
- **Banco temporário** para tudo que executa SQL: `supabase start` se houver Docker; senão `initdb` local (`apt-get install postgresql` / `pg_tmp`) ou `pglite`. Registrar qual. Se nenhum disponível → item `NÃO VERIFICADO (sem Postgres local)`, nunca "simular" com leitura de código.
- **Evidência em tudo**: SHA, `arquivo:linha`, saída de comando, query + resultado. Sem evidência = `NÃO VERIFICADO` + motivo. Nome de PR, commit, comentário, dossiê ou relatório anterior **não é prova** — reexecute.
- **Segredos**: `.env*`, `sensiveis/`, chaves, tokens jamais em relatório, chat, commit ou PR. Achou segredo em tag/commit → `arquivo:linha` + nome, nunca o valor.
- **Processos pesados** (tsc, eslint, vitest, build, playwright) em sequência, nunca em paralelo entre agentes — o coordenador serializa pela fila da seção 4.
- SINGU e Zapp V3: fora de escopo, somente leitura.
- Um achado = um registro em `achados.json` (schema na seção 8). Sem achado duplicado entre agentes: o coordenador deduplica por `arquivo:linha + sintoma`.
- `progresso.json` atualizado ao fim de cada fase e de cada agente.

## 2. Fase 0 — Escopo real do que foi implementado (coordenador, 1 processo)

Montar `resgate-online/validacao/escopo.json` com **tudo** que o resgate escreveu no GitHub, sem confiar no MAPA:

1. `git fetch origin --tags --prune` e `git fetch origin '+refs/resgate/*:refs/remotes/resgate/*' 2>/dev/null`; `git ls-remote origin 'refs/tags/resgate/*' 'refs/resgate/*'` → lista completa de tags (nome, SHA alvo, data, mensagem anotada).
2. PRs mergeadas com `merged_at >= 2026-10-24` cujo head começa com `claude/feat-`, `claude/chore-mapa-resgate`, ou cujo corpo cita `resgate`, `cluster`, `MAPA_2026-10-24` (`gh pr list --state merged --search ...` + `gh pr view --json files,mergeCommit,body`). Para cada: número, head, merge commit, arquivos, clusters citados, migrations/edge/tabelas citadas.
3. Branches `claude/feat-*` abertas com PR aberta marcada COMPLETAR / DECISÃO HUMANA (só listar; não mexer).
4. `baseline`: SHA do main **imediatamente anterior ao primeiro merge do resgate** (pai do primeiro merge commit) e SHA do main atual. Tudo que for comparado "antes × depois" usa esses dois SHAs.
5. Cruzar: cada cluster do MAPA com veredito INTEGRAR → tem PR mergeada? aberta? nenhuma? Cada tag do MAPA existe no remoto? Tag no remoto que não está no MAPA?

Saída no chat ao fim da fase: nº de tags, nº de PRs mergeadas do resgate (lista), nº de clusters INTEGRAR sem PR, SHAs de baseline.

## 3. Os 5 agentes (despachar em paralelo via Agent tool, cada um com este arquivo + `escopo.json` + a lista exata do que validar)

Cada agente recebe: papel, lista fechada de itens, comandos permitidos, formato de saída (`achados.json` + `relatorio-<agente>.md`), proibição de escrever no GitHub/produção, e a regra de serialização de processos pesados (pede ao coordenador antes de rodar tsc/vitest/build).

### A1 — RASTREABILIDADE (git/patch-id)
Itens: todas as tags `resgate/*`; cada PR mergeada do resgate; o MAPA.
Verificar:
- Para cada cluster INTEGRAR mergeado: `git rev-list --cherry-pick --right-only --no-merges main...<tag>` para **cada tag do cluster** → cada commit único está (a) no main por patch-id, (b) listado na PR como descartado **com motivo**, ou (c) **PERDIDO** → achado HIGH.
- Para cada peça "descartada por já existir no main": provar equivalência (mesmo símbolo/rota/tabela/texto; `git diff <tag>:<arquivo> main:<arquivo>` restrito ao hunk). Equivalência afirmada sem prova → achado MEDIUM.
- `gitleaks detect --log-opts="<merge-base>..<tag>"` em **todas** as tags (lote, 1 processo) → segredo → CRITICAL.
- MAPA × remoto: contagens, tags ausentes, tags extras, vereditos alterados sem registro.
- PRs antigas marcadas "supersede PR #n": a nova branch cobre 100% dos patch-ids da PR antiga? Se não → listar o que ficou de fora.
- Commits de merge do resgate: autor/assinatura, `--no-verify` indevido (hook de pre-push pulado em branch de código?), arquivos fora do escopo do cluster (`gh pr view --json files` vs cluster).

### A2 — BANCO (PhD em banco de dados — o agente mais exigente)
Itens: toda migration, função, trigger, policy, índice, cron, enum, view e seed trazidos por PR mergeada do resgate (e as presentes nas tags INTEGRAR ainda não mergeadas, só para classificar risco).
Verificar, em Postgres temporário:
- **Cadeia completa** `supabase/migrations/` do zero até o HEAD → deve aplicar limpa. Depois **reaplicar só as migrations do resgate** uma segunda vez → idempotência (IF NOT EXISTS, OR REPLACE, DROP IF EXISTS, `ON CONFLICT`). Falha = HIGH.
- Versão/ordem: nome segue `reserve_migration_version()`/convenção do CLAUDE.md? Timestamp menor que migration já aplicada em produção (`list_migrations`/`db_migrations`) → HIGH (não vai aplicar no `db-migrate.yml`).
- **Drift repo × produção** (leitura via MCP): para cada objeto tocado, `db_describe_table`, `db_list_policies`, `db_list_functions` + `pg_get_functiondef`, `db_list_indexes`, `db_list_triggers`. Objeto existe no repo mas não em prod (ou vice-versa) → registrar "pendente de aplicar" vs "aplicado fora do repo".
- **RLS — matriz de acesso** para cada tabela tocada, no Postgres temporário com dados de 2 tenants: roles `anon`, `authenticated` tenant A, `authenticated` tenant B, `service_role`, via `set role` + `set request.jwt.claims`. Operações SELECT/INSERT/UPDATE/DELETE. Comparar matriz **antes** (baseline) × **depois** (atual): qualquer célula que passou de negado para permitido = CRITICAL, salvo regra de negócio explícita na PR. UPDATE sem `WITH CHECK`, policy `USING (true)`, grant a `anon` em tabela de negócio → CRITICAL (cruzar com #2241).
- Funções `SECURITY DEFINER` novas/alteradas: `SET search_path`, owner, grants `EXECUTE` (revogado de `public`/`anon`?), injeção via `format`/`EXECUTE` dinâmico.
- Integridade: FK sem índice nas tabelas novas (`db_missing_indexes`), tabela sem PK, coluna `NOT NULL` adicionada sem default em tabela populada, `DROP`/`RENAME`/`ALTER TYPE` (destrutivo → CRITICAL se mergeado), enum alterado dentro de transação.
- Performance: `EXPLAIN (ANALYZE, BUFFERS)` das queries/RPCs novas com volume sintético (≥ 100k linhas na tabela principal) → seq scan em tabela grande, sort externo, N+1 em função PL/pgSQL → HIGH/MEDIUM. Índice duplicado (`db_duplicate_indexes`).
- Triggers/crons novos: reentrância, `WHEN OTHERS` engolindo `query_canceled` (57014), lock advisory, janela temporal — mesmos padrões do #2245.
- Tipos: `src/integrations/supabase/types.ts` contém cada tabela/RPC nova? (ausente → front quebra em typecheck; cruzar com #2244).
- Simulação de negócio: para cada fluxo de dados do cluster (ex.: criar X → trigger → tabela Y → RPC Z), rodar o fluxo no temporário com dados dos 2 tenants e conferir resultado esperado, inclusive casos de borda (nulo, duplicado, concorrência com 2 sessões, rollback).

### A3 — EDGE FUNCTIONS
Itens: toda função em `supabase/functions/` criada/alterada por PR mergeada do resgate.
Verificar:
- Deploy × repo: `get_edge_function`/`list_edge_functions` (versão, data) vs arquivo no main; diff textual. Divergente → "não deployada" ou "deploy fora do repo" (HIGH).
- Testes Deno existentes passam (`deno test` na pasta da função); função sem teste → GAP MEDIUM.
- **Matriz de invocação** (local via `supabase functions serve` se Docker; senão análise estática linha a linha + 1 invocação inócua em prod só se a função for idempotente/leitura): sem `Authorization` → 401; JWT válido + payload válido → 2xx; payload inválido/vazio → 4xx **sem 500**; tenant de outro usuário → negado; método errado → 405; CORS preflight.
- Auth não afrouxada vs baseline: `verify_jwt`, uso de `service_role` onde antes era usuário, `supabase.auth.getUser` removido.
- Secrets referenciados (`Deno.env.get`) existem em produção (nomes, nunca valores) → ausente = HIGH.
- Logs 24h (`query_logs`) da função: erro novo após o merge → HIGH.
- Invocadores: grep no front/`invokeEdge` de quem chama a função; contrato request/response bate com o chamador (campos, tipos).

### A4 — FRONT / INTEGRAÇÃO PONTA A PONTA
Itens: cada feature/fix de PR mergeada do resgate.
Verificar, por item, com `arquivo:linha`:
- Componente **importado e renderizado** (não só criado); rota registrada no router; entrada de menu/UI; hook/serviço **chamado**; RPC/tabela/edge usada existe nos `types.ts`; permissão/feature flag coerente com `FEATURE_REGISTRY.md`.
- Estados: loading, erro, vazio; botão com handler; form com submit e validação; mensagens em PT-BR; sem `TODO`/`WIP`/mock/hardcode/`console.log` sobrando.
- Fluxo completo: cria **e** edita **e** exclui **e** lista, quando a feature promete CRUD. Pela metade → GAP MEDIUM com lista exata do que falta.
- `vitest` dos arquivos tocados + `vitest.contracts.config.ts`; teste que falhava antes e passa agora porque foi enfraquecido (`.skip`, `expect` removido, mock amplo) → HIGH.
- `vite build` com o main atual (1 processo); erro introduzido pelo resgate → HIGH; herdado → HERDADO.
- Playwright: se existir spec em `e2e/` cobrindo a tela, rodar só essa spec. Preview Vercel do merge commit (`vercel.json`, deployment URL via MCP Vercel): abrir a rota e registrar screenshot/erro de console quando possível.
- Simulação de uso: roteiro de 5–10 passos por feature como usuário real (login → tela → ação → resultado no banco temporário ou mock), registrando onde quebra.

### A5 — REGRESSÃO / CI / BASELINE
Itens: diferença `baseline..main` restrita aos merges do resgate.
Verificar:
- `tsc --noEmit`, `eslint`, `vitest run` no **baseline** e no **main atual** (worktrees separados, processos em sequência); diff de erros: novo = regressão (HIGH), removido = ok, igual = HERDADO (citar #2244/#2219).
- Para cada merge commit do resgate: `gh run list --commit <sha>` → status de cada workflow; vermelho → `gh run view --log-failed` e classificar (introduzido × herdado × flaky).
- Código recente apagado/revertido: `git diff baseline..main --diff-filter=D --stat`; `git log -S'<símbolo>'` para funções/rotas/colunas que sumiram; chamadores órfãos (`grep` do símbolo removido).
- Defaults, permissões, flags e constantes alterados (`git diff -G'(default|permission|role|flag|enabled)'`).
- Dependências: `package.json`/`bun.lock` alterados pelo resgate (novo pacote, bump major) sem aviso na PR → MEDIUM.
- `FEATURE_REGISTRY.md`, `ESTADO.md`, `PENDENCIAS.md`, `CHANGELOG.md`: a feature mergeada está registrada? Inconsistência → LOW.
- `performance-budget.json`: build do main atual dentro do orçamento?

## 4. Fila de processos pesados (coordenador)

Ordem fixa, um por vez, cada um com log em `resgate-online/validacao/logs/`: (1) cadeia de migrations no temporário [A2]; (2) `tsc` baseline; (3) `tsc` main; (4) `eslint` baseline/main; (5) `vitest` baseline; (6) `vitest` main; (7) `vite build` main; (8) `deno test` edge; (9) playwright specs selecionadas; (10) gitleaks em lote. Agentes recebem o resultado pelo arquivo de log; não reexecutam.

## 5. Fase 2 — Consolidação e contraprova (coordenador)

1. Mesclar os 5 `achados.json`; deduplicar; atribuir severidade final.
2. **Contraprova**: para cada CRITICAL e HIGH, o coordenador reproduz a evidência **pessoalmente** (reexecuta a query/comando/diff). Não reproduziu → rebaixa para `NÃO CONFIRMADO` e explica.
3. Matriz de cobertura (`matriz-cobertura.md`): linhas = cada item implementado (tag/PR/migration/edge/componente); colunas = A1…A5; célula = VALIDADO / FALHA(#id) / GAP(#id) / NÃO VERIFICADO(motivo). Nenhuma célula vazia.
4. **Simulações cruzadas** (`simulacoes.md`): para cada cluster mergeado, 1 cenário de negócio ponta a ponta (UI → RPC/edge → tabela → RLS → retorno), executado no temporário com os 2 tenants, com passos, dados e resultado. Mínimo 1 cenário feliz + 1 de abuso (tenant B tentando ler/alterar dado do tenant A) + 1 de borda.
5. Procurar **gaps por omissão**: cluster INTEGRAR sem PR; peça do MAPA sem tag; feature mergeada sem migration correspondente aplicada em prod (ou vice-versa); edge function no repo sem deploy; tabela nova sem policy; RPC nova sem tipo; componente sem rota.

## 6. Fase 3 — Correções (somente regressões introduzidas pelo resgate)

- Só corrige achado classificado **introduzido pelo resgate** (não herdado) e **sem DDL de produção, sem workflow, sem segredo** — uma branch `claude/fix-<slug>-<AAMMDD-HHMM>` por achado, diff mínimo, PR com causa + evidência antes/depois.
- Achado que exige migration, RLS, dado ou arquitetura → PR **não** é aberta; vai para o relatório como `DECISÃO HUMANA` com a proposta de SQL em `resgate-online/validacao/propostas/<id>.sql` (com rollback).
- Herdados do main: só listar com link da PR que já trata (#2244, #2219, #2211) — não duplicar PR.

## 7. Critério de merge das PRs de correção

Merge (squash, apagar branch) **só** se: CI verde ou vermelho exclusivamente por erro HERDADO comprovado no baseline; sem conflito; zero erro novo de tsc/eslint/vitest nos arquivos tocados; o achado reproduzido antes e não reproduzido depois (evidência das duas execuções); escopo comum (front, edge function, config). Caso contrário, PR aberta com motivo. Após merge: `gh run list --commit` + deployment Vercel do commit (MCP Vercel) → reportar estado; falha nova → parar merges e avisar com SHA.

## 8. Entregáveis em `resgate-online/validacao/` (commitar via PR `claude/chore-validacao-resgate-<AAMMDD-HHMM>`, não mergear — é documentação para decisão)

- `escopo.json`, `baseline.json` (SHAs, contagens de erros tsc/eslint/vitest no baseline e no atual).
- `achados.json`: `[{id, agente, severidade (CRITICAL|HIGH|MEDIUM|LOW|INFO), tipo (REGRESSAO|FALHA|GAP|HERDADO|NAO_CONFIRMADO), cluster, pr, item, arquivo_linha, sintoma, evidencia, reproducao (comando), causa, correcao (PR ou DECISÃO HUMANA ou proposta.sql), status}]`.
- `relatorio-A1.md` … `relatorio-A5.md`, `matriz-cobertura.md`, `simulacoes.md`, `logs/`, `propostas/`, `progresso.json`.
- `RELATORIO_VALIDACAO.md`: resumo executivo (contagem por severidade e tipo); tabela de todos os CRITICAL/HIGH com evidência; itens VALIDADOS (com a prova em 1 linha cada); GAPs por omissão; PRs de correção (link + estado); DECISÃO HUMANA; NÃO VERIFICADO com motivo; 3 próximos passos.

## 9. Meta cumprida só quando o chat mostrar

- Escopo: nº de tags, PRs mergeadas do resgate, clusters INTEGRAR sem PR, SHAs de baseline/atual.
- Os 5 agentes concluídos, com nº de achados cada um e tempo.
- Contagem final por severidade × tipo; lista completa dos CRITICAL/HIGH com `arquivo:linha` e evidência.
- Matriz de cobertura sem célula vazia; nº de simulações executadas (feliz/abuso/borda) e resultado.
- Matriz RLS antes × depois para cada tabela tocada (nº de células que mudaram, quais).
- PRs de correção: link + estado (mergeada / aberta e por quê / CI).
- Prova de que produção não foi alterada: contagens `migrations/policies/functions/crons` via MCP antes e depois iguais; nenhuma `deploy_edge_function`/`apply_migration` executada.
- Prova de que nenhuma branch/tag remota foi apagada e `main` só mudou pelos merges listados (SHA antes/depois).
- Caminhos de todos os arquivos + link da PR de documentação.

Ou pare após 100 turnos e entregue o parcial com `progresso.json` dizendo exatamente onde parou.
