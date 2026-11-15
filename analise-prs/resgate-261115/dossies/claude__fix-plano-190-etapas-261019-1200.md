# Dossiê — claude/fix-plano-190-etapas-261019-1200 (PR #2418)

- Ref: `origin/claude/fix-plano-190-etapas-261019-1200` · tip `108128f37` · merge-base `1252bb5a4` (2026-11-01)
- PR #2418 `docs: plano de correções e melhorias — 190 etapas (2026-10-19)` — CLOSED, não mergeada (2026-11-01T23:48Z)
- Veredito: **OBSOLETA** (confiança alta) · docs-only · `apagar_branch_seguro = true` (conteúdo útil preservado abaixo)

## Propósito
3 commits: 1 de conteúdo (`a17c111ff docs: plano de correções e melhorias 190 etapas — Zapp Web V2`) + 2 merges de `main`.
Único arquivo: `docs/plans/PLANO_CORRECOES_190_ETAPAS_2026-10-19.md` (+979 linhas, 0 removidas).
É um **documento de planejamento** (190 etapas em 9 fases: A Segurança, B Banco, C Edge Functions, D TypeScript strict,
E Testes, F CI/CD, G Performance, H Qualidade, I Documentação). Nenhuma linha de código, migration, workflow ou edge.

## Arquivo × achado × evidência

| Arquivo | Status | Achado | Evidência |
|---|---|---|---|
| `docs/plans/PLANO_CORRECOES_190_ETAPAS_2026-10-19.md` | NEW_FILE_ABSENT_IN_MAIN, patch aplica limpo (741 linhas ausentes) | Ausente da `main`; nenhum equivalente. O homônimo `docs/plans/PLANO_VERCEL_190_ETAPAS_2026-10-18.md` é outro escopo (Vercel). Plano **nunca executado**. | `git ls-tree -r origin/main docs/plans/ \| grep -i 190` → só `PLANO_VERCEL_190_ETAPAS_2026-10-18{,.execucao}.md`; artefatos que o plano manda criar não existem na `main`: `docs/security/DEPLOY_SECURITY_CHECKLIST.md` (A30), `supabase/functions/_shared/error-response.ts` (C63), `_shared/logger.ts` (C64), `_shared/retry.ts` (C66) — todos AUSENTE em `git cat-file -e origin/main:<path>` |

