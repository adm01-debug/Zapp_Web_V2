Especialista: iris

(o cartão traz iris como especialista da área — telas e componentes — e começou por ela. Quem executa aqui é o worker (design) (design-system-zapp) — rota jev: designer. Cumpro a linha que a recusa pede e declaro, sem esconder, quem assinou a execução.)

Rodada 2 de 2: a recusa diz que o CÓDIGO do painel não modal (145–146) está correto, no escopo e com teste próprio, e que SÓ O RELATO precisa ser corrigido. Não reescrevi código: trouxe a faixa da branch `v2/painel-nao-modal-d14-26101117176d89` (commit 5a983858c) para este workspace e tratei os 4 pontos do relato.

## Como resolvi cada ponto da recusa

**Ponto 1 — abrir com `Especialista: iris`.** Feito: a primeira linha do relato é exatamente `Especialista: iris`. A ressalva de identidade vai na segunda linha, para o revisor saber quem executou sem eu me passar por outra pessoa.

**Ponto 2 — citar, por elemento do painel, a linha da tabela da seção 3 e a imagem 03.** Seção 3.3 do plano (tabela nas linhas 91–108; `~/hermes-workspaces/.assets/tarefas/PLANO_TAREFAS_NIVEL_DESIGN_200_ETAPAS_2026-10-11.md`), imagem `Tarefas/03.png`:

- cabeçalho ("Detalhes da tarefa" + ícone calendário): plano linha 96 (etapas 131–132) — `WorkItemSheet.tsx:448-477` (`data-testid="sheet-cabecalho"`, título em :457).
- badges ("Aguardando"/"Alta" no topo): plano linha 97 (etapa 133) — `WorkItemSheet.tsx:458-463` (`sheet-badges`, `StatusPill`/`PriorityPill`).
- Estado/Prioridade (selects com ícone): plano linha 98 (etapa 134) — `WorkItemSheet.tsx:496-544` (`sheet-estado` :500, `sheet-prioridade` :523-526); o "ícone" é o ponto com os tokens das pílulas em `:49-63` (D12), sem cor literal.
- Contato (+ "Abrir conversa ↗"): plano linha 100 (etapa 136) — `WorkItemSheet.tsx:577-614` (`sheet-contato` :584, `sheet-abrir-conversa` :606).
- Planejamento (Prazo "Até quando concluir" e Lembrete "Quando avisar você"): plano linha 101 (etapas 137–138) — `WorkItemSheet.tsx:620-635` monta `sheet/PlanejamentoSection.tsx` (seção em :87, prazo :94-130, lembrete :140-232).
- descrição + "Criada em 9 out. 2026": plano linha 103 (etapa 140) — `WorkItemSheet.tsx:638-673` (`sheet-descricao`, `sheet-criada-em` :669; texto por `formatCriadaEm` de `sheet/planejamento.ts`).
- rodapé (ponto âmbar, Ctrl+Enter, Concluir, Salvar, ⋮): plano linha 104 (etapas 141–142) — `WorkItemSheet.tsx:684-694` monta `sheet/PainelRodape.tsx` (testids `sheet-estado-edicao`/`sheet-dica-ctrl-enter`/`sheet-concluir`/`sheet-salvar`/`sheet-menu`).
- expandir: plano linha 96 (etapas 131–132) — `WorkItemSheet.tsx:465-475` (`sheet-expandir`, `aria-pressed` :468); largura ≈70% em `sheet/painel.ts:39-42` (`w-[70vw]` / `w-[420px]`), memória do navegador em `:19,46,56`.
- não modal (painel sem fundo escurecido, acoplado, Quadro clicável atrás): plano linhas 105–106 (etapas 098/145, D14) — `WorkItemSheet.tsx:112-114` (`naoModal`), `:178` (`modal={!naoModal}`), `:191-200` (`side="right"` no desktop + `data-nao-modal`), e `:210-227` (`onInteractOutside` não fecha no desktop). No celular segue bottom sheet modal (overlay + Esc/X com proteção): `:193,196-200,201-209`.

