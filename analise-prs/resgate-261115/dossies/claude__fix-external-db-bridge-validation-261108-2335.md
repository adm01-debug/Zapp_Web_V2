# Dossiê — claude__fix-external-db-bridge-validation-261108-2335 (PR #2877)

Branch `origin/claude/fix-external-db-bridge-validation-261108-2335`, tip `413e05cc7`, merge-base `9183f0f6f` (2026-11-08), 2 commits:
- `44b786016` fix(external-db-bridge): valida coluna e operador antes de executar filtro
- `413e05cc7` fix(test): restaura TalkXCampaignReport.test.tsx truncado (X164)

## Propósito
1. Endurecer a edge `external-db-bridge`: rejeitar com 400 `filters[].column`/`operator` e `order.column` fora de identificador simples/allowlist, antes de montar a query privilegiada.
2. Restaurar o teste `TalkXCampaignReport.test.tsx`, que no merge-base estava truncado (61 linhas, só mocks, zero `describe`).
3. Manifest de deploy regenerado para os novos hashes da edge.

## Arquivo × achado × evidência

| Arquivo | Achado | Evidência |
|---|---|---|
| `supabase/functions/external-db-bridge/index.ts` | **INCORPORADA (versão mais forte)** | `origin/main` L29-32 `validIdentifier` (regex + limite 63 chars + bloqueio de nomes reservados PostgREST L25-27); L33-35 `FILTER_OPERATORS` idêntica; L60-66 `parseFilters` valida coluna/operador/valor (inclui `in`/`is`, `MAX_FILTERS=20`); L228-231 retorna `"Invalid filter column or operator"` 400; L238-243 valida `order.column` e `ascending` → `"Invalid order column"` 400. Commits: `6f90c9332` (SEC-Z018) e `dac285f62` (#3138). |
| `src/components/talkx/report/__tests__/TalkXCampaignReport.test.tsx` | **INCORPORADA (outra forma)** | main tem 215 linhas, 12 testes (`568d3f932`, pacote `cb6576b2a` #3035): `talkxReportSeriesFromRows` (L67-107: vazio, mesmo dia, 2026-10-05 seg vs 2026-10-11 dom, sem sent_at, granularidade hour), `talkxReportHeatmapFromTimestamps` (L108-124: grade 7x24 zerada, célula [0][7], null/undefined), `TalkXCampaignReport` (L126-215: título, nome, três cartões via testid L176-188, `hasConversionSource=false` L189-200, falha de PDF L201). Mesma intenção da branch (X164: três gráficos + sem série Conversões + agrupamento por fuso), com mock dos subcomponentes em vez de mock do `recharts`. |
| `supabase/deployment-manifest.json` | **OBSOLETA** | Hashes da branch (`bytes 9996`, sha `a2cb3eec…`) referem-se ao conteúdo da edge da branch. main tem `bytes 12589`, sha `f46caabe…` (L658-661) e esse sha bate com `sha256sum` do `origin/main:supabase/functions/external-db-bridge/index.ts` (verificado: `f46caabe801093dc…`). Manifest já regenerado para o código atual. |

## Veredito
**INCORPORADA** — confiança alta. A edge tem na main uma validação superconjunto da da branch; o teste foi restaurado na main por outro commit com cobertura maior (12 testes vs 3); o manifest está coerente com o código atual.

## Lacunas residuais (valor nenhum/baixo — não vale portar)
- O teste da branch assertava os títulos reais dos cartões (`Desempenho da Campanha`, `Funil de Conversão`, `Mapa de Calor de Respostas`), os rótulos de KPI (`Destinatários`, `A confirmar`, `Duração`, `Responderam`, `Clicaram`) e o nome do criador via prop `creators` (`Fulana de Tal`); a main cobre os cartões por `data-testid` (subcomponentes mockados) e não testa `creators`. Também cobria célula de domingo (`grid[6][9]`). Diferença de estilo, não de comportamento protegido; `valor: nenhum`.

## apagar_branch_seguro: true

## Verificação adversarial

Refutação tentada nos 3 arquivos do `git diff 9183f0f6f origin/claude/fix-external-db-bridge-validation-261108-2335` (`--name-status`: só esses 3; 2 commits `44b786016`, `413e05cc7`). **Triagem confirmada: INCORPORADA.**

### 1. `supabase/functions/external-db-bridge/index.ts` — incorporada, superconjunto estrito
A branch adicionava 3 coisas: `validIdentifier` (regex `^[a-z_][a-z0-9_]*$/i`), `FILTER_OPERATORS` (10 operadores) e dois guard-rails no caminho `select`.
- `origin/main:…/index.ts` L29-32: `validIdentifier` com a **mesma** regex + limite de 63 chars (`{0,62}`) + bloqueio de `POSTGREST_RESERVED` (L25-27: `select, or, and, not, order, limit, offset, on_conflict, columns`) — cobre a da branch e fecha o vetor `?select=eq.x` que a branch deixava passar.
- L33-35: `FILTER_OPERATORS` byte-idêntica à da branch.
- L59-81 `parseFilters`: valida forma do item, coluna, operador, `MAX_FILTERS=20`, `MAX_IN_ITEMS=1000`, escalaridade do valor e os casos `in`/`is`. Chamada em L226 **antes** de montar a query privilegiada (L232-236 só aplica `query.filter` sobre o array já validado); 400 `"Invalid filter column or operator"` em L227-229.
- L238-243: valida `order` (objeto, `validIdentifier(ord.column)`, `ascending` booleano) → 400 `"Invalid order column"`. A branch só checava a coluna.
- Único caminho que usa `filters`/`order` na main é `action === "select"` (grep: `.filter(` só em L236, `.order(` só em L244); não sobrou rota sem validação.
- Há ainda teste dedicado na main que a branch não tinha: `origin/main:supabase/functions/external-db-bridge/filters-validation.test.ts`.
Commits de origem: `6f90c9332` (SEC-Z018) e `dac285f62` (#3138).

### 2. `src/components/talkx/report/__tests__/TalkXCampaignReport.test.tsx` — incorporada por outra via
`origin/main` tem 215 linhas / 12 testes (`568d3f932`, pacote #3035) contra 3 testes da branch. Comparação assert por assert dos 64 "missing_in_main":
- série por dia e `conversions === 0`: main L69-107 (vazio, mesmo dia, 05/10 seg vs 11/10 dom, sem `sent_at`, granularidade `hour`) — cobre mais que a branch.
- heatmap 7x24 e fuso: main L108-124 (grade zerada, célula `[0][7]` = segunda 7h em São_Paulo, null/undefined). Só a célula de domingo `grid[6][9]` da branch não tem equivalente.
- três cartões: main L176-188 via `data-testid` (`performance`/`funnel`/`heatmap`), com os subcomponentes mockados; os **títulos reais** estão assertados nos testes próprios dos subcomponentes, que a branch não tinha: `Desempenho da Campanha` → `__tests__/TalkXReportPerformance.test.tsx`; `Funil de Conversão` → `TalkXReportFunnel.test.tsx`; `Mapa de Calor de Respostas` → `TalkXReportHeatmap.test.tsx`.
- ausência de Conversões: main L189-200 (`hasConversionSource=false`), e `Converteram`/`Conversões` aparecem nos 3 testes de report da main.
- rótulos de KPI: `Destinatários`, `Responderam`, `Clicaram` cobertos (`TalkXReportFunnel.test.tsx` e outros).
- o mock de `recharts` da branch não se perdeu como padrão: `TalkXReportPerformance.test.tsx` L18 usa `vi.mock('recharts', …)`.
Sobram **2 asserções sem equivalente em nenhum teste da main**, ambas de valor nenhum: o rótulo `A confirmar` (fonte `TalkXCampaignReport.tsx:253`) e a prop `creators` → `MetaRow "Responsável"` (`TalkXCampaignReport.tsx:74,106,327`), mais a célula de domingo do heatmap. São 3 linhas de asserção sobre texto de UI já renderizado, sem comportamento desprotegido — abaixo de "médio", não justificam PERDIDA_PARCIAL.

### 3. `supabase/deployment-manifest.json` — obsoleto, confirmado por hash
`sha256sum` de `origin/main:supabase/functions/external-db-bridge/index.ts` = `f46caabe801093dcf957733fee99b167317a21653aa9a21eadd867319f648746`, idêntico ao `sha256` do manifest da main (entrada `bytes: 12589`). O manifest da branch aponta `bytes: 9996` / `a2cb3eec…` / `source_sha256: 80bf992b…` (main: `65431ea1…`), hashes do código já superado. Reaplicar quebraria a verificação de deploy.

**Parecer:** concordo com a triagem. Nenhum hunk de valor ≥ médio fora da main. `apagar_branch_seguro = true`.
