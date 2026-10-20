# Plano de auditoria de fontes e tamanhos — 100 etapas

Base: `main@d8d835a` · 24/09/2026 · Sucede `PLANO_PARIDADE_TIPOGRAFICA_ZAPP_PROMO.md`
e `RELATORIO_PARIDADE_F0_F7_2026-09-22.md` (F0–F7 já mergeados, PRs #466/#493/#505/#506/#507/#526).

Este plano **não repete** o que o guard `scripts/qa/medir-tipografia.cjs --check` já cobre.
Ele ataca exatamente o que esse guard **não enxerga**: CSS puro, estilos inline, carregamento
de pesos, superfícies fora do `src/` (e-mails) e legibilidade.

---

## Diagnóstico em uma frase

As famílias estão certas e a escala em JSX está saneada; **o que está errado é tudo que o
guard atual não mede**: o dark pede pesos que o navegador não baixou, `font-mono` aponta para
uma fonte que ninguém carrega, 722 rótulos abaixo de 12px ignoram o modo "texto grande", e
há tamanho cravado em CSS e em `style={{ fontSize }}` fora de qualquer auditoria.

### Achados medidos (números reais, `main@d8d835a`)

| # | Achado | Evidência | Impacto |
|---|---|---|---|
| A1 | Dark aplica `font-weight` 450/550/650/900; o Google Fonts só baixa 300;400;500;600;700 (Jakarta) e 400–800 (Outfit) | `src/styles/base.css:46-82` × `index.html:13` | Todo o app no dark (tema padrão) renderiza peso sintetizado/arredondado |
| A2 | `font-mono` usado 117×, mas 'JetBrains Mono' não é carregada em lugar nenhum | `grep JetBrains index.html` → vazio; `base.css:170`, `utilities.css:59` | Código/monoespaçado cai em fallback do SO — visual diferente por máquina |
| A3 | `fontFamily` do Tailwind não declara `mono`; CSS declara outra stack | `tailwind.config.ts:16-19` × `base.css:170` | Duas pilhas mono concorrentes no mesmo app |
| A4 | `--font-sans` definido duas vezes, em arquivos diferentes | `src/index.css:27` e `src/styles/tokens.css:49` | Duas fontes de verdade; alterar uma não muda nada |
| A5 | 1.241 `text-[Npx]` em 311 arquivos (10px:605 · 11px:327 · 13px:161 · 9px:103 · 15px:28 · 8px:13 · 7px:3 · 120px:1) | `grep -roE "text-\[[0-9.]+px\]" src` | Fora da escala; `line-height` herdado 1.5 em vez do declarado |
| A6 | Baseline do budget está desatualizado: registra 1.233 arbitrários, hoje são 1.241 | `scripts/qa/tipografia-budget.json` × medição atual | O guard passa verde sobre um retrato velho |
| A7 | 722 usos abaixo de 12px (10/9/8/7px) | soma de A5 | Legibilidade e WCAG; concentrado em inbox (115 arquivos) |
| A8 | `.large-text` (modo acessibilidade) define tamanhos absolutos e não alcança `text-[10px]` | `styles/accessibility.css:77-83` | O recurso de acessibilidade não aumenta os 722 rótulos menores |
| A9 | 86 `fontSize` inline (Recharts, `style={{}}`) sem auditoria | `grep -rn fontSize src` | Eixos e tooltips de gráfico em 10/11/12px cravados |
| A10 | CSS com tamanho cravado, incluindo meia-medida `12.5px` | `styles/components.css:217,221,294,314,330,344` | O guard proíbe meia-medida em JSX e ignora em CSS |
| A11 | 8 tokens `--text-*`/`text-fluid-*` declarados, 2 usos no app | `tokens.css:53-60` × `grep text-fluid-` | Escala fluida morta gerando divergência |
| A12 | `--density-text-size` declarado 3×, consumido 0× | `accessibility.css:144-152` | Token morto: seletor de densidade não muda texto |
| A13 | 4 Edge Functions de e-mail usam Arial/-apple-system | `talkx-report`, `sentiment-alert`, `detect-new-device`, `send-scheduled-report` | E-mail ao cliente sai fora da marca |
| A14 | `useScreenProtection` injeta `font-family: system-ui` | `src/hooks/ui/useScreenProtection.ts:128` | Overlay fora da marca |
| A15 | Guard de CI cobre só `src/**` e classes `text-*` | `ci.yml:113` | Todos os achados acima passam verde hoje |

---

## F0 — Congelar a linha de base (E01–E08)

1. Registrar `git rev-parse HEAD` e anexar ao topo do relatório de execução.
2. Rodar `node scripts/qa/medir-tipografia.cjs --json docs/tipografia/baseline-2026-09-24.json`.
3. Diferenciar o baseline novo contra `baseline-2026-09-22-pos.json` e explicar cada delta.
4. Confirmar a divergência A6 (1.233 → 1.241) e identificar os PRs que introduziram os 8 novos.
5. Rodar `node scripts/qa/medir-tipografia.cjs --check` e confirmar exit 0 (estado "verde falso").
6. Inventariar o que o guard lê: só `src/**/*.tsx|ts`, só `text-*`. Documentar a fronteira.
7. Listar as superfícies fora dessa fronteira: `src/styles/*.css`, `index.html`, `supabase/functions/**`, `public/**`, `docs/**/*.html`.
8. Criar `docs/tipografia/RELATORIO_AUDITORIA_FONTES_2026-09-24.md` vazio, com as seções deste plano.

## F1 — Famílias: fonte de verdade única (E09–E18)

9. Mapear todas as declarações de `--font-sans` e `--font-display` no repo.
10. Confirmar A4: `index.css:27` redeclara `--font-sans` após `@import tokens.css`.
11. Decidir a fonte de verdade: `src/styles/tokens.css` (já contém as duas famílias).
12. Remover a redeclaração de `index.css`, mantendo `font-family: var(--font-sans)` no `html,body,#root`.
13. Verificar que nenhuma regra depende da ordem de cascata removida (busca por `--font-sans` em CSS e TSX).
14. Mapear os 117 usos de `font-mono` e as 2 classes CSS (`code,pre` e `.text-code`).
15. Decidir a stack mono oficial: uma só, declarada como `--font-mono` em `tokens.css`.
16. Declarar `mono: ["var(--font-mono)", ...]` no `fontFamily` do `tailwind.config.ts` (fecha A3).
17. Apontar `base.css:170` e `utilities.css:59` para `var(--font-mono)` (fecha A2 lado CSS).
18. Decidir sobre carregar JetBrains Mono de verdade ou remover o nome da stack — custo de rede × ganho visual, recomendação na PR.

## F2 — Carregamento e pesos (E19–E30)

19. Extrair a lista exata de pesos que o CSS pede (`grep font-weight src/styles/`).
20. Extrair a lista exata de pesos baixados (`index.html:13`).
21. Montar a matriz pedido × baixado e marcar cada peso órfão (A1: 450, 550, 650, 900 em Jakarta).
22. Confirmar em produção, via DevTools/Playwright, `document.fonts` e o peso renderizado do `body` no dark.
23. Decidir o caminho: (a) trocar a URL para *variable font* (`wght@300..800`), ou (b) arredondar o CSS para pesos reais.
24. Recomendação: (a) variable — mantém o desenho fino do dark já aprovado em 22/09, uma requisição só.
25. Medir o custo da opção (a): peso do arquivo variable × os 5 estáticos atuais.
26. Aplicar a escolha em `index.html` (preload + stylesheet devem mudar juntos — hoje são duas URLs idênticas).
27. Validar que `font-synthesis` não está mascarando o problema em nenhum navegador alvo.
28. Conferir `display=swap` e o efeito no LCP após a troca.
29. Medir CLS antes/depois da mudança de fonte (troca de métricas altera layout).
30. Registrar no relatório o antes/depois do peso renderizado em 5 telas (auth, inbox, contatos, dashboard, talkx).

## F3 — Tamanhos em JSX: além do guard (E31–E44)

31. Regenerar a distribuição de `text-[Npx]` por pasta e anexar ao relatório.
32. Separar os 1.241 em três grupos: (i) < 12px, (ii) 13/15px, (iii) 120px proposital.
33. Grupo (ii): 13px e 15px não têm equivalente na escala — decidir entre `text-sm`/`text-base` ou tokens novos.
34. Recomendação: absorver 13px → `text-sm` e 15px → `text-base` onde a diferença renderizada for ≤1px em medição.
35. Medir, não estimar: script que compara `font-size`+`line-height` antes/depois por ocorrência.
36. Grupo (i): decidir se a faixa 8–11px vira token nomeado (`text-2xs`, `text-3xs`) na escala do Tailwind.
37. Recomendação: sim — `2xs: 11px/14px` e `3xs: 10px/13px` cobrem 932 dos 722+ usos com `line-height` declarado.
38. Revisar se `line-height` herdado (1.5) é o que está em produção hoje nesses 932 pontos.
39. Marcar `text-[7px]` (3 usos) e `text-[8px]` (13) como anomalia: abaixo do mínimo utilizável.
40. Localizar os 3 usos de 7px e propor substituição por 10px + `title`/tooltip.
41. Conferir os 43 usos de `font-display`: títulos devem ser Outfit, corpo não.
42. Auditar `tracking-[...]` (23 usos arbitrários) — a decisão de 22/09 removeu letterSpacing da escala.
43. Auditar os 2 usos de `text-fluid-*` (A11) e decidir entre adotar ou remover os 8 tokens.
44. Recomendação: remover `fontSize.fluid-*` do Tailwind e os `--text-*` não consumidos — escala morta é dívida.

## F4 — CSS puro: a zona cega (E45–E56)

45. Extrair todo `font-size` de `src/styles/*.css` com arquivo:linha.
46. Confirmar A10: `12.5px` em `.talkx-table` é meia-medida — proibida em JSX, viva em CSS.
47. Converter `.talkx-table` (12.5px) para a escala; medir a tabela do Talk X antes/depois.
48. Converter `11px` (`components.css:221,294`) para o token da faixa decidida em E37.
49. Converter `9px` (`components.css:314`) — badge; avaliar subir para 10px.
50. Converter `12px` (`components.css:330`) → `text-xs` equivalente.
51. Converter `16px` (`.catalog-price:344`) → `text-base`.
52. Auditar `base.css:117-158`: os `clamp()` de h1–h6 são a única escala fluida viva — documentar como oficial.
53. Conferir que `h5`/`h6` (`clamp(0.925rem…)`, `clamp(0.875rem…)`) não ficam menores que o corpo.
54. Auditar `font-size: revert` (`components.css:139`) — entender o que reverte e se ainda é necessário.
55. Auditar `src/styles/diversity-overrides.css` e `sidebar.css` por tamanho cravado.
56. Anexar ao relatório a tabela final "CSS: antes → depois" por seletor.

## F5 — Estilos inline e gráficos (E57–E66)

57. Listar os 86 `fontSize` inline com arquivo:linha e agrupar por origem (Recharts × `style={{}}`).
58. Separar o que é prop de biblioteca (`tick={{ fontSize }}`) do que é CSS inline em elemento nosso.
59. Para Recharts: centralizar os valores em um objeto único de tema de gráfico.
60. Recomendação: `src/lib/chart-theme.ts` exportando `axisTick`, `tooltipStyle`, `labelStyle` — 1 import, 0 números soltos.
61. Converter `CatalogRail`, `TalkXAnalytics`, `SentimentTrendChart`, `SatisfactionMetrics` para o tema.
62. Varrer o restante dos gráficos por `tick={{`/`contentStyle={{` sem o tema.
63. Converter `catalogShared.tsx:74` (`style={{ fontSize: 10 }}`) para classe.
64. Fechar A14: `useScreenProtection.ts:128` passa a usar `var(--font-sans)`.
65. Auditar `index.html:62-65` (tela de erro de boot) — `system-ui` ali é proposital (a fonte pode não ter carregado); documentar como exceção.
66. Registrar a lista de exceções conscientes em `docs/tipografia/EXCECOES.md`.

## F6 — Legibilidade e acessibilidade (E67–E76)

67. Quantificar por tela quantos elementos renderizam abaixo de 12px (A7: 722 no código).
68. Confirmar o ranking: inbox (115 arquivos), contatos (30), dashboard (29), talkx (16).
69. Confirmar A8: testar o toggle "texto grande" e medir se um `text-[10px]` aumenta.
70. Diagnosticar a causa (ordem de cascata entre `.large-text span` e as utilities arbitrárias).
71. Corrigir `.large-text` para escalar por `em`/variável em vez de tamanhos absolutos.
72. Validar o modo densidade: ligar `--density-text-size` a um consumidor real ou remover (A12).
73. Testar zoom de navegador a 200% nas 5 telas principais e registrar quebras.
74. Verificar o mínimo de toque/alvo nos rótulos de 9–10px que são clicáveis.
75. Rodar axe-core nas 5 telas e filtrar achados de tipografia.
76. Registrar a decisão de negócio: manter densidade alta (padrão atual) × subir o piso para 11px.

## F7 — Superfícies fora do app (E77–E84)

77. Listar os 4 templates de e-mail com `font-family` própria (A13).
78. Decidir a stack de e-mail: web fonts não são confiáveis em cliente de e-mail; stack segura é o correto.
79. Padronizar uma única stack de e-mail em `supabase/functions/_shared/` e importar nos 4.
80. Conferir tamanhos nos e-mails (corpo ≥ 14px é o mínimo prático em mobile).
81. Auditar `docs/talkx/references/INDEX.html` e demais HTML de docs (fora do produto, prioridade baixa).
82. Auditar `public/` por HTML/SVG com fonte cravada.
83. Conferir o PDF de auditoria (`generate_audit_pdf.ts`) quanto à fonte embutida.
84. Registrar quais superfícies ficam deliberadamente fora do padrão e por quê.

## F8 — Guard-rails: fechar a zona cega (E85–E94)

85. Estender `medir-tipografia.cjs` para ler `src/styles/*.css` (fecha A10 e A15).
86. Adicionar regra: meia-medida em CSS reprova igual a meia-medida em JSX.
87. Adicionar regra: `fontSize` numérico inline em `.tsx` reprova fora da allowlist do tema de gráfico.
88. Adicionar regra: `font-family` literal em `src/**` reprova (só `var(--font-*)` passa).
89. Adicionar regra: peso pedido no CSS que não existe na URL do Google Fonts reprova (fecha A1 para sempre).
90. Adicionar regra: novo `text-[Npx]` abaixo de 12px só passa com token nomeado (depende de E37).
91. Fazer o guard falhar quando o baseline estiver desatualizado — evita A6 se repetir.
92. Escrever teste unitário do guard em `scripts/ci/` (padrão do repo: `*.unit.mjs`).
93. Confirmar que `ci.yml:113` cobre as regras novas sem novo job (o passo já existe — não criar outro).
94. Rodar o guard estendido contra `main` e registrar a contagem de reprovações antes das correções.

## F9 — Execução, medição e fechamento (E95–E100)

95. Sequenciar as correções em PRs pequenas e independentes: F1+F2 (famílias/pesos) → F4 (CSS) → F5 (gráficos) → F6 (a11y) → F7 (e-mails) → F8 (guard).
96. Medir cada PR com baseline antes/depois; nenhuma PR entra sem delta medido.
97. Capturar screenshots das 5 telas em dark e light antes/depois de F2 (a mudança de peso é global).
98. Atualizar `docs/tipografia/RELATORIO_AUDITORIA_FONTES_2026-09-24.md` com a tabela final de violações.
99. Atualizar o baseline versionado e o `tipografia-budget.json` no mesmo commit do guard estendido.
100. Atualizar o `CLAUDE.md` com a regra: tamanho e família só por token; guard cobre CSS, JSX e pesos.

---

## Ordem de ataque recomendada (impacto × esforço)

| Prioridade | Etapas | Por quê |
|---|---|---|
| 1 | F2 (E19–E30) | A1 afeta 100% das telas no tema padrão; correção é uma URL |
| 2 | F8 (E85–E94) | Sem guard, tudo que for corrigido volta |
| 3 | F6 (E67–E76) | A8 é recurso de acessibilidade que não funciona |
| 4 | F4+F5 | Zona cega restante, risco visual controlado |
| 5 | F1, F3, F7 | Dívida estrutural e superfícies secundárias |

## Regras de execução

- Uma fase = uma branch = uma PR. Padrão `claude/<tipo>-fontes-f{N}-<AAMMDD-HHMM>`.
- Nada de "otimizar de passagem": este plano não autoriza mudar cor, espaçamento ou layout.
- Toda troca de tamanho exige medição de `font-size` **e** `line-height` — a lição do F2 de 22/09.
- Exceções conscientes (120px do NotFound, `system-ui` do boot error) vão para `EXCECOES.md`, não somem.
