# Dossiê — claude__fix-esm-sh-import-regression-261108-2319 (PR #2878)

Ref: `origin/claude/fix-esm-sh-import-regression-261108-2319` · tip `60514ecae` · merge-base `9183f0f6f` (2026-11-08) · main lida: `dac285f62`

## Propósito (2 commits)
- `8cba80ba3 fix(edges): substitui esm.sh por npm: em external-db-proxy e cleanup-rate-limit-logs`
- `60514ecae fix(tests): restaurar TalkXCampaignReport.test.tsx truncado (X164)` — no merge-base o arquivo tinha 61 linhas e **zero** `describe/it` (só mocks), ou seja, suíte vazia/truncada.

## Arquivo × achado × evidência

| Arquivo | Achado | Evidência |
|---|---|---|
| `supabase/functions/cleanup-rate-limit-logs/index.ts` | INCORPORADA (byte-idêntico) | `hunk: PRESENT_BYTE`; `origin/main:…/cleanup-rate-limit-logs/index.ts:1` = `import { createClient } from "npm:@supabase/supabase-js@2.87.1";` |
| `supabase/functions/external-db-proxy/index.ts` | INCORPORADA (só difere aspas simples vs duplas) | branch: `'npm:@supabase/supabase-js@2.87.1'`; main L1: `"npm:@supabase/supabase-js@2.87.1"`. Entrou via `71123cc07 2026-11-11 fix(edges): substitui esm.sh por npm: nas 2 edge functions restantes (#2865)` (`git log -S'esm.sh/@supabase/supabase-js' origin/main -- <arquivos>`). Nenhum `esm.sh/@supabase` restante nas duas edges. |
| `src/components/talkx/report/__tests__/TalkXCampaignReport.test.tsx` | INCORPORADA por outra implementação (superset) | main (`568d3f932 2026-11-09 feat(testes): 12 testes reais para TalkXCampaignReport e talkxReportData`, depois `#3035`) tem 12 `it` cobrindo as mesmas intenções: série diária agrupa por dia (`series[0].sent/delivered/replied/conversions`), dois dias distintos (2026-10-05 seg / 2026-10-11 dom), granularidade `hour`, heatmap 7x24 no fuso SP (`grid[0][7]` para 10:00Z ≡ branch `grid[0][9]` para 12:00Z), três cartões renderizados, `hasConversionSource=false` (série Conversões ausente) + teste extra de falha de PDF. Branch tinha 3 `it`. |

### Diferenças de cobertura (baixo valor, não bloqueiam)
A branch mocka `recharts` e assegura os títulos literais dos cartões (`Resumo da Campanha`, `Desempenho da Campanha`, `Funil de Conversão`, `Mapa de Calor de Respostas`) e a linha `Responsável` via prop `creators` (`Fulana de Tal`). A main mocka os 3 subcomponentes (`TalkXReportPerformance/Funnel/Heatmap`) e não testa esses títulos nem `creators`. Os títulos existem na main (`TalkXCampaignReport.tsx:315`, `TalkXReportPerformance.tsx:69`, `TalkXReportFunnel.tsx:44`) e `creators` continua suportado (`TalkXCampaignReport.tsx:74,106,327`), então o teste da branch ainda seria aplicável, mas é redundante com o que já protege o comportamento. Nada a portar obrigatoriamente.

Hunk opcional (só se alguém quiser a asserção de `creators`):
```tsx
<TalkXCampaignReport campaign={CAMPAIGN as never} creators={{ u1: 'Fulana de Tal' }} onBack={() => {}} onViewMonitor={() => {}} />
// …
expect(screen.getByText('Fulana de Tal')).toBeTruthy();
```
(exige `owner: 'u1'` na campanha; main lê `creators[campaign.owner]` em `TalkXCampaignReport.tsx:327`.)

## Veredito: INCORPORADA (confiança alta)
- Edges: idênticas na main (aspas à parte).
- Teste: a necessidade (arquivo truncado → suíte real) foi resolvida na main com cobertura maior.
- NÃO VERIFICADO: execução do vitest da main neste clone (sem `node_modules`; `npx vitest` falha com `EOVERRIDE postcss`). O arquivo da main é o que passou pela CI dos merges #2891/#3035 — não confirmado aqui.

