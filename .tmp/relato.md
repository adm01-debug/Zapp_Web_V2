Especialista: worker (design) (design-system-zapp)

## O que mudou e por quê
- [refazer 1] Retomo o trabalho da branch `v2/login-v3-seta-contraste-2610111302ded9` sobre a ponta de `dia/2026-10-12`
  (o motivo da recusa foi só o conflito). Fiz `git cherry-pick` de cada commit e resolvi o que já existia na base:
  - `da6a58270` (painel esquerdo do login = `HeroBenefits.tsx` + seu teste) → entrou (a base ainda tinha o painel antigo).
  - `c5ceb2fca` (faixa de estatísticas / `SocialProof.tsx`) → virou VAZIO no cherry-pick: `dia/2026-10-12` já tem `SocialProof.tsx`
    idêntico (confirmado por `git diff c5ceb2fca:src/components/auth/SocialProof.tsx dia/2026-10-12:...` sem saída). Descartado.
  - `30bdb0ee1` (coluna do login) → já está em `dia/2026-10-12` (outra redação, mais nova). O conflito em `src/pages/Auth.tsx`
    foi resolvido preservando a base e o commit foi descartado; o teste dele (`Auth.coluna-v3.test.tsx`) aponta para a variante
    antiga (abas, h1 'ZAPP Web') que a base não tem mais, então não entra.
  - `585f89cdc` (teste "tela completa") → mesma razão: testa abas Entrar/Criar Conta, que a base removeu (cadastro público fora).
    Não entra, e `Auth.sem-cadastro.test.tsx` (na base) já cobre isso.
  - `d4d4d17c6` (as 2 correções do cartão) → entrou.
- `src/pages/Auth.tsx` (botão Entrar): o rótulo e a seta não ficavam na mesma linha (bloco `w-full` sem flex). Passei a classe do
  `RippleButton` a `inline-flex items-center justify-center` — a seta sobe para a linha do texto nos 3 tamanhos.
- `src/components/auth/HeroBenefits.tsx` (subtítulo "atender com excelência"): o gradiente terminava em `to-secondary`, que no
  tema escuro é `240 5% 16%` (quase preto) — o fim da palavra quase desaparecia. Passou a terminar em `to-[hsl(var(--primary-text))]`,
  token que já existe e inverte por tema (claro = escuro, escuro = claro). Uso só token do sistema; nenhuma cor nova.
- `src/components/auth/__tests__/HeroBenefits.test.tsx` (novo): lê as classes REAIS do componente, resolve os tokens de
  `src/styles/tokens.css` e mede a razão WCAG das duas pontas do gradiente nos 2 temas (não é string literal no teste).
- `e2e/auth.spec.ts` (novo teste): mede no Chromium a geometria do botão (sobreposição vertical seta×rótulo e centralização)
  em 360/768/1280, sem rolagem horizontal.

## Prova
- vermelho antes (gradiente): mutação `to-[hsl(var(--primary-text))]` → `to-secondary` em `HeroBenefits.tsx`;
  `npx vitest run src/components/auth/__tests__/HeroBenefits.test.tsx` →
  `Tests  2 failed | 4 passed (6)` (falha em "usa o par de tokens que muda com o tema, e não o --secondary"). Restaurei; verde abaixo.
- vermelho antes (seta): mutação removendo `inline-flex items-center justify-center` do `RippleButton` em `Auth.tsx`;
  `PLAYWRIGHT_BASE_URL=http://localhost:8081 npx playwright test --project=chromium e2e/auth.spec.ts -g "mesma linha"` →
  `1 failed` em `expect(sobreposicao, '[...] seta fora da linha do rótulo: ...').toBeGreaterThanOrEqual(4)`. Restaurei; verde abaixo.
- verde depois (unit): `npx vitest run src/components/auth/__tests__/HeroBenefits.test.tsx src/pages/__tests__/Auth.fundo-mapa.test.tsx src/pages/__tests__/Auth.sem-cadastro.test.tsx`
  → `Test Files  3 passed (3); Tests  15 passed (15)`.
- verde depois (módulo todo): `npx vitest run src/components/auth src/pages/__tests__` → `Test Files  23 passed (23); Tests  104 passed (104)`.
- verde depois (navegador real): `PLAYWRIGHT_BASE_URL=http://localhost:8081 npx playwright test --project=chromium e2e/auth.spec.ts -g "mesma linha"`
  → `1 passed (3.3s)` (projeto `chromium`: login deslogado, sem `setup`, sem segredo e sem sessão salva; Vite local `bun run dev`).
- verde depois (tipos): `bun run typecheck` → `tsc -b --force`, sem erro (exit 0).
- Medidas (razão WCAG do gradiente contra `--background`, calculada dos tokens reais):
  claro — from `--primary` 4,84:1 · to `--primary-text` 8,72:1 · (antes) `--secondary` 3,72:1;
  escuro — from `--primary` 3,70:1 · to `--primary-text` 9,47:1 · (antes) `--secondary` 1,29:1.
  O subtítulo é texto grande e em negrito (`text-xl`/`text-3xl bold`), então o mínimo AA é 3:1: a ponta que reprovava era o
  `--secondary` no escuro (1,29:1); agora a pior ponta é 3,70:1. Medição feita por mim, no workspace, lendo `src/styles/tokens.css`.

## Pontos do revisor (só em [refazer])
- Ponto 1 (conflito com a ponta de `dia/2026-10-12`): refeito por `git cherry-pick` commit a commit, preservando o que já
  entrou na base (painel/coluna/estatísticas) — detalhado acima; os 3 commits que já existiam na base viraram vazio/resolvidos
  para o lado da base e os 2 que faltavam entraram. Prova: `git log --oneline -3` = `4a3fae343` fix + `ca6fef3bb` painel + `96dd72dc5` (ponta da base).

## O que NÃO fiz e por quê
- Não trouxe `30bdb0ee1`/`585f89cdc`/`c5ceb2fca`: o conteúdo deles já está em `dia/2026-10-12` (ou em redação mais nova) —
  trazê-los reintroduziria a variante antiga (abas/Criar Conta/h1) que a base removeu de propósito.
- Não mexi em `icon.ts` nem guardei captura/PNG: não é o defeito deste cartão e imagem grande não entra no diff.
- Fora do escopo (só registro, não corrijo): `e2e/auth.spec.ts` já tinha 4 testes VERMELHOS na base, anteriores a este cartão
  (procuram as abas "Criar Conta"/cadastro, removidas em `687dc2749 feat(auth): remover cadastro publico`). Nada neste diff
  os toca; o teste NOVO (geometria da seta) passa. Também na base: aviso axe MODERATE `page-has-heading-one` no `/auth`
  (a tela não tem `h1`).
