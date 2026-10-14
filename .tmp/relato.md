Especialista: senior (area-front-componentes)

Refazer 1 do cartão "agendar mensagem: sucesso e falha" — os 5 pontos da recusa, na ordem dela.

## Ponto 1 — foco ia ao botão errado na falha
O que mudei (`src/components/inbox/ScheduleMessageDialog.tsx`): o efeito de foco agora mira `tentarRef` (o "Tentar de novo" da faixa, `data-testid="tentar-de-novo"`) em vez de `agendarRef.querySelector('button')` (o Agendar). Removi `agendarRef`.
Teste que prova (`ScheduleMessageDialog.test.tsx`, "falha: foco vai ao \"Tentar de novo\" da faixa"): vermelho sem a correção (foco ficava no Agendar — falha por `data-testid` inexistente/asserção de foco), verde com ela. Cobertura: `bun x vitest run src/components/inbox/__tests__/ScheduleMessageDialog.test.tsx` → 21 passed.

## Ponto 2 — botão Agendar não refletia a falha
O que mudei (`src/components/inbox/ScheduleMessageDialog.tsx`): no `catch`, `setSubmitState('error')` (antes `'idle'`) e `errorLabel="Tentar de novo"` (antes `"Falhou"`). O botão em erro continua clicável (só `loading` desabilita) e o `role="status"` do MorphButton anuncia o estado; clicar nele reenvia o mesmo rascunho.
Teste que prova ("falha: botão Agendar reflete o erro..."): vermelho sem a correção (`data-state` era `idle`, sem `morph-button-label-error`), verde com ela — inclui clique no botão em erro, 2ª chamada ao `onSchedule` e fechamento.

## Ponto 3 — duplo fechamento no sucesso
O que mudei (`src/components/inbox/ChatPanel.tsx`, `handleScheduleMessage`): removida a linha `closeDialog('scheduleDialog')` do caminho de sucesso. O ÚNICO fechador agora é o diálogo (onExitComplete → `finalizarSucesso`); o `closeDialog` restante no arquivo é de outros diálogos (quickReplies, slashCommands), intocado.
Teste que prova ("sucesso: fecha UMA única vez..."): `onOpenChange` chamado exatamente 1x com `false`, só após o selo sair. Regressão do produtor: `ChatPanel.scheduled-media.test.tsx` → 12 passed (o relance de erro continua lá).

## Ponto 4 — fechar/limpar dirigido pela animação, sem `setTimeout`
O que mudei (`src/components/inbox/ScheduleMessageDialog.tsx`): removidos `SUCESSO_MS` e `fecharTimerRef` (grep confirma: nenhum `setTimeout` restante no arquivo). Novo selo de sucesso (`data-testid="selo-sucesso"`, transição `zappTransition.fast` do kit, opacidade só com movimento reduzido): a entrada completa (`onAnimationComplete` + guarda `sucessoVisivelRef`) dispara a saída, e o `onExitComplete` do `AnimatePresence` chama `finalizarSucesso` (fecha + limpa texto/anexo/erro/sucesso + volta a `idle`). Sem temporizador, sem limpeza de desmonte.
Teste que prova: o teste do ponto 3 (selo monta → sai → 1 fechamento). Vermelho sem a correção (5 failed: sem selo, sem `data-state error`, sem foco, sem testids), verde com ela.

## Ponto 5 — cobertura dos outros fluxos do ChatPanel inalterada
Não mudei regra nenhuma do produtor além do ponto 3; `ChatPanel.scheduled-media.test.tsx` passa 12/12 sem alteração, provando que upload/referência/gravação (sucesso e as 3 falhas com relance) continuam iguais.

## Adaptações em testes existentes (exigidas pelo ponto 2, sem afrouxar)
- 2 buscas `getByRole('button', /tentar de novo/i)` → `getByTestId('tentar-de-novo')` (teste do 403 e teste do reenvio): com o botão em erro rotulado "Tentar de novo" há DOIS botões com esse nome; a asserção continua a mesma (faixa visível; reenvio conclui).
- `describe` do dia local: `vi.useFakeTimers()` → `vi.useFakeTimers({ toFake: ['Date'] })`. Motivo medido: o fake padrão congela o `requestAnimationFrame`, o motor do framer-motion trava e o fechamento do sucesso nunca dispara nos describes seguintes (4 failed no arquivo cheio, 0 isolados). Comprovado por sonda: `advanceTimersByTime` dispara rAF fake; sem fingir o rAF, o arquivo inteiro passa. Nenhuma asserção desse describe mudou (só precisam da data fixa).

## Arquivos (`git diff --name-only HEAD`)
- src/components/inbox/ScheduleMessageDialog.tsx
- src/components/inbox/ChatPanel.tsx
- src/components/inbox/__tests__/ScheduleMessageDialog.test.tsx

## Verificação (resultado real)
- `bun x vitest run src/components/inbox/__tests__/ScheduleMessageDialog.test.tsx src/components/inbox/__tests__/ChatPanel.scheduled-media.test.tsx` → Test Files 2 passed (2); Tests 33 passed (33).
- Vermelho sem a correção (só testes novos/adaptados, código no HEAD): Tests 5 failed | 16 passed (21) no arquivo do diálogo.
- `bun x tsc --noEmit -p tsconfig.json` → sem erros nos arquivos tocados (saída vazia no filtro).
- `bun x eslint` nos 3 arquivos → 0 errors (2 warnings pré-existentes no ChatPanel, linhas não tocadas).
- Não toquei banco, Edge, produção, credenciais, `.github/` nem guarda/manifesto/CI. Sem project-ref de produção no diff nem no relato.
