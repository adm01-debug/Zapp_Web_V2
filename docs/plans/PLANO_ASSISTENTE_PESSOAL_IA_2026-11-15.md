# Plano — Assistente pessoal de IA do Zapp Web V2

**Data:** 2026-11-15 · **Estado:** Fase 0 em PR, fases 1 a 4 aguardando execução
**Medições:** todas feitas no banco oficial de produção `tnnnlkbymytvtqngbbqh`, em modo leitura.

---

## 1. O que foi pedido

Um assistente só, pessoal, ligado a tudo:

- ajuda a pessoa a **decidir no dia a dia dentro do sistema**;
- **lembra da agenda** e dos compromissos;
- é **treinado para o perfil de quem usa** — quem vende recebe ajuda para vender, quem compra recebe
  ajuda nas rotinas de compra, e assim por diante.

Hoje nada disso acontece. As três seções seguintes mostram por quê, com número e arquivo.

---

## 2. O que existe hoje (medido, não estimado)

### 2.1 Há muita peça construída

| O que | Quanto | Onde |
|---|---|---|
| Edge functions de IA | **35** (de 93 no total) | `supabase/functions/ai-*`, `copilot-live`, `voice-*`, `classify-*`, `elevenlabs-*` |
| Motor do copiloto ao vivo | **545 linhas**, pronto | `supabase/functions/_shared/copilot-tick.ts` |
| Tabelas do copiloto | **11** | `copilot_sessions`, `copilot_insights`, `copilot_outcomes`, `copilot_feedback`, … |
| Campos de leitura de venda já modelados | 20+ | `copilot_sessions`: `brinde_budget`, `brinde_deadline`, `sale_stage`, `temperature`, `comm_style`, `decision_role`, `occasion`, `stakeholders`, `intent`, `sentiment` |

O schema de venda consultiva está **bem desenhado**. Não falta modelagem.

### 2.2 E nada disso roda

Contagem de linhas, hoje:

| Tabela | Linhas |
|---|---|
| `copilot_sessions` | **0** |
| `copilot_insights` | **0** |
| `copilot_outcomes` | **0** |
| `copilot_feedback` | **0** |
| `copilot_help_requests` | **0** |
| `copilot_learning_moments` | **0** |
| `copilot_objection_catalog` | **0** |
| `copilot_conversation_scores` | **0** |
| `copilot_seller_settings` | **0** |
| `copilot_usage` | **0** |
| `conversation_analyses` | **0** |
| `knowledge_base_articles` | **0** |
| `ai_conversation_tags` | **0** |
| `ai_model_prices` | **0** |
| `reminders` | **1** |

Onze tabelas de copiloto zeradas, base de conhecimento zerada, análises de conversa zeradas.
**O motor existe e nunca foi executado uma única vez.**

E das 35 edges de IA, só **4** aparecem em `ai_usage_logs` com chamada bem-sucedida de produto nos últimos
30 dias (`elevenlabs-scribe-token`, `classify-sticker`, `ai-proxy`, `deepseek-flash` via proxy). Seis são
código morto: nunca foram chamadas por ninguém.

### 2.3 O que falta para atender ao pedido

| O pedido | O que existe | O que falta |
|---|---|---|
| "ajuda a decidir no dia a dia" | motor de insights pronto, desligado | o gatilho que o acorda (**Fase 0**) |
| "lembra da agenda e compromissos" | tabela `reminders` com 1 linha | o assistente nunca lê nem escreve nela (**Fase 2**) |
| "treinado para o perfil de quem usa" | `profiles.role` sabe 5 atendentes, 3 supervisores, 2 admins | o sistema **não sabe se a pessoa vende ou compra**; `copilot_seller_settings` só tem `opted_in` (liga/desliga) — nenhum perfil, nenhum treino (**Fase 1** e **Fase 4**) |
| "tudo no mesmo agente" | 35 edges independentes | nenhuma delas conversa com as outras; não há um ponto único (**Fase 3**) |

---

## 3. O problema central

**Não falta inteligência. Falta ligação.**

São 35 peças que funcionam isoladas e nenhum assistente. Ninguém está no meio costurando: cada edge recebe
um pedido, chama um modelo, devolve um texto e esquece tudo. Não há identidade de quem está sendo ajudado,
não há memória entre uma conversa e a seguinte, não há momento próprio para falar — e, principalmente, não
há uma porta única por onde a pessoa fale com "o assistente".

