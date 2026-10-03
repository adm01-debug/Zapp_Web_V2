# Incidente — a suíte de testes do repo falava com o banco de PRODUÇÃO

**Data do diagnóstico:** 03/10/2026 · **Fonte:** LOCALIZADA e CORRIGIDA (PR no repo)

> Complementa `docs/runbooks/auth-pendurado-saturacao-postgres.md`, que descrevia o sintoma
> ("cliente `node` em loop de 401") sem identificar o autor. **Este documento fecha a autoria: era a
> própria suíte de testes deste repositório.**

## Resumo

O "cliente `node` em loop" que causou ~30 mil `401`/`42501` por dia e contribuiu para a saturação do
Postgres (Auth pendurado) **não era um serviço externo nem o n8n**: era o `vitest` deste repositório.

O cliente Supabase do app (`src/integrations/supabase/client.ts`) tem a **URL e a anon key de produção
fixas no código** — de propósito, e a key é pública por design (o próprio arquivo explica). Um teste que
monta um componente **sem mockar o cliente** acaba fazendo request **real** contra produção. O request é
negado por RLS (`42501` → `401` na borda), o React Query retenta, e **o teste PASSA** — porque falhar na
rede não quebra as asserções. O vazamento é silencioso.

## Medição — antes da correção

| Métrica | Valor |
|---|---|
| Requests a `tnnnlkbymytvtqngbbqh.supabase.co` por execução da suíte | **408** |
| ├ `/rest/v1/catalog_send_events` | **370** |
| ├ `/functions/v1/promogifts-catalog` | 28 |
| └ `/rest/v1/rpc/log_audit_event` | 10 |
| Testes | 494 arquivos · **5.946 passando** (nenhum quebra por causa disso) |
| Arquivo que mais vaza sozinho | `src/components/catalog/__tests__/ExternalProductManagement.test.tsx` — **279 tentativas** em 35 testes |

**Medido na produção** (janela de 24 h, `user-agent: node`):

| Origem (ASN) | Requests | IPs | Janela |
|---|---|---|---|
| Microsoft Corporation (AS8637 / Azure) | 13.999 | 144 | 02/10 11:00 → **03/10 10:55** |
| Microsoft Limited | 9.262 | 97 | 02/10 11:00 → 03/10 10:36 |
| **Claro NXT (BR, `*.virtua.com.br`)** | 6.426 | 1 | 02/10 11:05 → **03/10 10:55** |
| Cognition AI, Inc. (Devin) | 292 | 2 | 02/10 14:01 → 16:22 |
| Microsoft Singapore | 197 | 2 | 02/10 16:21 → 03/10 10:32 |

Total: **~30 mil em 24 h**, de **242 IPs**, com **um único `x-client-info`** em todos:
`supabase-js/2.117.2; runtime=web`. Os IPs `Microsoft *` são os **runners hospedados do GitHub Actions**
(o CI roda o `vitest` a cada push); o IP Claro é uma máquina da casa rodando `bun test`; o da Cognition é
o agente Devin executando a suíte.

## Como a assinatura foi fechada

1. **Endpoint único.** O cliente `node` só chamava `/rest/v1/catalog_send_events` — nenhum outro caminho.
   Um app inteiro chamaria dezenas de endpoints; isso indicava um teste, não um app.
2. **`runtime=web` + `user-agent: node`.** É a assinatura de **jsdom**: `window` existe (o SDK reporta
   `runtime=web`) mas o `fetch` é o do Node (UA `node`). `vitest.config.ts` usa `environment: "jsdom"`.
3. **`x-app-name` AUSENTE.** O app sempre manda `x-app-name: zapp-web` (está no `global.headers` do
   client). Ausente em 100% das 29.928 requisições ⇒ **não é o app** — é um cliente que **não passou pelo
   `client.ts`** ou foi montado em teste.
4. **A query é do próprio repo.** A URL do log
   (`select=product_id,product_name&created_at=gte.<agora−30d>&order=created_at.desc&offset=0&limit=1000`)
   casa **exatamente** com `useCatalogRecentSends.ts` (`WINDOW_DAYS=30`, `PAGE_SIZE=1000`).
5. **`vitest` reproduzido com spy.** Interceptando o `fetch` global e rodando a suíte: as mesmas URLs,
   os mesmos endpoints, a mesma cadência (~1 s por ciclo, com rajadas).

## Por que o RLS nega

`catalog_send_events` tem duas policies, **ambas `roles={authenticated}`** (`Users can view own catalog
send events`, `Users can insert own catalog send events`). **Não há policy para `anon`.** O teste usa a
anon key sem usuário logado ⇒ `42501` (`permission denied`) ⇒ `401` na borda. É o passo 6 do runbook:
não é policy "faltando"; é um cliente **anônimo** batendo numa tabela restrita a autenticado.

## Correção aplicada

**`src/test/setup.ts`** — guarda de rede global: o `fetch` da suíte **recusa** qualquer destino
`*.supabase.co` / `*.supabase.in`, com mensagem acionável dizendo o que mockar. Nenhum teste precisa de
rede real (todos mockam); um teste que venha a precisar falha **explicitamente** em vez de vazar em
silêncio.

**`src/test/guardaDeRede.test.ts`** (novo, 5 casos) — prova que a guarda barra de verdade. Sem ele,
"nenhum teste falou com produção" poderia significar só "nenhum teste tentou", que não é medição nenhuma.

**`src/hooks/__tests__/strictModeAlcance.test.tsx`** — corrigido um defeito **meu**, revelado por esta
mesma investigação: o caso que mede um hook deliberadamente vazado (`setInterval` sem cleanup) deixava o
timer **vivo após o teste**, e a suíte terminava com `Uncaught Exception: window is not defined`
(`exit=1`). O vazamento agora existe durante a medição (que é o objeto do teste) e é limpo no `finally`.

## Verificação (executada)

| | Antes | Depois |
|---|---|---|
| Requests a produção por execução | **408** | **0** |
| Testes | 5.946 passando | **5.951 passando** (495 arquivos) |
| `exit` da suíte | **1** (uncaught exception) | **0** |
| Mutação (guarda desligada) | — | **4 dos 5 casos falham** ⇒ os testes medem a guarda |

Gates: `typecheck` OK · `lint-ratchet` OK (novas=0) · `typecheck-ratchet` OK · `implicit-any-ratchet` 0/0
· `check-test-inventory` OK.

## Limite desta correção

A guarda cobre o que passa por **`fetch`**. **WebSocket/Realtime não é interceptado** — de propósito: os
testes de realtime usam servidor local e mockam o transporte. Se um teste futuro abrir Realtime real
contra produção, a guarda **não** pega. Fica registrado como limite conhecido, não como cobertura.

Também **não** mexi no `client.ts` (URL/anon key fixas). Isso é design declarado (a key é pública; ler
`VITE_SUPABASE_*` levaria ao projeto errado, conforme o comentário do arquivo) e trocar isso seria
escopo diferente. A guarda resolve o vazamento sem tocar no cliente.

## Ação para o dono

O bloqueio da origem na borda (passo 5 do runbook) **não é mais necessário**: a fonte está no repo e
foi cortada por este PR. Depois do merge, os `401` de `catalog_send_events` com UA `node` devem cair a
zero na próxima execução de CI. **Vale medir 15 min depois do merge** para confirmar.
