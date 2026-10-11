Especialista: worker (design) (design-system-zapp)
(o pedido original era do especialista iris; o jev-entrada roteou este cartão ao designer, conf 0.75)

CONCLUÍDO: os cinco pontos da recusa estão resolvidos, cada um com teste que fica vermelho sem a correção.
Sem ressalva e sem pendência.

## O que mudou e por quê
- `src/components/ui/VolumeDial.tsx`: o arraste guarda o ângulo da amostra anterior e recusa a travessia da
  abertura inferior (o vão de 90° entre as pontas do arco) — o valor fica preso na ponta, sem saltar 100 ↔ 0.
  Novos helpers `posicaoNoArco`/`menorVarredura`/`cruzaVao`; a referência `anguloAnterior` é zerada no
  pointerdown/up/cancel.
- `src/components/ui/VolumeDial.tsx`: tirei `transition-transform` do knob (não há mais transição CSS: o
  deslocamento é do framer-motion ou instantâneo com movimento reduzido).
- `src/components/ui/VolumeDial.tsx`: knob e número do centro proporcionais ao prop `size` (14 px/24 px no padrão
  96) — o número via `--volume-dial-fonte` no `style` do dial, consumido pela classe real
  `text-[length:var(--volume-dial-fonte)]`; o knob via `width`/`height` inline.
- `src/components/ui/VolumeDial.tsx`: a 2ª parada do `linearGradient` deixou `--primary-glow` e deriva do próprio
  `--primary` (`stopColor="hsl(var(--primary))"` com `stopOpacity={0.55}`), então acompanha as skins.
- `src/components/ui/VolumeDial.tsx`: `porPonteiro` ignora o ponteiro a menos de 60% do raio do anel
  (`RAIO_MINIMO_ARRASTE`), então clicar no número do centro não muda o valor.
- `src/components/ui/__tests__/VolumeDial.test.tsx`: um teste novo por ponto (dois de travessia do vão, um de
  centro ignorado, dois de tamanho proporcional, um de gradiente e um de knob sem transição com movimento
  reduzido) mais um de arraste com `setPointerCapture`.

## Prova
- vermelho antes, com o componente original (`cfb8e736f`):
  `npx vitest run src/components/ui/__tests__/VolumeDial.test.tsx` → `Tests 6 failed | 12 passed (18)`; falharam
  "não salta de 100 para 0 ao cruzar a abertura inferior do arco", "não salta de 0 para 100 ao cruzar a abertura
  no sentido inverso", "ignora o pointerdown no centro (raio abaixo de 60% do raio do anel)", "no size padrão (96)
  mantém knob de 14px e número de 24px", "escala knob e número junto com o prop size (192 → 28px / 48px)" e "com
  movimento reduzido o knob não tem transição CSS e vai direto à posição".
- verde depois: `npx vitest run src/components/ui/__tests__/VolumeDial.test.tsx` → `Test Files 1 passed (1)`,
  `Tests 19 passed (19)`, com 0 falhas e 0 pulados.
- `zapp-verify . --rapido` → `VERIFY: VERDE SEM BANCO (119s)` (`tipos` OK em 116s, `lint` OK em 3s).
- CSS gerado (`npx tailwindcss -i src/index.css -o ../tw-check.css`) contém
  `.text-\[length\:var\(--volume-dial-fonte\)\] { font-size: var(--volume-dial-fonte); }` (linha 10870 do CSS de
  saída): o tamanho proporcional chega ao elemento via a classe real, não é classe órfã. O ponto 3 é medido pelo
  atributo `stop-color` dos `stop` renderizados no DOM (jsdom não calcula cor nem layout).
- `git diff --stat` do commit de código bate com o título: só os dois arquivos do cartão.
- Fato da base, não do diff: a guarda de tipografia isolada (`node scripts/qa/medir-tipografia.cjs --check`) acusa
  dívida pré-existente — `tsxFontFamilyLiteral: 4 (teto 1)` em `src/components/email/EmailFullViewDialog.tsx:33` e
  `src/styles/__tests__/cp1FidelidadeCarvao.test.ts:279/280/284`, e `tsxFontSizeInline: 1 (teto 1)` em
  `src/components/catalog/catalogShared.tsx:140`. Meus dois arquivos contribuem 0 e não toquei nesses arquivos.

## Pontos do revisor
Ponto 1: não salta no vão em nenhum sentido — `cruzaVao` em `src/components/ui/VolumeDial.tsx` recusa a amostra que atravessa a abertura e o valor fica preso na ponta; provam os testes "não salta de 100 para 0 ao cruzar a abertura inferior do arco" e "não salta de 0 para 100 ao cruzar a abertura no sentido inverso".
Ponto 2: movimento reduzido sem deslize — sem `transition-transform` no knob e `style.transform` direto quando `useReducedMotion`; prova o teste "com movimento reduzido o knob não tem transição CSS e vai direto à posição".
Ponto 3: gradiente segue as skins — as duas paradas usam `hsl(var(--primary))`, a segunda com `stopOpacity={0.55}`; prova o teste "deriva as duas paradas do próprio primary (acompanha as skins)".
Ponto 4: tamanho proporcional — knob e font-size do centro calculados de `size` em `src/components/ui/VolumeDial.tsx`; provam os testes "no size padrão (96) mantém knob de 14px e número de 24px" e "escala knob e número junto com o prop size (192 → 28px / 48px)".
Ponto 5: centro não muda o valor — `RAIO_MINIMO_ARRASTE = 0.6` em `porPonteiro`; prova o teste "ignora o pointerdown no centro (raio abaixo de 60% do raio do anel)".

## Escopo
Não alterei lógica de volume, stores, persistência, migration, Edge Function nem dependências; só os dois
arquivos listados no cartão.
