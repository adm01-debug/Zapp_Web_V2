# CV-004 — Taxonomia das etapas de venda (brindes promocionais)

> Plano: etapa CV-004 — definir formalmente os estágios do funil de venda de brindes.
> Serve de base para o estado da máquina B·R·I·N·D·E (CV-005) e para o prompt do RADAR.

## Resultado em uma frase

**6 estágios, cada um com critério de entrada e saída mensuráveis**, mapeados sobre o fluxo real de WhatsApp. O RADAR usa esta taxonomia para saber em que ponto da venda cada conversa está e qual sugestão entregar.

## 1. Os 6 estágios

### E1 — Recepção
**Definição:** contato acabou de enviar a primeira mensagem; atendente ainda não respondeu.  
**Entrada:** nova conversa iniciada pelo contato.  
**Saída:** atendente respondeu (→ E2) ou contato abandonou em < 3 mensagens (→ fim).  
**Sinal RADAR:** sugestão de saudação + pergunta aberta de intenção ("Olá! Em que posso ajudar? É para qual ocasião?").

### E2 — Descoberta
**Definição:** levantamento das 6 variáveis B·R·I·N·D·E. Estágio mais longo e crítico.  
**Entrada:** atendente respondeu a saudação inicial.  
**Saída:** ≥ 4 dos 6 campos de B·R·I·N·D·E coletados (→ E3) ou contato desengaja (→ E5 / fim).  
**Sinal RADAR:** detecta campos faltantes e sugere pergunta para preenchê-los.  
**Duração típica:** 4–15 mensagens.

### E3 — Proposta
**Definição:** atendente tem insumo suficiente para enviar cotação.  
**Entrada:** ≥ 4 campos de B·R·I·N·D·E preenchidos (N + D obrigatórios).  
**Saída:** contato aceita (→ E4), pede revisão (→ E2 parcial) ou objeta (→ E4-objeção).  
**Sinal RADAR:** sugestão de formatação de proposta com os dados coletados.  
**Duração típica:** 1–3 mensagens.

### E4 — Negociação / Objeção
**Definição:** contato reagiu à proposta com dúvida, objeção de preço ou prazo.  
**Entrada:** proposta enviada + resposta com gatilho de objeção (ver CV-006).  
**Saída:** objeção resolvida → E3 revisado ou → E5 (fechamento); contato abandona → E5 follow-up.  
**Sinal RADAR:** sugere contra-argumento do catálogo CV-006, oferta de amostra ou desconto.

### E5 — Fechamento
**Definição:** contato sinaliza aceite ou pedido.  
**Entrada:** gatilho de aceite: "ok", "fechado", "pode mandar", "boleto", confirmação explícita.  
**Saída:** pedido confirmado com campo E (Entrega) preenchido → E6.  
**Sinal RADAR:** sugestão de confirmação de pedido + solicitação de endereço de entrega.

### E6 — Pós-venda
**Definição:** pedido aceito; acompanhamento até entrega.  
**Entrada:** confirmação do pedido.  
**Saída:** entrega confirmada pelo contato ou 30 dias sem mensagem.  
**Sinal RADAR:** lembrete de status de produção + confirmação de recebimento.

## 2. Tabela resumo

| Estágio | Nome | Campos B·R·I·N·D·E esperados | Mensagens típicas |
|---|---|---|---|
| E1 | Recepção | — | 1–2 |
| E2 | Descoberta | B, R, I, N, D, E (progressivo) | 4–15 |
| E3 | Proposta | N + D obrigatórios | 1–3 |
| E4 | Negociação | todos preenchidos | 2–8 |
| E5 | Fechamento | todos preenchidos | 1–3 |
| E6 | Pós-venda | todos preenchidos | 1–5 |

## 3. Mapeamento com `copilot_sessions` (CV-011)

A coluna `stage` da tabela `copilot_sessions` usará os valores `E1`–`E6` desta taxonomia. A transição de estágio é registrada em `copilot_insights` junto com o campo B·R·I·N·D·E que mudou.

## 4. O que isto muda no plano

1. O schema de `copilot_sessions.stage` (CV-011) deve usar o enum `E1`–`E6`.
2. O prompt do edge `copilot-live` (CV-021) referencia esta taxonomia para determinar qual sugestão entregar.
3. CV-005 detalha como os campos B·R·I·N·D·E são detectados dentro de E2.
