# Plano: módulo de Tarefas no nível das imagens de referência (200 etapas) — v2

> Escrito em 11/10/2026 pelo Claude. Pedido do Joaquim: elevar o módulo de Tarefas ao nível das 5 imagens de referência, com análise minuciosa de cada imagem e plano de 200 etapas, commitado no repositório.
> Tudo que está em "Estado atual" foi conferido no código da branch viva `dia/2026-10-11` (worktree `.integrador`). Nenhum cartão foi criado ainda: o plano espera o OK do Joaquim.
> **v2 (11/10/2026, tarde):** revisão adversarial do próprio plano e nova leitura das 5 imagens. 22 falhas e lacunas corrigidas (seção 13), 9 decisões novas (D13 a D21), cartões quebrados em unidades menores com teste próprio. A numeração das 200 etapas foi mantida: etapas de baixo valor ou fora das imagens foram trocadas no lugar.

## 1. Resumo

- O módulo **já foi construído na direção desse design**: as 5 colunas do Quadro, o limite de 3 em "Fazendo", o motivo de espera obrigatório, prazo e lembrete, a Agenda com Alarmes/Prazos/Sem hora, o painel lateral, atalhos, URL `?task=` e narração para leitor de tela (cerca de 100 etapas anteriores). A elevação é **visual e de experiência**, não de modelo de dados.
- **Banco:** `conversation_tasks` já tem tudo que as imagens usam (título, descrição, estado, prioridade, `due_date`, `remind_at`, `notified_at`, `waiting_reason`, contato, datas). **Este plano não exige migration, Edge Function nem dependência nova.** Virtualização usa `@tanstack/react-virtual` e arrastar usa `@hello-pangea/dnd`, ambos já no projeto; a contagem animada usa `framer-motion` (o `@number-flow/react` não existe e não será adicionado).
- **O que falta de fato (resumo):** tabela com colunas na Lista; KPIs com subtítulo, anel de limite e clique que filtra; barra de progresso e rodapé do limite no Quadro; cartões ricos (tag Atrasada, chip de espera, descrição); Resumo do dia e tarefa selecionada na Agenda; painel com estado de edição e botão Concluir; **modal "Nova tarefa" com prévia** (não existe); vocabulário "Lembrete" em vez de "Alarme".
- **Tamanho:** 200 etapas em 12 blocos (A a L): 124 de interface (iris), 19 de dados (hugo), 14 de especificação e revisão visual (designer), 27 de testes (workertestes), 2 de documentação (worker) e 14 do Claude (portões e coordenação). Na v2, 49 cartões propostos (menores; cada um de interface ou dados traz os próprios testes).

## 2. Estado atual do módulo (conferido no código)

| Parte | Onde | Estado |
|---|---|---|
| Contêiner | `src/components/tasks/TasksModule.tsx` (372 linhas) | Cabeçalho `PageHeader` "Tarefas" com subtítulo "N abertas · M para hoje"; KPIs; QuickAdd; barra de filtros; 3 modos; `WorkItemSheet`. Uma única query (`useMyWorkItems`) serve os três modos. |
| KPIs | `shared/TasksKpiStrip.tsx` | 5 cards de 88 px (tile de 44 px + valor + rótulo). Sem subtítulo, sem anel, rótulo "Concluídas (7d)", tempo médio arredondado ("1d"), sem clique. |
| Lista | `list/TasksListMode.tsx` | Seções (Atrasadas, Hoje, Amanhã, Próximas por dia, Sem prazo, Concluídas 7 dias) com **cartões** empilhados; não é tabela. Link "ver mais (30 dias)". |
| Quadro | `board/TasksBoardMode.tsx`, `BoardColumn.tsx`, `resolveDragEnd.ts` | 5 colunas de `KANBAN_COLUMNS` com política longa; limite duro 3 e motivo obrigatório já bloqueiam; sem barra de progresso nem rodapé do limite. |
| Agenda | `agenda/TasksAgendaMode.tsx` | Faixa de atrasadas, 7 dias com pontos, seções Alarmes/Prazos/Sem hora. Sem painel Resumo do dia, sem painel da tarefa selecionada, sem intervalo/nota. |
| Detalhes | `shared/WorkItemSheet.tsx` (508 linhas) | `Sheet` "Editar tarefa" (lateral; bottom sheet em tela estreita): título, estado, motivo, prioridade, contato, prazo, "Alarme", descrição, Ctrl+Enter salva. Sem badges, sem estado "Alterações não salvas", sem "Concluir" no rodapé, sem "Abrir conversa". |
| Captura | `shared/QuickAdd.tsx` (347 linhas) | Campo com chips Hoje/Amanhã/Data/Lembrar/Prioridade/Contato e atalhos 1/2; criação na Caixa de entrada. **Não existe modal "Nova tarefa" com prévia.** |
| Dados | `hooks/tasks/*` | `WorkItem` com 6 estados, `WIP_LIMITS` (doing duro 3), `workItemMachine`, agregados, filtros na URL, notificações `reminder_due` com 5 ações. |
| Menu | `components/layout/Sidebar.tsx` | Badge de Tarefas já existe (`useMyWorkItemsBadgeInfo`, cor warning/destructive). |
| Testes | `src/components/tasks/__tests__/` | 20 arquivos (Lista, Quadro, Agenda, Sheet, QuickAdd, a11y, contraste, atalhos, contagens). |

## 3. Análise das imagens (uma a uma)

Convenção: **EXISTE** (já no código), **PARCIAL** (existe com diferença) e **FALTA**. Todas as imagens estão em modo escuro; o modo claro precisa ser projetado com os mesmos tokens e verificado (bloco J).

### 3.1 Imagem 01: Lista (`Tarefas/01.png`)

**Estrutura:** barra superior com busca "Buscar no ZAPP…" e atalho `Ctrl K`, ícones (telefone, gráfico, pessoas, sino com 3), "Online"; título "Tarefas" e subtítulo "Seu espaço de execução · 14 abertas · 4 para hoje"; botão "+ Nova tarefa".

| Elemento da imagem | Estado | Etapas |
|---|---|---|
| Subtítulo "Seu espaço de execução · 14 abertas · 4 para hoje" | PARCIAL (sem a frase inicial) | 013 |
| Botão "+ Nova tarefa" no cabeçalho | FALTA | 014 |
| KPI Atrasadas (círculo vermelho com alerta, "2", "Requer atenção") | PARCIAL | 016–017 |
| KPI Para hoje (relógio âmbar, "4", "Vencem hoje") | PARCIAL | 018 |
| KPI Fazendo (anel azul, "3/3", "Limite atingido" em vermelho) | PARCIAL (sem anel nem subtítulo) | 019 |
| KPI Concluídas · 7 dias (check verde, "5", "Últimos 7 dias") | PARCIAL | 020 |
| KPI Tempo médio ("1,4 dias", "Das tarefas concluídas") | PARCIAL (arredonda para "1d") | 021–022 |
| Seletor Lista / Quadro / Agenda com ícones, ativo preenchido | PARCIAL | 031–032 |
| Busca "Buscar tarefa…", dropdowns Prioridade e Contato, botão Filtros | PARCIAL (filtros espalhados) | 033–037 |
| Barra "Capturar uma tarefa… Enter para criar" | PARCIAL (texto e visual) | 040 |
| Toggle "Mostrar concluídas" | EXISTE | 038 |
| Tabela: colunas Tarefa, Contato, Prioridade, Prazo, Lembrete, Estado | FALTA (hoje são cartões) | 049–050 |
| Linhas de grupo: Atrasadas (2), Hoje (4, "Domingo, 11 de outubro"), Amanhã (3), Próximas (3), Sem prazo (2), Concluídas · últimos 7 dias (5) | PARCIAL (sem ícone circular nem data) | 051–052 |
| Avatar com iniciais + nome do contato | PARCIAL | 054–055 |
| Pílulas de prioridade (Urgente cheio, Alta contorno, Média âmbar) | PARCIAL | 056 |
| Prazo com calendário (vermelho se atrasado): "Ontem, 17:00" | PARCIAL | 057–058 |
| Lembrete com sino: "Hoje, 13:30" / "Sem lembrete" | PARCIAL | 059 |
| Pílulas de estado: A fazer, Aguardando (âmbar), Fazendo (azul cheio) | PARCIAL | 060 |
| Subtítulo âmbar "Aguardando aprovação do cliente" sob o título | EXISTE no card, FALTA na tabela | 053 |
| Linha selecionada com barra azul à esquerda | FALTA | 062 |
| Kebab por linha | EXISTE | 061 |
| "Ver até 30 dias →" | PARCIAL | 066 |
| Amanhã, Próximas e Sem prazo **recolhidos** (só o contador); Atrasadas e Hoje abertos | FALTA (hoje abrem por padrão) | 067 |
| Toggle "Mostrar concluídas" na **mesma linha** da captura; filtros à direita, modos à esquerda | PARCIAL | 044 |
| "Ver até 30 dias >" no **cabeçalho** do grupo Concluídas (não no rodapé) | FALTA | 067 |
| Checkbox **circular** nas linhas | PARCIAL | 069 |
| Rodapé "Dados ilustrativos • Proposta de design" | NÃO IMPLEMENTAR (nota da proposta) | D7 |

### 3.2 Imagem 02: Agenda (`Tarefas/02.png`)

**Diferenças de shell:** barra superior com telefone, balão de chat e sino (menos ícones que a 01); KPIs com ícone em quadrado arredondado e subtítulos "Nos últimos 7 dias" e "Da criação à conclusão".

| Elemento da imagem | Estado | Etapas |
|---|---|---|
| Faixa vermelha "2 tarefas atrasadas" com "Ver tarefas ⌄" | PARCIAL (bloco menor, sem largura total) | 108 |
| "Próximos 7 dias" + "11 – 17 de outubro de 2026" + nota "O lembrete avisa você. O prazo marca a entrega." | FALTA | 109 |
| 7 cartões de dia (DOM 11 "Hoje", SEG 12 … SÁB 17) com pontos azul/âmbar | PARCIAL (pontos sem legenda de significado) | 110–112 |
| "Hoje, 11 de outubro · 4 tarefas com prazo · 2 lembretes" + "+ Adicionar para hoje" | PARCIAL | 113 |
| ALARMES (2): horário do lembrete à esquerda, "Lembrete / Prazo hoje, 14:00" | PARCIAL | 114 |
| PRAZOS (4): horário do prazo, "Prazo hoje, 14:00", estado | PARCIAL | 115 |
| SEM HORA (0): "Nenhuma tarefa sem horário para hoje." | PARCIAL | 116–117 |
| Painel "Resumo do dia": 4 tarefas com prazo e 2 lembretes | FALTA | 118 |
| "Tarefa selecionada": avatar, "Cliente", "Abrir conversa", "Alta prioridade", "Fazendo", Prazo, Lembrete, Descrição, "Abrir tarefa" | FALTA | 119–121 |
| Sinal de que azul = lembrete e âmbar = prazo (deduzido: Hoje tem 2 lembretes e 4 prazos) | A confirmar na etapa 111 | 111 |
| **Fotos** dos contatos nas linhas e no painel | PARCIAL (dado existe, tela usa iniciais) | 124 |
| "Camila Rocha · **Cliente**" no painel | FALTA (a query não traz `contact_type`) | 068 |
| A mesma tarefa aparece em ALARMES e em PRAZOS; na 1ª linha de ALARMES a pílula de estado some | Regra: estado sempre visível nas duas | 114, 117 |

