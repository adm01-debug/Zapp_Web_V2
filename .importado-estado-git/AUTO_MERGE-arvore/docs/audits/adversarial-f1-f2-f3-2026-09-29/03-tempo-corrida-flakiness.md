# AUDITORIA A3 — tempo, fuso, concorrência e flakiness (F1 #1173, F2 #1182, F3 #1195)

Auditor: agente A3 (adversarial, pós-merge). Alvo verificado: `origin/main` = `694bf0849c199bb5366e23e2c0cf861a3c386460` (HEAD do sandbox).
Workspace (sandbox, nada fora dele foi tocado): `/home/joaquim_ataides/hermes-workspaces/Zapp_Web_V2/audit-a3-tempo-26092914146227`.
Data/hora do sandbox na coleta: `2026-09-29T17:27:59Z` / `2026-09-29T14:27:59 -03`.
Toolchain: `bun 1.4.0`, `node v24.19.0`, `vitest 4.1.11`, `bun install` = "Checked 623 installs across 708 packages (no changes)".

Artefatos criados NESTE sandbox (não são entrega de produto, são o aparato da auditoria):

| caminho | o que é |
|---|---|
| `src/__a3audit__/hook-tempo.probe.test.tsx` | 15 probes do hook real (debounce, retry, backoff, races, contagem de requests) |
| `src/__a3audit__/contador-consumidor.probe.test.tsx` | 7 probes: contador E27 com relógio real/fake + caminho do consumidor (LocationPicker.tsx:79-95 e :110) com o hook real |
| `audit-a3/postgres-concorrencia.test.sh` | trigger de auditoria da F1 sob UPDATE de 2 colunas, massa e concorrência |
| `/tmp/a3/probe-hook.log`, `/tmp/a3/probe-dois.log` | as saídas brutas dos probes (gravadas em disco porque o reporter do vitest engole stdout quando tudo passa) |

Reexecutar:

```bash
export PATH="$HOME/.local/bin:$HOME/.local/opt/node/bin:$HOME/.bun/bin:$PATH"
./node_modules/.bin/vitest run src/__a3audit__/hook-tempo.probe.test.tsx
./node_modules/.bin/vitest run src/__a3audit__/contador-consumidor.probe.test.tsx
bash scripts/db-audit/retry-disposable-postgres-test.sh bash audit-a3/postgres-concorrencia.test.sh
```

---

## (a) Flakiness — 5 execuções sequenciais + 5 em ordem aleatória

Suítes (as da F2/F3 + a da F1):

```
src/components/inbox/location-picker/__tests__/useAddressAutocomplete.test.tsx
src/components/inbox/__tests__/LocationPicker.test.tsx
src/components/contacts/__tests__/AddressSearchIntegration.test.tsx
src/components/inbox/location-picker/__tests__/searchErrors.test.ts
src/components/contacts/__tests__/useContactsCRUD.test.tsx
```

Comando (5×, medindo o tempo de cada rodada):

```bash
for i in 1 2 3 4 5; do start=$(date +%s.%N); ./node_modules/.bin/vitest run $SUITES > /tmp/a3/run$i.txt 2>&1; \
  echo "RUN $i exit=$? dur=$(echo "$(date +%s.%N) - $start" | bc)s :: $(grep -E '^ *Tests +' /tmp/a3/run$i.txt | tail -1)"; done
```

Saída real:

```
RUN 1 exit=0 dur=8.011944772s ::       Tests  63 passed (63)
RUN 2 exit=0 dur=8.556234313s ::       Tests  63 passed (63)
RUN 3 exit=0 dur=7.944938875s ::       Tests  63 passed (63)
RUN 4 exit=0 dur=13.707776201s ::       Tests  63 passed (63)
RUN 5 exit=0 dur=9.841129586s ::       Tests  63 passed (63)
```

Ordem aleatória (`--sequence.shuffle`, 5 seeds distintos). Nota de honestidade da evidência: as durações desta 1ª rodada foram transcritas da saída do terminal (não foram gravadas em arquivo); só os *resultados* e os *seeds* constam de `/tmp/a3/shuf?.txt`. A 2ª rodada abaixo grava tudo em disco.