`apagar_branch_seguro`: true.

## Verificação adversarial

Parecer: **concordo — INCORPORADA**. Tentei refutar e não achei nenhum hunk de valor ≥ médio fora da main.

Escopo real da branch (nada além disto): `git diff 9183f0f6f origin/claude/fix-esm-sh-import-regression-261108-2319 --stat` = 3 arquivos, 90 inserções / 29 deleções.

### Edges — conferidas byte a byte contra a main (não só a linha citada)
- `diff <(git show <branch>:supabase/functions/cleanup-rate-limit-logs/index.ts) <(git show origin/main:…)` → **arquivo idêntico**, zero diferenças.
- `diff` do `external-db-proxy/index.ts` → **única diferença é a linha 1**, aspas simples na branch vs duplas na main; o conteúdo (`npm:@supabase/supabase-js@2.87.1`) é o mesmo. Valor nulo.
- `git grep -n "esm.sh" origin/main -- supabase/functions/external-db-proxy supabase/functions/cleanup-rate-limit-logs` → nenhum resultado. A regressão que a branch corrigia não existe mais na main.

### Teste — a main é superset, e os `missing_sample` do JSON são ruído de refatoração
Os 64 `missing_in_main` do `line_check` são, na maioria, linhas de mock/fixture reescritas (mesma intenção, formatação diferente) ou substituídas por abordagem melhor:
- `vi.mock('recharts', …)` da branch **não é lacuna**: a main mocka os 3 subcomponentes no teste do pai e testa os subcomponentes de verdade em arquivos dedicados — `src/components/talkx/report/__tests__/TalkXReportPerformance.test.tsx` (6 `it`, incl. fuso da campanha e ausência da série Conversões), `TalkXReportFunnel.test.tsx` (`Responderam`/`Converteram` com % — linhas 58-61, 75-77), `TalkXReportHeatmap.test.tsx` (`Mapa de Calor de Respostas`, grade segunda→domingo — linhas 39-40). Cobertura maior, não menor.
- Fixtures `ROWS`/`CAMPAIGN`/`REPORT` da branch: a main tem equivalentes (`campaign: TalkXCampaign` tipado, `state.report.kpis`) e as asserções de série/heatmap cobrem os mesmos casos — agrupamento por dia, dois dias distintos (2026-10-05 seg / 2026-10-11 dom), granularidade `hour`, grade 7x24 no fuso SP. `grid[0][9]` da branch (12:00Z) ≡ `grid[0][7]` da main (10:00Z): mesma asserção, horário diferente.
- A main tem 14 `it` (incl. entrada vazia, `sent_at` nulo, null/undefined no heatmap, falha de PDF com toast e botão liberado) contra 3 `it` da branch. `git show origin/main:…/__tests__/TalkXCampaignReport.test.tsx | wc -l` = 215 vs 122 da branch.

### Únicas asserções da branch sem equivalente na main (ambas valor baixo, não bloqueiam)
1. Rótulos do cartão de resumo no componente pai: `Destinatários`, `A confirmar`, `Duração` — existem em `src/components/talkx/report/TalkXCampaignReport.tsx:247,253,254`, e `git grep` nos `__tests__` da main não achou asserção desses rótulos nesse componente. É verificação de rótulo estático; a main já garante que o cartão de resumo e os 3 cartões gráficos renderizam.
2. `creators` → linha `Responsável` (`TalkXCampaignReport.tsx:73-74,106,327`): nenhum teste da main passa a prop `creators` para esse componente (`git grep -ln "creators" origin/main -- 'src/**/__tests__/**'` só retorna testes de `TalkXOverview` e `useCampaignRowActions`). Um `if` de uma linha; o hunk opcional já está registrado acima no dossiê se alguém quiser portar.

Nenhum dos dois é causa raiz de bug nem funcionalidade; não justificam reabrir a branch.

Veredito final: **INCORPORADA**. `apagar_branch_seguro`: **true**.

NÃO VERIFICADO (mantém a ressalva da triagem): não rodei vitest neste clone (sem `node_modules`). Toda a conclusão é por leitura de código e histórico, não por execução de suíte.
