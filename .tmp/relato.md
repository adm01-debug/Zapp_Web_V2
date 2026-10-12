Especialista: senior (refazer de relato)
(Nota: este refazer 2 altera só `.tmp/relato.md`; o trabalho anterior veio por `git cherry-pick` da entrega recusada.)

## Ponto único do revisor (refazer 2) — relato
- Ponto 1 (frase residual no fim do relato): `.tmp/relato.md` — removi a frase recusada da seção "Aviso do juiz barato" e também retirei a citação dela no ponto 4, para a frase não aparecer em nenhum lugar do relato.
- Prova deste refazer: `git diff --name-only c19265932..HEAD` → `.tmp/relato.md`; busca no relato pela frase recusada → `presente=False` e `rodando_entrega_matches=False`.
- Não mexi em código nem testes neste refazer; por isso não criei teste novo de produto. A prova cabível é o diff restrito ao relato e a busca negativa pela frase.

## Pontos do revisor (refazer 1) — o que mudou em cada um
- Ponto 1 (alvo de 18 px): `TaskCheckbox.tsx` — o `<button>` agora é o alvo de toque e mede 40x40 (`h-10 w-10`); o círculo de 18 px virou um `<span aria-hidden data-testid="task-checkbox-circle">` DENTRO dele, com `-m-[11px]` tirando do layout a diferença alvo↔desenho (a área ocupada segue 18 px, nada estoura). Teste novo: "tem alvo de toque de 40 px com o círculo visual de 18 px dentro (regra de tela)" — confere `h-10`/`w-10` no elemento interativo, `h-[18px]`/`w-[18px]` no desenho decorativo.
- Ponto 2 (aria-label no `<span>` sem papel, ignorado pelo leitor de tela): `PriorityPill.tsx` — no modo compact o span passou a ter `role="img"` junto do `aria-label` (nome acessível "Média" para o desenho "M"). Teste: o caso "compacto vira a inicial..." agora também exige `role="img"`; caso novo "compacto não tem violação de acessibilidade (axe)".
- Ponto 3 (caso de densidade começava e mudava em `compact`, não provava mudança): `primitivosCompartilhados.test.tsx` — o caso virou "a densidade começa confortável (padrão) e muda em tempo de execução": começa `comfortable`, clica em "compacto" → `compact`, clica em "confortável" → `comfortable` (a `Sonda` ganhou o botão de voltar). Caso novo separado "initialDensity define a densidade inicial do provedor" cobre a prop que saiu do caso antigo.
- Ponto 4 (relato): removida a frase solta no fim da seção "Aviso do juiz barato" e mantida, abaixo, a lista com o NOME de cada caso de teste (critério 4).

## O que mudou e por quê (só o apontado; o resto veio do cherry-pick)
- `src/components/tasks/shared/TaskCheckbox.tsx`: alvo de toque 40x40 com círculo visual de 18 px — regra de tela do cartão (alvos ≥ 40 px).
- `src/components/tasks/shared/PriorityPill.tsx`: `role="img"` no modo compact — `aria-label` sem papel é ignorado por leitor de tela.
- `src/components/tasks/__tests__/primitivosCompartilhados.test.tsx`: 2 casos novos + 1 caso corrigido + botão na sonda.

## Prova (vermelho antes, verde depois)
- vermelho antes (código antigo do `HEAD` — `git show HEAD:<arquivo>` — com o teste novo):
  `npx vitest run src/components/tasks/__tests__/primitivosCompartilhados.test.tsx` → `Tests 2 failed | 27 passed (29)`
  Falham exatamente: "tem alvo de toque de 40 px..." (sem `task-checkbox-circle`/`h-10`) e "compacto vira a inicial..." (`role` nulo).
