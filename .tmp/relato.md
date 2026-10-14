Especialista: Íris (area-front-componentes)

## O que mudou e por quê
- `src/components/admin/AdminCRMDashboard.tsx`: o botão "Explorer Completo" do Painel CRM Externo chamava `navigate('/#crm360')` do `react-router-dom` (e o componente importava `useNavigate`). Trocado pelo helper de navegação da própria aplicação, `navigateToView('crm360')` de `@/hooks/system/useNavigationHistory` — a fonte única de navegação das telas (grava `?view=<id>` via `setViewParam` e emite `zapp:navigate`); o import de `react-router-dom` saiu junto.
  Motivo: o roteador grava a URL por `history.pushState`, que NÃO dispara `hashchange` nem `zapp:navigate`; com isso o `?view=` canônico nunca era gravado, o hook de navegação não empilhava a tela e o clique não abria o Explorer (a URL ainda perdia o `?view=` da tela atual). É o mesmo padrão já usado em outras telas (`components/catalog/ContactSelectionStep.tsx`, `components/dashboard/**`).
- `src/components/admin/__tests__/AdminCRMDashboard.explorer-crm360.test.tsx` (novo): monta a TELA REAL (dentro do Router, como o `App.tsx` faz), clica em "Explorer Completo" e cobra o contrato observável do clique — URL canônica `?view=crm360` + evento `zapp:navigate` com `view: 'crm360'`.

## Prova
- vermelho antes: `npx vitest run src/components/admin/__tests__/AdminCRMDashboard.explorer-crm360.test.tsx` → `AssertionError: expected null to be 'crm360'` no ponto `window.location.search` (o clique não gravava a view; nenhum `zapp:navigate` foi emitido) — `Tests 1 failed (1)`.
- verde depois: mesmo comando → `Test Files 1 passed (1); Tests 1 passed (1)`.
- regressão vizinha: `npx vitest run src/components/admin/__tests__/AdminView.section-error-boundary.test.tsx src/components/admin/__tests__/AdminView.a11y.test.tsx` → `Test Files 2 passed (2); Tests 7 passed (7)`.

## O que NÃO fiz e por quê
- Não toquei nos cards de métrica, listas, health da integração nem em `src/components/ui/**`: o defeito era só o clique do botão.
- O teste mantém o `MemoryRouter` de fora porque o App monta a tela dentro de um Router; a asserção não depende do roteador (cobra `?view=` e o evento `zapp:navigate` da aplicação).
