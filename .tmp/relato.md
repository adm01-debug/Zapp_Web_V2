Especialista: semisenior

Refazer 1 do resultado A/B (t_30ef804f): amarelos viram verde ou saíram do diff + correção de t_e41cd92d (segmentoPico quebrava no empilhamento).

Ponto 1 — amarelos viram verde ou saíram do diff:
- Saíram do diff as 6 linhas `setSelectedCampaignId: vi.fn(),` que a entrega anterior tinha adicionado (cada uma era a única alteração do arquivo): TalkXCampaignActionsCard.test.tsx, TalkXCampaignRunning.checklist.test.tsx, TalkXCampaignRunning.janela-historico.test.tsx, TalkXCampaignRunning.limits.test.tsx, TalkXCampaignRunning.remote-completion.test.tsx e kit/__tests__/talkxStates.matrix.test.tsx voltaram ao estado da base (`git checkout 52b433da9d -- <6 arquivos>`). Prova de que não fazem falta: `git diff --stat 52b433da9d...HEAD` abaixo não lista mais nenhum deles, e os 8 arquivos-alvo passam juntos (8 passed, 79 passed).
- O que restou de fixture em TalkXCampaignRunning.states.test.tsx (linhas 64-79, 86-99) serve exclusivamente aos 5 testes novos do bloco A/B + ponte (linhas 333, 357, 376, 403, 424): cada um falha na base e passa com a correção — prova vermelha abaixo, 9 failed na base contra 16 passed com a correção.
- Os 2 testes negativos que passavam na base por vacuidade viraram transição visível→some (linhas 376 e 403: primeiro o bloco existe com amostra suficiente, depois some com amostra abaixo do mínimo / com ab_enabled false). Nenhuma asserção antiga foi removida ou afrouxada — só títulos e o preâmbulo visível.

Ponto 2 — correção indicada em t_e41cd92d (segmentoPico quebrava no empilhamento):
- Causa: a ponte do ponto 5 (`useEffect` que sincroniza o seletor da tela com o hook) chamava `setSelectedCampaignId(selectedId)` sem default; o mock parcial de TalkXCampaignRunning.segmentoPico.test.tsx (linhas 70-84, sem o setter) quebrava no mount com `TypeError: setSelectedCampaignId is not a function` — reproduzido aqui: 8 failed (8).
- Correção no código, não no teste: default noop na desestruturação em src/components/talkx/TalkXCampaignRunning.tsx (linhas 764-766, com comentário); em produção o hook sempre provê o setter (src/hooks/integrations/useTalkX.ts, linha 633 e seguintes). O segmentoPico não foi tocado e nenhuma asserção foi afrouxada.
- Prova: depois da correção, segmentoPico 8 passed (8).

Prova vermelha→verde dos 9 testes novos (fontes da base restauradas temporariamente, sem stash):
- Na base: `Test Files 2 failed (2)` / `Tests 9 failed | 7 passed (16)` — os 5 de `A/B test results` (barras+vencedor, nome do catálogo, some com amostra baixa, some com ab_enabled false, ponte do seletor) e os 4 de `fetchTalkXAbStats` (count 1500+1000, varredura leve sem template, erro propaga, campanha inexistente).
- Com a correção: `Test Files 2 passed (2)` / `Tests 16 passed (16)`.
- Nota honesta: nos 4 testes do hook, o vermelho na base é `TypeError: fetchTalkXAbStats is not a function` (a função é nova na entrega); os 5 da tela são falhas de asserção puras (`findByText('Teste A/B')` não acha, `setSelectedCampaignId` nunca chamado).

Arquivos do diff (`git diff --name-only 52b433da9d...HEAD`), só os do título:
- .tmp/relato.md
- src/components/talkx/TalkXCampaignRunning.tsx
- src/components/talkx/__tests__/TalkXCampaignRunning.states.test.tsx
- src/hooks/integrations/__tests__/useTalkX.abStats.test.ts
- src/hooks/integrations/useTalkX.ts
- Diff total: 44788 caracteres (teto 90k). Commits após a base: 471ea11ff8 (entrega anterior deste mesmo cartão), 354c03f13e (relato da retomada) e 1a453ac9f9 (este refazer: ponte defensiva + saída dos 6 amarelos + 2 transições; este relato vai em commit docs separado).

Comandos e resultados reais:
- `bun run test src/components/talkx/__tests__/TalkXCampaignRunning.segmentoPico.test.tsx` antes: `Test Files 1 failed (1)`, `Tests 8 failed (8)`; depois: `Test Files 1 passed (1)`, `Tests 8 passed (8)`.
- `bun run test <6 restaurados + states + abStats>`: `Test Files 8 passed (8)`, `Tests 79 passed (79)`.
- `bun run test src/components/talkx src/hooks/integrations`: `Test Files 153 passed (153)`, `Tests 1368 passed | 5 expected fail (1373)`.
- Lint ratchet no commit: baseline=0, atual=0, novas=0.
- `zapp-verify --rapido`: BLOQUEADO pelo mesmo CONGELADO (`cópia não encontrada` — o registro da cópia é feito pelo iniciar). Equivalente rodado à mão: `bun run typecheck` limpo, `eslint` nos 4 arquivos-fonte do diff limpo, suíte talkx+hooks 153/1368 verde acima.
- Varredura do diff por referência de produção: nenhum acerto (SCAN-OK).

Bloqueio da fábrica (não contornado): `hermes-tarefa-iniciar`/`hermes-tarefa-fechar` recusam com CONGELADO (sem MODO_V2, manutenção desde 14/10). O trabalho está commitado localmente no branch v2/talkx-tela-resultado-ab-retomar-26101314074c18 (1a453ac9f9), sem push, deploy ou banco de produção; o fechamento oficial fica para o Claude/Joaquim.
