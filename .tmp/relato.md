Especialista: senior (area-testes-do-produto)

ENTREGA (o que mudou, comando, resultado — sem ressalva): mudou só o relato
(.tmp/relato.md); o código do cartão já está absorvido na branch do dia
(9f9a808792 é ancestral do HEAD). Comando: bunx vitest run
src/components/inbox/__tests__/ChatPanel.ligar.test.tsx
src/components/inbox/contact-details/__tests__/click-to-call-origens.test.ts.
Resultado: Test Files 2 passed (2), Tests 15 passed (15).

Refazer 2 — SÓ O RELATO (o cartão manda não tocar em código). Respondo aos 4
pontos da recusa na mesma ordem e numeração: ponto → o que mudei (arquivo) →
teste que prova (nome do teste, saída vermelha antes e verde depois).

Ponto 1 — Sem diff de código: o código 9f9a808792 já está absorvido na do dia.
O que mudei: NADA em código (só este relato), porque não há rebase a fazer —
fazer rebase de commit já absorvido seria duplicá-lo. Provas (comandos rodados
agora): (a) git merge-base --is-ancestor 9f9a808792 HEAD → exit 0
(ABSORVIDO-9f9a-em-HEAD); (b) git diff --stat 62e9b8167cb1 9f9a808792 --
"src/components/inbox/__tests__/ChatPanel.ligar.test.tsx"
src/components/inbox/chat/ChatPanelHeader.tsx → saída vazia (exit 0): os 2
arquivos do "Ligar" são idênticos entre a ponta antiga e o rebase;
(c) git diff --stat e6dfa37bf1 9f9a808792 -- os 4 arquivos do cartão → só
src/components/inbox/ChatPanel.tsx com 14 insertions/4 deletions, que é o hunk
da RPC transfer_conversation de OUTRO cartão (entrou na do dia entre as bases);
os outros 3 arquivos, zero linha. Logo 9f9a ≡ e6 neste cartão.
Teste que prova: a suite focal verde abaixo (15 passed); não há código novo
neste diff para testar além do já absorvido.

Ponto 2 — Cabeçalho provado pelo botão REAL, não por mock.
O que o código (absorvido) faz — arquivo:
src/components/inbox/__tests__/ChatPanel.ligar.test.tsx (106 linhas):
renderiza o componente REAL ContactActionButtons (o botão de ligar de verdade
do inbox) e escuta o evento REAL zapp:start-call em document — o mesmo que
src/providers/CallSessionProvider.tsx:424 assina e
src/lib/calls/events.ts:53 (START_CALL_EVENT) define. Os únicos vi.mock do
arquivo são de infra alheia (sonner, useCRMIntegrationEnabled, useSyncToCRM,
useFeatureFlag, useNavigationHistory, tooltip, RealtimeCollaboration); o
componente sob teste e o barramento são os reais. O teste "Ligar via Telefone"
emite zapp:start-call real com phone, nome, avatar e source inbox falha se o
botão de ligar sumir.
Teste que prova (vermelho antes, verde depois, código real chamado):
VERMELHO — neutralizei temporariamente 1 linha real em
src/components/inbox/contact-details/ContactActionButtons.tsx:163
(dispatchStartCall voip → void 0), sem commitar: Test Files 1 failed (1),
Tests 1 failed | 2 passed (3) — falha exatamente no "Ligar via Telefone", na
linha do toEqual({ channel: 'voip', ... }). Restaurei em seguida (git status
limpo). VERDE — código intacto: Test Files 2 passed (2), Tests 15 passed (15).

Ponto 3 — Prop morta removida COM prova de chamadores (rg).
O que o código (absorvido) faz — arquivos:
src/components/inbox/chat/ChatPanelHeader.tsx (remove onStartCall da
interface), src/components/inbox/ChatPanel.tsx (remove o import
dispatchStartCall e a prop onStartCall passada ao <ChatPanelHeader),
src/components/inbox/contact-details/__tests__/click-to-call-origens.test.ts
(remove o ChatPanel dos EMISSORES e a asserção do avatar dele).
Prova de chamadores, rodada agora: rg -n "onStartCall"
src/components/inbox/chat/ChatPanelHeader.tsx → zero ocorrências (exit 1);
rg -ln "ChatPanelHeader" src/ (fora de testes) → só chat/index.ts,
ChatPanel.tsx e o próprio arquivo: o único renderizador é o ChatPanel, que não
passa mais a prop. Os onStartCall restantes em src/components/inbox/ são só em
contact-details/ (prop própria do ContactActionButtons, que despacha o evento
real, e ContactHeaderSection.tsx:260 passando onStartCall={() => {}} a ele —
pré-existente, fora deste cartão).
Teste que prova (vermelho antes, verde depois): VERMELHO — re-adicionei
temporariamente o ChatPanel aos EMISSORES do origens, sem commitar: Test Files
1 failed (1), Tests 3 failed | 13 passed (16) — 3 falham porque o ChatPanel NÃO
mais emite dispatchStartCall (a remoção é real; atualizar o teste era
obrigatório). Restaurei em seguida. VERDE — os mesmos 15 passed.