O desenho abaixo resolve exatamente isso, em quatro camadas, cada uma virando uma fase.

---

## 4. O desenho: um assistente, quatro camadas

```
                      ┌──────────────────────────────────┐
   a pessoa  ───────► │  PORTA ÚNICA (Fase 3)            │
                      │  um ponto de entrada, um nome    │
                      └───────────────┬──────────────────┘
                                      │
          ┌───────────────────────────┼───────────────────────────┐
          ▼                           ▼                           ▼
 ┌─────────────────┐       ┌─────────────────┐        ┌──────────────────┐
 │ IDENTIDADE      │       │ MEMÓRIA         │        │ MOMENTO          │
 │ (Fase 1)        │       │ (Fase 2)        │        │ (Fase 0)         │
 │ quem é, o que   │       │ agenda, histó-  │        │ quando ele fala  │
 │ faz, como gosta │       │ rico, contexto  │        │ sem ser chamado  │
 └─────────────────┘       └─────────────────┘        └──────────────────┘
          └───────────────────────────┼───────────────────────────┘
                                      ▼
                      ┌──────────────────────────────────┐
                      │  TREINO POR PERFIL (Fase 4)      │
                      │  vendedor vende · comprador      │
                      │  compra · supervisor acompanha   │
                      └──────────────────────────────────┘
```

---

## 5. As fases

### Fase 0 — Ligar o motor  ·  *em PR, aguardando CI*

**Por que primeiro:** enquanto o motor não roda uma vez, nada mais pode ser testado de verdade.
Todas as fases seguintes dependem de existir pelo menos uma linha em `copilot_sessions`.

O que entra:
1. Gatilho no banco: quando um contato manda mensagem, agenda um `copilot.tick` na fila `ai_jobs`
   (debounce de 4 s, **nunca** bloqueia a gravação da mensagem).
2. Registro do tipo `copilot.tick` no trabalhador (`ai-jobs-worker`), que hoje não sabe o que fazer com ele.
3. Chave de capacidade `ai.capability.copilot_live`, **semeada desligada**.

**Nasce desligado de propósito.** Você liga quando quiser, com uma linha, e desliga do mesmo jeito —
sem deploy, sem mexer em código.

PR: https://github.com/adm01-debug/Zapp_Web_V2/pull/3127

### Fase 1 — Identidade: o assistente passa a saber quem está do outro lado

**Hoje:** `copilot_seller_settings` tem três colunas (`seller_id`, `opted_in`, `updated_at`). O assistente
sabe se pode falar, e nada além disso.

O que entra:
1. Tabela nova de perfil do assistente, por pessoa, com:
   - **atuação**: vende / compra / atende / supervisiona (o eixo que você pediu e que hoje não existe);
   - **o que a pessoa cuida**: produtos, carteira, setor;
   - **como quer ser ajudada**: sugerir sempre, só quando for relevante, ou só quando eu pedir;
   - **tom**: direto, consultivo, formal.
2. Tela de ajuste desse perfil, dentro de Configurações.
3. O motor passa a ler esse perfil antes de escolher o que dizer.

**Entrega verificável:** com dois usuários de atuação diferente na mesma conversa, o assistente produz
sugestões diferentes — e o teste prova isso.

### Fase 2 — Memória: agenda e compromissos

**Hoje:** `reminders` tem 1 linha em toda a base, e nenhuma edge de IA a lê ou escreve.

O que entra:
1. O assistente passa a **ler** a agenda: ao abrir uma conversa, ele já sabe que existe um compromisso com
   aquele contato amanhã, e menciona.
2. O assistente passa a **escrever** na agenda: quando o cliente diz "me liga na quinta", ele oferece criar
   o lembrete — com um clique, sem digitar.
3. Resumo do dia: ao entrar no sistema, a pessoa vê o que tem para hoje — compromissos, conversas paradas,
   propostas sem resposta.

**Entrega verificável:** uma mensagem contendo uma data gera uma oferta de lembrete; aceitar cria a linha
em `reminders`; o teste cobre os dois caminhos.

### Fase 3 — Porta única: deixa de ser 35 peças e passa a ser um assistente

