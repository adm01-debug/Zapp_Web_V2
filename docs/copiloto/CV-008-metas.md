# CV-008 — Metas provisórias do RADAR (piloto 90 dias)

> Plano: etapa CV-008 — definir os KPIs de sucesso do piloto e os gatilhos de desligamento.
> Estas metas são PROVISÓRIAS: D1–D5 (CV-009) podem revisá-las antes do go-live.

## Resultado em uma frase

**5 KPIs mensuráveis a partir do banco existente, com linha de base de setembro 2026.** O RADAR é desligado automaticamente se D1 (custo) estourar; os demais são gatilhos de revisão, não de desligamento automático.

## 1. KPI-1 — Custo por chamada de IA (D1)

| Métrica | Linha de base | Meta piloto (90 dias) |
|---|---|---|
| Custo médio por chamada `copilot-live` | Indisponível (`ai_model_prices` vazia) | ≤ R$ 0,05 por chamada |
| Custo total mensal do RADAR | — | ≤ R$ 300/mês |

**Status D1:** ABERTA — sem preço de modelo cadastrado. Pré-requisito: popular `ai_model_prices` com o modelo escolhido para `copilot-live` (CV-021).
**Gatilho automático:** se custo/chamada > R$ 0,10, desligar `ai.capability.copilot_live` automaticamente via `feature_flags`.

## 2. KPI-2 — Velocidade de primeira resposta (D2)

| Métrica | Linha de base (set/26) | Meta piloto (90 dias) |
|---|---|---|
| p50 de primeira resposta | 10,95 min | ≤ 8 min |
| p95 de primeira resposta | 1.236 min | ≤ 60 min |
| % respondidos em ≤ 5 min | 37,6 % | ≥ 60 % |

**Medição:** query semanal na tabela `messages` (igual a CV-002). Revisão no dia 30 e dia 90 do piloto.

## 3. KPI-3 — Adoção pelos vendedores (D3)

| Métrica | Linha de base | Meta piloto (90 dias) |
|---|---|---|
| % de sugestões clicadas (enviadas) | 0 % (nunca registrado) | ≥ 30 % |
| Vendedores ativos usando o RADAR | 0 | ≥ 3 |

**Medição:** `copilot_feedback.action = 'sent'` (CV-013) / total de sugestões exibidas. Revisão semanal.
**Gatilho de revisão:** se adoção < 10 % após 30 dias, revisão de produto antes de continuar.

## 4. KPI-4 — Impacto na conversão (D4)

| Métrica | Linha de base | Meta piloto (90 dias) |
|---|---|---|
| % de conversas 11–30 msgs que chegam a proposta | Indisponível (sem CRM) | +10 pp |
| % de conversas 30+ msgs que fecham pedido | Indisponível (sem CRM) | +5 pp |

**Status:** depende de integração Bitrix24 para dado real. Medir por proxy: `copilot_sessions` com `stage = E5` ou `E6` (CV-004).

## 5. KPI-5 — Completude do B·R·I·N·D·E (D5)

| Métrica | Linha de base | Meta piloto (90 dias) |
|---|---|---|
| % de conversas 30+ msgs com ≥ 4 campos B·R·I·N·D·E preenchidos | — (não medido antes) | ≥ 80 % |
| Campos mais frequentemente vazios | — | Monitorar mensalmente |

**Medição:** `copilot_sessions.brinde_state` (CV-011) — contagem de campos `null` por conversa.

## 6. Condições de desligamento automático

| Condição | Ação |
|---|---|---|
| Custo/chamada > R$ 0,10 | Desligar `ai.capability.copilot_live` via `feature_flags` |
| Adoção < 5 % após 60 dias | Pausa para revisão de produto (decisão de Joaquim) |
| Taxa de erro da Edge > 10 % | Circuit breaker já existente em `ai-circuit.ts` |

## 7. O que isto muda no plano

1. D1 não pode ser finalizada sem cadastrar `ai_model_prices` — ação antes do go-live (CV-009).
2. D3 requer que `copilot_feedback` (CV-013) esteja implementado antes de medir adoção.
3. O dashboard de métricas (CV-140–CV-150) usa estas 5 KPIs como origem.
