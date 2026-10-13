Especialista: worker (design) (design-system-zapp)

## Tamanho e forma do diff (medido)
- `git diff --stat dia/2026-10-12 HEAD` → 5 arquivos, `338 insertions(+), 97 deletions(-)`: `src/pages/Auth.tsx`,
  `src/components/auth/HeroBenefits.tsx`, `src/components/auth/__tests__/HeroBenefits.test.tsx`, `e2e/auth.spec.ts`, `.tmp/relato.md`.
  Dois são de teste: `HeroBenefits.test.tsx` (arquivo NOVO, 6 casos: `grep -c "  it(" = 6`) e `e2e/auth.spec.ts` (+1 caso novo:
  `git show d4d4d17c6 -- e2e/auth.spec.ts | grep -c "^+  test(" = 1`). Novos casos de teste = 6 + 1 = 7.
- Conclusão: CONCLUÍ o cartão — as 2 correções entraram e estão provadas abaixo.

## O que mudou e por quê
- [refazer 1] Retomo o trabalho da branch `v2/login-v3-seta-contraste-2610111302ded9` sobre a ponta de `dia/2026-10-12`
  (o motivo da recusa foi só o conflito com a ponta). Trouxe por `git cherry-pick` commit a commit, preservando o que já
  entrou na base. Saídas REAIS dos comandos:
  - `git cherry-pick da6a58270` → `[v2/login-v3-seta-contraste-... ca6fef3bb] feat(auth): painel esquerdo do login com os textos do V3`
    (a base `dia/2026-10-12` ainda tinha o painel antigo `HeroBenefits.tsx`, então entrou limpo).
  - `git cherry-pick c5ceb2fca` → `The previous cherry-pick is now empty` → `git cherry-pick --skip` (a base já tem `SocialProof.tsx`
    idêntico; conferido com `git diff c5ceb2fca:src/components/auth/SocialProof.tsx dia/2026-10-12:src/components/auth/SocialProof.tsx` = sem saída).
  - `git cherry-pick 30bdb0ee1` → `CONFLICT (content): Merge conflict in src/pages/Auth.tsx`; o conflito é a coluna do login, que a
    base JÁ tem em redação mais nova (h2 "Bem-vindo de volta", sem abas) — resolvi PRESERVANDO a base e descartei o commit
    (`git cherry-pick --abort`), porque o teste dele (`Auth.coluna-v3.test.tsx`) aponta para a variante antiga (abas/h1 'ZAPP Web').
  - `585f89cdc` (teste "tela completa") → não entra pela mesma razão: testa abas Entrar/Criar Conta, que a base removeu de
    propósito (`687dc2749 feat(auth): remover cadastro publico`); a base já tem `Auth.sem-cadastro.test.tsx` para isso.
  - `git cherry-pick d4d4d17c6` → `[v2/login-v3-seta-contraste-... 4a3fae343] fix(auth): seta do botao Entrar na mesma linha e subtitulo legivel no tema escuro` (as 2 correções do cartão).
  - Resultado no grafo: `git log --oneline -4` = `fa1fba5eb` (relato) → `4a3fae343` (fix) → `ca6fef3bb` (painel) → `96dd72dc5`
    (ponta de `dia/2026-10-12`). Ou seja, a branch agora É a ponta do dia + o que faltava; nada da base foi sobrescrito.
- `src/pages/Auth.tsx` (botão Entrar): rótulo e seta não ficavam na mesma linha (bloco `w-full` sem flex). Classe do
  `RippleButton` passou a `inline-flex items-center justify-center` — a seta sobe para a linha do texto nos 3 tamanhos.