### 3.3 Imagem 03: Quadro com painel "Detalhes da tarefa" (`Tarefas/03.png`)

**Diferenças de shell:** barra superior com botão de IA (faísca destacada), telefone, gráfico, atualizar, pessoas e calendário; coluna direita com Online, sino e avatar. O menu lateral mostra "Tarefas" com **badge 4**, "Multiplix NOVO" e "Buscar… ⌘K".

| Elemento da imagem | Estado | Etapas |
|---|---|---|
| KPIs compactos (rótulo pequeno acima do valor) | Terceira densidade (D2) | 025 |
| Filtros "Todas as…" e "Todos os contatos" | PARCIAL | 034–035 |
| **Colunas por prazo**: Atrasadas, Para hoje, Fazendo, Concluídas (cada uma com "+ Nova tarefa") | Difere da imagem 05 (por estado) | D1, 101–102 |
| Painel lateral "Detalhes da tarefa" com expandir e fechar | PARCIAL (hoje "Editar tarefa") | 131–132 |
| Badges "Aguardando" e "Alta" no topo | FALTA | 133 |
| Título, Estado e Prioridade (selects com ícone) | PARCIAL | 134 |
| "Motivo da espera" com selo **Obrigatório** em caixa âmbar | PARCIAL (campo existe, sem selo/borda) | 135 |
| "Contato vinculado" + "Abrir conversa ↗" | PARCIAL | 136 |
| "Planejamento": Prazo ("Até quando concluir") e Lembrete ("Quando avisar você") com data e hora | PARCIAL | 137–138 |
| "✓ Agendado · Adiar ▾ · Remover" | PARCIAL | 139 |
| Descrição e "Criada em 9 out. 2026" | PARCIAL | 140 |
| Rodapé: ponto âmbar "Alterações não salvas", "Ctrl + Enter para salvar", "Concluir", "Salvar alterações", ⋮ | PARCIAL (Ctrl+Enter existe, resto não) | 141–142 |
| Quadro rolando horizontalmente com o painel aberto (4ª coluna cortada) | Comportamento a garantir | 098, 145 |
| Painel **sem fundo escurecido**, acoplado, com o Quadro clicável atrás | FALTA (o `Sheet` atual é modal) | 145, D14 |
| "+ Nova tarefa" no pé de **cada** coluna (inclusive Atrasadas) | NÃO IMPLEMENTAR (D19) | 091 |
| Cartões do Quadro sem checkbox (só os concluídos têm check verde) | Regra: checkbox circular em todos (D16) | 084 |

### 3.4 Imagem 04: Modal "Nova tarefa" (`Tarefas/04.png`)

| Elemento da imagem | Estado | Etapas |
|---|---|---|
| Modal de duas colunas com ícone, "Nova tarefa" e "Capture agora. Organize o próximo passo." | FALTA (não existe modal) | 153–155 |
| "Título da tarefa" (campo em foco) | FALTA | 156 |
| "Contato" (avatar + nome) | FALTA | 157 |
| "Prioridade" segmentada Baixa/Média/Alta/Urgente | FALTA | 158 |
| "Prazo — Até quando concluir": data, hora e Hoje / Amanhã / Próx. semana | FALTA | 159 |
| "Lembrete — Quando você quer ser avisado": data, hora e Em 1h / Amanhã, 9h / Próx. seg., 9h | FALTA | 160–161 |
| Confirmação verde "Lembrete programado para antes do prazo." | FALTA | 162–163 |
| "A tarefa será criada na Caixa de entrada." | FALTA | 164 |
| "Prévia da tarefa — Confira antes de criar." (cartão vivo) | FALTA | 165 |
| "Prazo é a entrega. Lembrete é o aviso." (caixa informativa) | FALTA | 166 |
| Rodapé: "Enter para criar", "Cancelar", "+ Criar tarefa" | FALTA | 167 |
| Fundo com a Lista/Quadro esmaecido e KPIs com subtítulos "Em andamento" e "Da criação à conclusão" | Regra do subtítulo de Fazendo (D2) | 019 |
| Pílula "Média" **azul** na prévia (âmbar nas outras telas) | Incoerência: D12 | 170 |
| Segmento e atalho selecionados em primary ("Média", "Amanhã", "Amanhã, 9h") | FALTA | 158–160 |
| Datas "Seg, 09/09, 14:20" nos cartões do fundo | Incoerência: D21 | 058 |
| 4ª variação de KPI (número dentro do círculo) | NÃO ADOTAR (D2) | 025 |

### 3.5 Imagem 05: Quadro principal (`Tarefas/05.png`)

**Diferenças de shell:** barra superior mínima (busca, telefone, sino, Online); título com pílula "14 abertas"; botão "+ Nova tarefa" e menu ⋮; abas sublinhadas; faixa de KPIs em linha; toggle "Concluídas" ligado.

| Elemento da imagem | Estado | Etapas |
|---|---|---|
| Faixa de KPIs em uma linha com separadores | FALTA | 025 |
| Colunas Caixa de entrada (A organizar), A fazer (Próximas ações), Fazendo 3/3 (Conclua uma para iniciar outra), Aguardando (Dependências externas), Concluído (Últimos 7 dias) | PARCIAL (colunas existem; subtítulos são a política longa) | 080–081 |
| Fazendo com barra de progresso azul e rodapé "Seu limite é de 3 tarefas em execução." | FALTA | 082 |
| Card: checkbox, título em 2 linhas, pílula de prioridade, "Contato: Nome", prazo | PARCIAL | 084 |
| "Urgente" ao lado do título ("Enviar orçamento de 300 squeezes") | FALTA | 085 |
| Tag "Atrasada" com prazo em vermelho | FALTA | 086 |
| Lembrete no card ("Hoje, 13:30" com sino âmbar) | PARCIAL | 087 |
| Card selecionado: borda azul, descrição, "Prazo / Lembrete" em duas colunas e alça ⠿ | FALTA | 087–090 |
| Aguardando: ponto âmbar + motivo ("Retorno da transportadora") | PARCIAL | 089 |
| "Capturar tarefa — Pressione Enter para criar" tracejado | FALTA | 091 |
| Concluído com ícone de menu, check verde e "Ver até 30 dias →" | PARCIAL | 092–093 |
| Alvos e arrasto polidos (alça, destaque da coluna) | PARCIAL | 094–097 |
| Toggle "Concluídas" **ligado** = coluna Concluído visível | FALTA (semântica não definida) | 093 |
| Checkbox **quadrado** e "Contato: Nome" em texto | Incoerência: D16 e D18 | 084 |
| "Limite atingido" em cinza (nas 01/02 é vermelho) | Incoerência: vale vermelho (019) | 019 |
| Sem Prioridade/Contato na barra (só "Filtros") | Regra de recolher (044) | 044 |
| Título com pílula "14 abertas" em vez do subtítulo | NÃO ADOTAR: subtítulo único (013) | 013 |

### 3.6 Incoerências entre as imagens (a resolver, não a copiar)

1. **Colunas do Quadro:** a 03 usa colunas por prazo (Atrasadas, Para hoje, Fazendo, Concluídas) e a 05 usa colunas por estado (5 colunas). A 05 casa com o modelo e com as regras (limite, motivo). Decisão D1.
2. **Três densidades de KPI:** card confortável (01/02), compacto com rótulo acima (03/04) e faixa em linha (05). Decisão D2.
3. **Dois estilos de seletor de modo:** preenchido (01 a 04) e sublinhado (05). Decisão D3.
4. **Subtítulos que mudam:** Fazendo diz "Limite atingido" (3/3) ou "Em andamento" (abaixo do limite); Tempo médio diz "Das tarefas concluídas" ou "Da criação à conclusão". Regra: a primeira por estado, a segunda como texto único.
5. **Barra superior e menu lateral variam** (ícones diferentes, badge de Tarefas só nas 03/04). É o shell do aplicativo, não do módulo (D8).
6. **Formato de datas:** "Hoje, 14:00" (01/02/05) e "Hoje, 11/10" (03/04). Regra única na etapa 058.
7. **Filtros:** "Prioridade" e "Contato" (01/02) contra "Todas as…" e "Todos os contatos" (03). Adotar o rótulo curto com contador quando ativo (034–035).
8. **Rodapé "Dados ilustrativos • Proposta de design"** é nota da proposta e não vai para o produto (D7).
9. **Checkbox:** círculo nas imagens 01, 02, 04 e no fundo da 04; quadrado na 05; ausente nos cartões abertos da 03 (D16).
10. **Cor de "Média":** âmbar (01, 05) e azul (prévia da 04) (D12, etapa 170).
11. **Contato:** avatar + nome (01, 02, 03, 04) e "Contato: Nome" em texto (05) (D18).
12. **Captura no Quadro:** "+ Nova tarefa" em cada coluna (03) e só o cartão tracejado na Caixa de entrada (05) (D19).
13. **Foto ou iniciais:** fotos (02, 04) e iniciais (01, 03, 05). O dado `avatar_url` existe: foto com reserva de iniciais (124).
14. **Cor de "Limite atingido":** vermelho (01, 02) e cinza (05). Vale vermelho, porque é um bloqueio real.
15. **Grupos da Lista:** a imagem 01 mostra Amanhã, Próximas e Sem prazo recolhidos; o código abre todos (067).
16. **Tempo médio:** o rótulo das imagens ("Da criação à conclusão") não corresponde ao cálculo atual (tempo de ciclo) (D13).

## 4. Escopo

**Dentro:** tudo do módulo de Tarefas visível nas 5 imagens (cabeçalho, KPIs, barra, Lista, Quadro, Agenda, painel de detalhes, modal), vocabulário, atalhos, acessibilidade, desempenho e testes.

