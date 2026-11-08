# HANDOFF — Próxima sessão (Claude Code)

> Revisado em 2026-11-02 ~13:50 UTC (sessão `session_01N1ArYPeCbnktfSR9BcBNEN`).
> Leia este arquivo, depois `CLAUDE.md` e `AGENTS.md`. Toda afirmação abaixo tem a evidência ao lado;
> o que não foi verificado está marcado **NÃO VERIFICADO**.

---

## 0. Correções em relação à versão anterior deste handoff

A primeira versão tinha três erros que, se seguidos, quebrariam a CI ou mexeriam no banco à toa:

1. **Fase B estava errada.** Vários arquivos listados como "prosa morta" são lidos por testes de CI
   (ex.: `ESTADO.md`, `CHANGELOG.md`, `docs/plans/`, `docs/talkx/`). Lista corrigida na seção 3.
2. **O diagnóstico do cron estava errado.** Não são "4 jobs a cada 1 min saturando". São 3 jobs a cada
   1 min, e as falhas atingem jobs de 2 min, 5 min e de hora em hora também. Espaçar não resolve. Seção 4.
3. **PR #2620 não pode ser mergeada sem o dono** — é bump de GitHub Actions (workflow = regra 8).

---

## 1. Estado atual

| Item | Estado |
|---|---|
| PR #2624 (CLAUDE.md técnico + AGENTS.md com regras do dono + `@AGENTS.md` na 1ª linha + `.claude/CLAUDE.md` apagado) | **mergeada** |
| PR #2626 — inventário real (`inventario/estado/*.json`, `scripts/inventario/gerar-repo.mjs`) | aberta, CI rodando em 02/11 ~13:30 UTC |
| PR #2628 — este handoff | aberta, CI na fila em 02/11 13:38 UTC |
| Fase B (arquivar prosa) | **não iniciada** |
| Item do cron | **não iniciado — premissa errada, ver seção 4** |

PRs de terceiros abertas (não tocar): #2562 (LGPD, outro agente), #2620 (Dependabot actions — regra 8,
só o dono), #2621 (Dependabot deps — pode mergear se CI verde e sem bump major).

---

## 2. Ordem de execução

1. **#2628 e #2626:** `github_list_check_runs` no head de cada uma. Verde → squash merge + apagar branch.
   Vermelho → `github_get_run_failure_summary`; se a falha também aparece na `main`, é herdada: mergear e
   anotar. Branches: `claude/chore-handoff-261102-1035`, `claude/chore-inventario-estado-261102-1030`.
2. **Fase B reduzida** (seção 3) — uma branch, uma PR, merge automático se CI verde.
3. **Cron** (seção 4) — só diagnóstico + relatório ao dono. **Nenhuma migration.**

Regras que valem para tudo: escrita no GitHub só pelo MCP **`GITHUB - MCP - FOREVER`**; branch nova
`claude/<tipo>-<slug>-<AAMMDD-HHMM>` a partir de `main` atualizado; `main` é protegida (push direto dá
422 "3 of 3 required status checks").

---

## 3. Fase B — arquivar prosa morta (versão corrigida)

**Por quê:** a raiz e `docs/` têm relatórios antigos escritos à mão que confundem agentes novos.
**Arquivar = mover para `docs/_arquivo/`, mantendo o histórico do Git. Nada é apagado** (o dono pediu
explicitamente para não excluir).

**Como foi checado:** `git clone --depth 1` da `main` em 02/11 + `grep` por cada nome em código, testes,
scripts e JSON (excluindo `.md`). Resultado abaixo.

### 3.1 PODE mover (nenhum código/teste/CI lê)

