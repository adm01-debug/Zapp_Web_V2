Especialista: semisenior (area-front-componentes)

## O que mudou e por quê
- `src/components/inbox/AdvancedMessageMenu.tsx`: o item "Status/Story" do menu de mensagem passa a ser montado só quando `useUserRole().isSupervisor` é verdadeiro (admin ou supervisor, o mesmo par papel que o servidor exige no `send-status`) — agente comum deixava o clique chegar até o servidor, que nega. Não oferecemos botão que o servidor vai negar.
- `src/components/inbox/AdvancedMessageMenu.tsx`: o "Publicar" do diálogo de status agora abre uma confirmação (AlertDialog) com o texto "Isso aparece para todos os seus contatos." e só o confirmar chama `sendStatusMessage` — a publicação vai para toda a base da conexão, então o alcance é avisado antes do envio. Cancelar não publica nada.
- `src/components/inbox/__tests__/AdvancedMessageMenu.status-admin.test.tsx`: teste novo que prova os dois lados (agente sem o item; supervisor com item + confirmação antes do envio; admin também vê).
- Removidos do diff os 4 arquivos de Edge do cartão pai (`supabase/functions/evolution-api/index.ts`, `supabase/functions/evolution-api/index.test.ts`, `supabase/functions/_shared/evolution-control-authz.ts`, `supabase/functions/_shared/__tests__/evolution-control-authz.test.ts`), revertidos ao estado de `dia/2026-10-14` no commit a8ab06b — eram eles que quebravam o espelho N217 (ver Ponto 1).

## Prova
- Ponto 1 vermelho antes: `node --test scripts/ci/edge-coverage-authz.unit.mjs` (com o diff empilhado) → `not ok 8 - N217: docs bate com medição fresca e segunda execução é idêntica` + `AssertionError: docs/audits/edge-functions-authz-coverage.md desatualizado` (docs dizem 137/137, medição fresca difere por causa do helper alterado pelo pai).
- Ponto 1 verde depois: mesmo comando → `ok 8 - N217: docs bate com medição fresca e segunda execução é idêntica`, `# pass 8`, `# fail 0`.
- Pedido original verde: `./node_modules/.bin/vitest run src/components/inbox/__tests__/AdvancedMessageMenu.status-admin.test.tsx` → `Test Files 1 passed (1)`, `Tests 3 passed (3)`.
- Regressão do consumidor: `./node_modules/.bin/vitest run src/components/inbox/chat/__tests__/ChatInputArea.limite-enter.test.tsx` → `Test Files 1 passed (1)`, `Tests 8 passed (8)`.
- `zapp-verify . --rapido` → `VERIFY: VERDE SEM BANCO (19s)` (db_guard, tipos, lint, migrations OK; banco_local AVISO por falta de nome de conjunto, padrão sem conjunto).
- `zapp-verify full .`: db_guard, tipos, lint-ratchet completo e migrations OK; etapa testes com 1347 arquivos / 12006 testes passed, mas exit 1 por 2 `Uncaught Exception` em `src/components/settings/__tests__/SoundCustomizationPanel.test.tsx` (`setTimeout` de preview de som dispara após o teardown → `window is not defined`, sob carga de 13 min de suíte). Arquivo fora do meu diff e verde isolado (10/10); `jev-juiz falha` classifica como `pre_existing` (certeza 0.92) e manda não consertar fora do escopo. Flake registrado abaixo em achado fora do escopo.

## Pontos do revisor ([refazer 1])
- Ponto 1 (quebra o ESPELHO DO CI no empilhamento, node N217): resolvido — a causa era o diff maior que o título: a branch trazia por cherry-pick os commits 8e4b8e3/3717651c do cartão pai, que mudam `evolution-control-authz.ts` e desalinhavam `docs/audits/edge-functions-authz-coverage.md`. Reverti os 4 arquivos ao estado da base do dia (`git checkout dia/2026-10-14 -- <4 arquivos>`, commit a8ab06b). O diff contra a base agora tem só os 2 arquivos deste cartão (+ relato). Teste que prova: N217 acima (vermelho antes, verde depois, código real medido do zero via deno).

## Arquivos (`git diff --name-only dia/2026-10-14...HEAD`)
- .tmp/relato.md
- src/components/inbox/AdvancedMessageMenu.tsx
- src/components/inbox/__tests__/AdvancedMessageMenu.status-admin.test.tsx

## O que NÃO fiz e por quê
- FAIXA DO PAI: o histórico da branch contém os commits 8e4b8e3/3717651c (cadeia do cartão de Edge), mas o diff final NÃO os contém — foram revertidos em a8ab06b. Não regenerei os docs N217 para acompanhar o código do pai porque esse código não é deste cartão (é de outro cartão ainda não integrado); trazer Edge para um cartão de tela seria de novo "diff maior que o título".
- Não toquei em `src/hooks/evolution/useEvolutionMessaging.ts`: o defeito do cartão é só de visibilidade do item e aviso de alcance; nada no hook precisou mudar.
- Não afrouxei nenhuma asserção: N217, o teste do cartão e a regressão passam com as regras atuais.
- Achado fora do escopo (não corrigido): `src/components/settings/SoundCustomizationPanel.tsx:92` — `setTimeout(() => setPlayingSound(null), 500)` sem limpeza dispara após o teardown do teste sob carga e derruba a suíte cheia com `window is not defined` (`src/components/settings/__tests__/SoundCustomizationPanel.test.tsx`, 2 Uncaught Exceptions, 12006 passed). É outro cartão; fica o registro.