**Fora (decisões do Joaquim ou outros módulos):** barra superior e menu lateral do aplicativo (D8); modelo de dados e notificações no servidor (só auditoria de leitura, etapa 176); novos canais de aviso (push/WhatsApp); recursos de exportar, baixar, copiar tudo ou imprimir (regra permanente); responsáveis diferentes do criador (hoje `assigned_to` = quem cria).

## 5. Restrições permanentes que valem para todos os cartões

- Só tokens do sistema; nenhuma cor literal; claro, escuro e skins. Sem dependência nova. Movimento só em `transform`/`opacity`, com `useReducedMotion` respeitado.
- Nenhuma informação sai do sistema (sem exportar/baixar/copiar/imprimir novos). Sem selo de canal/origem.
- Alvos de toque de pelo menos 40 px (32 px só onde o plano justificar), teclado completo, foco visível, contraste AA.
- Cada cartão é file-disjunto ou encadeado por dependência (pai → filho), com `zapp-verify . --rapido` verde. Cartão que atravessa camadas é dividido por camada (hooks = hugo, telas = iris, testes = workertestes, visual = designer).

## 6. Decisões adotadas (valem se o Joaquim não vetar)

| # | Decisão | Motivo |
|---|---|---|
| D1 | Quadro padrão **por estado** (imagem 05). "Agrupar por prazo" (imagem 03) entra como alternância opcional e somente leitura nas etapas 101–102. | A 05 casa com limite e motivo obrigatório; arrastar por prazo não tem semântica. |
| D2 | KPI com **duas densidades**: cartões com subtítulo na Lista e na Agenda; faixa compacta no Quadro. | Dá altura às colunas sem perder a leitura. |
| D3 | Seletor de modos **preenchido com ícone** (imagens 01 a 04). | Três de quatro telas; destaca o modo ativo. |
| D4 | Lista em **tabela** a partir de 1024 px e cartões compactos abaixo. | Imagem 01 e uso em celular. |
| D5 | Painel de detalhes continua um `Sheet` lateral (bottom sheet em tela estreita), renomeado "Detalhes da tarefa". | Já existe e é acessível; só ganha estado de edição. |
| D6 | O botão "Nova tarefa" abre o **modal**; a barra de captura continua criando com Enter. | Captura rápida e criação guiada convivem. |
| D7 | Rodapé "Dados ilustrativos • Proposta de design" **não** é implementado. | Nota da proposta. |
| D8 | Barra superior e menu lateral do aplicativo ficam fora; só o badge de Tarefas (que já existe) é conferido. | Shell é de outro escopo. |
| D9 | Motivo da espera continua **obrigatório** e bloqueia a mudança. | Regra já vigente e presente na imagem 03. |
| D10 | O destino da tarefa nova é sempre a **Caixa de entrada** (como no modal da imagem 04). | Mantém o fluxo de captura. |
| D11 | Preferências de exibição (modo, densidade, grupos recolhidos) ficam em localStorage por navegador. | Já é o padrão do módulo; sem banco. |
| D12 | Cores de prioridade e estado só com tokens existentes; a pílula de prioridade tem SEMPRE a cor da prioridade (Média âmbar), inclusive na prévia do modal. | Regra do repositório e coerência entre telas. |
| D13 | Tempo médio = **da criação à conclusão** (`created_at` → `completed_at`) nas concluídas de 7 dias, com uma casa decimal. | É o que as imagens dizem; o cálculo atual (tempo de ciclo) mede outra coisa com o mesmo rótulo. **Vetar** se o Joaquim preferir o tempo de ciclo (aí o rótulo vira "Do início à conclusão"). |
| D14 | Painel de detalhes **não modal** e acoplado no desktop; bottom sheet modal no celular. | Imagem 03: quadro visível e clicável com o painel aberto. |
| D15 | Promoção para a `main` só por **bloco completo** (Lista, Quadro, Agenda, painel, modal). | Evita produção com metade da tela nova. |
| D16 | Checkbox **circular** em todas as superfícies. | 4 de 5 imagens; convenção de "concluir". |
| D17 | Badge do menu mantém a regra atual (atrasadas + lembretes disparados). | O número das imagens é ilustrativo; a regra foi corrigida em 29/09 (B6). |
| D18 | Contato no cartão do Quadro com **avatar pequeno + nome**. | Coerência com Lista, Agenda, painel e modal. |
| D19 | Só a **Caixa de entrada** tem captura no Quadro. | Coerente com D10 e com a imagem 05; capturar em "Atrasadas" não tem sentido. |
| D20 | Na Agenda, a pílula de estado aparece **sempre**, em ALARMES e em PRAZOS. | A imagem 02 omite numa linha só; é ruído da proposta. |
| D21 | Uma **regra única de datas** (etapa 058). | As imagens usam 4 formatos diferentes. |

## 7. Mapa de profissionais (agentes) por tipo de etapa

| Perfil | Faz | Etapas |
|---|---|---|
| `iris` | telas e componentes | 124 |
| `hugo` | hooks, estado e dados no front | 19 |
| `designer` | especificação visual, tokens e contraste | 14 |
| `workertestes` | testes, e2e e regressão visual | 27 |
| `worker` | documentação | 2 |
| `Claude` | portões e validação | 14 |

## 8. As 200 etapas

### Bloco A: Fundamentos e decisões (etapas 001–012)

_Congelar a referência, medir a linha de base e travar as decisões antes de qualquer tela._

| Etapa | Dono | O que fazer |
|---|---|---|
| 001 | Claude | **Congelar a referência visual.** Registrar o caminho das 5 imagens (`~/projetos/Zapp_Web_V2-anexos/design/Zapp Web V2 - Redesign/Tarefas/01..05.png`) e o sha256 de cada, para o plano não depender de memória nem de anexos de chat. |
| 002 | Claude | **Registrar as decisões D1 a D12.** Publicar as decisões adotadas (seção 6) num ADR curto em `docs/adr/`. Valem se o Joaquim não vetar; as que dependem dele para vetar estão marcadas. |
| 003 | workertestes | **Linha de base visual "antes".** Capturas Playwright (claro e escuro; 360, 768 e 1280 px) de Lista, Quadro, Agenda, painel de edição e QuickAdd na branch atual, para medir a evolução e detectar regressão. |
| 004 | workertestes | **Semente local que reproduz as imagens.** Script idempotente e removível em `scripts/` que cria, SÓ no banco LOCAL e para o usuário de teste da pré-visualização (`created_by` = perfil dele), as tarefas das imagens: 14 abertas, 2 atrasadas, 4 para hoje, 3 fazendo, 4 aguardando com motivo, 5 concluídas, contatos com e sem foto e do tipo cliente. Carimbar `created_at`, `started_at`, `completed_at` e `status_changed_at` para o tempo médio dar 1,4 dia. Nunca produção. |
| 005 | designer | **Inventário de tokens e tema claro.** Listar o que já existe para prioridade, estado e KPI (`bg-kpi-*`, `destructive`, `warning`, `info`, `primary`, `success`) e o que falta, sem cor nova nem literal. As 5 imagens são SÓ do tema escuro: especificar o tema claro de cada tela com os mesmos tokens e medir contraste AA nos dois. |
| 006 | designer | **Mapa de ícones.** Definir os ícones lucide e tamanhos (16/20/24) de cada elemento das imagens (alerta, relógio, anel de progresso, check, cronômetro, caixa de entrada, sino, calendário, alça de arrastar). |
| 007 | Claude | **Estratégia de entrega incremental.** Cada cartão deixa a tela utilizável e verde; sem feature flag e sem migration. A ordem dos cartões protege `TasksModule.tsx`, arquivo quente tocado por várias frentes. |
| 008 | hugo | **Auditoria de dados do que a UI nova precisa.** Conferir `workItemAggregates.ts` e `useMyWorkItems.ts` para: resumo do dia, janela de 30 dias, tempo médio decimal, progresso do limite. Entregar relatório de lacunas de dados (sem banco novo, sem consulta nova). |
| 009 | workertestes | **Mapa dos testes e dos cartões em voo.** Cruzar os 20 arquivos de `src/components/tasks/__tests__/` com as etapas (quais cada uma atualiza) e listar os cartões abertos no quadro que tocam o módulo (em 11/10: `t_a9419fa8`, filtros na URL, em `useTasksFilters`/`workItemFilters`). Nenhum cartão deste plano começa nesses arquivos antes de o cartão em voo ser integrado. |
| 010 | designer | **Escala tipográfica e espaçamento.** Mapear títulos, valores de KPI e rótulos das imagens para a escala do repositório (guard-rail: sem tamanho arbitrário acima de 16 px; tokens `text-2xs`/`text-3xs`). |
| 011 | Claude | **Orçamentos numéricos.** Medir o chunk do módulo antes e fixar: bundle do módulo até +15 KB gzip (modal e painel sob demanda); montar Lista e Quadro com 500 tarefas em até 300 ms na pré-visualização; regressão visual com limiar de 0,5% de pixels por tela (acima disso, revisão humana). |
| 012 | worker | **Documento de referência para os agentes.** Criar `docs/tarefas/DESIGN_REFERENCIA.md` com o inventário das 5 telas (resumo da seção 3 deste plano) para todo cartão do bloco apontar para ele. |

### Bloco B: Cabeçalho e KPIs (etapas 013–030)

_Cabeçalho do módulo e as cinco leituras do topo no nível das imagens 01, 02, 03, 04 e 05._

