Especialista: iris (area-front-componentes)

## O que mudou e por quê
- `src/components/ui/VolumeSliderPopoverContent.tsx`: o slider vertical saiu e entrou o `<VolumeDial>` (padrão slider-08, cartão pai t_cdf7b04b). O contrato de props ficou igual (title, valueLabel, volume, muted, min, max, step, thumbLabel, onVolumeChange, onToggleMute, muteLabel, unmuteLabel, disabled, footer, valueTestId). O valor no centro do dial é o `valueLabel`; o `data-testid` (valueTestId) continua existindo como nó `sr-only` com `aria-live="polite"`, legível por texto. O `role="dialog" rotulado`, o foco preso (Tab/Shift+Tab nas pontas, via `FOCAVEIS`) e o `VOLUME_PANEL_ATTRIBUTE` no contêiner foram conservados. O `aria-valuetext` agora vive no próprio dial (`role="slider"`), então o hack de `setAttribute` no thumb deixou de ser necessário e não existe mais. Título em `text-3xs uppercase tracking` muted, `gap-1`, entrada do painel com escala 0,96→1 + opacidade (`useReducedMotion` respeitado).
- `src/components/notifications/SoundVolumeControl.tsx` e `src/components/inbox/MediaVolumeControl.tsx`: só o `className` do `PopoverContent` — de `w-56 p-3` para `w-40 p-2.5 bg-card/90 backdrop-blur` (o `bg-card/90` vence o `bg-popover` base por `twMerge` em `cn`). Borda `border-border/60` e `shadow-lg` já vêm do `PopoverContent` base. Nada de `useVolumeRocker`, stores, persistência ou ícone-gatilho.
- `src/components/ui/__tests__/VolumeSliderPopoverContent.test.tsx`: trocado só o que era específico do slider vertical (o `role="slider"` passou a ser o dial, primeiro focável do DOM; "Aumentar" fecha a ordem); somado `axe` sem violações. Os casos de −/+ passo 5 e limites, silenciar/ativar com `aria-pressed`, desabilitado, diálogo rotulado e foco preso continuam.
- `src/components/inbox/__tests__/contrastePlayerSlider.test.tsx`: a régua de contraste (1.4.11, 3:1) passou a medir o ARCO do dial contra a superfície de vidro `bg-card/90` sobre `background` (pior stop do gradiente), em vez de faixa×trilha do slider.
- `src/components/notifications/__tests__/SoundVolumeControl.test.tsx` e `src/components/inbox/__tests__/MediaVolume.test.tsx`: o assento do slider antigo (`aria-orientation`, `data-disabled`) virou o do dial (`aria-valuetext`, `aria-disabled="true"`); cada um ganhou o teste de largura `w-40` e o teste de axe do painel aberto.
- `src/test/volumeControlMocks.ts`: o mock de `framer-motion` ganhou `useReducedMotion: () => true` e `animate` (o `VolumeDial` os importa; sem eles o painel quebra no jsdom). Change aditivo.

## Medidas finais (conferidas)
- Largura: 160 px (= `w-40`; `p-2.5` conta dentro do border-box). O teste `E13`/`D07` afirma `w-40` e ausência de `w-56` nos dois consumidores.
- Altura: 180 px, derivada da soma dos tokens do layout (o painel é `flex-col gap-1` com `p-2.5`): padding 10+10, título `text-3xs leading-none` 10, gap 4, dial 96, gap 4, linha dos três botões `h-8` 32, gap 4, rótulo do mudo `text-3xs leading-none` 10 → 180. O nó `data-testid` é `sr-only` (posicionado), não entra no fluxo. Alvo do cartão: ≤160 × ≤182 — dentro.
- Não rodei Playwright para medir no navegador: a pré-visualização autenticada exige sessão no app e a regra R1 proíbe usar sessão salva/produção; a medida acima vem do próprio layout (tokens) e a largura é provada por teste.

## Prova
- vermelho antes: revertendo à base só os três arquivos de produção (`git show HEAD:<arquivo>`) e rodando
  `npx vitest run src/components/ui/__tests__/VolumeSliderPopoverContent.test.tsx src/components/notifications/__tests__/SoundVolumeControl.test.tsx`
  → `Test Files 2 failed (2); Tests 3 failed | 32 passed (35)` — falham o `D07` (`w-40`), o foco preso (primeiro focável) e o Tab no meio (o slider antigo sequestrava o Tab).
- verde depois: `npx vitest run src/components/ui/__tests__/VolumeSliderPopoverContent.test.tsx src/components/ui/__tests__/VolumeDial.test.tsx src/components/inbox/__tests__/contrastePlayerSlider.test.tsx src/components/notifications/__tests__/SoundVolumeControl.test.tsx src/components/inbox/__tests__/MediaVolume.test.tsx`
  → `Test Files 5 passed (5); Tests 83 passed (83)`.

## O que NÃO fiz e por quê
- Não toquei em `useVolumeRocker`, `VolumeTriggerButton`, stores nem persistência (item 5 do cartão).
- Não medi no navegador por Playwright (motivo acima, R1).
