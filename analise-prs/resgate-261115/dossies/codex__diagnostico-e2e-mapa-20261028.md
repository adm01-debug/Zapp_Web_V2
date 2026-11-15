# Dossiê — codex__diagnostico-e2e-mapa-20261028

- Ref: `origin/codex/diagnostico-e2e-mapa-20261028` · tip `94bfe9aa1` · merge-base `180cc8cdd` · 8 commits (2026-10-20…28)
- Veredito: **INCORPORADA** (confiança alta) · apagar branch: **seguro**

## Propósito
Diagnóstico/correção de E2E do Mapa + lote de fixes de Contatos (FAB, barra de lote, contrato do topo sem cabeçalho), status chips do inbox filtrados e cache de não-lidos do Team Chat. Commits: `f53379137 fix(inbox)`, `2720a3cf9 fix(teams)`, `96c5e0ae7`/`396f47233 test(e2e)`, `1b6166c6c`/`5cbd3d5f7`/`5237e8379 fix(contatos)`, `94bfe9aa1 test(contatos)`.

## Como entrou na main
A branch é ancestral direta de `refs/remotes/pr/2317` (head `dc9585422`, +5 commits sobre o tip). A PR #2317 foi integrada por squash em `82e22bbb8` (2026-10-28, "Corrige E2E de Inbox, mapa, Contatos, Email e Talk X — Integra as correções verificadas no PR #2317"), que toca exatamente os 14 arquivos desta branch (mais os da continuação da PR). 11/14 arquivos são byte-idênticos ou com patch já aplicado (`PRESENT_BYTE`/`PRESENT_REVERSE_APPLIES`).

## Arquivo × achado × evidência (só os 3 com lacuna)

| Arquivo | Achado | Evidência |
|---|---|---|
| `e2e/fixtures/mapa-mocks.ts` | Intenção incorporada em forma generalizada: `BOOT_FAKE`, rota `app_bootstrap` após o catch-all, `user_settings.onboarding_completed` e `/auth/v1/health` estão na main; a PR #2317 parametrizou `mockAppShell(page, registro, { role, onboardingCompleted })`, por isso as 3 linhas literais (`? { onboarding_completed: true }` …) viraram `onboardingCompleted` variável. | `git show origin/main:e2e/fixtures/mapa-mocks.ts` — `BOOT_FAKE` (l.47-62), `options.onboardingCompleted ?? true` (l.86), rota `user_settings` com a variável (l.96-99), `app_bootstrap` (l.106), `/auth/v1/health` (l.119) |
| `src/components/contacts/ContactsView.tsx` | Hunks de negócio incorporados: `PageHeader` removido, `<h1 className="sr-only">Contatos</h1>`, `pb-[calc(160px+…)]`. O wrapper local `<MotionConfig reducedMotion="user">` foi **substituído de propósito** pelo provedor global `LazyMotionConfig` em `src/App.tsx` (SL-103), que governa todas as telas. | `git grep` origin/main: `ContactsView.tsx:137` (h1 sr-only), `:208` (pb-160px), nenhum `PageHeader`/`MotionConfig`; `src/App.tsx:85-88,214-216` (`LazyMotionConfig` → `<MotionConfig reducedMotion="user">`); commit `e1f2ee4dd` (2026-10-27) introduziu o provedor global |
| `src/components/contacts/__tests__/ContactsView.contratoFonte.test.ts` | Teste existe na main com o contrato **atualizado** pela própria PR #2317 (commit `dc9585422` "Atualiza contrato de movimento de Contatos para o provedor global"): agora exige `MotionConfig` em `App.tsx` e `not.toContain('MotionConfig')` em ContactsView; mantém o `not.toContain('PageHeader')`. As 4 linhas faltantes são a versão antiga do contrato, contrária ao que a main faz hoje. | `git show origin/main:src/components/contacts/__tests__/ContactsView.contratoFonte.test.ts` l.22-30 |

## Lacunas a recuperar
Nenhuma. As 10 linhas "faltantes" são (a) literal substituído por parâmetro equivalente e (b) `MotionConfig` local substituído pelo provedor global — reintroduzi-lo quebraria o teste de contrato vigente na main.

