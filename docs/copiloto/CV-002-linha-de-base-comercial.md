# CV-002 — Linha de base comercial (setembro 2026)

> Fonte: banco `tnnnlkbymytvtqngbbqh`, **somente `SELECT`**, via MCP `SUPABASE - ZAPP WEB V2 - MCP`.
> Plano: etapa CV-002.
> Período de referência: setembro 2026 (maior volume antes da desconexão de 28/09).

## Resultado em uma frase

**Tempo de primeira resposta: p50 = 11 min, p95 = 1.236 min (20,6 h).** 70,9 % dos contatos recebem resposta em até 1 h; 29,1 % aguardam mais.

## 1. Velocidade de primeira resposta

| Métrica | Valor |
|---|---|
| Contatos com resposta em setembro | 378 |
| Respondidos em 5 min ou menos | 142 (37,6 %) |
| Respondidos em 1 h ou menos | 268 (70,9 %) |
| Respondidos após 1 h | 110 (29,1 %) |
| Média | 172,9 min |
| p50 (mediana) | 10,95 min |
| p95 | 1.236 min (~20,6 h) |

**Referência para D2 (CV-008):** linha de base = p95 1.236 min. Meta RADAR = p95 <= 60 min em 90 dias.

## 2. Dados de conversão (CRM/Bitrix)

Indisponível nesta fase: o CRM Bitrix24 é externo ao banco do Zapp Web V2. A taxa de conversão lead -> proposta -> fechamento precisa ser coletada manualmente do Bitrix24.

**Impacto na D1:** sem dado de conversão, o ROI projetado do RADAR é estimativa. D1 fica aberta até dados reais de `ai_model_prices`.

## 3. O que isto muda no plano

1. D2 pode ser provisoriamente fixada em p95 <= 60 min como meta de resposta inicial.
2. CV-008 (metas) usa estes números como linha de base: 37,6 % em 5 min -> meta 60 %; p95 1.236 min -> meta 60 min.
3. CV-003 complementa: profundidade das conversas qualifica quais dos 378 contatos chegaram a orçamento.
