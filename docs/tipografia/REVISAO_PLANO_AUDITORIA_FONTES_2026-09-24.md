# Revisão de execução — plano de auditoria de fontes (100 etapas)

Plano revisado: `PLANO_AUDITORIA_FONTES_100_ETAPAS_2026-09-24.md` (PR #588).
Estado medido em `main@d355b95` + as 4 PRs de implementação abertas em 24/09/2026.
Nada aqui é estimativa: cada status aponta o PR/commit ou o `grep` que o sustenta.

Legenda: ✅ feito · 🟡 parcial · ❌ não feito · ⛔ avaliado e deliberadamente não feito (motivo na linha)

## Placar

| Fase | ✅ | 🟡 | ❌ | ⛔ | Total |
|---|---|---|---|---|---|
| F0 Linha de base | 4 | 1 | 3 | 0 | 8 |
| F1 Famílias | 10 | 0 | 0 | 0 | 10 |
| F2 Pesos | 6 | 0 | 6 | 0 | 12 |
| F3 Tamanhos JSX | 5 | 3 | 6 | 0 | 14 |
| F4 CSS puro | 3 | 0 | 8 | 1 | 12 |
| F5 Inline/gráficos | 5 | 1 | 3 | 1 | 10 |
| F6 Acessibilidade | 3 | 0 | 7 | 0 | 10 |
| F7 Fora do app | 3 | 0 | 5 | 0 | 8 |
| F8 Guard-rails | 8 | 0 | 1 | 1 | 10 |
| F9 Fechamento | 1 | 2 | 3 | 0 | 6 |
| **Total** | **48** | **7** | **42** | **3** | **100** |

**48% feito de fato, 7% parcial, 45% aberto.** Os 15 achados (A1–A15) da tabela original
ficam assim: A1 A2 A3 A4 A5 A8 A9 A10 A13 A15 fechados; A6 A7 A11 A12 A14 abertos.

## Onde cada coisa está

| PR | Fase | Estado em 24/09 17:05 UTC |
|---|---|---|
| #588 | Plano | draft, docs |
| #590 | F1+F2 | CI verde, atualizada com main, aguardando merge (1º da fila) |
| #593 | F4–F7 | CI verde, `behind` — precisa `update_pr_branch` depois de #590 |
| #596 | F3 | CI verde, `behind` — idem |
| #595 | F8 | CI verde, `behind` — idem; **vai conflitar em `scripts/qa/tipografia-budget.json` com #596** (ambas regeneraram o arquivo com formatos diferentes: #595 tem 8 chaves de violação, #596 só 3). Resolver regenerando o budget depois do merge de #596 |

## Etapa a etapa

### F0 — Linha de base

| # | Status | Evidência / motivo |
|---|---|---|
| 1 | ✅ | `main@d8d835a` no cabeçalho do plano |
| 2 | ❌ | `baseline-2026-09-24.json` não foi gerado; só `tipografia-budget.json` foi regenerado (F3/F8) |
| 3 | ❌ | sem baseline novo não houve diff contra `baseline-2026-09-22-pos.json` |
| 4 | 🟡 | divergência 1.233→1.241 confirmada; os PRs que introduziram os 8 **não** foram identificados |
| 5 | ✅ | `--check` exit 0 em `d8d835a` (registrado no plano e na PR #588) |
| 6 | ✅ | fronteira documentada no cabeçalho do guard estendido (#595) |
| 7 | ✅ | superfícies listadas no plano; `src/styles`, `index.html`, `supabase/functions` cobertas nas PRs |
| 8 | ❌ | `RELATORIO_AUDITORIA_FONTES_2026-09-24.md` não existe — este documento cumpre o papel |

### F1 — Famílias (PR #590)

| # | Status | Evidência / motivo |
|---|---|---|
| 9–13 | ✅ | `--font-sans` removido de `src/index.css`; `tokens.css` única fonte; grep pós-remoção limpo |
| 14 | ✅ | 117 `font-mono` + `code,pre` + `.text-code` mapeados |
| 15 | ✅ | `--font-mono` em `tokens.css` |
| 16 | ✅ | `fontFamily.mono` em `tailwind.config.ts` |
| 17 | ✅ | `base.css:170` e `utilities.css:59` → `var(--font-mono)` |
| 18 | ✅ | decisão: carregar JetBrains Mono 400/500 pela mesma URL (1 request a mais; 117 usos justificam) |

### F2 — Carregamento e pesos (PR #590)

| # | Status | Evidência / motivo |
|---|---|---|
| 19–21 | ✅ | matriz pedido×baixado no corpo da PR: 450/550/650/800/900 órfãos com a lista estática |
| 22 | ❌ | peso renderizado em produção **não** medido (DevTools/`document.fonts`) |
| 23–24 | ✅ | opção (a) *variable font* adotada: `wght@200..800` Jakarta, `wght@100..900` Outfit |
| 25 | ❌ | custo em bytes estático×variável não medido |
| 26 | ✅ | preload + stylesheet trocados juntos em `index.html` |
| 27 | ❌ | `font-synthesis` não auditado |
| 28 | ❌ | LCP não medido |
| 29 | ❌ | CLS não medido |
| 30 | ❌ | sem antes/depois em 5 telas |

Limitação conhecida e aceita: `.font-black` pede 900 e a Jakarta publica só até 800 — o
navegador usa 800. O guard de F8 registra isso como 1 `pesoOrfao` de teto, não como zero.

### F3 — Tamanhos em JSX (PR #596)

| # | Status | Evidência / motivo |
|---|---|---|
| 31–32 | ✅ | distribuição por pasta e 3 grupos no plano e na PR |
| 33 | 🟡 | 13px (161) e 15px (28) **não** convertidos — a decisão exigia medição (E34/E35), que não houve |
| 34 | ❌ | recomendação 13→`sm`/15→`base` não aplicada |
| 35 | ❌ | script de comparação por ocorrência não escrito; o guard mede lh da escala, não antes/depois por ponto |
| 36–37 | ✅ | `text-3xs` (10/13) e `text-2xs` (11/14) criados; 932 usos convertidos (+2 vindos de merge com main) |
| 38 | 🟡 | mudança de lh herdado→declarado documentada e precedentada (F0–F7 de 22/09), não medida em produção |
| 39 | 🟡 | 7px (3) e 8px (13) sinalizados como anomalia no plano; **ainda no código** |
| 40 | ❌ | os 3 usos de 7px não foram substituídos |
| 41 | ❌ | 43 usos de `font-display` não auditados |
| 42 | ❌ | 22 `tracking-[...]` arbitrários não auditados |
| 43 | ❌ | `text-fluid-*`: 4 usos hoje (eram 2), 8 tokens — não decidido |
| 44 | ❌ | `fontSize.fluid-*` e `--text-*` órfãos não removidos |

### F4 — CSS puro (PR #593)

| # | Status | Evidência / motivo |
|---|---|---|
| 45–46 | ✅ | `font-size` de `src/styles/*.css` extraído; `12.5px` confirmado como única meia-medida |
| 47 | ✅ | `.talkx-table` 12.5px → 12px (medição visual da tabela ❌) |
| 48 | ⛔ | 11px (`components.css:221,294`) mantido: o token `2xs` só existe na branch de F3, ainda não em main; converter aqui dependeria de ordem de merge |
| 49 | ❌ | 9px (`components.css:314`) mantido |
| 50 | ❌ | 12px literal mantido (equivale a `xs`, mas continua literal) |
| 51 | ❌ | 16px `.catalog-price` mantido |
| 52–53 | ❌ | `clamp()` de h1–h6 não documentado como escala oficial; h5/h6 vs corpo não conferido |
| 54 | ❌ | `font-size: revert` (`components.css:139`) não investigado |
| 55 | ❌ | `diversity-overrides.css` e `sidebar.css` não auditados |
| 56 | ❌ | tabela antes→depois por seletor não escrita |

Achado no caminho (corrigido antes do push): comentário CSS com `src/**/*.tsx` fechava o
`/* */` no `**/` — quebrou o `vite build`. Regra prática: nunca escrever glob dentro de
comentário CSS.

### F5 — Inline e gráficos (PR #593)

| # | Status | Evidência / motivo |
|---|---|---|
| 57–58 | ✅ | 86 `fontSize` listados, separados prop de lib × `style={{}}` |
| 59–60 | ✅ | `src/lib/chart-theme.ts` com `CHART_TICK_FONT_SIZE`, `_SM`, `CHART_TOOLTIP_FONT_SIZE`, `CHART_LABEL_FONT_SIZE` |
| 61 | ✅ | `CatalogRail`, `TalkXAnalytics`, `SentimentTrendChart`, `SatisfactionMetrics` migrados |
| 62 | 🟡 | varredura feita; **17 arquivos ainda com `fontSize` solto** (54 ocorrências em main hoje): `AIUsageDashboard`, `AIUsageUsersTab`, `TelemetryCharts`, `AIStatsWidget`, `DemandPrediction`, `SentimentTrendCard`, `VolumeChart`, `MonitoringMessageChart`, `PerformanceMonitor`, `QueuesComparisonCharts`, `DemandForecast`, `ReportCharts`, `SLACharts`, `TalkXCampaignRunning`, `TalkXLiveMonitor`, `AdminTelemetriaPage`, `catalogShared` |
| 63 | ⛔ | `catalogShared.tsx:74` mantido: o `style` mistura `height`/`padding`/`fontSize` num objeto condicional; virar classe não muda nada renderizado |
| 64 | ❌ | **`useScreenProtection.ts:128` ainda com `font-family: system-ui`** (achado A14 aberto) |
| 65 | ❌ | exceção do boot error de `index.html` não registrada |
| 66 | ❌ | `docs/tipografia/EXCECOES.md` não criado |

### F6 — Acessibilidade (PR #593)

| # | Status | Evidência / motivo |
|---|---|---|
| 67 | ❌ | contagem por tela renderizada não feita (só por arquivo) |
| 68 | ✅ | ranking por pasta: inbox 115, contatos 30, dashboard 29, talkx 16 |
| 69 | ❌ | toggle "texto grande" não testado em navegador |
| 70 | ✅ | causa diagnosticada: lista de tags incompleta + tamanho absoluto (podia encolher texto maior) |
| 71 | ✅ | `.large-text :where(*)` com `max(1em, 0.875rem) !important`; h1–h3 com piso próprio |
| 72 | ❌ | densidade: **o sistema inteiro está morto** (`--density-padding-*`, `--density-gap`, `--density-row-height`, `--density-text-size`: 0 consumidores, `data-density` nunca é setado). Maior que A12; não removido por extrapolar "fontes" |
| 73 | ❌ | zoom 200% não testado |
| 74 | ❌ | alvo de toque em rótulos 9–10px não verificado |
| 75 | ❌ | axe-core não rodado |
| 76 | ❌ | decisão de negócio (piso 11px global) não tomada — só o piso de 14px no modo acessibilidade |

### F7 — Fora do app (PR #593)

| # | Status | Evidência / motivo |
|---|---|---|
| 77–79 | ✅ | `supabase/functions/_shared/email-font-stack.ts` importado nos 4 templates; `deployment-manifest.json` regenerado (CI quebrou por isso, corrigido) |
| 80 | ❌ | tamanhos dentro dos e-mails (corpo ≥14px) não auditados |
| 81 | ❌ | `docs/talkx/references/INDEX.html` não auditado (baixa prioridade) |
| 82 | ❌ | `public/` não auditado |
| 83 | ❌ | `generate_audit_pdf.ts` não auditado |
| 84 | ❌ | registro de superfícies fora do padrão não escrito |

### F8 — Guard-rails (PR #595)

| # | Status | Evidência / motivo |
|---|---|---|
| 85–86 | ✅ | `scanCss`: meia-medida em CSS + `font-family` literal (ignora `tokens.css`) |
| 87 | ✅ | `scanTsxInline`: `fontSize` numérico (arquivo migrado some sozinho ao virar `CHART_*`) |
| 88 | ✅ | `font-family`/`fontFamily` literal em CSS e TSX |
| 89 | ✅ | `parseLoadedWeights` + `scanOrphanWeights` lendo a URL real de `index.html` (faixa variável e lista estática) |
| 90 | ❌ | regra "novo `text-[Npx]` <12px só com token" não adicionada — 9/8/7px seguem permitidos pelo teto |
| 91 | ⛔ | "guard falha com baseline desatualizado" não adicionado: os totais mudam a cada PR e viraria ruído constante |
| 92 | ✅ | `scripts/ci/medir-tipografia.unit.mjs`, 8 casos, fixtures isoladas |
| 93 | ✅ | `ci.yml:113` cobre sem job novo |
| 94 | ✅ | contagem inicial registrada: 3 pesos órfãos, 2 `font-family` CSS, 56 inline, 0 fontFamily TSX, 1 meia-medida CSS |

### F9 — Fechamento

| # | Status | Evidência / motivo |
|---|---|---|
| 95 | ✅ | 4 PRs independentes na ordem F1+F2 → F4–F7 → F3 → F8 |
| 96 | 🟡 | cada PR passou pelo guard, typecheck, lint e build; "delta medido" só via budget, não por baseline versionado |
| 97 | ❌ | sem screenshots dark/light |
| 98 | ❌ | relatório final não escrito (este doc substitui) |
| 99 | 🟡 | budget atualizado em #596 e #595 **separadamente** — precisa de uma regeneração única após os 4 merges |
| 100 | ❌ | `CLAUDE.md` não atualizado com a regra "tamanho e família só por token" |

## Gaps que importam (ordem de impacto)

1. **A14 aberto** — `useScreenProtection.ts:128` injeta `font-family: system-ui`. Fix de 1 linha
   (`var(--font-sans)`), ficou de fora da PR #593 por esquecimento.
2. **F5 pela metade** — 17 arquivos de gráfico com 54 `fontSize` soltos. Mecânico, mesmo padrão
   dos 4 já migrados.
3. **Budget vai conflitar** entre #595 e #596. Sequência obrigatória: mesclar #596, atualizar
   #595 com main, regenerar `tipografia-budget.json` **uma vez** com o guard estendido, mesclar.
4. **Nada foi verificado renderizando** — E22, E28–E30, E67, E69, E73–E75, E97. O ambiente desta
   sessão não tem app rodando com dados; é o maior buraco de confiança do trabalho, sobretudo
   para as 932 mudanças de line-height de F3 e o piso de 14px de F6.
5. **Faixa 7–9px** (120 usos) e **13/15px** (189 usos) continuam arbitrárias. O plano previa
   decisão por medição, que não aconteceu.
6. **Tokens mortos**: `fluid-*` (8 declarados / 4 usos) e o sistema de densidade inteiro.
7. **`CLAUDE.md` sem a regra nova** — próxima sessão não sabe que o guard cobre CSS/inline/pesos.

## O que aprendi no caminho (para a próxima sessão)

- CI de PR roda no merge hipotético com `main`, não no head da branch: um `text-[10px]` que outra
  PR adicionou depois do codemod fez #596 falhar até eu mesclar `main` e reconverter.
- Não trocar de branch com `git push` em andamento: o hook `pre-push` (husky) lê o working tree e
  falhou com ENOENT quando mudei de branch no meio — o push de #593 nunca chegou e eu só percebi
  ao conferir o SHA remoto.
- Codemod em massa remarca fingerprints do `eslint-baseline.json` (o comparador usa o snippet de
  código como chave). 94 entradas "novas" eram as mesmas 94 "removidas" — 1096 antes e depois.
- `**/*` dentro de comentário CSS fecha o comentário.
