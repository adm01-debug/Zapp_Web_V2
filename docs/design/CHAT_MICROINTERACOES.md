# Microinterações do chat — kit de movimento

Kit: `src/components/inbox/chat/motion/` (porta única de importação:
`@/components/inbox/chat/motion`). Molas, durações e escalonamento vêm de
`src/lib/motion.ts` — o kit não define tempo solto nem cor própria.

Objetivo: o chat responde ao que acontece (mensagem chegou, ação deu certo,
lista carregou) com movimento **sutil**, sempre desligável e sem inventar cor.

## Regra de movimento

- Toda animação sai de uma mola/preset de `src/lib/motion.ts`:
  `zappSpring.soft` (contagem e entrada de item), `zappSpring.snappy`
  (indicador que desliza, realce curto), `zappSpring.pop` (celebração) ou
  `zappTransition.*` (duração + curva).
- Escalonamento de lista: `zappStagger` — 60 ms por item, teto de 8 itens (do 9º
  em diante entra junto, senão a lista demora a ficar inteira).
- **Movimento reduzido é obrigatório**: com `prefers-reduced-motion: reduce`
  (lido por `useReducedMotion()`) cada peça entrega o estado final direto — sem
  contar, sem varrer, sem deslizar, sem girar. Cada peça marca o modo no
  atributo `data-motion` (`full` / `reduced`) para quem testa conferir.
- Movimento nunca é a única informação: realces e celebrações são decorativos
  (`aria-hidden`, `pointer-events-none`) e a confirmação para leitor de tela vem
  por texto (`role="status"`).
- **Animação declarada em CSS (giro do ícone de carregar, varredura do brilho)
  sempre com o prefixo `motion-safe:`** — nunca a classe solta. Assim o próprio
  CSS desliga o efeito sob `prefers-reduced-motion: reduce`, sem depender de JS.

## Regra de cor

Só as cores que o sistema já tem. Os tons do kit (`tone.ts`) apontam para tokens
de `src/styles/tokens.css` via classe literal do Tailwind:

| Tom | Token | Quando usar |
| --- | --- | --- |
| `info` | `--info` | aviso de sistema |
| `primary` | `--primary` | ação / marca |
| `success` | `--success` | concluído |
| `warning` | `--warning` | atenção |
| `destructive` | `--destructive` | falha |
| `whatsapp` | `--whatsapp` | canal |

`toneClasses(tom)` devolve `text-*`, `bg-*`, `border-*`, `ring-*` e `bg-*/15`
(fundo tonal suave). Tom fora da lista **lança erro** — não existe "cor nova em
silêncio". Um teste-guarda (`__tests__/motion-guards.test.ts`) varre o fonte do
kit e recusa cor literal (`#hex`, `rgb()`, `hsl()` sem `var()`, paleta do
Tailwind, preto/branco) e família de token fora do sistema.

## As oito peças

| Peça | Para quê | Contrato principal |
| --- | --- | --- |
| `AnimatedNumber` | número que conta até o valor | `value`, `decimals`, `prefix`, `suffix`; fecha no valor exato; reduzido = valor final na hora |
| `ShimmerSkeleton` | brilho de carregamento | `className` (tamanho); `aria-hidden`; reduzido = bloco estático |
| `DrawLine` | traço que se desenha | `d`, `length`, `width/height`, `tone`; reduzido = traço já pronto |
| `FlashRing` | realce que se desfaz e sai | `active`, `tone`, `onDone`; reduzido = só apaga a opacidade |
| `PopBurst` | celebração curta (check/estrela) | `kind`, `tone`, `onDone`; reduzido = anéis só apagam |
| `SlidingSegmented` | escolha com indicador que desliza | `items`, `value`, `onChange`, `ariaLabel`; setas ←/→ mudam a escolha |
| `MorphButton` | ação com estados **na mesma largura** | `state` (`idle/loading/success/error`); `aria-busy` ao carregar; `role="status"` anuncia |
| `StaggerList` / `StaggerItem` | lista em cascata | 60 ms/item, teto 8; reduzido = lista nasce inteira |

## Exemplos de uso

```tsx
import {
  AnimatedNumber, FlashRing, MorphButton, SlidingSegmented, StaggerItem,
  StaggerList, ShimmerSkeleton, PopBurst, DrawLine,
} from '@/components/inbox/chat/motion';

// contagem de não lidas
<AnimatedNumber value={naoLidas} suffix=" não lidas" />

// botão de envio com estados (não muda de largura)
<MorphButton state={estado} onClick={enviar}>Enviar</MorphButton>

// período com indicador que desliza
<SlidingSegmented
  ariaLabel="Período"
  value={periodo}
  onChange={setPeriodo}
  items={[{ value: 'dia', label: 'Dia' }, { value: 'semana', label: 'Semana' }]}
/>

// espera e lista
{carregando ? <ShimmerSkeleton className="h-4 w-40" /> : null}
<StaggerList>
  {resultados.map((r) => <StaggerItem key={r.id}>{r.titulo}</StaggerItem>)}
</StaggerList>

// realce da mensagem que acabou de chegar (some sozinho)
<FlashRing active={chegouAgora} tone="primary" onDone={() => setChegouAgora(false)}>
  <BalaoDaMensagem />
</FlashRing>
```

## Reuso que já existe no repo

O mesmo movimento já vivia em `src/components/inbox/tabs/journey/motion/`
(`HighlightPulse`, `FadeSlideIn`, `useCountUp`, `presets`, `Collapse`), aprovado.
Este kit **não substitui** aqueles: ele dá ao chat a versão com mola e com os
seis tons de estado (incluindo `whatsapp` e `destructive`, que o Journey não
usa). Onde as duas versões coexistirem na mesma tela, prefira o kit do chat e
registre a convergência para o Journey em cartão próprio.

## Testes

`src/components/inbox/chat/motion/__tests__/chat-motion.test.tsx` — 20 casos:
cada peça prova o caminho normal **e** o de movimento reduzido; anel/celebração
medem o prazo com `onDone`; o traço mede `stroke-dashoffset` antes/depois.
`__tests__/motion-guards.test.ts` — cor/token/barrel (4 casos).