```bash
for i in 1 2 3 4 5; do ./node_modules/.bin/vitest run $SUITES --sequence.shuffle > /tmp/a3/shuf$i.txt 2>&1; \
  echo "SHUF $i ... $(grep -oE 'seed[^,)]*' /tmp/a3/shuf$i.txt | head -1) ... $(grep -E '^ *Tests +' /tmp/a3/shuf$i.txt | tail -1)"; done
```

```
SHUF 1 exit=0 dur=9.048012077s :: seed "1790702287044" ::       Tests  63 passed (63)
SHUF 2 exit=0 dur=10.112861092s :: seed "1790702296237" ::       Tests  63 passed (63)
SHUF 3 exit=0 dur=8.635705296s :: seed "1790702306089" ::       Tests  63 passed (63)
SHUF 4 exit=0 dur=10.794218130s :: seed "1790702315095" ::       Tests  63 passed (63)
SHUF 5 exit=0 dur=7.938922306s :: seed "1790702325486" ::       Tests  63 passed (63)
```

**Veredicto (a):** 10/10 rodadas com 63 passed (63) — **zero variação de resultado**, nenhuma flake. Tempo total por rodada: 7,9 s–13,7 s (mediana ≈ 9,0 s; a rodada 4 mais lenta é transform/instalação de cache do vitest, não teste). O maior risco de flake que eu esperava era o teste E27 de componente, que usa `pausedUntil: Date.now() + 45_000` e só casa `\d+ s` (`LocationPicker.test.tsx:307`) — é à prova de relógio; não é time-bomb.

Segunda rodada independente (10 execuções novas, 5 seeds novos, durações gravadas em `/tmp/a3/durations.txt` para não depender do scroll do terminal):

```bash
for i in 1 2 3 4 5; do s=$(date +%s.%N); ./node_modules/.bin/vitest run $SUITES > /tmp/a3/run$i.txt 2>&1; \
  printf 'RUN %s dur=%.3fs %s\n' "$i" "$(echo "$(date +%s.%N) - $s"|bc)" "$(grep -oE 'Tests +[0-9]+ passed \([0-9]+\)' /tmp/a3/run$i.txt)"; done
# idem com --sequence.shuffle
cat /tmp/a3/durations.txt
```

```
RUN 1 exit=0 dur=4.059s Tests  63 passed (63)
RUN 2 exit=0 dur=4.127s Tests  63 passed (63)
RUN 3 exit=0 dur=4.018s Tests  63 passed (63)
RUN 4 exit=0 dur=4.044s Tests  63 passed (63)
RUN 5 exit=0 dur=4.178s Tests  63 passed (63)
SHUF 1 exit=0 dur=4.517s seed "1790702968664" Tests  63 passed (63)
SHUF 2 exit=0 dur=4.431s seed "1790702973081" Tests  63 passed (63)
SHUF 3 exit=0 dur=4.272s seed "1790702977507" Tests  63 passed (63)
SHUF 4 exit=0 dur=4.381s seed "1790702981804" Tests  63 passed (63)
SHUF 5 exit=0 dur=4.259s seed "1790702986148" Tests  63 passed (63)
```

(20/20 no total. A diferença 9 s → 4 s entre as duas rodadas é cache de transform do vitest/esbuild, entre a 1ª e a 2ª execução do mesmo conjunto de arquivos — não é variação do resultado.)

## (b) Fusos — UTC / America/Sao_Paulo / Pacific/Kiritimati

```bash
for tz in UTC America/Sao_Paulo Pacific/Kiritimati; do TZ=$tz ./node_modules/.bin/vitest run $SUITES; done
```

```
TZ=UTC                exit=0 ::       Tests  63 passed (63)
TZ=America/Sao_Paulo  exit=0 ::       Tests  63 passed (63)
TZ=Pacific/Kiritimati exit=0 ::       Tests  63 passed (63)
```

