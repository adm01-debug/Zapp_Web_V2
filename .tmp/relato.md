Especialista: senior (area-testes-do-produto)

ENTREGA: mudou só o relato (.tmp/relato.md). O código do cartão está absorvido
na branch do dia (9f9a808792 é ancestral do HEAD). Comando: bunx vitest run
src/components/inbox/__tests__/ChatPanel.ligar.test.tsx
src/components/inbox/contact-details/__tests__/click-to-call-origens.test.ts.
Resultado: Test Files 2 passed (2), Tests 15 passed (15).

Refazer 2 — SÓ O RELATO. Os 4 pontos da recusa, na mesma ordem e numeração:
ponto → o que mudei (arquivo) → teste que prova (nome, saída vermelha e verde).

Ponto 1 — 9f9a80879 é o trabalho aprovado de 62e9b8167cb1 (patch-id idêntico).
Arquivo mudado: .tmp/relato.md (único arquivo do diff). Prova rodada agora, no
formato que o cartão oferece (diff vazio ou explicado, ou patch-id):
(a) patch-id do diff dos 4 arquivos do cartão em e6dfa37bf1 →
8405ca77132571fde7f9c8f9e22708a5a7185a75; o mesmo diff em 9f9a808792 →
8405ca77132571fde7f9c8f9e22708a5a7185a75. Patch-id IDÊNTICO: o patch do cartão
é o mesmo nos dois commits.
(b) comando-exemplo do cartão, colado: git diff --stat 62e9b8167cb1
9f9a808792 -- src/components/inbox/ChatPanel.tsx
"src/components/inbox/__tests__/ChatPanel.ligar.test.tsx" →
src/components/inbox/ChatPanel.tsx | 18 ++++++++++++++----, 1 file changed, 14
insertions(+), 4 deletions(-) (exit 0). Leitura: o teste sai VAZIO (idêntico);
a diferença no ChatPanel.tsx é só o hunk da RPC transfer_conversation, de OUTRO
cartão, que entrou na branch do dia entre as duas bases — diferença explicada,
fora deste cartão. É o mesmo trabalho; não há rebase a fazer (refazê-lo
duplicaria commit absorvido: 9f9a808792 já é ancestral do HEAD, merge-base
exit 0).
Teste que prova: suite focal verde abaixo, 15 passed.

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

Ponto 4 — Coerência mantida e saídas coladas.
Nenhum arquivo de teste alterado neste cartão (o diff contém só .tmp/relato.md,
lista abaixo); o teste focal é citado como prova da ponta absorvida, não como
alteração. Saídas reais: suite focal → Test Files 2 passed (2), Tests 15
passed (15), Duration 1.66s. Quebra 1 → 1 failed (1) / 1 failed | 2 passed (3),
Duration 1.98s. Quebra 2 → 1 failed (1) / 3 failed | 13 passed (16), Duration
1.19s. git status após cada quebra: limpo. Caminho real do origens:
src/components/inbox/contact-details/__tests__/click-to-call-origens.test.ts.
zapp-verify full . (critério de pronto 2): saída colada na seção Prova abaixo
— sem dispensa, rodei o full de verdade.

## Arquivos que conflitaram e resolução
Nenhum conflito manual: 9f9a808792 é ancestral do HEAD e o workspace não tem
marca de merge. Mantida a versão da ponta atual nos 4 arquivos (ChatPanel.tsx
sem a prop do Ligar; ChatPanel.ligar.test.tsx com o teste do botão real,
patch-id idêntico ao aprovado; ChatPanelHeader.tsx sem onStartCall;
click-to-call-origens.test.ts sem o ChatPanel nos EMISSORES).

## Prova executada agora
- patch-id e6 (4 arquivos) → 8405ca77132571fde7f9c8f9e22708a5a7185a75.
- patch-id 9f9a (4 arquivos) → 8405ca77132571fde7f9c8f9e22708a5a7185a75 (idêntico).
- Exemplo do cartão (62e9b81..9f9a, ChatPanel + teste) → só ChatPanel 14+/4- (drift explicado); teste vazio.
- vitest focal → Test Files 2 passed (2), Tests 15 passed (15).
- Quebras temporárias restauradas → 1 failed | 2 passed (3); 3 failed | 13 passed (16).
- FULL: `zapp-verify full .` → VERDE SEM BANCO (1144s): OK db_guard 0s, OK
tipos 8s, OK lint 113s, OK migrations 0s, AVISO banco_local NÃO VERIFICADO sem
nome de conjunto (este cartão não tem migration; nada a nomear), OK testes
1006s (suite completa), OK build 17s. Registros em
~/.local/state/zapp-verify/3b730abbd9d6. Linha final colada: "VERIFY: VERDE SEM
BANCO (1144s)".

## Arquivos do diff
git diff --name-only dia/2026-10-16...HEAD:

.tmp/relato.md

## Nota de escopo
Só .tmp/relato.md, dentro do permitido.
