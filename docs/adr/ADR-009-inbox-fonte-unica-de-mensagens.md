# ADR-009 — Fonte única de mensagens da caixa de entrada

- Status: aceito (documenta o que já vigora na base `dia/2026-10-13`)
- Tipo: documentação de decisão. Não muda código, migration nem deploy.
- Relacionados: `docs/REALTIME-CHANNELS-INVENTORY.md`, `docs/JORNADA_MENSAGEM_WHATSAPP.md`

## Contexto

O código carrega duas leituras possíveis da caixa de entrada:

1. **Banco do projeto** (`public.messages`), com a lista vinda de
   `src/hooks/chat/useRealtimeMessages.ts` e atualizada por Supabase Realtime.
2. **Banco "externo" (FATOR X)**, hooks `useExternalConversations`/`useExternalMessages` em
   `src/hooks/integrations/useExternalEvolution.ts`, que leem `evolution_messages` com polling de 5 s
   (`src/hooks/integrations/useExternalEvolution.ts:22`) e montam a tela por adapters.

A escolha é feita por uma flag fixa em `src/hooks/inbox/useRealtimeInbox.ts:19-20`:

```ts
// Feature flag: use external evolution DB as data source
const USE_EXTERNAL_DB = false;
```

Como a flag é `false` e não há formulário/tela que a mude, **todo consumo passa pelo caminho 1**:
`conversations`, `loading` e `error` saem de `useRealtimeMessages` (`useRealtimeInbox.ts:29-31`), e
o envio e o "marcar como lido" também são do caminho local (`useRealtimeInbox.ts:39-40`).

O próprio arquivo externo declara a origem do legado: `evolution_messages` pertencia à instalação
Evolution API antiga (infra AtomicaBR/wpp2 / instância v2), desativada; a instalação atual é a
Evolution GO, cujo webhook grava **no banco local** (`useExternalEvolution.ts:5-8`).

## Decisão

**Uma única fonte de verdade para a mensagem visível: `public.messages` do banco do projeto.**
O Realtime é o canal de atualização dessa fonte (inventário completo em
`docs/REALTIME-CHANNELS-INVENTORY.md`). O caminho de banco externo permanece **desligado** e não é
reativado contra a infra antiga.

Nada de leitura dupla: a tela nunca mostra, ao mesmo tempo, uma linha vinda de
`evolution_messages` e outra vinda de `messages`. Ou é uma, ou é a outra — e hoje é a local.

## Consistência com o Zapp Web V3

O ADR equivalente do V3 escolheu o mesmo princípio — uma fonte por vez, escolhida de forma
explícita, nunca leitura dupla implícita — com o caminho de cursor do Evolution como primário e
fallback visível/telemetrado. Este ADR não contradiz aquele: o V2 já cumpre "uma fonte, escolhida
por flag explícita"; o que muda entre os projetos é qual infraestrutura alimenta essa fonte
(no V2, o webhook grava no banco local). Qualquer adoção futura de segunda fonte no V2 exige ADR
novo e migration própria, como no V3.

## Consequências

- Positivas: um só registro por mensagem; badge, contador, lista e painel de conversa leem a mesma
  linha; o recibo de entrega também é `update`/`upsert` nessa mesma linha
  (`supabase/functions/_shared/evolution-webhook-messages.ts:363` e `:373`).
- Negativas: o caminho externo continua no repositório como dívida morta — não foi removido aqui
  (fora do escopo desta documentação). Enquanto a flag existir, alguém pode virá-la por engano.
- Privacidade: o Realtime só entrega as colunas publicadas explicitamente na publication
  (`supabase_realtime`); ver a seção 5 do inventário.

## Como revisar (o que um ADR futuro precisa cobrir)

Reativar o caminho externo, criar uma segunda fonte ou trocar a flag exige: (a) ADR novo, (b) prova
de que não há leitura dupla na tela, (c) publicação Realtime conferida contra a nova tabela. Trocar
`USE_EXTERNAL_DB` sem isso é regressão, não configuração.

## Fontes citadas (código de hoje, não intenção)

- `src/hooks/inbox/useRealtimeInbox.ts:19-20` (flag e comentário)
- `src/hooks/inbox/useRealtimeInbox.ts:29-31` (seleção da fonte de dados)
- `src/hooks/integrations/useExternalEvolution.ts:5-8` (legado e por que não reativar)
- `src/hooks/integrations/useExternalEvolution.ts:22` (polling de 5 s do caminho externo)
- `src/hooks/chat/useRealtimeMessages.ts:215-228` (fonte local por Realtime)