Checagem de que o TZ realmente pegou (senão o teste de fuso seria nulo):

```
TZ=Pacific/Kiritimati node -e "console.log(new Date().toString(), Intl.DateTimeFormat().resolvedOptions().timeZone, new Date().getTimezoneOffset())"
Wed Sep 30 2026 07:19:11 GMT+1400 (Line Islands Time) Pacific/Kiritimati -840
TZ=UTC node -e "console.log(new Date().toString(), new Date().getTimezoneOffset())"
Tue Sep 29 2026 17:19:11 GMT+0000 (Coordinated Universal Time) 0
```

**Veredicto (b):** resultado idêntico nos 3 fusos. Faz sentido estruturalmente: todo timestamp das 3 PRs é epoch-ms (`Date.now()`), e nenhuma data de parede é derivada no código de F1/F2/F3 (ver (e)·A3-09 para a única exceção, que é pré-existente).

## (c) Fronteira do debounce e retry

Probe: `hook-tempo.probe.test.tsx` (relógio falso; `vi.advanceTimersByTime` move `Date.now` junto).

Fronteira 299/300/301 ms — saída real (`/tmp/a3/probe-hook.log`):

```
[A3] debounce 299ms -> suggestPlaces=0
[A3] debounce 299ms +10s -> suggestPlaces=1
[A3] debounce 300ms -> suggestPlaces=1
[A3] debounce 300ms +10s -> suggestPlaces=1
[A3] debounce 301ms -> suggestPlaces=1
[A3] debounce 301ms +10s -> suggestPlaces=1
```

**Veredicto:** comportamento declarado confirmado. 299 ms = 0 request; 300 ms = 1; e depois de +10 s **continua 1** (sem dupla execução do timer). O corte é exatamente `>= 300` ms.

Retry e clique duplo de retry:

```
[A3] retrySuggest 1o clique sem avancar timer -> suggestPlaces=2
[A3] retrySuggest 2o clique imediato -> suggestPlaces=3 (status=loading)
```

**Veredicto:** `retrySuggest()` **dispara sem debounce** (o 2º request sai no mesmo tick, sem `advanceTimersByTime`) — declarado e confirmado. Um 2º `retrySuggest()` no **mesmo tick** sai como 3º request (aborta o anterior e recomeça). Isso **não é alcançável pela UI**: o botão "Tentar novamente" só existe em `status === 'error'` (`SuggestionList.tsx:99-108`) e o 1º clique já leva o estado para `loading`, então o 2º clique de um clique duplo humano cai num botão que não está mais no DOM. Só é alcançável chamando a API do hook duas vezes no mesmo tick.

## (d) Corridas (abort/stale) — veredicto por cenário

| cenário testado | observado | veredicto |
|---|---|---|
| resposta antiga do `/suggest` sobrescreve a nova **depois** de a nova já ter saído | `cancela a consulta anterior` (teste da F2) passa; probe: `suggestions=[B]` mantido quando a 1ª resolve depois | **OK** (declarado) |
| resposta antiga chega **na janela de 300 ms** entre a tecla nova e o disparo do debounce | `stale na janela do debounce: query="rua ab" suggestions=[{"id":"a"…}] status=ok` | **FALHA** → A3-03 |
| consulta abortada (termo apagado < 3 chars com request em voo) vira erro na tela / repovoa | `termo apagado com request em voo -> status=idle isLoading=false error=null` e `resposta da consulta abortada chegou -> suggestions=[] status=idle error=null` | **OK** (não vira erro nem repovoa) |
| `select()` em voo + troca de item (`selectionSeqRef`) | `select duplo mesmo item -> retrieve=2 primeiraDevolveu=null` (a 1ª seleção perde, como declarado) | **OK no hook**, mas **FALHA no consumidor** → A3-01 |
| `retrieveError` apontando para item que não existe mais | `apos nova busca: retrieveError={"id":"a","kind":"network"} suggestions=["b"] (id do erro existe na lista? false)` | **FALHA (baixo impacto)** → A3-06 |
| troca de aba (`enabled=false`) com request em voo → aborta? reducer volta a `idle`? | `abort() chamado? 0 status=loading isLoading=true` e, ao chegar, `suggestions=[…] status=ok` (com o hook desabilitado) | **FALHA** → A3-02 |
| fechar/limpar o picker com `/retrieve` em voo | `clear/close com retrieve em voo -> status=idle query="" escolhido={"address":"Rua A, 1",…}` | **FALHA** → A3-05 |
| abortar por `nextGeoSignal()` deixa `isSearching` preso (spinner eterno) | observação de código em `useLocationPicker.ts:256` (caminho da flag DESLIGADA) | **NÃO VERIFICÁVEL** por teste (ver (f)) |

