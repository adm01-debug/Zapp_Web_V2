# Arquitetura — Autocomplete de endereço (Search Box)

**Repo:** `adm01-debug/Zapp_Web_V2` · **Criado:** 2026-09-26 (E50 do `PLANO_BUSCA_SEARCHBOX_50_ETAPAS.md`)

Documento de referência para quem for mexer, depurar ou fazer rollback deste módulo. Não repete o histórico de decisão — isso está no plano de 50 etapas; aqui fica só o estado final.

## Onde o autocomplete está montado

Um único hook, dois lugares:

| Consumidor | Arquivo | Campo |
|---|---|---|
| Localização no Inbox (enviar localização numa conversa) | `src/components/inbox/location-picker/LocationPicker.tsx` | campo de busca do picker |
| Cadastro de contato | `src/components/contacts/ContactForm.tsx` | campo "Logradouro" (`#address`) |

Ambos usam `useAddressAutocomplete` (`src/components/inbox/location-picker/useAddressAutocomplete.ts`), que por sua vez chama as funções de `src/lib/mapboxGeocode.ts` e `src/lib/mapboxSession.ts`. Não há duplicação de lógica entre os dois consumidores — só o campo onde o combobox é renderizado muda.

## Cascata de endpoints (por busca)

```
operador digita (≥ 3 caracteres, debounce 300 ms)
        │
        ├─► /suggest  ──ok──► lista de sugestões ──clique/Enter──► /retrieve ──ok──► marcador + envio
        │        │                                                    │
        │        │                                                    └─falha─► searchPlaces(nome)  [/forward]
        │        │
        │        └─falha (rede/timeout/http)─► searchPlaces(termo)  [/forward]
        │                                            │
        │                                            └─sem acerto─► geocoding/v5 (relevance ≥ 0,8)
        │
        └─ 429 ─► backoff de 60s, autocomplete pausado (1 aviso, sem retry por tecla)
```