| Etapa | Dono | O que fazer |
|---|---|---|
| 013 | iris | **Título e subtítulo.** "Tarefas" com subtítulo "Seu espaço de execução · N abertas · M para hoje" (singular/plural e milhar pt-BR) no `PageHeader` de `TasksModule.tsx`. |
| 014 | iris | **Botão "+ Nova tarefa".** Botão primário à direita do cabeçalho que abre o modal do bloco H; atalho `N` no registry global de atalhos com escopo da tela de Tarefas. |
| 015 | iris | **Menu ⋮ do cabeçalho.** Menu da imagem 05 com "Atalhos de teclado" e "Densidade da lista". Sem exportar, baixar, copiar tudo nem imprimir (regra permanente). |
| 016 | designer | **Especificar o card de KPI confortável.** Imagem 01: círculo de 44 px com ícone, valor grande, rótulo colorido e subtítulo; três estados (atenção, neutro, ok). |
| 017 | iris | **Card Atrasadas.** Vermelho quando maior que 0 com subtítulo "Requer atenção"; com 0 fica neutro com "Tudo em dia". Reescrita de `TasksKpiStrip.tsx`. |
| 018 | iris | **Card Para hoje.** Âmbar, subtítulo "Vencem hoje"; com 0 mostra "Nada vence hoje". |
| 019 | iris | **Card Fazendo com anel de progresso.** "n/3" com anel SVG; subtítulo "Em andamento" abaixo do limite e "Limite atingido" (tom destrutivo) em 3/3. |
| 020 | iris | **Card Concluídas.** "Concluídas · 7 dias" com subtítulo "Últimos 7 dias", em verde (hoje o rótulo é "Concluídas (7d)"). |
| 021 | hugo | **Tempo médio: métrica certa e decimal.** Hoje `kpis()` calcula TEMPO DE CICLO (`started_at` → `completed_at`, só concluídas de 7 dias que passaram por Fazendo) e arredonda ("1d"); as imagens rotulam "Da criação à conclusão". Decisão D13: medir de `created_at` a `completed_at` nas concluídas dos últimos 7 dias, uma casa decimal pt-BR ("1,4 dias", "1 dia", "—" sem dados). Função pura em `workItemAggregates.ts`, com teste que prova a troca de métrica. |
| 022 | iris | **Card Tempo médio.** Ícone de relógio neutro, valor e subtítulo "Da criação à conclusão" (texto único; as imagens variam). |
| 023 | iris | **KPIs clicáveis como filtro.** Atrasadas e Para hoje aplicam o filtro de prazo correspondente (com chip visível, clicar de novo remove); Fazendo leva ao Quadro; Enter e Espaço funcionam. |
| 024 | hugo | **Filtro de prazo vindo do KPI.** Acrescentar `due: 'overdue' | 'today'` em `useTasksFilters`/`workItemFilters`, espelhado na URL e limpo por "Limpar filtros". |
| 025 | iris | **Faixa compacta de KPIs.** Variante da imagem 05: cinco leituras numa linha com separadores, usada no Quadro para ganhar altura; a densidade acompanha o modo. |
| 026 | iris | **Responsividade dos KPIs.** 5 colunas a partir de 1280 px, 3 em 768 px e 2 em 360 px; a faixa compacta vira 2 linhas ou rolagem sem estourar a página. |
| 027 | iris | **Esqueleto dos KPIs.** Esqueleto com brilho sutil e sem salto de layout ao carregar. |
| 028 | iris | **Valor que conta com mola.** Número anima com mola curta (framer-motion, sem biblioteca nova) e narra por `aria-live=polite` quando muda; sem animação em movimento reduzido. |
| 029 | workertestes | **Testes dos KPIs.** Textos, singular/plural, estados 0/atenção/limite, clique que filtra, variante compacta e `1,4 dias`. |
| 030 | workertestes | **Contraste AA dos KPIs.** Teste automatizado nos dois temas (reaproveitar o teste de contraste que o módulo já tem). |

### Bloco C: Barra de ferramentas e captura (etapas 031–048)

_Modos, busca, filtros e a captura rápida no padrão das imagens 01, 02 e 05._

| Etapa | Dono | O que fazer |
|---|---|---|
| 031 | designer | **Especificar o seletor de modos.** Imagens 01 a 04: botões preenchidos com ícone; imagem 05: abas sublinhadas. Adotar a decisão D3 e documentar o estado ativo, foco e hover. |
| 032 | iris | **ModeSwitcher com ícones.** Botões Lista (List), Quadro (Columns) e Agenda (Calendar), ativo preenchido em primary, foco visível; as teclas 1/2/3 que já existem continuam. |
| 033 | iris | **Busca "Buscar tarefa…".** Campo com lupa, botão de limpar, atalho `/` e largura flexível. |
| 034 | iris | **Filtro Prioridade.** Dropdown com chevron (Todas, Urgente, Alta, Média, Baixa) e contador quando ativo. |
| 035 | iris | **Filtro Contato.** Dropdown com busca interna (reaproveitar `ContactCombobox`) e opção "Sem contato". |
| 036 | iris | **Botão Filtros com popover.** Estado, lembrete, prazo (atrasadas, hoje, semana, sem prazo) e "Mostrar concluídas"; badge com o número de filtros ativos. |
| 037 | hugo | **Filtros de estado e prazo.** Estender `useTasksFilters`/`workItemFilters` com estado e prazo, serializados na URL e compatíveis com os filtros atuais; "Limpar tudo". |
| 038 | iris | **Toggle de concluídas.** "Mostrar concluídas" na Lista e Agenda e "Concluídas" no Quadro, compartilhando o mesmo estado. |
| 039 | iris | **Chips dos filtros ativos.** Chips removíveis abaixo da barra e "Limpar filtros". |
| 040 | iris | **Barra de captura.** Ícone +, placeholder "Capturar uma tarefa…" e dica "Enter para criar" à direita (some ao digitar); altura 48 px. |
| 041 | hugo | **Revisar o parser do QuickAdd.** Manter os atalhos 1/2 e prioridade por `!`, sem NLP (decisão G-5 do módulo), com testes. |
| 042 | iris | **Chips da captura no padrão do modal.** Ao focar, mostrar Hoje, Amanhã, Data, Lembrete, Prioridade e Contato com os mesmos rótulos e tokens do modal do bloco H. |
| 043 | iris | **Criação otimista na captura.** O item entra na Caixa de entrada com realce de 1,2 s e o foco volta ao campo. |
| 044 | iris | **Disposição da barra como nas imagens.** Modos à esquerda; busca, Prioridade, Contato e Filtros à direita; o toggle "Mostrar concluídas" fica na MESMA linha da captura (imagens 01 e 02). No Quadro e em telas estreitas, Prioridade e Contato entram no popover "Filtros" (imagem 05). |
| 045 | iris | **Estados vazios do filtro.** Nenhum resultado, com microcopy e botão "Limpar filtros", no novo visual (`TasksEmptyState`). |
| 046 | workertestes | **Testes da barra.** Busca, dropdowns, popover de filtros, chips, sincronia com a URL e toggle de concluídas. |
| 047 | workertestes | **Testes de teclado da barra.** `/`, 1/2/3, Enter e ordem de foco. |
| 048 | designer | **Revisão visual da barra.** Capturas em 360, 768 e 1280 px (quebras, truncamentos) e ajustes finos. |

### Bloco D: Lista em tabela (etapas 049–078)

_Trocar as seções de cartões por uma tabela com colunas, como na imagem 01._

| Etapa | Dono | O que fazer |
|---|---|---|
| 049 | designer | **Especificar a tabela.** Colunas Tarefa, Contato, Prioridade, Prazo, Lembrete e Estado, larguras, linha de 44 px, cabeçalho de 36 px e linhas de grupo. |
| 050 | iris | **Componente TasksListTable.** Novo `list/TasksListTable.tsx` com semântica de tabela, cabeçalho fixo e grupos como linhas de seção. |
| 051 | iris | **Linha de grupo.** Ícone circular por grupo (Atrasadas alerta vermelho, Hoje relógio âmbar, Amanhã/Próximas calendário, Sem prazo círculo, Concluídas check verde), contador e subtítulo de data em Hoje. |
| 052 | hugo | **Selector de grupos com datas.** Gerar os grupos e o subtítulo "Domingo, 11 de outubro" em pt-BR (`date-fns/ptBR`); reaproveitar `groupUpcomingByDay`. |
| 053 | iris | **Célula Tarefa.** Checkbox circular (conclui/reabre), título em uma linha com tooltip e subtítulo âmbar com o motivo quando Aguardando. |
| 054 | iris | **Célula Contato.** Avatar com iniciais e nome; "Sem contato" discreto; clique abre a conversa (`openContactChat`). |
| 055 | designer | **Cor das iniciais.** Paleta determinística (hash do id para um token existente) com contraste AA do texto, sem cor nova. |
| 056 | iris | **Célula Prioridade.** Pílulas: Urgente vermelho cheio, Alta vermelho contorno, Média âmbar, Baixa azul (`PriorityChip` ganha variante de tabela). |
| 057 | iris | **Célula Prazo.** Calendário + "Ontem, 17:00", "Hoje, 14:00", "Amanhã, 10:00" ou "13 out., 15:00"; vermelho se atrasada; tooltip com a data completa. |
| 058 | hugo | **Regra única de datas.** Função pura e testada (fuso local) usada em todos os modos (D21): com hora → "Ontem, 17:00", "Hoje, 14:00", "Amanhã, 10:00", "13 out., 15:00"; concluídas mostram só o dia ("Hoje", "Ontem", "09 out."); campos do painel e do modal usam "Hoje, 11/10" + hora separada; nunca "Seg, 09/09, 14:20" (variação da imagem 04). |
| 059 | iris | **Célula Lembrete.** Sino + "Hoje, 13:30" ou "Sem lembrete" em muted; clique abre o popover do lembrete (adiar e remover). |
| 060 | iris | **Célula Estado.** Pílulas A fazer, Fazendo, Aguardando, Caixa de entrada e Concluído; clique abre o menu de mover respeitando limite e motivo. |
| 061 | iris | **Menu ⋮ da linha.** Abrir, concluir/reabrir, mover para, adiar lembrete, remover lembrete, cancelar; reaproveitar `cardActions`. |
| 062 | iris | **Linha selecionada.** Fundo primary/10 e barra esquerda de 3 px; seleção por clique e teclado, sincronizada com o painel de detalhes. |
| 063 | iris | **Hover, foco e clique seguro.** Clicar na linha abre detalhes sem disparar checkbox, chips ou menu (propagação tratada). |
| 064 | iris | **Teclado da tabela.** ↑/↓ entre linhas, Enter abre, Espaço conclui, E edita, Delete cancela (atalhos atuais migrados). |
| 065 | iris | **Grupos recolhíveis.** Chevron e estado por grupo persistido em localStorage, com animação de altura (sem animação em movimento reduzido). |
| 066 | iris | **Concluídas e "Ver até 30 dias →".** Grupo "Concluídas · últimos 7 dias" com contador e o link que revela até 30 dias (hoje "ver mais (30 dias)"); linhas riscadas e em muted. |
| 067 | iris | **Estado inicial dos grupos.** Como na imagem 01: Atrasadas e Hoje abertos; Amanhã, Próximas e Sem prazo recolhidos mostrando só o contador; Concluídas recolhido com "Ver até 30 dias >" no próprio cabeçalho. A escolha do usuário (etapa 065) prevalece depois. (Substitui a ordenação por coluna, que não está em nenhuma imagem.) |
| 068 | hugo | **Contato com tipo e foto.** A query de `useMyWorkItems` traz só `id,name,phone,avatar_url`; o "Cliente" da Agenda (imagem 02) precisa de `contact_type`, que já existe em `contacts`. Acrescentar ao `select` e a `WorkItemContact`, sem banco novo, com teste. |
| 069 | iris | **Primitivos compartilhados e contexto da tela.** ANTES das superfícies: `TaskCheckbox` (círculo), `PriorityPill`, `StatusPill`, `DateLabel` e `ContactAvatar` (foto com iniciais de reserva) em `shared/`, uma implementação usada por Lista, Quadro, Agenda, painel e modal; e um `TasksUiContext` (seleção, painel, modal, densidade) para as superfícies não editarem `TasksModule.tsx` de novo. |
| 070 | iris | **Responsivo da tabela.** Abaixo de 1024 px vira lista de cartões compactos; em 360 px sem rolagem horizontal. |
| 071 | iris | **Esqueleto e vazios.** Esqueleto de tabela; grupo vazio some, como hoje. |
| 072 | iris | **Animações.** Entrada escalonada de até 40 ms por linha e saída de concluir com altura; tudo respeita movimento reduzido. |
| 073 | iris | **Aposentar a Lista antiga.** Manter `TasksListMode` como alternativa até o portão e removê-lo no fim, sem código morto. |
| 074 | workertestes | **Testes da tabela.** Colunas, grupos, subtítulos, células, estados, seleção, teclado e ordenação. |
| 075 | workertestes | **Acessibilidade da tabela.** Axe na tabela e no modo de cartões; ordem de foco. |
| 076 | workertestes | **Consistência das contagens.** Contador do grupo igual às linhas renderizadas e ao KPI correspondente. |
| 077 | designer | **Revisão visual da Lista.** Sobreposição lado a lado com a imagem 01, claro e escuro, ajustes finos. |
| 078 | Claude | **Portão da Lista.** Validar no navegador com a semente local (14 abertas) e comparar com a imagem 01. |

