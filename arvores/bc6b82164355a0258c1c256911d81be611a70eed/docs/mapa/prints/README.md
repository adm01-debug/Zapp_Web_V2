# Prints da FASE 6 (Acessibilidade e mobile) — E65

Artefatos visuais da lista de sugestões de endereço do combobox, para documentar o trabalho de
acessibilidade e mobile da fase.

| Arquivo | O que mostra | Dimensão |
|---|---|---|
| `desktop-1280.png` | lista aberta com 3 sugestões, viewport de desktop | 1280x900 |
| `mobile-360.png` | a mesma lista em largura de celular (360 px), cabendo na tela | 360x800 |
| `tema-escuro.png` | lista aberta no tema escuro | 1280x900 |

## Limitação declarada (importante)

**As sugestões de endereço visíveis nestes prints foram servidas por MOCK** (interceptação da chamada
`/search/searchbox/v1/suggest`), não pelo Mapbox ao vivo. Motivo: o token do Mapbox é entregue por uma
edge function que **exige sessão autenticada**, e não há credencial de teste disponível no ambiente de
captura.

O que estes prints **provam**: o render real do componente — a lista abre, posiciona e cabe na tela em
360 px, o rodapé "Powered by Mapbox" aparece, a região viva anuncia "3 sugestões", o tema escuro aplica
os tokens escuros.

O que eles **NÃO** provam: a integração com o Mapbox ao vivo. Essa parte é coberta pelos testes
unitários, que usam os *shapes* reais da resposta.

## Pendente

O print de **teclado virtual aberto** (aparelho real) não pode ser simulado em browser headless e segue
pendente — é o último item da etapa E65.

## Observação sobre outros arquivos desta pasta

`f3-desktop.png` (210 KB) e `f3-mobile-360.png` são de uma etapa anterior (FASE 3) e **não** fazem parte
do E65. O primeiro está **acima do limite de 200 KB** que a etapa E65 define para PNG.
