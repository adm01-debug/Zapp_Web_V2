Especialista: worker (design) (design-system-zapp)

## O que mudou e por quê
- Consolidação dos violetas soltos do Talk X no token de categoria `--violeta` (decisão da paleta: novos consumidores usam `--violeta`; `--dash-violet`/`--dash-tile-violet` ficam como acento do dashboard): `kit/primitives.tsx` (tile violeta), `kit/cells.tsx` (progresso "scheduled"), `kit/dialogs.tsx` (botão do preset), `TalkXSuppression.tsx`, `help/TalkXHelpArticle.tsx`, `TalkXTemplateEditor.tsx` (chips `bg-violet-500/10 … text-violet-300` → `bg-violeta/… text-[hsl(var(--violeta-text))]`), `TalkXAnalytics.tsx` e `analytics/AnalyticsPerformanceChart.tsx` (série "Respostas"), `segments/TalkXSegmentBuilder.tsx` (badge OU), `tracking/TalkXSentSummaryChart.tsx`, `tracking/talkxTimelineCopy.ts`, `report/talkxReportCharts.ts`.
- `src/styles/components.css`: `.talkx-tile--violet` sai do gradiente cru `hsl(262 …)/hsl(270 …)` e passa a `hsl(var(--violeta))/hsl(var(--violeta-text))`; `.talkx-tile--soft-violet` sai do `hsl(262 83% 58% / 0.12)` para `hsl(var(--violeta) / 0.12)`. **Arquivo fora da lista do cartão**: a lista citava `src/components/talkx/**` e `tokens.css`, mas o gradiente cru nomeado no PROBLEMA mora em `components.css`; toquei só as 2 linhas do tile violeta.
- Objetivo 2 (parcial): no funil do Analytics, "Lidas" passa ao token `teal` e "Conversões" ao token `rosa`, deixando as 5 categorias com cores realmente distintas (antes reusavam `info`/`dash-amber`).
- `TalkXView.tsx`: corrigidos os typos `h9` → `h-9` e `hover:bv-muted/50` → `hover:bg-muted/50`; e os dropdowns "Analytics ▾"/"Templates ▾" (achado do comentário: não são TabsTrigger, então não tinham estado ativo) agora refletem a aba corrente via `navDropdownClass(analyticsActive|templatesActive)`.
- Testes atualizados junto com o contrato: `kit/__tests__/dialogPresets.test.tsx` e `__tests__/TalkXAnalytics.performance.test.tsx` passam a esperar o token `violeta`.

## Prova
- vermelho antes: `python3 .tmp/red.py` (muda só os 2 testes) + `npx vitest run src/components/talkx/kit/__tests__/dialogPresets.test.tsx …` → `Test Files 1 failed | 1 passed (2); Tests 1 failed | 22 passed` (AssertionError: expected "…bg-violet-600…" to contain 'bg-violeta').
- verde depois: `npx vitest run src/components/talkx/kit/__tests__/dialogPresets.test.tsx src/components/talkx/__tests__/TalkXAnalytics.performance.test.tsx` → `Test Files 2 passed (2); Tests 23 passed (23)`.
- Contraste AA (claro+escuro) dos tokens aplicados: `npx vitest run --config vitest.contracts.config.ts tests/contracts/contraste-cores-categoria.contract.test.ts` → `Test Files 1 passed (1); Tests 30 passed (30)`.
- Critério 1 (nenhum HSL/hex cru de violeta nos arquivos tocados): `grep -rn "violet-\|hsl(262\|hsl(270\|dash-violet\|dash-tile-violet" src/styles/components.css src/components/talkx` → saída vazia (só restam os nomes das classes `.talkx-tile--violet`/`--soft-violet` e o histórico em comentário).
- Verificação do projeto: `zapp-verify . --rapido` → `VERIFY: VERDE SEM BANCO`.

## O que NÃO fiz e por quê
- Objetivo 2 (teal/rosa) **NÃO CONCLUÍ** por inteiro: apliquei `teal`/`rosa` no funil do Analytics, mas não repintei o donut "Progresso da Campanha" (cores já distintas por status: verde/azul/vermelho/âmbar/cinza) — trocar por teal/rosa ali seria decisão de cor sem critério escrito.
- Objetivo 3 (padronizar com cartão-ícone 40x40 + selo): não havia card despadronizado concreto citado no cartão nesta branch; auditoria vira cartão próprio se aparecer.
- Upgrade do banner "Black Friday VIP": **NÃO FEITO** — é avaliação visual que depende de imagem/asset que não está no cartão (nenhum anexo presente) e de decisão de estilo.
- Critério 3 (visual bate com o mockup): **NÃO VERIFICADO** — o cartão cita "prints do Talk X anexados aqui no cartão", mas `kanban_attachments` está vazio; sem os prints não há como comparar.
- Não toquei em Catálogo, Dashboard nem Multiplix (cartões próprios), nem no token `--dash-violet`/`--dash-tile-violet` em si.
