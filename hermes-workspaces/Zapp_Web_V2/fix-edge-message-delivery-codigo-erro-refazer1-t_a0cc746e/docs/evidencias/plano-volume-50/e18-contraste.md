# E18 — Laudo de contraste do controle de volume de MÍDIA

**Data:** 2026-10-01 · **Escopo:** E18 do `docs/plans/PLANO_VOLUME_MIDIA_50_ETAPAS_2026-09-27.md`
**Superfícies:** `MediaVolumeControl.tsx` (bubble/overlay/sidebar), `MediaVolumeToggle.tsx`,
rótulo/percentual do popover, tooltip. Rótulos de `src/lib/volumeLabels.ts`.
**Critério pedido:** razão WCAG 2.1 ≥ 4.5:1. **Nada foi editado no repo** (workspace somente leitura).

## Método

1. Tokens reais lidos de `src/styles/tokens.css` (`:root` ll.104-143, `.dark` ll.339-429) e
   `src/styles/accessibility.css` (`.high-contrast` ll.4-25, `.dark.high-contrast` ll.27-48).
   Mapeamento Tailwind→var confirmado em `tailwind.config.ts` ll.53-158.
2. **Medição real, não só estática:** compilei o CSS de verdade
   (`npx tailwindcss -c tailwind.config.ts -i src/index.css`), montei o DOM com as strings de
   classe reais dos componentes e li `getComputedStyle` no **Chromium 1243 via Playwright 1.63**.
3. O fundo de cada elemento é a **cadeia real de `background-color` até o 1º opaco**, lida do DOM —
   é assim que `bg-muted/50` é composto (alfa sRGB), sem eu escolher o fundo "na mão".
4. `--primary` etc. foram aplicados **inline em `<html>`, como o app faz** (`applyThemePreset`,
   `presets.ts:681`, preset default `corporate` — `ThemeInitializer.tsx:20`).
5. Transições desligadas no probe (`transition:none`) — sem isso o Chromium devolve cor
   **no meio da transição** (`transition-colors` nos botões) e os números saem errados. Foi
   exatamente o que aconteceu na 1ª passada e o motivo de eu ter refeito.

Limiar: 4.5:1 para texto (1.4.3) e **3:1 para ícones/indicadores** (1.4.11). O E18 pede 4.5 para
tudo — reporto os dois, porque só `Volume` / `70%` / `Mudo` são texto.

## Fontes de cada token (arquivo:linha — conferidas no working tree às 10:26)

| token | valor claro | valor escuro | declarado HC (não efetivo) |
|---|---|---|---|
| `--primary` | `221 83% 53%` tokens.css:119 | `221 83% 53%` tokens.css:378 | `258 100% 45%` acc.css:11 / `258 100% 65%` acc.css:34 |
| `--primary-foreground` | `0 0% 100%` tokens.css:120 | `0 0% 100%` tokens.css:379 | `0 0% 100%`/`0 0% 0%` acc.css:12,35 |
| `--secondary` | `215 70% 55%` tokens.css:124 | `240 5% 16%` tokens.css:381 | `0 0% 20%`/`0 0% 80%` acc.css:13,36 |
| `--secondary-foreground` | `210 40% 92%` tokens.css:125 | `0 0% 100%` tokens.css:382 | acc.css:14,37 |
| `--muted` | `221 15% 92%` tokens.css:128 | `240 4% 18%` tokens.css:383 | `0 0% 90%`/`0 0% 15%` acc.css:15,38 |
| `--muted-foreground` | `221 10% 45%` tokens.css:129 | `215 20% 75%` tokens.css:384 | acc.css:16,39 |
| `--popover` / `-foreground` | tokens.css:110-111 | tokens.css:375-376 | acc.css:9-10,32-33 |
| `--background` | `221 20% 97%` tokens.css:105 | `240 6% 6%` tokens.css:340 | acc.css:5,28 |
| `--sidebar-background` | `0 0% 100%` tokens.css:178 | `240 6% 5%` tokens.css:416 | **não declarado** (herda) |

