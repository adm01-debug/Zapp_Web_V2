Especialista: iris (telas e componentes)

## Como resolvi cada ponto da recusa (refazer 1)

- Ponto 1 — origem dos arquivos fora da lista:
  - `src/hooks/tasks/useMyWorkItems.ts` (o `contact_type` no select de `contacts`), `src/hooks/tasks/workItem.types.ts` (o campo opcional `contact_type?: string | null` em `WorkItemContact`) e `src/hooks/tasks/__tests__/useMyWorkItems.test.tsx` (os 2 casos de `contact_type`) vêm do cartão pai **t_f268a0d8** (`feat(hooks): tarefas trazem o tipo do contato (Cliente) junto da foto`, commit original **61430754531d21a15a83c930abfe2dd217bb0c87**), trazido ao meu branch pelo cherry-pick e aqui no SHA **16e7c3418**.
  - `src/hooks/tasks/__tests__/workItemFormat.test.ts` vem do cartão pai **t_3d9b0963** (`feat(hooks): regra unica de datas e presets de prazo/lembrete`, commit original **74c5c89f5ba4587ea7763a827647bb135abb923e**), trazido como **88adabd78**.
  - Nenhum destes arquivos foi escrito por este cartão.
- Ponto 2 — `TasksModule.tsx` **foi alterado** (a frase antiga estava errada): o diff mostra o import de `TasksUiProvider` e o envoltório `<TasksUiProvider>…</TasksUiProvider>` em volta do módulo (etapa 069 do plano). Isso veio do pai **t_a332243d** (`feat(tarefas): primitivos compartilhados e contexto de UI`, commit original **a3b923287**), trazido como **5c43f1e3f** — não é deste cartão.
- Ponto 3 — `WorkItemCard` **sai** da lista de arquivos trazidos: nenhum arquivo `WorkItemCard.tsx` aparece no diff (conferido no `git diff --stat`), então a menção antiga era falsa e foi removida.
- Ponto 4 — cada etapa 132–136 cita a linha da tabela da seção 3 do plano (`docs/plans/PLANO_TAREFAS_NIVEL_DESIGN_200_ETAPAS_2026-10-11.md`, linhas **405–409** do bloco por etapa); está no "O que mudou" abaixo, etapa por etapa.
- Ponto 5 — faixa de cada pai trazida por cherry-pick, na ordem, em "Cherry-pick dos pais" abaixo.

## O que mudou e por quê (etapas 132–136, imagem 03)

- `src/components/tasks/shared/WorkItemSheet.tsx` — etapas 132 a 136:
  - **132** (plano linha 405): cabeçalho com ícone calendário em quadrado primary, o texto "Detalhes da tarefa" (era "Editar tarefa") e o botão expandir (`sheet-expandir`, `aria-pressed`) que alarga o painel de 420 px para `min(720px,90vw)`;
  - **133** (plano linha 406): badges `StatusPill` + `PriorityPill` no topo (`sheet-badges`), lendo o estado/prioridade EDITADOS — acompanham o select;
  - **134** (plano linha 407): título em input grande; Estado e Prioridade lado a lado (`grid-cols-2`) como selects, cada um com o "ícone colorido" (ponto com os tokens de `StatusPill`/`PriorityPill`); a opção "Fazendo" fica bloqueada pelo limite com a explicação no rótulo (`... está cheio (n/3)`);
  - **135** (plano linha 408): caixa "Motivo da espera" só em "Aguardando", com borda âmbar (`border-warning/40`), selo "Obrigatório" (`sheet-motivo-obrigatorio`) e erro inline (`sheet-motivo-erro`); recebe o foco quando o painel abre por `focusField='waiting_reason'`;
  - **136** (plano linha 409): Contato com avatar nas opções (`ContactAvatar` num wrapper `aria-hidden`, para o nome acessível da opção ser só o nome) e o botão "Abrir conversa" (`sheet-abrir-conversa`), que chama `openContactChat` (o MESMO mecanismo do card) e fica desabilitado sem contato.
- `src/components/tasks/__tests__/WorkItemSheet.painel.test.tsx` (novo): prova cada etapa acima renderizando o componente REAL. Casos: `132: o cabeçalho traz o ícone, "Detalhes da tarefa" e o expandir`; `133: os badges mostram o estado e a prioridade atuais e acompanham a edição`; `134: título é input e Estado/Prioridade são selects com ícone colorido`; `134: a opção bloqueada pelo limite mostra a explicação`; `135: a caixa "Motivo da espera" aparece só em Aguardando, com borda âmbar e selo Obrigatório`; `135: o motivo recebe o foco quando o painel abre vindo do arrastar`; `136: o Contato mostra avatar nas opções e "Abrir conversa" chama o produto`.
- `src/components/tasks/__tests__/WorkItemSheet.test.tsx`: a Prioridade deixou de ser botões (etapa 134) e virou o select irmão do Estado; atualizei as 3 asserções que apontavam para os botões `sheet-prio-*` (existência, escolha de "Urgente" e o valor final). Nenhuma asserção foi enfraquecida: as antigas checavam o clique, as novas checam o valor escolhido no select.

## Cherry-pick dos pais (faixa de cada um, na ordem)

Trouxe `dia/2026-10-11..v2/painel-detalhes-tarefa-2610111453-26101115131f85` (14 commits) para o workspace novo. SHAs no meu branch, por pai:

- t_3d9b0963 (regra de datas/presets, T04): `88adabd78`
- t_33d9213e (rascunho do painel + patch mínimo): `e79cbd7de`, `e7058b8b0`, `1c009d191`, `c5c50f4b5`
- t_f268a0d8 (tipo do contato): `16e7c3418`
- t_a332243d (primitivos compartilhados + contexto de UI): `5c43f1e3f`, `3edf5cbed`, `397bd1d5c`
- este cartão (t_5f27cbe9), etapa 132–136: `bfa8d991b`
- relato/limpeza deste cartão: `614695411` (tira `useWorkItemDraft.ts` e `workItemPresets.ts`, etapas de outros cartões que este painel não importa), `727c4b503`, `d5d090028`, `efd315743`

## Prova

- verde: `npx vitest run src/components/tasks/__tests__/WorkItemSheet.painel.test.tsx src/components/tasks/__tests__/WorkItemSheet.test.tsx` → `Test Files 2 passed (2); Tests 32 passed (32)` (contagens no bloco FATOS MEDIDOS do fechar).
- vermelho antes: o teste novo falhava na base porque `sheet-expandir`/`sheet-badges`/`sheet-motivo-caixa`/`sheet-abrir-conversa` ainda não existiam (a execução do vermelho está no bloco FATOS MEDIDOS do fechar).
- portão: `zapp-verify . --rapido` verde (o fechar imprime a linha).

## O que NÃO fiz e por quê

- Não reescrevi código: a recusa diz que o painel (132–136) está correto e no escopo; a correção foi SÓ o relato.
- Etapas 137–140 (planejamento, validações, lembrete, descrição) são de cartões filhos — não toquei.
- Persistir o "expandir" (70% e escolha salva) é outra etapa; aqui o controle só alterna a largura.
- O "fechar" do cabeçalho é o X que o próprio `SheetContent` já renderiza no topo-direito; não criei um segundo botão para não duplicar ícone.
