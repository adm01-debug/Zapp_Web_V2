Especialista: worker (testes) (area-testes-do-produto)

## O que mudou e por quê
- `src/lib/__tests__/retry.politica.test.ts` (novo): cobre a POLÍTICA do `withRetry`/`withNetworkRetry` que os testes já existentes não cobrem — número de tentativas (`maxRetries=3` → 4 tentativas) e esgotamento, teto do backoff (`maxDelayMs`), `onRetry` recebendo a tentativa 1..N, e a CLASSIFICAÇÃO do `withNetworkRetry` (TypeError `Failed to fetch`, `status >= 500`, network/timeout, 4xx NÃO repete, fronteira de palavra `502`×`5024`, erro que não é `Error`, `AbortError`). Chama o módulo real (`../retry`); só a fonte do jitter é mockada.
- `src/lib/__tests__/safeStorage.test.ts` (novo): caminhos de EXCEÇÃO (`getItem`/`setItem`/`removeItem` lançam, cota/modo privado) e round-trip JSON. O Storage do jsdom é um Proxy e `vi.spyOn` não chega ao módulo; por isso os testes de falha trocam o global `localStorage` inteiro (`vi.stubGlobal`) por um que lança.
- `src/lib/__tests__/popupManager.test.ts` (novo): abre/reaproveita/foca popup por contato, listener de `load` (título) com guarda cross-origin, `closePopup` só do alvo, `closeAllPopups`, `isPopupOpen` com popup fechado por fora e com popup bloqueado (`window.open` → null).
- `src/lib/__tests__/webauthnUtils.test.ts` (novo): `base64URLToBuffer`/`bufferToBase64URL` (padding, `-`/`_`), saída sem `+`, `/` e `=`, e round-trip de todos os 256 bytes.
- `src/lib/__tests__/supabaseHelpers.test.ts` (novo): `fromTable` delega a `supabase.from` com o nome recebido e devolve o builder; reexport do cliente. O módulo do cliente é mockado (guarda de rede).
- `src/lib/__tests__/avatar-colors.test.ts` (novo): `getAvatarColor` determinístico e no formato da paleta; `getInitials` (2 iniciais, maiúsculas, 1 nome, espaços extras).
- `src/lib/__tests__/phoneNormalization.test.ts` (removido): testava uma CÓPIA inline de normalização, sem módulo de produção por trás. O dono real é `src/lib/calls/phone.ts`, JÁ coberto por `src/lib/calls/__tests__/phone.test.ts` — o cartão manda trocar, e o teste do código real já existe.
- Dependência: trouxe o commit do cartão pai t_753811b3 (`fix(lib): normalizeMediaUrl robusto e withRetry sem repetir cancelamento`, sha 8ff7f83658) por cherry-pick, como o cartão manda — sem ele o `withRetry` não teria o padrão seguro/aborto que meus testes exercitam. O commit de relato do pai (`.tmp/relato.md`) não foi trazido: é relato, não produto.

## Prova
- vermelho antes (mutação injetada nos 6 módulos e DEPOIS revertida): `npx vitest run src/lib/__tests__/retry.politica.test.ts src/lib/__tests__/safeStorage.test.ts src/lib/__tests__/popupManager.test.ts src/lib/__tests__/webauthnUtils.test.ts src/lib/__tests__/supabaseHelpers.test.ts src/lib/__tests__/avatar-colors.test.ts` → `Test Files 6 failed (6); Tests 13 failed | 90 passed (103)` (saída crua em `.tmp/mutacao-vermelho.txt`)
- verde depois (produção restaurada, `git diff` dos módulos vazio): mesmo comando → `Test Files 6 passed (6); Tests 103 passed (103)`
- suíte da área: `npx vitest run src/lib` → `Test Files 118 passed (118); Tests 1645 passed | 5 expected fail (1650)` (saída crua em `.tmp/lib-verde.txt`; os 5 expected fail são pré-existentes, nenhum meu)
- ESTABILIDADE (3 rodadas seguidas, sem falha nem pulado em nenhuma): mesma lista de 6 arquivos em laço → `Test Files 6 passed (6); Tests 103 passed (103)` na rodada 1/3, 2/3 e 3/3 (saída crua em `.tmp/estabilidade-3x.txt`)

## Pontos do juiz automático
- Ponto 1 — "critério de pronto não demonstrado (`Testes novos verdes e estáveis, rode 3x`)": demonstrado acima — `Test Files 6 passed (6); Tests 103 passed (103)` nas 3 rodadas (`.tmp/estabilidade-3x.txt`).
- Ponto 2 — "arquivo que o cartão não lista em ARQUIVOS QUE PODE TOCAR: `src/lib/retry.ts`, `src/lib/abortError.ts`, `src/utils/normalizeMediaUrl.ts`, `src/utils/__tests__/normalizeMediaUrl.test.ts`": esses 4 NÃO foram escritos por mim. Vêm do commit 8ff7f83658 do cartão pai t_753811b3, trazido por cherry-pick porque o cartão MANDA ("se o que eles fazem não estiver no seu workspace, ache o commit em `.v2-fila/*.json` e traga a FAIXA inteira"). Sem eles o `withRetry` testado seria o antigo. `src/lib/retry.ts` é o próprio módulo do meu título. O `git diff` dos 6 módulos de produção da minha lista contra o pai é VAZIO (só testei); a mutação do "vermelho antes" foi injetada e revertida, não ficou no ramo. O único commit de relato do pai (`.tmp/relato.md`) NÃO foi trazido.

## O que NÃO fiz e por quê
- `src/lib/lazyWithRetry.ts`: o cartão diz que depende do SH3 e manda esperar — não toquei.
- Nenhum módulo de PRODUÇÃO foi alterado: o `git diff` dos 6 módulos está vazio; o único commit de produção no meu ramo é o cherry-pick do pai.
