# CV-005 — Especificação formal da metodologia B·R·I·N·D·E

> Plano: etapa CV-005 — definir os 6 campos de descoberta de venda para brindes promocionais.
> B·R·I·N·D·E é o núcleo do estado de cada conversa no RADAR: sem ele, não há sugestão relevante.

## Resultado em uma frase

**B·R·I·N·D·E são os 6 campos que o vendedor precisa coletar para gerar uma proposta de brindes.** O RADAR detecta automaticamente quais campos estão preenchidos e sugere a pergunta certa para preencher o próximo.

## 1. Os 6 campos

### B — Budget (Verba)
**Pergunta de descoberta:** "Qual o valor aproximado que vocês têm em mente por unidade (ou no total)?"
**Por que importa:** orienta a faixa de produto e evita proposta fora do alcance.
**Exemplos de resposta:** "até R$ 10 por peça", "orçamento total de R$ 5.000", "não sei ainda"
**Valor default quando não informado:** `null` (campo aberto — não assumir faixa)
**Gatilho de detecção (NLP):** menção a reais, cifra, "barato", "quanto fica"

### R — Responsável
**Pergunta de descoberta:** "Você é quem aprova o pedido, ou precisa passar por outra pessoa?"
**Por que importa:** define se a conversa já está com o decisor ou se haverá uma segunda aprovação.
**Exemplos de resposta:** "sou eu mesmo", "preciso aprovar com meu chefe", "sou do marketing"
**Valor default:** `null` (não bloqueia a proposta, mas informa o follow-up)
**Gatilho de detecção (NLP):** "eu decido", "meu diretor", "passar para aprovação"

### I — Intenção
**Pergunta de descoberta:** "Para qual evento ou finalidade é o brinde? Tem uma data ou tema?"
**Por que importa:** orienta o tipo de produto, cores, personalização e urgência.
**Exemplos de resposta:** "convenção de vendas em novembro", "kit de fim de ano", "brinde para clientes"
**Valor default:** `null`
**Gatilho de detecção (NLP):** nomes de evento, "presente", "kit", "cliente", "funcionário"

### N — Número (Quantidade)
**Pergunta de descoberta:** "Quantas unidades vocês precisam?"
**Por que importa:** determina o preço unitário (escala) e disponibilidade de estoque.
**Exemplos de resposta:** "100 unidades", "uns 500", "não sei ainda"
**Valor default:** `null` (campo obrigatório para gerar proposta)
**Gatilho de detecção (NLP):** número + "peças"/"unidades"/"itens", "uns X"

### D — Data
**Pergunta de descoberta:** "Quando vocês precisam receber o material?"
**Por que importa:** define a viabilidade de produção e personalização; é o segundo campo mais crítico.
**Exemplos de resposta:** "15 de novembro", "fim de outubro", "quanto antes"
**Valor default:** `null` (campo obrigatório para gerar proposta)
**Gatilho de detecção (NLP):** datas, "urgente", "prazo", nome de mês, "semana que vem"

### E — Entrega
**Pergunta de descoberta:** "A entrega é para qual endereço? É frete ou retirada?"
**Por que importa:** fecha a proposta com custo logístico real; necessário para emitir pedido.
**Exemplos de resposta:** CEP / cidade, "retiro na loja", "entrego no evento", "sedex para SP"
**Valor default:** `null`
**Gatilho de detecção (NLP):** CEP, cidade, "frete", "entrega", "retirada"

## 2. Prioridade de coleta

Ordem recomendada de coleta (impacto na proposta):

1. **N** (quantidade) — sem isso não há preço
2. **D** (data) — sem isso não há prazo
3. **B** (verba) — orienta faixa de produto
4. **I** (intenção) — orienta tipo de produto
5. **R** (responsável) — orienta follow-up
6. **E** (entrega) — fecha o pedido

**Proposta possível:** com N + D preenchidos. Proposta ideal: todos os 6 preenchidos.

## 3. Estado B·R·I·N·D·E no `copilot_sessions`

A coluna `brinde_state` da tabela `copilot_sessions` (CV-011) armazena o estado como JSON:

```json
{
  "B": null,
  "R": null,
  "I": "kit de fim de ano para funcionários",
  "N": 300,
  "D": "2026-12-10",
  "E": null
}
```

Campo `null` = não coletado. O RADAR pergunta o próximo `null` seguindo a ordem de prioridade acima.

## 4. O que isto muda no plano

1. O schema `copilot_sessions.brinde_state` (CV-011) usa o JSON desta spec.
2. O prompt do `copilot-live` (CV-021) recebe o `brinde_state` atual e decide qual campo perguntar a seguir.
3. `copilot_insights` (CV-012) registra cada atualização de campo com timestamp.
