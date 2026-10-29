# CV-003 — Inventário de momentos de venda (setembro 2026)

> Fonte: banco `tnnnlkbymytvtqngbbqh`, **somente `SELECT`**.
> Plano: etapa CV-003.
> Período: setembro 2026.

## Resultado em uma frase

**321 contatos trocaram 30+ mensagens (28.868 no total):** são as conversas que chegam a orçamento. O RADAR deve focar neste grupo — 28 % dos contatos ativos, mas virtualmente 100 % do valor de vendas.

## 1. Profundidade de conversa

| Faixa de mensagens | Contatos | Provável estágio |
|---|---|---|
| 1–3 mensagens | 467 | Abandonado / consulta rápida |
| 4–10 mensagens | 380 | Conversa curta — interesse inicial |
| 11–30 mensagens | 331 | Engajamento médio — em orçamento |
| 30+ mensagens | 321 | Conversa de venda profunda |

**Total de mensagens nas conversas 30+:** 28.868

## 2. Mix de tipos de mensagem (setembro)

| Tipo | Contagens | Contatos distintos |
|---|---|---|
| Texto | 31.687 | 1.455 |
| Imagem | 2.793 | — |
| Áudio | 2.348 | — |
| Documento | 501 | — |

**Nota:** áudio (~8 % das mensagens) e imagem (~9 %) são frequentes. O RADAR deve reconhecer que `ai-transcribe-audio` é necessário para ler o contexto completo das conversas de voz.

## 3. Momentos de venda identificados

| Momento | Gatilho | Ação do RADAR |
|---|---|---|
| Abertura | 1ª mensagem do contato | Sugerir saudação + descobrir B (Budget) |
| Produto | Pergunta sobre item / envio de catálogo | Sugerir descrição + capturar N (Número) |
| Orçamento | "quanto custa" / "pode fazer" | Sugerir proposta + capturar D (Data) |
| Objeção | "caro" / "prazo" / "concorrente" | Sugerir contra-argumento do catálogo CV-006 |
| Follow-up | 24h sem resposta do contato | Lembrete de retomada |
| Fechamento | "fechado" / "ok" / "pode enviar" | Sugerir confirmação de pedido + E (Entrega) |

## 4. O que isto muda no plano

1. **Prioridade de filtragem no RADAR:** processar apenas conversas com 4+ mensagens (exclui 30 % de consultas relâmpago sem valor).
2. **Áudio exige transcrição ativa:** `ai-transcribe-audio` deve estar habilitado para o RADAR ler o contexto completo.
3. **CV-004** (taxonomia) formaliza os 6 estágios acima com critérios mensuráveis.
