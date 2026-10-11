Especialista: worker (design) (design-system-zapp) — o pedido original era do especialista iris; o jev-entrada roteou este cartão ao designer (conf 0.75).

## O que mudou e por quê
- `src/components/ui/VolumeDial.tsx`: o arraste agora guarda o ângulo da amostra anterior e recusa a
  travessia da abertura inferior (o vão de 90° entre as duas pontas do arco) — o valor fica preso na ponta,
  sem saltar 100 ↔ 0. Novos helpers `posicaoNoArco`/`menorVarredura`/`cruzaVao`; `anguloAnterior` é zerado no
  pointerdown/up/cancel.
- `src/components/ui/VolumeDial.tsx`: tirei `transition-transform` do knob (não há mais transição CSS; o
  deslocamento é do framer-motion ou instantâneo com movimento reduzido) e o knob passou a ter a largura/altura
  calculadas de `size`.
- `src/components/ui/VolumeDial.tsx`: o knob e o número do centro agora são proporcionais ao prop `size`
  (14 px/24 px no padrão 96), o número via `--volume-dial-fonte` aplicado no `style` do dial e consumido pela
  classe real `text-[length:var(--volume-dial-fonte)]`; o knob via `width`/`height` inline.
- `src/components/ui/VolumeDial.tsx`: a segunda parada do `linearGradient` saiu de `--primary-glow` e passou a
  derivar do próprio `--primary` (`stopColor="hsl(var(--primary))"` com `stopOpacity={0.55}`), então acompanha as
  skins, que redefinem `--primary`.
- `src/components/ui/VolumeDial.tsx`: `porPonteiro` ignora o ponteiro a menos de 60% do raio do anel
  (`RAIO_MINIMO_ARRASTE`), então clicar no número do centro não muda o valor.
- `src/components/ui/__tests__/VolumeDial.test.tsx`: testes novos para cada um dos cinco pontos (dois de
  travessia do vão, um de centro ignorado, dois de tamanho proporcional, um de gradiente e um de knob sem
  transição com movimento reduzido) mais um de arraste com `setPointerCapture`.

## Prova
- vermelho antes (componente original, commit `cfb8e736f`): `npx vitest run src/components/ui/__tests__/VolumeDial.test.tsx`
  → `Tests 6 failed | 12 passed (18)`; falhas: "não salta de 100 para 0 ao cruzar a abertura inferior do arco",
  "não salta de 0 para 100 ao cruzar a abertura no sentido inverso", "ignora o pointerdown no centro (raio
  abaixo de 60% do raio do anel)", "no size padrão (96) mantém knob de 14px e número de 24px", "escala knob e
  número junto com o prop size (192 → 28px / 48px)" e "com movimento reduzido o knob não tem transição CSS e
  vai direto à posição".
- verde depois: `npx vitest run src/components/ui/__tests__/VolumeDial.test.tsx`
  → `Test Files 1 passed (1)` / `Tests 19 passed (19)`, 0 falhas e 0 pulados.
- `zapp-verify . --rapido` → `VERIFY: VERDE SEM BANCO (119s)` (os `tipos` passaram em 116s, `lint` 3s).
- CSS gerado (o tamanho proporcional chega ao elemento, não é classe órfã): `npx tailwindcss -i src/index.css -o ../tw-check.css`
  gerou `.text-\[length\:var\(--volume-dial-fonte\)\] { font-size: var(--volume-dial-fonte); }` (linha 10870 do
  CSS de saída).

## Pontos do revisor
- Ponto 1 (salto 100 ↔ 0 no vão): `cruzaVao` recusa a amostra que atravessa a abertura; travado na ponta nos dois
  sentidos. Testes "não salta de 100 para 0..." e "não salta de 0 para 100...".
- Ponto 2 (movimento reduzido deslizando): removi `transition-transform` do knob; com movimento reduzido o knob
  recebe `style.transform` direto. Teste "com movimento reduzido o knob não tem transição CSS e vai direto à
  posição".
- Ponto 3 (gradiente não segue as skins): as duas paradas usam `hsl(var(--primary))`, a segunda com
  `stopOpacity={0.55}`. Teste "deriva as duas paradas do próprio primary (acompanha as skins)".
- Ponto 4 (tamanho não proporcional): knob e font-size do centro calculados de `size`. Testes "no size padrão (96)
  mantém knob de 14px e número de 24px" e "escala knob e número junto com o prop size (192 → 28px / 48px)".
- Ponto 5 (pointerdown no centro mudava o valor): `RAIO_MINIMO_ARRASTE = 0.6` ignora o ponteiro perto do centro.
  Teste "ignora o pointerdown no centro (raio abaixo de 60% do raio do anel)".

## O que NÃO fiz e por quê
- Não medi cor/contraste no navegador: jsdom não calcula cor e não há projeto Playwright para este componente.
  O ponto 3 é provado pelo atributo real do `stop` no DOM renderizado e pelo CSS gerado, não por leitura do `.tsx`.
- A guarda de tipografia isolada (`node scripts/qa/medir-tipografia.cjs --check`) acusa dívida PRÉ-EXISTENTE na
  base: `tsxFontFamilyLiteral: 4 (teto 1)` em `src/components/email/EmailFullViewDialog.tsx:33` e
  `src/styles/__tests__/cp1FidelidadeCarvao.test.ts:279/280/284`, e `tsxFontSizeInline: 1 (teto 1)` em
  `src/components/catalog/catalogShared.tsx:140`. Nenhuma vem dos meus dois arquivos (contribuição 0); não os
  toquei.
- Não alterei lógica de volume, stores, persistência, migration, Edge Function nem dependências.
