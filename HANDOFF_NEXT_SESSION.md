# HANDOFF — Próxima sessão (Claude Code)

> Gerado em 2026-11-02 ~13:35 UTC pela sessão `session_01N1ArYPeCbnktfSR9BcBNEN`.
> **Leia este arquivo ANTES de qualquer outra coisa. Depois leia `CLAUDE.md` e `AGENTS.md`.**

---

## Por que este handoff existe

O projeto passou por centenas de sessões de IA, cada uma deixando estratégias conflitantes.
Esta sessão iniciou uma limpeza estrutural mas ficou sem tokens antes de terminar.
Este arquivo documenta exatamente o que foi feito, o que está pendente e como executar.

---

## O que já foi feito (mergeado em `main`)

### PR #2624 — MERGEADA
**O que mudou:**
- `CLAUDE.md` (raiz): reescrito com APENAS informação técnica (banco oficial, bancos proibidos, Evolution GO, mapa, CI, Vercel). Toda estratégia/ponto de vista de agente foi removida.
- Primeira linha do `CLAUDE.md` agora é `@AGENTS.md` — sem esse import o AGENTS.md é ignorado quando CLAUDE.md existe (descoberta crítica da sessão).
- `AGENTS.md` (raiz): reescrito com as regras do dono (como trabalhar, fluxo Git, comunicação, 3 próximos passos).
- `.claude/CLAUDE.md`: **deletado**. Era o arquivo de "congelamento de features" que contradizia o root CLAUDE.md.
- `docs/PRONTO_PRODUCAO.md`: removida referência ao `.claude/CLAUDE.md` deletado.

### PR #2626 — ABERTA, aguardando CI
**Branch:** `claude/chore-inventario-estado-261102-1030`
**URL:** https://github.com/adm01-debug/Zapp_Web_V2/pull/2626

**O que contém:**
- `inventario/estado/banco-2026-11-02.json`: snapshot via queries reais no banco (`tnnnlkbymytvtqngbbqh`). 211 tabelas, 0 sem RLS, 521 policies, 481 SQL functions, 24 cron jobs, status WhatsApp.
- `inventario/estado/edges.json`: gerado por `scripts/inventario/gerar-repo.mjs`. 85 edge functions, 17 sem chamador.
- `inventario/estado/README.md`: como regenerar.
- `scripts/inventario/gerar-repo.mjs`: script que gera edges.json via ripgrep.

**Status da CI quando esta sessão terminou:**
- ✅ Replay local das migrations
- ✅ Unit Tests 1/3
- ✅ Node CI Scripts
- ✅ Security Audit
- ⏳ Contrato DB offline (in_progress)
- ⏳ Unit Tests 2/3 (in_progress)
- ⏳ Unit Tests 3/3 (in_progress)
- ⏳ E2E Tests Playwright (in_progress)

**Ação:** quando CI verde → squash merge + apagar branch. Se CI vermelha → ler log; se erro é herdado do `main` (não causado por esta PR), mergear mesmo assim e registrar como bug pré-existente.

---

## O que fazer na próxima sessão (em ordem)

### Tarefa 1: Mergear PR #2626 (se CI verde)
Verificar CI: `github_list_check_runs` para ref `claude/chore-inventario-estado-261102-1030`.
Se verde: `github_merge_pull_request` com method `squash` + deletar branch.

---

### Tarefa 2: Fase B — Arquivar prosa morta

**Por quê:** a raiz e `docs/` estão cheios de relatórios escritos à mão que ficam desatualizados e confundem agentes novos. Arquivar = mover para `docs/_arquivo/` (não apagar). O dono confirma que quer o arquivo e não a exclusão.

**Branch:** `claude/chore-arquivo-prosa-261102-HHMM` (nova a partir de `main` atualizado)
**Merge:** automático se CI verde (escopo chore/docs, não é DDL).

**Mover DA RAIZ para `docs/_arquivo/`:**
```
CHANGELOG.md
ESTADO.md
FEATURE_REGISTRY.md
HANDOFF_MISSION_10-10.md
HANDOFF_NEXT_SESSION.md        ← este arquivo também
PENDENCIAS.md
RELATORIO_CI.md
RLS_MIGRATION_INSTRUCTIONS.md
TESTING_CONVENTION.md
UX_AUDIT_REPORT.md
```

**Pastas na raiz para mover para `docs/_arquivo/`:**
```
analise/            → docs/_arquivo/analise/
analise-prs/        → docs/_arquivo/analise-prs/
auditoria-supabase/ → docs/_arquivo/auditoria-supabase/
qa/                 → docs/_arquivo/qa/
```

