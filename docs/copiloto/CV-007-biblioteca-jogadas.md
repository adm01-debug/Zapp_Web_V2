# CV-007 — Biblioteca de jogadas vencedoras (brindes promocionais)

> Plano: etapa CV-007 — mapear as táticas de venda proativas para o RADAR sugerir no momento certo.
> Diferença de CV-006: lá são *reações* a objeções; aqui são *ações* que o vendedor toma por iniciativa.

## Resultado em uma frase

**8 jogadas cobrem os momentos de maior alavancagem da venda de brindes.** O RADAR sugere cada jogada no estágio e contexto certos, sem esperar o vendedor perceber que a oportunidade está passando.

## 1. J1 — Ancoragem de valor (primeira proposta)

**Quando usar:** E3 (Proposta), ao enviar a primeira cotação.  
**Como funciona:** apresentar PRIMEIRO a opção de maior valor/qualidade, depois as opções mais acessíveis. O contato âncora o preço na primeira opção e percebe as demais como desconto.  
**Sugestão RADAR:**
> "Posso enviar 3 opções: Premium (acabamento superior), Padrão (nosso mais pedido) e Econômico. Por onde prefere começar?"

## 2. J2 — Kit mix (aumenta ticket e reduz mínimo percebido)

**Quando usar:** E2/E3, quando N (quantidade) é baixo ou o contato hesita.  
**Como funciona:** combinar 2–3 itens de alto giro em kit — o total de unidades sobe sem o cliente perceber e o kit tem maior valor percebido que itens avulsos.  
**Sugestão RADAR:**
> "Para quantidades menores, tenho uma opção de kit que combina [item A + item B] — fica mais completo e o preço por kit fica parecido com o unitário que você pesquisou. Posso montar uma sugestão?"

## 3. J3 — Urgência real de prazo de personalização

**Quando usar:** E2, ao coletar campo D (Data).  
**Como funciona:** informar que o prazo de personalização (bordado, gravação, embalagem) é o gargalo real — não a entrega. Cria urgência legítima para fechar logo.  
**Sugestão RADAR:**
> "Só lembrando: o prazo para personalização leva [X] dias úteis — se o evento é em [data D], precisamos fechar até [data limite] para garantir. Quer eu reservar o prazo de produção?"

## 4. J4 — Referência social (prova de uso)

**Quando usar:** E4 (objeção ou hesitação antes de fechar).  
**Como funciona:** citar um caso de uso similar (empresa do mesmo segmento, tipo de evento, tamanho de pedido) para reduzir a percepção de risco.  
**Sugestão RADAR:**
> "Esse item foi muito usado por [segmento similar] em [tipo de evento] — temos fotos do resultado final se quiser ver antes de decidir."
**Nota:** usar somente referências reais; não fabricar. A biblioteca de referências deve ser mantida pela equipe comercial.

## 5. J5 — Foto/amostra antes do fechamento

**Quando usar:** E3/E4, após proposta enviada sem resposta por 2–4 h.  
**Como funciona:** enviar imagem real do produto (foto do estoque ou de pedido similar) — imagem converte muito mais do que descrição em texto.  
**Sugestão RADAR:**
> "Acabei de ver que temos esse item em estoque — posso te enviar uma foto real de como fica personalizado?"

## 6. J6 — Upsell de embalagem/personalização

**Quando usar:** E5 (Fechamento), após confirmação de item e quantidade.  
**Como funciona:** oferecer embalagem premium, tag personalizada ou acabamento especial como complemento ao pedido — aumenta o ticket e a percepção de valor do brinde para o cliente final.  
**Sugestão RADAR:**
> "Para esse volume, posso incluir embalagem personalizada com o logo de vocês por [R$ X] a mais por unidade — fica muito mais profissional para presentear. Vale a pena?"

## 7. J7 — Follow-up de retomada (24 h de silêncio)

**Quando usar:** E4/E5, quando contato ficou 24 h sem responder após proposta ou objeção.  
**Como funciona:** mensagem curta, educada, que retoma a conversa sem pressão. Alta taxa de resposta.  
**Sugestão RADAR:**
> "Oi [nome]! Só passando para ver se ficou alguma dúvida sobre a proposta que enviei. Se precisar de ajuste em quantidade ou prazo, é só falar 😊"

## 8. J8 — Confirmação de pedido estruturada

**Quando usar:** E5 (Fechamento), após aceite verbal do contato.  
**Como funciona:** enviar resumo estruturado do pedido (item, quantidade, data, endereço de entrega, forma de pagamento) para formalizar e evitar divergências no pós-venda.  
**Sugestão RADAR:**
> "Ótimo! Vou confirmar o pedido:
> • Produto: [item]
> • Qtd: [N] unidades
> • Prazo: [D]
> • Entrega: [E]
> • Arte: [status da arte]
> Está correto? Posso emitir o boleto/PIX?"

## 9. Mapeamento de jogadas × estágio

| Jogada | E1 | E2 | E3 | E4 | E5 | E6 |
|---|---|---|---|---|---|---|
| J1 — Ancoragem | | | ✓ | | | |
| J2 — Kit mix | | ✓ | ✓ | | | |
| J3 — Urgência prazo | | ✓ | | | | |
| J4 — Referência social | | | | ✓ | | |
| J5 — Foto/amostra | | | ✓ | ✓ | | |
| J6 — Upsell embalagem | | | | | ✓ | |
| J7 — Follow-up 24 h | | | | ✓ | ✓ | ✓ |
| J8 — Confirmação pedido | | | | | ✓ | |

## 10. O que isto muda no plano

1. O prompt do `copilot-live` (CV-021) recebe a lista de jogadas como opções de sugestão proativa, além das respostas reativas de CV-006.
2. J7 (follow-up 24 h) é acionado pelo scheduler de presença (CV-028 / CV-029), não pela Edge — requer `pg_cron` ou N8N.
3. J8 (confirmação estruturada) usa o `brinde_state` completo de CV-005 para montar o resumo.