**Hoje:** 35 edges independentes, cada uma com sua chamada, seu formato e nenhuma memória compartilhada.

O que entra:
1. Um ponto único de entrada que recebe o pedido em linguagem normal e decide sozinho qual capacidade usar
   (resumir, sugerir resposta, calcular prazo, recomendar produto, ler a temperatura do lead…).
2. Contexto compartilhado: quem é a pessoa (Fase 1), o que está na agenda (Fase 2), o que já foi dito na
   conversa, o que o copiloto já concluiu.
3. As 6 edges mortas são **ou** ligadas nesse ponto único **ou** removidas com registro — não ficam no meio.

**Entrega verificável:** uma única chamada em linguagem natural ("como estou com o cliente X?") devolve
resposta usando pelo menos três fontes diferentes, e o teste prova de onde cada pedaço veio.

### Fase 4 — Treino por perfil

Com identidade (1), memória (2) e porta única (3) de pé, o treino é o que transforma "uma IA" em
"o meu assistente":

- **vendedor:** objeções, ancoragem de preço, próximo passo, risco de perder, prazo de entrega;
- **comprador:** comparação de fornecedor, histórico de preço, prazo prometido × cumprido, recompra;
- **atendente:** resposta rápida, tom, encaminhamento;
- **supervisor:** onde o time está travando, conversas esfriando, carga por pessoa.

Cada perfil ganha seu conjunto de instruções e seu conjunto de testes. O catálogo de objeções
(`copilot_objection_catalog`, hoje com 0 linhas) é semeado aqui.

---

## 6. O que depende de você

| # | O que | Por que travou em você | O que eu preciso |
|---|---|---|---|
| 1 | **Ligar o motor** (Fase 0) | Cada conversa ativa passa a consumir modelo de IA. É custo recorrente. | "liga o copiloto" — e eu ligo a chave, acompanho o custo real por uma semana e te mostro o número |
| 2 | **Chave/crédito da ElevenLabs** | 401 (chave rejeitada) e 402 (crédito esgotado) em 14/11. Voz e transcrição estão fora do ar. | ver saldo e chave no painel da ElevenLabs — detalhe no `PENDENCIAS.md`, item 7 |
| 3 | **Segundo fator (MFA)** | 10 usuários, 0 com MFA. Mudar isso muda o login de todo mundo. | "MFA a" (todos), "MFA b" (só admin) ou "MFA c" (opcional) — `PENDENCIAS.md`, item 8 |
| 4 | **Teto de bundle** | O painel ao vivo na Inbox não cabe no limite atual de peso do front. | decisão já registrada em `PENDENCIAS.md`, item 6 |

Nada nas fases 1 a 4 exige decisão sua além dessas quatro. O resto é execução minha.

---

## 7. Ordem de execução e por que ela é essa

1. **Fase 0** primeiro, porque sem uma linha em `copilot_sessions` nenhuma outra fase pode ser provada.
2. **Fase 1** em seguida, porque identidade é o que diferencia sugestão útil de sugestão genérica — e é o
   item do seu pedido que hoje **não tem nenhuma estrutura** no sistema.
3. **Fase 2** depois, porque agenda é valor imediato e independe de modelo de IA funcionar bem: ler e
   escrever lembrete é determinístico.
4. **Fase 3** depois das duas, porque a porta única só tem o que costurar quando identidade e memória
   existem.
5. **Fase 4** por último, porque treinar sem identidade, memória e porta única é treinar no vácuo.

---

## 8. Regras que valem em todas as fases

- Nada de mock, hardcode ou TODO: fase entregue é fase integrada ponta a ponta — rota, entrada na tela,
  hook, edge, tabela com RLS, estados de erro/carregando/vazio.
- Toda capacidade nova nasce **atrás de uma chave** que você pode desligar sem deploy.
- Nenhuma fase pode baixar o número de testes que passam, nem afrouxar regra de lint ou de tipo.
- DDL vai para arquivo versionado, PR, merge e só então apply — nunca direto no banco de produção.
- Custo de IA é medido: a tabela de preços (`ai_model_prices`, hoje com 0 linhas) é preenchida junto com a
  Fase 0, senão o número de custo que aparecer será zero por falta de dado, não por economia.

---

*Documento gerado durante a sessão https://claude.ai/code/session_014nTibTykNrjRNPQMaaWCKN*
