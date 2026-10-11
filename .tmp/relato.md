Especialista: Íris (area-front-componentes)

## O que mudou e por quê
- `src/components/tasks/shared/WorkItemSheet.tsx`: etapas 132–136 do plano (imagem 03).
  - 132: cabeçalho com o ícone calendário em quadrado primary, "Detalhes da tarefa" (era "Editar tarefa") e o botão "expandir"
    (`sheet-expandir`, `aria-pressed`) que alarga o painel de 420px para `min(720px,90vw)`.
  - 133: badges `StatusPill` + `PriorityPill` no topo (`sheet-badges`), lendo o estado/prioridade EDITADOS (acompanham o select).
  - 134: Título em input grande; Estado e Prioridade lado a lado (`grid-cols-2`) como selects, cada um com "ícone colorido"
    (ponto com os tokens D12 de `StatusPill`/`PriorityPill`) e a opção "Fazendo" bloqueada explicada no rótulo (`... está cheio (n/3)`).
  - 135: caixa "Motivo da espera" com borda âmbar (`border-warning/40`), selo "Obrigatório" (`sheet-motivo-obrigatorio`) e o erro
    inline (`sheet-motivo-erro`); só aparece em "Aguardando"; recebe o foco quando o painel abre por `focusField='waiting_reason'`.
  - 136: Contato com avatar nas opções (`ContactAvatar` num wrapper `aria-hidden` para o nome acessível da opção ficar só o nome) e o
    botão "Abrir conversa" (`sheet-abrir-conversa`), que chama `openContactChat` (o MESMO mecanismo do card) e fica desabilitado sem contato.
- `src/components/tasks/__tests__/WorkItemSheet.painel.test.tsx` (novo): prova cada etapa acima, renderizando o componente REAL.
- `src/components/tasks/__tests__/WorkItemSheet.test.tsx`: a Prioridade deixou de ser botões (etapa 134) e virou o select irmão do
  Estado; atualizei as 3 asserções que apontavam para `sheet-prio-*` (existência, escolha de "Urgente" e o valor final).
  Nenhuma asserção foi enfraquecida: as antigas checavam o clique, as novas checam o valor escolhido no select.

## Prova
- vermelho antes: `npx vitest run src/components/tasks/__tests__/WorkItemSheet.painel.test.tsx` →
  `Tests 5 failed | 2 passed (7)` (falha por `sheet-expandir`/`sheet-badges`/`sheet-motivo-caixa`/`sheet-abrir-conversa`/`sheet-prioridade` não existirem).
- verde depois: `npx vitest run .../WorkItemSheet.painel.test.tsx .../WorkItemSheet.test.tsx .../WorkItemSheet.fuso.test.tsx` →
  `Test Files 3 passed (3); Tests 36 passed (36)`.
- sem regressão na área: `npx vitest run src/components/tasks` → `Test Files 24 passed (24); Tests 255 passed | 1 todo (256)`.
- portão: `zapp-verify . --rapido` → `VERIFY: VERDE SEM BANCO` (tipos OK, lint OK).
- estados da tela: o painel só monta com `item != null`; o estado de erro do motivo (vazio ao salvar) está coberto pelo teste novo.

## O que NÃO fiz e por quê
- Etapas 137–140 (planejamento, validações, lembrete, descrição) são do cartão filho — não toquei.
- Persistir o "expandir" (70% e escolha salva) é da etapa 146, outro cartão; aqui o controle só alterna a largura.
- O "fechar" do cabeçalho é o X que o próprio `SheetContent` já renderiza no topo-direito (com `sr-only` "Close"); não criei um
  segundo botão de fechar para não duplicar ícone.
- `TasksModule.tsx` não foi alterado: a API de props do painel é a mesma, então o "Abrir conversa" usa `openContactChat` direto,
  sem fio novo pelo módulo.
