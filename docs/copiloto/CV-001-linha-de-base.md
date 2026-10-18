# CV-001 — Linha de base de uso e custo de IA (medido em 2026-10-16)

> Fonte: banco oficial `tnnnlkbymytvtqngbbqh`, **somente `SELECT`**, via MCP `SUPABASE - ZAPP WEB V2 - MCP`.
> Plano: `docs/plans/PLANO_COPILOTO_VENDAS_AO_VIVO_150_ETAPAS_2026-10-16.md` (etapa CV-001).

## Resultado em uma frase

**Não há linha de base de IA para medir:** as funções que o RADAR reaproveita nunca registraram uma
única chamada em produção, a tabela de preços está vazia e o WhatsApp principal está desconectado,
com o volume de mensagens praticamente zerado desde o fim de setembro. A decisão D1 (teto de custo)
**não pode** ser tomada com dado real hoje.

## 1. Uso de IA registrado (`ai_usage_logs`, últimos 90 dias)

O registro existe desde 2026-08-28 e tem **31 linhas no total**.

| Função | Chamadas | Falhas | Usuários | Tokens entrada | Tokens saída | p50 | p95 | Período | Modelos |
|---|---|---|---|---|---|---|---|---|---|
| `ai-proxy` | 13 | 6 | 1 | 6.095 | 17.800 | 468 ms | 612 ms | 28/08 – 05/10 | deepseek-flash, deepseek-v4-flash, gpt-4o |
| `classify-sticker` | 7 | 0 | 1 | 8.295 | 115 | 2.696 ms | 4.414 ms | 02/10 | google/gemini-3.8-flash |
| `classify-audio-meme` | 4 | 4 | 1 | 0 | 0 | 1.577 ms | 3.121 ms | 02/10 | deepseek-v4-flash |
| `classify-emoji` | 3 | 2 | 1 | 1.216 | 16 | 3.130 ms | 3.130 ms | 02/10 | google/gemini-3.8-flash |
| `elevenlabs-scribe-token` | 2 | 0 | 1 | — | — | 359 ms | 404 ms | 10/10 – 11/10 | — |
| `voice-agent` | 2 | 2 | 1 | 0 | 0 | 1.544 ms | 1.882 ms | 02/10 | deepseek-v4-flash |

**Zero linhas** para `ai-suggest-reply`, `automation-suggest-reply`, `ai-conversation-analysis` e
`ai-enhance-message` — justamente as funções que o RADAR reaproveita. As quatro chamam o registro de
uso no código (`_shared/ai-usage.ts` via `ai-generate.ts`), então a leitura mais provável é que
**ninguém usou essas funções em produção** (todas as 31 linhas vêm de **1 único usuário**, padrão
de teste). Não foi possível descartar, só por leitura, uma falha silenciosa de gravação do registro.

Confirmação independente: `conversation_analyses` (onde a "Visão" grava cada análise) tem
**0 linhas desde sempre**.

## 2. Custo

`ai_model_prices` está **vazia**: não existe preço cadastrado para nenhum modelo, então o sistema não
consegue transformar tokens em reais. Sem isso, nem o painel de custos atual nem o RADAR conseguem
mostrar gasto em R$.

`ai_budget_reservations`: 6 reservas no total.

## 3. Fila de IA (`ai_jobs`)

171 jobs, **todos** do tipo `effect.reconcile`, **todos `failed`** (8 de 8 tentativas), o último em
2026-10-11. A fila que o RADAR usaria (CV-014) hoje só contém falhas de reconciliação.

## 4. Volume de conversas (o que alimentaria o RADAR)

| Semana | Mensagens | Do cliente | Contatos distintos |
|---|---|---|---|
| 24/08 | 3.676 | 2.588 | 327 |
| 31/08 | 13.970 | 10.548 | 832 |
| 07/09 | 10.738 | 10.014 | 665 |
| 14/09 | 12.186 | 11.440 | 657 |
| 21/09 | 7.589 | 6.992 | 522 |
| 28/09 | 5.206 | 4.313 | **3** |
| 05/10 | 88 | 76 | 3 |

Últimos 9 dias: 6 mensagens em 07/10 e 6 em 11/10; nenhuma depois de 2026-10-11 14:23 UTC.
A conexão "Promo Brindes WhatsApp" está `disconnected` (última atualização 2026-10-16 17:47 UTC).

Ordem de grandeza útil para o RADAR, **medida no período ativo (setembro)**: cerca de **10 mil
mensagens de cliente por semana**, de 500–800 contatos. Com a janela de rajada (CV-015), isso é o
teto de "ticks" por semana antes de qualquer filtro (só vendas, presença, momento-chave).

## 5. O que isto muda no plano

1. **D1 continua aberta** — sem preço de modelo e sem uso real, qualquer teto seria chute.
   Pré-requisitos: cadastrar preços em `ai_model_prices` e ter uso real de `ai-suggest-reply` por
   algumas semanas (ou medir o custo por chamada num ensaio controlado).
2. **CV-002 (linha de base comercial) fica sem dado recente** enquanto o WhatsApp principal estiver
   desconectado; usar setembro como período de referência.
3. O fato de as sugestões sob clique **nunca terem sido usadas** é por si só um achado de produto:
   antes de automatizar (RADAR), vale entender por que o vendedor não clica hoje — descoberta,
   confiança ou utilidade. Isso entra como pergunta da CV-003.

## Consultas usadas (todas `SELECT`)

```sql
select function_name, count(*), count(*) filter (where status<>'success'), count(distinct coalesce(user_id,profile_id)),
       sum(input_tokens), sum(output_tokens), round(avg(total_tokens)),
       percentile_disc(0.5) within group (order by duration_ms), percentile_disc(0.95) within group (order by duration_ms),
       min(created_at)::date, max(created_at)::date, string_agg(distinct model, ', ')
from ai_usage_logs where created_at > now() - interval '90 days' group by 1 order by 2 desc;

select model, unit, currency, unit_price, valid_from, valid_to, source from ai_model_prices;

select (select count(*) from ai_usage_logs), (select count(*) from conversation_analyses),
       (select count(*) from ai_jobs), (select count(*) from ai_budget_reservations);

select kind, status, count(*), max(created_at)::date from ai_jobs group by 1,2;

select date_trunc('week', created_at)::date, count(*), count(*) filter (where sender='contact'), count(distinct contact_id)
from messages where created_at > now()-interval '120 days' group by 1 order by 1;

select name, status, updated_at from whatsapp_connections order by updated_at desc;
```
