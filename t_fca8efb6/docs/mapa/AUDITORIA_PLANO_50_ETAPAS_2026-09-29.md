# Auditoria do plano "Mapas" (Search Box 50 etapas) — estado real em 2026-09-29

**Repo:** `adm01-debug/Zapp_Web_V2` · **Base auditada:** `main` @ `a0002bb2` · **Banco:** `tnnnlkbymytvtqngbbqh` (oficial) · **Plano auditado:** `docs/mapa/PLANO_BUSCA_SEARCHBOX_50_ETAPAS.md`

Método: cada item numerado das 50 etapas foi conferido contra o código de `main`, contra o banco de produção (via `db_query`) e contra as PRs no GitHub. Checkbox do plano **não** foi aceito como evidência — só `file:line`, query ou PR. Suítes rodadas neste container: `mapboxSession/mapboxGeocode/mapboxCostGuard/mapboxToken` (61 testes), `useAddressAutocomplete` + `LocationPicker` (47), `mapboxCostGuard` + `useLocationPicker` + `ContactRegionMap` (35) — **143 testes, 0 falhas**. `tsc` não pôde ser validado aqui (TS2688 `@types/node`/`vitest/globals` — problema de instalação do container, não do código; o CI de `main` está verde).

---

## 1. Resumo executivo

| Contagem | Etapas |
|---|---|
| **DONE** (33) | E01–E07, E09, E10, E12, E13–E15, E19, E20, E22–E24, E26, E27, E29, E31, E34–E36, E39, E40, E42–E47 |
| **PARCIAL** (17) | E08, E11, E16, E17, E18, E21, E25, E28, E30, E32, E33, E37, E38, E41, E48, E49, E50 |
| **FALTA** (0) | — |

O plano "fechou" em 27/09 com todas as 50 etapas marcadas, mas a auditoria encontrou **8 defeitos funcionais reais com a flag ligada em produção** e **1 bug de perda de dados no cadastro de contato** que nenhuma etapa cobriu. Os testes unitários passam porque mockam exatamente as camadas onde os bugs estão (hook mockado nos testes de UI; `searchLocation` mockado nos testes do hook).

### Números de produção (query em 2026-09-29)

| Métrica | Valor |
|---|---|
| `feature_flags.mapa.searchbox-autocomplete` | `enabled=true` desde 2026-09-26T13:20:15Z |
| Sessões `searchbox_session` (total) | **10** — 26/09: 8 · 28/09: 2 |
| Por origem | `contact-form`: **6** · `picker`: **4** |
| Sessões no mês vs teto grátis (500) | 10 (2 %) |
| `searchbox_cost_guard` | 0 |
| `client_error` com "mapbox" desde o rollout | 0 |
| Localizações **enviadas por agente** desde o rollout | **0** |
| Localizações recebidas de contatos (30 d) | 9 (balão intacto) |
| Contatos no total | 3.104 |
| Contatos com `latitude/longitude` | **0** |
| Contatos com **qualquer** campo de endereço (`address/city/postal_code`) | **0** |
| Contatos atualizados desde o rollout | 24 |

Leitura: o recurso está ligado há 3 dias, foi tocado 10 vezes, e **não produziu nenhum resultado persistido** — nem localização enviada, nem endereço salvo em contato. A causa mais provável do zero absoluto em endereço é o defeito C1 abaixo.

---

## 2. Defeitos encontrados

### 2.1 Críticos (comportamento errado em produção hoje)