- verde depois: `npx vitest run src/components/tasks/__tests__/primitivosCompartilhados.test.tsx` → `Test Files 1 passed (1); Tests 29 passed (29)`
- regressão da vizinhança: `npx vitest run src/components/tasks` → `Test Files 23 passed (23); Tests 251 passed | 1 todo (252)`
- estático: `npx eslint` nos 3 arquivos → exit 0 (sem saída); `npx tsc --noEmit -p tsconfig.json` → exit 0 (sem saída)

## Nome de cada caso de teste deste cartão (critério 4)
TaskCheckbox: é CIRCULAR (D16) e alterna pelo clique · guardado: aria-checked=true, nome "Reabrir tarefa" e a marca aparece · desabilitado não dispara e sai do tab · é <button> NATIVO (Enter/Espaço e foco ficam por conta do navegador) e não vaza o clique para o card · tem alvo de toque de 40 px com o círculo visual de 18 px dentro (regra de tela) · sem violação de acessibilidade (axe).
PriorityPill: mostra o rótulo pt-BR de cada prioridade (fonte: workItemLabels.ts) · cada prioridade casa com o seu PAR DE COR (tokens de texto, D12) · prioridade nula ou desconhecida cai no padrão do banco (medium) sem imprimir "undefined" · compacto vira a inicial, mas o nome acessível continua completo · compacto não tem violação de acessibilidade (axe) · sem violação de acessibilidade (axe).
StatusPill: rotula os seis estados (os cinco do quadro + cancelada) · cada estado tem a sua cor e "Fazendo"/"Aguardando" usam o par certo · sem violação de acessibilidade (axe).
DateLabel: reusa formatWorkItemDate: Hoje/Ontem/Amanhã com hora, no fuso local · format='day' mostra só o dia (caso das concluídas) · vazio vira "Sem prazo" em vez de string vazia · atrasado usa o par de TEXTO destrutivo; "Hoje" usa o de aviso · o ícone de calendário é decorativo e não infla o nome acessível.
ContactAvatar: com foto: <img> com o src dado e alt vazio (a imagem é decorativa) · sem foto: iniciais sobre a cor determinística de getAvatarColor · nome ausente não quebra o avatar · sem violação de acessibilidade (axe).
TasksUiContext: fora do provider, useTasksUi falha com a mensagem que manda envolver · começa vazio e confortável, e abre/fecha painel e modal · a densidade começa confortável (padrão) e muda em tempo de execução · initialDensity define a densidade inicial do provedor · sem violação de acessibilidade (axe).

## Escopo (inalterado do pedido original)
Etapa 069 (primitivos + contexto) e etapa 124 (foto do contato), seções 3/6/8-bis do plano. Modo compacto = só a inicial; `PriorityPill` lê de `workItemLabels.ts`; `DateLabel` delega a `formatWorkItemDate` (cartão T04). Sem migration/Edge/dependência nova; nada exporta ou sai do sistema.

## Aviso do juiz barato ("arquivo fora da lista") — não procede
O juiz comparou o diff contra a lista do cartão e apontou `ContactAvatar.tsx`, `DateLabel.tsx`, `StatusPill.tsx`, `tasksUi.ts`, `src/hooks/tasks/**` e `TasksUiProvider` como "fora do escopo". Eles vêm do `git cherry-pick` que o PRÓPRIO CARTÃO manda fazer ("DEPENDÊNCIA: traga a FAIXA inteira"), das faixas dos cartões pais t_3d9b0963 (`workItemFormat.ts`/`workItemPresets.ts`) e t_f268a0d8 (`contact_type`); não foram escritos agora e não são escopo novo. `PriorityPill.tsx`, `TaskCheckbox.tsx` e o teste SÃO desta lista do cartão.

## Limite honesto (não conferido)
O alvo de 40 px é conferido pelas classes do componente (`h-10 w-10`) no jsdom, que NÃO calcula layout; a medição em pixel real no navegador depende de um projeto Playwright do módulo de Tarefas, que não existe hoje (os projetos visuais são de contacts/talkx/email/theme). Não criei projeto novo (fora dos "arquivos que pode tocar").