**ATENÇÃO — pasta `inventario/`:** contém `inventario/estado/` (novo, gerado pela PR #2626) e subpastas antigas. Mova apenas as subpastas antigas; `inventario/estado/` e `scripts/inventario/` ficam onde estão.

**Arquivos em `docs/` para mover para `docs/_arquivo/`:**
```
docs/COMPLETE_SYSTEM_FEATURES.md
docs/DB-INVENTORY.md
docs/FORGOTTEN_FEATURES_REPORT.md
docs/FUNCTIONALITIES_INVENTORY.md
docs/HEALTH_SCORE.md
docs/IMPROVEMENT_PLAN.md
docs/REFACTORING_REPORT_2026-06-12.md
docs/TECHNICAL_DOCUMENTATION.md      (90 KB — inventário manual desatualizado)
docs/audit_report.md
docs/audit_report.pdf
docs/handoffs/
docs/plans/
docs/prompts/
docs/resgate/
docs/tarefas/
docs/tasks/
docs/talkx/
docs/consolidacao/
```

**O que NÃO mover em `docs/` (ficam onde estão):**
```
docs/PRONTO_PRODUCAO.md                                     ← fonte de verdade dos fluxos
docs/CONEXOES_WHATSAPP_RUNBOOK.md
docs/INCIDENT-RUNBOOK.md
docs/DEPLOYMENT.md
docs/MIGRATIONS.md
docs/TROUBLESHOOTING.md
docs/ci/                                                    ← gerado por CI, não editar à mão
docs/audits/PLANO_GITHUB_ACTIONS_100_ETAPAS_2026-10-01.md  ← REFERENCIADO POR CI
docs/reconciliation/tasks/P006.json                         ← REFERENCIADO POR CI
docs/adr/                                                   ← Architecture Decision Records
docs/runbooks/
```

**Como executar:** para cada arquivo, ler conteúdo com `github_get_file` e usar `github_push_files` com o arquivo no novo caminho + delete do antigo, tudo no mesmo commit atômico. Fazer em lotes de 10-15 arquivos por commit para economizar tokens.

---

### Tarefa 3: PR do cron — DEIXAR ABERTA para aprovação do dono

**Por quê:** 4 cron jobs rodam a cada 1 minuto e saturam os workers do pg_cron, causando ~230 falhas de "job startup timeout" a cada 48h. Espaçar para `*/2 * * * *` alivia o gargalo sem mudar a lógica de negócio.

**Branch:** `claude/fix-cron-spacing-261102-HHMM`

**Passo 1 — identificar os jobs:**
```sql
SELECT jobid, jobname, schedule, command
FROM cron.job
WHERE schedule = '* * * * *'
ORDER BY jobname;
```
(banco: `tnnnlkbymytvtqngbbqh`, MCP: `SUPABASE - ZAPP WEB V2 - MCP`)

**Passo 2 — criar migration:**
Arquivo: `supabase/migrations/<timestamp>_cron_spacing.sql`
Conteúdo (ajustar jobnames conforme query acima):
```sql
-- Espaçar jobs de 1 min para 2 min para aliviar saturação do pg_cron
-- Causa: 4 jobs simultanâneos a cada minuto causam ~230 "job startup timeout" / 48h
UPDATE cron.job SET schedule = '*/2 * * * *' WHERE schedule = '* * * * *';
```

**NÃO mergear sem aprovação do dono** — é DDL em produção (regra 8 do Fluxo Git).

---

## Estado do banco (2026-11-02)

| Item | Valor |
|---|---|
| Banco OFICIAL | `tnnnlkbymytvtqngbbqh` (Supabase Cloud, PostgreSQL 17.6) |
| MCP do banco | `SUPABASE - ZAPP WEB V2 - MCP` |
| Bancos PROIBIDOS | `uqysyzndkfiwfztbqvsl`, `vpkmqeumtxhrwgawxdrl` |
| Tabelas | 211 (todas com RLS) |
| Policies | 521 |
| SQL functions | 481 |
| Cron jobs | 24 |
| WhatsApp | instância `PRINCIPAL` desconectada desde ~07/10/2026 |
| WhatsApp | dono pediu para NÃO reconectar agora |
| Edge functions | 85 deployadas; 17 sem chamador no repo |

## PRs abertas no momento desta sessão

| # | Título | Ação |
|---|---|---|
| 2562 | feat(lgpd): login attempts retenção | não toque — outro agente |
| 2620 | ci: Bump actions-misc (Dependabot) | pode mergear se CI verde |
| 2621 | deps: Bump deps-semanal (Dependabot) | pode mergear se CI verde |
| 2626 | chore: inventário estado real | mergear quando CI verde |

## Arquivos críticos (não mover nem alterar sem cuidado)

- `docs/audits/PLANO_GITHUB_ACTIONS_100_ETAPAS_2026-10-01.md` — referenciado por teste de CI
- `docs/reconciliation/tasks/P006.json` — referenciado por teste de CI
- `scripts/ci/check-claude-md-integrity.mjs` — guard que bloqueia redução >30% do CLAUDE.md por PR
- `inventario/estado/` — novo e gerado; não editar à mão

## Regra de escrita no GitHub

Escrita nos repos `adm01-debug`: use SEMPRE o MCP **`GITHUB - MCP - FOREVER`**.
O MCP padrão do GitHub, `gh` CLI e `git push` retornam 403 no proxy em write.

---

*Após ler e executar as tarefas acima, mova este arquivo para `docs/_arquivo/HANDOFF_NEXT_SESSION.md`.*
