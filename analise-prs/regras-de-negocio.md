# Regras de Negócio — Análise de PRs (2026-10-22)

> Documento reconstruído em 2026-10-22 com fontes diretas do codebase.

---

## 1. Regras operacionais desta sessão (fonte: prompt do /goal)

| Regra | Descrição |
|---|---|
| **workflows** | Qualquer PR que adicione, modifique ou remova arquivos em `.github/workflows/` é **BLOQUEADO automaticamente**, independente do conteúdo |
| **push-direto** | Proibido push direto na main, force-push, fechar/editar/comentar PR, labels, deletar branch, mudar configurações |
| **singu** | SINGU é somente leitura — PR que escreva nele não é mergeado |
| **ddl-destrutivo** | Migration só se aditiva e não-destrutiva (sem DROP table, RENAME, ALTER TYPE, DELETE/UPDATE em massa), idempotente |
| **evidência** | Toda afirmação com evidência (arquivo:linha, SHA, PR ou saída de comando) |

## 2. Branch protection da `main` (fonte: CLAUDE.md §Perímetro do GitHub)

- `strict=true` (PR deve estar atualizado com main antes de mergear)
- `enforce_admins=true`
- **6 required checks**: `🔍 Lint & TypeCheck`, `🧪 Unit Tests`, `🏗️ Build`, `🔒 Security Audit`, `Contrato DB offline`, `🎭 E2E Tests (Playwright)`
- Squash merge obrigatório (`allow_squash_merge=true`, outros desligados)

## 3. Workflows legítimos da main (fonte: `ls .github/workflows/`)

Inventário atual (15 arquivos em `main` em 2026-10-22, SHA `5a4632c`):
```
branch-hygiene-audit.yml  ci.yml                codeql.yml
crm-sync-worker.yml       db-guard.yml          db-live-guard.yml
db-migrate.yml            deploy-functions.yml  e2e-logado.yml
e2e-talkx.yml             notifica-falha-main.yml  talkx-status-regen.yml
targeted-ledger-evidence.yml  types-sync.yml    vercel-env-cleanup.yml
```

**Arquivos ausentes no main** (mas presentes em várias branches abertas):
- `eslint.yml` — NÃO existe na main; provável herança de ancestor comum (presente em 26 de 30 PRs como adição)
- `static.yml` — idem
- `auto-update-pr-branch.yml` — presente em PRs de reconciliação; foi removido da main em revisão anterior
- `settings-guard.yml` — idem

## 4. Tech stack do projeto (fonte: package.json, tsconfig.json, vite.config.ts)

- **Linguagem**: TypeScript + React
- **Bundler**: Vite
- **Runtime**: Bun 1.4.2
- **Banco**: Supabase PostgreSQL 17.6
- **Testes**: Vitest (unit), Playwright (e2e)
- **Deploy**: Vercel (front), Supabase Cloud (edge functions)

**Tecnologias NÃO usadas neste projeto** (relevante para os 20 PRs de templates):
- Python, Django, Conda, Pip
- Java, Maven, PMD
- PHP, PHPMD, Composer
- R, lintr
- Rust, Cargo, clippy
- Docker (não para builds de app)
- Deno
- Next.js (usa Vite/React, não Next.js)
- SLSA (supply chain security framework — não configurado)

## 5. Falhas pré-existentes na main (fonte: `analise-prs/baseline/tests.txt`, CI job 119967797371)

HEAD da main em 2026-10-22: `5a4632c87f7e233fe62e830443f8b0eddf3e1a72`

**44 testes falhando em 15 arquivos** (pré-existentes, não regressão de nenhum PR):
- `useInboxBulkActions.test.ts` (2 falhas)
- `useGoalsDashboard.test.tsx` (4 falhas)
- `useTalkXSegments.test.ts` (6 falhas)
- `outbound-message.service.test.ts` (1 falha)
- `contrasteAA.test.tsx` (4 falhas)
- `useChatMediaSending.audio-meme-falha.test.ts` (3 falhas)
- `AuditLogDashboard.test.tsx` (9 falhas)
- `fundacaoVisual.test.tsx` (2 falhas)
- `ChatPopup.pagination.test.tsx` (1 falha)
- `TalkXOverview.states.test.tsx` (1 falha)
- `TalkXA11yNomePapel.test.tsx` (3 falhas)
- `adminDownloadPermission.test.ts` (5 falhas)
- `ChatMessagesArea.agrupar-envio.test.tsx` (4 falhas — CI shard 1)
- `ChatMessagesArea.movimento-reduzido.test.tsx` (1 falha — CI shard 1)
- `FilesTab.fase6.test.tsx` (2 falhas — CI shard 1)

## 6. Critérios de avaliação por PR

Para cada PR, 4 perguntas:

| Critério | Pergunta | Evidência requerida |
|---|---|---|
| **1. Válida?** | O PR ainda resolve um problema real ou traz valor? | Descrição do PR + contexto do projeto |
| **2. Regressão?** | O PR introduz novas falhas de teste vs. baseline? | `bun run test` ou comparação de erros com baseline |
| **3. Já no main?** | A mudança já foi incorporada na main? | `git diff main..origin/<branch> -- <files>` |
| **4. Regra correta?** | A implementação está tecnicamente correta? | Análise do diff, migrations, testes |

## 7. Classificação dos 30 PRs abertos

| Categoria | Contagem | Exemplos |
|---|---|---|
| Templates de workflow GitHub (alien) | 20 | PRs #2157–#2178 |
| Fixes de CI/workflow | 3 | #2151, #2155, #2183 |
| PRs de conteúdo legítimo c/ herança de workflows | 4 | #2149, #2152, #2185, #2186 |
| Outros workflows | 3 | #2179, #2181 + resto |

**Veredicto único**: todos os 30 BLOQUEADOS por tocar `.github/workflows/`.

## 8. Fontes consultadas

| Fonte | O que fornece |
|---|---|
| `CLAUDE.md` | Regras operacionais, perímetro do GitHub, tech stack |
| `TESTING_CONVENTION.md` | Convenções de teste |
| `analise-prs/baseline/tests.txt` | Falhas pré-existentes na main |
| `git diff --name-only main..origin/<branch>` | Arquivos tocados por cada PR |
| `git diff main..origin/<branch>` | Conteúdo completo das mudanças |
| `.github/workflows/` | Inventário de workflows legítimos |
| `package.json` | Tech stack confirmado (Bun, Vite, React, Vitest) |
| CI run #119967797371 (shard 1/3) | Falhas confirmadas da main em CI |
