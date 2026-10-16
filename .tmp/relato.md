Especialista: senior (area-testes-do-produto)

ENTREGA: mudou só o relato (.tmp/relato.md). O código do cartão está absorvido
na branch do dia (9f9a808792 é ancestral do HEAD). Comando: bunx vitest run
src/components/inbox/__tests__/ChatPanel.ligar.test.tsx
src/components/inbox/contact-details/__tests__/click-to-call-origens.test.ts.
Resultado: Test Files 2 passed (2), Tests 15 passed (15).

Refazer 2 — SÓ O RELATO. Os 4 pontos da recusa, na mesma ordem e numeração:
ponto → o que mudei (arquivo) → teste que prova (nome, saída vermelha e verde).

Ponto 1 — Código absorvido na branch do dia; este diff contém só o relato.
Arquivo mudado: .tmp/relato.md (único arquivo do diff). Código inalterado por
definição do cartão. Provas rodadas agora: git merge-base --is-ancestor
9f9a808792 HEAD → exit 0; git diff --stat 62e9b8167cb1 9f9a808792 -- os 2
arquivos do Ligar → saída vazia (exit 0); git diff --stat e6dfa37bf1
9f9a808792 -- os 4 arquivos do cartão → só src/components/inbox/ChatPanel.tsx
(14 insertions, 4 deletions, hunk da RPC transfer_conversation de outro
cartão); os outros 3 arquivos com zero linha. Teste que prova: suite focal
verde abaixo, 15 passed.

Ponto 2 — Botão REAL provado pelo teste, sem mock do componente.
Arquivo: src/components/inbox/__tests__/ChatPanel.ligar.test.tsx (106 linhas).
Renderiza o ContactActionButtons real e escuta o evento real zapp:start-call em
document — o mesmo que src/providers/CallSessionProvider.tsx:424 assina e
src/lib/calls/events.ts:53 define. Mocks existentes cobrem só infra alheia
(sonner, hooks de CRM/feature-flag/navegação, tooltip, RealtimeCollaboration).
Teste que prova: "Ligar via Telefone emite zapp:start-call real com phone,
nome, avatar e source inbox". Vermelho: com a linha real
ContactActionButtons.tsx:163 neutralizada temporariamente (restaurada em
seguida, git status limpo) → Test Files 1 failed (1), Tests 1 failed | 2
passed (3), falha no toEqual({ channel: 'voip', ... }). Verde: código intacto →
Test Files 2 passed (2), Tests 15 passed (15).

Ponto 3 — Prop morta removida com prova de chamadores via rg.
Arquivos: src/components/inbox/chat/ChatPanelHeader.tsx (interface sem
onStartCall), src/components/inbox/ChatPanel.tsx (sem o import
dispatchStartCall e sem a prop no <ChatPanelHeader),
src/components/inbox/contact-details/__tests__/click-to-call-origens.test.ts
(sem o ChatPanel nos EMISSORES e sem a asserção do avatar dele). Prova rodada
agora: rg onStartCall em ChatPanelHeader.tsx → zero ocorrências (exit 1);
único renderizador de ChatPanelHeader é o ChatPanel. Teste que prova:
vermelho com o ChatPanel re-adicionado temporariamente aos EMISSORES
(restaurado em seguida, git status limpo) → Test Files 1 failed (1), Tests 3
failed | 13 passed (16). Verde → os mesmos 15 passed.

Ponto 4 — Saídas reais coladas.
Suite focal: Test Files 2 passed (2), Tests 15 passed (15), Duration 1.66s.
Quebra 1: 1 failed (1) / 1 failed | 2 passed (3), Duration 1.98s. Quebra 2:
1 failed (1) / 3 failed | 13 passed (16), Duration 1.19s. git status após cada
quebra: limpo. zapp-verify . --rapido: VERIFY: VERDE SEM BANCO (113s);
db_guard, tipos, lint, migrations OK. Caminho real do origens:
src/components/inbox/contact-details/__tests__/click-to-call-origens.test.ts.

## Arquivos que conflitaram e resolução
Nenhum conflito manual: 9f9a808792 é ancestral do HEAD e o workspace não tem
marca de merge. Mantida a versão da ponta atual nos 4 arquivos (ChatPanel.tsx
sem a prop do Ligar; ChatPanel.ligar.test.tsx com o teste do botão real,
idêntico entre 62e9b81 e 9f9a80879; ChatPanelHeader.tsx sem onStartCall;
click-to-call-origens.test.ts sem o ChatPanel nos EMISSORES).

## Prova executada agora
- git merge-base --is-ancestor 9f9a808792 HEAD → exit 0.
- git diff --stat 62e9b81 9f9a80879 -- 2 arquivos do Ligar → vazio (exit 0).
- git diff --stat e6..9f9a -- 4 arquivos → só ChatPanel.tsx, 14+/4- (drift alheio).
- vitest focal → Test Files 2 passed (2), Tests 15 passed (15).
- Quebras temporárias restauradas → 1 failed | 2 passed (3); 3 failed | 13 passed (16).
- zapp-verify . --rapido → VERIFY: VERDE SEM BANCO (113s).
- Critério do cartão t_969b20a2: testes focais + relato ponto a ponto; dispensa
de zapp-verify full do coordenador (quinta, 20:46–20:48).

## Arquivos do diff
git diff --name-only dia/2026-10-16...HEAD:

.tmp/relato.md

## Nota de escopo
Só .tmp/relato.md, dentro do permitido.
