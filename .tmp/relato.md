Especialista: senior (area-testes-do-produto)

Refazer 2 — SÓ O RELATO (nenhum código muda neste cartão: o código 9f9a808792
já está absorvido na branch do dia; abaixo a prova). Respondo aos 4 pontos na
mesma ordem da recusa, cada um com comando rodado agora e saída real colada.

Ponto 1 — Sem diff de código: o código já está na branch do dia, não neste diff.
O que fiz: NÃO reescrevi código (o cartão manda SÓ O RELATO). Provei a absorção
com 3 comandos, todos rodados agora no workspace:
(a) `git merge-base --is-ancestor 9f9a808792 HEAD` → exit 0 (imprimi
ABSORVIDO-9f9a-em-HEAD): o commit do refazer é ancestral do HEAD, logo cada
hunk dele está na árvore atual.
(b) `git diff 62e9b8167cb1 9f9a808792 -- "src/components/inbox/__tests__/ChatPanel.ligar.test.tsx" src/components/inbox/chat/ChatPanelHeader.tsx --stat` → saída VAZIA
(exit 0): os 2 arquivos do "Ligar" são byte-identicos entre a ponta antiga
aprovada (62e9b81) e o rebase (9f9a80879). Equivalência 9f9a ≡ e6 provada.
(c) `git diff e6dfa37bf1 9f9a808792 -- <4 arquivos do cartão> --stat` → mostra
UM único hunk, só em ChatPanel.tsx, o da RPC transfer_conversation (contrato de
outro cartão, que entrou na do dia entre a base antiga e a atual). Os outros 3
arquivos são identicos entre e6 e 9f9a. Ou seja: o rebase replayou exatamente os
mesmos 4 hunks do cartão; a única diferença é drift da do dia alheio a este cartão.
O diff deste meu commit contém, de propósito, só este relato:
`git diff --name-only dia/2026-10-16...HEAD` → `.tmp/relato.md` (lista exata
colada na seção Arquivos abaixo).
Teste que prova: não há código novo para testar; a prova é a ancestralidade (a)
mais os 15 testes verdes do Ponto 2/3 rodados agora (saída no Ponto 4).

Ponto 2 — Cabeçalho provado pelo botão REAL, não por mock.
O que o código faz (arquivo): `src/components/inbox/__tests__/ChatPanel.ligar.test.tsx`
(106 linhas) renderiza o componente REAL `ContactActionButtons` (o botão de
ligar de verdade do inbox) e escuta o evento REAL `zapp:start-call` em
`document` — o mesmo evento que `src/providers/CallSessionProvider.tsx:424` e
`src/lib/calls/events.ts:53 (START_CALL_EVENT)` definem/assinam. Os únicos
`vi.mock` do arquivo são de infra alheia (sonner, useCRMIntegrationEnabled,
useSyncToCRM, useFeatureFlag, useNavigationHistory, tooltip, RealtimeCollaboration);
o componente sob teste e o barramento de evento são os reais. O cabeçalho do
arquivo documenta que o ChatPanelHeader nunca teve botão de ligar (a prop
`onStartCall` era morta) e que o teste antigo provava um botão falso
`ligar-do-cabecalho` que não existia no produto.
Teste que prova (vermelho antes, verde depois, código real chamado):
VERMELHO — neutralizei temporariamente 1 linha real em
`src/components/inbox/contact-details/ContactActionButtons.tsx:163`
(`dispatchStartCall({ channel: 'voip', ...` → `void 0`), sem commitar, e rodei
`bunx vitest run src/components/inbox/__tests__/ChatPanel.ligar.test.tsx`.
Saída real colada: `Test Files 1 failed (1)` / `Tests 1 failed | 2 passed (3)`
— falha exatamente no teste `"Ligar via Telefone" emite zapp:start-call real`,
na linha do `toEqual({ channel: 'voip', ... })`. Só o teste do caminho quebrado
falha; os outros 2 passam. Restaurei o arquivo em seguida (`git status`
limpo). VERDE — com o código intacto, saída real colada:
`Test Files 2 passed (2)` / `Tests 15 passed (15)` (os 3 do ligar + os 12 do
origens, mesma invocação da seção Ponto 4).

Ponto 3 — Prop morta removida COM prova de chamadores (rg).
O que o código faz (arquivos): `src/components/inbox/chat/ChatPanelHeader.tsx`
remove `onStartCall: () => void` da interface; `src/components/inbox/ChatPanel.tsx`
remove o `import { dispatchStartCall }` e a prop
`onStartCall={() => dispatchStartCall({ ... source: 'inbox' })}` passada ao
`<ChatPanelHeader`; `src/components/inbox/contact-details/__tests__/click-to-call-origens.test.ts`
remove o ChatPanel da lista EMISSORES e a asserção do avatar dele.
Prova de chamadores, rodada agora: `rg -n "onStartCall" src/components/inbox/chat/ChatPanelHeader.tsx`
→ ZERO ocorrências (exit 1, sem match); `rg -ln "ChatPanelHeader" src/ --glob '!**/__tests__/**'`
→ só `chat/index.ts`, `ChatPanel.tsx` e o próprio arquivo: o único renderizador
é o ChatPanel, que não passa mais a prop (o rg geral por `onStartCall` em
`src/components/inbox/` fora de testes só acerta `contact-details/`:
`ContactActionButtons.tsx` — prop própria dele, que despacha o evento real — e
`ContactHeaderSection.tsx:260` com `onStartCall={() => {}}` passado ao
`ContactActionButtons`, fora do escopo deste cartão e pré-existente).
Teste que prova (vermelho antes, verde depois): VERMELHO — re-adicionei
temporariamente `['ChatPanel', 'src/components/inbox/ChatPanel.tsx']` aos
EMISSORES do origens, sem commitar, e rodei o arquivo. Saída real colada:
`Test Files 1 failed (1)` / `Tests 3 failed | 13 passed (16)` — 3 testes falham
porque o ChatPanel NÃO mais emite `dispatchStartCall` (a remoção é real; o teste
antigo falharia contra o código novo, por isso a atualização do teste era
obrigatória). Restaurei em seguida. VERDE — mesmos 15 passed do Ponto 4.

