# Runbook — Autocomplete de endereço e mapa de contatos (módulo Mapbox Search Box)

**Quando usar:** alguém do atendimento relata um dos 4 sintomas abaixo. Cada cenário tem
**sintoma → causa → ação**, na ordem: primeiro o que se vê, depois por que acontece, depois o que
fazer. Comece sempre pelo cenário 1 antes de escalar: ele é a causa mais comum.

**Antes de tudo — o que este módulo é:** o campo de endereço (Inbox e cadastro de Contatos) chama a
Mapbox Search Box para sugerir endereços, e o mapa de contatos mostra o pino do endereço confirmado.
A telemetria vai para `audit_logs` (`searchbox_session`, `searchbox_cost_guard`) e a leitura agregada
é a view `searchbox_usage_daily` — ver `docs/mapa/USO_SEARCHBOX.md`.

## 1. "A lista de sugestões não aparece"

**Sintoma:** o operador digita o endereço e nenhuma sugestão aparece — nem erro, nem lista vazia.

**Causa:** nesta ordem (medida no código):

1. **Sessão expirada / não autenticada.** O token da Mapbox vem da edge function
   `get-mapbox-token`, que **exige sessão** e devolve **401 sem ela**. Sem token, o autocomplete não
   liga. É a causa mais comum e a mais fácil de descartar: recarregar a página resolve.
2. **Teto de custo atingido.** A partir de **450 sessões no mês** (de 500 grátis) o guarda de custo
   suspende o autocomplete **de propósito** e cai para `/forward`. Na UI isso aparece como **aviso**,
   não como falha — o status interno é `paused`, e `paused` **não é erro**.
3. **429 da Mapbox.** Rate limit do provedor: some sozinho, mas se repetir é caso de abrir chamado.

**Ação:**

```
# a) o token está vindo? (no console do navegador, rede)
#    procure a chamada para get-mapbox-token: 200 = ok, 401 = sessão
# b) o teto foi atingido? (SQL, banco canônico)
select sum(sessoes) as sessoes_mes
from public.searchbox_usage_daily
where dia >= date_trunc('month', now() at time zone 'America/Sao_Paulo')::date;
#    >= 450  -> é o guarda trabalhando: NÃO é incidente, é proteção de custo
#    < 450 e sem token -> sessão/edge function (item 1)
```

Se o teto foi atingido, **não "conserte" subindo o limite sem falar com o responsável**: o limite
existe para parar o custo.

## 2. "O custo do Mapbox está subindo"

**Sintoma:** o painel da Mapbox mostra consumo acima do esperado, ou alguém nota US$ onde esperava zero.

**Causa:** sessões de busca acima do previsto — cada sessão custa depois das 500 grátis
(US$ 3,00/1.000). Ou o guarda não está contando (defeito), ou o uso cresceu de verdade.

**Ação:**

```sql
-- quanto, por dia, e quantas degradações (o guarda agiu?)
select dia, sessoes, degradacoes, ultimo_evento_em
from public.searchbox_usage_daily
where dia > current_date - interval '30 days'
order by dia desc;

-- por origem: quem está puxando? (a view não tem 'source'; ver Apêndice A do USO_SEARCHBOX.md)
select details->>'source' as origem, count(*) as sessoes
from public.audit_logs
where action = 'searchbox_session'
  and created_at >= date_trunc('month', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo'
group by 1 order by 2 desc;
```

Referência real: **setembro/2026 fechou em 11 sessões** (2,2% do teto), com **0 degradações** —
`contact-form` 7 e `picker` 4. Se o número de hoje estiver muito acima disso, é crescimento real de
uso, não defeito: fale com o responsável antes de mexer em limite.

## 3. "O endereço sumiu" (regressão do C1)

**Sintoma:** o operador cadastra/edita um contato com endereço e, na próxima edição, o endereço
aparece **vazio** — e às vezes também o mapa perde o pino.

