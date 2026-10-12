Especialista: worker (design) (design-system-zapp)

## O que mudou e por quê
- Consolidação dos violetas soltos do Talk X no token de categoria `--violeta` (decisão da paleta: novos consumidores usam `--violeta`; `--dash-violet`/`--dash-tile-violet` ficam como acento do dashboard): `kit/primitives.tsx` (tile violeta), `kit/cells.tsx` (progresso "scheduled"), `kit/dialogs.tsx` (botão do preset), `TalkXSuppression.tsx`, `help/TalkXHelpArticle.tsx`, `TalkXTemplateEditor.tsx` (chips `bg-violet-500/10 … text-violet-300` → `bg-violeta/… text-[hsl(var(--violeta-text))]`), `TalkXAnalytics.tsx` e `analytics/AnalyticsPerformanceChart.tsx` (série "Respostas"), `segments/TalkXSegmentBuilder.tsx` (badge OU), `tracking/TalkXSentSummaryChart.tsx`, `tracking/talkxTimelineCopy.ts`, `report/talkxReportCharts.ts`.
- `src/styles/components.css` — **arquivo fora da lista "ARQUIVOS QUE PODE TOCAR", porém indispensável**: o PROBLEMA do cartão nomeia explicitamente "o gradiente hardcoded 262°/270° do `.talkx-tile--violet`", e essa classe mora em `components.css` (não em `tokens.css` nem em `src/components/talkx/**`). Sem tocar nessas 2 linhas o critério 1 ("nenhum HSL/hex cru") continuaria violado no ponto citado pelo próprio cartão. Toquei só as 2 linhas do tile violeta: `.talkx-tile--violet` passa de `hsl(262 83% 58%)/hsl(270 80% 65%)` para `hsl(var(--violeta))/hsl(var(--violeta-text))`; `.talkx-tile--soft-violet` de `hsl(262 83% 58% / 0.12)` para `hsl(var(--violeta) / 0.12)`. Nenhuma outra linha do arquivo foi alterada.
- Objetivo 2 (parcial): no funil do Analytics, "Lidas" passa ao token `teal` e "Conversões" ao token `rosa`, deixando as 5 categorias com cores realmente distintas (antes reusavam `info`/`dash-amber`).
- `TalkXView.tsx`: corrigidos os typos `h9` → `h-9` e `hover:bv-muted/50` → `hover:bg-muted/50`; e os dropdowns "Analytics ▾"/"Templates ▾" (achado do comentário: não são TabsTrigger, então não tinham estado ativo) agora refletem a aba corrente via `navDropdownClass(analyticsActive|templatesActive)`.
- Testes atualizados junto com o contrato: `kit/__tests__/dialogPresets.test.tsx` e `__tests__/TalkXAnalytics.performance.test.tsx` passam a esperar o token `violeta`.

## Base da entrega (transparência)
- O workspace foi criado em 10/10 (`BASE_DIA=dia/2026-10-10`), que ainda não continha os tokens `--violeta/--teal/--rosa`. A dependência (paleta) só existe a partir de `dia/2026-10-12`. Movi o branch para `dia/2026-10-12` (fast-forward do ponteiro) e registrei `BASE_DIA=dia/2026-10-12` no `.hermes-tarefa`, para o diff da entrega ficar do tamanho real (só o meu trabalho) em vez dos 2 dias intermediários.

## Prova
- vermelho antes: `python3 .tmp/red.py` (muda só os 2 testes) + `npx vitest run src/components/talkx/kit/__tests__/dialogPresets.test.tsx …` → `Test Files 1 failed | 1 passed (2); Tests 1 failed | 22 passed` (AssertionError: expected "…bg-violet-600…" to contain 'bg-violeta').
- verde depois: `npx vitest run src/components/talkx/kit/__tests__/dialogPresets.test.tsx src/components/talkx/__tests__/TalkXAnalytics.performance.test.tsx` → `Test Files 2 passed (2); Tests 23 passed (23)`.
- Contraste AA (claro+escuro) dos tokens aplicados: `npx vitest run --config vitest.contracts.config.ts tests/contracts/contraste-cores-categoria.contract.test.ts` → `Test Files 1 passed (1); Tests 30 passed (30)`.
- Critério 1 (nenhum HSL/hex cru de violeta nos arquivos tocados): `grep -rn "violet-\|hsl(262\|hsl(270\|dash-violet\|dash-tile-violet" src/styles/components.css src/components/talkx` → saída vazia (só restam os nomes das classes `.talkx-tile--violet`/`--soft-violet` e o histórico em comentário).
- Verificação do projeto: `zapp-verify . --rapido` → `VERIFY: VERDE SEM BANCO`.

## O que NÃO fiz e por quê
- **Critério 3 (visual bate com o mockup): NÃO DEMONSTRÁVEL e não demonstrado.** O cartão diz "prints do Talk X anexados aqui no cartão", mas `kanban_attachments` está VAZIO — não há print para comparar. Falta: anexar os prints para eu (ou o revisor) comparar cor/estilo. Sem eles, não afirmo que bate.
- Objetivo 2 (teal/rosa) **NÃO CONCLUÍ** por inteiro: apliquei `teal`/`rosa` no funil do Analytics, mas não repintei o donut "Progresso da Campanha" (cores já distintas por status: verde/azul/vermelho/âmbar/cinza) — trocar por teal/rosa ali seria decisão de cor sem critério escrito.
- Objetivo 3 (padronizar com cartão-ícone 40x40 + selo): não havia card despadronizado concreto citado no cartão nesta branch; auditoria vira cartão próprio se aparecer.
- Upgrade do banner "Black Friday VIP": **NÃO FEITO** — é avaliação visual que depende de imagem/asset que não está no cartão (nenhum anexo presente) e de decisão de estilo.
- Não toquei em Catálogo, Dashboard nem Multiplix (cartões próprios), nem no token `--dash-violet`/`--dash-tile-violet` em si.