Classes: `MediaVolumeControl.tsx:99` (bubble) · `:100` (overlay) · `:101` (sidebar) · `:102`
(`opacity-50`) · `:103` (`text-primary`) · `:146`/`:157-159` (chevron/popover, `ChevronUp`+título)
· `VolumeTriggerButton.tsx:51` (base), `:59` (`bg-primary ring-2 ring-background` do ponto)
· `VolumeSliderPopoverContent.tsx:49` (título), `:52` (percentual), `:75` (variant do botão)
· `popover.tsx:22` (`bg-popover text-popover-foreground`) · `button.tsx:13` (default),
`:15` (outline `bg-background`) · `slider.tsx:40` (trilha), `:41` (range), `:47` (thumb)
· `tooltip.tsx:17` · `Sidebar.tsx:81` (`bg-sidebar`), `:211` (`bg-muted/50`), `:224`
· `AudioMessagePlayer.tsx:113` (`bg-primary-foreground/10` | `bg-muted/50`), `:146` (cor do ícone)
· `MessageBubble.tsx:148` (`bg-primary`), `:153` (`bg-muted`) · `VideoFullscreen.tsx:61`, `:67`

> ⚠️ Enquanto eu media, outro passo do plano (E16 — refs de teclado) alterou
> `MediaVolumeControl.tsx`, `AudioMessagePlayer.tsx`, `VideoFullscreen.tsx` (10:23). As linhas
> acima já são as **atuais**; nenhuma classe de cor foi tocada (`git diff` só adiciona `playerRef`).

## Scripts (fora do repo fonte; em `.tmp/` do workspace, que o guard designa)

`e18_probe.cjs` + `e18_probe.html` (coleta), `presets.cjs` (esbuild do preset real),
`e18_ratio.py` (compõe alfa e calcula WCAG), `e18_fix.py` (candidatos de correção).

---

## Saída crua de `e18_ratio.py`