## (e) Achados

### A3-01 · MÉDIO-ALTO — Enter segurado / clique duplo no item: N−1 toasts de falha **falsos** + N−1 `/retrieve` a mais + N sessões faturadas

Caso mínimo: com a lista aberta e um item destacado, segurar `Enter` por ~100 ms (repetição de tecla ≈ 30/s) ou clicar 2× no item enquanto o `/retrieve` está em voo.

Comando: `./node_modules/.bin/vitest run src/__a3audit__/contador-consumidor.probe.test.tsx` (probe reproduz **literalmente** `handleSelectSuggestion`, LocationPicker.tsx:79-95, sobre o **hook real**).

Saída real:

```
[A3] lista carregada: ["a","b"]
[A3] retrieve=2 getSearchSession=3 (tokens distintos por retrieve?)
[A3] toast chamado 1x: [[{"title":"Não consegui obter a coordenada","description":"generico"}]]
[A3] escolhido aplicado? {"address":"resp1","lat":-23.5,"lng":-46.6}
[A3] Enter x3 -> retrieve=3 getSearchSession=4 noteRetrieve=3 toasts=2 (falsos=2)
[A3] Enter x3 -> escolhido={"address":"resp2","lat":-23.5,"lng":-46.6}
```

Causa: `select()` devolve `null` para uma seleção superada por outra mais nova (`useAddressAutocomplete.ts:340`) e o consumidor trata `null` como "não consegui obter a coordenada" (`LocationPicker.tsx:84-92`), disparando `toast variant: 'destructive'`. Não há como o consumidor distinguir "cancelada por uma seleção mais nova" (E46) de "falhou" (E26). O `<button role="option">` também **não é desabilitado** enquanto `retrievingId === suggestion.id` (`SuggestionList.tsx:121-151` — só mostra o spinner).

Efeitos observados: (1) o operador vê um aviso destrutivo de falha e a localização **é aplicada** logo depois; (2) o número declarado de requests do E22 é violado (3 `/retrieve` para 1 escolha); (3) cada `/retrieve` abre uma **sessão nova** (`getSearchSession` recria quando `retrieved` está setado — `mapboxSession.ts:35-48`), então 3 `/retrieve` = 3 sessões faturáveis (teto do guard: 450/mês, `MONTHLY_SESSION_LIMIT`).

Agravante (A3-06): o texto da causa vem do `retrieveError` capturado no closure do render do clique — pode ser a causa de uma falha **anterior** e de outro item:

```
[A3] apos 1a falha: retrieveError={"id":"a","kind":"network"} toast=1
[A3] 2 cliques depois de falha anterior -> toast: [[{"title":"Não consegui obter a coordenada","description":"causa:network"}]]
[A3] escolhido aplicado? {"address":"Rua A, 1","lat":-23.5,"lng":-46.6}
```

### A3-02 · MÉDIO — troca de aba com request em voo não aborta; o resultado escreve estado com o hook desabilitado e a volta à aba gasta um `/suggest` a mais

Caso mínimo: digitar ≥3 caracteres, esperar o debounce, trocar para "Minha Localização" antes da resposta e voltar.

