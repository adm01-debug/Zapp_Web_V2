Especialista: worker (ci) (area-verificacao-ci)

## Resultado
CONCLUÍ o cartão. Identifiquei o nome exato do guarda/teste do noturno que falhou no sha 96dd72dc5 e confirmei que a causa raiz está FORA da área `edge` deste cartão; então, conforme o próprio CRITÉRIO DE PRONTO item 2 ("se a causa estiver fora da área edge, apenas relate e pare"), relatei e parei — sem tocar em nenhum arquivo de `scripts/edge-deploy/**`, `supabase/functions/**` ou no manifesto.

## 1) NOME exato do guarda/teste do noturno que falhou no sha 96dd72dc5 (item 1)
- Guarda do noturno: `~/arquitetura-v2/integrador/noturno.sh` — roda `zapp-verify full` na ponta da branch do dia; NÃO é específico de edge. Registro: `noturno.json` = `estado=vermelho, rc=1, sha=96dd72dc5`; o `resultado.txt` do run `bb4df1254046` mostra que o ÚNICO passo vermelho foi `testes` (`VERIFY: VERMELHO em testes`) — db_guard, tipos, lint e migrations ficaram OK.
- Teste culpado determinístico: `src/components/talkx/__tests__/RuleValueInput.test.tsx > "em breve": Lead score e Risco de churn ficam desabilitados no catálogo` — `TestingLibraryElementError: Unable to find role="button" and name "Novo segmento"` (linha 207).
- Segundo arquivo acusado no MESMO run, por TIMEOUT (não por asserção): `src/components/inbox/tabs/__tests__/FilesTab.period.integration.test.tsx > FilesTab (adversarial) — mais de 60 arquivos > caminho do "De": a varredura que nunca cruza o inicio para no TETO, sem skeleton infinito` — `Error: Test timed out in 15000ms` (linha 314).
- Terceiro item do run: `1 unhandled error` — `TypeError: The "event" argument must be an instance of Event` (undici `WebSocket.dispatchEvent`), originado em `src/components/inbox/__tests__/RealtimeInboxView.selectedMessagesError.test.tsx`.
- Nenhum dos três mora em `scripts/edge-deploy/**` nem em `supabase/functions/**`: não há guarda test vermelho na área `edge` neste sha.

## 2) Causa raiz (item 2) — fora da área `edge`
- Front/Talk X: o teste da linha 194 (número "em breve" – lead_score) abre o construtor de segmentos e não o fecha, deixando `?view=talkx&tab=segments&mode=new` em `window.location.search` (o jsdom compartilha o endereço por todo o arquivo); o teste seguinte monta já com o construtor aberto, o botão "Novo segmento" nunca aparece e o `findByRole` estoura o teto.
- A correção desse defeito JÁ está na branch do dia, fora da minha área, em `9ec2c74b36` — `src/components/talkx/__tests__/RuleValueInput.test.tsx`: `afterEach(() => { window.history.replaceState(null, '', '/'); })` mais `vi.setConfig({ testTimeout: 20000 })` e `ESPERA_MOUNT = { timeout: 15000 }` nos `findBy*`, com as asserções inalteradas.

## 3) Prova (item 3) — comandos rodados agora no workspace, todos verdes
- `npx vitest run src/components/talkx/__tests__/RuleValueInput.test.tsx` → `Test Files 1 passed (1); Tests 5 passed (5)` (rc=0; zero pulados)
- `node scripts/edge-deploy/generate-manifest.mjs --check` → `Edge manifest OK: 81 functions, 161 source files, sha256=0919802d68ee...` (rc=0)
- `node --test scripts/edge-deploy/*.unit.mjs` → `tests 116; pass 116; fail 0`
- `npx vitest run src/components/inbox/tabs/__tests__/FilesTab.period.integration.test.tsx` → `Test Files 1 passed (1); Tests 9 passed` (rodado isolado)
- `git status --short` → só `.tmp/relato.md`; `supabase/deployment-manifest.json` NÃO aparece (manifesto não editado à mão); sem `.skip`/`.only`.

## Diff da correção
- Diff de correção MINHA: nenhum — o item 2 do cartão manda não corrigir fora da área `edge`. `git show --stat HEAD` → só `.tmp/relato.md`.
- Diff da correção que resolveu o vermelho (fora da minha área, já integrada na branch do dia): `git show --stat 9ec2c74b36` → `src/components/talkx/__tests__/RuleValueInput.test.tsx | 33 ++++-----` (26 inserções, 7 remoções), só front/Talk X.
- `supabase/deployment-manifest.json`: não editado à mão; a paridade é conferida pelo script do repo (`generate-manifest.mjs --check`, rc=0).
