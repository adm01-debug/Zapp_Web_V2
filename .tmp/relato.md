Especialista: complexo (Devin)

## Refazer / retomada
Ponto 1: a recusa não apontou defeito funcional; apontou conflito da entrega aprovada com a ponta `dia/2026-10-12`. Tentei trazer os commits anteriores `da9c7ef99` e `3c8eb2337` por `git cherry-pick -n`; os conflitos eram contra código equivalente já presente na dia atual (C02 de telefonia + `useOptionalCallSession`), e a resolução gerava só uma remoção de linha em branco. Abortei o cherry-pick para não reintroduzir diff duplicado nem criar commit vazio.

Ponto 2: preservei o que já entrou em `dia/2026-10-12`. Conferi no workspace limpo que a implementação atual já contém os caminhos do pedido original: `dial(phone, { abrirDiscador?: boolean })`, `chamadaSaida` no provider, `OutboundCallDialog` global com `useOptionalCallSession`, `CallDialog` discando com `abrirDiscador:false`, avatar no payload e guarda contra segunda chamada ativa.

Ponto 3: rodei os testes do cartão na ponta atual, sem alterar código. Resultado: `bunx vitest run src/components/calls/__tests__/OutboundCallDialog.test.tsx src/providers/__tests__/CallSessionProvider.test.tsx src/components/inbox/__tests__/ChatPanel.ligar.test.tsx src/components/inbox/contact-details/__tests__/ContactActionButtons.test.tsx src/components/inbox/contact-details/__tests__/click-to-call-origens.test.ts src/components/calls/__tests__/CallDialog.test.tsx` -> `Test Files 6 passed (6); Tests 95 passed (95)`.

Ponto 4: rodei a verificação exigida. Resultado: `zapp-verify full .` -> `VERIFY: VERDE SEM BANCO (963s)`; a própria verificação avisou `banco_local NÃO VERIFICADO: sem nome de conjunto`, mas este cartão não tem banco, Edge Function nem migration.

## Arquivos do diff
Somente `.tmp/relato.md`. Nenhum arquivo de projeto foi alterado.

## O que não fiz
Não commitei mudança vazia de código e não toquei em arquivos fora do escopo. A limitação do pedido original continua registrada no comportamento atual: `channel:'whatsapp'` não ganhou caminho novo de ligação pelo WhatsApp; o cartão mantém o fluxo de telefonia/VOIP existente.