### Bloco E: Quadro (etapas 079–106)

_Quadro por estado, com limite visível e cartões ricos, como na imagem 05; imagem 03 como agrupamento opcional._

| Etapa | Dono | O que fazer |
|---|---|---|
| 079 | designer | **Especificar a coluna do Quadro.** Título, contador, subtítulo curto, largura de 300 a 340 px, fundo, cabeçalho fixo e rolagem interna. |
| 080 | iris | **Subtítulo nas colunas.** Caixa de entrada "A organizar", A fazer "Próximas ações", Fazendo "Conclua uma para iniciar outra", Aguardando "Dependências externas", Concluído "Últimos 7 dias"; a política longa vira tooltip. |
| 081 | hugo | **Subtítulo em KANBAN_COLUMNS.** Acrescentar `subtitle` curto mantendo a `policy` longa em `workItem.types.ts`, com testes. |
| 082 | iris | **Limite de Fazendo.** Contador "3/3", barra de progresso segmentada (vermelha/destrutiva quando cheia) e rodapé "Seu limite é de 3 tarefas em execução." com ícone de informação. |
| 083 | iris | **Limite cheio ao soltar.** Soltar em Fazendo cheio faz a coluna tremer curto (em movimento reduzido só a borda muda), mostra toast explicativo e devolve o cartão. |
| 084 | iris | **Card redesenhado.** Checkbox CIRCULAR (D16: só a imagem 05 usa quadrado), título em até 2 linhas, ⋮, pílula de prioridade, contato com avatar pequeno e nome (D18) e linha de prazo, com altura adaptativa. |
| 085 | iris | **Pílula Urgente ao lado do título.** Urgente em destaque junto ao título e a prioridade padrão abaixo (como no card "Enviar orçamento" da imagem 05). |
| 086 | iris | **Tag "Atrasada".** Ícone de alerta + texto no card com prazo vencido, ao lado do prazo em vermelho. |
| 087 | iris | **Prazo e lembrete no card.** "Hoje, 14:00" com calendário e lembrete com sino âmbar; no card em Fazendo/selecionado, os rótulos "Prazo" e "Lembrete" em duas colunas. |
| 088 | iris | **Descrição curta no card.** Até 2 linhas no card em Fazendo e no selecionado. |
| 089 | iris | **Chip de espera.** Em Aguardando, chip com ponto âmbar e o motivo curto, truncado com tooltip; prazo vermelho se atrasado. |
| 090 | iris | **Card selecionado.** Borda primary, fundo primary/10 e alça de arrastar ⠿; seleção e foco sincronizados com o painel de detalhes. |
| 091 | iris | **Cartão "Capturar tarefa".** Cartão tracejado no fim da Caixa de entrada ("Pressione Enter para criar") com o QuickAdd compacto. Só a Caixa de entrada captura (D19); o "+ Nova tarefa" em cada coluna da imagem 03 não entra. |
| 092 | iris | **Coluna Concluído.** Ícone de menu no cabeçalho, cartões com check verde e data, e "Ver até 30 dias →" no rodapé. |
| 093 | iris | **Toggle de concluídas e ícone ⁙ no Quadro.** O toggle "Concluídas" (imagem 05) mostra/oculta a coluna Concluído; o ícone ⁙ recolhe/expande a coluna. Sem "ordenar coluna": a posição manual e a ordem por data de conclusão do Concluído são decisões já declaradas em `docs/design/TAREFAS_QUADRO_STATUS.md`. |
| 094 | iris | **Polimento do arrastar.** Placeholder tracejado, overlay elevado (`--shadow-lg`), rolagem horizontal automática e encaixe animado; `resolveDragEnd` mantido. No toque, arrastar só com pressão longa (`pointerMedia` existente) para não brigar com a rolagem. |
| 095 | iris | **Alvo de soltura.** Coluna de destino com borda primary e dica "Solte para mover para Fazendo (2 de 3)". |
| 096 | iris | **Soltar em Aguardando.** Abre o painel pedindo o motivo (comportamento atual), com a coluna realçada em âmbar durante o arrasto. |
| 097 | iris | **Teclado do Quadro.** ←/→ entre colunas, ↑/↓ entre cartões, Alt+←/→ move o cartão, Enter abre; a narração "Movida para … (n de limite)" já existe e é preservada. |
| 098 | iris | **Rolagem horizontal.** Rolagem fluida com snap, sombra nas bordas e rolagem vertical interna por coluna. |
| 099 | iris | **Responsivo do Quadro.** Abaixo de 768 px uma coluna por vez com abas no topo; a partir de 1280 px as cinco colunas sem rolagem. |
| 100 | iris | **Faixa compacta e abas do Quadro.** Faixa compacta de KPIs (imagem 05) e estilo das abas conforme D3. |
| 101 | hugo | **Agrupar por prazo (opcional, D1).** Selector das colunas Atrasadas, Para hoje, Fazendo e Concluídas da imagem 03; somente leitura, sem arrastar nesse agrupamento. |
| 102 | iris | **Alternador de agrupamento (opcional, D1).** "Agrupar por: Estado | Prazo" no Quadro, persistido; arrastar desabilitado com dica no agrupamento por prazo. |
| 103 | iris | **Esqueleto e vazio por coluna.** Esqueletos e microcopy ("Nada aqui. Arraste uma tarefa ou capture acima"). |
| 104 | workertestes | **Testes do Quadro.** Subtítulos, 3/3 e rodapé, tag Atrasada, chip de espera, capturar, menu da coluna e recolher. |
| 105 | workertestes | **Testes de arrastar, teclado e acessibilidade.** Atualizar `resolveDragEnd`, limite cheio e motivo obrigatório. |
| 106 | Claude | **Portão do Quadro.** Validar no navegador (arrastar, limite, motivo) e comparar com a imagem 05. |

### Bloco F: Agenda (etapas 107–130)

_Agenda com faixa de 7 dias, seções do dia e painel de resumo, como na imagem 02._

| Etapa | Dono | O que fazer |
|---|---|---|
| 107 | designer | **Especificar a Agenda.** Duas colunas (lista do dia e painel "Resumo do dia" de ~340 px), faixa de 7 dias e legenda dos pontos. |
| 108 | iris | **Faixa de atrasadas.** Largura total em vermelho suave: "N tarefas atrasadas" e "Ver tarefas ⌄" que expande a lista (substitui o bloco atual). |
| 109 | iris | **Título da semana e nota.** "Próximos 7 dias" com "11 – 17 de outubro de 2026" à direita e a nota "O lembrete avisa você. O prazo marca a entrega." |
| 110 | iris | **Cartões de dia.** Sigla (DOM…SÁB), número e pílula "Hoje" no dia atual; selecionado com borda primary; ←/→ navegam. |
| 111 | iris | **Pontos com significado.** Azul = lembrete, âmbar = prazo, vermelho = atrasada, com legenda discreta e `aria-label` como "2 lembretes, 1 prazo". |
| 112 | hugo | **Contagens por tipo no dia.** `agendaDayDots` passa a devolver contagens por tipo (hoje só até 3 pontos), usadas no `aria-label` e no resumo. |
| 113 | iris | **Cabeçalho do dia.** "Hoje, 11 de outubro" (ou "Segunda, 12 de outubro"), "N tarefas com prazo · M lembretes" e o botão "+ Adicionar para hoje" (QuickAdd com o dia). |
| 114 | iris | **Seção ALARMES.** Sino, horário do lembrete à esquerda, checkbox, título, contato, prioridade, chip "Lembrete" com "Prazo hoje, 14:00" e estado. |
| 115 | iris | **Seção PRAZOS.** Horário do prazo à esquerda, checkbox, título, contato, prioridade, "Prazo hoje, 14:00" e estado, ordenadas por hora. |
| 116 | iris | **Seção SEM HORA.** "Nenhuma tarefa sem horário para hoje." com ícone tracejado; tarefas com prazo sem hora entram aqui. |
| 117 | hugo | **Regra das seções do dia.** Manter alarmes/prazos/sem hora, a mesma tarefa em ALARMES e PRAZOS quando tiver os dois (como na imagem) e as contagens "n tarefas com prazo · m lembretes" corretas. |
| 118 | iris | **Painel "Resumo do dia".** Dois mini-KPIs ("N Tarefas com prazo" e "M Lembretes") com a data do dia selecionado. |
| 119 | iris | **Painel "Tarefa selecionada".** Título, avatar + nome + "Cliente" + "Abrir conversa", chips "Alta prioridade" e estado, Prazo, Lembrete, Descrição (3 linhas) e "Abrir tarefa". |
| 120 | iris | **Painel sem seleção.** "Selecione uma tarefa para ver o resumo" e foco inicial na primeira linha. |
| 121 | iris | **Seleção sincronizada.** Clique ou teclado numa linha atualiza o painel sem abrir o drawer; "Abrir tarefa" abre o drawer. |
| 122 | iris | **Responsivo da Agenda.** Abaixo de 1280 px o painel vira seção abaixo da lista; abaixo de 768 px a faixa rola com snap; sem rolagem horizontal da página. |
| 123 | iris | **Dia selecionado na URL.** `?day=2026-10-12` e atalho `T` para voltar a hoje. |
| 124 | iris | **Foto do contato em todas as superfícies.** Imagens 02 e 04 mostram foto; 01 e 05 iniciais. Usar `avatar_url` quando existir e iniciais como reserva, pelo `ContactAvatar` da etapa 069. (Substitui o marcador de "agora", que não está nas imagens.) |
| 125 | iris | **Ações na linha.** Menu ⋮ e "Adiar" direto na linha de lembrete (15 min, 1 h, Amanhã 9h). |
| 126 | hugo | **Agenda só com dados já carregados.** Garantir que a Agenda use apenas os itens da query única (B13) e cubra 7 dias a partir de hoje; teste de borda da virada de dia. |
| 127 | iris | **Virada do dia.** O "Hoje" e as faixas atualizam à meia-noite sem recarregar. |
| 128 | workertestes | **Testes da Agenda.** Faixa, pontos, seções, resumo, tarefa selecionada, vazio e responsivo. |
| 129 | workertestes | **Testes de borda de data e fuso.** 23:59 para 00:00, horário de verão e UTC-3 para dia selecionado, lembretes e prazos. |
| 130 | Claude | **Portão da Agenda.** Validar no navegador com a semente local e comparar com a imagem 02. |

