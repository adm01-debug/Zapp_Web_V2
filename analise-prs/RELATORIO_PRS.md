# Relatório de Análise — 30 PRs Abertas

**Gerado em:** 2026-11-01  
**Escopo:** `adm01-debug/Zapp_Web_V2` — todas as 30 PRs abertas  
**Branch de destino:** `main`

---

## Resumo executivo

| Status | Quantidade | Ação |
|---|---|---|
| **MERGE_OK** | 12 | 11 com auto_merge ativado; 1 (#2514) merge manual necessário |
| **DECISAO_HUMANA** | 13 | Joaquim decide; detalhes abaixo |
| **CONFLITO** | 3 | Rebase necessário pelo autor |
| **AGUARDANDO_APROVACAO** | 2 | Body da PR declara espera explícita |
| **Total** | 30 | |

---

## MERGE_OK (12 PRs)

PRs seguras para mergear — sem workflow, sem migration destrutiva, sem edge R2, sem conflito.

| PR | Título | auto_merge | Estado |
|---|---|---|---|
| [#2489](https://github.com/adm01-debug/Zapp_Web_V2/pull/2489) | fix(e2e): corrigir seletor de telefonia | ✓ squash | behind |
| [#2491](https://github.com/adm01-debug/Zapp_Web_V2/pull/2491) | chore(migrations): reconciliar migration search_insights | ✓ squash | blocked |
| [#2493](https://github.com/adm01-debug/Zapp_Web_V2/pull/2493) | chore: atualizar CLAUDE.md e plano | ✓ squash | behind |
| [#2494](https://github.com/adm01-debug/Zapp_Web_V2/pull/2494) | chore(types): sincronização automática de tipos | ✓ squash (bot) | behind |
| [#2495](https://github.com/adm01-debug/Zapp_Web_V2/pull/2495) | chore: .claude/commands/ | ✓ squash | behind |
| [#2498](https://github.com/adm01-debug/Zapp_Web_V2/pull/2498) | feat(rpc): search_insights → search_contacts_insights | ✓ squash | blocked |
| [#2501](https://github.com/adm01-debug/Zapp_Web_V2/pull/2501) | docs: planos E19/E20/E21 | ✓ squash | blocked |
| [#2504](https://github.com/adm01-debug/Zapp_Web_V2/pull/2504) | test(e2e): workers 1→4 + timeouts | ✓ squash | behind |
| [#2507](https://github.com/adm01-debug/Zapp_Web_V2/pull/2507) | docs: CLAUDE.md 6→3 checks | ✓ squash | blocked |
| [#2513](https://github.com/adm01-debug/Zapp_Web_V2/pull/2513) | fix(ui): contraste WCAG CSS | ✓ squash | blocked |
| [#2516](https://github.com/adm01-debug/Zapp_Web_V2/pull/2516) | test(talkx): testes X006 | ✓ squash | blocked |
| [#2514](https://github.com/adm01-debug/Zapp_Web_V2/pull/2514) | feat(db): migration cron startup | **✗ MANUAL** | blocked |

### Ação para MERGE_OK

- **#2514**: merge manual necessário (auto_merge não estava ativado). SHA: `9db8ac785490c8a6d5e0b15a39b28bcb27d36aff`. Se CI ainda bloqueado, ativar auto_merge squash.
- **Demais 11**: auto_merge já ativado — mergeiam sozinhas quando CI passar e branch for atualizada.

---

## DECISAO_HUMANA (13 PRs)

Requerem decisão de Joaquim. Razão principal listada.

| PR | Título | Razão principal |
|---|---|---|
| [#2485](https://github.com/adm01-debug/Zapp_Web_V2/pull/2485) | fix(rls): DROP POLICY IF EXISTS | Migration destrutiva (DROP POLICY) |
| [#2486](https://github.com/adm01-debug/Zapp_Web_V2/pull/2486) | feat(copilot): RADAR 34 arquivos | Novas edges (tipo incerto) + escopo grande |
| [#2487](https://github.com/adm01-debug/Zapp_Web_V2/pull/2487) | fix(db): DROP TRIGGER IF EXISTS | Migration destrutiva (DROP TRIGGER) |
| [#2496](https://github.com/adm01-debug/Zapp_Web_V2/pull/2496) | feat(edge): message-delivery fases 1-4 | Edge R2 (WhatsApp) + migration 484 linhas |
| [#2497](https://github.com/adm01-debug/Zapp_Web_V2/pull/2497) | ci: pular drafts no CI | Toca ci.yml |
| [#2499](https://github.com/adm01-debug/Zapp_Web_V2/pull/2499) | ci: main-failure-notify.yml | Novo workflow |
| [#2502](https://github.com/adm01-debug/Zapp_Web_V2/pull/2502) | ci(draft): filtrar drafts v2 | DRAFT + toca workflows |
| [#2503](https://github.com/adm01-debug/Zapp_Web_V2/pull/2503) | ci: ajustes ci.yml | Toca ci.yml |
| [#2508](https://github.com/adm01-debug/Zapp_Web_V2/pull/2508) | ci: deploy-functions.yml | Toca deploy-functions.yml |
| [#2510](https://github.com/adm01-debug/Zapp_Web_V2/pull/2510) | ci: scorecard.yml + ci.yml | Novo workflow + ci.yml |
| [#2511](https://github.com/adm01-debug/Zapp_Web_V2/pull/2511) | refactor: 100 arquivos | Toca workflows + escopo enorme |
| [#2515](https://github.com/adm01-debug/Zapp_Web_V2/pull/2515) | feat: nova feature | DRAFT |
| [#2517](https://github.com/adm01-debug/Zapp_Web_V2/pull/2517) | feat(db): DROP TYPE + UPDATE massa | DRAFT + migration destrutiva |

---

## CONFLITO (3 PRs)

Têm conflito real com `main` (`mergeable: false`). Autor precisa fazer rebase.

| PR | Título | Tamanho |
|---|---|---|
| [#2492](https://github.com/adm01-debug/Zapp_Web_V2/pull/2492) | docs: fila-merge + testes | Médio |
| [#2506](https://github.com/adm01-debug/Zapp_Web_V2/pull/2506) | docs: auditoria 22 documentos | 22 arquivos |
| [#2512](https://github.com/adm01-debug/Zapp_Web_V2/pull/2512) | feat: grande reestruturação | 138 arquivos |

---

## AGUARDANDO_APROVACAO (2 PRs)

Body da PR declara explicitamente que Joaquim deve aprovar.

| PR | Título | Razão |
|---|---|---|
| [#2505](https://github.com/adm01-debug/Zapp_Web_V2/pull/2505) | perf(db): 57 índices FK | Body: "⚠️ AGUARDANDO APROVAÇÃO (regra 8 CLAUDE.md)" |
| [#2500](https://github.com/adm01-debug/Zapp_Web_V2/pull/2500) | feat(edge): copilot-tick | Body: "AGUARDANDO APROVAÇÃO"; depende de #2486 |

---

## Metodologia

- Dados coletados via `mcp__GITHUB_-_MCP_-_FOREVER__github_get_pull_request` para cada PR
- `mergeable` e `mergeable_state` verificados individualmente (endpoint de lista retorna "unknown")
- Classificação automática por regras em `regras-de-negocio.md`
- Evidência: arquivo + linha em `prs-raw.json` e `prs.json`; dossiê individual em `dossies/PR-<n>.md`

## Arquivos deste relatório

```
analise-prs/
├── RELATORIO_PRS.md
├── prs.json
├── prs.csv
├── regras-de-negocio.md
├── prs-raw.json
├── baseline/
└── dossies/
    ├── PR-2485.md ... PR-2517.md
```
