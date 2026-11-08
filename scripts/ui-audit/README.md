# UI audit — layout e regressão de largura

- `layout-guard.mjs` (Etapa 27) — audita o root de cada view por anti-padrões:
  `overflow-y-auto`/`overflow-auto` na raiz, `h-full` sem `w-full`/`flex-1`,
  `p-6` duplicando o padding do wrapper. Exit `0` sem violação, `1` com.
- `root-className.mjs` — extrator do `className` da raiz JSX de um componente
  de view, usado por `layout-guard.mjs` (heurística conservadora: último
  `export`, só `return`s no nível do corpo do componente, guard clauses
  inclusas).
- `width-check.mjs` (LT-LAYOUT-03 / P017 etapa 28) — predicado puro: reprova
  se `main.clientWidth - content.clientWidth > 1` (faixa morta), além do
  overflow clássico. Provado sem navegador por
  `scripts/ci/width-regression.unit.mjs`.
- `width-regression.mjs` — roda o predicado acima com Playwright, a 1280×800 e
  1920×1080. **Ferramenta local, não roda na CI** (playwright não é
  dependência do projeto): `npm i -D playwright && npx playwright install chromium`.

Testes: `node --test scripts/ui-audit/*.unit.mjs`.