## Riscos ao apagar
Nenhum: todo o conteúdo útil está em `origin/main` via `82e22bbb8`; a PR #2317 continua referenciável pelo squash.

## Reexame de commits intermediários

**Parecer: REFATORACAO_INTERNA. Nada a recuperar. Apagar a branch continua seguro.**

Os 2 achados mecânicos (8 linhas) têm o **mesmo removedor**: o commit de ponta `94bfe9aa1`
"test(contatos): endurece os guardas contra os 7 furos do lote 880". O título promete endurecer e
o commit de fato endurece — cada linha removida foi substituída, no mesmo hunk, por uma asserção
**estritamente mais forte**. E os dois arquivos resultantes estão em `origin/main` **byte-idênticos
à ponta** (mesmo blob):

- `git ls-tree origin/main` → `fa82a3c7e` para `src/hooks/contacts/__tests__/ContactsView.v2Flags.test.tsx`
  e `0695b601d` para `src/components/contacts/__tests__/ContactDialogs.fabToque.test.ts` — exatamente os
  blobs pós-`94bfe9aa1`.
- `git diff <ponta>:<arquivo> origin/main:<arquivo>` → vazio nos dois.

### Achado 1 — `1b6166c6c` → removido por `94bfe9aa1` (6 linhas, `ContactsView.v2Flags.test.tsx`)

| Linha removida | O que a substituiu em `94bfe9aa1` (e está na main) |
|---|---|
| `const titulos = Array.from(container.querySelectorAll('h1'));` | `screen.getAllByRole('heading', { name: 'Contatos' })` — passa a contar por papel/nome acessível, pega `h2` fantasma que o seletor `h1` deixava passar (main l.309) |
| `expect(titulos[0].textContent).toBe('Contatos')` | Absorvido no `{ name: 'Contatos' }` do próprio query (main l.309) |
| `expect(titulos[0].className).toContain('sr-only')` | `expect(screen.getByRole('heading', { level: 1, name: 'Contatos' }).className).toContain('sr-only')` — mesma asserção + exigência de nível 1 (main l.311) |
| `expect(areas.indexOf('area-stats')).toBeLessThan(areas.indexOf('area-tabs'))` e idem p/ `area-toolbar` | `expect(areas.slice(i, i + 3)).toEqual(['area-stats','area-tabs','area-toolbar'])` — bloco contíguo; implica as duas comparações e ainda proíbe algo entrar no meio (main l.323-324) |
| `render(<ContactsView />, { wrapper: createWrapper() });` | `const { container } = render(...)` + `expect(container.querySelectorAll('[data-testid="area-dialogs"]')).toHaveLength(1)` — passa a contar o DOM, não só o mock |

O `beforeEach` com `spy.mockClear()` que `1b6166c6c` adicionou **não foi tocado** e está na main
(l.261). `94bfe9aa1` ainda **acrescentou** um 4º teste (armadilha de import direto do `PageHeader`).

### Achado 2 — `5cbd3d5f7` → removido por `94bfe9aa1` (2 linhas, `ContactDialogs.fabToque.test.ts`)

| Linha removida | O que a substituiu em `94bfe9aa1` (e está na main) |
|---|---|
| `expect(fab).not.toMatch(/\bz-(?:3[0-9]\|[4-9][0-9])\b/)` | Teto numérico: extrai todas as camadas (`z-N`, arbitrary `z-[N]`, `style zIndex`) e exige `Math.max(...todas) < 30` — cobre `z-100`, `z-[40]` e inline, que o regex antigo (só 30-99 literais) deixava passar (main l.45-52) |
| `it('continua portal, fora do scroller que recortaria o fixed', …)` | Mesmo teste **renomeado** para `'continua portal no document.body, …'` com uma asserção extra `createPortal(…, document.body)` (main l.55-57) |

