Especialista: semisenior (iris)

## O que mudou e por quê
- src/components/ui/phone-input.tsx:66-70 — removidos o auto-prefixo 55 e o teto de 13 dígitos do `handleChange`; o `formatPhone` já formata BR só com 55 inicial e passa o resto cru (`+CC resto`). Sem isso, número internacional virava +55 sem aviso.
- src/components/connections/ConnectionsView.tsx:102 — o diálogo guarda o 2º argumento do `onChange` (raw, dígitos); o backend passa a receber dígitos em vez do formatado.
- src/hooks/inbox/useConnectionsManager.ts:165-167 — `handleAddConnection` valida a contagem de dígitos (`<10` barra) com a mensagem da recusa; só o `+55` do pré-preenchimento não passa mais.
- Testes: reescrito `src/components/ui/__tests__/phone-input.test.tsx` (10 testes); atualizado 1 teste em `src/components/connections/__tests__/ConnectionsView.erro-dialogo.test.tsx`; criado `src/hooks/inbox/__tests__/useConnectionsManager.validacao-telefone.test.ts` (4 testes).

## Prova
- P1 vermelho antes: `bunx vitest run src/components/ui/__tests__/phone-input.test.tsx` → `3 failed | 7 passed`, `AssertionError: expected '+55 35 12112-3456' to be '+35 1211234567'`.
- P1 verde depois: mesmo comando → `Test Files 1 passed (1)`, `Tests 10 passed (10)`.
- P2 vermelho antes: `bunx vitest run src/components/connections/__tests__/ConnectionsView.erro-dialogo.test.tsx` → `1 failed | 2 passed`.
- P2 verde depois: mesmo comando → `Test Files 1 passed (1)`, `Tests 3 passed (3)`.
- P3 vermelho antes: `bunx vitest run src/hooks/inbox/__tests__/useConnectionsManager.validacao-telefone.test.ts` → `3 failed | 1 passed` (`createConnection` chamado com `55`; mensagem antiga).
- P3 verde depois: mesmo comando → `Test Files 1 passed (1)`, `Tests 4 passed (4)`.
- Regressão da área: `bunx vitest run src/components/connections src/components/ui/__tests__/phone-input.test.tsx src/hooks/inbox/__tests__/useConnectionsManager.qrIdentity.test.ts src/hooks/inbox/__tests__/useConnectionsManager.setDefault.test.ts src/hooks/inbox/__tests__/useConnectionsManager.tra005.test.ts src/hooks/inbox/__tests__/useConnectionsManager.validacao-telefone.test.ts` → `Test Files 13 passed (13)`, `Tests 56 passed (56)`.
- Tipos: `bunx tsc --noEmit -p tsconfig.app.json` → saída vazia, RC=0.
- Lint nos 6 arquivos: 0 erros; 1 warning pré-existente em ConnectionsView.tsx:19 (import do client Supabase, fora do meu diff).
- Patch: `ENTREGA.patch` (340 linhas, 13463 bytes) aplica com `patch -p1 --dry-run` → `PATCH_OK` nos 6 arquivos.

## Pontos do revisor
- Ponto 1: resolvido — phone-input.tsx:66-70; prova P1 acima (preservados pré-preenchimento do vazio e BR com 55).
- Ponto 2: resolvido — ConnectionsView.tsx:102; prova P2 acima. Conferi o mecanismo: o display deriva do `value` (máscara segue visível); o defeito real era o formatado indo ao backend com o raw ignorado — agora o chamador usa o raw.
- Ponto 3: resolvido — useConnectionsManager.ts:165-167; prova P3 acima (mensagem exata da recusa).

## O que NÃO fiz e por quê
- Não limitei o tamanho máximo de número internacional: a recusa manda passar cru "sem truncar".
- Não mexi em `handleFocus` (pré-preenche +55 só do vazio): a recusa permite esse comportamento.
- Não alterei nenhum outro teste existente além do teste de máscara do diálogo (exigido pelo Ponto 2) e do arquivo do PhoneInput (exigido pelo Ponto 1).

## Arquivos
- src/components/ui/phone-input.tsx
- src/components/connections/ConnectionsView.tsx
- src/hooks/inbox/useConnectionsManager.ts
- src/components/ui/__tests__/phone-input.test.tsx
- src/components/connections/__tests__/ConnectionsView.erro-dialogo.test.tsx
- src/hooks/inbox/__tests__/useConnectionsManager.validacao-telefone.test.ts (novo)

## NÃO CONCLUÍ: falta commitar e fechar (fábrica congelada)
- `hermes-tarefa-iniciar` recusa com RC=75 (`CONGELADO ... MODO_V2` ausente em `~/.local/libexec/hermes-guard/`; sem arquivo ESTOP). `git worktree`/`git branch` também bloqueados pela guarda; não contornei.
- O trabalho pronto está em `~/hermes-workspaces/Zapp_Web_V2/_patch-t_a3934555-phone-refazer1/` (cópia íntegra do workspace `phone-input-mascara-dialogo-conexao-26101217369bd7` no estado da entrega recusada + as 6 mudanças acima) e no `ENTREGA.patch` (aplica com `patch -p1` a partir da raiz do projeto).
- Para aplicar quando descongelar: criar o workspace do cartão, aplicar o patch, rodar a suíte de regressão acima e fechar com o título sugerido `fix(connections): refazer1 mascara telefone sem prefixar 55 e validacao por digitos`.
- Título de fechar sugerido: `fix(connections): refazer1 mascara telefone sem prefixar 55 e validacao por digitos`.
