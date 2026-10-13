Especialista: iris

Refazer 2 do ajuste da seta do botão "Entrar" e do gradiente do subtítulo. Entrega completa, sem ressalva e sem pendência: os 5 pontos da recusa estão respondidos no fim.

## O que mudou e por quê
- `src/pages/__tests__/Auth.botao-entrar.test.tsx` (novo): renderiza a página REAL `src/pages/Auth.tsx` e prova que o botão de envio tem `inline-flex items-center justify-center`, que o `<svg>` do ArrowRight é irmão direto do texto "Entrar" no MESMO contêiner (é o que mantém os dois na mesma linha) e que o `group-hover:translate-x-1` continua ligado ao botão. Era o teste que o cartão pedia e não existia.
- `src/components/auth/HeroBenefits.tsx`: só o gradiente do título. No tema escuro o início passa a `dark:from-tonal-700` (= `--primary-700`) e o `dark:to-` repete o fim. Motivo medido: o painel é transparente sobre o mapa e, com o início em `--primary`, o pior pixel do fundo real derrubava "atender" para 1,00:1 em 1280/escuro. O `dark:to-` é de propósito: a regra `dark:from-*` sobrescreve `--tw-gradient-to`, e sem repetir o fim o texto ficava TRANSPARENTE no escuro (vi isso no `backgroundImage` calculado pelo navegador; o teste guarda o par).
- `src/components/auth/__tests__/HeroBenefits.test.tsx`: comentário alinhado ao relato (diz os dois fundos e os números reais) e duas guardas novas: a classe é viva (`tonal-700` existe no `tailwind.config.ts` e aponta para `--primary-700`, definido em `tokens.css` — `from-primary-700`, que eu tinha escrito na 1ª tentativa, não existe e viraria classe morta, sem CSS) e o tema escuro declara as DUAS pontas.
- `e2e/auth.spec.ts`: devolvido à versão da base (o caso novo da rodada anterior estava fora da lista do cartão e o arquivo já tem testes vermelhos na base). A medição de geometria que ele fazia eu rodei à parte; os números estão no item (c).

## Prova (vermelho antes, verde depois)
Vermelho antes — mutação no arquivo de produção, com o arquivo restaurado logo depois (md5 conferido):
- `npx vitest run src/pages/__tests__/Auth.botao-entrar.test.tsx` com `inline-flex` fora da classe do RippleButton em `Auth.tsx` → `AssertionError: classe inline-flex no botão Entrar: expected [ Array(18) ] to include 'inline-flex'` → `Tests 1 failed | 2 passed (3)`
- `npx vitest run src/components/auth/__tests__/HeroBenefits.test.tsx` sem `dark:from-tonal-700` → `Tests 2 failed | 5 passed (7)`
- mesmo arquivo sem `dark:to-[hsl(var(--primary-text))]` → `Tests 1 failed | 6 passed (7)`
Verde depois — `npx vitest run src/pages/__tests__/Auth.botao-entrar.test.tsx src/components/auth/__tests__/HeroBenefits.test.tsx` → `Test Files 2 passed (2)`, `Tests 10 passed (10)`, 0 falhas e 0 pulados.

## Números medidos
(a) contra `--background` (`src/styles/tokens.css`, o que o teste do HeroBenefits confere): claro `--primary` 4,83:1 e `--primary-text` 8,75:1; escuro `--primary-700` 7,50:1 e `--primary-text` 9,50:1. As duas pontas usadas passam de 3:1 nos dois temas.

(b) contra o fundo REAL (mapa + véu), o ponto 3 da recusa. Medição minha, nesta tarefa, no Chromium 1248 do Playwright, às 05:40 de 13/10, comando `node .tmp/medir-final.mjs` sobre o `vite` local (porta 5311, banco local, sem login): escondi o texto com `visibility:hidden` e amostrei o pixel do fundo dentro da caixa do próprio título, comparando-o, coluna a coluna, com a cor do gradiente naquela coluna. Pior pixel da caixa:

| largura/tema | antes (`from-primary` → `to-secondary`) | depois (claro `from-primary` → `--primary-text`; escuro `from-tonal-700` → `--primary-text`) |
| --- | --- | --- |
| 360/claro | 2,64:1 | **3,98:1** |
| 768/claro | 2,82:1 | **3,83:1** |
| 1280/claro | 2,80:1 | **3,91:1** |
| 360/escuro | 1,32:1 | **7,56:1** |
| 768/escuro | 1,21:1 | **7,49:1** |
| 1280/escuro | 1,00:1 | **3,39:1** |

Pior caso depois: 3,39:1 (1280/escuro); claro entre 3,83:1 e 3,98:1. O critério de 3:1 nos dois temas está fechado nos dois fundos, e o relato diz qual fundo deu qual número.

(c) geometria do botão "Entrar", mesma medição, nas três larguras: a caixa do rótulo e a da seta se cruzam 16px na vertical (mesma linha), a seta é irmã imediata do rótulo, o par rótulo+seta fica a 0px do centro do botão e a rolagem horizontal é 0px em 360, 768 e 1280. Critério 1 fechado.

## Pontos do revisor
Ponto 1: o teste de Auth existe agora em `src/pages/__tests__/Auth.botao-entrar.test.tsx` (não em e2e) e prova classe e estrutura em jsdom: `inline-flex`/`items-center`/`justify-center` no botão e o `<svg>` como irmão do texto. Vermelho→verde acima.
Ponto 2: `e2e/auth.spec.ts` devolvido à base; nenhuma linha minha nele. A medição de geometria virou o item (c) deste relato.
Ponto 3: o comentário do `HeroBenefits.test.tsx` não fala mais em "1,33:1 no navegador real". Ele diz que a conta de tokens é contra `--background` e remete a este relato para o fundo real; o relato diz os dois, com o valor honesto de cada fundo — e mediu também o fundo real (mapa + véu) nos dois temas, item (b).
Ponto 4: a primeira linha deste relato é `Especialista: iris`.
Ponto 5: o cartão não pedia medir no navegador; a medição no Chromium entrou como evidência extra do fundo real, não como substituta. O caso do e2e era um `test()` e foi removido, não virou `it()`. O teste de Auth novo está citado acima com a prova vermelho→verde (removendo `inline-flex` da classe do RippleButton em `Auth.tsx`).

## Arquivos tocados
`src/components/auth/HeroBenefits.tsx` (1 linha), `src/components/auth/__tests__/HeroBenefits.test.tsx`, `src/pages/__tests__/Auth.botao-entrar.test.tsx` (novo), `e2e/auth.spec.ts` (devolvido à base), `.tmp/relato.md`. Nada além disso era necessário para os critérios: lógica de autenticação, banco, migration e Edge Function ficaram intactos, e o `RippleButton` compartilhado não foi tocado. As capturas da medição são minhas, geradas por `node .tmp/medir-final.mjs` (Playwright) neste workspace nesta tarefa, e não entraram no commit.
