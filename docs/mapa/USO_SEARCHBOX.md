# Uso do Mapbox Search Box — consultas de acompanhamento (E36)

**Fonte:** `audit_logs`, evento `searchbox_session` (gravado em `src/lib/mapboxSession.ts`, um
registro por sessão aberta — nunca por `/suggest`; ver E35). **Sem PII**: o registro só tem
`source` (quem pediu a sessão: `picker` e `contact-form`).

**Caminho principal: a view `public.searchbox_usage_daily` (E52).** Ela agrega por dia e e o que se
deve usar no dia a dia; as queries manuais que ela substitui ficam no **Apendice A**, para
conferencia independente. Colunas da view: `dia`, `sessoes`, `degradacoes`, `ultimo_evento_em`.

**Teto grátis da Mapbox:** 500 sessões/mês. Acima disso, US$ 3,00/1.000 sessões — e é isso que
`src/lib/mapboxCostGuard.ts` (E37) monitora via a RPC `count_searchbox_sessions_this_month()`,
degradando para `/forward` silenciosamente a partir de 450 sessões no mês (10% de folga).

## Sessões por dia (últimos 30 dias)

```sql
select dia, sessoes, degradacoes, ultimo_evento_em
from public.searchbox_usage_daily
where dia > current_date - interval '30 days'
order by dia desc;
```

## Sessões no mês corrente vs. o teto grátis

```sql
select
  coalesce(sum(sessoes), 0) as sessoes_mes,
  500 as teto_gratis,
  round(coalesce(sum(sessoes), 0)::numeric / 500 * 100, 1) as pct_do_teto
from public.searchbox_usage_daily
where dia >= date_trunc('month', now() at time zone 'America/Sao_Paulo')::date;
```

Mesmo numero que a RPC `count_searchbox_sessions_this_month()` devolve (ver migration
`20260926120500_searchbox_session_budget_rpc.sql`) - a versao em SQL acima serve para conferir
direto no banco, sem passar pelo client.

## Sessões por origem (`source`)

```sql
select details->>'source' as origem, count(*) as sessoes
from audit_logs
where action = 'searchbox_session'
group by 1
order by 2 desc;
```

## Quantas vezes o guarda de custo ja degradou

```sql
select dia, degradacoes
from public.searchbox_usage_daily
where degradacoes > 0
order by dia desc;
```

Para o detalhe de cada degradacao (`count`/`limit` no momento da degradacao), ver o Apendice A.

## Fechamento do primeiro mês — setembro/2026 fechado, outubro/2026 parcial (E99)

Medido em **2026-10-02** contra produção: view `searchbox_usage_daily` e `audit_logs`, **somente
`select`**, pelo gateway de leitura. Nenhum número aqui é estimado.

| Métrica | set/2026 (fechado) | out/2026 (parcial, até 02/10) |
|---|---|---|
| Sessões de busca | **11** | **1** |
| Seleções (`searchbox_selected`) | **não instrumentado** | **0** |
| Envios (`location_sent`) | **não instrumentado** | **0** |
| Aviso de orçamento | **0** | **0** |
| Degradações do guarda | **0** | **0** |
| Custo | **US$ 0,00** (11 de 500 grátis) | **US$ 0,00** |
| Sessões por dia | 26/09: 8 · 28/09: 2 · 30/09: 1 | 01/10: 1 |
| Por origem | `contact-form`: 7 · `picker`: 4 | 1 |

### Por que "não instrumentado" e não "zero" — medido no histórico do git

```
searchbox_session   introduzido 2026-09-26  (Fase 5, E35-E40)   -> existia durante o uso de setembro
searchbox_selected  introduzido 2026-10-01  (E49, PR #1441)     -> NAO existia em setembro
location_sent       introduzido 2026-10-01  (E49/E50)           -> NAO existia em setembro
```

