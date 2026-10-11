# Plano: contadores dos chips acompanham a busca e os filtros

Decisão do Joaquim (11/10/2026), opção B: o número de cada chip da lista de conversas é o que a lista mostraria ao clicar nele **com a busca e os filtros atuais** ("das 6, 1 bate com o que você filtrou").

## Fatos verificados
- `countByChip` (`src/hooks/inbox/chipCounts.ts`, cartão H1) já aplica adiadas, "mostrar todos" e fila, mas ignora busca (nome/telefone/e-mail), tipo de contato e o painel Filtros (status, etiquetas, atendente, datas).
- Esses filtros moram dentro de `useInboxFilters.ts`; `StatusChips.tsx` (cartão I1) calcula por conta própria a partir de todas as conversas.
- Nuance da lista que deve ser copiada, não corrigida: a fila não vale para Resolvidas.

## Desenho
- A regra dos filtros adicionais vira uma função pura compartilhada: a lista e o contador usam o **mesmo código**, então não divergem.
- `useInboxFilters` devolve `chipCounts` pronto; `StatusChips` só lê o número.
- Prova: teste de propriedade em que, para uma matriz de filtros, contador de cada chip = tamanho da lista com o chip ativo.

## Cartões
| Id | Perfil | O quê | Depende de |
|---|---|---|---|
| G1 | hugo | extrai filtros comuns, estende `countByChip`, `useInboxFilters` devolve `chipCounts`, teste de propriedade | H1, B2 |
| G2 | iris | `StatusChips` lê `chipCounts` por prop, rótulo acessível com a contagem, testes | I1r (refazer do I1), G1 |

## Riscos
- Desempenho a cada tecla da busca: uma varredura por mudança, memorizada.
- Os cartões H1 e B2 e o refazer do I1 ainda não foram integrados na branch do dia; G1 e G2 trazem os commits por cherry-pick.

## Validação
Código da branch viva, teste de propriedade, captura real: digitar na busca muda os números dos chips; fila do integrador.
