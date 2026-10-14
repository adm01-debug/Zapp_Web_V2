Especialista: Íris (area-front-componentes)

## O que mudou e por quê

- `src/components/admin/TrainingMode.tsx`:
  - `loadProfile` passa a usar `maybeSingle()` e a tratar os três casos (sem usuário, erro de leitura,
    dado ausente) com aviso na tela em vez de `return` silencioso: sem o id do perfil o treino não grava nada,
    então o atendente precisa ver o motivo.
  - `startScenario` avisa quando o insert da sessão falha e deixa `activeSession` nulo (não finge sessão ativa);
    `sendResponse` deixou de sair em silêncio sem sessão e o botão Enviar fica desabilitado sem sessão —
    texto digitado não se perde no vazio.
  - Nova `encerrarSessao` (botão "Sair"): grava `status: 'abandoned'` em `training_sessions` na mesma linha já
    existente (coluna TEXT sem CHECK — nenhuma migration) e, se o update falhar, avisa na tela em vez de
    deixar a sessão presa em "Em andamento".
  - Lista de sessões anteriores passa a usar o mapa de rótulos `STATUS_SESSAO` (`in_progress`/`completed`/`abandoned`),
    para o estado abandonado não aparecer como "Em andamento".
  - A11y no cenário ativo: botão de envio com `aria-label="Enviar resposta"` e a lista de mensagens como
    `role="log"` + `aria-live="polite"` (era um `div` mudo).
  - Nova aba "Resultados da equipe" (`Tabs`), visível só com `isSupervisor` de `useUserRole` — o hook inclui
    admin, que é exatamente quem a RLS de `training_sessions` já libera ler; a leitura acontece no clique da aba
    (nada de efeito novo). Sem permissão a aba não é renderizada e o painel continua "Meus resultados".
- `src/components/admin/__tests__/TrainingMode.avaliacao.test.tsx`: só o mock — `maybeSingle` no chain (o
  `loadProfile` mudou de método) e `useUserRole` mockado como atendente comum (papel sem aba de equipe). As
  asserções existentes não foram tocadas.
- `src/components/admin/__tests__/TrainingMode.erro-abandono.test.tsx` (novo): prova de comportamento
  renderizando o componente REAL, sem mock do próprio alvo. Cobre erro de perfil, perfil ausente, falha no
  início (botão desabilitado e texto não perdido), erro da lista, "Sair" gravando `abandoned` e o rótulo
  "Abandonada", falha do abandono avisada, `role="log"` + `aria-label` do envio, aba da equipe escondida para
  atendente, lista da equipe para supervisor com estado traduzido e sem "null/100".

## Prova

- vermelho antes (componente em `HEAD`, com o teste novo): `npx vitest run src/components/admin/__tests__/TrainingMode.erro-abandono.test.tsx` → `Tests 9 failed | 1 passed (10)`
- verde depois: `npx vitest run src/components/admin/__tests__/TrainingMode.erro-abandono.test.tsx src/components/admin/__tests__/TrainingMode.avaliacao.test.tsx` → `Test Files 2 passed (2); Tests 15 passed (15)`
- pre-commit (git add + commit): `Lint ratchet (staged, 3 arquivo(s)): baseline=3, atual=3, novas=0 / OK: nenhuma nova divida de lint foi introduzida.`

## O que NÃO fiz e por quê

- Retomar sessão em andamento (a alternativa "ou retomar" do critério): escolhi o abandono, que já garante que a
  sessão não fica presa em "Em andamento"; retomar exigiria reidratar `messages`/passo do cliente, outro cartão.
- Persistir a conclusão/nota: é o cartão PJ-34 (`t_6653415c`, "conclusão da sessão pela RPC"), que depende deste —
  não toquei em `evaluateResponse`/score.
- Consulta "Resultados da equipe" sem LIMIT de propósito: truncar em silêncio esconderia sessões antigas da equipe;
  o volume é de admins/supervisores e a leitura continua limitada pela RLS.