```
[A3] enabled=false com request em voo -> abort() chamado? 0 status=loading isLoading=true
[A3] resposta chegou com enabled=false -> suggestions=[{"id":"a",…}] status=ok
[A3] aba trocada com a lista de pé -> status=ok suggestions=1 (requests 1->1)
[A3] volta para a aba do mapa -> requests=2 status=ok
```

O cleanup do effect só faz `clearTimeout` (`useAddressAutocomplete.ts:306`); o `abort()` só acontece dentro de `runSuggest` (l.253), no `setQuery` abaixo do piso (l.315), no `clear()` (l.387) ou no unmount (l.310). Trocar de aba **não** é nenhum desses. Resultado: o reducer **não** volta para `idle` (fica `ok` com a lista antiga) e a volta à aba dispara um **segundo** `/suggest` para o mesmo termo (E22: "1 request para sugestão ok" vira 2).

### A3-03 · MÉDIO — resposta da consulta antiga é aceita na janela de 300 ms do debounce

Caso mínimo: `setQuery('rua a')` → 300 ms → request lento em voo; digitar mais (`'rua ab'`); a resposta de `'rua a'` chega 100 ms depois da tecla (antes de o debounce da nova disparar).

```
[A3] stale na janela do debounce: query="rua ab" suggestions=[{"id":"a","name":"Rua A","address":"Rua A, SP","kind":"street"}] status=ok isLoading=false
```

O `abort()` da consulta anterior só acontece quando o **novo** `runSuggest` executa — 300 ms após a tecla —, não no `setQuery`. Nessa janela `status` vira `ok` com a lista do termo **antigo** e o item fica clicável. O teste da F2 ("resposta lenta da 1ª não sobrescreve a 2ª") só cobre o caso em que o novo request já saiu; a janela do debounce não está coberta. Isso **alimenta** A3-01: o item clicado pode ser do termo anterior.

### A3-04 · MÉDIO — a pausa de 429 não termina sozinha: "pausadas por 0 s" para sempre, sem botão, sem auto-retry

Backoff/recuperação:

```
[A3] 429 -> calls=1 status=error pausedUntil=60000ms
[A3] +61s sem acao -> calls=1 status=error error=rate_limited blocked=null
[A3] +61s com tecla -> calls=2 status=ok
[A3] retry durante backoff -> calls=1 status=paused blocked=rate_limited
[A3] retry apos backoff -> calls=2 status=loading blocked=null
[A3] retry apos backoff +300ms -> calls=2 status=ok suggestions=[{"id":"a",…}]
```

Contador (relógio **real**, `SuggestionList` de verdade, pausa de 2 s):

```
[A3] t=0ms   -> "Sugestões pausadas por 2 s — a busca por Enter continua funcionando."
[A3] t=1.1s  -> "Sugestões pausadas por 1 s — a busca por Enter continua funcionando."
[A3] t=2.2s (pausa expirada) -> "Sugestões pausadas por 0 s — a busca por Enter continua funcionando."
[A3] t=4.3s (2.3s depois de expirar) -> "Sugestões pausadas por 0 s — a busca por Enter continua funcionando."
[A3] botao "Tentar novamente" presente? false
[A3] pausedUntil = null (cost_guard/sem timestamp) -> "Sugestões pausadas — aguarde um instante."
[A3] pausedUntil = agora (0 ms) -> "Sugestões pausadas por 0 s — a busca por Enter continua funcionando."
[A3] pausedUntil = agora - 60_000 (expirado ha 1 min) -> "Sugestões pausadas por 0 s — a busca por Enter continua funcionando."
[A3] pausedUntil = agora + 1_000 -> "Sugestões pausadas por 1 s — a busca por Enter continua funcionando."
[A3] pausedUntil = agora + 59_000 -> "Sugestões pausadas por 59 s — a busca por Enter continua funcionando."
[A3] fake t=0 -> "…5 s…" ; fake t=1s -> "…4 s…" ; fake t=6s (expirado) -> "…0 s…"
```