```
======================================================================================================================
E18 CONTRASTE WCAG 2.1 - CONTROLE DE VOLUME DE MIDIA - cores COMPUTADAS no Chromium
Fonte: .tmp/e18_probe.json (Playwright 1.63/Chromium 1243 + tailwind.config.ts + preset 'corporate')
Composicao alfa em sRGB; fundo = cadeia real de background-color ate o 1o opaco (medida no DOM)
======================================================================================================================

### claro   <html class=''>   --primary inline=221 83% 53%
elemento / par             fg        bg           razao  >=4.5?
----------------------------------------------------------------------------------------------------------------------
sidebar icone ATIVO        #2463EB   #F4F4F6      4.71:1  OK   [--primary | --muted/50 sobre --sidebar-background]
sidebar icone MUDO         #676F7E   #F4F4F6      4.60:1  OK   [--muted-foreground | --muted/50 sobre --sidebar-background]
tooltip do sidebar         #181C25   #FFFFFF     17.05:1  OK   [--popover-foreground | --popover]
overlay (fullscreen)       #E2EBF3   #3C7FDD      3.30:1  FALHA   [--secondary-foreground | --secondary]
bubble RECEBIDA icone      #676F7E   #E8E9EE      4.17:1  FALHA   [--muted-foreground | --muted/50 sobre --muted (balao)]
bubble ENVIADA icone       #C4D5FA   #3A73ED      2.94:1  FALHA   [--primary-foreground/70 | --primary-foreground/10 sobre --primary]
popover titulo 'Volume'    #676F7E   #FFFFFF      5.06:1  OK   [--muted-foreground | --popover]
popover percentual         #181C25   #FFFFFF     17.05:1  OK   [--popover-foreground | --popover]
popover rodape/aviso       #676F7E   #FFFFFF      5.06:1  OK   [--muted-foreground | --popover]
popover botao MUDO         #FFFFFF   #2463EB      5.17:1  OK   [--primary-foreground | --primary]
popover botao 'Mudo'       #181C25   #F6F7F9     15.91:1  OK   [--popover-foreground | --background]

### escuro   <html class='dark'>   --primary inline=221 83% 53%
elemento / par             fg        bg           razao  >=4.5?
----------------------------------------------------------------------------------------------------------------------
sidebar icone ATIVO        #2463EB   #1C1C1F      3.29:1  FALHA   [--primary | --muted/50 sobre --sidebar-background]
sidebar icone MUDO         #B3BDCC   #1C1C1F      8.96:1  OK   [--muted-foreground | --muted/50 sobre --sidebar-background]
tooltip do sidebar         #F8FAFC   #18181B     16.93:1  OK   [--popover-foreground | --popover]
overlay (fullscreen)       #FFFFFF   #27272B     14.88:1  OK   [--secondary-foreground | --secondary]
bubble RECEBIDA icone      #B3BDCC   #2C2C30      7.33:1  OK   [--muted-foreground | --muted/50 sobre --muted (balao)]
bubble ENVIADA icone       #C4D5FA   #3A73ED      2.94:1  FALHA   [--primary-foreground/70 | --primary-foreground/10 sobre --primary]
popover titulo 'Volume'    #B3BDCC   #18181B      9.34:1  OK   [--muted-foreground | --popover]
popover percentual         #F8FAFC   #18181B     16.93:1  OK   [--popover-foreground | --popover]
popover rodape/aviso       #B3BDCC   #18181B      9.34:1  OK   [--muted-foreground | --popover]
popover botao MUDO         #FFFFFF   #2463EB      5.17:1  OK   [--primary-foreground | --primary]
popover botao 'Mudo'       #F8FAFC   #0E0E10     18.43:1  OK   [--popover-foreground | --background]

### alto-contraste   <html class='high-contrast'>   --primary inline=221 83% 53%
elemento / par             fg        bg           razao  >=4.5?
----------------------------------------------------------------------------------------------------------------------
sidebar icone ATIVO        #2463EB   #F4F4F6      4.71:1  OK   [--primary | --muted/50 sobre --sidebar-background]
sidebar icone MUDO         #676F7E   #F4F4F6      4.60:1  OK   [--muted-foreground | --muted/50 sobre --sidebar-background]
tooltip do sidebar         #181C25   #FFFFFF     17.05:1  OK   [--popover-foreground | --popover]
overlay (fullscreen)       #E2EBF3   #3C7FDD      3.30:1  FALHA   [--secondary-foreground | --secondary]
bubble RECEBIDA icone      #676F7E   #E8E9EE      4.17:1  FALHA   [--muted-foreground | --muted/50 sobre --muted (balao)]
bubble ENVIADA icone       #C4D5FA   #3A73ED      2.94:1  FALHA   [--primary-foreground/70 | --primary-foreground/10 sobre --primary]
popover titulo 'Volume'    #676F7E   #FFFFFF      5.06:1  OK   [--muted-foreground | --popover]
popover percentual         #181C25   #FFFFFF     17.05:1  OK   [--popover-foreground | --popover]
popover rodape/aviso       #676F7E   #FFFFFF      5.06:1  OK   [--muted-foreground | --popover]
popover botao MUDO         #FFFFFF   #2463EB      5.17:1  OK   [--primary-foreground | --primary]
popover botao 'Mudo'       #181C25   #F6F7F9     15.91:1  OK   [--popover-foreground | --background]

### alto-contraste+escuro   <html class='dark high-contrast'>   --primary inline=221 83% 53%
elemento / par             fg        bg           razao  >=4.5?
----------------------------------------------------------------------------------------------------------------------
sidebar icone ATIVO        #2463EB   #1C1C1F      3.29:1  FALHA   [--primary | --muted/50 sobre --sidebar-background]
sidebar icone MUDO         #B3BDCC   #1C1C1F      8.96:1  OK   [--muted-foreground | --muted/50 sobre --sidebar-background]
tooltip do sidebar         #F8FAFC   #18181B     16.93:1  OK   [--popover-foreground | --popover]
overlay (fullscreen)       #FFFFFF   #27272B     14.88:1  OK   [--secondary-foreground | --secondary]
bubble RECEBIDA icone      #B3BDCC   #2C2C30      7.33:1  OK   [--muted-foreground | --muted/50 sobre --muted (balao)]
bubble ENVIADA icone       #C4D5FA   #3A73ED      2.94:1  FALHA   [--primary-foreground/70 | --primary-foreground/10 sobre --primary]
popover titulo 'Volume'    #B3BDCC   #18181B      9.34:1  OK   [--muted-foreground | --popover]
popover percentual         #F8FAFC   #18181B     16.93:1  OK   [--popover-foreground | --popover]
popover rodape/aviso       #B3BDCC   #18181B      9.34:1  OK   [--muted-foreground | --popover]
popover botao MUDO         #FFFFFF   #2463EB      5.17:1  OK   [--primary-foreground | --primary]
popover botao 'Mudo'       #F8FAFC   #0E0E10     18.43:1  OK   [--popover-foreground | --background]

======================================================================================================================
NAO-TEXTO (WCAG 1.4.11 - limiar 3:1)
======================================================================================================================
[claro                 ] range --primary vs trilha --secondary: 1.30:1 FALHA | ponto 'volume baixo' --primary vs --sidebar-background: 5.17:1 OK
[escuro                ] range --primary vs trilha --secondary: 2.88:1 FALHA | ponto 'volume baixo' --primary vs --sidebar-background: 3.78:1 OK
[alto-contraste        ] range --primary vs trilha --secondary: 1.30:1 FALHA | ponto 'volume baixo' --primary vs --sidebar-background: 5.17:1 OK
[alto-contraste+escuro ] range --primary vs trilha --secondary: 2.88:1 FALHA | ponto 'volume baixo' --primary vs --sidebar-background: 3.78:1 OK
[HC-sem-preset-inline  ] range --primary vs trilha --secondary: 1.44:1 FALHA | ponto 'volume baixo' --primary vs --sidebar-background: 8.77:1 OK
[HCescuro-sem-preset   ] range --primary vs trilha --secondary: 2.94:1 FALHA | ponto 'volume baixo' --primary vs --sidebar-background: 4.15:1 OK

======================================================================================================================
CONTROLE: tema ALTO-CONTRASTE DECLARADO em accessibility.css SEM o preset inline
(prova de que applyThemePreset/presets.ts:681 sombreia .high-contrast em runtime)
======================================================================================================================

### HC-sem-preset-inline  <html class='high-contrast'>  --primary inline=258 100% 45%
   sidebar icone ATIVO        #4500E6   #F2F2F2      7.86:1  OK
   sidebar icone MUDO         #333333   #F2F2F2     11.34:1  OK
   tooltip do sidebar         #000000   #FFFFFF     21.00:1  OK
   overlay (fullscreen)       #FFFFFF   #333333     12.63:1  OK
   bubble RECEBIDA icone      #333333   #E6E6E6     10.12:1  OK
   bubble ENVIADA icone       #CDBAF8   #581AE8      4.40:1  FALHA
   popover titulo 'Volume'    #333333   #FFFFFF     12.63:1  OK
   popover percentual         #000000   #FFFFFF     21.00:1  OK
   popover rodape/aviso       #333333   #FFFFFF     12.63:1  OK
   popover botao MUDO         #FFFFFF   #4500E6      8.77:1  OK
   popover botao 'Mudo'       #000000   #FFFFFF     21.00:1  OK

### HCescuro-sem-preset  <html class='dark high-contrast'>  --primary inline=258 100% 65%
   sidebar icone ATIVO        #824DFF   #19191A      3.73:1  FALHA
   sidebar icone MUDO         #CCCCCC   #19191A     10.94:1  OK
   tooltip do sidebar         #FFFFFF   #0D0D0D     19.44:1  OK
   overlay (fullscreen)       #000000   #CCCCCC     13.08:1  OK
   bubble RECEBIDA icone      #CCCCCC   #262626      9.42:1  OK
   bubble ENVIADA icone       #231545   #7545E6      2.97:1  FALHA
   popover titulo 'Volume'    #CCCCCC   #0D0D0D     12.10:1  OK
   popover percentual         #FFFFFF   #0D0D0D     19.44:1  OK
   popover rodape/aviso       #CCCCCC   #0D0D0D     12.10:1  OK
   popover botao MUDO         #000000   #824DFF      4.45:1  FALHA
   popover botao 'Mudo'       #FFFFFF   #000000     21.00:1  OK
```