- `src/components/auth/HeroBenefits.tsx` (subtítulo "atender com excelência"): o gradiente terminava em `to-secondary`, que no
  tema escuro é `240 5% 16%` (quase preto) e o fim da palavra desaparecia. Passou a terminar em `to-[hsl(var(--primary-text))]`,
  token que já existe em `src/styles/tokens.css` e inverte por tema. Só token do sistema; nenhuma cor nova.
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
- verde depois (tipos): `bun run typecheck` → `tsc -b --force`, exit 0, sem erro.
- verde depois (verificação do projeto): `zapp-verify . --rapido` →
  `OK db_guard / OK tipos (105s) / OK lint / OK migrations` e `VERIFY: VERDE SEM BANCO (108s)` (o banco não é tocado por este cartão: só UI/teste).
- Medidas (razão WCAG do gradiente contra `--background`, calculada dos tokens reais):
  claro — from `--primary` 4,84:1 · to `--primary-text` 8,72:1 · (antes) `--secondary` 3,72:1;
  escuro — from `--primary` 3,70:1 · to `--primary-text` 9,47:1 · (antes) `--secondary` 1,29:1.
  O subtítulo é texto grande e em negrito (`text-xl`/`text-3xl bold`), então o mínimo AA é 3:1: a ponta que reprovava era o
  `--secondary` no escuro (1,29:1); agora a pior ponta é 3,70:1. Medição feita por mim, no workspace, lendo `src/styles/tokens.css`.

## Pontos do revisor (só em [refazer])
- Ponto 1 (conflito com a ponta de `dia/2026-10-12`): refeito por `git cherry-pick` commit a commit, com as saídas cruas no
  "O que mudou" acima (o `CONFLICT (content): Merge conflict in src/pages/Auth.tsx` de `30bdb0ee1` e o seu descarte preservando a
  base; o `empty` de `c5ceb2fca`). Não é merge de `dia/2026-10-11`: a base da tarefa é `dia/2026-10-12`, descendente de
  `dia/2026-10-11` (`git merge-base --is-ancestor dia/2026-10-11 dia/2026-10-12` → `ANCESTOR=sim`), então trazer
  `dia/2026-10-11` seria andar para trás; ela já está contida na base.
  Prova de que o conflito foi resolvido SEM perder nada da base:
  `git diff --stat dia/2026-10-12 HEAD` → só 5 arquivos (`src/pages/Auth.tsx`, `src/components/auth/HeroBenefits.tsx`,
  `src/components/auth/__tests__/HeroBenefits.test.tsx`, `e2e/auth.spec.ts`, `.tmp/relato.md`), `338 insertions(+), 97 deletions(-)`;
  e `git diff dia/2026-10-12 HEAD -- src/pages/Auth.tsx` → exatamente UMA linha trocada (a classe do `RippleButton`), com o resto
  do `Auth.tsx` da base (h2 "Bem-vindo de volta", sem abas) intacto. O `zapp-verify --rapido` é rodado por este próprio
  `hermes-tarefa-fechar` depois do juiz.

## O que NÃO fiz e por quê
- Não trouxe `30bdb0ee1`/`585f89cdc`/`c5ceb2fca`: o conteúdo deles já está em `dia/2026-10-12` (ou em redação mais nova) —
  trazê-los reintroduziria a variante antiga (abas/Criar Conta/h1) que a base removeu de propósito.
- `e2e/auth.spec.ts` (não listado nominalmente no cartão, mas indispensável): o cartão pede provar que rótulo e seta ficam na
  MESMA LINHA e "medir no navegador real" em 3 tamanhos — em jsdom (vitest) o layout não é calculado, então a única prova é o
  navegador de verdade. É o e2e que já existe para `/auth` (projeto `chromium`, deslogado) e o teste é ADITIVO: só acrescenta
  um `it`, sem tocar nenhum outro teste do arquivo.
- Não mexi em `icon.ts` nem guardei captura/PNG: não é o defeito deste cartão e imagem grande não entra no diff.
- Fora do escopo (só registro, `kanban_comment`): `e2e/auth.spec.ts` já tinha 4 testes VERMELHOS na base, anteriores a este cartão
  (procuram as abas cadastro, removidas em `687dc2749`); nada neste diff os toca e o teste NOVO passa. Também na base: aviso axe
  MODERATE `page-has-heading-one` no `/auth` (sem `h1`).