Raiz:
```
HANDOFF_MISSION_10-10.md
PENDENCIAS.md
RELATORIO_CI.md
RLS_MIGRATION_INSTRUCTIONS.md
UX_AUDIT_REPORT.md
HANDOFF_NEXT_SESSION.md      ← este arquivo, por último
analise-prs/
auditoria-supabase/
analise/                     ← único "hit" é texto num comentário de scripts/db-audit/ai-read-policies-queue-scope.test.sh:7
```
`docs/`:
```
docs/FUNCTIONALITIES_INVENTORY.md
docs/HEALTH_SCORE.md
docs/TECHNICAL_DOCUMENTATION.md
docs/RLS_MIGRATION_INSTRUCTIONS.md
docs/IMPROVEMENT_PLAN.md          ← citado só em comentário de teste e no texto de performance-budget.json
docs/REFACTORING_REPORT_2026-06-12.md  ← citado só em comentário de componentesDuplicados.test.ts (conferir antes)
docs/FORGOTTEN_FEATURES_REPORT.md      ← citado em scripts/ci/complete-system-features-doc.unit.mjs (conferir se é só comentário)
docs/prompts/
docs/resgate/
docs/tasks/
docs/tarefas/                     ← citado só em comentário
docs/consolidacao/
```

### 3.2 NÃO mover — lido por teste/CI ou em uso ativo

| Arquivo | Quem lê (evidência) |
|---|---|
| `CHANGELOG.md` | `src/__tests__/multiplix-changelog-registry.test.ts:32` |
| `ESTADO.md`, `FEATURE_REGISTRY.md`, `TESTING_CONVENTION.md` | `scripts/ci/docs-estado-registry-convention.unit.mjs` |
| `docs/COMPLETE_SYSTEM_FEATURES.md` | `scripts/ci/complete-system-features-doc.unit.mjs:23`, `tests/contracts/no-campaigns-classicas.contract.test.ts:36` |
| `docs/DB-INVENTORY.md` | `scripts/ci/db-inventory-doc.unit.mjs:38` |
| `docs/audit_report.md` / `.pdf` | `generate_audit_pdf.ts`, `scripts/ci/check-audit-pdf-determinism.mjs`, `scripts/ci/audit-prod.unit.mjs` |
| `docs/handoffs/` | `tests/contracts/multiplix-handoff-f100.contract.test.ts:31` |
| `docs/plans/` | `scripts/ci/planos-dia-11.unit.mjs:6` |
| `docs/talkx/` | **ativo**: `src/components/talkx/help/__tests__/talkxHelpIndex.test.ts:19`, `scripts/talkx/*.mjs`, `scripts/ci/talkx-alerts-template.unit.mjs:18` |
| `docs/audits/PLANO_GITHUB_ACTIONS_100_ETAPAS_2026-10-01.md`, `docs/reconciliation/tasks/P006.json` | testes de CI |
| `docs/PRONTO_PRODUCAO.md`, runbooks, `DEPLOYMENT.md`, `MIGRATIONS.md`, `TROUBLESHOOTING.md`, `docs/ci/`, `docs/adr/`, `docs/runbooks/` | documentação viva |

Arquivar algum item desta tabela exige apagar/alterar o teste que o lê → é decisão do dono, não da Fase B.

### 3.3 NÃO VERIFICADO — conferir antes de mover

- `qa/` (raiz): `grep` achou `qa/` em 5 testes (`fundacaoVisual.test.tsx`, `TelefoniaView.a11y.test.tsx`,
  `tipografiaPisoEscalaContatos.test.tsx`, `tipografiaMinima.test.ts`, `classify-audio-meme/index.test.ts`).
  Pode ser comentário ou caminho real. Ler essas linhas; se algum lê arquivo de `qa/`, não mover.
- `inventario/` (raiz, arquivos antigos: `FASE2_*`, `FASE3_*`, `RELATORIO_INVENTARIO.md`, `branches.*`,
  `*.py`, `*.sh`, `prs.json`…): não foi feito grep. Mover só os antigos; **`inventario/estado/` fica**.

### 3.4 Junto, na mesma PR

- `AGENTS.md` linha ~161 (tabela "Onde olhar primeiro") cita `analise/`, `inventario/`, `qa/` como
  histórico → trocar para `docs/_arquivo/`.
- Links em outros `.md` para arquivos movidos vão quebrar. Aceitável (são histórico), não corrigir.

### 3.5 Como mover sem gastar tokens nem estragar binário