Ponto 4 — Saídas coladas, sem número à mão.
Comandos rodados agora, saídas reais: bunx vitest run (2 arquivos) → Test Files
2 passed (2), Tests 15 passed (15), Duration 1.66s. Quebra 1 (voip
neutralizado) → 1 failed (1) / 1 failed | 2 passed (3), Duration 1.98s. Quebra 2
(ChatPanel nos EMISSORES) → 1 failed (1) / 3 failed | 13 passed (16), Duration
1.19s. git status --porcelain após cada quebra → vazio (tudo restaurado).
zapp-verify . --rapido → VERIFY: VERDE SEM BANCO (113s), com db_guard, tipos,
lint e migrations OK (banco_local com o AVISO padrão de conjunto, sem nome —
este cartão não mexe em banco). Nota de caminho (1 linha): o pedido cita o
origens em src/components/inbox/__tests__/, mas o caminho real na árvore
(confirmado por git diff 9f9a^..9f9a --name-only) é
src/components/inbox/contact-details/__tests__/click-to-call-origens.test.ts;
usei o real em todos os comandos.

## Arquivos que conflitaram e resolução
Não houve conflito manual: o rebase 9f9a808792 entrou limpo na branch do dia
(é ancestral do HEAD, prova A1) e o workspace não tem marca de merge nem
arquivo pendente. A resolução correta foi manter o código da ponta atual, que
já contém os 4 hunks do cartão:
- src/components/inbox/ChatPanel.tsx: versão da ponta atual preservada; já sem
a prop onStartCall do Ligar (o diff e6..9f9a aqui é só drift alheio da RPC
transfer_conversation).
- src/components/inbox/__tests__/ChatPanel.ligar.test.tsx: versão da ponta
atual preservada; idêntica entre 62e9b81 e 9f9a80879 (diff vazio, prova A2).
- src/components/inbox/chat/ChatPanelHeader.tsx: versão da ponta atual
preservada; sem onStartCall na interface (rg com zero ocorrências).
- src/components/inbox/contact-details/__tests__/click-to-call-origens.test.ts:
versão da ponta atual preservada, sem o ChatPanel nos EMISSORES.

## Prova executada agora
- git merge-base --is-ancestor 9f9a808792 HEAD → ABSORVIDO-9f9a-em-HEAD (exit 0).
- git diff --stat 62e9b8167cb1 9f9a808792 -- os 2 arquivos do Ligar → saída vazia (exit 0).
- git diff --stat e6dfa37bf1 9f9a808792 -- os 4 arquivos do cartão → só ChatPanel.tsx (14+/4-, drift alheio).
- bunx vitest run (2 arquivos focais) → Test Files 2 passed (2), Tests 15 passed (15).
- Quebras temporárias (restauradas, git status limpo): voip neutralizado → 1 failed | 2 passed (3); ChatPanel nos EMISSORES → 3 failed | 13 passed (16).
- zapp-verify . --rapido → VERIFY: VERDE SEM BANCO (113s); db_guard, tipos, lint, migrations OK.
- Critério válido deste fechamento (transcrição do cartão t_969b20a2): testes
focais + relato ponto a ponto; dispensa de zapp-verify full registrada pelo
coordenador acima (quinta, 20:46–20:48) — não rode. (zapp-verify full não foi
rodado por dispensa do cartão; o --rapido acima foi rodado por iniciativa
própria como evidência extra.)

## Arquivos do diff
Saída de git diff --name-only dia/2026-10-16...HEAD após o commit de relato:

.tmp/relato.md

## Nota de escopo
- Não alterei arquivos fora da lista permitida do cartão (só .tmp/relato.md).