## Candidatos de correção (medidos, `e18_fix.py`) — **não aplicados**

```
A) balao ENVIADO: text-primary-foreground (100%) em vez de /70 -> #FFFFFF sobre #3A72ED = 4.36:1   (hoje /70 = 2.95:1)
B) overlay claro: --secondary-foreground 210 40% 92% -> 0 0% 100% sobre --secondary #3C7FDD = 3.99:1
C) sidebar ESCURO icone ativo: --primary 221 83% 53% (3.27:1) -> precisa L>=61.5% (221 83% 62% = #4B7FEE, 4.51:1)
D) bubble RECEBIDA claro: --muted-foreground 221 10% 45% (4.20:1) -> precisa L<=30.0% (221 10% 30% = #454A54, 7.38:1)
E) HC-escuro botao MUDO: --primary 258 100% 65% c/ --primary-foreground preto = 4.44:1 -> precisa L>=65.5% (258 100% 66% = #844FFF, 4.54:1)
F) overlay CLARO: branco sobre --secondary 215 70% 55% = 3.99:1 -> precisa --secondary L<=51.5% (215 70% 52% = #2D75DA, 4.51:1)
G) balao ENVIADO: nenhum alfa de branco passa; sem o overlay --primary-foreground/10 -> branco sobre --primary #2463EB = 5.20:1
   alfa 1.0 sobre #3A72ED = 4.36:1 ; --primary precisaria L<=56.5% p/ branco passar COM o overlay
```