| # | Defeito | Evidência | Efeito no negócio |
|---|---|---|---|
| **C1** | **Editar um contato pela lista apaga endereço e coordenada.** A lista vem da RPC `search_contacts`, que devolve `latitude/longitude` mas **não** devolve `address, address_number, neighborhood, city, state, postal_code`. `openEditDialog(contact)` abre o form com esses campos vazios e `handleEditContact` grava `null` em todos eles. | `src/services/contact.service.ts:21` (rpc) · retorno da função ao vivo (`pg_get_function_result`): sem colunas de endereço · `src/components/contacts/useContactsCRUD.ts:222-225` (abre com a linha da lista) · `:160-178` (update grava `editingContact.address \|\| null` … `toCoordinate(editingContact.latitude \|\| '')`) | Todo endereço digitado no cadastro (Fase 6) é destruído na primeira edição de qualquer outro campo do contato. Explica 0/3.104 com endereço apesar de 6 sessões de autocomplete no cadastro. Perda silenciosa de dado, sem erro, sem log. |
| **C2** | **Fallback `/forward` do picker é código morto.** Com a flag ligada, `Enter` sem sugestão destacada chama `searchLocation()`, que lê `searchQuery` de `useLocationPicker` — mas o input do combobox está ligado a `autocomplete.query` e nunca chama `setSearchQuery`. `searchLocation` retorna em `if (!query) return`. | `src/components/inbox/LocationPicker.tsx:165` (input → `autocomplete.setQuery`) · `:173-175` (Enter → `searchLocation()`) · `src/components/inbox/location-picker/useLocationPicker.ts:197-198` | Quebra E17 ("Enter sem seleção = busca antiga"), E32 ("volta ao fluxo antigo"), E37 ("degrada para `/forward` sem erro") e E38. Quando o `/suggest` falha, o operador **não tem como buscar** — regressão em relação à PR #737. |
| **C3** | **Cascata de fallback (E08) nunca foi implementada.** `mapboxGeocode.ts` só documenta a cascata no cabeçalho e delega ao hook; o hook, em `network/timeout/http`, só faz `dispatch SUGGEST_ERROR`; `/retrieve` `null` vira `RETRIEVE_ERROR 'not_found'`; não há `reportMapboxFailure` no hook. | `src/lib/mapboxGeocode.ts:225-240` (só comentário) · `useAddressAutocomplete.ts:142-151`, `:186-190` · grep `reportMapboxFailure` → ausente no hook | `/suggest` fora do ar = busca fora do ar. Zero telemetria de "os dois caminhos falharam" — a Fase 5 mede sessão, não falha. |
| **C4** | **Botão "Tentar novamente" é no-op.** Faz `setQuery(query)` com o mesmo valor; `state.query` não muda, o effect não reexecuta, só `error` é zerado e a UI passa a mostrar "Nada encontrado" (falso). | `LocationPicker.tsx:195` · `src/components/contacts/ContactForm.tsx:324` · `useAddressAutocomplete.ts:81,163` | Operador clica em retry, nada acontece, e a tela mente que não há resultado. |
| **C5** | **Falha do `/retrieve` some sem rastro.** `handleSelectSuggestion` fecha a lista antes de checar `place`; o erro `not_found` só renderiza quando `suggestions.length === 0`; não há toast. | `LocationPicker.tsx:92-94`, `:192` · `useAddressAutocomplete.ts:186-190` | Clique numa sugestão → lista fecha → nada acontece. E16 exigia "toast com a causa + lista continua aberta". |
| **C6** | **"Nada encontrado para X" falso.** A mensagem aparece (a) nos 300 ms de debounce antes do `SUGGEST_START`, (b) durante o backoff de 429 e (c) quando o guarda de custo degrada — porque `runSuggest` sai silencioso e a UI só distingue `isLoading`/`error`/`length===0`. | `LocationPicker.tsx:198` · `useAddressAutocomplete.ts:133,135` | Viola a regra 3 do E18 e transforma "limite atingido" em "endereço não existe". |
| **C7** | **Cadastro de contato ignora a feature flag.** `ContactForm` liga o autocomplete com `enabled: !!mapboxToken`; a flag só é lida em `LocationPicker.tsx:56`. | `ContactForm.tsx:89-92` · grep `mapa.searchbox-autocomplete` em `src/` → 1 ocorrência | O "desliga sem deploy" do E03/E48 não cobre a origem **majoritária** de sessões (6 de 10). Desligar a flag não para o consumo. |
| **C8** | **Erro sem causa.** O hook expõe `error: GeoFailureKind` (rede/timeout/http/429), a UI mostra sempre "Falha ao buscar sugestões." | `useAddressAutocomplete.ts:27` · `LocationPicker.tsx:192-196` | E18 item 2 ("erro por causa") não cumprido; operador não distingue "sem internet" de "limite da Mapbox". |

### 2.2 Médios (funcionam, mas errado ou frágil)

