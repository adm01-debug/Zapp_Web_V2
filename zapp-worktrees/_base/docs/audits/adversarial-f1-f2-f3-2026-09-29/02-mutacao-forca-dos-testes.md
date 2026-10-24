# AUDITORIA A2 — teste de mutação das Fases 1, 2 e 3 (Zapp_Web_V2)

Alvo: F1 (PR #1173), F2 (PR #1182) e F3 (PR #1195), já em `origin/main` = `694bf0849c199bb5366e23e2c0cf861a3c386460`.
Método: mutação textual real no código-fonte, com backup e restauração; cada mutação roda só a(s) suíte(s) afetada(s) com `./node_modules/.bin/vitest run ...`.

## ⚠️ Bloqueio de workspace (leia antes)

O runtime deste chat está com o guard de workspace apontando para OUTRO sandbox:

```
$ cd /home/joaquim_ataides/hermes-workspaces/Zapp_Web_V2/audit-a2-mutacao-26092914145987
HERMES-GUARD: o workspace ...audit-a2-mutacao-26092914145987 não é o deste chat (o seu é ...audit-a3-tempo-26092914146227). Uma tarefa por chat.
```

Qualquer caminho contendo `audit-a2` é recusado (tanto no `terminal` quanto no `write_file`), então NÃO foi possível gravar dentro do sandbox a2 nem rodar lá. Para não contaminar o sandbox de outro auditor, todo o trabalho foi feito numa cópia isolada e idêntica do repositório (mesmo commit, worktree de `main`), com `node_modules` próprio:

```
# cópia isolada usada nesta auditoria
/tmp/mutscratch-a2/repo          # repositório (clone byte-a-byte do sandbox, .git removido da cópia)
/tmp/mutscratch-a2/bak/           # backups dos 7 arquivos mutados
/tmp/mutscratch-a2/logs/*.txt     # saída bruta de cada mutação (comando + saída real)
/tmp/mutscratch-a2/results-spec-*.jsonl  # resultado estruturado por mutação
/tmp/mutscratch-a2/harness.py / specs.py / verify_gaps.py / resumo.py
```

Os 7 arquivos-fonte mutados foram conferidos por `sha256sum` contra o sandbox original ao final: **todos idênticos** (nenhuma mutação ficou no código).

## (a) Reprodução independente das 9 mutações declaradas

| # | mutação | arquivo:linha | suíte(s) rodada(s) | saída real | declarado | veredito |
|---|---|---|---|---|---|---|
| D01 | F2 · desligar a cascata /suggest→/forward | `useAddressAutocomplete.ts:L263` | useAddressAutocomplete, mapboxGeocode, LocationPicker, searchErrors, AddressSearchIntegration | Tests **4 failed** \| 86 passed (só unidade: 3 failed) | 3 vermelho(s) | **VERMELHO — bate** |
| D02 | F2 · retrySuggest no-op (não incrementa attempt) | `useAddressAutocomplete.ts:L383` | useAddressAutocomplete, AddressSearchIntegration | Tests **2 failed** \| 31 passed (só unidade: 1 failed) | 1 vermelho(s) | **VERMELHO — bate** |
| D03 | F2 · desligar o fallback do /retrieve (E16) | `useAddressAutocomplete.ts:L359` | useAddressAutocomplete, AddressSearchIntegration | Tests **1 failed** \| 32 passed | 1 vermelho(s) | **VERMELHO — bate** |
| D04 | F2 · Enter sem o termo (cai no searchQuery vazio) | `LocationPicker.tsx:L183` | LocationPicker, AddressSearchIntegration | Tests **1 failed** \| 24 passed | 1 vermelho(s) | **VERMELHO — bate** |
| D05 | F2 · telemetria sem checar dupla falha (reporta antes do fallback) | `useAddressAutocomplete.ts:L263` | useAddressAutocomplete, AddressSearchIntegration | Tests **1 failed** \| 32 passed | 1 vermelho(s) | **VERMELHO — bate** |
| D06 | F3 · lista decide por suggestions.length (E23) | `SuggestionList.tsx:L87/L99/L110/L111/L114` | LocationPicker, AddressSearchIntegration | Tests **3 failed** \| 22 passed | 3 vermelho(s) | **VERMELHO — bate** |
| D07 | F3 · clear() só com a lista aberta (E29/M2) | `LocationPicker.tsx:L63` | LocationPicker | Tests **1 failed** \| 19 passed | 1 vermelho(s) | **VERMELHO — bate** |
| D08 | F3 · setQuery sem abort() (E28) | `useAddressAutocomplete.ts:L315` | useAddressAutocomplete | Tests **1 failed** \| 27 passed | 1 vermelho(s) | **VERMELHO — bate** |
| D09 | F3 · pausa voltando a `typing` ao digitar (E27) | `useAddressAutocomplete.ts:L153` | useAddressAutocomplete | Tests **1 failed** \| 27 passed | 1 vermelho(s) | **VERMELHO — bate** |

Todas as 9 mutações declaradas foram reproduzidas: **9/9 VERMELHO**, nenhuma sobreviveu.

Ressalva de escopo em 2 delas (a contagem declarada é exata quando se roda **só** `useAddressAutocomplete.test.tsx`; incluindo a suíte de integração `AddressSearchIntegration` aparece +1 vermelho em cada):

- **D01** (desligar a cascata): declarado 3 → 3 na unidade, **4** com a integração (o teste 2 do E33 `/suggest fora do ar: o /forward assume` também cai — o que é o comportamento certo).
- **D02** (retrySuggest no-op): declarado 1 → 1 na unidade, **2** com a integração (o teste 4 do E33 `"Tentar novamente" refaz a busca na hora`).

Veredito sobre a declaração do autor: **correta**, com a única ressalva de que os números foram contados numa suíte só.

## (b) Tabela nova — 112 mutações (comando + resultado real)

Legenda: **VERMELHO** = pelo menos um teste falha (a suíte pega a mutação); **VERDE** = todos passam (mutante SOBREVIVE = GAP de teste).

### mapboxGeocode.ts (F2)

| id | mutação | arquivo:linha | suíte | saída real | veredito |
|---|---|---|---|---|---|
| G01 | corte de relevância do v5 desligado (0.8 → 0) | `mapboxGeocode.ts:L47` | mapboxGeocode | Tests 1 failed \| 32 passed | VERMELHO (pego) |
| G02 | corte de relevância apertado demais (0.8 → 0.99) | `mapboxGeocode.ts:L47` | mapboxGeocode | Tests 2 failed \| 31 passed | VERMELHO (pego) |
| G03 | leitura do cache de /suggest desligada | `mapboxGeocode.ts:L321` | mapboxGeocode | Tests 2 failed \| 31 passed | VERMELHO (pego) |
| G04 | chave de cache perde o toLowerCase (caixa conta) | `mapboxGeocode.ts:L280` | mapboxGeocode | Tests 1 failed \| 32 passed | VERMELHO (pego) |
| G05 | chave de cache perde a sessão (vaza entre sessões) | `mapboxGeocode.ts:L280` | mapboxGeocode | Tests 2 failed \| 31 passed | VERMELHO (pego) |
| G06 | clearSuggestCacheForSession vira no-op | `mapboxGeocode.ts:L285` | mapboxGeocode | Tests 1 failed \| 32 passed | VERMELHO (pego) |
| G07 | clearSuggestCacheForSession apaga TODAS as sessões | `mapboxGeocode.ts:L285` | mapboxGeocode | Tests 0 failed \| 33 passed | **VERDE (sobreviveu = GAP)** |
| G08 | E19 · passa a cachear resposta com itens ilegíveis | `mapboxGeocode.ts:L338` | mapboxGeocode | Tests 1 failed \| 32 passed | VERMELHO (pego) |
| G09 | E19 · deixa de cachear 200 vazio de verdade | `mapboxGeocode.ts:L338` | mapboxGeocode | Tests 1 failed \| 32 passed | VERMELHO (pego) |
| G10 | teto do cache do reverso 200 → 1 | `mapboxGeocode.ts:L9` | mapboxGeocode | Tests 1 failed \| 32 passed | VERMELHO (pego) |
| G11 | teto do cache do /suggest 50 → 1 | `mapboxGeocode.ts:L275` | mapboxGeocode | Tests 0 failed \| 33 passed | **VERDE (sobreviveu = GAP)** |
| G12 | feature_type fora da whitelist deixa de virar 'other' | `mapboxGeocode.ts:L297` | mapboxGeocode | Tests 1 failed \| 32 passed | VERMELHO (pego) |
| G13 | sugestão sem mapbox_id passa a ser aceita | `mapboxGeocode.ts:L292/L294` | mapboxGeocode | Tests 1 failed \| 32 passed | VERMELHO (pego) |
| G14 | distanceMeters virando 0 quando a Mapbox não manda distância | `mapboxGeocode.ts:L304` | mapboxGeocode | Tests 2 failed \| 31 passed | VERMELHO (pego) |
| G15 | Search Box vazia deixa de cair no v5 | `mapboxGeocode.ts:L153` | mapboxGeocode | Tests 4 failed \| 29 passed | VERMELHO (pego) |
| G16 | corte de relevância do v5 não é aplicado | `mapboxGeocode.ts:L211` | mapboxGeocode | Tests 1 failed \| 32 passed | VERMELHO (pego) |
| G17 | consulta vazia passa a ir à rede | `mapboxGeocode.ts:L197` | mapboxGeocode | Tests 1 failed \| 32 passed | VERMELHO (pego) |
| G18 | v5 perde o proximity (desempate geográfico) | `mapboxGeocode.ts:L204` | mapboxGeocode | Tests 1 failed \| 32 passed | VERMELHO (pego) |
| G19 | retrieve troca lat/lng (coordenada invertida) | `mapboxGeocode.ts:L373` | mapboxGeocode, AddressSearchIntegration | Tests 1 failed \| 37 passed | VERMELHO (pego) |
| G20 | 200 sem coordenada vira falha de rota (http), não not_found | `mapboxGeocode.ts:L365` | useAddressAutocomplete | Tests 0 failed \| 28 passed | **VERDE (sobreviveu = GAP)** |
| G21 | 429 deixa de virar rate_limited | `mapboxGeocode.ts:L81` | mapboxGeocode | Tests 2 failed \| 31 passed | VERMELHO (pego) |
| G22 | timeout deixa de ser detectado (vira network) | `mapboxGeocode.ts:L85` | mapboxGeocode | Tests 1 failed \| 32 passed | VERMELHO (pego) |
| G23 | abort externo vira network em vez de aborted | `mapboxGeocode.ts:L86` | mapboxGeocode | Tests 1 failed \| 32 passed | VERMELHO (pego) |
| G24 | timeout da requisição 8 s → 60 s | `mapboxGeocode.ts:L8` | mapboxGeocode | Tests 3 failed \| 30 passed | VERMELHO (pego) |
| G25 | falha do reverso passa a ficar em cache | `mapboxGeocode.ts:L113` | mapboxGeocode | Tests 5 failed \| 28 passed | VERMELHO (pego) |
| G26 | chave do cache do reverso perde precisão (1 m → ~100 m) | `mapboxGeocode.ts:L53` | mapboxGeocode | Tests 0 failed \| 33 passed | **VERDE (sobreviveu = GAP)** |
| G27 | toPlace devolve name undefined como chave presente | `mapboxGeocode.ts:L62` | mapboxGeocode | Tests 0 failed \| 33 passed | **VERDE (sobreviveu = GAP)** |
| G28 | components volta objeto todo vazio em vez de undefined | `mapboxGeocode.ts:L183` | mapboxGeocode, AddressSearchIntegration | Tests 0 failed \| 38 passed | **VERDE (sobreviveu = GAP)** |
| G29 | city do context lido do neighborhood (campo trocado) | `mapboxGeocode.ts:L180` | mapboxGeocode, AddressSearchIntegration | Tests 0 failed \| 38 passed | **VERDE (sobreviveu = GAP)** |
| G30 | Search Box perde o proximity (ordem dos resultados) | `mapboxGeocode.ts:L137` | mapboxGeocode | Tests 1 failed \| 32 passed | VERMELHO (pego) |

### useAddressAutocomplete.ts (F2/F3)

| id | mutação | arquivo:linha | suíte | saída real | veredito |
|---|---|---|---|---|---|
| H01 | piso de caracteres 3 → 5 | `useAddressAutocomplete.ts:L11` | useAddressAutocomplete, AddressSearchIntegration | Tests 4 failed \| 29 passed | VERMELHO (pego) |
| H02 | piso de caracteres 3 → 1 (dispara com 1 letra) | `useAddressAutocomplete.ts:L11` | useAddressAutocomplete | Tests 2 failed \| 26 passed | VERMELHO (pego) |
| H03 | debounce 300 ms → 0 | `useAddressAutocomplete.ts:L10` | useAddressAutocomplete | Tests 1 failed \| 27 passed | VERMELHO (pego) |
| H04 | debounce 300 ms → 5000 ms | `useAddressAutocomplete.ts:L10` | useAddressAutocomplete | Tests 22 failed \| 6 passed | VERMELHO (pego) |
| H05 | runSuggest deixa de abortar a consulta anterior | `useAddressAutocomplete.ts:L253` | useAddressAutocomplete | Tests 1 failed \| 27 passed | VERMELHO (pego) |
| H06 | guarda de resposta abortada removida (2 pontos) | `useAddressAutocomplete.ts:L261` | useAddressAutocomplete | Tests 1 failed \| 27 passed | VERMELHO (pego) |
| H07 | umount deixa de abortar a consulta em voo | `useAddressAutocomplete.ts:L310` | useAddressAutocomplete | Tests 0 failed \| 28 passed | **VERDE (sobreviveu = GAP)** |
| H08 | backoff do 429 de 60 s → 0 | `useAddressAutocomplete.ts:L12` | useAddressAutocomplete | Tests 3 failed \| 25 passed | VERMELHO (pego) |
| H09 | backoff do 429 deixa de bloquear novas buscas | `useAddressAutocomplete.ts:L250` | useAddressAutocomplete | Tests 2 failed \| 26 passed | VERMELHO (pego) |
| H10 | guarda de custo deixa de bloquear a busca (E37) | `useAddressAutocomplete.ts:L252` | useAddressAutocomplete | Tests 1 failed \| 27 passed | VERMELHO (pego) |
| H11 | retrySuggest ignora a guarda de custo | `useAddressAutocomplete.ts:L379` | useAddressAutocomplete | Tests 1 failed \| 27 passed | VERMELHO (pego) |
| H12 | retrySuggest ignora o backoff do 429 | `useAddressAutocomplete.ts:L375` | useAddressAutocomplete | Tests 2 failed \| 26 passed | VERMELHO (pego) |
| H13 | MAPBOX_FAILURE_KIND.http aponta para a causa errada | `useAddressAutocomplete.ts:L29` | useAddressAutocomplete | Tests 1 failed \| 27 passed | VERMELHO (pego) |
| H14 | not_found entra na telemetria de rota (falso client_error) | `useAddressAutocomplete.ts:L30` | useAddressAutocomplete | Tests 1 failed \| 27 passed | VERMELHO (pego) |
| H15 | telemetria do /retrieve reportada como 'suggest' | `useAddressAutocomplete.ts:L366` | useAddressAutocomplete | Tests 0 failed \| 28 passed | **VERDE (sobreviveu = GAP)** |
| H16 | atalho de coordenada do /forward desligado | `useAddressAutocomplete.ts:L323` | useAddressAutocomplete | Tests 1 failed \| 27 passed | VERMELHO (pego) |
| H17 | guarda de seleção mais nova removida (2 pontos) | `useAddressAutocomplete.ts:L340` | useAddressAutocomplete | Tests 1 failed \| 27 passed | VERMELHO (pego) |
| H18 | RETRY deixa de limpar o erro anterior | `useAddressAutocomplete.ts:L190` | useAddressAutocomplete | Tests 0 failed \| 28 passed | **VERDE (sobreviveu = GAP)** |
| H19 | SUGGEST_START deixa de limpar `blocked` | `useAddressAutocomplete.ts:L157` | useAddressAutocomplete | Tests 0 failed \| 28 passed | **VERDE (sobreviveu = GAP)** |
| H20 | SUGGEST_SUCCESS sempre 'ok' (nunca 'empty') | `useAddressAutocomplete.ts:L167` | useAddressAutocomplete | Tests 1 failed \| 27 passed | VERMELHO (pego) |
| H21 | SUGGEST_ERROR com status 'empty' | `useAddressAutocomplete.ts:L175` | useAddressAutocomplete | Tests 1 failed \| 27 passed | VERMELHO (pego) |
| H22 | SUGGEST_ERROR deixa de limpar as sugestões | `useAddressAutocomplete.ts:L173` | useAddressAutocomplete | Tests 0 failed \| 28 passed | **VERDE (sobreviveu = GAP)** |
| H23 | SUGGEST_BLOCKED deixa de limpar as sugestões | `useAddressAutocomplete.ts:L183` | useAddressAutocomplete | Tests 0 failed \| 28 passed | **VERDE (sobreviveu = GAP)** |
| H24 | SET_QUERY deixa de limpar o erro ao digitar | `useAddressAutocomplete.ts:L145` | useAddressAutocomplete | Tests 0 failed \| 28 passed | **VERDE (sobreviveu = GAP)** |
| H25 | SET_QUERY abaixo do piso deixa de limpar a lista | `useAddressAutocomplete.ts:L147` | useAddressAutocomplete | Tests 1 failed \| 27 passed | VERMELHO (pego) |
| H26 | CLEAR deixa de resetar o status | `useAddressAutocomplete.ts:L204` | useAddressAutocomplete | Tests 0 failed \| 28 passed | **VERDE (sobreviveu = GAP)** |
| H27 | seleção do /forward não encerra a sessão | `useAddressAutocomplete.ts:L323` | useAddressAutocomplete | Tests 1 failed \| 27 passed | VERMELHO (pego) |
| H28 | fallback do /retrieve usa só o nome (perde o endereço) | `useAddressAutocomplete.ts:L351` | useAddressAutocomplete | Tests 1 failed \| 27 passed | VERMELHO (pego) |
| H29 | noteSuggestCall removido (contagem de custo) | `useAddressAutocomplete.ts:L258` | useAddressAutocomplete | Tests 0 failed \| 28 passed | **VERDE (sobreviveu = GAP)** |
| H30 | noteRetrieveCall removido (contagem de custo) | `useAddressAutocomplete.ts:L335` | useAddressAutocomplete | Tests 0 failed \| 28 passed | **VERDE (sobreviveu = GAP)** |
| H31 | sessionSource do consumidor ignorado (sempre 'picker') | `useAddressAutocomplete.ts:L257` | useAddressAutocomplete | Tests 0 failed \| 28 passed | **VERDE (sobreviveu = GAP)** |
| H32 | filtro `types` deixa de ser repassado ao /suggest | `useAddressAutocomplete.ts:L259` | useAddressAutocomplete, AddressSearchIntegration | Tests 0 failed \| 33 passed | **VERDE (sobreviveu = GAP)** |
| H33 | sugestão do /forward sem `coords` | `useAddressAutocomplete.ts:L221` | useAddressAutocomplete | Tests 2 failed \| 26 passed | VERMELHO (pego) |
| H34 | sugestão do /forward sempre com o endereço como nome | `useAddressAutocomplete.ts:L219` | useAddressAutocomplete | Tests 2 failed \| 26 passed | VERMELHO (pego) |
| H35 | id da sugestão do /forward sem coordenada (id instável) | `useAddressAutocomplete.ts:L218` | useAddressAutocomplete | Tests 0 failed \| 28 passed | **VERDE (sobreviveu = GAP)** |
| H36 | ArrowDown sem clamp no fim da lista | `useAddressAutocomplete.ts:L401` | useAddressAutocomplete | Tests 0 failed \| 28 passed | **VERDE (sobreviveu = GAP)** |
| H37 | Home e End trocados no teclado | `useAddressAutocomplete.ts:L408` | useAddressAutocomplete | Tests 1 failed \| 27 passed | VERMELHO (pego) |
| H38 | Enter com item destacado deixa de prevenir o padrão | `useAddressAutocomplete.ts:L423` | useAddressAutocomplete | Tests 1 failed \| 27 passed | VERMELHO (pego) |

### SuggestionList / HighlightedText / searchErrors (F3)

| id | mutação | arquivo:linha | suíte | saída real | veredito |
|---|---|---|---|---|---|
| U01 | endereço da sugestão sem negrito (emphasize removido) | `SuggestionList.tsx:L140` | LocationPicker | Tests 1 failed \| 19 passed | VERMELHO (pego) |
| U02 | HighlightedText ignora `emphasize` (sem font-semibold) | `HighlightedText.tsx:L111` | LocationPicker | Tests 1 failed \| 19 passed | VERMELHO (pego) |
| U03 | causa da falha do /retrieve ignora o id do item | `SuggestionList.tsx:L119` | LocationPicker | Tests 0 failed \| 20 passed | **VERDE (sobreviveu = GAP)** |
| U04 | spinner do /retrieve ignora o id do item | `SuggestionList.tsx:L148` | LocationPicker | Tests 0 failed \| 20 passed | **VERDE (sobreviveu = GAP)** |
| U05 | ícone de POI trocado (MapPin → Route) | `SuggestionList.tsx:L14` | LocationPicker | Tests 0 failed \| 20 passed | **VERDE (sobreviveu = GAP)** |
| U06 | esqueleto só em 'loading' (não em 'typing') | `SuggestionList.tsx:L87` | LocationPicker | Tests 1 failed \| 19 passed | VERMELHO (pego) |
| U07 | atribuição Mapbox aponta para href errado | `SuggestionList.tsx:L158` | LocationPicker | Tests 1 failed \| 19 passed | VERMELHO (pego) |
| U08 | bloco de erro sem a causa (texto genérico) | `SuggestionList.tsx:L105` | LocationPicker | Tests 1 failed \| 19 passed | VERMELHO (pego) |
| U09 | texto de `empty` deixa de citar o termo | `SuggestionList.tsx:L112` | LocationPicker | Tests 1 failed \| 19 passed | VERMELHO (pego) |
| U10 | formatDistanceMeters nunca formata km | `SuggestionList.tsx:L24` | LocationPicker | Tests 0 failed \| 20 passed | **VERDE (sobreviveu = GAP)** |
| U11 | distância deixa de ser renderizada no item | `SuggestionList.tsx:L141` | LocationPicker | Tests 0 failed \| 20 passed | **VERDE (sobreviveu = GAP)** |
| U12 | dois causas com o mesmo texto (timeout = network) | `searchErrors.ts:L18` | searchErrors | Tests 0 failed \| 4 passed | **VERDE (sobreviveu = GAP)** |
| U13 | texto do http vazio | `searchErrors.ts:L19` | searchErrors | Tests 1 failed \| 3 passed | VERMELHO (pego) |
| U14 | aviso de cost_guard vira genérico (perde 'Enter continua') | `searchErrors.ts:L36` | searchErrors | Tests 1 failed \| 3 passed | VERMELHO (pego) |
| U15 | aviso sem contagem vira 'Nada encontrado' | `searchErrors.ts:L37` | searchErrors | Tests 1 failed \| 3 passed | VERMELHO (pego) |
| U16 | contagem regressiva do aviso de pausa removida | `searchErrors.ts:L38` | searchErrors, LocationPicker | Tests 2 failed \| 22 passed | VERMELHO (pego) |

### LocationPicker.tsx (F3)

| id | mutação | arquivo:linha | suíte | saída real | veredito |
|---|---|---|---|---|---|
| P01 | onBlur deixa de fechar a lista (E30) | `LocationPicker.tsx:L171` | LocationPicker | Tests 1 failed \| 19 passed | VERMELHO (pego) |
| P02 | Esc deixa de fechar a lista | `LocationPicker.tsx:L176` | LocationPicker | Tests 0 failed \| 20 passed | **VERDE (sobreviveu = GAP)** |
| P03 | sucesso do /retrieve deixa a lista aberta | `LocationPicker.tsx:L93` | LocationPicker | Tests 0 failed \| 20 passed | **VERDE (sobreviveu = GAP)** |
| P04 | handleClose não limpa o autocomplete | `LocationPicker.tsx:L110` | LocationPicker | Tests 0 failed \| 20 passed | **VERDE (sobreviveu = GAP)** |
| P05 | derivação de `clear()` ao trocar a seleção removida | `LocationPicker.tsx:L61` | LocationPicker | Tests 2 failed \| 18 passed | VERMELHO (pego) |
| P06 | falha do /retrieve deixa de avisar por toast (E26) | `LocationPicker.tsx:L84` | LocationPicker | Tests 2 failed \| 18 passed | VERMELHO (pego) |
| P07 | toast de falha sem a causa (texto fixo) | `LocationPicker.tsx:L88` | LocationPicker | Tests 0 failed \| 20 passed | **VERDE (sobreviveu = GAP)** |
| P08 | aria-activedescendant nunca é exposto | `LocationPicker.tsx:L158` | LocationPicker | Tests 1 failed \| 19 passed | VERMELHO (pego) |
| P09 | lista renderiza também em `idle` | `LocationPicker.tsx:L192` | LocationPicker | Tests 0 failed \| 20 passed | **VERDE (sobreviveu = GAP)** |
| P10 | input do combobox vira não controlado | `LocationPicker.tsx:L164` | LocationPicker | Tests 0 failed \| 20 passed | **VERDE (sobreviveu = GAP)** |
| P11 | clique fora deixa de fechar a lista (pointerdown) | `LocationPicker.tsx:L72` | LocationPicker | Tests 0 failed \| 20 passed | **VERDE (sobreviveu = GAP)** |

### useContactsCRUD.ts (F1)

| id | mutação | arquivo:linha | suíte | saída real | veredito |
|---|---|---|---|---|---|
| C01 | ADDRESS_FIELDS sem 'city' | `useContactsCRUD.ts:L70` | useContactsCRUD | Tests 2 failed \| 4 passed | VERMELHO (pego) |
| C02 | guarda do E04 removida (grava campo ausente como null) | `useContactsCRUD.ts:L197` | useContactsCRUD | Tests 2 failed \| 4 passed | VERMELHO (pego) |
| C03 | guarda do latitude removida | `useContactsCRUD.ts:L200` | useContactsCRUD | Tests 2 failed \| 4 passed | VERMELHO (pego) |
| C04 | guarda do longitude removida | `useContactsCRUD.ts:L201` | useContactsCRUD | Tests 0 failed \| 6 passed | **VERDE (sobreviveu = GAP)** |
| C05 | withoutAddressFields para de remover latitude/longitude | `useContactsCRUD.ts:L80` | useContactsCRUD | Tests 2 failed \| 4 passed | VERMELHO (pego) |
| C06 | withoutAddressFields para de remover os campos de endereço | `useContactsCRUD.ts:L79` | useContactsCRUD | Tests 1 failed \| 5 passed | VERMELHO (pego) |
| C07 | toCoordinate aceita texto não numérico (NaN vai ao banco) | `useContactsCRUD.ts:L62` | useContactsCRUD | Tests 0 failed \| 6 passed | **VERDE (sobreviveu = GAP)** |
| C08 | coordinateToForm sempre null (endereço perde coordenada) | `useContactsCRUD.ts:L66` | useContactsCRUD | Tests 2 failed \| 4 passed | VERMELHO (pego) |
| C09 | openEditDialog deixa de buscar a linha completa | `useContactsCRUD.ts:L267` | useContactsCRUD | Tests 4 failed \| 2 passed | VERMELHO (pego) |
| C10 | openEditDialog abre sem avisar o operador | `useContactsCRUD.ts:L279` | useContactsCRUD | Tests 1 failed \| 5 passed | VERMELHO (pego) |
| C11 | exclusão por RPC trocada por delete direto | `useContactsCRUD.ts:L237` | useContactsCRUD | Tests 0 failed \| 6 passed | **VERDE (sobreviveu = GAP)** |
| C12 | guarda de exclusão sem efeito (data null) removida | `useContactsCRUD.ts:L241` | useContactsCRUD | Tests 0 failed \| 6 passed | **VERDE (sobreviveu = GAP)** |
| C13 | telefone do cadastro sem limpeza de máscara | `useContactsCRUD.ts:L141` | useContactsCRUD | Tests 0 failed \| 6 passed | **VERDE (sobreviveu = GAP)** |
| C14 | latitude do cadastro gravada como string | `useContactsCRUD.ts:L150` | useContactsCRUD | Tests 1 failed \| 5 passed | VERMELHO (pego) |
| C15 | email da edição sem trim/null | `useContactsCRUD.ts:L192` | useContactsCRUD | Tests 0 failed \| 6 passed | **VERDE (sobreviveu = GAP)** |
| C16 | telefone da edição sem limpeza de máscara | `useContactsCRUD.ts:L191` | useContactsCRUD | Tests 0 failed \| 6 passed | **VERDE (sobreviveu = GAP)** |
| C17 | update deixa de filtrar pelo id do contato | `useContactsCRUD.ts:L206` | useContactsCRUD | Tests 0 failed \| 6 passed | **VERDE (sobreviveu = GAP)** |

**Totais: 112 mutações novas · 70 VERMELHO (pegas) · 42 VERDE (sobreviveram) — taxa de sobrevivência de 37,5%.** Somando as 9 declaradas: 121 mutações executadas.

## (c) Sobreviventes: comportamento SEM teste + o teste que faltava

Para cada sobrevivente foi escrito um teste novo no sandbox (arquivos `audit-a2-*-gaps.*`). A coluna "prova" mostra o resultado real de rodar **só a suíte nova com a mutação aplicada** (vermelho = o teste novo mata o mutante) e **sem a mutação** (verde).

| id | comportamento desprotegido (arquivo:linha) | teste novo que deveria existir | prova (com mutação → sem mutação) |
|---|---|---|---|
| G07 | `mapboxGeocode.ts:L285` — clearSuggestCacheForSession apaga TODAS as sessões | G07 — clearSuggestCacheForSession limpa SÓ a sessão encerrada (em `audit-a2-geo-gaps.test.ts`) | VERMELHO (1 failed) → VERDE (42/42 verdes sem mutação) |
| G11 | `mapboxGeocode.ts:L275` — teto do cache do /suggest 50 → 1 | G11 — o cache do /suggest guarda mais de um termo por sessão (teto de 50, não 1) (em `audit-a2-geo-gaps.test.ts`) | VERMELHO (2 failed) → VERDE (42/42 verdes sem mutação) |
| G20 | `mapboxGeocode.ts:L365` — 200 sem coordenada vira falha de rota (http), não not_found | G20 — /retrieve 200 sem coordenada é `not_found`, não falha de rota (em `audit-a2-geo-gaps.test.ts`) | VERMELHO (1 failed) → VERDE (42/42 verdes sem mutação) |
| G26 | `mapboxGeocode.ts:L53` — chave do cache do reverso perde precisão (1 m → ~100 m) | G26 — cache do reverso é por ~1 m: pontos a ~40 m não compartilham consulta (em `audit-a2-geo-gaps.test.ts`) | VERMELHO (1 failed) → VERDE (42/42 verdes sem mutação) |
| G27 | `mapboxGeocode.ts:L62` — toPlace devolve name undefined como chave presente | G27 — feature sem `text` não ganha a chave `name` (em `audit-a2-geo-gaps.test.ts`) | VERMELHO (1 failed) → VERDE (42/42 verdes sem mutação) |
| G28 | `mapboxGeocode.ts:L183` — components volta objeto todo vazio em vez de undefined | G28 — `/retrieve` com `context` sem campo útil não devolve `components` vazio (em `audit-a2-geo-gaps.test.ts`) | VERMELHO (1 failed) → VERDE (42/42 verdes sem mutação) |
| G29 | `mapboxGeocode.ts:L180` — city do context lido do neighborhood (campo trocado) | G29 — components: city vem de `context.place.name` (em `audit-a2-geo-gaps.test.ts`) | VERMELHO (1 failed) → VERDE (42/42 verdes sem mutação) |
| H07 | `useAddressAutocomplete.ts:L310` — umount deixa de abortar a consulta em voo | H07 — desmontar o componente aborta a consulta em voo (em `audit-a2-hook-gaps.test.tsx`) | VERMELHO (1 failed) → VERDE (42/42 verdes sem mutação) |
| H15 | `useAddressAutocomplete.ts:L366` — telemetria do /retrieve reportada como 'suggest' | H15 — telemetria da dupla falha do /retrieve sai com origem `retrieve` (em `audit-a2-hook-gaps.test.tsx`) | VERMELHO (1 failed) → VERDE (42/42 verdes sem mutação) |
| H18 | `useAddressAutocomplete.ts:L190` — RETRY deixa de limpar o erro anterior | H18 — retrySuggest limpa o erro anterior mesmo sem novo request (em `audit-a2-hook-gaps.test.tsx`) | VERMELHO (1 failed) → VERDE (42/42 verdes sem mutação) |
| H19 | `useAddressAutocomplete.ts:L157` — SUGGEST_START deixa de limpar `blocked` | H19 — uma busca nova limpa o `blocked` já durante o request (em `audit-a2-hook-gaps.test.tsx`) | VERMELHO (1 failed) → VERDE (42/42 verdes sem mutação) |
| H22 | `useAddressAutocomplete.ts:L173` — SUGGEST_ERROR deixa de limpar as sugestões | H22 — erro de busca limpa as sugestões antigas (em `audit-a2-hook-gaps.test.tsx`) | VERMELHO (1 failed) → VERDE (42/42 verdes sem mutação) |
| H23 | `useAddressAutocomplete.ts:L183` — SUGGEST_BLOCKED deixa de limpar as sugestões | H23 — pausa por teto de custo limpa as sugestões antigas (em `audit-a2-hook-gaps.test.tsx`) | VERMELHO (1 failed) → VERDE (42/42 verdes sem mutação) |
| H24 | `useAddressAutocomplete.ts:L145` — SET_QUERY deixa de limpar o erro ao digitar | H24 — digitar de novo limpa o erro do termo anterior (em `audit-a2-hook-gaps.test.tsx`) | VERMELHO (1 failed) → VERDE (42/42 verdes sem mutação) |
| H26 | `useAddressAutocomplete.ts:L204` — CLEAR deixa de resetar o status | H26 — clear() volta o status para `idle` (em `audit-a2-hook-gaps.test.tsx`) | VERMELHO (1 failed) → VERDE (42/42 verdes sem mutação) |
| H29 | `useAddressAutocomplete.ts:L258` — noteSuggestCall removido (contagem de custo) | H29 — cada /suggest entra na contagem de custo (noteSuggestCall) (em `audit-a2-hook-gaps.test.tsx`) | VERMELHO (1 failed) → VERDE (42/42 verdes sem mutação) |
| H30 | `useAddressAutocomplete.ts:L335` — noteRetrieveCall removido (contagem de custo) | H30 — cada /retrieve entra na contagem de custo (noteRetrieveCall) (em `audit-a2-hook-gaps.test.tsx`) | VERMELHO (1 failed) → VERDE (42/42 verdes sem mutação) |
| H31 | `useAddressAutocomplete.ts:L257` — sessionSource do consumidor ignorado (sempre 'picker') | H31 — `sessionSource` do consumidor chega ao getSearchSession (em `audit-a2-hook-gaps.test.tsx`) | VERMELHO (1 failed) → VERDE (42/42 verdes sem mutação) |
| H32 | `useAddressAutocomplete.ts:L259` — filtro `types` deixa de ser repassado ao /suggest | H32 — o filtro `types` é repassado ao /suggest (em `audit-a2-hook-gaps.test.tsx`) | VERMELHO (1 failed) → VERDE (42/42 verdes sem mutação) |
| H35 | `useAddressAutocomplete.ts:L218` — id da sugestão do /forward sem coordenada (id instável) | H35 — id da sugestão do /forward carrega a coordenada (em `audit-a2-hook-gaps.test.tsx`) | VERMELHO (1 failed) → VERDE (42/42 verdes sem mutação) |
| H36 | `useAddressAutocomplete.ts:L401` — ArrowDown sem clamp no fim da lista | H36 — ArrowDown para no último item (em `audit-a2-hook-gaps.test.tsx`) | VERMELHO (1 failed) → VERDE (42/42 verdes sem mutação) |
| U03 | `SuggestionList.tsx:L119` — causa da falha do /retrieve ignora o id do item | U03 — falha do /retrieve aparece SÓ no item escolhido (em `audit-a2-ui-gaps.test.tsx`) | VERMELHO (1 failed) → VERDE (42/42 verdes sem mutação) |
| U04 | `SuggestionList.tsx:L148` — spinner do /retrieve ignora o id do item | U04 — o spinner do /retrieve aparece SÓ no item que está buscando (em `audit-a2-ui-gaps.test.tsx`) | VERMELHO (1 failed) → VERDE (42/42 verdes sem mutação) |
| U05 | `SuggestionList.tsx:L14` — ícone de POI trocado (MapPin → Route) | U05 — ícone por tipo: POI no pino, rua na rota (em `audit-a2-ui-gaps.test.tsx`) | VERMELHO (1 failed) → VERDE (42/42 verdes sem mutação) |
| U10 | `SuggestionList.tsx:L24` — formatDistanceMeters nunca formata km | U10 — distância em metros e em km (vírgula, uma casa) (em `audit-a2-ui-gaps.test.tsx`) | VERMELHO (2 failed) → VERDE (42/42 verdes sem mutação) |
| U11 | `SuggestionList.tsx:L141` — distância deixa de ser renderizada no item | U11 — a distância do /suggest é renderizada no item (em `audit-a2-ui-gaps.test.tsx`) | VERMELHO (2 failed) → VERDE (42/42 verdes sem mutação) |
| U12 | `searchErrors.ts:L18` — dois causas com o mesmo texto (timeout = network) | U12 — cada causa de falha tem texto PRÓPRIO (nenhuma duplicada) (em `audit-a2-ui-gaps.test.tsx`) | VERMELHO (2 failed) → VERDE (42/42 verdes sem mutação) |
| P02 | `LocationPicker.tsx:L176` — Esc deixa de fechar a lista | P02 (documentado) — Esc fecha o picker inteiro: branch local redundante (mutante equivalente) (em `audit-a2-ui-gaps.test.tsx`) | VERDE — mutante EQUIVALENTE (não é matável; ver nota) → VERDE (42/42 verdes sem mutação) |
| P03 | `LocationPicker.tsx:L93` — sucesso do /retrieve deixa a lista aberta | P03 — escolher uma sugestão fecha a lista (em `audit-a2-ui-gaps.test.tsx`) | VERMELHO (1 failed) → VERDE (42/42 verdes sem mutação) |
| P04 | `LocationPicker.tsx:L110` — handleClose não limpa o autocomplete | P04 — Cancelar/fechar o picker limpa o autocomplete (em `audit-a2-ui-gaps.test.tsx`) | VERMELHO (1 failed) → VERDE (42/42 verdes sem mutação) |
| P07 | `LocationPicker.tsx:L88` — toast de falha sem a causa (texto fixo) | P07 — o toast de falha do /retrieve leva a CAUSA (em `audit-a2-ui-gaps.test.tsx`) | VERMELHO (1 failed) → VERDE (42/42 verdes sem mutação) |
| P09 | `LocationPicker.tsx:L192` — lista renderiza também em `idle` | P09 — com a busca em `idle` a lista não é montada (em `audit-a2-ui-gaps.test.tsx`) | VERMELHO (1 failed) → VERDE (42/42 verdes sem mutação) |
| P10 | `LocationPicker.tsx:L164` — input do combobox vira não controlado | P10 — o input é controlado (o termo do hook manda no valor exibido) (em `audit-a2-ui-gaps.test.tsx`) | VERMELHO (1 failed) → VERDE (42/42 verdes sem mutação) |
| P11 | `LocationPicker.tsx:L72` — clique fora deixa de fechar a lista (pointerdown) | P11 — clique fora (pointerdown) fecha a lista (em `audit-a2-ui-gaps.test.tsx`) | VERMELHO (1 failed) → VERDE (42/42 verdes sem mutação) |
| C04 | `useContactsCRUD.ts:L201` — guarda do longitude removida | C04 — sem a linha completa, `longitude` também não entra no UPDATE (em `audit-a2-crud-gaps.test.tsx`) | VERMELHO (1 failed) → VERDE (42/42 verdes sem mutação) |
| C07 | `useContactsCRUD.ts:L62` — toCoordinate aceita texto não numérico (NaN vai ao banco) | C07 — latitude não numérica vira null (nunca NaN) no cadastro (em `audit-a2-crud-gaps.test.tsx`) | VERMELHO (1 failed) → VERDE (42/42 verdes sem mutação) |
| C11 | `useContactsCRUD.ts:L237` — exclusão por RPC trocada por delete direto | C11 — exclusão passa pela RPC `delete_contact` (em `audit-a2-crud-gaps.test.tsx`) | VERMELHO (1 failed) → VERDE (42/42 verdes sem mutação) |
| C12 | `useContactsCRUD.ts:L241` — guarda de exclusão sem efeito (data null) removida | C12 — RPC sem linha excluída (data null) é FALHA, não sucesso (em `audit-a2-crud-gaps.test.tsx`) | VERMELHO (1 failed) → VERDE (42/42 verdes sem mutação) |
| C13 | `useContactsCRUD.ts:L141` — telefone do cadastro sem limpeza de máscara | C13 — telefone do cadastro é gravado sem máscara (em `audit-a2-crud-gaps.test.tsx`) | VERMELHO (1 failed) → VERDE (42/42 verdes sem mutação) |
| C15 | `useContactsCRUD.ts:L192` — email da edição sem trim/null | C15 — e-mail da edição é gravado com trim (em `audit-a2-crud-gaps.test.tsx`) | VERMELHO (1 failed) → VERDE (42/42 verdes sem mutação) |
| C16 | `useContactsCRUD.ts:L191` — telefone da edição sem limpeza de máscara | C16 — telefone da edição é gravado sem máscara (em `audit-a2-crud-gaps.test.tsx`) | VERMELHO (1 failed) → VERDE (42/42 verdes sem mutação) |
| C17 | `useContactsCRUD.ts:L206` — update deixa de filtrar pelo id do contato | C17 — o UPDATE é filtrado pelo id do contato editado (em `audit-a2-crud-gaps.test.tsx`) | VERMELHO (1 failed) → VERDE (42/42 verdes sem mutação) |

**41 dos 42 sobreviventes foram mortos** pelos testes novos. O único que resiste é **P02**, e o motivo é bom demais para ficar de fora:

- `LocationPicker.tsx:176` tem `if (e.key === 'Escape') setAddressListOpen(false);`. Apagando esse branch, a lista **continua fechando**: o Radix (`Dialog`) fecha o diálogo no Escape **mesmo com o evento `defaultPrevented`** (medido: `defaultPrevented=true` e `onOpenChange` chamado com `false`), e o `handleClose` também faz `setAddressListOpen(false)`. Ou seja: mutante equivalente, código redundante — e o efeito real no app é que **Esc fecha o picker inteiro, não só a lista de sugestões**.
- Consequência para os testes: o teste existente `navegação por teclado delega ao hook e Esc fecha a lista` (`LocationPicker.test.tsx:202`) passa por causa do Radix, não do branch que ele diz testar — **teste vácuo quanto à própria afirmação**. Foi escrito, no lugar dele, um teste que trava o comportamento REAL (`P02 (documentado)`), para que uma mudança nesse ponto não passe despercebida.

## (d) Testes vácuos / que provam só mocks

Casos com o motivo (todos verificados com mutação real quando aplicável):

1. **`LocationPicker.test.tsx:202` — "Esc fecha a lista"**: a asserção `aria-expanded=false` é satisfeita pelo fechamento do `Dialog` do Radix (que dispara `handleClose` → `setAddressListOpen(false)`), não pelo branch do componente. Prova: mutação `P02` (branch morto) → **verde**. O teste existe, o comportamento que ele nomeia não é o que ele observa.
2. **`LocationPicker.test.tsx` — "navegação por teclado delega ao hook"**: `expect(ac.onKeyDown).toHaveBeenCalled()` e `expect(ac.select).toHaveBeenCalledWith(0)` provam apenas que o mock foi chamado (delegação), não o efeito. Mutação `U04`/`P09`/`P10`/`P11` (spinner, idle, input controlado, clique fora) ficam **verdes** mesmo com o comportamento removido.
3. **Todo o `describe('autocomplete de endereço')` de `LocationPicker.test.tsx` mocka o hook inteiro** (`useAddressAutocomplete`). É teste de fiação da UI, não do recurso. O único teste que exercita o hook REAL é `AddressSearchIntegration.test.tsx` (E33): é ele que dá o 4º vermelho do D01 e o 2º do D02 — sem ele, a F2 ficaria sem nenhuma cobertura ponta-a-ponta da cascata /suggest→/forward.
4. **`autocompleteState()` (fixture do `LocationPicker.test.tsx:50-56`) deriva `status` de `suggestions.length`** (`if (merged.suggestions.length > 0) merged.status = 'ok'`) — ou seja, a fixture reimplementa exatamente o anti-padrão que a F3 removeu. Ela torna impossível expressar "`ok` com lista vazia" ou "`empty` com itens", então o contrato do E23 só é provado pelos casos onde status e lista discordam (typing/error/paused).
5. **`mapboxGeocode.test.ts:122` — `.resolves.toEqual({ address: 'Rua B' })`**: `toEqual` ignora chaves `undefined`, então o teste não distingue `{ address }` de `{ name: undefined, address }`. Prova: mutação `G27` → **verde**. (Só é pega por um `hasOwnProperty`, como no teste novo G27.)
6. **`useAddressAutocomplete.test.tsx` mocka `noteSuggestCall`/`noteRetrieveCall` e nunca asserta**: são `mockReset()` em `beforeEach` (linhas 69-70) e nunca verificados. Prova: mutações `H29`/`H30` (remoção das duas chamadas de contagem de custo) → **verdes**. A conta que a sessão faturável usa ficou sem teste no hook.
7. **`useContactsCRUD.test.tsx` — o mock de `supabase` ignora os argumentos do `eq`** (`eq: async () => ({ error })`) e não tem `rpc`. Consequências medidas: mutação `C17` (update sem filtrar pelo id — `eq('id','id-errado')`) → **verde**; e o caminho de exclusão (`handleDeleteContact` → `rpc('delete_contact')`, `useContactsCRUD.ts:237`) **não tem nenhum teste** — `C11`, `C12` verdes. O `delete:` do mock é código morto (o hook não chama mais `.delete()`).
8. **`useContactsCRUD.test.tsx:159-161` / `170-172` — asserção assimétrica**: checa `not.toHaveProperty('address')`, `('city')` e `('latitude')`, mas nunca `('longitude')`. Prova: mutação `C04` (guarda do longitude removida) → **verde**.
9. **`searchErrors.test.ts:13-19` — "toda causa tem texto próprio"** verifica só `trim().length > 0` e `/[.!]$/`. Dois textos **idênticos** passam. Prova: mutação `U12` (`timeout` = `network`) → **verde**; só um `new Set(textos).size === causas.length` pega.
10. **`searchErrors.test.ts:27-32` — "nenhum texto carrega o termo digitado (E39)"** procura `'xbz'`/`'rua '` em strings constantes: passa trivialmente hoje e não detecta vazamento real (o termo nunca é concatenado nos textos). É guarda de estilo, não teste de comportamento.
11. **`useAddressAutocomplete.test.tsx` — 'lista vazia sem erro quando /suggest devolve 0 sugestões' (L252)**: assere `suggestions === []`, `error === null`, `isLoading === false` — os três já eram verdade **antes** da resposta chegar (o hook nasce nesse estado). Quem prova a distinção `typing`→`empty` é o E25 (L452), não este.
12. **`useAddressAutocomplete.test.tsx` — 'Enter sem item destacado não chama select' (L242) e 'não faz nenhuma chamada enquanto enabled=false' (L93)**: provam só ausência de chamada em mock (`retrievePlaceResult`/`suggestPlaces`). Passariam com `onKeyDown` vazio e com o hook desligado por qualquer outro motivo.
13. **`SuggestionList`/`HighlightedText` — nada testa ícone, distância, escopo do erro/spinner por item nem clicar fora**: `U03`, `U04`, `U05`, `U10`, `U11`, `P04`, `P09`, `P10`, `P11` → todos **verdes** com o comportamento removido. `formatDistanceMeters` (formatação km/m) não tem um único teste; `SUGGESTION_ICON` idem.
14. **`mapboxGeocode.test.ts` — cache de `/suggest`**: o teto (`MAX_SUGGEST_CACHE`) e a precisão da chave do reverso (`coordinateKey`, alegação de ~1 m) não têm teste: `G11` e `G26` → verdes.

## (e) Como reproduzir

```bash
export PATH="$HOME/.local/bin:$HOME/.local/opt/node/bin:$HOME/.bun/bin:$PATH"
cd /tmp/mutscratch-a2

# 1) suítes originais, verdes na base (96 testes em 6 arquivos)
cd repo && ./node_modules/.bin/vitest run \
  src/components/inbox/location-picker/__tests__/useAddressAutocomplete.test.tsx \
  src/lib/__tests__/mapboxGeocode.test.ts \
  src/components/inbox/__tests__/LocationPicker.test.tsx \
  src/components/inbox/location-picker/__tests__/searchErrors.test.ts \
  src/components/contacts/__tests__/AddressSearchIntegration.test.tsx \
  src/components/contacts/__tests__/useContactsCRUD.test.tsx

# 2) as 9 mutações declaradas (spec -> harness; o harness faz backup, muta, roda e restaura)
cd /tmp/mutscratch-a2 && python3 specs.py && python3 harness.py spec-declaradas.json
python3 harness.py spec-declaradas-unitaria.json   # D01/D02 só na suíte de unidade

# 3) tabela nova (112 mutações)
for g in geo hook ui picker crud; do python3 harness.py spec-$g.json; done
python3 resumo.py

# 4) sobreviventes x suíte nova (41/42 mortos)
python3 verify_gaps.py && for g in geo hook ui picker crud; do python3 harness.py spec-gaps-$g.json; done

# 5) suítes novas, verdes sem mutação (42 testes)
cd repo && ./node_modules/.bin/vitest run \
  src/lib/__tests__/audit-a2-geo-gaps.test.ts \
  src/components/inbox/location-picker/__tests__/audit-a2-hook-gaps.test.tsx \
  src/components/inbox/__tests__/audit-a2-ui-gaps.test.tsx \
  src/components/contacts/__tests__/audit-a2-crud-gaps.test.tsx

# 6) prova de que nada ficou mutado na cópia do repo (sha256 igual ao sandbox original)
for f in $(cat /tmp/mutscratch-a2/mutated-files.txt); do diff -q repo/$f /home/joaquim_ataides/hermes-workspaces/Zapp_Web_V2/audit-a3-tempo-26092914146227/$f; done
```

Artefatos entregues nesta auditoria (fora do sandbox a2, por causa do guard):

- `/tmp/mutscratch-a2/AUDITORIA-A2-MUTACAO.md` — este relatório
- `/tmp/mutscratch-a2/repo/src/lib/__tests__/audit-a2-geo-gaps.test.ts` (7 testes)
- `/tmp/mutscratch-a2/repo/src/components/inbox/location-picker/__tests__/audit-a2-hook-gaps.test.tsx` (14)
- `/tmp/mutscratch-a2/repo/src/components/inbox/__tests__/audit-a2-ui-gaps.test.tsx` (13)
- `/tmp/mutscratch-a2/repo/src/components/contacts/__tests__/audit-a2-crud-gaps.test.tsx` (8)
- `/tmp/mutscratch-a2/logs/` — comando + saída bruta das 121 mutações

Para levar para o sandbox a2 (quando o guard permitir):

```bash
cp -a /tmp/mutscratch-a2/repo/src/lib/__tests__/audit-a2-geo-gaps.test.ts \
      /tmp/mutscratch-a2/repo/src/components/inbox/location-picker/__tests__/audit-a2-hook-gaps.test.tsx \
      /tmp/mutscratch-a2/repo/src/components/inbox/__tests__/audit-a2-ui-gaps.test.tsx \
      /tmp/mutscratch-a2/repo/src/components/contacts/__tests__/audit-a2-crud-gaps.test.tsx \
      /tmp/mutscratch-a2/AUDITORIA-A2-MUTACAO.md  <COPY_FILES_MANUALMENTE>
```

## (f) Estado final verificado

```
$ cd /tmp/mutscratch-a2/repo && ./node_modules/.bin/vitest run <6 suítes originais> <4 suítes novas>
 Test Files  10 passed (10)
      Tests  138 passed (138)      # 96 originais + 42 novas

$ for f in <7 arquivos mutados>; do sha256sum repo/$f vs sandbox original; done
OK  ... (7/7 idênticos — nenhuma mutação ficou aplicada)
```

Pacote com tudo (relatório, logs crus das 121 mutações, specs, harness e os 4 arquivos de teste novos):
`/tmp/mutscratch-a2/auditoria-a2-artefatos.tgz`
