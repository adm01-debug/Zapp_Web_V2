# Mapa design → tokens do sistema — Contatos (final, RD-002)

Referência: `design-contatos.css` (dark). Regra: **nenhuma cor literal em componente**; tudo por token.
Os tokens novos vivem em `src/styles/tokens.css`, nos blocos `:root` (claro) e `.dark` (escuro), com
prefixo `--contacts-*`. Cores são **trincas HSL sem `hsl()`** — o componente escreve `hsl(var(--contacts-*))`.
Todos derivam de tokens que já existem; nenhuma matiz nova foi criada.

## Superfícies, linhas e raios (tokens `--contacts-*` declarados no RD-002)

| Papel no design | Valor do design (dark) | Token | Claro (`:root`) | Escuro (`.dark`) | Vem de |
|---|---|---|---|---|---|
| Fundo da página | `#0d0d0f` | `--contacts-page` | `221 20% 97%` | `240 6% 6%` | `--background` |
| Painel / card | `#19191b`, `#18181b` | `--contacts-panel` | `0 0% 100%` | `240 5% 10%` | `--card` |
| Superfície elevada | `#252527`, `#202023` | `--contacts-raised` | `0 0% 100%` | `240 5% 13%` | `--card-elevated` |
| Linha / borda | `#2b2c30`, `#343439`, `#3a3b42` | `--contacts-line` | `221 15% 90%` | `240 4% 18%` | `--border` |
| Linha suave | `#242427` | `--contacts-line-soft` | `221 15% 93%` | `240 5% 14%` | `--input` |

`--contacts-card-gradient` — gradiente do card (`148deg #1d1d20 → #18181b → #151517`):
`linear-gradient(148deg, hsl(var(--contacts-raised)) 0%, hsl(var(--contacts-panel)) 65%, hsl(var(--contacts-page)) 100%)`.

`--contacts-icon-tile` — placa do ícone do indicador (`#213454 → #15243e`):
`linear-gradient(145deg, hsl(var(--primary-300)) 0%, hsl(var(--primary-200)) 100%)`.

`--contacts-select-glow` — brilho do card selecionado (`0 0 0 1px #326ced55`):
`0 0 0 1px hsl(var(--primary) / 0.33), var(--elev-3)`.

`--contacts-hover-shadow` — sombra de hover (`0 8px 22px #0005` + anel `#2864ed12`):
`var(--elev-4), 0 0 0 1px hsl(var(--primary) / 0.07)`.

`--contacts-dialog-shadow` — sombra do diálogo (`0 30px 90px #0009`): `var(--elev-5)`.

Raios: `--contacts-radius-stat: 11px` · `--contacts-radius-card: 13px` · `--contacts-radius-dialog: 17px`.

> Nota do CLARO: `--contacts-panel` e `--contacts-raised` coincidem com o branco do sistema
> (`--card`/`--card-elevated`) — o degrau entre níveis vem da borda fina (`--contacts-line`), como no design.
> As sombras `--elev-*` são resolvidas por tema, então o mesmo token escurece no claro e aprofunda no escuro.

## Cores de tipo: reusam tokens existentes (nenhum `--contacts-*` novo)

| Papel no design | Valor do design | Token do sistema | Observação |
|---|---|---|---|
| Ponto: Cliente | `hsl(217 100% 54%)` | `--primary` | |
| Ponto: Fornecedor | `hsl(270 60% 60%)` | `--violeta` | matiz 265° existente |
| Ponto: Colaborador | `hsl(142 71% 45%)` | `--success` | |
| Ponto: Prestador | `hsl(38 92% 50%)` | `--warning` | |
| Ponto: Parceiro | `hsl(0 72% 51%)` | `--destructive` | |
| Ponto: Transportadora | `hsl(25 90% 50%)` | `--warning` | sem matiz novo (âmbar/laranja) |

## Texto, azul e fontes: tokens existentes

| Papel | Design | Token |
|---|---|---|
| Texto principal | `#f5f6f9` | `--foreground` (`210 40% 98%`) |
| Texto secundário | `#bfc2cb`, `#a0a5b1` | `--muted-foreground` (AA obrigatório, RD-092) |
| Azul primário / item ativo | `#2864ed`, `#2463eb` | `--primary` (`221 83% 53%`) |
| Fundo azul suave | `#17243e`, `#2463eb28` | `--primary` com alpha 12–24% |
| Fontes | Outfit, Plus Jakarta Sans | `--font-display`, `--font-sans` |

Medidas-chave do design: retrato do card 286 px; ficha até 1050 px com coluna lateral de 280 px;
mini-cartão do carrossel 248×88 px; grade de 16 px; seções 23 px; fonte base 13 px; nenhuma fonte < 11 px.
