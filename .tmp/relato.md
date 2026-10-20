Especialista: senior (area-edge-api)
## Pontos do revisor ([refazer 1])
- Ponto 1: `.tmp/relato.md` fora do commit — restaurei o arquivo à versão da base (`git checkout HEAD~1 -- .tmp/relato.md`) e fiz `git commit --amend --allow-empty --no-edit`; o commit final `2ed4841e5d` é vazio (`git diff --name-only 96dd72dc5..HEAD` retorna vazio, `git show --stat HEAD` sem arquivos). Este texto vai só no relato do fechar, sem commitar o arquivo.
- Ponto 2: relato bate com o diff final — o diff é vazio de propósito (o produto é o diagnóstico abaixo, não código); nenhuma afirmação de "corrigi/removi" sem arquivo correspondente.
- Ponto 3: achado de processo — o `.tmp/relato.md` já estava rastreado na base (`96dd72dc5:.tmp/relato.md` contém o relato do `tests(email):` de outro cartão), então não o removi nem o deletei neste cartão; só restaurei o conteúdo e o deixei fora do commit.

## O que fiz e por quê
Diagnóstico estático do vermelho do noturno em `dia/2026-10-13 @ 96dd72dc5`, SEM aplicar correção (o cartão proíbe) e SEM editar `supabase/deployment-manifest.json`. Nenhum arquivo de projeto tocado: o commit é `--allow-empty` de propósito, porque o produto é o diagnóstico, não um diff.

## Prova (comandos e saídas reais)
- O noturno roda `zapp-verify full` numa worktree desacoplada no topo do dia (`~/arquitetura-v2/integrador/noturno.sh:16`). Resultado em `~/arquitetura-v2/integrador/noturno.json`: `{"estado":"vermelho","rc":1,"branch":"dia/2026-10-13","sha":"96dd72dc5"}`.
- `resultado.txt` da rodada: `db_guard`/`tipos`/`lint`/`migrations` OK; `FALHOU testes`.
- `.local/state/zapp-verify/bb4df1254046/testes.log` → `Test Files 2 failed | 1313 passed`, `Tests 2 failed | 11900 passed`, `Errors 1 error`. Os 2 vermelhos e o erro NÃO são do edge:
  - `src/components/talkx/__tests__/RuleValueInput.test.tsx` › «"em breve": Lead score e Risco de churn ficam desabilitados no catálogo» → `TestingLibraryElementError: Unable to find role="button" and name "Novo segmento"` (o formulário do segmento já estava aberto → estado do caso vazou entre exemplos do jsdom).
  - `src/components/inbox/tabs/__tests__/FilesTab.period.integration.test.tsx` › «caminho do "De": a varredura que nunca cruza o inicio para no TETO, sem skeleton infinito» → `Error: Test timed out in 15000ms` (a varredura não converge no teto).
  - Unhandled: `TypeError: The "event" argument must be an instance of Event` em `WebSocket.dispatchEvent` (undici), originado em `src/components/inbox/__tests__/RealtimeInboxView.selectedMessagesError.test.tsx`.
- O manifesto do commit NÃO é a causa:
  - `node scripts/edge-deploy/generate-manifest.mjs --check` → `rc=0` (commitado == gerado; 81 funções / 161 source_files).
  - `node --test scripts/edge-deploy/*.unit.mjs` → `tests 116 / pass 116 / fail 0`.
  - O manifesto de `HEAD~1` estava DESATUALIZADO em 3 source_files (bytes+sha256, via python3): `_shared/validation.ts` 19331→19585, `approve-password-reset/index.ts` 4367→9320, `voice-copilot-action/index.ts` 13010→16575. Logo, a regeneração era necessária e está correta.
  - Hipóteses do cartão checadas: o digest cobre tudo menos `manifest_sha256` (`scripts/edge-deploy/manifest-lib.mjs:136`) e o `--check` pega alteração em `source_sha256` de função (teste de tamper num `.tmp/mut.json`: `rc=1`). Sem duplicatas (81/81, 161/161), `verify_jwt` 67/14 inalterado, sha do `supabase/config.toml` confere (`154b26da`), 2 gerações produzem bytes idênticos.
- `zapp-verify . --rapido` (a verificação do fechar) NÃO roda a suíte de testes; o noturno roda `full`. Por isso o vermelho do noturno não reaparece aqui.

## Declaração de área
FORA da área edge. A causa do vermelho do noturno está na camada de telas/testes de frontend (`src/components/talkx/**` e `src/components/inbox/**`), não em `scripts/edge-deploy/**` nem `supabase/functions/**`. A regeneração do manifesto é correta e não precisa de correção.

## Causas candidatas (ordenadas)
1. Os 2 testes de frontend acima falham no topo do dia (prova direta no `testes.log`) — fora do edge.
2. Estado vazando entre exemplos no `RuleValueInput.test.tsx` (jsdom), compatível com o erro "Unable to find Novo segmento".
3. Varredura de `FilesTab` não converge dentro do teto de 15s (timeout).
4. Erro não tratado de WebSocket (undici) no `RealtimeInboxView` elevando o run a `Errors 1 error`.
5. Processo: as correções já existentes (`t_609bc9bd`, `t_e1715bd1`, citadas em `~/arquitetura-v2/propostas/2026-10-13-0330-impasse-base-vermelha-com-correcao-pronta-e-noturno-sem-timer.md`) ficam presas atrás da base vermelha (impasse do `integrar.sh`).

## O que NÃO fiz e por quê
- Não corrigi nada: o cartão é só diagnóstico e a causa está fora da área edge (escalar para telas/mensageria).
- Não editei `supabase/deployment-manifest.json` a mão (proibido pelo cartão) e não mexi no gerador (não há defeito nele).
- Não commitei este relato: o diagnóstico vai só no relato do fechar, não em arquivo versionado (Ponto 1 da recusa).