O que **está certo**: não há salto de 1→0, não há negativo (`Math.max(0, …)` em `SuggestionList.tsx:56`), os valores 1 s/59 s saem exatos, e o valor `null` (cost_guard ou sem timestamp) tem texto próprio; o backoff de 429 **é respeitado** (nenhum request dentro da janela) e **expira** — uma tecla depois dos 60 s volta a buscar.

O que **mente/estoura**: depois de expirar, nada religa a busca (não há timer de recuperação) e a tela continua dizendo "pausadas por 0 s" indefinidamente — o mesmo texto de "pausa de 0 ms" e de "expirada há 1 min". Pior: se o operador clicou em "Tentar novamente" durante o backoff, o estado vira `status='paused'` e o botão "Tentar novamente" **some** (só existe em `status='error'`, `SuggestionList.tsx:99-108`) — a única saída passa a ser digitar de novo. Ou seja: pausa ativa → aviso correto; pausa vencida → aviso falso e sem ação disponível.

### A3-05 · MÉDIO — `/retrieve` em voo sobrevive ao fechar/limpar: a seleção "cancelada" é aplicada depois

Caso mínimo: clicar num item e, antes do `/retrieve` responder, apertar "Cancelar" (ou `Esc`).

```
[A3] clear/close com retrieve em voo -> status=idle query="" escolhido={"address":"Rua A, 1","lat":-23.5,"lng":-46.6}
[A3] depois do clear + resolucao: select devolveu={"address":"Rua A, 1",…} status=idle retrievingId=null query=""
```

O reducer volta a `idle` (declarado), mas `clear()` **não** invalida a seleção em voo: ele aborta o `/suggest` e chama `endSearchSession()`, e `selectionSeqRef` não é incrementado, então o `select()` pendente passa pelo guard `seq !== selectionSeqRef.current` (`useAddressAutocomplete.ts:340`) e devolve a coordenada. O consumidor segue o fluxo normal (`LocationPicker.tsx:93-94`: fecha a lista e `chooseSearchResult(place)`), que reescreve `selectedLocation` no `useLocationPicker` **depois** de o `handleClose` ter chamado `reset()` — na próxima abertura do picker existe uma localização pré-selecionada (botão "Enviar Localização" habilitado, marcador no mapa) que o operador cancelou.

### A3-06 · BAIXO — `retrieveError` órfão e causa reaproveitada

`SUGGEST_SUCCESS` (`useAddressAutocomplete.ts:158-168`) não limpa `retrieveError`. Depois de uma falha de `/retrieve` do item `a`, uma nova busca legítima (aqui via mudança de `proximity`) publica a lista `[b]` mantendo o erro apontando para `a`:

```
[A3] apos falha do retrieve: retrieveError={"id":"a","kind":"network"} suggestions=["a"]
[A3] apos nova busca: retrieveError={"id":"a","kind":"network"} suggestions=["b"] (id do erro existe na lista? false)
```

Impacto na renderização é nulo (`SuggestionList.tsx:119` casa por `id`), mas o toast do consumidor pode exibir a causa antiga (evidência em A3-01).

### A3-07 · BAIXO — qualquer mudança de identidade de `proximity` dispara um `/suggest` a mais

```
[A3] proximity identity: apos1=1 apos2(novo obj igual)=2 apos3(outro centro)=3
```

`proximity` está nas deps de `runSuggest` **e** do effect (`useAddressAutocomplete.ts:289` e `:307`). Um objeto novo com **os mesmos** lat/lng já reexecuta a busca. Em produção `proximity` é `mapCenter`, que o `useLocationPicker` recria a cada `moveend` (`useLocationPicker.ts:167`, `setMapCenter({ lng, lat })`) — então qualquer `moveend` (pan/zoom/`flyTo` do marcador) com termo ≥3 de 3 caracteres no campo gasta um request a mais. É exatamente o risco que o comentário do `DEFAULT_PROXIMITY` (`useLocationPicker.ts:24-27`) tentou cobrir — o literal é estável, mas `mapCenter` não é. Billing não muda (é por sessão), mas consome o teto de 50 `/suggest`/sessão e o teto mensal.