## Por que OBSOLETA (e não PERDIDA)
1. **Decisão do dono encerrou o escopo.** Comentário de fechamento da PR #2418: *"Fechada pelo congelamento de features (#2545, decisão do dono em 01/11): só entram correções dos 9 fluxos críticos de `docs/PRONTO_PRODUCAO.md`, CI que impede verificá-los e segurança."* O plano é um roteiro de 190 etapas de melhoria ampla (strict mode, i18n, Sentry, CDN, partman, ADRs) — exatamente o que o congelamento excluiu.
2. **A `main` substituiu o instrumento.** `docs/PRONTO_PRODUCAO.md` (estado 2026-11-01) é hoje a lista fechada e versionada do que está quebrado ("Lista fechada… Tudo o que não está aqui fica para depois", linhas 1-4), com os 9 fluxos e prova por linha — e o `AGENTS.md` aponta esse arquivo como fonte. O plano de 19/10 descreve um repositório anterior (PRs #2081–#2095 Z-series/F1a, "81 edge functions", 513 tabelas) já ultrapassado.
3. **Não há trabalho de engenharia a portar**: zero código. O valor residual é o checklist de segurança da Fase A, copiado íntegro abaixo para não depender da branch.
4. A `main` já guarda registro da branch em `docs/_arquivo/analise/dossies/claude-fix-plano-190-etapas-261019-1200.md` (triagem de 2026-10-31, que recomendava integrar — **anterior** ao congelamento de 01/11).

## Resíduo útil preservado (Fase A — Segurança, 30 etapas, única fase ainda dentro do escopo do congelamento)
Nenhuma delas tem código na branch; são itens de auditoria a reexecutar se o dono quiser.

- A1. Fechar PRs Z-series em aberto
- A2. Auditar timing-safe comparison em todas as edge functions
- A3. Corrigir `external-db-bridge` — vazamento de código interno em 502
- A4. Revisar CORS em functions com dados sensíveis
- A5. Mergear PRs do lote F1a (batches 4–9)
- A6. Auditar RLS — tabelas com write grant para role `anon`
- A7. Inventariar segredos hardcoded em edge functions
- A8. Auditar `health` e `status` (Grupo E) — exposição de informação
- A9. Auditar `gmail-send` e `gmail-sync` (Grupo E) — credenciais OAuth
- A10. Implementar Content Security Policy no front-end
- A11. Verificar `voice-copilot-action` (Grupo E) — injeção de prompt IA
- A12. Habilitar Dependabot para atualizações de segurança
- A13. Auditar `metrics` (Grupo E) — exposição de métricas internas
- A14. Verificar `send-rate-limit-alert` (Grupo E) — SSRF potencial
- A15. Criar tabela de audit log para ações administrativas
- A16. Verificar `talkx-scheduler` e `talkx-storage-purge` (Grupo E) — autorização
- A17. Arquivar ou conectar `recover-corrupted-audios` e `recover-message-media` (Grupo E)
- A18. Corrigir `auto-close-conversations` (Grupo E) — race condition
- A19. Adicionar LIMIT em `cleanup-rate-limit-logs` (Grupo E)
- A20. Verificar HMAC em `whatsapp-webhook` após Z011
- A21. Auditar CORS de `multiplixvoices` (Grupo E)
- A22. Verificar `talkx-report` — isolamento entre workspaces
- A23. Adicionar `npm audit` no CI
- A24. Auditar vazamento de PII em logs de edge functions
- A25. Garantir que `register-migration.mjs` existe e funciona
- A26. Adicionar rate limiting em endpoints públicos
- A27. Revisar permissões de buckets Storage
- A28. Verificar rotação de token ElevenLabs
- A29. Verificar `elevenlabs-agent-token` (Grupo E) — escopo do token
- A30. Criar `docs/security/DEPLOY_SECURITY_CHECKLIST.md`

Bloqueadores que o próprio plano marcava como "PARAR AQUI" (decisão do dono): B33 pg_partman, B50 retenção de mensagens, C80 staging, G159 CDN, H174 Sentry, I178 LGPD.

## Recuperação (se o dono pedir)
Comando único para reobter o documento enquanto a branch existir:
`git show origin/claude/fix-plano-190-etapas-261019-1200:docs/plans/PLANO_CORRECOES_190_ETAPAS_2026-10-19.md`
Destino natural caso volte: `docs/_arquivo/` (histórico), não `docs/plans/` — o plano não é mais o roteiro vigente.

## Verificação adversarial

Parecer: **CONCORDO com OBSOLETA** (tentei refutar e não achei hunk de valor ≥ médio fora da `main`).
`apagar_branch_seguro = true`, e por motivo mais forte do que o do dossiê.

### 1. O documento NÃO depende da branch para sobreviver
`git ls-remote origin 'refs/pull/2418/*'` → `108128f371cb945fb4b99f2a99d465ae85fe1764  refs/pull/2418/head`.
O GitHub mantém o ref da PR fechada mesmo após a branch ser apagada, então o arquivo de 979 linhas continua
recuperável por `git fetch origin refs/pull/2418/head && git show FETCH_HEAD:docs/plans/PLANO_CORRECOES_190_ETAPAS_2026-10-19.md`
(e a própria branch pode ser restaurada pelo botão "Restore branch" da PR). Corrige a ressalva do dossiê
("enquanto a branch existir").

### 2. O resíduo alegado (Fase A) já está majoritariamente FEITO na `main` — o plano é estale, não só fora de escopo
A triagem guardou a Fase A como "única fase ainda dentro do escopo". Conferido item a item em `origin/main`:

| Etapa | Pedido | Estado na `main` |
|---|---|---|
| A12 | criar `.github/dependabot.yml` | **EXISTE** (`git cat-file -e origin/main:.github/dependabot.yml`) |
| A10 | CSP no front | **EXISTE** — `Content-Security-Policy` presente em `origin/main:vercel.json` |
| A23 | `npm audit` no CI | **EXISTE** — `git grep -l -i "npm audit" origin/main -- .github/workflows/` → `.github/workflows/ci.yml` |
| A2 / A14 / A16 / A18 / A19 | `timingSafeEqual` nas edges | **FEITO** em 13 arquivos, incluindo exatamente os alvos citados: `send-rate-limit-alert`, `talkx-scheduler`, `talkx-storage-purge`, `auto-close-conversations`, `cleanup-rate-limit-logs`, `_shared/hmac-validation.ts` |
| A15 | tabela `audit_logs` | **EXISTE** — 5+ migrations em `origin/main:supabase/migrations/` referenciam `audit_logs` |
| A3 | `external-db-bridge` não vazar `error.message` | **TRATADO** — `origin/main:supabase/functions/external-db-bridge/index.ts:288` traz comentário explícito sobre manter a mensagem só em telemetria/log server-side |
| A6 / A30 | `docs/security/rls-anon-write-audit.md`, `docs/security/DEPLOY_SECURITY_CHECKLIST.md` | AUSENTES — únicos resquícios, e são dois arquivos de documentação a *criar*, valor baixo; títulos já preservados acima |

### 3. Nada no plano toca os fluxos quebrados (2, 3, 4) — os únicos liberados pelo congelamento
`grep -n -i "reconex\|desconect\|disconnect\|QR\|PRINCIPAL"` nas 979 linhas: zero ocorrência sobre reconexão,
QR ou ingestão de webhook. Só itens genéricos (`B35` índice composto, `C70` circuit breaker, `I176` ADR, runbooks).
Logo `docs/PRONTO_PRODUCAO.md` não precisa "cobrir" o plano: os escopos não se cruzam.

### 4. Decisão do dono confirmada na fonte
`github_graphql`: PR **#2545** `chore: congela features e define os 9 fluxos críticos para produção` — state
**MERGED**, criada 2026-11-01T23:36:30Z (é PR, não issue). PR **#2418** — CLOSED, `merged=false`,
`closedAt=2026-11-01T23:48:28Z`, 12 min depois do congelamento. Comentário de fechamento confere com o citado.

### Ressalva registrada (não muda o veredito)
O comentário de fechamento diz "**Branch preservada** — reabrir quando esta PR destravar um fluxo crítico".
Lido ao pé da letra é pedido de manter a branch; só não bloqueia a deleção porque `refs/pull/2418/head`
garante o conteúdo e permite restaurar a branch pela própria PR (item 1). Se o critério da operação for
"não apagar branch cuja PR pediu preservação", esta cai nessa categoria — decisão de processo, não de conteúdo.
