Especialista: workertestes

## Pontos da recusa (refazer 1)
- Ponto 1: primeira linha de `.tmp/relato.md` agora é exatamente `Especialista: workertestes` (conferido com `head -n 1 .tmp/relato.md`). A tentativa anterior do semisenior trocou por `Especialista: senior (area-testes-do-produto)` — repetiu o defeito com outro valor; corrigido aqui.
- Ponto 2: linha de resultado no formato do cartão, sem a palavra vetada. Prova abaixo traz `Test Files 6 passed (6); Tests 103 passed (103)`; busca case-insensitive pelo termo vetado em `.tmp/relato.md` retorna vazio. Nenhum código, teste ou produção foi tocado para estes dois pontos — só o relato.

- Nota ao juiz: `git diff --name-only dia/2026-10-16...HEAD` lista `.tmp/relato.md` como primeiro arquivo (13 arquivos no diff, commitado com `git add -f` pois `.tmp` é gitignored); primeira linha e linha de resultado estão no diff — ver `git show HEAD -- .tmp/relato.md`.

FAIXA DO PAI: commit `a7fb842e4d` (`fix(lib): normalizeMediaUrl robusto e withRetry sem repetir cancelamento`) é cherry-pick de `aba5d8925c` do ramo anterior (que por sua vez era a faixa do cartão pai `t_753811b3`, sha `8ff7f83658`) — NÃO é deste cartão; o cartão MANDA trazer ("traga a FAIXA inteira"). Conflito em `src/utils/__tests__/normalizeMediaUrl.test.ts` (base do dia já tem versão evoluída do mesmo teste) resolvido mantendo a versão da base (`git checkout HEAD -- <arquivo>`); produção (`retry.ts`, `abortError.ts`, `normalizeMediaUrl.ts`) e demais testes do pai vieram intactos.

## O que mudou e por quê
- `src/lib/__tests__/retry.politica.test.ts` (novo): cobre a POLÍTICA do `withRetry`/`withNetworkRetry` que os testes já existentes não cobrem — número de tentativas (`maxRetries=3` → 4 tentativas) e esgotamento, teto do backoff (`maxDelayMs`), `onRetry` recebendo a tentativa 1..N, e a CLASSIFICAÇÃO do `withNetworkRetry` (TypeError `Failed to fetch`, `status >= 500`, network/timeout, 4xx NÃO repete, fronteira de palavra `502`×`5024`, erro que não é `Error`, `AbortError`). Chama o módulo real (`../retry`); só a fonte do jitter é mockada.
- `src/lib/__tests__/safeStorage.test.ts` (novo): caminhos de EXCEÇÃO (`getItem`/`setItem`/`removeItem` lançam, cota/modo privado) e round-trip JSON. O Storage do jsdom é um Proxy e `vi.spyOn` não chega ao módulo; por isso os testes de falha trocam o global `localStorage` inteiro (`vi.stubGlobal`) por um que lança.
- `src/lib/__tests__/popupManager.test.ts` (novo): abre/reaproveita/foca popup por contato, listener de `load` (título) com guarda cross-origin, `closePopup` só do alvo, `closeAllPopups`, `isPopupOpen` com popup fechado por fora e com popup bloqueado (`window.open` → null).
- `src/lib/__tests__/webauthnUtils.test.ts` (novo): `base64URLToBuffer`/`bufferToBase64URL` (padding, `-`/`_`), saída sem `+`, `/` e `=`, e round-trip de todos os 256 bytes.
- `src/lib/__tests__/supabaseHelpers.test.ts` (novo): `fromTable` delega a `supabase.from` com o nome recebido e devolve o builder; reexport do cliente. O módulo do cliente é mockado (guarda de rede).
- `src/lib/__tests__/avatar-colors.test.ts` (novo): `getAvatarColor` determinístico e no formato da paleta; `getInitials` (2 iniciais, maiúsculas, 1 nome, espaços extras).
- `src/lib/__tests__/phoneNormalization.test.ts`: a remoção que o cartão manda JÁ está valendo na base do dia (o arquivo não existe em `dia/2026-10-16`); o dono real `src/lib/calls/phone.ts` segue coberto por `src/lib/calls/__tests__/phone.test.ts`.

## Prova
- verde (3 rodadas seguidas, sem falha nem pulado): `npx vitest run src/lib/__tests__/retry.politica.test.ts src/lib/__tests__/safeStorage.test.ts src/lib/__tests__/popupManager.test.ts src/lib/__tests__/webauthnUtils.test.ts src/lib/__tests__/supabaseHelpers.test.ts src/lib/__tests__/avatar-colors.test.ts` → `Test Files 6 passed (6); Tests 103 passed (103)` na rodada 1/3, 2/3 e 3/3.
- vermelho antes (mutação: `src/lib/retry.ts` revertido temporariamente à versão da base `dia/2026-10-16`, sem o padrão seguro/aborto do pai): `npx vitest run src/lib/__tests__/retry.politica.test.ts` → `Test Files 1 failed (1); Tests 2 failed | 13 passed (15)` — o teste falha sem a correção, pela razão certa. Produção restaurada em seguida (`git checkout HEAD -- src/lib/retry.ts`) e worktree confirmado limpo (`git status --short` vazio antes do commit do relato).
- `zapp-verify . --rapido` → `VERIFY: VERDE SEM BANCO (110s)` (`OK db_guard, tipos 107s, lint, migrations`; `AVISO banco_local NÃO VERIFICADO` — o cartão não tem migration, nada a provar no banco).

## Arquivos do diff (`git diff --name-only dia/2026-10-16...HEAD`, colado do comando)
- `.tmp/relato.md`
- `src/lib/__tests__/abortError.test.ts` (faixa do pai)
- `src/lib/__tests__/avatar-colors.test.ts`
- `src/lib/__tests__/popupManager.test.ts`
- `src/lib/__tests__/retry.padrao-seguro.test.ts` (faixa do pai)
- `src/lib/__tests__/retry.politica.test.ts`
- `src/lib/__tests__/retry.random.test.ts` (faixa do pai, +4 linhas)
- `src/lib/__tests__/safeStorage.test.ts`
- `src/lib/__tests__/supabaseHelpers.test.ts`
- `src/lib/__tests__/webauthnUtils.test.ts`
- `src/lib/abortError.ts` (faixa do pai)
- `src/lib/retry.ts` (faixa do pai)
- `src/utils/normalizeMediaUrl.ts` (faixa do pai)
- `src/utils/__tests__/normalizeMediaUrl.test.ts` NÃO está no diff: citado na FAIXA DO PAI só para documentar que o conflito do cherry-pick foi resolvido mantendo a versão da base.

## O que NÃO fiz e por quê
- `src/lib/lazyWithRetry.ts`: o cartão diz que depende do SH3 e manda esperar — não toquei.
- Itens opcionais da recusa (comentário 'exatamente um dos pares da paleta' em `avatar-colors.test.ts`, dois comentários em `webauthnUtils.test.ts`): NÃO tocados — a recusa diz "sem recusa" e manda "não mexer em mais nada".
- Nenhum módulo de PRODUÇÃO deste cartão foi alterado: produção no ramo é só a faixa do pai declarada acima.
