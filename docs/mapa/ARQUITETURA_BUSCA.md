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

## Testes automatizados que cobrem este módulo

- `src/lib/__tests__/mapboxGeocode.test.ts` — camada de API (`/suggest`, `/retrieve`, fallback, cache, 429).
- `src/lib/__tests__/mapboxSession.test.ts` — ciclo de vida da sessão.
- `src/components/inbox/location-picker/__tests__/useAddressAutocomplete.test.tsx` — hook (debounce, cancelamento, seleção por teclado, encerramento de sessão).
- `src/components/inbox/__tests__/LocationPicker.test.tsx` — UI do picker do Inbox.

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
