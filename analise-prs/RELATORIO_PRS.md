# Relatório de PRs — adm01-debug/Zapp_Web_V2

**Gerado em:** 2026-11-08  
**Sessão:** claude_05/awesome-ramanujan-ufxolu  
**main SHA:** `9183f0f6fa4296cd07c585602bc5ea88ada5d98d`

---

## Resumo Executivo

| Métrica | Valor |
|---|---|
| Total PRs abertos | **68** |
| PRs analisados (histórico completo) | **180+** |
| PRs mergeados nesta sessão | **1** (pendente: PR #2864) |
| PRs mergeados em sessões anteriores | **14** |
| Feature freeze | **Ativo** (desde PR #2545) |

## Estado do CI (2026-11-08)

**CI QUEBRADO no `main` desde PR #2550** — `TalkXCampaignReport.test.tsx` foi esvaziado (sem test suites).

- Erro: `Error: No test suite found in file ...TalkXCampaignReport.test.tsx`
- Check afetado: `🧪 Unit Tests (2/3)` → `1 failed | 617 passed`
- **Fix**: PR #2864 (CI aguardando runners GitHub — queued)
- Consequência: TODOS os PRs que não contêm o fix ficam com CI blocked

---

## Veredictos — PRs Abertos (68 total)

### MERGE_OK_CI_PENDING (1 PR)

| PR | Título | Motivo |
|---|---|---|
| [#2864](https://github.com/adm01-debug/Zapp_Web_V2/pull/2864) | fix: restaurar test suite TalkXCampaignReport apagado no PR #2550 | Fix crítico do CI. CI queued. |

### DRAFT — Não Mergear (16 PRs)

| PR | Título |
|---|---|
| #2558 | feat(talkx): trilha de navegação clicável no monitor |
| #2788 | feat: ⌘K palette owner único |
| #2811 | fix(gmail-oauth): remove exposição de access_token no redirect |
| #2813 | fix(inbox): toast neutro em RLS e undo dois passos no button |
| #2817 | feat(talkx): catálogo talkx_suppression_reasons + migration |
| #2822 | feat(monitoring): painel investigação de pausas de instância |
| #2834 | feat(copilot): 7 edge functions AI + camada AI nos hooks |
| #2853 | chore(resgate): validação exaustiva dos 8 clusters |
| #2854 | fix(contexto): tipo de coluna truncado e tabelas de out |
| #2856 | feat(talkx): prancha TalkXKit — filtros dinâmicos e KPIs |
| #2859 | fix(security): revoga 99 grants SELECT de anon |
| #2861 | test(webhook): contrato F3 — caminho de entrada |
| #2867 | ci(db-audit): corrige DB Guard offline e DB Live Guard |
| #2869 | fix(talkx): isola queryKeys do cmd-palette (duplicata #2866) |
| #2870 | fix: restaura TalkXCampaignReport.test.tsx (duplicata #2864) |
| #2871 | docs: atualizar RELATORIO_CI.md e PENDENCIAS.md |

### REGRA8 — Tocar CI/Workflows (7 PRs)

> Regra: não mergear sem aprovação humana. Envolvem `.github/workflows/` ou CI pipeline.

| PR | Título | Motivo REGRA8 |
|---|---|---|
| #2839 | chore(ci): atualiza baseline do lint-ratchet | Toca CI |
| #2841 | security(ci): fecha injeção de comando e fail-open no guard | Toca CI |
| #2846 | chore(ci): guard GA02 passa a checar referência órfã | Toca CI |
| #2850 | ci: registra 4 guards de segurança existentes como steps | Toca CI |
| #2855 | fix: instalar @types/node via npm no deploy-functions.yml | Toca `.github/workflows/deploy-functions.yml` |
| #2858 | ci: pull_request do ci.yml também dispara em ready_for_review | Toca `ci.yml` |
| #2867 (DRAFT) | ci(db-audit): corrige DB Guard offline e DB Live Guard | Toca CI (também DRAFT) |

### OBSOLETO — Duplicatas (2 PRs não-draft)

| PR | Título | Supercedido por |
|---|---|---|
| #2845 | fix(talkx): placeholder test suite em TalkXCampaignReport | #2864 |
| #2851 | fix(talkx): restaura testes do relatório de campanha | #2864 |

### PENDING_ANALYSIS (42 PRs)

Análise em execução pelo fork agent. Resultados em `analise-prs/verdicts-novos.json`.

Incluem:
- #2496, #2508, #2533 (PRs antigos de nov/01)
- #2553–#2556 (PRs de nov/02)
- #2805–#2872 (PRs de nov/08, excluindo drafts e REGRA8)

---

## Histórico de Merges — Sessão Atual (nov/08)

| PR | Título | SHA merge | Status |
|---|---|---|---|
| #2864 | fix: restaurar test suite TalkXCampaignReport | pendente | CI queued |

## Histórico de Merges — Sessões Anteriores

| PR | SHA merge |
|---|---|
| #2494 | `b04227fb...` |
| #2543 | SHA mergeado |
| #2545 | SHA mergeado |
| + 11 outros | — |

---

## Problemas Críticos de Produção

> Estes **NÃO** são solucionáveis por PR — requerem ação manual do Joaquim.

1. **WhatsApp desconectado há 28 dias** — escanear QR code na tela Conexões
2. **4 mensagens presas em `sending`** — cleanup de DB pendente (migration aditiva necessária)
3. **`cron.job_run_details` com 100% dead tuples** — `VACUUM ANALYZE` manual (não pode rodar por MCP)

---

## Arquivos de Referência

| Arquivo | Descrição |
|---|---|
| `analise-prs/prs.json` | Lista completa dos 68 PRs abertos (nov/08) |
| `analise-prs/prs.csv` | Versão CSV |
| `analise-prs/baseline/` | Estado do CI/build no momento da análise |
| `analise-prs/dossies/PR-*.md` | Dossier individual de cada PR |
| `analise-prs/verdicts-novos.json` | Veredictos detalhados (fork agent) |
| `analise-prs/regras-de-negocio.md` | Regras de merge aplicadas |
| `analise-prs/progresso.json` | Estado histórico completo |

---

*Atualizado automaticamente pela sessão claude_05/awesome-ramanujan-ufxolu em 2026-11-08T23:42Z*
