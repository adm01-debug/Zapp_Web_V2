# CV-006 — Catálogo de objeções (brindes promocionais)

> Plano: etapa CV-006 — mapear as objeções mais frequentes e as respostas validadas.
> O RADAR usa este catálogo no estágio E4 (Negociação/Objeção) para sugerir o contra-argumento certo.

## Resultado em uma frase

**7 objeções cobrem ~90 % dos impasses de venda de brindes.** Para cada uma, há um padrão de detecção (palavras-chave) e uma resposta validada pela equipe comercial.

## 1. O1 — "Tá caro / achei mais barato"

**Palavras-chave:** "caro", "sai mais barato", "concorrente", "outro fornecedor", "desconto"

**Resposta validada:**
> "Entendo! Para comparar bem, é importante checar personalização inclusa, prazo de entrega e qualidade do acabamento — diferenças aí costumam explicar a variação de preço. Posso enviar uma amostra para vocês avaliarem antes de decidir?"

**Jogada complementar:** mostrar foto de acabamento premium vs. básico; ancorar com o item de maior valor antes do escolhido.

**Variante — objeção de volume pequeno:** "Para quantidades menores o unitário é maior, mas posso montar um kit com mix de produtos que mantém o custo total dentro do seu budget — quer ver uma sugestão?"

## 2. O2 — "Precisa de pouco / quantidade mínima muito alta"

**Palavras-chave:** "pouca quantidade", "pequena quantidade", "mínimo muito alto", "só preciso de X"

**Resposta validada:**
> "Para quantidades menores, posso sugerir peças de estoque pronto com personalização mínima (adesivo ou cartão), ou montar um kit mix com itens de alta rotatividade. Qual é a quantidade que você precisa?"

**Jogada complementar:** kit mix reduz quantidade mínima efetiva sem perder personalização.

## 3. O3 — "Não sei o que quero / pode me indicar algo?"

**Palavras-chave:** "não sei", "o que você indica", "alguma sugestão", "que tipo de brinde"

**Resposta validada:**
> "Claro! Para indicar melhor, me conta: é para presentear clientes, funcionários ou para evento? E tem um tema ou cor da empresa?"

**Jogada:** guiar para I (Intenção) antes de sugerir produto. Após preencher I, usar o catálogo de produtos por segmento.

## 4. O4 — "Precisa de logo / arquivo especial"

**Palavras-chave:** "logo", "arquivo", "vetor", "ai", "pdf", "arte", "como envio a arte"

**Resposta validada:**
> "A personalização já está incluída no preço! Para a arte, preciso do logo em vetor (.ai, .eps ou .pdf em alta resolução). Se não tiver, nossa equipe de criação pode vetorizar por um valor pequeno. Pode me enviar o arquivo que você tem?"

**Nota:** não deixar a objeção de arte bloquear o fechamento — pedir o arquivo que o cliente TEM, depois resolver a vetorização.

## 5. O5 — "Prazo muito curto"

**Palavras-chave:** "precisa urgente", "pouco tempo", "semana que vem", "amanhã", "urgente"

**Resposta validada:**
> "Para prazos curtos temos duas saídas: produtos de estoque pronto (entrega em 2–3 dias úteis, sem personalização ou com adesivo rápido) ou peças prontas com bordado/gravação simples em 5–7 dias. Qual prazo exato você tem?"

**Gatilho:** atualizar campo D no `brinde_state` com o prazo informado e verificar viabilidade de produção.

## 6. O6 — "Não tenho CNPJ / sou pessoa física"

**Palavras-chave:** "não tenho cnpj", "pessoa física", "cpf", "é para mim mesmo"

**Resposta validada:**
> "Sem problema! Atendemos pessoa física normalmente. O pedido sai no CPF e a nota é emitida para você. Posso seguir com o seu nome e CPF?"

## 7. O7 — "Vou pesquisar mais / preciso pensar"

**Palavras-chave:** "vou pensar", "vou pesquisar", "deixa eu ver", "depois eu falo", "me dá um tempo"

**Resposta validada:**
> "Claro, sem pressa! Vou te enviar nosso portfólio com os itens mais pedidos para você avaliar com calma. Quer que eu reserve o prazo de produção para você por 48 h enquanto decide?"

**Gatilho de follow-up:** se não houver resposta em 24 h, RADAR sugere lembrete de retomada (Jogada J7 em CV-007).

## 8. Matriz de objeções × estágio

| Objeção | Estágio mais comum | Sinal no chat |
|---|---|---|
| O1 — Preço | E4 | após proposta enviada |
| O2 — Quantidade | E2/E3 | durante descoberta |
| O3 — Não sabe o que quer | E2 | início da descoberta |
| O4 — Arte/logo | E3/E4 | após proposta |
| O5 — Prazo curto | E2/E3 | ao coletar campo D |
| O6 — Pessoa física | E2/E5 | ao fechar pedido |
| O7 — Preciso pensar | E4/E5 | antes do fechamento |

## 9. O que isto muda no plano

1. O prompt do `copilot-live` (CV-021) recebe a lista de objeções como contexto para classificar mensagens do contato.
2. Cada objeção detectada gera um `copilot_insight` do tipo `objection_detected` com o código (O1–O7).
3. CV-007 complementa com as jogadas de abertura (não só de defesa).