- **`/suggest`** (`search/searchbox/v1/suggest`): autocomplete enquanto digita. Não devolve coordenada — só `mapbox_id`, `name`, `full_address`, `feature_type`, `distance`. `types=address,street,place` (sem POI — decisão do E41: nome de empresa não é endereço de entrega).
- **`/retrieve/{mapbox_id}`** (`search/searchbox/v1/retrieve`): chamado só ao escolher uma sugestão. Devolve a coordenada real (`geometry.coordinates`) e, no cadastro de contato, também `context` (bairro/cidade/UF/CEP).
- **`/forward`** (Search Box, PR #737): fallback quando `/suggest` falha por rede/timeout/HTTP, ou quando `/retrieve` devolve coordenada inválida. Já devolve a coordenada junto (1 request).
- **`geocoding/v5`**: último fallback, só se `/forward` não achar nada. Corta por `relevance ≥ 0,8` para evitar falso positivo.
- Guarda de custo (E37): se as sessões do mês passarem de `MONTHLY_SESSION_LIMIT` (padrão 450), o autocomplete degrada silenciosamente para `/forward` — sem erro visível pro operador, só um evento `searchbox_cost_guard` em `audit_logs`.

## Sessão (o que é cobrado)

Uma **sessão de busca** (`src/lib/mapboxSession.ts`) é um `session_token` (UUID v4) que:
- é reaproveitado entre buscas seguidas, desde que não passem 2 min de inatividade (`SESSION_IDLE_MS`) e ainda não tenha havido `/retrieve`;
- é encerrado (`endSearchSession()`) no `/retrieve`, ao limpar a busca (`clear()`) ou ao chegar a 50 `/suggest` (teto da Mapbox);
- gera **exatamente 1** evento `searchbox_session` em `audit_logs` por sessão (nunca por `/suggest` — ver E35), sem PII (só contagem + `source`).

Billing da Mapbox: **1 sessão = até 50 `/suggest` + 1 `/retrieve`**, não 1 request avulso.

## Estados da lista de sugestões (inclui `paused`)

O status vive no reducer de `src/components/inbox/location-picker/useAddressAutocomplete.ts`:

```ts
export type SearchStatus = 'idle' | 'typing' | 'loading' | 'ok' | 'empty' | 'paused'
```

- `paused` **não é erro**: é a lista suspensa de propósito quando `state.blocked` é verdadeiro
  (`useAddressAutocomplete.ts:163`) — ou seja, **pausada = teto de custo atingido**, o mesmo
  mecanismo que faz o `mapboxCostGuard` (E37) cair para `/forward` a partir de 450 sessões no mês.
  Na UI aparece como aviso, não como falha.
- Antes de `paused` existe `empty` (a Mapbox respondeu e não há resultado) e `idle` (termo abaixo do
  mínimo). Nenhum dos dois é degradação de custo.

## Configuração por ambiente (as 2 chaves vivas)

Levantado no código (`grep VITE_`): o módulo é controlado por **duas** variáveis, e nenhuma delas é
uma feature flag de liga/desliga do autocomplete:

| Chave | O que faz | Menções |
|---|---|---|
| `VITE_SEARCHBOX_MONTHLY_SESSION_LIMIT` | teto de sessões do mês para o guarda de custo (E37) | 12 |
| `VITE_CRM_INTEGRATION_ENABLED` | integração de CRM no cadastro de contato (Fase 6) | 1 |

A **feature flag do autocomplete foi removida** (decisão `20261001-103207-6c0b`): o rollback passou a
ser revert de código, não desligamento por flag — ver a seção abaixo. Por isso o texto do E84 que
menciona "2 flags" se refere às duas chaves de ambiente acima, não a uma flag de módulo.

## Telemetria — forma canônica de leitura

Os eventos continuam em `audit_logs` (`searchbox_session`, `searchbox_cost_guard`), mas a leitura
agregada do dia a dia é a **view `public.searchbox_usage_daily`** (E52, migration `20260930760000`),
com `dia`, `sessoes`, `degradacoes`, `ultimo_evento_em`. As queries manuais que ela substituiu ficam
no Apêndice A de `docs/mapa/USO_SEARCHBOX.md` — se as duas formas divergirem, a view está errada.

## Feature flag (removida)

O autocomplete **não tem mais feature flag de runtime**: o item 4b removeu o ramo legado do picker (que era o gate `useFeatureFlag('mapa.searchbox-autocomplete', false)`) e a UI virou ramo único. A chave `mapa.searchbox-autocomplete` da tabela `feature_flags` foi removida pela migration `20260930210000_remove_orphan_searchbox_flag.sql` — nenhum `src/`, Edge Function, workflow ou `.env` a lia.

- **Rollback:** desligar o autocomplete agora é reverter o código (não há flag de runtime para virar).

## Limites e custo

| Item | Valor |
|---|---|
| Sessões grátis/mês (Search Box) | 500 |
| Preço após o teto | US$ 3,00 / 1.000 sessões |
| Geocoding v5 (fallback) | 100.000 req/mês grátis, depois US$ 0,75 / 1.000 |
| Teto configurável de sessões/mês antes de degradar (E37) | `MONTHLY_SESSION_LIMIT`, padrão 450 |
| Uso real (1ª leitura, ~7h de rollout) | 8 sessões, 0 erros, 0 acionamentos da guarda de custo — ver Apêndice B do plano |

## Telemetria (`audit_logs`)

| `action` | Quando é gravado | Contém termo digitado? |
|---|---|---|
| `searchbox_session` | 1x por sessão, na criação | Não — só contagem e `source` |
| `searchbox_cost_guard` | 1x por transição para `/forward` por teto de custo | Não |
| `client_error` | Falha classificada (rede/timeout/http/429) quando `/suggest` **e** `/forward` falham os dois | Não — só a causa, nunca o termo (revisão de privacidade, E39) |

O termo digitado vai para a Mapbox (é o próprio autocomplete), mas nunca é persistido no nosso banco.

## Onde os contratos do módulo REALMENTE rodam (E92, medido 2026-10-02)

A etapa E92 pede "confirmar que os contratos de E76/E77 rodam no guard **vivo**". Medição direta nos
workflows:

```
.github/workflows/db-live-guard.yml  -> 0 ocorrencias de "node --test"
   passos: drift de migrations, ACL de mcp_exec, dead-letter de webhooks, security_invoker da view
   do Talk X, contrato de transicao de campanha, catalogo, manifesto, frescor do types.ts,
   paridade tripla (migrations, edges, grants), config runtime e veredito consolidado
.github/workflows/db-guard.yml:196   -> node --test scripts/db-audit/*.test.mjs
```

**A resposta é NÃO — e o motivo importa.** Os contratos dos E76/E77 (`grants-baseline-module-rpcs.test.mjs`
e os demais `.test.mjs` de `scripts/db-audit/`, 24 arquivos) rodam no guard **offline**
(`node --test` dentro do `db-guard.yml`), que é o check obrigatório de PR **`Contrato DB offline`** — o
mesmo que barra merge neste repositório. O guard **vivo** (`db-live-guard.yml`) roda contra o banco
canônico e cobre o módulo por outro caminho: `Paridade tripla (migrations, edges, grants)`, o manifesto
e o catálogo regenerados e comparados com o commitado.

**Por que está assim, e por que está certo:** contrato que precisa de Postgres descartável com o
esquema aplicado (o caso do E76/E77) não roda contra produção; o guard vivo existe para o que só
produção pode responder (drift real, ACL efetiva, frescor de artefato gerado). Trocar o nome do guard
não muda a cobertura: **o que barra merge é o offline**, e é ele que executa os contratos do módulo —
verificado hoje, porque ele é justamente o check que aparece nos PRs deste módulo.

**Ressalva honesta sobre "8 guards verdes":** o checklist do E92 fala em "8 guards verdes com os
contratos novos". O que dá para afirmar com medição é o que está acima: os contratos rodam no guard
offline e o guard vivo cobre o módulo por paridade de grants. Contar "8 guards" exigiria enumerar
checks obrigatórios por nome de branch protection — não é algo que se leia do repositório, e eu não
afirmo número que não medi.

## Testes automatizados que cobrem este módulo

- `src/lib/__tests__/mapboxGeocode.test.ts` — camada de API (`/suggest`, `/retrieve`, fallback, cache, 429).
- `src/lib/__tests__/mapboxSession.test.ts` — ciclo de vida da sessão.
- `src/components/inbox/location-picker/__tests__/useAddressAutocomplete.test.tsx` — hook (debounce, cancelamento, seleção por teclado, encerramento de sessão).
- `src/components/inbox/__tests__/LocationPicker.test.tsx` — UI do picker do Inbox.

## Cobertura de teste do modulo (E79, medido 2026-10-02)

Escopo: `src/lib/mapbox*`, `src/components/inbox/location-picker/**` e
`src/components/contacts/ContactForm.tsx`. Comando: `vitest run --coverage` restrito a esses
caminhos e aos testes do modulo (14 arquivos, 203 testes, todos passando).

| nivel | Stmts | Branch | Funcs | Lines |
|---|---|---|---|---|
| escopo agregado | 87,94 | 79,13 | 81,76 | 91,97 |
| lib (mapbox*) | 94,46 | 86,66 | 96,82 | 95,50 |
| location-picker | 89,97 | 83,92 | 91,66 | 94,26 |
| contacts/ContactForm.tsx | 66,42 | 58,27 | 48,93 | 74,50 |
| lib/mapboxLoader.ts | 0 | 0 | 0 | 0 |

Piso: linhas >= 85 % e branches >= 75 % para o escopo agregado - cumprido (91,97 / 79,13),
e configurado como threshold por glob no vitest.config.ts (provado por mutacao: subir o piso
para 99 faz a cobertura REPROVAR).

**Ressalva conhecida:** o agregado passa puxado pelo `lib`; `ContactForm.tsx` (58,27 % branches)
e `mapboxLoader.ts` (0 %) ficam abaixo do piso por arquivo. Um gate que soma arquivos nao garante
piso por arquivo - ver decisao pendente sobre `perFile: true`.

## Bundle (medido no build real)

Seção exigida pelo **E78** (`docs/mapa/PLANO_FINALIZACAO_100_ETAPAS_2026-09-29.md:672`) para o número de bundle deste módulo viver no repo, e não só no corpo de uma PR.

**Como foi medido (2026-10-02), com o mesmo env do CI (`ci.yml:297-302`):**

```
VITE_CRM_INTEGRATION_ENABLED=true bun run build   # gera dist/
node scripts/ci/bundle-budget.mjs                 # compara dist/ com performance-budget.json
```

**Chunks do módulo** (gzip nível 9, igual ao `bundle-budget.mjs`):

| Chunk | raw | gzip |
|---|---|---|
| `ContactForm-*.js` (cadastro de contato, lazy) | 18.124 B (17,70 KB) | 5.427 B (5,30 KB) |
| `LocationPicker-*.js` (picker do Inbox, lazy via `ChatDialogs.tsx:13`) | 12.826 B (12,53 KB) | 4.730 B (4,62 KB) |
| `SuggestionList-*.js` (compartilhado pelos dois) | 13.743 B (13,42 KB) | 4.903 B (4,79 KB) |

`SuggestionList` **não** vira `React.lazy`: o E78 condiciona isso a "se passar do orçamento", e os três chunks são lazy e ficam muito abaixo de qualquer teto.

**Orçamento (`performance-budget.json`) — saída crua do gate:**

| Métrica | Medido (gzip) | Budget (`maxKB`) | Folga |
|---|---|---|---|
| `initial-js` | 336,6 KB | 341 | −4,4 KB |
| `initial-css` | 40,0 KB | 80 | −40,0 KB |
| `largest-chunk` (inclui lazy) | 492,3 KB | 550 | −57,7 KB |
| `total-assets` (sem maps) | 2801,6 KB | 4100 | −1298,4 KB |

`bundle-budget.mjs` sai **0** ("OK: bundle inicial dentro do budget"). O maior chunk não é deste módulo — é `vendor-maps` (mapbox-gl, lazy).

**Quem verifica:** o gate existe e roda de verdade — `.github/workflows/ci.yml:314-315` (`node scripts/ci/bundle-budget.mjs`) no job `build` (`ci.yml:278`, `needs: [lint-and-typecheck, test]`, sem filtro de `paths`); o env `VITE_CRM_INTEGRATION_ENABLED: 'true'` está no `env:` do workflow (`ci.yml:27`). Não é o padrão "existe mas não roda". O que o gate **não** faz: comparar este número com o build a cada commit — `performance-budget.json` não tem entrada por chunk (`LocationPicker`/`ContactForm` caem sob `largest-chunk`/`total-assets`). O número acima é fotografia datada; o contrato contínuo é o budget agregado.

## Débito técnico conhecido

Migrations `20260926152000_search_contacts_returns_latlng.sql` (PR #862) e `20260926160000_search_contacts_add_lat_lon.sql` (PR #859) corrigem o mesmo gap de forma redundante — ambas aplicadas em produção, nenhuma será removida (risco de drift maior que o ganho de limpeza). Ver nota na E43 do plano de 50 etapas.

## Pendências abertas (ver E48/E49 do plano para detalhe)

- 48h de acompanhamento formal da flag em produção não decorridas ainda (rollout tem poucas horas no fechamento deste documento).
- Confirmação visual em navegador do envio de localização pelo Inbox não foi possível nesta sessão (limitação de tooling de automação, não do produto) — coberta por evidência indireta (mesmo hook já testado ao vivo no E47, balão de recebimento comprovado por mensagens reais recentes).
