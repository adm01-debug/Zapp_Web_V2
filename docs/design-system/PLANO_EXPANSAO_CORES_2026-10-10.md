# Plano — expandir a paleta de cores do design system (10/10/2026)

> Pedido do Joaquim: mais cores no design system. Antes de recomendar, medi o que já existe
> (`src/styles/tokens.css`, `tailwind.config.ts`) — achado: ~15 nomes de variável, mas só
> **4 matizes realmente distinguíveis** para uso de categoria/status.

## 1. O problema medido

| Família de cor hoje | Matiz (hue) | Nomes que caem nela |
|---|---|---|
| Azul | 210–221° | `primary`, `secondary` (215°), `info` (210°), `accent`, `xp` |
| Vermelho | 0° | `destructive` |
| Verde | 142–160° | `success`, `whatsapp`, `online` |
| Laranja/âmbar | 24–45° | `warning`, `coins`, `streak`, `rank-gold`, `rank-bronze` |

5 nomes de variável — `primary`/`secondary`/`info`/`accent`/`xp` — são praticamente a MESMA
cor visualmente. O mesmo vale pro grupo laranja (5 nomes, 1 cor). Isso trava qualquer tela
que precise diferenciar categorias visualmente (ex.: Journey/Histórico, achado hoje — ver
cartão `t_c3b81d90`).

Já existe um roxo/violeta (258–282°) no sistema, mas escondido e sem padronização: só em 2
tiles de KPI do dashboard (`--kpi-tile-purple`, `--dash-tile-violet`, `--dash-violet`),
nunca promovido a cor de sistema de verdade.

## 2. Recomendação — 3 matizes novos, não mais que isso

1. **Roxo/violeta (~265°)** — promover o que já existe de forma escondida pra cor de
   sistema de verdade (reconciliar com `--dash-violet` existente, não criar um segundo
   roxo). Uso sugerido: nota/insight/IA.
2. **Teal/ciano (~190°)** — vão livre entre o azul e o verde atuais, claramente diferente
   dos dois. Uso sugerido: transferência/handoff.
3. **Rosa/magenta (~335°)** — matiz zero usada hoje. Uso sugerido: categoria de alta
   visibilidade, sem colidir com o vermelho de `destructive`.

Parar em 3: o time que construiu a paleta mede contraste WCAG com rigor (ver comentários em
`tokens.css` sobre ajustar luminosidade pra fechar 4,5:1 — ex. `--primary-text` em L35,
`--warning-text`/`--destructive-text` com luminosidade só ajustada pra não quebrar o
preenchimento original). Cada cor nova precisa do MESMO cuidado, em claro e escuro — não é
só escolher um tom bonito.

## 3. Decisão do Joaquim

Aprovado em 10/10/2026: seguir com as 3 cores recomendadas, criar cartão, delegar ao
`designer`, acompanhar execução, validar no final.

## Referências

- `src/styles/tokens.css` (tokens atuais, light `:root` + dark `.dark`)
- `tailwind.config.ts` (mapeamento Tailwind dos tokens)
- `t_c3b81d90` (Journey/Histórico — consumidor direto desta paleta nova)
