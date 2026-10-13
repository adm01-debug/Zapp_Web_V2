Especialista: worker (ci) (area-verificacao-ci)

## O que mudou e por quê
- Nenhum arquivo de produção, de guarda ou de manifesto. A causa raiz do vermelho do noturno está FORA da área permitida deste cartão (`edge`): então, conforme o próprio CRITÉRIO DE PRONTO item 2 ("se a causa estiver fora da área edge, apenas relate e pare"), relatei e parei. O meu workspace não tem alteração de projeto — só este relato.
- O defeito determinístico que derrubou o noturno JÁ foi corrigido na branch do dia, fora da minha área, pelo commit `9ec2c74b36 test(talkx): prova estável da correção (RuleValueInput)` (front/Talk X, cartão 261013095123d7). Não reimplementei nada.

## 1) NOME exato do guarda/teste do noturno que falhou no sha 96dd72dc5
- Guarda do noturno: `~/arquitetura-v2/integrador/noturno.sh` — roda `zapp-verify full` na ponta da branch do dia; NÃO é específico de edge. Registro: `noturno.json` = `estado=vermelho, rc=1, sha=96dd72dc5`; o `resultado.txt` do run `bb4df1254046` mostra que o ÚNICO passo vermelho foi `testes` (db_guard, tipos, lint e migrations ficaram OK) → `VERIFY: VERMELHO em testes`.
- Culpado determinístico: `src/components/talkx/__tests__/RuleValueInput.test.tsx > "em breve": Lead score e Risco de churn ficam desabilitados no catálogo` — `TestingLibraryElementError: Unable to find role="button" and name "Novo segmento"` (linha 207).
- Segundo arquivo acusado, por TIMEOUT (não por asserção): `src/components/inbox/tabs/__tests__/FilesTab.period.integration.test.tsx > FilesTab (adversarial) — mais de 60 arquivos > caminho do "De": a varredura que nunca cruza o inicio para no TETO, sem skeleton infinito` — `Error: Test timed out in 15000ms` (linha 314).
- Terceiro item do mesmo run: `1 unhandled error` — `TypeError: The "event" argument must be an instance of Event` (undici `WebSocket.dispatchEvent`), originado em `src/components/inbox/__tests__/RealtimeInboxView.selectedMessagesError.test.tsx`.
- Nenhum dos três mora em `scripts/edge-deploy/**` nem em `supabase/functions/**`: a área `edge` não tem guarda vermelho neste sha.

## 2) Causa raiz — fora de edge, portanto relatei e parei
- Front/Talk X: o teste da linha 194 (número "em breve" – lead_score) abre o construtor de segmentos e não o fecha, deixando `?view=talkx&tab=segments&mode=new` em `window.location.search` (o jsdom compartilha o endereço por todo o arquivo); o teste seguinte monta já com o construtor aberto, o botão "Novo segmento" nunca aparece e o `findByRole` estoura o teto.
- A correção já está na branch do dia em `9ec2c74b36`, só em arquivo de front (fora da minha área): `afterEach(() => { window.history.replaceState(null, '', '/'); })` (isolamento de rota) mais folga de espera no mount (`vi.setConfig({ testTimeout: 20000 })` + `ESPERA_MOUNT = { timeout: 15000 }`), com as asserções inalteradas.
- Não toquei em `scripts/edge-deploy/**`, `supabase/deployment-manifest.json` nem `supabase/functions/**`; o manifesto não foi editado à mão.

## 3) Prova (comandos rodados agora no workspace)
- Teste culpado, verde agora: `npx vitest run src/components/talkx/__tests__/RuleValueInput.test.tsx` → `Test Files 1 passed (1); Tests 5 passed (5)` (rc=0).
- Segundo arquivo, isolado, verde: `npx vitest run src/components/inbox/tabs/__tests__/FilesTab.period.integration.test.tsx` → `Test Files 1 passed (1); Tests 9 passed | 1 todo (10)` — confirma que ali a falha do noturno é timeout sob carga, não defeito determinístico.
- Guardas da área `edge` (nenhum vermelho): `node scripts/edge-deploy/generate-manifest.mjs --check` → `Edge manifest OK: 81 functions, 161 source files, sha256=0919802d68ee...` (rc=0); `node --test scripts/edge-deploy/*.unit.mjs` → `tests 116 / pass 116 / fail 0`.
- Escopo: `git status --short` do workspace só acusa este relato; sem `.skip`/`.only`; manifesto em paridade.

## O que NÃO fiz e por quê
- Não corrigi o defeito: a causa é front/Talk X, fora de `scripts/edge-deploy/**`, `supabase/deployment-manifest.json` e `supabase/functions/**` (limite do cartão).
- Não rodei o `zapp-verify full`/noturno (passo `testes` de ~1543s) — a prova é a reprodução do teste culpado isolado (verde) somada ao registro do noturno; não afirmo que o noturno já esteja verde.
- Pendências fora da minha área, para o coordenador rotear (não são deste cartão): (a) `FilesTab.period.integration.test.tsx` — timeout de 15s sob a carga da suíte (flaky; isolado passa); (b) `1 unhandled error` de WebSocket (undici) em `RealtimeInboxView.selectedMessagesError.test.tsx`.

Concluí os três itens do critério: identifiquei o nome exato do guarda/teste, confirmei que a causa está fora da área `edge` (relatei e parei, sem diff) e deixei a prova com o teste correspondente passando.
