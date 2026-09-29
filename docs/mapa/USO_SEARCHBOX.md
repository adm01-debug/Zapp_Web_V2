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

**Atualizado em 2026-09-27** (queries executadas contra produção, ~31h após o rollout):

| Métrica | Resultado |
|---|---|
| Sessões no mês (set/2026) | **8** (1,6% do teto de 500) |
| Sessões por dia | 2026-09-26: 8 · 2026-09-27: 0 |
| Por origem | `contact-form`: 6 · `picker`: 2 |
| Degradações do guarda | **0** (nenhuma vez ativou o fallback para `/forward`) |
| Custo estimado | **US$ 0,00** — projeção mensal ~240 sessões, dentro do teto grátis |

A flag `mapa.searchbox-autocomplete` foi ligada em `2026-09-26T13:20:15Z` (E48). O Apêndice B
do plano tem o histórico completo.

## C1 — perda de endereço no cadastro de contato (Fase 1 / E07)

**Medido em 2026-09-29, antes do deploy da Fase 1** (`select count(*) from public.contacts`):

| Métrica | Valor |
|---|---|
| Contatos no total | **3.104** |
| Contatos com `address` | **0** |
| Contatos com `city` | **0** |
| Contatos com `postal_code` | **0** |
| Contatos com `latitude` | **0** |
| Contatos atualizados desde o rollout da flag (26/09 13:20 UTC) | **24** |
| Sessões de autocomplete em `contact-form` | **6** |

Leitura: o autocomplete do cadastro rodou 6 vezes e **nenhum** endereço sobreviveu. A causa é o C1 —
a lista de contatos vem de `search_contacts`, que não devolvia as colunas de endereço, e o
`UPDATE` da edição gravava `null` em todas elas. Como as 24 edições de contato do período passaram
por esse caminho, o endereço digitado no cadastro era apagado na primeira edição.

**Limitação, sem maquiagem:** não existe backup lógico da linha anterior no repo e o trigger de
auditoria de endereço (`trg_audit_contact_address_change`) só passa a existir a partir da Fase 1 —
antes disso não havia trilha. Portanto os endereços digitados entre 26/09 e o deploy da Fase 1 **não
são recuperáveis**: o que sobrou é apenas a contagem acima (0). O que a Fase 1 garante é que a
próxima digitação sobrevive, e que uma nova regressão vira evento no `audit_logs`.

## Detecção de regressão do C1 (E96)

```sql
-- Esperado: 0 fora de apagamento intencional do endereço pelo operador.
select count(*)
from audit_logs
where action = 'contact_address_changed'
  and (details->>'cleared')::boolean
  and created_at > now() - interval '7 days';
```

Um número > 0 aqui significa que uma edição de contato esvaziou endereço e coordenada sem o
operador pedir — é o sintoma do C1 voltando. Rodar 1× depois de cada deploy que toque o módulo de
Contatos (o detalhe do evento é só `{contact_id, cleared}`, sem PII).

## Privacidade (E39)

- O termo digitado no picker vai para a Mapbox (`/suggest` e `/retrieve`, params `q`/`mapbox_id`) —
  é inerente ao autocomplete, não tem como evitar sem perder a função.
- `audit_logs` **nunca** recebe o termo digitado nem o endereço escolhido: `searchbox_session` só
  grava `source`; `searchbox_cost_guard` só grava `count`/`limit`. Conferido no código
  (`mapboxSession.ts`, `mapboxCostGuard.ts`) — nenhum dos dois `logAudit()` passa `query`/`term`.
- Retenção: `audit_logs` já está coberto por `docs/LGPD-RETENTION-POLICY.md` (5 anos, categoria
  Auditoria) — como os dois eventos novos não carregam dado pessoal, não precisam de exceção nem
  linha própria nessa política.