### Bloco G: Painel de detalhes (etapas 131–152)

_Drawer "Detalhes da tarefa" com estado de edição, como na imagem 03._

| Etapa | Dono | O que fazer |
|---|---|---|
| 131 | designer | **Especificar o painel.** Largura de 480 a 560 px, cabeçalho com ícone, expandir e fechar, badges, rodapé fixo com estado de edição. |
| 132 | iris | **Cabeçalho do painel.** Ícone calendário em quadrado primary, "Detalhes da tarefa" (hoje "Editar tarefa"), expandir e fechar. |
| 133 | iris | **Badges de estado e prioridade.** Estado atual (Aguardando âmbar) e prioridade (Alta vermelho) no topo, atualizando ao editar. |
| 134 | iris | **Título, Estado e Prioridade.** Input de título grande e Estado/Prioridade lado a lado como selects com ícone colorido; opções bloqueadas pelo limite com explicação. |
| 135 | iris | **Caixa "Motivo da espera".** Borda âmbar e selo "Obrigatório", só em Aguardando; erro inline se vazio; foco automático vindo do arrastar. |
| 136 | iris | **Contato vinculado.** Select com avatar e botão "Abrir conversa ↗" ao lado. |
| 137 | iris | **Seção Planejamento.** Dois cartões: Prazo ("Até quando concluir") e Lembrete ("Quando avisar você"), cada um com data e hora ("Hoje, 11/10" e "18:00"). |
| 138 | iris | **Validações visíveis.** Lembrete depois do prazo ou no passado avisa em âmbar/vermelho; antes do prazo mostra "Agendado" em verde. |
| 139 | iris | **Ações do lembrete.** Linha "✓ Agendado · Adiar ▾ · Remover" (15 min, 1 h, Amanhã 9h) ligada às mutations que já existem. |
| 140 | iris | **Descrição e data de criação.** Descrição redimensionável com contador e "Criada em 9 out. 2026" discreto. |
| 141 | iris | **Estado de edição.** Rodapé com ponto âmbar "Alterações não salvas" e "Ctrl+Enter para salvar"; quando limpo mostra "Tudo salvo". |
| 142 | iris | **Botões do rodapé.** "Concluir" (verde contorno), "Salvar alterações" (primary, desabilitado sem mudança) e menu ⋮ (reabrir, cancelar, copiar link interno da tarefa). |
| 143 | iris | **Proteção ao fechar.** Com alterações, "Descartar alterações?"; Esc e clique fora respeitam a proteção. |
| 144 | iris | **Foco e teclado do painel.** No painel não modal: F6 alterna entre painel e lista/quadro, Esc fecha e devolve o foco ao item; no bottom sheet o foco fica preso. Ordem de tab lógica. |
| 145 | iris | **Painel lateral não modal.** Hoje o `Sheet` é MODAL e escurece a tela; na imagem 03 o painel fica acoplado à direita, sem escurecer, com o Quadro visível e clicável (a 4ª coluna rola por baixo). Decisão D14: painel não modal no desktop (clicar em outro cartão troca a tarefa do painel) e bottom sheet modal abaixo de 768 px. |
| 146 | iris | **Modo expandido.** Painel com ~70% da largura para descrição ampla; escolha persistida. |
| 147 | iris | **URL da tarefa.** `?task=<id>` mantido e a mesma transição ao abrir por Agenda, Lista, Quadro e notificação. |
| 148 | hugo | **Rascunho do formulário.** Hook com controle de alterações, patch mínimo e aviso "Esta tarefa mudou" se houver atualização remota durante a edição (sem banco novo). |
| 149 | hugo | **Salvar com patch mínimo.** Respeitar limite e motivo (mover/atualizar atuais), com erro devolvendo o estado anterior e toast. |
| 150 | workertestes | **Testes do painel.** Campos, motivo obrigatório, validações de lembrete, Concluir, Salvar, estado de edição, descartar e Ctrl+Enter. |
| 151 | workertestes | **Acessibilidade do painel.** Foco, teclado e bottom sheet. |
| 152 | Claude | **Portão do painel.** Validar no navegador (editar, mover a Aguardando sem motivo, Concluir) e comparar com a imagem 03. |

### Bloco H: Modal Nova tarefa (etapas 153–174)

_Criação guiada com prévia ao vivo, como na imagem 04._

| Etapa | Dono | O que fazer |
|---|---|---|
| 153 | designer | **Especificar o modal.** Duas colunas (formulário de ~560 px e prévia de ~340 px), cabeçalho com ícone e subtítulo, rodapé com dica. |
| 154 | iris | **Componente NewTaskDialog.** `NewTaskDialog.tsx` (Dialog do projeto) aberto pelo botão do cabeçalho, pelo atalho `N` e pelo menu das colunas; carregado sob demanda. |
| 155 | iris | **Título e subtítulo.** "Nova tarefa" e "Capture agora. Organize o próximo passo." com fechar; foco inicial no título. |
| 156 | iris | **Campo Título da tarefa.** Obrigatório, 200 caracteres, contador discreto e erro inline. |
| 157 | iris | **Campo Contato.** Combobox com avatar e "Sem contato"; pré-preenchido quando aberto a partir de um contato. |
| 158 | iris | **Prioridade segmentada.** Baixa, Média (padrão), Alta, Urgente com setas e cores por token. |
| 159 | iris | **Prazo.** "Prazo — Até quando concluir" com data, hora e atalhos Hoje, Amanhã e Próx. semana; permite limpar. |
| 160 | iris | **Lembrete.** "Lembrete — Quando você quer ser avisado" com data, hora e atalhos Em 1h, Amanhã, 9h e Próx. seg., 9h. |
| 161 | hugo | **Funções de presets.** Presets de prazo e lembrete no fuso local (hoje, amanhã, próxima semana, em 1 h, amanhã 9h, próxima segunda 9h), reaproveitando `tomorrowAtNine`, com testes. |
| 162 | hugo | **Coerência prazo × lembrete.** Função que devolve o estado (ok, depois do prazo, no passado, sem prazo) e a mensagem; lembrete deve estar no futuro e antes do prazo. |
| 163 | iris | **Mensagens de coerência.** "Lembrete programado para antes do prazo." em verde e avisos âmbar/vermelho nos outros casos, com "Ajustar para 1 h antes do prazo". |
| 164 | iris | **Destino da tarefa.** "A tarefa será criada na Caixa de entrada." com ícone, fixo conforme D10. |
| 165 | iris | **Prévia da tarefa.** "Confira antes de criar." com cartão vivo (título, prioridade, contato, prazo, lembrete e destino), reaproveitando `WorkItemCard` em modo prévia. |
| 166 | iris | **Caixa informativa.** "Prazo é a entrega. Lembrete é o aviso. O prazo define quando a tarefa deve ser concluída e o lembrete avisa antes." |
| 167 | iris | **Rodapé do modal.** Dica "Enter para criar", "Cancelar" e "+ Criar tarefa"; Enter no título cria, Ctrl+Enter em qualquer campo, Esc cancela. |
| 168 | iris | **Criação otimista.** Fecha o modal, o item aparece na Caixa de entrada com realce e um toast "Tarefa criada" com "Desfazer"; narração para leitor de tela. |
| 169 | iris | **Responsivo do modal.** Abaixo de 900 px a prévia vira acordeão sob o formulário; em 360 px o rodapé fica fixo; sem rolagem horizontal. |
| 170 | iris | **Cor da prioridade e descarte no modal.** Na imagem 04 a pílula "Média" da prévia é azul; Lista e Quadro usam âmbar. Decisão D12: a pílula de prioridade usa SEMPRE a cor da prioridade via `PriorityPill`; só o segmento selecionado do controle usa primary. Fechar o modal com título digitado pede confirmação. |
| 171 | iris | **"Mais opções…" no QuickAdd.** Abre o modal pré-preenchido com o texto digitado. |
| 172 | workertestes | **Testes do modal.** Campos, presets, coerência prazo × lembrete, prévia, criar, cancelar, descarte, teclado e pré-preenchimento. |
| 173 | workertestes | **Acessibilidade do modal.** Axe, foco preso, retorno do foco, anúncio e movimento reduzido. |
| 174 | Claude | **Portão do modal.** Criar tarefa no navegador, conferir na Caixa de entrada, Lista e Agenda, e comparar com a imagem 04. |

### Bloco I: Lembretes e consistência de texto (etapas 175–180)

_Prazo é a entrega, lembrete é o aviso: um vocabulário só em toda a tela._