| # | Defeito | Evidência |
|---|---|---|
| M1 | Apagar até < 3 caracteres **não** limpa `suggestions` nem aborta a consulta em voo — a lista de "rua" continua aberta em "ru"; resposta atrasada pode chegar depois. | `useAddressAutocomplete.ts:80-81` (`SET_QUERY` mantém suggestions), `:155-157` (retorna sem `abort()`) |
| M2 | Após escolher sugestão (lista fechada), clique no mapa ou GPS **não** limpam `autocomplete.query` — input mostra o endereço antigo com o marcador em outro lugar (E30 item 3 só vale com lista aberta). | `LocationPicker.tsx:72-79` |
| M3 | Sessão e evento `searchbox_session` são criados **antes** do `/suggest`, inclusive em cache hit — a telemetria de E35 conta sessão sem request real (superestima custo). | `useAddressAutocomplete.ts:140-142` · `mapboxGeocode.ts:308-310` |
| M4 | Guarda de custo: `budgetOk` vive em memória de módulo → evento `searchbox_cost_guard` é "1x por transição **por aba/reload**", não por transição real; `MONTHLY_SESSION_LIMIT` é constante em código, não configurável em runtime (E37 item 1). | `src/lib/mapboxCostGuard.ts:79-82,95-98` |
| M5 | `retrievePlace` devolve `null` sem causa; timeout/rede do `/retrieve` viram "não encontrado". | `mapboxGeocode.ts:344-347` · `useAddressAutocomplete.ts:187-189` |
| M6 | `suggestCache` guarda array vazio — "Nada encontrado" fica fixo pela sessão mesmo se a Mapbox oscilou. | `mapboxGeocode.ts:327` |
| M7 | A11y: nenhum `aria-live`/`role=status` para anunciar contagem/estados (E21 item "leitor de tela anuncia a contagem"); lista não fecha em `Tab`/`blur` (só `pointerdown` fora). | `LocationPicker.tsx:82-89,154-162` |
| M8 | Mobile (E25) nunca verificado: sem regra < 640 px, sem tratamento de teclado virtual; largura da lista é a do campo, não do diálogo; PR #779 diz "prints não capturados". | `LocationPicker.tsx:185` · corpo da PR #779 |
| M9 | `ContactForm` sem `proximity` (viés nacional: "Curitiba" acha Tocantins primeiro — ver tabela do E47). | `ContactForm.tsx:89-94` |
| M10 | `noteSuggestCall`/`noteRetrieveCall` criam sessão com `source='picker'` fixo se chamados sem `getSearchSession` — armadilha para o próximo consumidor. | `mapboxSession.ts:51-58` |
| M11 | `backoff` de 429 (60 s) é invisível: digitar não faz nada e a tela diz "Nada encontrado" (E38 "1 aviso" não acontece porque `SET_QUERY` zera `error`). | `useAddressAutocomplete.ts:10,81,133,148` |
| M12 | Hook `useAddressAutocomplete` é importado e executado com a flag desligada (E32 item 2 "nenhum import avaliado"). Custo real pequeno (o `LocationPicker` inteiro é lazy em `ChatDialogs.tsx:14`), mas o critério não foi cumprido. | `LocationPicker.tsx:15,57` |
| M13 | Destaque do trecho digitado (E23) é `<mark>` só no nome, não no endereço; especificação pedia negrito no trecho que casa. | `LocationPicker.tsx:222` · `src/components/chat/HighlightedText.tsx` |
| M14 | Migrations `20260926152000` e `20260926160000` recriam `search_contacts` de forma idêntica (PRs #862 e #859 em paralelo). Débito aceito — **não** consolidar (drift). | ledger: ambas com 4 statements |

### 2.3 Processo, testes e documentação

| # | Achado | Evidência |
|---|---|---|
| P1 | Checkboxes desatualizados no plano: E03 (itens 2–4), E04–E07, E09, E10, E12, E13–E28 estão `[ ]` com código mergeado; E42 diz "NÃO aplicada em produção" (está aplicada: ledger + colunas ao vivo); E45 diz "CI não verde" (#850 mergeada com 6/6 checks). | plano L79–299, L365, L385 · ledger `20260926141500` |
| P2 | Provas de mutação (E11, E19) existem **só em prosa** nos corpos das PRs #759/#768 — nada reproduzível no repo. | `git log --all \| grep -i muta` → vazio |
| P3 | Testes de UI mockam o hook inteiro (`LocationPicker.test.tsx`), e testes do hook mockam `searchLocation`/`mapboxGeocode`: é por isso que C2, C4, C5, C6 passam verdes. Nenhum teste de integração hook+UI real. | `LocationPicker.test.tsx:12-31` · `useAddressAutocomplete.test.tsx:15-31` |
| P4 | **Zero E2E** cobrindo picker de localização, cadastro com endereço ou mapa de contatos (só `contact-form-email-duplicate.spec.ts` toca contatos). | `ls e2e/*.spec.ts` |
| P5 | E28: sem prints desktop/360 px. E49: confirmação visual do envio nunca feita. E48: "48 h" fechado com ~31 h; reversão da flag nunca executada. | plano L263, L429–440 |
| P6 | E50 item 2 cita `areas/mapa-localizacao-whatsapp.md` — arquivo não existe neste repo (memória externa); não verificável aqui. | `find . -name mapa-localizacao-whatsapp.md` → vazio |
| P7 | E33: delta de bundle (+386 B raw / +115 B gzip) só no corpo da PR #796; o repo tem orçamento (`performance-budget.json`: initial-js 340 KB, largest-chunk 550 KB; `ci.yml:228`) mas o número não foi registrado no plano. | PR #796 · `performance-budget.json` |
| P8 | Docs in-app (`src/components/docs/featuresSectionsData.ts`) não mencionam autocomplete de endereço nem mapa de contatos com coordenada real. | grep "autocomplete\|Search Box" → 0 |
| P9 | `docs/mapa/USO_SEARCHBOX.md` e Apêndice B param em 27/09 (8 sessões); hoje são 10. Nenhuma automação de leitura (é query manual). | — |
| P10 | `get-mapbox-token` devolve o token público com rate limit por usuário (60/min) — ok; mas não há evidência de **URL restriction** do token no painel da Mapbox (token público sem restrição pode ser reusado fora do domínio). Não verificável pelo repo. | `supabase/functions/get-mapbox-token/index.ts` |

---

## 3. Tabela etapa a etapa (E01–E50)

Legenda: **D** = done com evidência · **P** = parcial · o gap é o que falta literalmente.

| Etapa | Status | Evidência principal | Gap |
|---|---|---|---|
| E01 Medir busca de hoje | D | plano L55–61 | — |
| E02 Decisão de endpoint | D | plano L63–69, Apêndice C | — |
| E03 Feature flag | D | migration `20260925211500:1-3`; `LocationPicker.tsx:56`; testes on/off `LocationPicker.test.tsx:12,63,119` | flag não cobre `ContactForm` (C7); hook importado com flag off (M12) |
| E04 Módulo de sessão | D | `mapboxSession.ts:9-10,21-23,35-48,63-66` | — |
| E05 Testes de sessão | D | `mapboxSession.test.ts` 9 `it(`, fake timers L16 | — |
| E06 `suggestPlaces` | D | `mapboxGeocode.ts:242-250,300-330` | — |
| E07 `retrievePlace` | D | `mapboxGeocode.ts:337-358` | sem causa no `null` (M5) |
| E08 Fallback encadeado | **P** | só cabeçalho `mapboxGeocode.ts:225-240` | itens 1–3 não existem (C3) |
| E09 Cache por sessão | D | `mapboxGeocode.ts:263-277,308-326` | cacheia vazio (M6) |
| E10 Testes da API | D | `mapboxGeocode.test.ts` 27 `it(`; casos L286,323,328,338,374 | caso 4 não prova "cai no /forward" (não existe) |
| E11 Mutação da camada | **P** | só corpo da PR #759 | sem artefato no repo (P2) |
| E12 PR Fase 1 | D | PR #759 → `cb296e60` | — |
| E13 Hook esqueleto | D | `useAddressAutocomplete.ts:12-20,121,155` | — |
| E14 Debounce/piso | D | `:8-9,154-163`; teste `HT:78-91` | — |
| E15 Cancelamento | D | `:124,136-147,166`; teste `HT:93-111` | < 3 chars não aborta (M1) |
| E16 Seleção + retrieve | **P** | `:172-195`; loading por item `LP:229-231` | sem toast; lista fecha antes do check (C5) |
| E17 Teclado | **P** | `:206-244`; `LP:170-176` | Enter sem destaque = no-op (C2) |
| E18 Vazio/erro | **P** | `LP:192-200` | erro genérico (C8); retry no-op (C4); vazio falso (C6) |
| E19 Testes do hook | D | `HT` 14 `it(` | mutação só na PR #768 (P2) |
| E20 PR Fase 2 | D | PR #768 → `2b3eff38` | — |
| E21 ARIA | **P** | `LP:154-162,184,210-211` | sem `aria-live` (M7) |
| E22 Linha da sugestão | D | `LP:27-40,221-227` | — |
| E23 Destaque | D | `LP:222`; `HighlightedText.tsx:10-12`; 0 `dangerouslySetInnerHTML` | `<mark>` só no nome (M13) |
| E24 Loading/posição | D | `LP:82-89,185-191` | não fecha em blur (M7) |
| E25 Mobile | **P** | `LP:185 w-full`, `:215 min-h-11` | nunca verificado a 360 px (M8) |
| E26 Powered by Mapbox | D | `LP:237-242`; teste `LPT:200-205` | — |
| E27 Testes de UI | D | `LPT` 11 `it(` | hook 100 % mockado (P3) |
| E28 PR Fase 3 | **P** | PR #779 → `4eb723c1` | sem prints (P5) |
| E29 Escolha → mapa/envio | D | `LP:91-95`; `useLocationPicker.ts:105,255-297`; `H:193` | — |
| E30 Clique/GPS | **P** | `useLocationPicker.ts:165,190`; `LP:72-79` + teste `:210` | query não limpa com lista fechada (M2) |
| E31 Proximity | D | `useLocationPicker.ts:167,277-281`; 5 testes `:401-447` | ramo GPS só na aba onde o autocomplete está off (comentário `:270-276`) |
| E32 Flag off | **P** | `LP:246-253`; testes `LPT:61-97` | fallback morto (C2); hook não lazy (M12) |
| E33 Bundle | **P** | `performance-budget.json`; PR #796 (+115 B gzip) | número não está no repo (P7) |
| E34 PR Fase 4 | D | PR #796 → `dd72ba1d` | — |
| E35 Contador de sessões | D | `mapboxSession.ts:25-28,51-54`; testes L68-90 | conta antes do request (M3) |
| E36 Painel de uso | D | `USO_SEARCHBOX.md:13-55` | desatualizado (P9) |
| E37 Guarda de custo | **P** | `mapboxCostGuard.ts:79-98`; RPC `20260926120500`; grants ao vivo sem `anon` | degradação mostra "Nada encontrado" (C6); evento por aba (M4); limite hard-coded |
| E38 429 | **P** | `H:10,133,148`; teste `HT:254-273` | sem aviso único; retry no-op (M11, C4) |
| E39 Privacidade | D | `mapboxSession.ts:26`; `mapboxCostGuard.ts:95-98`; `USO_SEARCHBOX.md:72-81` | — |
| E40 PR Fase 5 | D | PR #820 | — |
| E41 Cadastro com autocomplete | **P** | `ContactForm.tsx:20,89-118`; `mapboxGeocode.ts:175-183` | sem flag (C7); sem proximity (M9); **endereço apagado na edição (C1)** |
| E42 Coordenada do contato | D | migration `20260926141500:34-36` (ledger + colunas ao vivo); `useContactsCRUD.ts:126-127,177-178` | plano diz "não aplicada" (P1); 0 contatos com coordenada (C1) |
| E43 Mapa com coordenada real | D | `ContactRegionMap.tsx:142-173,211-222`; `ContactMapView.tsx:57-59`; RPC devolve lat/lng ao vivo | duas migrations idênticas (M14) |
| E44 Testes Fase 6 | D | `ContactFormEndereco.test.tsx:87-132`; `ContactRegionMap.test.tsx:124-153` | nenhum teste de "editar mantém endereço" (teria pego C1) |
| E45 PR Fase 6 | D | PR #850 → `34bf5a8e`, 6/6 checks | plano diz "CI não verde" (P1) |
| E46 Auditoria adversarial | D | tabela do plano L395-400; testes E46 em `HT`/`LPT` | não cobriu C1–C6 |
| E47 Termos reais | D | tabela do plano L411-418 | — |
| E48 Ligar flag | **P** | `feature_flags` ao vivo | sem trilha; reversão nunca testada; cadastro fora da flag (C7) |
| E49 Confirmação no navegador | **P** | evidência indireta (plano L437) | 0 envios por agente desde o rollout — nunca confirmado |
| E50 Fechamento | **P** | `ARQUITETURA_BUSCA.md` | memória externa não verificável (P6); pendências reabertas por esta auditoria |

---

## 4. O que vem a seguir

Plano de finalização em 100 etapas: `docs/mapa/PLANO_FINALIZACAO_100_ETAPAS_2026-09-29.md`. Ordem de ataque: C1 (perda de dados) → C2/C3 (busca sem fallback) → C4–C8 (estados enganosos) → médios → testes de integração/E2E → docs/rollout.
