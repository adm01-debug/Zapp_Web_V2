Especialista: iris (area-front-componentes)

## O que mudou e por quê
- src/components/tasks/shared/NewTaskDialog.tsx — etapa 169 (plano, tabela linha 449): abaixo de 900px a prévia virou acordeão; o `Collapsible` real traz `aria-expanded` e o painel embrulha a MESMA `TaskPreview`. Em ≥900px o gatilho some (`min-[900px]:hidden`) e a prévia volta à coluna da direita. O break de layout passou de `lg:` (1024) para `min-[900px]:` para casar com "abaixo de 900 px". Etapa 170 (tabela linha 450): Esc, X, clique fora e "Cancelar" passam por `tentarFechar` — com título digitado abrem o `AlertDialog` de descarte; "Descartar" limpa o rascunho e fecha, "Continuar editando" preserva o texto.
- src/components/tasks/shared/new-task/NewTaskFooter.tsx — etapa 169: em telas estreitas (`max-sm:`) o rodapé fica `sticky bottom-0` com fundo, para "Criar tarefa" não sair da vista enquanto o formulário rola.
- src/components/tasks/shared/new-task/TaskPreview.tsx — a largura `md:w-56` da prévia saiu daqui e foi para o contêiner do modal, que agora decide entre coluna (≥900px) e acordeão (<900px).
- src/components/tasks/shared/PriorityPill.tsx e PriorityChip.tsx — etapa 170 / D12 (tabela linha 450; seção 3, linha 166): a pílula passou a usar SEMPRE a cor da prioridade. Média era `primary` (azul) e virou âmbar (`--warning-text`); Alta virou o par de texto do vermelho; Urgente ficou vermelho com borda cheia, para não colidir com Alta. Só o segmento escolhido do controle (`PrioritySegment`) segue `primary`. Esses dois primitivos NÃO estão na lista "ARQUIVOS QUE PODE TOCAR", mas são onde a cor da pílula mora (`PriorityPill` é o que a prévia renderiza via `WorkItemCard`; `PriorityChip` é o da Lista/Quadro) — sem eles a etapa 170 não acontece; declaro aqui.
- src/components/tasks/shared/QuickAdd.tsx (só o "Mais opções…") — etapa 171 (tabela linha 451): dentro do módulo (onde há `TasksUiProvider`) o ⋯ guarda o que foi digitado/ajustado e abre o modal "Nova tarefa". Fora do módulo (sem contexto) o ⋯ segue abrindo os chips no popover, como antes.
- src/components/tasks/shared/new-task/rascunhoDaCaptura.ts (novo) — canal de vida curta entre o QuickAdd e o modal. A leitura NÃO consome (sob StrictMode o render roda duas vezes) e a caixa é esvaziada no fechamento, então o próximo modal do cabeçalho nasce vazio.

Acesso de teclado/foco: o gatilho do acordeão tem `focus-visible:ring`; o descarte usa `AlertDialog` do Radix (foco preso e Esc). Sem cor literal nova; animação só em transform com `motion-safe:`.

## Prova
- vermelho antes (produção de `NewTaskDialog.tsx` e `QuickAdd.tsx` restaurada para HEAD via `git show HEAD:<arquivo>`, com o teste novo já escrito): `npx vitest run src/components/tasks/__tests__/NewTaskDialog.responsivoEQuickAdd.test.tsx` → `Test Files 1 failed (1); Tests 4 failed (4)`.
- verde depois (arquivos de volta): mesmo comando → `Test Files 1 passed (1); Tests 4 passed (4)`.
- testes ajustados da etapa 170 (rodape + movimentoEContraste + primitivosCompartilhados): `npx vitest run <3 arquivos>` → `Test Files 3 passed (3); Tests 46 passed (46)`.
- varredura da pasta afetada pelas cores (Lista/Quadro/primitivos): `npx vitest run src/components/tasks` → `Test Files 37 passed (37); Tests 374 passed | 1 todo (375)`.
- `git diff` do commit conferido (11 arquivos); o pré-commit de lint imprimiu `baseline=0, atual=0, novas=0` (nenhuma dívida nova).

## Casos novos (nomes)
- NewTaskDialog — responsivo: prévia em acordeão (etapa 169) › "o gatilho da prévia controla o acordeão por aria-expanded"
- NewTaskDialog — responsivo: prévia em acordeão (etapa 169) › "o painel do acordeão embrulha a prévia real (não um resumo)"
- QuickAdd — "Mais opções…" abre o modal pré-preenchido (etapa 171) › "o ⋯ do QuickAdd do módulo abre o modal com o título digitado na captura"
- QuickAdd — "Mais opções…" abre o modal pré-preenchido (etapa 171) › "o próximo modal aberto pelo cabeçalho nasce vazio (o rascunho foi consumido)"

## O que NÃO fiz e por quê
- O corte de largura (900px/360px) é CSS (`min-[900px]:*`, `max-sm:*`) e não é mensurável no jsdom; o teste prova o comportamento do acordeão (aria-expanded + painel), não a media query. Conferência de largura fica para o teste de tela quando houver navegador.
- Conferi os elementos contra a tabela/seção 3 do plano (linhas 126, 166, 449–451), que é a transcrição do designer; não abri os PNGs 01–05.