| Etapa | Dono | O que fazer |
|---|---|---|
| 175 | iris | **Vocabulário único.** "Lembrete" (e não "Alarme") e "Prazo" em rótulos, tooltips, aria-labels e testes, com glossário em `docs/tarefas/`. |
| 176 | hugo | **Auditoria de notificações (somente leitura).** Conferir `notify_due_tasks` e `useWorkItemNotifications` contra os novos fluxos (lembrete antes do prazo; adiar rearma `notified_at`) e relatar; sem banco novo. |
| 177 | iris | **Toast de lembrete.** Notificação `reminder_due` com as mesmas ações (Abrir, Contato, Adiar, Concluir) no novo visual e no vocabulário novo. |
| 178 | iris | **Indicadores de lembrete.** Sino cheio quando programado, riscado quando disparado e ainda aberta, âmbar quando faltam menos de 30 minutos. |
| 179 | iris | **Badge "Tarefas n" no menu.** O número hoje é atrasadas + lembretes disparados e não tratados (`useMyWorkItemsBadgeInfo`); o "4" das imagens 03/04 é ilustrativo. Decisão D17: manter a regra; conferir cor (warning/destructive) e texto acessível. |
| 180 | workertestes | **Testes de vocabulário e indicadores.** Nenhum "Alarme" visível ao usuário, indicadores de lembrete e badge do menu. |

### Bloco J: Acessibilidade, teclado e desempenho (etapas 181–188)

_Qualidade transversal nos cinco recortes de tela._

| Etapa | Dono | O que fazer |
|---|---|---|
| 181 | iris | **Atalhos novos sem conflito.** Registrar `N` (nova tarefa), `/` (buscar), `T` (hoje na Agenda) e setas no registry global, depois de auditar conflito com os atalhos globais e de outras telas; listar na ajuda de atalhos do módulo. |
| 182 | iris | **Região viva estendida.** Anunciar criar pelo modal, salvar pelo painel e mover por teclado. |
| 183 | designer | **Auditoria de contraste AA.** Todas as pílulas, KPIs, linhas selecionadas e chips nos dois temas e nas skins; correções só com tokens. |
| 184 | iris | **Movimento reduzido.** Todo efeito novo (mola do KPI, tremor do limite, entrada do modal, marcador de agora) respeita `useReducedMotion`; um teste por modo. |
| 185 | hugo | **Memoização dos selectors.** Referências estáveis em `bucketByDue`, `bucketByStatus`, `kpis` e agenda; nenhuma consulta nova ao trocar de modo (B13 preservado). |
| 186 | iris | **Carga sob demanda, virtualização e bundle.** Modal, painel e Agenda carregados sob demanda; tabela virtualizada acima de 150 linhas com `@tanstack/react-virtual` (já no projeto); chunk medido contra o teto da etapa 011. |
| 187 | workertestes | **Desempenho de renderização.** Com 500 tarefas, montar Lista e Quadro dentro do orçamento definido. |
| 188 | workertestes | **Varredura axe geral.** Todas as telas e estados (Lista, Quadro, Agenda, painel, modal) em claro e escuro. |

### Bloco K: Testes de ponta a ponta e visual (etapas 189–194)

_Rede de segurança do conjunto._

| Etapa | Dono | O que fazer |
|---|---|---|
| 189 | workertestes | **E2E do fluxo principal.** Capturar, abrir o modal, criar, mover com limite, motivo de espera, concluir, lembrete e Agenda. |
| 190 | workertestes | **E2E só com teclado.** Navegar, criar, mover, concluir e salvar sem mouse. |
| 191 | workertestes | **Regressão visual.** Capturas de Lista, Quadro, Agenda, painel e modal (claro/escuro; 360/768/1280) contra a linha de base e as 5 imagens, com limiar documentado. |
| 192 | workertestes | **E2E responsivo.** 360, 768 e 1280 px sem rolagem horizontal em todos os modos. |
| 193 | workertestes | **Integração com consumidores.** CRM 360 (aba Tarefas), Journey (`mappers`) e notificações: nada regride em `conversation_tasks`. |
| 194 | workertestes | **Teste da semente.** A semente local reproduz os KPIs das imagens (2/4/3/5/1,4 dias) e o teste confirma a tela. |

### Bloco L: Portões e entrega (etapas 195–200)

_Validação do Claude, escopo e relatório._

| Etapa | Dono | O que fazer |
|---|---|---|
| 195 | Claude | **Portão de código.** Grep final (nenhum texto antigo, nenhum "Alarme", nenhuma cor literal, nenhum componente morto), tsc e lint com ratchet, testes do módulo e do projeto. |
| 196 | Claude | **Portão de escopo.** 0 migrations, 0 Edge Functions, 0 dependências novas (`git diff --stat` do lote) e bundle dentro do teto. |
| 197 | Claude | **Portão visual.** Capturas finais contra as 5 imagens, tabela das diferenças aceitas e itens fora do escopo (shell e rodapé "Dados ilustrativos"). |
| 198 | Claude | **Validação cartão a cartão.** No código da branch viva (importado e renderizado, não só no relato) e na fila do integrador; reabrir refazers quando preciso. |
| 199 | worker | **Documentação final.** `docs/tarefas/`: guia do módulo, glossário prazo × lembrete, atalhos, decisões D1 a D12 e o que ficou fora; atualizar o inventário. |
| 200 | Claude | **Relatório final e promoção por bloco.** Cartão a cartão (feito, aceito com diferença, fora do escopo) e preparo do lote (squash é do Joaquim). Promover só blocos inteiros (D15): nunca KPI novo com Lista velha em produção; reversão = revert do squash. |

## 8-bis. Alinhamento com as decisões já vigentes do módulo

Fonte: `docs/design/TAREFAS_QUADRO_STATUS.md` (856 linhas, auditorias de 29/09 a 09/10). Este plano **não revoga** nada disto:

| Decisão vigente | Como o plano respeita |
|---|---|
| G-5 Sem parser de linguagem natural | Etapa 041 mantém só os atalhos 1/2 e `!` |
| G-6 WIP Fazendo = 3 (duro), Aguardando = 5 (suave) | Etapas 019, 082, 083 só mostram melhor o que já é regra |
| G-7 Push só se a infraestrutura existir | Fora do escopo (seção 4) |
| G-8 Concluídas por 7 dias | KPIs, Lista, Quadro; 30 dias atrás de "Ver até 30 dias" |
| B13 Uma query só para os três modos | Etapas 126 e 185; nenhuma etapa cria consulta nova (a 068 só amplia o `select` existente) |
| "Sem hora" = prazo gravado só com o dia (meia-noite local) | Etapas 116 e 117 |
| Concluído do Quadro ordenado por data de conclusão; concluída sem `completed_at` fica na janela recente | Etapa 093 não cria "ordenar coluna" |
| Coluna Fazendo cheia: entra de fora bloqueado, reordenar por dentro liberado (B8) | Etapas 082, 083 e 095 |
| Filtro é recorte de TELA; KPI e cabeçalho mostram o trabalho real (Fase F) | Clicar no KPI filtra a lista, mas o número do KPI continua real (etapas 023, 076) |

## 9. Cartões propostos (não criados)

Cada cartão agrupa etapas do mesmo perfil e dos mesmos arquivos. A ordem protege `TasksModule.tsx`. Ao criar, usar `hermes-cartao-criar` e o roteador (`rotear.py`); dependência pai → filho com a instrução de `cherry-pick` do pai não integrado.

| Cartão | Perfil | Etapas | Arquivos principais | Depende de |
|---|---|---|---|---|
| T01 | `designer` | 005, 006, 010, 016, 031, 049, 079, 107, 131, 153 | `docs/tarefas/ESPECIFICACOES.md` (inclui o tema claro) | – |
| T02 | `workertestes` | 003, 004, 009 | `scripts/` (semente local) e capturas de linha de base | – |
| T03 | `hugo` | 008, 021, 052, 112, 117, 126 | `hooks/tasks/workItemAggregates.ts` + testes | – |
| T04 | `hugo` | 058, 161, 162 | novos `hooks/tasks/workItemFormat.ts` e `workItemPresets.ts` + testes | – |
| T05 | `hugo` | 024, 037, 041, 081 | `useTasksFilters.ts`, `workItemFilters.ts`, `workItem.types.ts` + testes | `t_a9419fa8` integrado |
| T06 | `hugo` | 068 | `useMyWorkItems.ts` (`select` do contato) + teste | – |
| T07 | `hugo` | 148, 149 | novos hooks de rascunho e salvar + testes | T04 |
| T08 | `hugo` | 101 | selector "agrupar por prazo" (opcional, D1) + teste | T03 |
| T09 | `hugo` | 176 | relatório de leitura das notificações (sem código) | – |
| T10 | `hugo` | 185 | memoização dos selectors + teste | T03 |
| T11 | `iris` | 069, 124 | `shared/` primitivos + `TasksUiContext` + testes | T04, T06 |
| T12 | `iris` | 017–020, 022 | `shared/TasksKpiStrip.tsx` (cards) + testes | T03, T11 |
| T13 | `iris` | 023, 025–028 | KPI: clique, faixa compacta, responsivo, esqueleto, mola + testes | T05, T12 |
| T14 | `iris` | 013–015 | cabeçalho em `TasksModule.tsx` + testes | T11 |
| T15 | `iris` | 032–036, 038–039 | `ModeSwitcher.tsx`, `TasksFilterBar.tsx` + testes | T05, T14 |
| T16 | `iris` | 040, 042–045 | `QuickAdd.tsx`, disposição da barra, vazios + testes | T15 |
| T17 | `iris` | 050–051, 053–054 | `list/TasksListTable.tsx`: estrutura, grupos, tarefa, contato + testes | T03, T11, T16 |
| T18 | `iris` | 056–057, 059–060 | células de prioridade, prazo, lembrete, estado + testes | T17 |
| T19 | `iris` | 061–064 | menu, seleção, clique seguro, teclado da tabela + testes | T18 |
| T20 | `iris` | 065–067, 070–073 | grupos, concluídas, estado inicial, responsivo, aposentar lista antiga + testes | T19 |
| T21 | `iris` | 080, 082–083 | colunas e limite do Quadro + testes | T05, T11, T16 |
| T22 | `iris` | 084–090 | cartão do Quadro + testes | T21 |
| T23 | `iris` | 091–093, 103 | captura, Concluído, toggle, vazios + testes | T22 |
| T24 | `iris` | 094–098 | arrastar, alvo, Aguardando, teclado, rolagem + testes | T23 |
| T25 | `iris` | 099–100 | Quadro responsivo e faixa/abas + testes | T24, T13 |
| T26 | `iris` | 102 | alternador "agrupar por" (opcional, D1) + teste | T08, T25 |
| T27 | `iris` | 108–111 | Agenda: atrasadas, semana, dias, pontos + testes | T03, T11, T16 |
| T28 | `iris` | 113–116, 125 | Agenda: cabeçalho do dia e seções + testes | T27 |
| T29 | `iris` | 118–121 | Agenda: Resumo do dia e tarefa selecionada + testes | T06, T28 |
| T30 | `iris` | 122–123, 127 | Agenda: responsivo, dia na URL, virada do dia + testes | T29 |
| T31 | `iris` | 132–136 | painel: cabeçalho, badges, campos, motivo, contato + testes | T07, T11 |
| T32 | `iris` | 137–140 | painel: planejamento, validações, lembrete, descrição + testes | T31 |
| T33 | `iris` | 141–144 | painel: estado de edição, rodapé, proteção, foco + testes | T32 |
| T34 | `iris` | 145–147 | painel não modal, expandido, URL + testes | T33 |
| T35 | `iris` | 154–158 | modal: componente, cabeçalho, título, contato, prioridade + testes | T04, T11, T14 |
| T36 | `iris` | 159–160, 163–164 | modal: prazo, lembrete, coerência, destino + testes | T35 |
| T37 | `iris` | 165–168 | modal: prévia, informação, rodapé, criação otimista + testes | T36 |
| T38 | `iris` | 169–171 | modal: responsivo, cor da prioridade, "Mais opções" + testes | T37 |
| T39 | `iris` | 175, 177–179 | vocabulário "Lembrete", toast, indicadores, badge + testes | T20, T25, T30, T34, T38 |
| T40 | `iris` | 181, 182, 184, 186 | atalhos, região viva, movimento, carga sob demanda + testes | T39 |
| T41 | `designer` | 048, 055, 077, 183 | revisões visuais e auditoria de contraste | T16, T20, T25, T30 |
| T42 | `workertestes` | 029, 030, 046, 047 | testes de integração de KPIs e barra | T13, T16 |
| T43 | `workertestes` | 074–076 | testes de integração e acessibilidade da tabela | T20 |
| T44 | `workertestes` | 104, 105 | testes de integração do Quadro | T25 |
| T45 | `workertestes` | 128, 129 | testes de borda de data e fuso da Agenda | T30 |
| T46 | `workertestes` | 150, 151, 172, 173 | testes de integração do painel e do modal | T34, T38 |
| T47 | `workertestes` | 180, 187, 188 | vocabulário, desempenho e axe geral | T40 |
| T48 | `workertestes` | 189–194 | e2e, regressão visual, responsivo, consumidores, semente | T40, T41 |
| T49 | `worker` | 012, 199 | documentação (início e final) | T01; T48 |

