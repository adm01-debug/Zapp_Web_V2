# Health Score do painel ("Saúde do Sistema")

- **Última atualização:** 2026-10-13
- **Escopo:** como a nota 0–100 do card *Saúde do Sistema* é calculada na V2.
- **Fontes (código atual, V2):** `src/components/dashboard/systemHealth.ts`,
  `src/hooks/system/useSystemHealthSignals.ts`,
  `src/components/dashboard/overview/SystemHealthCard.tsx`.

## Onde vive cada parte

| Papel | Arquivo |
| --- | --- |
| Regra pura (sinais → nota) | `src/components/dashboard/systemHealth.ts` |
| Coleta dos sinais no banco | `src/hooks/system/useSystemHealthSignals.ts` |
| Card que exibe a nota | `src/components/dashboard/overview/SystemHealthCard.tsx` |

A regra fica num `.ts` separado porque o componente `.tsx` não pode exportar
símbolos além do componente (regra de lint `react-refresh/only-export-components`,
nota em `src/components/dashboard/systemHealth.ts:5-7`).

## Diferença em relação à V3

A V3 calcula a nota no servidor (RPC `zapp.fn_system_health_score()`). **Na V2
essa RPC não existe**: a nota é derivada no cliente (`deriveSystemHealth`) a
partir de três sinais que a V2 já lê hoje. Isso está descrito no cabeçalho de
`src/components/dashboard/systemHealth.ts:3-5`.

## De onde vêm os sinais

`src/hooks/system/useSystemHealthSignals.ts` dispara **um** `useQuery` com quatro
consultas em paralelo (`:36-48`):

- `whatsapp_connections` → `status, health_status` (`:44`)
- `messages` com `sender = 'agent'`, `status = 'failed'` e `created_at >= since` (`:45`)
- `messages` com `sender = 'agent'` e `created_at >= since` (denominador da taxa) (`:46`)
- `messages` com `status = 'sending'` e `created_at < stallBefore` (`:47`)

As janelas são fixas no hook (`:31-32`):

- `FAILURE_WINDOW_MS = 24 h` → falhas de envio das últimas 24 h.
- `STALL_WINDOW_MS = 5 min` → mensagem em `sending` há mais de 5 min conta como presa.

Se **qualquer** uma das quatro consultas falha, o hook devolve erro
(`:50-52`) e o card mostra o estado de erro com botão de nova tentativa em vez
da nota (`src/components/dashboard/overview/SystemHealthCard.tsx:33-41`).

## A nota (máximo 100)

A soma dos três sinais dá a nota final (`deriveSystemHealth`,
`src/components/dashboard/systemHealth.ts:120-128`). Os pesos são constantes
exportadas (`:41-47`).

### 1. Conexões WhatsApp — até 40 pontos

Fórmula (`connectionSignal`, `src/components/dashboard/systemHealth.ts:64-83`):

```
score = round( 40 * (saudáveis + 0.5 * degradadas) / total )
```

- Só entra na conta a conexão com `status = 'connected'`. Dentre essas, o
  `health_status = 'degraded'` vale meio ponto e as demais valem um ponto.
- Sem nenhuma conexão cadastrada, a nota do sinal é **0** (`:66-68`).
- Status: `ok` com 40 pontos, `warn` com nota parcial, `bad` com 0 (`:78`).

### 2. Mensagens com falha (24h) — até 30 pontos

Fórmula (`failureSignal`, `src/components/dashboard/systemHealth.ts:85-97`):

```
taxa  = falhas / envios            (envios = sender 'agent' nas últimas 24 h)
score = round( 30 * (1 - min(1, taxa / 0.1)) )
```

- `FAILURE_ZERO_RATE = 0.1`: taxa de falha de **10% ou mais** zera o sinal (`:44`).
- Sem nenhum envio nas últimas 24 h, a nota é o máximo (30) e o resumo diz
  "Nenhum envio nas últimas 24h" (`:86-88`).
- Status: `ok` sem falhas, `bad` a partir de 10% de falha, `warn` no meio (`:91`).

### 3. Fila de envio — até 30 pontos

Fórmula (`stalledSignal`, `src/components/dashboard/systemHealth.ts:99-107`):

```
score = max(0, 30 - presas * 10)
```

- `STALLED_STEP = 10`: cada mensagem presa tira 10 pontos; **3 presas zeram** o
  sinal (`:46`).
- Status: `ok` com 0 presas, `bad` com 3 ou mais, `warn` com 1 ou 2 (`:101`).

## Faixas da nota (grade)

`src/components/dashboard/systemHealth.ts:49-54`:

| Nota | Grade | Rótulo | Tom |
| --- | --- | --- | --- |
| 90–100 | `excelente` | Excelente | success |
| 70–89 | `bom` | Bom | info |
| 50–69 | `atencao` | Atenção | warning |
| 0–49 | `critico` | Crítico | danger |

## O que a nota **não** mede

- Não mede SLA, sentimento nem tarefas — esses vivem em outros cards do painel.
- Não há teto inventado: o comentário do próprio módulo
  (`src/components/dashboard/systemHealth.ts:110`) registra que a nota sai
  "sempre a partir dos sinais reais".

## Como conferir rápido

```bash
npx vitest run src/components/dashboard/__tests__/systemHealth.test.ts
npx vitest run src/components/dashboard/__tests__/SystemHealthCard.test.tsx
```

Os dois arquivos citados acima existem no repositório e cobrem,
respectivamente, a regra pura e o card.
