Especialista: iris
## O que mudou e por quê
- `src/components/inbox/__tests__/RealtimeContactUpdateE2E.test.tsx` (único arquivo do diff): rewrite em janela de falha exclusiva — 1 bloco `act` (target) + 1 `waitFor` (janela) por teste, pré-condições de seed fora da janela; mock de contacts acompanha o contrato paginado do serviço (`select/order/order/limit`, `.or` antes do `.limit` com cursor); teste 1 ganha asserção de preservação do SLA aberto (mata o mutante merge→replace); teste 2 ganha janela para ausência do fantasma + contagem (mata o mutante upsert-fantasma); teste 3 novo cobre `new` nulo (mata o mutante que derruba o `?.` da guarda de id). Sem tocar produção, sem outro arquivo.

## Prova
- vermelho antes (arquivo antigo, sem a correção): `bun x vitest run src/components/inbox/__tests__/RealtimeContactUpdateE2E.test.tsx` → `Test Files 1 failed (1); Tests 2 failed (2)` — `Unable to find an element with the text: João` / `Maria`, body `<div />` (lista vazia: o mock só tinha 1 `.order` e o serviço chama `.order().order().limit()`).
- verde depois (arquivo novo): mesmo comando → `Test Files 1 passed (1); Tests 3 passed (3)`.
- mutantes em `src/hooks/chat/useRealtimeMessages.ts` (prova local, restaura byte a byte, `RESTAURO: idêntico`):
  - M-skip (não atualiza a linha): MORTO — vermelho `... > UPDATE realtime em contacts atualiza nickname/job_title visíveis no DOM da lista, sem remontar a linha` (`Tests 1 failed | 2 passed (3)`).
  - M-replace (merge vira replace, perde o SLA): MORTO — vermelho o mesmo teste 1 (`Tests 1 failed | 2 passed (3)`).
  - M-append (guarda vira upsert e cria linha fantasma): MORTO — vermelho `... > ignora UPDATE de contato fora da lista carregada (sem crash, sem linha fantasma) na árvore completa` (`Tests 1 failed | 2 passed (3)`).
  - M-guard (guarda de id perde o `?.`): MORTO — vermelho `... > ignora UPDATE sem contato (new vazio) sem crash e sem mudar a lista`.
  - M-unwire (desliga `onUpdate` do canal contacts): MORTO — vermelho o teste 1.
  - M-revision (não incrementa `liveRevisionRef` no UPDATE): SOBREVIVENTE declarado (ver abaixo).
  - M-control (troca texto de log que nenhum teste observa): SOBREVIVENTE esperado (`Tests 3 passed (3)` — prova que o corredor distingue).
- higiene: `bun x eslint <o arquivo>` → RC=0, zero achados; `patch -p1 -R --dry-run` do ENTREGA.patch → `PATCH-REVERSE-OK` (o patch reverte limpo = aplica limpo).

## Pontos do revisor
- Ponto 1 (suite mata 0 de N mutantes): resolvido — a causa raiz é que o baseline nem carregava a lista (mock com 1 `.order` contra serviço com `.order().order().limit()`), então nenhum mutante era medido; com o mock no contrato + janelas exclusivas, 5 de 5 mutantes-alvo morrem com o nome do teste no resumo e 1 sobrevivente fica declarado com motivo.

## O que NÃO fiz e por quê
- M-revision (`liveRevisionRef`, race com fetch em voo): matar exige orquestrar um `fetchConversations` em voo durante o UPDATE, o que este E2E não alcança (fetch só dispara em reconnect/envio); cabe a teste dedicado do hook. Não inventei cobertura.
- `zapp-verify`/`hermes-tarefa-fechar`/commit: fábrica congelada (iniciar e fechar recusam com RC=75, `MODO_V2` ausente; `git worktree`/`branch`/`clone` e escrita no workspace de entrega bloqueados pela guarda — não contornei). Entrega = ENTREGA.patch + este RELATO (ver ONDE ESTÁ no comentário do cartão). Sem commit, sem push, sem produção.

## Arquivos (`git diff` equivalente: 1 arquivo)
- `src/components/inbox/__tests__/RealtimeContactUpdateE2E.test.tsx` (único; ENTREGA.patch tem 164 linhas e reverte limpo)
