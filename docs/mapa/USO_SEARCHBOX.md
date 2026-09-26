# Uso do Mapbox Search Box — consultas de acompanhamento (E36)

**Fonte:** `audit_logs`, evento `searchbox_session` (gravado em `src/lib/mapboxSession.ts`, um
registro por sessão aberta — nunca por `/suggest`; ver E35). **Sem PII**: o registro só tem
`source` (quem pediu a sessão: `picker`, e futuramente `contact-form` na Fase 6).

**Teto grátis da Mapbox:** 500 sessões/mês. Acima disso, US$ 3,00/1.000 sessões — e é isso que
`src/lib/mapboxCostGuard.ts` (E37) monitora via a RPC `count_searchbox_sessions_this_month()`,
degradando para `/forward` silenciosamente a partir de 450 sessões no mês (10% de folga).

## Sessões por dia (últimos 30 dias)

```sql
select date_trunc('day', created_at) as dia, count(*) as sessoes
from audit_logs
where action = 'searchbox_session'
  and created_at > now() - interval '30 days'
group by 1
order by 1 desc;
```

## Sessões no mês corrente vs. o teto grátis

```sql
select
  count(*) as sessoes_mes,
  500 as teto_gratis,
  round(count(*)::numeric / 500 * 100, 1) as pct_do_teto
from audit_logs
where action = 'searchbox_session'
  and created_at >= date_trunc('month', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo';
```

Mesma query que a RPC `count_searchbox_sessions_this_month()` usa internamente (ver migration
`20260926120500_searchbox_session_budget_rpc.sql`) — essa aqui é só a versão pra rodar direto no
banco quando quiser conferir o número manualmente, sem passar pelo client.

## Sessões por origem (`source`)

```sql
select details->>'source' as origem, count(*) as sessoes
from audit_logs
where action = 'searchbox_session'
group by 1
order by 2 desc;
```

## Quantas vezes o guarda de custo já degradou

```sql
select created_at, details->>'count' as sessoes_no_momento, details->>'limit' as limite
from audit_logs
where action = 'searchbox_cost_guard'
order by created_at desc;
```

## Primeiro mês medido

A flag `mapa.searchbox-autocomplete` está desligada em produção até o rollout (E48) — em
2026-09-26, `count(*) = 0` (ver Apêndice B do plano). O primeiro número real de sessões/mês só
aparece depois da flag ligada; atualizar o Apêndice B do plano quando isso acontecer.

## Privacidade (E39)

- O termo digitado no picker vai para a Mapbox (`/suggest` e `/retrieve`, params `q`/`mapbox_id`) —
  é inerente ao autocomplete, não tem como evitar sem perder a função.
- `audit_logs` **nunca** recebe o termo digitado nem o endereço escolhido: `searchbox_session` só
  grava `source`; `searchbox_cost_guard` só grava `count`/`limit`. Conferido no código
  (`mapboxSession.ts`, `mapboxCostGuard.ts`) — nenhum dos dois `logAudit()` passa `query`/`term`.
- Retenção: `audit_logs` já está coberto por `docs/LGPD-RETENTION-POLICY.md` (5 anos, categoria
  Auditoria) — como os dois eventos novos não carregam dado pessoal, não precisam de exceção nem
  linha própria nessa política.
