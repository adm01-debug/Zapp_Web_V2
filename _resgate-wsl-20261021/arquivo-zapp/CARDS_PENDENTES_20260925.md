# Cards para o Claude planejar (achados da limpeza de 25/09/2026)

## CARD 1 — CI: hardening "wait for postgres" órfão no V2
Origem: Zapp_Web_V2_postmerge_hotfix_clone_20260829 (commit 0e34e1bd, PR nunca aberto)
Arquivo: scripts/db-audit/catalog-manifest.test.sh
Mudança: além de `pg_isready`, adiciona `psql SELECT 1` antes de considerar o container
pronto (evita corrida onde pg_isready retorna ok mas o DB ainda não aceita queries).
Confirmado AUSENTE no main atual (zapp-web-v2-main origin/main de 25/09).
Patch preservado em: _arquivo_zapp/v2_clones_pendentes/postmerge_hotfix_clone_dirty.diff
Ação sugerida: novo PR pequeno aplicando esse patch no zapp-web-v2-main.

## CARD 2 — Design "linguagem futurista" nunca chegou a PR (V2)
Origem: Zapp_Web_V2_design_20260831, branch feat/hermes-h356738-prototipos-futurista
7 commits (b67df5f6 e ancestrais) + 6 arquivos .bak + tmp/ (briefs/pareceres/plano da
tarefa h356738). Branch NUNCA existiu no remoto (confirmado via gh api → 404) e nenhum
PR com "futurista" no título existe (open ou closed). É trabalho 100% inédito.
Preservado em: _arquivo_zapp/v2_clones_pendentes/design_20260831.bundle (17 refs)
             + design_20260831_untracked.tar.gz (.bak + tmp/)
Ação sugerida: revisar se a "linguagem futurista" ainda é desejada (é de 02/09, pode
estar desatualizada frente ao redesign Navy que já foi mergeado depois — PRs #277,
#280, #620 fizeram redesign Navy nas abas). Decisão de produto, não técnica.

## CARD 3 — 43 commits "not-proven" do V3 (git_safety, backup de 07/09)
Amostragem confirma que a INTENÇÃO funcional já está no main atual por reescrita:
- fail-closed no validate-supabase-types.sh: PRESENTE (set -euo pipefail + exit 1 em
  6 pontos de falha)
- bun pinado: PRESENTE (bun-version: 1.3.14 em 5 workflows)
- ProtectedRoute + suite e2e auth: PRESENTE (11 specs e2e-auth*, 2 testes unitários)
- evolution-api fetch-profile fallback: termos presentes (66 ocorrências)

Únicos itens ainda abertos, confirmados HOJE via tsc real (não suposição):
  - src/features/inbox/components/contact-details/ContactTagsContent.tsx:39,62
    (TS7006, parâmetros implícitos any) — o commit b0392545/b3e131db "clear remaining
    inbox typecheck errors" NUNCA foi de fato aplicado ao main.
  - src/features/admin/hooks/monitoring/{useDispatchErrorLogs,useDlqAuditLog,
    useFailedMessages}.ts — mesmo padrão TS7006.
  - src/hooks/{useEvolutionApiLogs,useGoalNotifications,useSearchManagement}.ts —
    mesmo padrão.
  - src/features/contacts/hooks/useContactEnrichedData.ts:74 (TS2345, AbortSignal)
  - src/components/ai/ChurnPredictionDashboard.tsx:57 (TS2322, contactName nullable)
  - src/features/inbox/hooks/useMessageQueue.ts:513 (TS2339, .catch em PromiseLike)
  - src/tests/integration/supabase-integration.test.ts:36 (TS2554)

Total: 21 erros de typecheck REAIS e ATUAIS no origin/main do V3 (rodei `npx tsc
--noEmit -p tsconfig.app.json` após sync — exit code capturado, não suposto).

RESOLVIDO em 25/09: PR #1566 aberto, 21 -> 0 erros (tsc --noEmit -p tsconfig.app.json
e tsc --noEmit raiz, ambos exit 0). Causa raiz de 15/21: types.ts gerado não modela
o schema `zapp` (só tem `public`), client Supabase<Database,'zapp'> caía em `any`
estrutural em toda chamada .rpc(). Corrigido anotando o Row real no boundary de cada
hook + 2 assinaturas de RPC confirmadas por introspecção real (pg_proc) adicionadas
em types-manual.ts. Os outros 6 eram bugs reais independentes (nullable sem fallback,
AbortSignal opcional, union sem anotação, .then sem .catch encadeável, mock de teste).
Verificado: eslint . (só erro pré-existente fora do escopo em AutoTicketClassifier.tsx),
vitest run 12/12 passou (useMessageQueue, useFailedMessagesUI, integration).

## CARD 4 — supabase CLI deslogado impede gerar tipos localmente
`npm run typecheck` no V3 chama scripts/validate-supabase-types.sh que tenta gerar
types.ts contra SUPABASE_PROJECT_ID (vazio no .env.example local) — não é bug da
limpeza, é ambiente. Rodei apenas `npx tsc --noEmit` isolado para ter sinal real
(ver Card 3). Se quiser o typecheck oficial completo rodando, precisa
SUPABASE_PROJECT_ID setado ou supabase link.