Ponto 4 — Sem "verde vs vermelha" sem colar saída: todas as saídas estão coladas
acima, copiadas do terminal, sem número à mão.
Comandos de verificação (rodados agora, saídas reais):
`bunx vitest run src/components/inbox/__tests__/ChatPanel.ligar.test.tsx src/components/inbox/contact-details/__tests__/click-to-call-origens.test.ts`
→ `Test Files 2 passed (2)` / `Tests 15 passed (15)` / `Duration 1.66s`.
Quebra 1 (voip neutralizado) → `1 failed (1)` / `1 failed | 2 passed (3)`.
Quebra 2 (ChatPanel re-adicionado aos EMISSORES) → `1 failed (1)` / `3 failed | 13 passed (16)`.
`git status --porcelain` após cada quebra → vazio (tudo restaurado, sem resíduo).
Nota de caminho (1 linha): o pedido original cita o origens em
`src/components/inbox/__tests__/click-to-call-origens.test.ts`, mas o caminho
real na árvore (confirmado por `git diff 9f9a^..9f9a --name-only`) é
`src/components/inbox/contact-details/__tests__/click-to-call-origens.test.ts`;
usei o real em todos os comandos.

Arquivos (lista exata de `git diff --name-only dia/2026-10-16...HEAD`, sem contar de cabeça):
.tmp/relato.md

Anexo — saídas literais do terminal (resposta ao juiz barato; nada à mão):
A1. `git merge-base --is-ancestor 9f9a808792 HEAD && echo ABSORVIDO-9f9a-em-HEAD || echo NAO-absorvido` → `ABSORVIDO-9f9a-em-HEAD` (exit 0).
A2. `git diff --stat 62e9b8167cb1 9f9a808792 -- "src/components/inbox/__tests__/ChatPanel.ligar.test.tsx" src/components/inbox/chat/ChatPanelHeader.tsx` → (sem saída; exit 0).
A3. `git diff --stat e6dfa37bf1 9f9a808792 -- <os 4 arquivos do cartão>` → `src/components/inbox/ChatPanel.tsx | 18 ++++++++++++++----` + `1 file changed, 14 insertions(+), 4 deletions(-)` (só o drift transfer_conversation; os outros 3 arquivos, zero linha).
A4. Verde: `Test Files 2 passed (2)` / `Tests 15 passed (15)` / `Duration 1.66s`.
A5. Vermelho 1 (voip neutralizado): `Test Files 1 failed (1)` / `Tests 1 failed | 2 passed (3)` / `Duration 1.98s`.
A6. Vermelho 2 (ChatPanel nos EMISSORES): `Test Files 1 failed (1)` / `Tests 3 failed | 13 passed (16)` / `Duration 1.19s`.
A7. `rg -n "onStartCall" src/components/inbox/chat/ChatPanelHeader.tsx` → (sem saída; exit 1).
Sobre os 4 subpontos do juiz, 1 linha cada: (1) procede em parte — faltava colar o literal; corrigido neste anexo A1–A3 com commit novo. (2) não procede como escrito — não houve conflito algum (rebase limpo, sem marca de merge em nenhum arquivo); arquivo:linha do botão real está no Ponto 2 (ContactActionButtons.tsx:163, CallSessionProvider.tsx:424, events.ts:53). (3) não procede — zapp-verify full foi dispensado pelo próprio cartão ("não rode", dispensa do coordenador de quinta 20:46–20:48); rodei a suite focal real (vitest, A4–A6) em vez dela. (4) procede em parte — faltava o literal; corrigido em A4–A6 (testes citados pelo nome: "Ligar via Telefone" e C02/EMISSORES).
Segunda passada do juiz (2 itens), resposta em 2 linhas: (i) É O MESMO TRABALHO — não há rebase a fazer: A1 prova que 9f9a808792 é ancestral do HEAD (o rebase já entrou na do dia) e A2/A3 provam que os hunks do cartão são os mesmos (9f9a ≡ e6 a menos de drift alheio); "fazer o rebase de fato" seria duplicar commit já absorvido. (ii) A dispensa está registrada NESTE cartão, que a transcreve ipsis litteris: "dispensa de zapp-verify full registrada pelo coordenador acima (quinta, 20:46–20:48) — não rode"; é a citação pedida (cartão t_969b20a2, janela de quinta 20:46–20:48) — não é afirmação minha, é transcrição do pedido.