## Conclusão

- **Defeito estrutural (bloqueia o E18 como escrito):** o `.high-contrast` **não chega** ao controle
  de volume. `applyThemePreset` (`presets.ts:681`) grava `--primary/--muted/--secondary/--popover/
  --foreground/--background/--border/--input` **inline em `<html>`**, e estilo inline vence
  `.high-contrast` / `.dark.high-contrast` (mesmo elemento). Medido: com o toggle ligado,
  `getComputedStyle(--primary)` = `221 83% 53%` (preset corporate), não `258 100% 45%`.
  Por isso a coluna "alto-contraste" é **numericamente idêntica** à do claro.
- **4 pares distintos reprovam 4.5:1**: overlay claro 3.30:1 · ícone do balão recebido no claro
  4.17:1 · **ícone do balão enviado 2.94:1 em todos os temas** · ícone ativo da sidebar no escuro
  3.29:1. Somando o HC *declarado*: + ícone ativo no HC-escuro 3.73:1 e botão "Mudo" 4.45:1.
- **Só o balão enviado reprova até o limiar de ícone (1.4.11, 3:1).**
- O par range `--primary` vs trilha `--secondary` do slider reprova 3:1 nos 4 estados.
- Nenhum par de **texto** do popover reprova.

## O que NÃO deu para medir (e por quê)

1. **`--contrast-multiplier` ≠ 100%** (`accessibility.css:54`, slider de 75–150% em
   `HighContrastToggle.tsx:186`). É um `filter: contrast()` — pós-processa o pixel, não a cor
   computada. Medi com 100% (identidade). Os valores com 75–150% só sairiam de screenshot + amostra
   de pixel; não fiz.
2. **`disabled:opacity-50`** (`MediaVolumeControl.tsx:102`, `slider.tsx:47`): WCAG 1.4.3/1.4.11
   isentam controle inativo, então não avaliei. Se contasse: ícone ativo da sidebar claro cairia de
   4.71:1 para ≈2.4:1 e o do escuro de 3.29:1 para ≈1.8:1.
3. **Presets ≠ `corporate`** (`presets.ts:553-572`, 16 presets): todos gravam `--primary`,
   `--muted-foreground`, `--secondary` inline, então mudam o resultado. Só medi o default.
4. **Preset `diversity`** (`diversity-overrides.css:25,88`): troca `bg-primary` e `[role=slider]`
   por gradiente — a amostra de 1 pixel não representa o gradiente.
5. **Estados hover/focus** (`hover:bg-muted`, `hover:text-foreground`, `hover:bg-secondary/80`,
   `bg-foreground/10`, `ring-primary/50`): medi só o repouso.
6. **Espessura/tamanho do ícone (14–16px) e antialiasing**: não afetam a razão WCAG, mas afetam a
   percepção; não é medição de contraste.
7. **`title` nativo e `aria-label`**: não são superfície visível com cor.