## CARD 6 — RESOLVIDO: PR #1565 aberto reconciliando 14 migrations em drift
`supabase migration list --linked` no V3 (via MCP self-hosted, ver Card 7) achou 14
migrations aplicadas no banco entre 17/08 e 23/09 sem arquivo no repo. Reconstruído
via introspecção real (supabase_meta_get_table/list_functions/list_triggers) o DDL
idempotente de 7 com objeto persistente (buckets privados, evo.rabbitmq_*,
evo.kpi_rollup_24h, zapp.pii_access_log com RLS habilitado, schema prospeccao
completo). As outras 7 são operações pontuais (VACUUM, GRANT/REVOKE, backfill de
dados) sem DDL a repetir — documentadas como no-op textual no próprio arquivo.
Lint `node scripts/lint-migrations.mjs` limpo no arquivo novo (0 violações; a 1
violação restante do lint é pré-existente, commit 011d861d7, fora do escopo).
PR: https://github.com/adm01-debug/Zapp_Web_V3/pull/1565
IMPORTANTE: este PR NÃO toca GRANT/RLS do schema prospeccao — ver Card 8 (achado de
segurança tratado separadamente por decisão do Joaquim).

## CARD 8 — URGENTE, SEGURANÇA: schema prospeccao sem RLS, anon com CRUD total
Achado em 25/09/2026 durante reconciliação de migrations via MCP (introspecção real,
não suposição). Banco Zapp Web V3 (uqysyzndkfiwfztbqvsl), schema `prospeccao`
(migrations 20260915135302/135355, 20260923122452/122851):
  - `prospeccao.contatos`, `empresas`, `execucoes`, `cookies_config`: RLS
    DESABILITADO (rls_enabled=false) nas 4 tabelas.
  - GRANT completo (SELECT/INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER) para o
    papel `anon` nas 4 tabelas — confirmado via
    information_schema.role_table_grants (112 linhas).
  - `prospeccao.cookies_config` guarda cookies/tokens de sessão do Lusha e LinkedIn
    (colunas cookie, token, csrf_token, linkedin_cookie) em texto plano.
  - NÃO CONFIRMADO se o schema está exposto via PostgREST (PGRST_DB_SCHEMAS é env var
    do container, inacessível via SQL daqui) — mas mesmo sem exposição HTTP, o GRANT
    a `anon` é uma porta aberta caso qualquer credencial anon do projeto circule.
Comparar com `zapp`, que é documentado explicitamente como "NÃO exposto no PostgREST
por design" — `prospeccao` não tem essa mesma documentação/proteção.
Ação sugerida (decisão do Joaquim, NÃO EXECUTADA por mim): confirmar exposição real
via PostgREST, e se confirmado ou por precaução, REVOKE de anon + ENABLE RLS + policy
restrita a service_role/authenticated nas 4 tabelas do schema prospeccao. Rotacionar
os cookies armazenados como precaução se houve exposição.

## CARD 7 — RESOLVIDO: acesso ao banco do V3 obtido via MCP self-hosted
Joaquim forneceu o endpoint MCP com token embutido
(supabase-mcp.atomicabr.com.br/<token>/mcp, salvo em
_arquivo_zapp/v3_mcp/gateway_url.txt + helper mcp_call.py). Handshake e queries reais
confirmados (supabase_db_health, migration diff, introspecção de schema). Card fechado
— próxima limpeza pode reusar esse acesso direto, sem precisar do supabase CLI.

## CARD 9 — URGENTE, CI: main tem migração vitest 4→5 pendente e incompleta
Achado em 25/09/2026 durante auditoria exaustiva pós-PR #1565/#1566 (comando real,
não suposição). `package.json` do `main` já pede `"vitest": "^5.0.0"` e
`"@sentry/react": "10.75.0"`, mas `bun.lock` commitado está travado em
`vitest@4.1.10` / `@sentry/react@10.74.0` — 6+ dias de divergência entre manifest
e lockfile (package.json mudou em 21/09, bun.lock não é atualizado desde 15/09).

Por isso os 3 workflows (`ci.yml`, `e2e-nightly-full.yml`, `quality-gate.yml`) rodam
`bun install --ignore-scripts` SEM `--frozen-lockfile` — sem essa trava, o CI
silenciosamente resolve vitest 5.x a cada run e os gates de typecheck passam por
sorte (ou falham por sorte, dependendo do cache). Confirmado reproduzindo local:
`bun install --ignore-scripts --frozen-lockfile` falha com "lockfile had changes,
but lockfile is frozen" no estado atual do main.

Se o lockfile for corrigido para bater com package.json (`bun install` sem frozen,
commitando o resultado), o vitest sobe pra 5.x de verdade e **586 erros de tipo**
aparecem em ~60 arquivos de teste (`__tests__/*.test.tsx`) escritos pra API do
vitest 4 — é uma migração de major version pendente e incompleta, não um simples
ajuste de lockfile. Fora do escopo desta tarefa, não corrigido.

Ação sugerida: o Claude precisa decidir entre (a) reverter package.json pro vitest
4.x até a migração ser feita com calma, ou (b) planejar a migração real de ~60
arquivos de teste pra API do vitest 5. Só depois disso faz sentido adicionar
`--frozen-lockfile` nos 3 workflows (sem isso, o CI de calibração de lockfile
continua silenciosamente instável pra qualquer PR do repositório, não só os meus).
Nenhuma mudança foi commitada/empurrada nesta investigação — tudo revertido.

## CARD 5 — 3 workspaces órfãos em ~/hermes-workspaces (fora de ~/projetos)
chat-h357815, chat-h438347-mig, chat-h439328 — worktrees de tarefas concluídas cujo
hermes-tarefa-fechar não rodou a limpeza (mesma causa-raiz das pastas Zapp_Web_V3_*).
Commits confirmados 100% mergeados no V2 (e457bd9, 9dca72c, 4145c43 batem com PRs
já MERGED). Remoção segura, tratada na mesma leva desta limpeza (ver relatório final).
