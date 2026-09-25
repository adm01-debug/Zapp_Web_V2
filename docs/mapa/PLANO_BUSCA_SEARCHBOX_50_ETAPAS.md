# Busca de endereço no padrão do playground da Mapbox — Plano em 50 etapas

**Repo:** `adm01-debug/Zapp_Web_V2` · **Módulo:** Inbox › Compartilhar Localização (e, na Fase 6, o cadastro de contato)
**Criado:** 2026-09-25 · **Origem:** Joaquim buscou `XBZ BRINDES` no playground `docs.mapbox.com/playground/search-box/suggest-retrieve` e a empresa apareceu; no ZAPP a mesma busca ia parar no Espírito Santo.

---

## 1. Estado verificado (2026-09-25, contra a API real com o token de produção)

| # | Achado | Evidência |
|---|--------|-----------|
| A1 | O ZAPP usava `geocoding/v5` (índice de **endereços**): "XBZ BRINDES" casava com "Rua **Brendes** Pereira da Silva", Vila Velha/ES, `relevance 0,46` | reproduzido via `get-mapbox-token` + chamada direta |
| A2 | `geocoding/v5` com `types=poi` devolve **zero** resultados para o mesmo termo | mesma sessão de teste |
| A3 | `search/searchbox/v1/forward` acerta: `XBZ Brindes · R. da Independência, São Paulo` | PR #737 (já implementada) |
| A4 | `search/searchbox/v1/**suggest**` acerta **enquanto digita**: `"xbz"` → `XBZ Presentes`, `XBZ Brindes`; `"xbz bri"` → `XBZ Brindes` em 1º | verificado agora |
| A5 | `search/searchbox/v1/**retrieve**` devolve a coordenada do `mapbox_id`: `-46.61563441, -23.56672978` | verificado agora |
| A6 | `/suggest` **não** devolve coordenada — só `mapbox_id`, `name`, `full_address`, `feature_type`, `distance`. A coordenada só vem do `/retrieve` | shape da resposta |
| A7 | Billing: 1 **sessão** = até **50 `/suggest` + 1 `/retrieve`**, expira com 2 min de inatividade. **500 sessões/mês grátis**, depois **US$ 3,00/1.000** | mapbox.com/pricing |
| A8 | Geocoding v5 (o fallback atual) tem **100.000 req/mês grátis**, depois US$ 0,75/1.000 | mapbox.com/pricing |
| A9 | A busca de hoje é **por botão** ("Buscar"), não enquanto digita: `LocationPicker.tsx` chama `searchLocation()` no clique ou no Enter | `src/components/inbox/LocationPicker.tsx` |
| A10 | A PR #737 já criou a base: `searchPlaces()` com Search Box `/forward` + fallback v5 com corte de `relevance ≥ 0,8`, `proximity`, lista de até 5 candidatos e `chooseSearchResult` | `src/lib/mapboxGeocode.ts` |
| A11 | CSP já libera `api.mapbox.com` e `events.mapbox.com` em `connect-src` | `vercel.json` |
| A12 | Token: `getMapboxToken()` faz 1 `functions.invoke('get-mapbox-token')` por 15 min, compartilhado entre todos os mapas | `src/lib/mapboxToken.ts` |
| A13 | Telemetria de falha já existe: `reportMapboxFailure(kind, 'picker'|'bubble')` grava `client_error` em `audit_logs` | `src/lib/mapboxToken.ts` |
| A14 | `contacts` ganhou `postal_code/address/address_number/neighborhood/city/state` (PR #746, aguardando merge) — é onde a Fase 6 encaixa | migration `20260925200000` |

### O que muda de verdade

| | Hoje (#737) | Com este plano |
|---|---|---|
| Interação | digita tudo → clica "Buscar" → lista | lista aparece **enquanto digita** |
| Endpoint | `/forward` (1 request por busca) | `/suggest` (N por sessão) + `/retrieve` (1) |
| Coordenada | vem junto | só no `/retrieve`, ao escolher |
| Custo | request avulso | sessão (50 suggests + 1 retrieve) |

---

## 2. Regras do plano (valem para as 50 etapas)

1. **Nada de número fabricado.** Toda métrica de custo/uso vem de `audit_logs` ou da página de preços citada acima.
2. **A #737 é a base, não é jogada fora.** `/forward` continua como caminho de fallback quando o `/suggest` falha ou a sessão estoura.
3. **Diff mínimo.** `mapboxGeocode.ts` ganha funções novas; `searchPlaces()` continua existindo com a mesma assinatura.
4. **Carvão fica.** Nenhum token de cor novo; a lista de sugestões usa `--popover`, `--border`, `--muted`.
5. **Sessão é dinheiro.** Nenhuma etapa pode disparar `/suggest` sem debounce nem reusar `session_token` fora da janela.
6. **Gate por etapa:** `npx tsc --noEmit -p tsconfig.app.json` = 0 · `npx eslint <arquivos tocados>` = 0 erros · `npx vitest run <suíte da etapa>` verde.
7. **Uma etapa = um commit** `feat(mapa): E<nn> <título>`; PR por fase, não por etapa.
8. **Acessibilidade não é opcional:** o combobox segue o padrão ARIA 1.2 (`combobox` + `listbox` + `aria-activedescendant`).
9. **Nada de chave no cliente além do token público** que já é servido pela edge `get-mapbox-token`.
10. **Toda etapa que toca custo atualiza o apêndice B** (contagem estimada de sessões/mês).

---

# FASE 0 — Base, custo e decisão (E01–E05)

### E01 · Medir a busca real de hoje antes de mexer
**Arquivos:** nenhum (consulta)
1. Contar, em `audit_logs`, os eventos `mapbox_*` por `source` nos últimos 30 dias.
2. Contar quantas mensagens de localização foram **enviadas** por agente (`messages.type='location' and sender='agent'`) — hoje o número é 0, confirmar se mudou.
3. Estimar buscas/mês a partir de (1) e (2); registrar o número medido no apêndice B.
4. Se o volume for < 500 buscas/mês, registrar no doc que o uso cabe no teto gratuito da Search Box.
**Checklist:** [ ] números de `audit_logs` no doc · [ ] estimativa registrada · [ ] teto gratuito avaliado

### E02 · Fixar a decisão de endpoint por cenário
**Arquivos:** `docs/mapa/PLANO_BUSCA_SEARCHBOX_50_ETAPAS.md`
1. `/suggest`+`/retrieve` para o **picker** (interativo, é o que o Joaquim pediu).
2. `/forward` para chamadas **não interativas** (uma consulta só, sem digitação).
3. `geocoding/v5` fica como último fallback, com o corte de `relevance ≥ 0,8` da #737.
4. Escrever a tabela de decisão no doc.
**Checklist:** [ ] 3 caminhos definidos · [ ] tabela no doc

### E03 · Feature flag de rollout
**Arquivos:** `src/lib/featureFlags.ts` (ou equivalente existente), `.env`
1. Flag `VITE_SEARCHBOX_AUTOCOMPLETE` (default: ligada em dev, desligada em prod até E48).
2. Com a flag desligada, o picker usa exatamente o fluxo da #737.
3. Teste que cobre os dois caminhos.
**Checklist:** [ ] flag lida em runtime · [ ] fluxo antigo intacto com flag off · [ ] teste dos dois caminhos

### E04 · Esqueleto do módulo de sessão
**Arquivos:** `src/lib/mapboxSession.ts` (novo)
1. `newSessionToken()` com `crypto.randomUUID()`.
2. `getSearchSession()`: devolve a sessão corrente ou cria uma nova se passaram **2 min** da última atividade (regra da Mapbox) ou se já houve `/retrieve`.
3. `endSearchSession()`: chamado após o `/retrieve` e ao fechar o diálogo.
4. Contador local de `/suggest` por sessão; ao chegar em 50, abre sessão nova.
**Checklist:** [ ] UUID v4 · [ ] expiração por inatividade · [ ] encerra no retrieve · [ ] teto de 50 suggests

### E05 · Testes do ciclo de sessão
**Arquivos:** `src/lib/__tests__/mapboxSession.test.ts` (novo)
1. Duas buscas seguidas dentro de 2 min → mesmo `session_token`.
2. Inatividade > 2 min → token novo.
3. Após `/retrieve` → token novo na próxima digitação.
4. 51º `/suggest` → token novo.
5. Fake timers; nenhum teste depende de rede.
**Checklist:** [ ] 4 casos · [ ] sem rede · [ ] verde

---

# FASE 1 — Camada de API `/suggest` + `/retrieve` (E06–E12)

### E06 · `suggestPlaces()` em `mapboxGeocode.ts`
**Arquivos:** `src/lib/mapboxGeocode.ts`
1. `suggestPlaces(q, token, { session, proximity, signal })` → `{ ok: true, suggestions: GeoSuggestion[] } | { ok: false, kind }`.
2. `GeoSuggestion = { id: string; name: string; address: string; kind: 'poi'|'street'|'address'|'place'|'other'; distanceMeters?: number }` — sem coordenada, porque o `/suggest` não devolve.
3. URL: `/search/searchbox/v1/suggest` com `q`, `session_token`, `language=pt`, `country=br`, `limit=5`, `proximity`, `access_token` codificado.
4. Reusar `requestJson()` (timeout de 8 s, cancelamento externo, classificação de causa) que a #737 criou.
5. Nunca lança.
**Checklist:** [ ] tipo sem coordenada · [ ] params completos · [ ] reusa requestJson · [ ] nunca lança

### E07 · `retrievePlace()`
**Arquivos:** `src/lib/mapboxGeocode.ts`
1. `retrievePlace(id, token, { session, signal })` → `GeoSearchPlace | null` (com `lat`/`lng`).
2. URL: `/search/searchbox/v1/retrieve/{mapbox_id}` com `session_token`.
3. Ler `features[0].geometry.coordinates` + `properties.name` + `properties.full_address`.
4. Coordenada inválida/ausente → `null` (quem chama cai no fallback).
**Checklist:** [ ] coordenada real · [ ] null em resposta inválida · [ ] session_token enviado

### E08 · Fallback encadeado
**Arquivos:** `src/lib/mapboxGeocode.ts`
1. `/suggest` falha por `network`/`timeout`/`http` → cai em `searchPlaces()` (o `/forward` da #737).
2. `/retrieve` devolve `null` → cai em `searchPlaces(nome do sugerido)`.
3. Registrar a causa em `audit_logs` só quando **os dois** caminhos falham (evita ruído).
4. Documentar a cascata no cabeçalho do arquivo.
**Checklist:** [ ] 2 quedas cobertas · [ ] telemetria sem ruído · [ ] comentário do fluxo

### E09 · Cache de sugestões por termo dentro da sessão
**Arquivos:** `src/lib/mapboxGeocode.ts`
1. Cache em memória `Map<sessionToken + q, suggestions>`, limite 50 entradas.
2. Apagar tudo ao encerrar a sessão.
3. Backspace que volta a um termo já digitado **não** gasta `/suggest` novo.
4. Falha nunca fica em cache.
**Checklist:** [ ] cache por sessão · [ ] backspace não gasta request · [ ] falha fora do cache

### E10 · Testes da camada de API
**Arquivos:** `src/lib/__tests__/mapboxGeocode.test.ts`
1. `/suggest` com resposta real de "xbz" → 2 sugestões, sem coordenada.
2. `/retrieve` → coordenada correta.
3. `/suggest` 429 → `rate_limited` sem cair no fallback (é limite, não falha de rota).
4. `/suggest` rede → cai no `/forward`.
5. Cache: mesmo termo 2× = 1 request.
**Checklist:** [ ] 5 casos · [ ] shapes reais da Mapbox nos mocks · [ ] verde

### E11 · Teste de mutação da camada
**Arquivos:** —
1. Remover o `session_token` da URL → teste falha.
2. Remover o cache → teste do backspace falha.
3. Trocar `features[0].geometry.coordinates` por `center` → teste do retrieve falha.
4. Restaurar; suíte verde.
**Checklist:** [ ] 3 mutações provadas · [ ] suíte restaurada

### E12 · PR da Fase 1
1. Branch `claude/feat-searchbox-api-<AAMMDD-HHMM>`; PR só com `mapboxGeocode.ts`, `mapboxSession.ts` e testes.
2. Corpo com a cascata e o custo por sessão.
3. Sem mudança de UI nesta fase — nada muda para o operador ainda.
**Checklist:** [ ] PR aberta · [ ] CI verde · [ ] zero mudança visual

---

# FASE 2 — Hook de autocomplete (E13–E20)

### E13 · `useAddressAutocomplete` — esqueleto
**Arquivos:** `src/components/inbox/location-picker/useAddressAutocomplete.ts` (novo)
1. Entrada: `{ token, proximity, enabled }`. Saída: `{ query, setQuery, suggestions, isLoading, error, highlightedIndex, ... }`.
2. Estado interno com `useReducer` (evita cascata de `setState`).
3. Nenhuma chamada enquanto `enabled` for falso.
**Checklist:** [ ] API do hook definida · [ ] sem request com enabled=false

### E14 · Debounce e piso de caracteres
1. Debounce de **300 ms** após a última tecla.
2. Mínimo de **3 caracteres** para disparar (evita queimar sessão em "a").
3. Digitação contínua não acumula timers.
4. Teste com fake timers: 10 teclas rápidas → 1 request.
**Checklist:** [ ] 300 ms · [ ] piso de 3 · [ ] 10 teclas = 1 request

### E15 · Cancelamento da consulta anterior
1. `AbortController` por consulta; a anterior é abortada.
2. Resposta abortada nunca vira estado nem toast.
3. Teste: resposta lenta da 1ª não sobrescreve a 2ª.
**Checklist:** [ ] abort na anterior · [ ] sem race · [ ] teste

### E16 · Seleção e `/retrieve`
1. `select(index)` chama `retrievePlace()`, marca no mapa e encerra a sessão.
2. Enquanto o `/retrieve` roda, o item fica em estado de carregamento (sem travar a lista).
3. Falha → toast com a causa + lista continua aberta.
**Checklist:** [ ] retrieve no clique · [ ] loading por item · [ ] falha não fecha a lista

### E17 · Teclado
1. `↓`/`↑` movem o destaque; `Enter` escolhe; `Esc` fecha.
2. `Home`/`End` vão ao primeiro/último.
3. Sem item destacado, `Enter` cai na busca da #737 (`/forward`) — o comportamento antigo.
**Checklist:** [ ] 5 teclas · [ ] Enter sem seleção = busca antiga

### E18 · Estados vazios e de erro
1. "Nada encontrado para <termo>" quando `/suggest` devolve lista vazia.
2. Erro por causa (rede, limite, servidor), com botão "Tentar novamente".
3. Nunca deixar a lista aberta e vazia sem explicação.
**Checklist:** [ ] vazio explicado · [ ] erro por causa · [ ] retry

### E19 · Testes do hook
**Arquivos:** `src/components/inbox/location-picker/__tests__/useAddressAutocomplete.test.tsx` (novo)
1. Debounce, piso de 3, cancelamento, seleção → coordenada, teclado, vazio, erro.
2. Nenhum teste depende de rede; `mapboxGeocode` mockado.
3. Mutação: tirar o debounce → teste "10 teclas = 1 request" falha.
**Checklist:** [ ] ≥ 8 casos · [ ] mutação provada

### E20 · PR da Fase 2
1. Branch própria, PR com o hook + testes, ainda sem UI.
2. Corpo com o número de requests por busca típica (medido nos testes).
**Checklist:** [ ] PR aberta · [ ] CI verde

---

# FASE 3 — Combobox na tela (E21–E28)

### E21 · Campo de busca vira combobox
**Arquivos:** `src/components/inbox/LocationPicker.tsx`
1. `role="combobox"`, `aria-expanded`, `aria-controls`, `aria-autocomplete="list"`.
2. Lista `role="listbox"` com `role="option"` e `aria-selected`.
3. `aria-activedescendant` apontando para o item destacado.
**Checklist:** [ ] ARIA 1.2 completo · [ ] leitor de tela anuncia a contagem

### E22 · Linha da sugestão
1. Ícone por `feature_type` (📍 POI, 🛣️ rua, 🏙️ cidade).
2. Nome em destaque + endereço completo em texto secundário, ambos com `truncate`.
3. Distância quando o `/suggest` mandar (`distance`), formatada em km/m.
**Checklist:** [ ] 3 tipos com ícone · [ ] 2 linhas por item · [ ] distância opcional

### E23 · Destaque do trecho digitado
1. Marcar em negrito o pedaço do nome que casa com o termo.
2. Comparação sem acento e sem caixa.
3. Nunca usar `dangerouslySetInnerHTML`.
**Checklist:** [ ] match sem acento · [ ] sem innerHTML

### E24 · Carregamento e posição da lista
1. Skeleton de 3 linhas enquanto o `/suggest` roda.
2. Lista ancorada ao campo, com `max-height` e rolagem.
3. Fechar ao clicar fora; não fechar ao rolar a lista.
**Checklist:** [ ] skeleton · [ ] não cobre o botão Enviar · [ ] clique fora fecha

### E25 · Mobile
1. Em telas < 640 px a lista ocupa a largura do diálogo.
2. Teclado virtual não empurra a lista para fora da tela.
3. Alvo de toque ≥ 44 px por item.
**Checklist:** [ ] 360 px sem overflow · [ ] alvo 44 px

### E26 · "Powered by Mapbox"
1. Atribuição obrigatória da Search Box no rodapé da lista, como no playground.
2. Link para os termos, `rel="noopener noreferrer"`.
**Checklist:** [ ] atribuição visível · [ ] link correto

### E27 · Testes de UI
**Arquivos:** `src/components/inbox/__tests__/LocationPicker.test.tsx`
1. Digitar 3 letras → lista aparece; clicar → marcador vai para a coordenada do `/retrieve`.
2. Navegação por teclado e `Esc`.
3. ARIA: `combobox` + `listbox` + `activedescendant` presentes.
4. Atribuição renderizada.
**Checklist:** [ ] 4 casos · [ ] verde

### E28 · PR da Fase 3
1. PR com a UI completa atrás da flag.
2. Prints (desktop e 360 px) no corpo da PR.
**Checklist:** [ ] PR aberta · [ ] prints · [ ] CI verde

---

# FASE 4 — Integração com o mapa e o fluxo de envio (E29–E34)

### E29 · Escolha alimenta mapa, marcador e envio
**Arquivos:** `useLocationPicker.ts`
1. A sugestão escolhida passa por `chooseSearchResult()` — o caminho que a #737 já criou.
2. `flyTo` + marcador + card de confirmação com nome, endereço e coordenada.
3. Encerrar a sessão de busca depois do `/retrieve`.
**Checklist:** [ ] reusa chooseSearchResult · [ ] card de confirmação igual · [ ] sessão encerrada

### E30 · Convivência com clique no mapa e GPS
1. Clicar no mapa continua chamando `reverseGeocodePlace()` (não é Search Box).
2. GPS idem; nenhuma sessão de busca é aberta por esses caminhos.
3. Escolher sugestão limpa o resultado anterior do clique/GPS, e vice-versa.
**Checklist:** [ ] 3 origens não se atropelam · [ ] nenhuma sessão extra

### E31 · `proximity` dinâmico
1. Enquanto o mapa estiver visível, `proximity` = centro do mapa.
2. Na aba "Minha Localização" com GPS obtido, `proximity` = posição do agente.
3. Sem nada disso, São Paulo (o `DEFAULT_CENTER` de hoje).
4. Teste dos 3 casos.
**Checklist:** [ ] 3 fontes · [ ] teste

### E32 · Comportamento quando a flag está desligada
1. Campo volta a ser input simples + botão "Buscar" (#737).
2. Nenhum import do hook novo é avaliado (lazy) para não pesar o bundle.
3. Teste de render nos dois modos.
**Checklist:** [ ] volta ao fluxo antigo · [ ] sem custo de bundle · [ ] teste

### E33 · Orçamento de bundle
1. Medir o delta do chunk do inbox antes/depois (`npm run build`).
2. Registrar o número no PR; o repo declara orçamento de first load.
3. Se passar do orçamento, o combobox vira import dinâmico.
**Checklist:** [ ] delta medido · [ ] dentro do orçamento

### E34 · PR da Fase 4
1. PR integrando busca + mapa + envio.
2. Corpo com o teste de ponta a ponta descrito (digitar → escolher → enviar).
**Checklist:** [ ] PR aberta · [ ] CI verde

---

# FASE 5 — Custo, limites e telemetria (E35–E40)

### E35 · Contador de sessões
**Arquivos:** `src/lib/mapboxSession.ts`
1. Registrar em `audit_logs` (evento `searchbox_session`) o início de cada sessão, com `source`.
2. Um registro por sessão, nunca por `/suggest`.
3. Sem dado pessoal: só contagem e origem.
**Checklist:** [ ] 1 evento por sessão · [ ] sem PII

### E36 · Painel de uso
**Arquivos:** consulta SQL documentada em `docs/mapa/`
1. Query de sessões/dia e sessões/mês a partir de `audit_logs`.
2. Comparar com o teto gratuito de **500 sessões/mês**.
3. Registrar o primeiro mês medido no apêndice B.
**Checklist:** [ ] query no doc · [ ] comparação com o teto

### E37 · Guarda de custo
1. Se as sessões do mês passarem de um limite configurável (padrão: 450), o autocomplete cai para `/forward` automaticamente.
2. O operador não vê erro — a busca continua funcionando, só sem sugestão enquanto digita.
3. Registrar o rebaixamento em `audit_logs`.
**Checklist:** [ ] limite configurável · [ ] degradação silenciosa · [ ] evento registrado

### E38 · Tratamento de 429
1. `/suggest` com 429 → parar de sugerir por 60 s e avisar uma única vez.
2. Não tentar de novo a cada tecla.
3. Teste com fake timers.
**Checklist:** [ ] backoff de 60 s · [ ] 1 aviso só · [ ] teste

### E39 · Revisão de privacidade
1. O termo digitado vai para a Mapbox — documentar isso no doc do módulo.
2. Não registrar o termo em `audit_logs` (só a contagem).
3. Conferir se a política de retenção do repo cobre o caso.
**Checklist:** [ ] termo fora do log · [ ] doc atualizado

### E40 · PR da Fase 5
1. PR com telemetria + guarda de custo.
2. Corpo com a query de acompanhamento.
**Checklist:** [ ] PR aberta · [ ] CI verde

---

# FASE 6 — Mesmo autocomplete no cadastro de contato (E41–E45)

> Depende da PR #746 (colunas de endereço em `contacts`) estar mergeada.

### E41 · Campo de endereço do contato com autocomplete
**Arquivos:** `src/components/contacts/ContactForm.tsx`
1. O campo "Logradouro" vira o mesmo combobox, com `types=address,street,place`.
2. Escolher preenche logradouro, bairro, cidade, UF e CEP quando o `/retrieve` trouxer `context`.
3. O operador pode editar qualquer campo depois — nada fica travado.
**Checklist:** [ ] 1 escolha preenche 5 campos · [ ] tudo editável

### E42 · Guardar a coordenada do contato
**Arquivos:** migration nova
1. Colunas `latitude`/`longitude` em `contacts` (nullable), preenchidas pelo `/retrieve`.
2. Sem geocodificar contato antigo em massa (custo); só ao editar.
3. DDL aditiva, PR aberta esperando aprovação (regra de banco de produção).
**Checklist:** [ ] 2 colunas · [ ] sem backfill automático · [ ] PR sem merge

### E43 · Mapa de contatos passa a usar coordenada real
**Arquivos:** `src/components/contacts/ContactRegionMap.tsx`
1. Contato com `latitude/longitude` vira ponto próprio no mapa.
2. Contato sem coordenada continua na bolha do DDD.
3. A legenda distingue "endereço confirmado" de "aproximado pelo DDD".
**Checklist:** [ ] 2 fontes no mesmo mapa · [ ] legenda honesta

### E44 · Testes da Fase 6
1. Escolher sugestão preenche os campos certos.
2. Contato sem coordenada não some do mapa.
3. Legenda aparece quando há mistura das duas fontes.
**Checklist:** [ ] 3 casos · [ ] verde

### E45 · PR da Fase 6
**Checklist:** [ ] PR aberta · [ ] CI verde · [ ] DDL destacada no corpo

---

# FASE 7 — Qualidade, rollout e fechamento (E46–E50)

### E46 · Auditoria adversarial
1. Rodar uma revisão focada em: sessão vazando entre buscas, request sem debounce, resultado de request cancelada virando estado, foco perdido no teclado.
2. Corrigir o que aparecer, cada achado com teste.
**Checklist:** [ ] 4 frentes revisadas · [ ] achados com teste

### E47 · Verificação com termos reais
1. Testar com termos do dia a dia da Promo Brindes: `XBZ BRINDES`, `Promo Brindes Curitiba`, `Rodonaves Guarulhos`, `avenida paulista 1000`, CEP puro (`01310-100`), e um termo sem sentido.
2. Registrar no doc o que cada um devolve — sem maquiar o resultado ruim.
3. Termo sem sentido **não** pode virar seleção automática.
**Checklist:** [ ] 6 termos documentados · [ ] lixo não é auto-selecionado

### E48 · Ligar a flag em produção
1. Ligar para uma conexão/uma fila primeiro, se houver como segmentar; senão, ligar para todos e acompanhar.
2. Acompanhar `audit_logs` por 48 h: erros de Search Box e número de sessões.
3. Plano de reversão: desligar a flag (não precisa de deploy).
**Checklist:** [ ] flag ligada · [ ] 48 h acompanhadas · [ ] reversão testada

### E49 · Confirmação no navegador
1. Abrir o picker logado em produção, digitar `XBZ BRINDES` e conferir que a sugestão certa aparece e que o envio chega com a coordenada de São Paulo.
2. Print no doc.
3. Conferir uma mensagem de localização recebida pelo cliente (balão), para garantir que nada quebrou nesse caminho.
**Checklist:** [ ] print do fluxo certo · [ ] envio confirmado · [ ] balão intacto

### E50 · Fechamento
1. `docs/mapa/ARQUITETURA_BUSCA.md`: cascata de endpoints, custo por sessão, flags e limites.
2. Atualizar `/areas/mapa-localizacao-whatsapp.md` no projeto com o estado final.
3. Registrar no apêndice B o custo real do primeiro mês.
4. Fechar as pendências do plano que não forem feitas, com o motivo.
**Checklist:** [ ] arquitetura documentada · [ ] memória do projeto atualizada · [ ] custo real registrado · [ ] pendências explicadas

---

## Apêndice A — Shapes verificados (2026-09-25)

**`/suggest`** (`q=XBZ BRINDES`, `country=br`, `language=pt`, `proximity=-46.6333,-23.5505`):
```
suggestions[0] = {
  name: "XBZ Brindes",
  full_address: "R. da Independência, São Paulo, 01524, Brasil",
  feature_type: "poi",
  mapbox_id: "dXJuOm1ieHBvaTpiZW..."   // sem coordenada
}
suggestions[1] = { name: "Rua Brendes Pereira da Silva", feature_type: "street", ... }
```

**`/retrieve/{mapbox_id}`**:
```
features[0].geometry.coordinates = [-46.61563441, -23.56672978]
features[0].properties.name        = "XBZ Brindes"
features[0].properties.full_address= "R. da Independência, São Paulo, 01524, Brazil"
```

**Autocomplete parcial** (mesma sessão): `"xbz"` → `XBZ Presentes`, `XBZ Brindes` · `"xbz bri"` → `XBZ Brindes` em primeiro.

## Apêndice B — Custo (a preencher com número medido em E01/E36/E50)

| Item | Valor |
|---|---|
| Sessões grátis/mês (Search Box) | 500 |
| Preço após o teto | US$ 3,00 / 1.000 sessões |
| O que é 1 sessão | até 50 `/suggest` + 1 `/retrieve`, expira em 2 min de inatividade |
| Geocoding v5 (fallback) | 100.000 req/mês grátis, depois US$ 0,75 / 1.000 |
| Buscas/mês medidas hoje | _a medir em E01_ |
| Sessões/mês após o rollout | _a medir em E36_ |
| Custo real do 1º mês | _a medir em E50_ |

## Apêndice C — Cascata de decisão

```
operador digita (≥ 3 caracteres, debounce 300 ms)
        │
        ├─► /suggest  ──ok──► lista de sugestões ──clique──► /retrieve ──ok──► marcador + envio
        │        │                                              │
        │        │                                              └─falha─► searchPlaces(nome)  [/forward]
        │        │
        │        └─falha (rede/timeout/http)─► searchPlaces(termo)  [/forward]
        │                                            │
        │                                            └─sem acerto─► geocoding/v5 (relevance ≥ 0,8)
        │
        └─ Enter sem seleção ─► searchPlaces(termo)   [comportamento da #737]
```
