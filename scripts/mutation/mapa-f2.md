# F2 · Mutações executadas (E21)

Alvo: `src/components/inbox/location-picker/useAddressAutocomplete.ts`,
`src/components/inbox/LocationPicker.tsx`
Suíte executada após cada mutação: `npx vitest run <arquivo>` (comando exato em cada item).
Nenhuma mutação foi revertida sem deixar o arquivo idêntico ao estado entregue (conferido com
`git diff --stat` — 10 arquivos / 472 inserções ao final de todas).

| # | Mutação aplicada | O que ela quebra | Resultado observado |
| --- | --- | --- | --- |
| M1 | `if (!result.ok && FORWARD_FALLBACK_KINDS.has(result.kind))` → `if (false)` | desliga a cascata `/suggest` → `/forward` (C3 volta) | **3 vermelhos**: `E15: /suggest cai por rota (http)…`, `E15: selecionar sugestão do /forward não chama /retrieve…`, `E17: telemetria só quando as DUAS rotas falham…` — `3 failed \| 19 passed` |
| M2 | `dispatch({ type: 'RETRY' })` → `return` dentro de `retrySuggest` | botão "Tentar novamente" volta a ser no-op | **1 vermelho**: `E13: retrySuggest dispara na hora, sem esperar o debounce…` — `1 failed \| 21 passed` |
| M3 | `const place = fallback.ok ? fallback.places[0] : undefined` → `undefined` | desliga o fallback do `/retrieve` (E16) | **1 vermelho**: `E16: /retrieve sem coordenada — repete a busca com o texto da sugestão no /forward` — `1 failed \| 21 passed` |
| M4 | `searchLocation(autocomplete.query)` → `searchLocation()` no `onKeyDown` do combobox | volta o C2 (Enter sem sugestão destacada não busca nada) | **1 vermelho**: `E11/C2: Enter sem sugestão destacada busca o termo digitado no combobox` — `1 failed \| 12 passed` |
| M5 | `reportMapboxFailure` chamado em qualquer falha do `/suggest`, **antes** da tentativa do `/forward` | telemetria vira ruído (reporta mesmo quando o fallback salvou a busca) | **1 vermelho**: `E17: telemetria só quando as DUAS rotas falham na mesma busca` — `1 failed \| 21 passed` |

## Observação honesta sobre a primeira M5

A primeira tentativa de M5 trocou apenas o **kind** reportado (`MAPBOX_FAILURE_KIND[result.kind]` →
`'server_error'`), dentro do mesmo bloco. Ela **não** foi detectada (`22 passed`) porque era
semanticamente equivalente ao código entregue: o teste do E17 afirma "não reportar quando o
`/forward` salva a busca", e a mutação não movia a chamada de lugar. Foi refeita como acima, essa
sim quebrando o invariante do E17 — e aí o teste ficou vermelho como esperado.

## Leitura do resultado

Cada comportamento novo da F2 (cascata, fallback do retrieve, retry real, telemetria só na dupla
falha, Enter com o termo do combobox) tem **pelo menos um teste que fica vermelho quando o
comportamento é removido**. Nenhum teste novo passa por acidente de implementação.