Não ler conteúdo. Usar a Git Data API pelo MCP FOREVER, reaproveitando os SHAs dos blobs:
1. `github_get_tree` recursivo da `main` → pegar `sha` de cada arquivo a mover.
2. `github_create_tree` com `base_tree` = árvore da `main`: para cada arquivo, uma entrada no caminho
   novo (`docs/_arquivo/...`, mesmo `sha`, mode `100644`) e uma no caminho antigo com `sha: null`.
3. `github_create_git_commit` (parent = HEAD da `main`) → `github_create_ref` com a branch nova.
4. PR → CI verde → squash merge.

Funciona para o `.pdf` também. `github_push_files` exigiria baixar e reenviar cada arquivo.

---

## 4. Cron — premissa corrigida (NÃO criar migration)

**Pedido original do dono:** espaçar os jobs de 1 em 1 minuto para 2 em 2 (aprovado como "item 2").
**Por que não executar como está:** os dados de 02/11 mostram que isso não resolve.

Evidência (banco `tnnnlkbymytvtqngbbqh`, `cron.job_run_details`, últimas 48 h, consulta de 02/11 ~13:45 UTC):
- Jobs a cada 1 min são **3**, não 4: `dispatch-scheduled-messages` (34 falhas), `tasks-notify-due` (34),
  `talkx-scheduler-1min` (27). Mais `ai-jobs-tick-1min` (`1-59 * * * *`, 35).
- Os outros também falham: `crm-sync-outbox` e `expire-stale-agent-presence` (a cada 2 min, 19 cada),
  `csat-reply-capture-tick`, `multiplix-send-trigger` (15), `close-stale-calls`, `gmail-incremental-sync`
  (5 min, 10), até jobs de hora em hora (`avatars-refresh`, `voice-changer-tmp-purge`).
- **229 falhas "job startup timeout" concentradas em 35 minutos**, com até 9 jobs falhando no mesmo
  minuto. Período: 31/10 14:35 → 02/11 12:44 UTC.
- Taxa por execução é a mesma em jobs de 1 min e de 2 min (~1,2–1,3%).
- Configuração: `cron.use_background_workers = off`, `max_worker_processes = 6`,
  `cron.max_running_jobs = 32`, 24 jobs ativos.

**Leitura:** são episódios em que o pg_cron não consegue abrir conexão com o banco, e aí todos os jobs
daquele minuto falham juntos. Frequência dos jobs não é a causa. Espaçar só atrasaria o envio de
mensagens agendadas (`dispatch-scheduled-messages`) em até 1 minuto a mais, sem ganho.
**Causa exata: NÃO VERIFICADO.** Hipóteses a testar:
1. Pico de conexões (pool/`max_connections`) nesses 35 minutos — cruzar os horários com logs do Postgres
   (Supabase logs) procurando "too many connections" / "remaining connection slots".
2. Algum job longo segurando conexões nesses minutos (ver `end_time - start_time` dos jobs bem-sucedidos
   logo antes de cada episódio).
3. Ligar `cron.use_background_workers` (troca conexão por worker) — **mexe em infra do Supabase e pode
   exigir restart/suporte → decisão do dono** (regra 8).

**O que fazer:** só diagnóstico e relatório ao dono, com os horários e a causa achada. Nenhuma
alteração no banco sem ele aprovar a correção certa.

---

## 5. Referência rápida

| Item | Valor |
|---|---|
| Banco OFICIAL | `tnnnlkbymytvtqngbbqh` (Supabase Cloud, PostgreSQL 17.6), MCP `SUPABASE - ZAPP WEB V2 - MCP` |
| Bancos PROIBIDOS | `uqysyzndkfiwfztbqvsl`, `vpkmqeumtxhrwgawxdrl` |
| Banco (snapshot 02/11) | 211 tabelas, todas com RLS; 521 policies; 481 funções; 24 cron jobs |
| WhatsApp | instância `PRINCIPAL` desconectada desde ~07/10/2026. **O dono pediu para NÃO reconectar agora.** |
| Edge functions | 85; 17 sem chamador no repo (lista em `inventario/estado/edges.json`, após #2626) |
| Guard do CLAUDE.md | `scripts/ci/check-claude-md-integrity.mjs` bloqueia redução >30% por PR |
| Deploy | merge na `main` = produção (Vercel automático) |
