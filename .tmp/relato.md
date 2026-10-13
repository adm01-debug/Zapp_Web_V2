Especialista: iris

## O que mudou e por quê
- src/components/dashboard/overview/GreetingBanner.tsx: o chip de "Dias seguidos" deixa de mostrar o número cru e passa a mostrar o estado honesto — 0 vira "Comece hoje" (nenhum chip vazio com "0"), 1 vira "1 dia" (singular) e N vira "N dias" (plural). O chip ganhou `role="img"` com `aria-label`/`title` descritivo ("Dias seguidos: 3 dias" / "Dias seguidos: comece hoje"), então o nome acessível descreve o dado em vez de um número solto. Motivo: o cartão (par do PE-33, que passou a contar dias reais) pede que o chip seja fiel ao dado — "0" na tela parecia um chip vazio.
- src/components/dashboard/__tests__/GreetingBanner.test.tsx: acrescentei o caso do zero (mostra "Comece hoje", mantém os 3 chips, não existe texto "0") e uma tabela 1/7/45 cobrindo singular, plural e o nome acessível por `getByRole('img', { name })`. Os testes existentes não foram tocados.
- DEPENDÊNCIA do cartão: o pai (t_486741f4, sha 2e4cdb100) não era ancestral do meu workspace; trouxe a faixa inteira por `git cherry-pick` (a migration 20261013044500 do streak em dias reais + os commits de relato do pai), como o cartão manda. Nenhum conflito.

## Prova
- vermelho antes (só o teste novo, componente antigo): `npx vitest run src/components/dashboard/__tests__/GreetingBanner.test.tsx` → `4 failed` / `Unable to find an element with the text: 1 dia` (o chip ainda mostrava `7`/`0` cru).
- verde depois: `npx vitest run src/components/dashboard/__tests__/GreetingBanner.test.tsx` → `Test Files 1 passed (1); Tests 7 passed (7)`.
- sem regressão na vizinhança: `npx vitest run src/components/dashboard/__tests__` → `Test Files 32 passed (32); Tests 140 passed (140)`.
- verificação do cartão: `zapp-verify . --rapido` (linha de resultado no bloco FATOS MEDIDOS abaixo).

## Capturas (o cartão pediu)
- .tmp/captura-chip-claro.png e .tmp/captura-chip-escuro.png — geradas por `.tmp/captura-chip.mjs` (Playwright chromium), com a MESMA marcação/classes do chip copiadas de GreetingBanner.tsx e os tokens reais de `src/styles/tokens.css` (--dash-red, --dash-amber, --primary-glow). Não é a tela do app (sem Tailwind compilado) e não entra no commit: é o recorte do cluster nos estados streak=0, 1 e 7, no claro e no escuro. Ficam em .tmp/ (não versionadas); o comando para refazer é `node .tmp/captura-chip.mjs`.

## CRITÉRIO DE PRONTO
1. Chip fiel ao dado — GreetingBanner.tsx (bloco `streakText`/`streakLabel` + o `<span data-testid="gami-chip">`) provado pelo teste de 0/1/N e pelo nome acessível.
2. `zapp-verify . --rapido` verde — linha de resultado no bloco FATOS MEDIDOS.

## O que NÃO fiz e por quê
- Não mexi nos chips de XP e Conquistas (fora do escopo do título).
- Não criei projeto/tela nova de Playwright para um print do app inteiro: exigiria tocar playwright.config.ts e uma rota de dashboard com sessão falsa, fora dos arquivos do cartão. A captura saiu do recorte do chip, com origem declarada acima.
