Especialista: Íris (area-front-componentes)

## O que mudou e por quê
- `src/components/ui/VolumeDial.tsx` (novo): dial circular de volume, no padrão slider-08 — anel SVG com arco de 270° aberto na base (pathLength=270 + strokeDasharray, `transform=rotate(135 …)`), preenchido por gradiente dos tokens existentes (`--primary` → `--primary-glow`), knob em `transform` e número grande no centro em `tabular-nums`. Props do cartão: `value, min, max, step, disabled, muted, onChange, ariaLabel, valueLabel, size`.
- `src/components/ui/__tests__/VolumeDial.test.tsx` (novo): prova renderizando o componente REAL e disparando eventos reais de ponteiro/teclado/roda.

Comportamento provado:
- Ponteiro converte ângulo → valor (topo do anel = meio da faixa). Clicar no trilho salta para o valor; arrastar (pointer capture) acompanha.
- A abertura inferior do arco é limite: cruzar a base NÃO salta de 100 para 0 (o valor fica na ponta); mover o ponteiro para dentro da abertura mantém o valor.
- Teclado: setas ±1 passo, PageUp/PageDown ±5 passos, Home=mínimo, End=máximo, com limite nas pontas.
- Roda do mouse NÃO altera o volume (não há listener de roda).
- Estado `muted`: arco esmaecido, knob em tom neutro e centro mostra "Mudo"; `aria-valuetext="Mudo"`.
- Acessibilidade: `role="slider"`, nome acessível via `aria-label`, `aria-valuemin/max/now` com o valor real e `aria-valuetext="N por cento"`; foco visível (`focus-visible:ring-*`); `disabled` sai da ordem de tabulação e não reage a teclado/ponteiro.
- Movimento: só `transform`/`opacity`; com `useReducedMotion` o número troca direto (sem contagem) e o knob não anima. Sem movimento reduzido, o número conta até o novo valor com mola curta (`animate`).
- Alvo de toque: `size` padrão 96 px (>= 40 px), `touch-none` no elemento.

## Prova
- vermelho antes: `npx vitest run src/components/ui/__tests__/VolumeDial.test.tsx -t "não salta"` (com o guard da abertura trocado por clamp no código) → `FAIL … aria-valuenow="100" / Received: aria-valuenow="0"` (o valor saltava de 100 para 0 ao cruzar a base). Código restaurado em seguida.
- verde depois: `npx vitest run src/components/ui/__tests__/VolumeDial.test.tsx` → `Test Files 1 passed (1); Tests 12 passed (12)`.
- verificação: `zapp-verify . --rapido` → `VERIFY: VERDE SEM BANCO` (tipos, lint, db_guard e migrations OK). O cartão não toca banco, por isso o banco não foi verificado.

## O que NÃO fiz e por quê
- Não integrei o `VolumeDial` em nenhuma tela: o cartão pede só o componente (o consumidor é o cartão dependente `t_3102071a` da sidebar de volume, em produção V1/V3).
- Nenhuma migration, Edge Function, DDL, dependência nova ou export/import em massa: fora do escopo de front.
- Token/classe conferidos no projeto antes do uso (`tailwind.config.ts`: `ring`, `background`, `glow-primary`; `tokens.css`: `--ring`, `--primary-glow`, `--shadow-glow-primary`). Nenhum valor, teto ou escala foi alterado.
