# Mapa design → tokens do sistema (rascunho do Claude; o item RD-002 finaliza)

Referência: `design-contatos.css` (dark). Regra: **nenhuma cor literal em componente**; tudo por token.

| Papel no design | Valor do design | Token do sistema (dark) | Observação |
|---|---|---|---|
| Azul primário / item ativo | #2864ed, #2463eb | `--primary` (221 83% 53%) | idêntico |
| Fundo azul suave | #17243e, #2463eb28 | `--primary` com alpha 12–24% ou `--primary-200` (dark) | usar alpha |
| Fundo da página | #0d0d0f | `--background` (240 6% 6%) → `--contacts-page` | quase igual |
| Painel / card | #19191b, #18181b | `--card` (240 5% 10%) → `--contacts-panel` | |
| Superfície elevada | #252527, #202023 | `--elevated` / `--surface` (240 5% 9%–12%) → `--contacts-raised` | |
| Linha / borda | #2b2c30, #343439, #3a3b42 | `--border` → `--contacts-line`, `--contacts-line-soft` | bordas finas |
| Texto principal | #f5f6f9 | `--foreground` (210 40% 98%) | |
| Texto secundário | #bfc2cb, #a0a5b1 | `--muted-foreground` | contraste AA obrigatório (RD-092) |
| Gradiente do card | 148deg #1d1d20→#151517 | `linear-gradient` de `--card` para `--background` | novo token `--contacts-card-gradient` |
| Placa do ícone do indicador | #213454→#15243e | gradiente de `--primary-200`/`-300` (dark) | `--contacts-icon-tile` |
| Ponto: Cliente | hsl(217 100% 54%) | `--primary` | |
| Ponto: Fornecedor | hsl(270 60% 60%) | `--violeta` | |
| Ponto: Transportadora | hsl(25 90% 50%) | `--warning` (mais laranja) ou token já usado hoje | sem matiz novo |
| Ponto: Colaborador | hsl(142 71% 45%) | `--success` | |
| Ponto: Prestador | hsl(38 92% 50%) | `--warning` | |
| Ponto: Parceiro | hsl(0 72% 51%) | `--destructive` | |
| Sombras | 0 8px 22px #0005 etc. | `--elev-2` … `--elev-4` | |
| Raios | 11 / 13 / 17 px | `--contacts-radius-stat/card/dialog` | |
| Fontes | Outfit, Plus Jakarta Sans | `--font-display`, `--font-sans` | já existem |

Medidas-chave do design: retrato do card 286 px; ficha até 1050 px com coluna lateral de 280 px; mini-cartão do carrossel 248×88 px; grade de 16 px; seções 23 px; fonte base 13 px; nenhuma fonte < 11 px.