Os zeros de setembro para seleção e envio **não são ausência de uso: são ausência de instrumentação**.
Escrever "0 seleções em setembro" afirmaria algo que o banco não tinha como registrar. O dado de
setembro **não existe e não é recuperável** — o que existe é a medição do que era instrumentado então.

### O que isso significa para a conta de custo

- **Custo de setembro é conclusivo:** 11 sessões, todas dentro das 500 grátis, **US$ 0,00**. O guarda
  nunca degradou e o aviso de orçamento nunca disparou — coerente com 2,2% do teto.
- **O funil do mês não é conclusivo:** dá para afirmar quanto se buscou (11 sessões), **não** quantas
  dessas buscas viraram endereço escolhido — porque esse evento nasceu em 01/10.
- **Outubro é o primeiro mês com o funil completo instrumentado.** É ele, não setembro, que fecha a
  conta de custo do primeiro mês de operação — e o acompanhamento passa a ser semanal enquanto o
  módulo ainda estiver em rampa.

### Limitação declarada

Não há como reconstruir as seleções de setembro (o evento não existia). Qualquer número de "conversão"
de setembro seria inventado — e é exatamente o tipo de número bonito que a auditoria de 29/09 pegou.

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

**Rodada 1× após a Fase 1 — resultado medido em 2026-10-02 (produção, somente `select`):**

| Medição | Resultado |
|---|---|
| Eventos `contact_address_changed` com `cleared=true` nos últimos 7 dias | **0** ✓ (esperado) |
| Eventos `contact_address_changed` **desde a criação do trigger** | **0** |
| Contatos `address is null or ''` | **3386** de 3386 |
| Contatos com endereço | **0** |

**Duas leituras, e a segunda é a que importa:**

1. **Nenhuma regressão do C1** — a query responde 0, como esperado depois da Fase 1.
2. **Mas esse 0 é um verde que nunca foi exercitado.** O trigger de auditoria **nunca registrou um
   evento sequer** desde que existe: com 0 eventos gravados, não dá para distinguir "nenhuma edição
   apagou endereço" de "o trigger não está disparando". Um verde que não pode falhar não é prova de
   nada — é preciso que a próxima edição real de contato com endereço gere o evento para o contrato
   passar a valer. Isso está aqui registrado para não ser confundido com cobertura.
3. O dano do C1 continua **total**: 3386 contatos, **0** com endereço. A Fase 1 impede a perda futura
   (a RPC `search_contacts` voltou a devolver as colunas e a edição deixou de gravar `null`), mas o que
   foi apagado não volta — não há backup lógico da linha anterior nem trilha anterior ao trigger.

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

## Apêndice A — queries originais (pré-view), mantidas para conferência

Estas são as consultas manuais que a view substituiu (E52/E85). Ficam aqui para auditoria
independente: **se a view e estas divergirem, a view está errada**.

```sql
-- A1. Sessões por dia (últimos 30 dias)
select date_trunc('day', created_at) as dia, count(*) as sessoes
from audit_logs
where action = 'searchbox_session'
  and created_at > now() - interval '30 days'
group by 1
order by 1 desc;

-- A2. Sessões no mês corrente vs. o teto grátis
select
  count(*) as sessoes_mes,
  500 as teto_gratis,
  round(count(*)::numeric / 500 * 100, 1) as pct_do_teto
from audit_logs
where action = 'searchbox_session'
  and created_at >= date_trunc('month', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo';

-- A3. Sessões por origem (source)
select details->>'source' as origem, count(*) as sessoes
from audit_logs
where action = 'searchbox_session'
group by 1
order by 2 desc;

-- A4. Detalhe de cada degradação do guarda de custo
select created_at, details->>'count' as sessoes_no_momento, details->>'limit' as limite
from audit_logs
where action = 'searchbox_cost_guard'
order by created_at desc;
```

> A A3 continua sendo a única consulta que vai direto em `audit_logs`: a view agrega por dia e não
> carrega a coluna `source` (que é o que diz se a sessão veio do `picker` ou do `contact-form`).
