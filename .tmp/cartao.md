REFAZER (rodada 1 de 2). A entrega anterior deste trabalho foi RECUSADA e nada entrou.

MOTIVO DA RECUSA: diff de 102528 caracteres é grande demais para revisão completa

O QUE CORRIGIR: Divida a entrega em cartões menores e independentes (cada um com seu teste), ou remova do commit arquivos gerados/irrelevantes.

TRABALHO ANTERIOR (aproveite, não recomece): branch `v2/modal-nova-tarefa-cabecalho-titulo-conta-2610111655c231` (commit bdda26e52) no repositório; no workspace novo, traga os commits com `git cherry-pick` e corrija só o que foi apontado. ATENÇÃO: traga SÓ o commit da fatia própria `c17bdd86c` (feat(tarefas): modal Nova tarefa com cabecalho, titulo, contato e prioridade — 6 arquivos). NÃO traga os commits dos pais (T11 primitivos, cabeçalho etc.): eles já estão integrados na branch do dia com outro conteúdo e foi isso que estourou o diff para 102528 caracteres.

PEDIDO ORIGINAL:
ESPECIALISTA DA ÁREA: iris (telas e componentes). Comece o relato com a linha `Especialista: iris`.
Origem: plano `docs/plans/PLANO_TAREFAS_NIVEL_DESIGN_200_ETAPAS_2026-10-11.md` (v2), aprovado pelo Joaquim em 11/10/2026 com as decisões D1 (Quadro por estado; agrupar por prazo opcional), D13 (tempo médio = da criação à conclusão) e D14 (painel de detalhes não modal). Enquanto o plano não estiver integrado na branch do dia, leia a cópia em `~/hermes-workspaces/.assets/tarefas/PLANO_TAREFAS_NIVEL_DESIGN_200_ETAPAS_2026-10-11.md` (seções 3, 6 e 8-bis são a referência de aceite). Antes de mexer, confira no código ATUAL o que já existe; se a etapa já estiver feita, prove no relato e não reescreva. Respeite `docs/design/TAREFAS_QUADRO_STATUS.md` (G-5 sem linguagem natural, G-6 limites, G-8 concluídas 7 dias, B13 uma query só, decisões declaradas). Sem migration, Edge Function ou dependência nova; nenhuma informação sai do sistema (sem exportar/baixar/imprimir).

REGRAS DE TELA: só tokens do sistema (nenhuma cor literal), claro, escuro e skins; framer-motion só em transform/opacity com `useReducedMotion`; alvos de pelo menos 40 px; teclado completo e foco visível; contraste AA; sem rolagem horizontal em 360, 768 e 1280 px. Use os primitivos de `src/components/tasks/shared/` (TaskCheckbox, PriorityPill, StatusPill, DateLabel, ContactAvatar, cartão T11) e as funções de `src/hooks/tasks/workItemFormat.ts`/`workItemPresets.ts` (cartão T04) em vez de reimplementar. Não altere `src/components/ui/*` (componentes compartilhados do app).

O QUE FAZER (etapas do plano)
- Etapa 154, Componente NewTaskDialog: `NewTaskDialog.tsx` (Dialog do projeto) aberto pelo botão do cabeçalho, pelo atalho `N` e pelo menu das colunas; carregado sob demanda.
- Etapa 155, Título e subtítulo: "Nova tarefa" e "Capture agora. Organize o próximo passo." com fechar; foco inicial no título.
- Etapa 156, Campo Título da tarefa: Obrigatório, 200 caracteres, contador discreto e erro inline.
- Etapa 157, Campo Contato: Combobox com avatar e "Sem contato"; pré-preenchido quando aberto a partir de um contato.
- Etapa 158, Prioridade segmentada: Baixa, Média (padrão), Alta, Urgente com setas e cores por token.

ARQUIVOS QUE PODE TOCAR
- src/components/tasks/shared/NewTaskDialog.tsx (novo)
- src/components/tasks/shared/new-task/ (subcomponentes novos)
- src/components/tasks/TasksModule.tsx (SOMENTE montar o modal sob demanda)
- src/components/tasks/__tests__/ (testes novos ou existentes)

CRITÉRIO DE PRONTO
1. Todas as etapas acima feitas e conferidas contra as imagens e a seção 3 do plano (cite no relato a linha da tabela de cada elemento).
2. Testes unitários PRÓPRIOS deste cartão (vermelho antes, verde depois quando houver comportamento novo), listados no relato com o nome de cada caso.
3. zapp-verify . --rapido verde.