**Ponto 3 — provar a etapa 147 (`?task=<id>`), em vez de afirmar.**
- grava: `src/components/tasks/TasksModule.tsx:108-115` (`abrirSheet` faz `searchParams.set('task', item.id)` em :113); apaga em `:117-124`.
- lê: `TasksModule.tsx:32` (`idNaUrl` = `URLSearchParams(...).get('task')`) e `:219-221` (`itemDoLink` abre o painel pelo item da URL).
- a notificação usa o MESMO campo: `src/hooks/tasks/useWorkItemNotifications.ts:177-185` (`openTask` faz `url.searchParams.set('task', taskId)` em :180 e navega para `?view=tasks` em :183).
- teste que cobre a abertura: `src/components/tasks/__tests__/TasksModule.entrada.test.tsx:61-89` (`it.each(MODOS)` com `MODOS` = Lista, Quadro e Agenda, `:34-38`) — "`?view=tasks&task=t1` abre o WorkItemSheet no modo $rotulo".
- **franqueza sobre a notificação:** NÃO existe teste que dispare a notificação e confirme o painel aberto. O mais próximo é `src/components/notifications/__tests__/NotificationItem.test.tsx:58` (o botão "Abrir" dispara `openTask`, que é quem grava `?task=`) e `src/hooks/tasks/__tests__/useTasksFilters.test.tsx:152-165` (o fluxo de alarme `replaceState(?task=…)` + `?view=tasks` não é desfeito pela base obsoleta do router). O `openTask` em si (:177-185) não tem teste direto do `set('task', …)`. Não escrevo teste novo: a recusa delimitou a correção ao relato e o cartão não pede.

**Ponto 4 — esclarecer a remoção de `WorkItemSheet.rodape.test.tsx` e o teste de cada arquivo.** A remoção aconteceu ainda na faixa dos pais, no commit `b5556c3ac` ("tira do diff primitivos orfaos e o teste do rodape de outro cartao"): aquele teste é do cartão 141–144 (rodapé), não deste cartão, e o arquivo `WorkItemSheet.rodape.test.tsx` NÃO existe na base `dia/2026-10-11` (nem em `cccd3d17b`, o primeiro commit da faixa). Ele não faz parte do diff deste cartão — por isso não volta. Cobertura de cada arquivo que o diff traz:
- `sheet/PainelRodape.tsx` e `sheet/rodape.ts` (helpers `linkInternoDaTarefa`/`podeReabrir`): exercitados indiretamente por `WorkItemSheet.test.tsx` (25 casos) através do painel REAL — assere `sheet-salvar`, `sheet-concluir` e `sheet-menu`, que são do rodapé. `sheet-reabrir`/`sheet-copiar-link`/`sheet-cancelar` não são asseverados diretamente.
- `sheet/PlanejamentoSection.tsx` e `sheet/planejamento.ts`: exercitados indiretamente por `WorkItemSheet.test.tsx` (assere `sheet-prazo`, `sheet-alarme`, `sheet-avisado`) e por `WorkItemSheet.naoModal.test.tsx`. `sheet-criada-em` (`planejamento.ts`) não é asseverado em teste nenhum — digo isso com franqueza.
- `src/hooks/tasks/workItemFormat.ts`: é arquivo do cartão T04, veio na faixa dos pais (commit `cccd3d17b`); é importado por `PlanejamentoSection.tsx:28` e `planejamento.ts:9`, sem teste direto neste diff.

## O que mudou e por quê
- Só o relato mudou nesta rodada: o código e os testes são os mesmos da branch recusada, que a própria recusa considerou corretos. Nenhum arquivo de produção foi reescrito.
- Diff deste cartão contra `dia/2026-10-11`: 14 arquivos (o painel: `WorkItemSheet.tsx`, `sheet/`, `__tests__/`, `useMyWorkItems.ts`, `workItem.types.ts`, `workItemFormat.ts`) — a faixa dos pais (151–156 do plano) trazida inteira, mais as etapas 145–147.
- Critério 1 respeitado: `src/components/ui/sheet.tsx` não foi tocado.

## Prova
- `npx vitest run src/components/tasks/__tests__/WorkItemSheet.naoModal.test.tsx src/components/tasks/__tests__/TasksModule.entrada.test.tsx` → 0 falhas, 0 pulados (linha de resumo no bloco FATOS MEDIDOS).
- `npx vitest run src/components/tasks/__tests__/WorkItemSheet.test.tsx` → 0 falhas, 0 pulados (mesmo bloco).
- vermelho antes: `WorkItemSheet.naoModal.test.tsx` é arquivo NOVO; sem a mudança ele não existe e os atributos `data-nao-modal`, `w-[70vw]` e `w-[420px]` não estão na base — o caso "145" falha por `getByTestId('sheet-nao-modal')`/atributo ausente. O fechar computa o vermelho→verde; não escrevo contagem à mão.

## O que NÃO fiz e por quê
- Não recomecei o cartão: a recusa mandou aproveitar a faixa (cherry-pick).
- Não corrigi nada fora do relato: a recusa delimitou a correção ao relato ("SÓ O RELATO").
- Não escrevi teste novo para a abertura por notificação: o cartão não pede e a recusa mandou corrigir só o relato; registrei a lacuna no Ponto 3.
- Não restaurei `WorkItemSheet.rodape.test.tsx`: é teste do cartão 141–144, ausente na base, e a recusa pediu esclarecer a remoção, não desfazê-la.

NÃO CONCLUÍ nada além do relato: o código já estava pronto e aprovado no mérito; entreguei o relato corrigido nos 4 pontos.
