Especialista: Íris (area-front-componentes)

# Lista em tabela — grupos recolhíveis, Concluídas, estado inicial, responsivo (etapas 065-073, cartão T20)

## O que mudou e por quê

- `src/components/tasks/list/gruposRecolhidos.ts` (novo): módulo puro que guarda
  a escolha aberto/recolhido de cada grupo no `localStorage`
  (`tasks-list-groups`) e fixa o estado INICIAL da etapa 067 — Atrasadas e Hoje
  abertos; Amanhã, Próximas, Sem prazo e Concluídas recolhidos. A escolha do
  usuário vence o padrão a partir da primeira interação (etapa 065).
- `src/components/tasks/list/responsivo.ts` (novo): hook `useListaEstreita()`
  sobre `matchMedia('(max-width: 1023px)')` — o corte de 1024 px da etapa 070.
- `src/components/tasks/list/animacaoLinha.ts` (novo): a entrada/saída das
  linhas da etapa 072 (altura + escalonamento de 40 ms por linha, teto de 12
  linhas) numa função pura, desligada em movimento reduzido.
- `src/components/tasks/list/TasksListTable.tsx`: o cabeçalho de cada grupo
  agora alterna o grupo e grava a escolha; o grupo Concluídas virou
  "Concluídas · últimos 7 dias" e o "Ver até 30 dias >" passou para o
  CABEÇALHO (066/067) — o botão do rodapé "ver mais (30 dias)" foi removido;
  as linhas concluídas saem riscadas e em muted (066); abaixo de 1024 px a
  tabela dá lugar a cartões compactos (`WorkItemCard` modo lista), uma coluna,
  sem rolagem horizontal (070), com os MESMOS grupos e estado recolhido.
- `src/components/tasks/list/TasksListMode.tsx`: o carregamento passou a
  mostrar o esqueleto DA TABELA (faixa de cabeçalho + 6 linhas de 44 px), no
  lugar dos cartões do layout antigo (etapa 071). Não há código morto: o import
  do `WorkItemCardSkeleton` saiu.

Etapa 073 ("aposentar a lista antiga"): a lista antiga de cartões já não existe
— `TasksListMode` é hoje só a casca da tabela (vazio/carregando/tabela). Confirmei
que nenhum import ficou órfão e que o `WorkItemCardSkeleton` continua com o seu
consumidor real (o Quadro).

## Prova

- vermelho antes (o desenho anterior não tinha nada disto — conferido no commit
  pai, `git show 56a4d328c:src/components/tasks/list/TasksListTable.tsx`):
  `list-group-ver-mais` → 0 ocorrências; `ver mais (30 dias)` → 2;
  `defaultOpen` → 4; e `gruposRecolhidos.ts`/`responsivo.ts`/`animacaoLinha.ts`
  → "não existe". Ou seja, os pontos das etapas 065/066/067/070/071/072 não
  tinham nem código nem prova.
- verde depois:
  - `npx vitest run src/components/tasks/__tests__/TasksListGrupos.test.tsx`
    → 11 provas novas passam (abre/recolhe + memória no navegador; estado
    inicial; "Ver até 30 dias" no cabeçalho; linha riscada; cartões abaixo de
    1024 px; esqueleto da tabela; escalonamento de 40 ms e altura desligada em
    movimento reduzido).
  - `npx vitest run src/components/tasks src/components/inbox`
    → todas as suítes passam, 0 falhas (linhas de resumo no bloco FATOS
    MEDIDOS do fechar).
  - `npx tsc --noEmit -p tsconfig.json` → sem erro.

## Testes herdados que foram atualizados (não afrouxados)

O estado inicial novo recolhe "Sem prazo"/"Próximas"/"Amanhã"/"Concluídas";
as provas que olhavam itens desses grupos passaram a abrir o grupo pelo
cabeçalho (ou semear a preferência) ANTES de olhar a linha — nenhuma asserção
foi removida ou relaxada. Onde o desenho antigo era provado
(`taskComponents.test.tsx`, etapa 48/51), a prova foi reescrita para o desenho
novo: "Ver até 30 dias" no cabeçalho revela `doneOlder`, e "Sem prazo" nasce
recolhido com qualquer contagem.

## O que NÃO fiz e por quê

- Etapa 069 (checkbox circular) é do cartão T11, fora deste título — não toquei.
- Nada de banco/Edge: o cartão é só de tela.
- Sem push, PR, deploy ou migration em produção.