No mesmo commit entraram ainda `after:absolute`, `not.toContain('pointer-events-none')` e
`not.toMatch(/after:(hidden|invisible|content-none)/)` — ou seja, a guarda do `::after` ficou mais
rígida, não mais frouxa.

### Conclusão
Nenhuma validação, guarda, teste ou estado deixou de existir. O padrão da PR #2879 (commit final
desfaz a proteção dos anteriores) **não** se aplica aqui: aqui o commit final é o que aperta, e o
resultado apertado está na main. Confirma o veredito `INCORPORADA`.

## Verificação adversarial

Papel: refutar o veredito `INCORPORADA`. Resultado: **não refutado — concordo**. Nenhum hunk de valor ≥ médio ficou fora da `main`.

### Prova de incorporação
- `94bfe9aa1211fb410f4d322edb8d38e8d9bddde4` (tip) **é ancestral** de `refs/remotes/pr/2317` (head `dc958542210476533c1e2c3f32bcb8f38021db49`); a PR #2317 entrou na `main` pelo squash `82e22bbb822d1cb1abeeaaf31a0cd842ce713045` ("Corrige E2E de Inbox, mapa, Contatos, Email e Talk X", 2026-10-28 11:43 -0300), que `git merge-base --is-ancestor 82e22bbb8 origin/main` → **YES**. O squash toca os 14 arquivos da branch + 14 extras.
- `git diff 94bfe9aa1 origin/main` restrito aos 14 arquivos da branch: **13 saem vazios** (idênticos à `main`); só 1 difere — `src/components/inbox/ConversationListSidebar.tsx`, e aí a diferença é **trabalho posterior da main** (transferência levando `contact.assigned_to`, `text-[11px]` → `text-2xs`). A remoção de `statusChipCountOpts` e do prop `countOpts` feita pela branch **não reaparece** na main, logo está incorporada.

### As 3 lacunas apontadas pelo `line_check` — todas explicadas, nenhuma é perda
1. `e2e/fixtures/mapa-mocks.ts` (3 linhas). A main **generalizou**: `mockAppShell` ganhou `options: { role?, onboardingCompleted? }` com `onboardingCompleted = options.onboardingCompleted ?? true`, e `app_bootstrap` passou a devolver `{...BOOT_FAKE, user_settings: {...,onboarding_completed: onboardingCompleted}}`. `BOOT_FAKE` na main já traz `user_settings: { onboarding_completed: true }` — byte a byte igual ao da branch. Com os defaults, o comportamento é **idêntico** ao da branch, e a main ainda adiciona `SUPABASE_URL` por env e um predicado mais estreito em `bloquearRedeReal`. Superconjunto, não lacuna.
2. `src/components/contacts/ContactsView.tsx` (3 linhas: import + abre/fecha `<MotionConfig reducedMotion="user">`). Removido **de propósito**: o provedor virou global e lazy em `src/App.tsx:85-88` (`LazyMotionConfig` → `<MotionConfig reducedMotion="user">`) envolvendo `<AppRoutes />` em `src/App.tsx:214-216`; motivo registrado no commit `e1f2ee4dd` ("Remove import estático framer-motion … MotionConfig lazy em App.tsx", 2026-10-27) e no comentário SL-103 de `src/App.tsx:80-84` (manter `vendor-motion` fora do bundle inicial). Reintroduzir o provedor local anularia esse ganho. A main ainda tem, no mesmo arquivo, um fix que a branch não tem (`useResolvedMergeContacts`).
3. `src/components/contacts/__tests__/ContactsView.contratoFonte.test.ts` (4 linhas). A main **inverteu o contrato de propósito**: `expect(appFonte).toContain('<MotionConfig reducedMotion="user">')`, `expect(appFonte).toMatch(/<LazyMotionConfig>\s*<AppRoutes\s*\/>\s*<\/LazyMotionConfig>/)` e `expect(fonte).not.toContain('MotionConfig')` (linhas 24-28 da main). As 4 linhas da branch afirmam o oposto — recolocá-las **quebraria** o teste vigente.

### Conclusão
`veredito_final = INCORPORADA`, `apagar_branch_seguro = true`. Nada a resgatar.