Etapas do Claude (decisões 001, 002, 007, 011 e portões 078, 106, 130, 152, 174, 195 a 198 e 200) **não viram cartão**: são coordenação e validação.
**Regra da v2:** todo cartão de interface (iris) ou dados (hugo) traz os **próprios testes unitários** no critério de pronto (o revisor recusa entrega sem teste, como recusou o B1 em 11/10). Os cartões de `workertestes` ficam com integração, acessibilidade, e2e e regressão visual.
**Tamanho:** nenhum cartão de código passa de 7 etapas (só o T01, de especificação, junta as 10 especificações num documento); nenhum cartão de interface atravessa camadas; `TasksModule.tsx` só é tocado por T14 (o resto usa o `TasksUiContext` de T11).

## 10. Riscos

| Risco | Mitigação |
|---|---|
| `TasksModule.tsx` é tocado por KPIs, barra, modos e painel: conflito entre cartões. | T06 → T07 encadeados e depois só `list/`, `board/`, `agenda/` e `shared/` separados; nenhum cartão paralelo no contêiner. |
| Cartão `done` não é código integrado: os filhos podem começar sem o commit do pai. | Todo cartão filho carrega a instrução de `cherry-pick` da faixa do pai (aprendida nesta operação). |
| 20 testes existentes dependem do visual atual. | Etapa 009 mapeia; cada cartão atualiza os seus testes e não deixa vermelho. |
| As imagens são só modo escuro e têm incoerências entre si. | Decisões D1 a D12 e etapas 183 e 191 (claro, escuro e skins). |
| Teto do bundle do repositório. | Etapas 011, 186 e 196 (medir, carregar sob demanda, portão). |
| Revisor automático recusa por relato ou padrão sensível. | Cartões com critério de pronto objetivo e relato com a lista de testes e a origem dos commits. |
| Fila do integrador longa (centenas de entregas). | Planejar em ondas e validar por conteúdo da branch viva, não só pelo estado do cartão. |
| Cartão em voo no mesmo arquivo (`t_a9419fa8`, filtros). | T05 depende dele estar integrado (etapa 009). |
| Commit direto na branch do dia é descartado quando o integrador a reconstrói (aconteceu com a v1 deste plano em 11/10). | Documentos e código só entram pela fila (`hermes-tarefa-iniciar` → `hermes-tarefa-fechar`). |
| Painel não modal (D14) muda o contrato de foco e de acessibilidade do `Sheet`. | Etapas 144, 145 e 151 com teste de foco; bottom sheet modal no celular. |
| Trocar a métrica do tempo médio (D13) muda um número que o usuário já vê. | Nota no relatório final e teste que prova a troca; veto possível. |
| Capacidade: 124 etapas de interface num perfil só (iris, até 6 em paralelo). | Cartões pequenos e encadeados; a ordem libera Lista, Quadro, Agenda, painel e modal em paralelo depois de T11 e T16. |

## 11. Como validar no fim

1. **Código:** cada cartão no código da branch viva (importado e renderizado), sem texto antigo, sem "Alarme", sem cor literal; migrations, Edge Functions e dependências em zero.
2. **Testes:** módulo, e2e e axe verdes; contraste AA nos dois temas.
3. **Visual:** capturas reais de Lista, Quadro, Agenda, painel e modal em 360, 768 e 1280 px (claro e escuro) contra as 5 imagens, com a tabela das diferenças aceitas.
4. **Fila:** estado `integrado` de cada entrega; os refazers resolvidos.
5. **Relatório ao Joaquim**, cartão a cartão: feito, aceito com diferença ou fora do escopo.

## 12. Próximo passo

Aguardar o OK do Joaquim (ou vetos às decisões D1 a D21; as que mais mudam o resultado são D1, D13 e D14) e então criar os cartões da seção 9 em ondas, sempre por `hermes-cartao-criar`:

1. **Onda 1 (sem arquivos em comum):** T01 a T04, T06, T09 e T10; T05 assim que `t_a9419fa8` for integrado.
2. **Onda 2:** T07, T08 e T11 (primitivos e contexto), depois T12 e T14.
3. **Onda 3:** T13, T15 e T16 (KPIs, barra e captura).
4. **Onda 4 (em paralelo):** Lista T17 → T20, Quadro T21 → T25, Agenda T27 → T30, painel T31 → T34 e modal T35 → T38.
5. **Onda 5:** T26 (opcional), T39, T40, T41 e os testes T42 a T48; por fim T49 e os portões do Claude.

## 13. O que mudou da v1 para a v2 (falhas e lacunas achadas)

Revisão adversarial feita em 11/10/2026 sobre a v1 (commit `d9dc97550`), conferindo cada premissa no código e relendo as 5 imagens elemento por elemento.

| # | Falha ou lacuna da v1 | Evidência | Correção na v2 |
|---|---|---|---|
| 1 | O rótulo do tempo médio ("Da criação à conclusão") não correspondia ao cálculo | `kpis()` usa `started_at` → `completed_at` (tempo de ciclo) | D13 e etapa 021 |
| 2 | O painel foi tratado como o `Sheet` atual, que é modal | `components/ui/sheet.tsx` renderiza `SheetOverlay`; imagem 03 sem fundo escurecido | D14, etapas 144 e 145 |
| 3 | "Cliente" no painel da Agenda sem dado | query traz só `id,name,phone,avatar_url`; `contacts.contact_type` existe | etapa 068 |
| 4 | Fotos das imagens 02 e 04 ignoradas (só iniciais) | `avatar_url` já vem na query | etapa 124 |
| 5 | Decisões vigentes do módulo não citadas | `docs/design/TAREFAS_QUADRO_STATUS.md` (G-1 a G-8, B13, decisões declaradas) | seção 8-bis |
| 6 | "Ordenar coluna" no Quadro contrariava a posição manual e a ordem por conclusão | decisão declarada da etapa 51 do STATUS | etapa 093 |
| 7 | Cartão em voo no mesmo arquivo não considerado | `t_a9419fa8` (filtros na URL) | etapa 009, T05 |
| 8 | Cartões grandes demais (até 24 etapas) | histórico de recusa por "diff maior que o título" e bloqueios por escopo | 49 cartões; os de código com até 7 etapas |
| 9 | Testes separados em cartões tardios | recusa do B1 em 11/10 por falta de teste | teste próprio em cada cartão |
| 10 | Quatro implementações paralelas de pílula/data/avatar | Lista, Quadro, Agenda, painel e modal desenhados à parte | etapa 069 (primitivos) |
| 11 | `TasksModule.tsx` tocado por muitos cartões | arquivo de 372 linhas no centro de tudo | `TasksUiContext` (069) e só T14 no contêiner |
| 12 | Tema claro não especificado | as 5 imagens são só do tema escuro | etapa 005 |
| 13 | Orçamentos sem número | etapas 011, 187 e 191 diziam "orçamento definido" | etapa 011 com números |
| 14 | Semente sem carimbo de datas nem usuário de teste | o tempo médio de 1,4 dia depende das datas | etapa 004 |
| 15 | Grupos recolhidos da imagem 01 não vistos | Amanhã, Próximas e Sem prazo mostram só o contador | etapa 067 |
| 16 | Disposição da barra (toggle na linha da captura; filtros recolhidos no Quadro) | imagens 01, 02 e 05 | etapa 044 |
| 17 | Incoerências de checkbox, cor de "Média", contato, captura no Quadro e datas | comparação entre as 5 imagens | D12, D16, D18, D19, D21 |
| 18 | Arrastar no toque não tratado | `shared/pointerMedia.ts` existe | etapa 094 |
| 19 | Atalhos novos sem checagem de conflito | registry global de atalhos | etapa 181 |
| 20 | Promoção parcial poderia levar meia tela nova para produção | entrega incremental sem flag | D15, etapa 200 |
| 21 | Etapas fora das imagens ocupavam o lugar de lacunas reais | ordenação por coluna, marcador de "agora", rascunho na sessão | etapas 067, 124 e 170 trocadas |
| 22 | A v1 foi commitada direto na branch do dia e o integrador a descartou ao reconstruir a branch | `git branch --contains d9dc97550` vazio | v2 entregue pela fila (`hermes-tarefa-fechar`) |