**Causa:** é o **defeito C1** voltando. A lista de contatos vem da RPC `search_contacts`; quando ela
não devolve as colunas de endereço (`address`, `city`, `postal_code`, `latitude`, `longitude`), o
`UPDATE` da edição grava `null` em todas e o endereço digitado é apagado. Foi exatamente o que
aconteceu antes da Fase 1: **3.104 contatos, 0 com endereço, 24 edições e nenhum endereço
sobreviveu**. A Fase 1 corrigiu a RPC e criou o trigger de auditoria
(`trg_audit_contact_address_change`).

**Ação — a query de detecção (E96), rodar 1× depois de cada deploy do módulo de Contatos:**

```sql
-- Esperado: 0 fora do apagamento intencional pelo operador.
select count(*)
from public.audit_logs
where action = 'contact_address_changed'
  and (details->>'cleared')::boolean
  and created_at > now() - interval '7 days';
```

`> 0` significa que uma edição esvaziou endereço **sem o operador ter pedido** — é o C1 de volta.
Nesse caso: **não** peça para o atendimento redigitar (o dado apagado não volta — não há backup
lógico da linha anterior e, antes da Fase 1, não havia trilha de auditoria); a ação é reverter o
deploy que introduziu a regressão e reabrir a correção da RPC `search_contacts`.

Para inspecionar contatos sem endereço (contagem, sem PII):

```sql
select count(*) filter (where address is null or address = '') as sem_endereco,
       count(*) as total
from public.contacts;
```

## 4. "O pino não aparece no mapa"

**Sintoma:** o contato tem endereço, mas o mapa não mostra o ponto — ou mostra outro lugar.

**Causa:** o pino depende de **`latitude`/`longitude`** na linha do contato, e essas colunas vêm da
mesma RPC `search_contacts` do cenário 3 — ou seja, o pino ausente costuma ser o **mesmo defeito**
(C1), na metade dos dados que o mapa usa. Endereço em texto sem coordenada não vira pino: o mapa não
geocodifica o texto, ele plota o que já está gravado.

**Ação:**

```sql
-- tem endereço em texto mas não tem coordenada? (é o sintoma exato)
select count(*) filter (where lat is null or lng is null) as sem_coordenada,
       count(*) as com_endereco
from public.contacts
where address is not null and address <> '';
```

- `sem_coordenada > 0` e `com_endereco` alto → o operador confirmou o endereço mas a coordenada não
  foi gravada: trate como o cenário 3 (mesma RPC).
- Se a coordenada existe e o pino não aparece, o problema é de render do mapa — aí é caso de código,
  não de dado: registre o contato afetado (**sem copiar dado de cliente para fora da infra**) e
  escale.

## Reversão — como desligar este módulo

**Atenção, isto é o que o código realmente tem hoje — não existe `UPDATE feature_flags` para este
módulo.** A tabela `feature_flags` existe no projeto (é usada por recursos de Talk X), mas **o
autocomplete não tem linha nela**: a flag do autocomplete foi removida pela decisão
`20261001-103207-6c0b`, que trocou "desligar por flag" por "reverter o código". Escrever um
`UPDATE feature_flags …` aqui seria um comando que não faz nada — e num incidente isso custa os
minutos que este runbook existe para salvar.

O que **realmente** desliga cada parte:

| O que reverter | Como | Efeito |
|---|---|---|
| Autocomplete de endereço (Inbox e Contatos) | `git revert` do PR da funcionalidade + deploy | o campo volta a ser texto livre; nenhuma sessão é criada |
| Sugestões continuam mas o custo preocupa | baixar `VITE_SEARCHBOX_MONTHLY_SESSION_LIMIT` (variável de ambiente, não flag de banco) e redeployar | o guarda passa a degradar para `/forward` mais cedo |
| Pino do mapa de contatos | `git revert` do PR do mapa | o mapa deixa de ser renderizado |

**Nunca** para conter custo: apagar `audit_logs` (é a trilha de auditoria) ou zerar a view (ela só
lê os eventos). Nenhuma trava de custo do módulo é feita por DDL — todas são código + variável de
ambiente, o que significa que **a reversão também é deploy**, e o deploy é por PR (não por console).