### A3-08 · BAIXO (pré-existente, **não** da F1) — `generateProtocol` usa data **local**, não epoch

`src/components/contacts/useContactsCRUD.ts:123-124` (arquivo tocado pela F1, mas a função vem de `41f66910`/#1172 — `git diff a4d85736^ a4d85736` não contém essas linhas):

```
UTC                2026-09-30T23:30:00Z -> CT-20260930-ABC123
America/Sao_Paulo  2026-09-30T23:30:00Z -> CT-20260930-ABC123
Pacific/Kiritimati 2026-09-30T23:30:00Z -> CT-20261001-ABC123
America/Sao_Paulo  2026-10-01T02:00:00Z -> CT-20260930-ABC123
Pacific/Kiritimati 2026-10-01T02:00:00Z -> CT-20261001-ABC123
```

O código do protocolo (data) depende do fuso do navegador de quem opera. Impacto é cosmético: o valor só aparece no diálogo de sucesso (`useContactsCRUD.ts:170`) e não é persistido (o `insert` das l.135-153 não grava protocolo). Zero PII. Fica registrado como "mentira de relógio" de baixo impacto e herança, não regressão das PRs auditadas.

### Verificado e **limpo** (hipóteses derrubadas)

- **Contagem E22** por cenário (probe):
  `cenario ok: suggest=1 retrieve=0 forward=0` · `cenario suggest->forward + clique: suggest=1 forward=1 retrieve=0 endSession=1` · `cenario clique em item do /suggest: suggest=1 retrieve=1` → exatamente o declarado (1; 2 na cascata; 0 no item vindo do `/forward`). Só os caminhos de A3-01/A3-02/A3-07 gastam a mais.
- **Abort** nunca vira erro na tela nem repovoa a lista (saída em (d)).
- **RPC do teto mensal é ancorada em BRT, não UTC** (leitura read-only do banco canônico):
  ```sql
  WHERE action = 'searchbox_session'
    AND created_at >= date_trunc('month', now() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo';
  ```
  `sessoes_do_mes = 10`, `inicio_mes_brt = 2026-09-01T00:00:00`, `agora_brt = 2026-09-29T14:28:22`. Nenhum viés de fuso no corte do mês (o único resto dessa família é o cache de 5 min do `isSearchBudgetOk`, que no máximo mantém o estado anterior por 5 min após a virada — auto-corrige).
- **Nenhuma data absoluta nos testes das 3 PRs**; o único `Date.now()` em teste é relativo (`+45_000`).

### Postgres descartável (F1/E06) — UPDATE concorrente, massa e 2 colunas

Comando: `bash scripts/db-audit/retry-disposable-postgres-test.sh bash audit-a3/postgres-concorrencia.test.sh` (imagem `postgres:17-alpine`, `--network none`, a partir do HEAD `694bf084`).

Saída real:

```
fixture: 3 contatos, auditoria=0
[1] UPDATE de 2 colunas de endereco em 1 linha -> linhas de auditoria = 1
[1] detalhes = {"cleared": false, "contact_id": "2a8025f9-5a6f-43f5-bded-007a863f99c4"}
[2] UPDATE em massa de 3 linhas/2 colunas -> delta = 3 (esperado 3: 1 por linha)
[3] UPDATE com o MESMO valor de address -> delta = 0 (esperado 0)
[3] UPDATE de coluna fora da lista (notes) -> delta = 0 (esperado 0)
[4] 2 UPDATE concorrentes na MESMA linha (o 2o espera o lock) -> delta = 2 (esperado 2: um por transacao que commitou)
[4] eventos da linha: 3
[5] 6 UPDATE concorrentes em 3 linhas -> delta = 6 (esperado 6: nenhum evento perdido nem duplicado)
[5] total de eventos = 12 | linhas de contato = 3
[6] eventos com contact_id nulo = 0
[6] eventos com endereco em texto claro = 0
[6] cleared=true = 0
OK-A3-POSTGRES
```

**Esperado × observado:** o trigger é `AFTER UPDATE OF <8 colunas> … FOR EACH ROW` — dispara **uma vez por linha alterada**, não uma por coluna; logo um UPDATE que muda 2 colunas de endereço gera **1** linha de auditoria (observado 1 ✔). Massa de 3 linhas gera 3 (1/linha ✔). O guard `IS DISTINCT FROM` impede evento quando o valor não muda ou quando só colunas fora da lista mudam (0 ✔). Sob concorrência: 2 sessões na mesma linha (a 2ª espera o row lock) geram 2 eventos, um por transação que commitou ✔; 6 UPDATE simultâneos em 3 linhas geram exatamente 6 ✔ — **nenhum evento perdido, nenhum duplicado**. Sem `contact_id` nulo e sem endereço em texto claro no `details` ✔.

## (f) Não verificável

1. **Rede real da Mapbox** (latência, 429 de verdade, header `Retry-After`, frequência real de fallback `/suggest`→`/forward`): todas as suítes e probes usam mock (`vi.mock` de `mapboxGeocode`/`mapboxSession`/`mapboxCostGuard`). O backoff de 60 s, o contador e a cascata foram exercitados com o hook e o componente reais, mas **sem** nenhum HTTP para `api.mapbox.com`. Nenhum request real foi disparado nesta auditoria.
2. **Integração ponta-a-ponta do A3-01/A3-05 com o `LocationPicker` real montado** (hook real + `useLocationPicker` real + `mapbox-gl` em jsdom): o teste de componente que já existe mocka os dois hooks (`LocationPicker.test.tsx:12-15`). O caminho do consumidor foi reproduzido **literalmente** (cópia de `LocationPicker.tsx:79-95` e do `handleClose` da l.110) sobre o hook real — a fiação `select() → null → toast` está coberta pelo teste de componente existente (`LocationPicker.test.tsx:170-183, 323-344`), mas um teste e2e de navegador (Playwright) não foi executado.
3. **Spinner eterno no caminho da flag DESLIGADA**: `useLocationPicker.ts:254-257` só desliga `isSearching` se `!signal.aborted`, e `nextGeoSignal()` (l.71-76) aborta a consulta anterior — um clique no mapa durante uma busca `/forward` deixa `isSearching=true` sem ninguém para desligar. Observação de leitura de código; **não reproduzida** (exigiria `useLocationPicker` real com `mapbox-gl`/`loadMapbox` em jsdom). Também é caminho legado, fora do escopo das F2/F3.
4. **Banco canônico**: usei o Postgres descartável para o comportamento do trigger. Não verifiquei no banco real se há outros triggers/RLS em `audit_logs`/`contacts` que mudem a contagem (leitura read-only permitida, mas o trigger recém-mergeado não existe lá como artefato de teste).
5. **Relógio fora do sandbox**: skew do runner de CI, `TZ` do container de produção/Vercel, relógio do dispositivo do operador — nada disso é observável daqui.
6. **Sessão/session_token da Mapbox com o módulo real em tempo real** (janela de 120 s de `SESSION_IDLE_MS` e teto de 50 `/suggest` por sessão): exercitado apenas com o hook real e `mapboxSession` mockado; o comportamento do módulo real foi lido (`mapboxSession.ts`), não cronometrado.

## Placar final

- Flakiness: **nenhuma** (10/10 rodadas 63/63, 5 seeds aleatórios).
- Fuso: **nenhum** efeito (3 fusos, resultado idêntico; único uso de data de parede é pré-existente e cosmético).
- Concorrência F1 (Postgres): **sem perda/duplicata**, 1 evento por linha (não por coluna).
- Corridas no hook: 3 falhas reais (A3-02, A3-03, A3-05) + 1 falha de consumidor (A3-01, a de maior impacto visível).
- Contador de pausa: nunca negativo nem pulando; mente ao **estacionar em "0 s"** e a pausa não se encerra sozinha (A3-04).
