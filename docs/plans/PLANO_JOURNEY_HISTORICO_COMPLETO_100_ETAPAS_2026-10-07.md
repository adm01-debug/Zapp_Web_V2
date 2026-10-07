# PLANO — JOURNEY (HISTÓRICO DA CONVERSA) COMPLETO: E-MAIL, TELEFONE, TAREFAS, NOTAS, TRANSFERÊNCIAS, FILTRO DE PERÍODO E USUÁRIO, ESTATÍSTICAS E CLIQUE NO EPISÓDIO — 100 ETAPAS

> **Data:** 2026-10-07 · **Escopo:** front-end (sem DDL, sem Edge Function, sem migration, sem dependência nova na 1ª fase).
> **Pedido do dono (com prints):** a aba **Journey** é o **Histórico** do mockup. Trazer para ela as interações por **e-mail** e **telefone**, e também **tarefas, notas e transferências entre usuários**; o campo **Período** usar o **mesmo calendário da aba IA**; **manter o filtro por tipo** e **acrescentar o filtro por usuário** (ex.: ver só o que "Maria" falou); **upgrade nas "Estatísticas do contato"** com mais informações, design melhor e efeitos; clicar num episódio da timeline **abre exatamente aquele episódio**; **cada categoria com uma cor** e a **foto de quem interagiu**.
> Este documento é plano; nenhuma linha de código de produto foi alterada ao escrevê-lo.

## 1. Mockup × hoje (dia/2026-10-07)
| Mockup (Histórico) | Hoje (Journey) | Lacuna |
|---|---|---|
| Título "Histórico da Conversa" + "Exportar histórico" | "Journey — estatísticas e toda a jornada…" sem exportar | **NÃO implementar a exportação** (decisão do dono: nenhuma informação sai do sistema); título fica "Journey" |
| Período com calendário | `Select` fixo: 7 / 30 / 90 dias / Tudo (`PERIOD_OPTIONS`) | usar o `PeriodFilterSelector` da IA (atalhos + De/Até) |
| Tipo de evento | `Select` com Todos, Mensagens, Notas, Tarefas, Transferências, Arquivos, Propostas | manter; incluir **E-mail** e **Telefone**; **filtro novo por usuário** |
| 4 cartões com ícone colorido e tendência (+62 %, "mais rápido que a média") | 2 faixas: `ContactStatsStrip` (mensagens, tempo médio, atendimentos, CSAT) e `KpiStrip` (total, último contato, tempo médio, resoluções); texto cortado ("Tempo médio de respos…") | uma área só, mais dados, tendência, efeitos |
| Timeline: ícone **colorido por categoria**, detalhe (ex.: "De: Ana Souza · Para: Admin 01", "Duração 03:12", nome e tamanho do arquivo, texto da tarefa, nº da proposta), selo de status | ícone cinza/azul, título e 1 linha; "Arquivo enviado" sem nome; "Atribuição" sem de/para; "Conversa encerrada" sem motivo | detalhes + cor + selo |
| Quem interagiu | nada | **foto + nome** do autor (reusa `SenderAvatar` do cartão R02) |
| Clique no episódio | nada acontece | abrir o episódio certo |

## 2. O que foi VERIFICADO no código (por que falta)
- Aba: `ConversationTabs.tsx` (`id: 'history'`, rótulo **Journey**) → `JourneyTab.tsx` (193 linhas) → `useConversationHistoryTimeline.ts` (344 linhas).
- **Fontes lidas hoje:** `messages` (limite 500), `conversation_events` (limite 200), `contact_notes`, `conversation_tasks`, `sales_deals` e `deal_activities`. **Não há** fonte de **ligações** (`calls`) nem de **e-mail** (`email_threads`/`email_messages`).
- **Colunas de autor existem e não são lidas:** `contact_notes.author_id`; `conversation_tasks.created_by`/`assigned_to`; `conversation_events.performed_by`/`from_agent_id`/`to_agent_id`/`from_queue_id`/`to_queue_id`; `deal_activities.performed_by`; `sales_deals.assigned_to`; `messages.agent_id`; `calls.agent_id`; `email_threads.assigned_to`. A consulta de eventos seleciona só `id, event_type, created_at`, por isso a transferência perde o "De/Para" (o código já sabe montá-lo).
- **`calls`** tem direção, status, `duration_seconds`, `talk_seconds`, `answered_by`, `end_reason`, `recording_url`; **`email_messages`** tem `direction`, assunto, trecho, `from_name`.
- **Defeitos visíveis:** (1) datas saem "2 **De** Outubro **De** 2026": a classe `capitalize` do rótulo do dia (`JourneyTab.tsx:138`) põe "De" em maiúscula; (2) mensagem de **localização** aparece como **JSON bruto** (o subtítulo é `truncate(content)`); (3) evento de arquivo sem nome; (4) estatísticas duplicadas e cortadas; (5) `TimelineEvent` não tem autor nem destino.
- **Já existe:** `ChatMessagesArea.scrollToMessage(id)` (saltar a uma mensagem do chat), abas Tarefas/Notas/Arquivos/CRM 360° para receber o foco, `MediaPreviewDialog`, `RecordingPlayer` (gravação de chamada), `SenderAvatar` + identidade de autor (cartões R01/R02), `PeriodFilterSelector` (IA), `useDownloadPermission`.

## 3. Decisões (o dono pode reverter)
- **D01.** Fases sem DDL: consultas do navegador por período e página; uma RPC no banco só com aprovação do dono (regra de banco canônico).
- **D02 (REVISADA pelo dono em 07/10: manter as cores atuais do sistema).** **Categorias e cores:** SÓ os tokens que o sistema já tem (`primary`, `success`, `warning`, `info`, `destructive`, `muted` e o violeta existente), **sem cor nova** e sem mexer em `tailwind.config.ts`/`index.css`. Mapa: Mensagens `primary`; E-mail `info`; Telefone `success`; Notas violeta existente; Tarefas `warning`; Transferências, Atribuições e Propostas `success` (como hoje); Arquivos e Encerramento `muted`/`success` (como hoje). Há menos cores do que categorias, então algumas **compartilham** a cor: ícone, rótulo, selo e a **foto de quem agiu** sempre acompanham a cor (nunca a cor sozinha). A paleta nova proposta antes (laranja, rosa, turquesa) foi **descartada**.
- **D03 (reforçada em 07/10: ações da IA/robô entram como "Sistema").** **Quem interagiu:** foto + nome; Cliente = foto do contato; atendente = foto dele; "Você" quando for o logado; automação/sistema = "Sistema" com ícone. **Sem selo de canal/origem** (mesma decisão do cartão de arquivo).
- **D04.** **Período:** o seletor da IA (atalhos Hoje, 3/7/14/30/90 dias, Qualquer data, calendário De/Até); padrão **Últimos 30 dias**; "Última interação" fica de fora.
- **D05.** **Filtro de tipo** mantido (lista estendida); **filtro de usuário** novo, **de seleção MÚLTIPLA** (decidido pelo dono em 07/10): caixas de marcar com "Todos", "Cliente" e cada pessoa que aparece no histórico (com foto e contagem); marcar várias mostra os eventos de qualquer uma delas; nenhuma marcada = todos.
- **D06.** **Agrupar** mensagens seguidas do mesmo autor (até 10 min) como hoje ("7 mensagens recebidas"), com expandir no próprio cartão; e-mails da mesma conversa também.
- **D07.** **Textos seguros:** localização = "Localização: nome — endereço"; áudio = "Áudio (0:15)"; arquivo = nome + tipo + tamanho; contato/sticker/enquete com rótulo próprio; nunca JSON cru.
- **D08.** Datas em português correto ("Hoje, 7 de outubro de 2026"), fuso do navegador.
- **D09.** **Estatísticas:** uma área só: bloco "Do contato" (independe do período) e bloco "No período" com **tendência** contra o período anterior.
- **D10.** **Clique:** mensagem → aba Chat na mensagem; e-mail → módulo E-mail na conversa (parâmetro `emailThread`, já existe); ligação → detalhe com gravação/duração; nota → aba Notas; tarefa → aba Tarefas; arquivo → pré-visualização; proposta → aba SalesView; transferência/atribuição/encerramento → painel de detalhes do evento.
- **D11 (DECIDIDA pelo dono em 07/10).** **NÃO existe "Exportar histórico"**: nenhuma informação pode sair do sistema. O Journey não terá botão de exportar, baixar, copiar tudo, imprimir nem compartilhar a timeline; também não há menu ⋮ de exportação.
- **D12 (AMPLIADA em 07/10: efeitos sutis e modernos nas interações).** Só CSS/Tailwind `motion-safe:` e `framer-motion` (já usado no projeto), tudo **desligado em "reduzir movimento"**, sem biblioteca nova, aba ainda carregada sob demanda. Efeitos: (1) cartão com elevação leve, brilho de borda na cor do token e "afundar" ao pressionar; (2) setinha "abrir" que aparece no hover/foco (sinal de que o clique abre o episódio); (3) entrada em fade + deslize de 8 px, escalonada (teto de 8 itens); (4) expandir/recolher mensagens agrupadas com altura animada; (5) **realce de chegada** (pulso de 1,5 s) no episódio de destino ao clicar; (6) contagem animada nos números e traço do gráfico desenhando; (7) esqueleto com brilho na carga. Nada gira, quica ou passa de 400 ms; o clique funciona durante a animação. Peças reutilizáveis no cartão **J05**.

## 4. As 100 etapas
**A. Provas e diagnóstico (S001–S008)** [Claude] S001 inventário das fontes e colunas ✔ · S002 reproduzir o "De" maiúsculo ✔ · S003 reproduzir o JSON da localização ✔ · S004 medir o limite de 500 mensagens/200 eventos com contato antigo · S005 conferir a conversa de teste da base local (semear ligações, e-mails, notas e tarefas sintéticas) · S006 confirmar a ligação `gmail_accounts`→usuário para autor de e-mail · S007 listar tipos de `event_type` existentes · S008 registrar o resultado neste documento.
**B. Modelo e categorias (S009–S018)** [J01] S009 tipo `JourneyEvent` (id, instante, categoria, tipo, título, resumo, detalhes, autor, alvo do clique, contagem, selo) · S010 união `JourneyCategory` · S011 mapa categoria→cor/ícone/rótulo (D02) · S012 mapa tipo→categoria · S013 lista do filtro de tipo · S014 tipo `JourneyActor` (cliente/usuário/sistema) · S015 tipo `JourneyTarget` (para o clique) · S016 testes dos mapas · S017 contraste AA dos pares de cor (teste) · S018 ícones por categoria.
**C. Telefone e e-mail (S019–S030)** [wave 2] S019 consulta de `calls` por contato e período · S020 mapear ligação (entrada/saída/perdida/atendida) · S021 duração e tempo falado · S022 motivo do fim (`end_reason`) · S023 quem atendeu/ligou (`agent_id`) · S024 selo "Concluída/Perdida/Sem resposta" · S025 gravação disponível (alvo do clique) · S026 consulta de `email_threads`/`email_messages` por contato · S027 mapear e-mail recebido/enviado com assunto e trecho · S028 autor do e-mail enviado (conta → usuário) · S029 agrupar e-mails da mesma conversa · S030 testes de S019–S029.
**D. Notas, tarefas, transferências, propostas, encerramentos (S031–S042)** [wave 2] S031 ler `author_id` das notas · S032 mapear nota (autor, texto, categoria, prazo) · S033 ler `created_by`/`assigned_to`/`status`/`due_date` das tarefas · S034 mapear criação, início, conclusão e atraso da tarefa · S035 ler `from/to_agent_id`, filas e `performed_by` dos eventos · S036 mapear transferência com "De → Para" e fila · S037 mapear atribuição/desatribuição · S038 encerramento com motivo (`closure_id`) · S039 reabertura · S040 proposta (valor, status, responsável) e atividades · S041 detalhes viram linhas "rótulo: valor" no evento · S042 testes de S031–S041.
**E. Período com calendário (S043–S050)** [J02 + wave 2] S043 função `resolvePeriodRange` (preset ou De/Até → intervalo) · S044 testes (virada de dia/mês, intervalo invertido, fuso) · S045 trocar o `Select` pelo `PeriodFilterSelector` · S046 sem "Última interação" · S047 consulta por intervalo (não só dias) · S048 período anterior equivalente (para tendência) · S049 guardar período na sessão por conversa · S050 testes de tela.
**F. Filtros de tipo e de usuário (S051–S060)** [wave 2] S051 manter o filtro de tipo · S052 incluir E-mail e Telefone · S053 filtro de usuário de **seleção múltipla** (lista de quem aparece, com foto, caixas de marcar) · S054 "Cliente" como opção marcável junto com os usuários · S055 contagem por opção · S056 filtros combinam (período + tipo + usuário) · S057 limpar filtros · S058 estado vazio claro · S059 filtros na URL/estado da aba · S060 testes (ex.: só "Maria"; "Maria" + "João"; Maria + Telefone; todas desmarcadas = todos).
**G. Visual da timeline (S061–S072)** [wave 2] S061 cartão do episódio com ícone colorido por categoria · S062 trilho/ponto na cor da categoria · S063 foto + nome de quem interagiu (reusa `SenderAvatar`) · S064 selos de status · S065 detalhes em linhas · S066 corrigir "De" maiúsculo nas datas · S067 corrigir localização/áudio/contato/sticker (D07) · S068 arquivo com nome, tipo e tamanho · S069 expandir mensagens agrupadas · S070 cabeçalho do dia "Hoje, 7 de outubro de 2026" · S071 modo claro/escuro e celular 390 px · S072 testes visuais.
**H. Estatísticas do contato (S073–S084)** [J03 + J04 + wave 2] S073 função `computeJourneyStats` (pura) · S074 totais por categoria · S075 primeira e última interação · S076 tempo da 1ª resposta e médio, com tendência · S077 ligações: total, atendidas, perdidas, tempo falado · S078 e-mails: enviados, recebidos, sem resposta · S079 atendimentos, resoluções, reaberturas · S080 ranking de usuários que atenderam (top 3 com foto) · S081 tarefas abertas/concluídas/atrasadas, notas, arquivos, propostas (valor) · S082 CSAT · S083 série diária e horário/dia mais ativo · S084 componente `JourneyStatsHero` com efeitos (D12), esqueleto, tendência, sem texto cortado.
**I. Clique abre o episódio (S085–S094)** [wave 3] S085 contrato de navegação `openEpisode(alvo)` · S086 mensagem → Chat + rolar até a mensagem e destacar · S087 mensagem antiga fora da janela carregada: carregar até achar · S088 e-mail → módulo E-mail na conversa · S089 ligação → detalhe com gravação · S090 nota → aba Notas na nota · S091 tarefa → aba Tarefas na tarefa · S092 arquivo → pré-visualização · S093 proposta → SalesView · S094 transferência/atribuição/encerramento → painel de detalhes do evento.
**J. Fechamento (S095–S100)** [wave 3 + Claude] S095 ~~exportar histórico~~ **CANCELADA (D11)**; no lugar: teste que garante que a aba NÃO oferece exportar/baixar/copiar a timeline e que o texto dos eventos não é arrastável como arquivo · S096 paginação por rolagem (sem teto de 500/200) · S097 teclado e leitor de tela (Enter abre, rótulo com categoria e autor) · S098 E2E (`e2e/journey.spec.ts`, novo) · S099 bundle ≤ 343 KB, tsc, lint, contratos, verificação visual na pré-visualização · S100 documentação (`docs/design/`) e registro de estado.


## 4-B. Fase K — design avançado (aprovado pelo dono em 07/10; vem depois das 100 etapas)

Cores SÓ as do sistema; efeitos só do pacote `motion/` (J05); reduzir movimento respeitado. Os cartões K editam a mesma timeline, por isso são **encadeados** (cada um depende do anterior integrado).

- **K01** marcos maiores no trilho (primeira interação, encerramento, proposta ganha, reabertura) · **K02** separador "N dias sem contato" (> 3 dias) · **K03** setas de recebido/enviado, ligação perdida em destaque, borda lateral na cor da categoria e mini-ícone da categoria na foto · **K04** barra de filtros fixa no topo da rolagem, com etiquetas e contagem · **K05** faixa de saúde do relacionamento (Ativo / Morno / Esfriando / Inativo) · **K06** esqueleto de carga, estado vazio e estado de erro · **K07** mensagens agrupadas como balões ao expandir · **K08** filtros em folha deslizante no celular · **K09** dica com a data e hora completas · **K10** testes de ponta a ponta da fase K · **K11** documentação.
- **Consistência no sistema** (itens 13 e 14 das sugestões): plano próprio `PLANO_CONSISTENCIA_DESIGN_SISTEMA_2026-10-07.md` (cartões Z01–Z03).

## 5. Cartões
**Onda 1 (criada agora; arquivos novos, independentes):** **J05** [iris] peças de efeito sutil `src/components/inbox/tabs/journey/motion/` (D12) · **J01** [hugo] S009–S018 `src/lib/journey/model.ts` · **J02** [hugo] S043–S044 `src/lib/journey/periodRange.ts` · **J03** [hugo] S073–S083 `src/lib/journey/stats.ts` · **J04** [iris] S084 `JourneyStatsHero.tsx`.
**Onda 2 (depois de J01–J04 integrados):** fontes e mapeadores (C, D), período e filtros (E, F), visual da timeline (G), ligação do hero ao `JourneyTab`.
**Onda 3 (depois da 2 e de F01/R-series integrados):** clique no episódio (I; mexe em ChatPanel/TasksTab/NotesTab/FilesTab), exportar, E2E, docs. **Claude:** A e J.

## 6. Perguntas ao dono
1. ~~Nome da aba~~ **RESPONDIDA: continua Journey** (e o título interno da página também será "Journey"). 2. ~~Filtro de usuário~~ **RESPONDIDA: vários ao mesmo tempo** (D05). 3. ~~Selo "Visualizada" da proposta~~ **RESPONDIDA: fica de fora** (não há dado; o selo da proposta mostra só o status que já existe: aberta, ganha ou perdida). 4. ~~Exportar histórico~~ **RESPONDIDA: NÃO exportar nada** (nenhuma informação sai do sistema; D11). 5. ~~Ações da IA/robô~~ **RESPONDIDA: entram na timeline como "Sistema"** (ícone de sistema, sem foto; filtro de usuário ganha a opção "Sistema"). **TODAS as 5 perguntas estão respondidas.**

## 7. Fora de escopo
Selo "Visualizada" da proposta (decidido pelo dono em 07/10: não há dado); **exportar/baixar/imprimir/compartilhar o histórico (decidido pelo dono em 07/10)**; Criar tabelas ou RPC sem aprovação; mudar o armazenamento; selo de canal/origem; editar eventos pela timeline.

## 8. Estado de execução
_A preencher._ Onda 1 criada em 07/10/2026.

## Automação das ondas seguintes (programada em 07/10/2026)

Todos os cartões abaixo **já estão escritos e programados** no motor de gatilhos (`~/arquitetura-v2/gatilhos/`): **cada um nasce sozinho** no quadro, para o perfil indicado, assim que os cartões de que depende estiverem **integrados** na branch do dia (não basta o agente terminar). O motor roda a cada 5 minutos (timer do usuário) e a cada ~30 minutos pelo lembrete do Claude; é idempotente. O painel **GATILHOS_07-10.md** na área de trabalho mostra o que já nasceu e o que ainda espera. As **verificações visuais** que só o Claude faz ficam no painel de pendências do Claude. Regras permanentes em todos: nenhuma informação sai do sistema, só cores do sistema, efeitos sutis com reduzir movimento, sem selo de canal/origem.

### Journey — ondas 2 e 3

| Cartão | Perfil | Nasce quando estiverem INTEGRADOS | O que faz |
|---|---|---|---|
| **J06** | hugo | J01 | Journey: linhas cruas e fontes de ligação e e-mail |
| **J07** | hugo | J01, J06 | Journey: mapeadores de todas as fontes para eventos do histórico |
| **J08** | hugo | J01, J02, J06, J07 | Journey: hook novo da timeline (período, tipo, usuários, paginação) |
| **J09** | hugo | J01, R01 | Journey: resolver quem agiu (foto e nome) |
| **J10** | iris | J01, J02, J05, R02 | Journey: barra de filtros (período, tipo e usuários) |
| **J11** | iris | J01, J05, R02 | Journey: cartão do episódio e lista da timeline |
| **J12** | iris | J03, J04, J08, J09, J10, J11 | Journey: ligar tudo na aba (hero, filtros, timeline, novo hook) |
| **J13** | iris | J12 | Journey: clique abre o episódio — contrato e mensagens do chat |
| **J14** | iris | J13 | Journey: clique abre a nota e a tarefa |
| **J15** | iris | J13, F01, C04, R08 | Journey: clique abre o arquivo e a proposta |
| **J16** | iris | J13, C03 | Journey: clique abre o e-mail e a ligação |
| **J17** | iris | J13 | Journey: clique abre o detalhe de transferência, atribuição e encerramento |
| **J18** | workertestes | J12 | Journey: testes de filtros, teclado e garantia de que nada sai do sistema |
| **J19** | workertestes | J14, J15, J16, J17 | Journey: teste de ponta a ponta |
| **J20** | vera | J19 | Journey: documentação |

### Journey — fase K

| Cartão | Perfil | Nasce quando estiverem INTEGRADOS | O que faz |
|---|---|---|---|
| **K01** | iris | J12 | Journey design: marcos no trilho |
| **K02** | iris | K01 | Journey design: separador de silêncio |
| **K03** | iris | K02 | Journey design: direção, ligação perdida, borda colorida e selo da categoria na foto |
| **K04** | iris | K03 | Journey design: barra de filtros fixa no topo da rolagem |
| **K05** | iris | K04 | Journey design: faixa de saúde do relacionamento |
| **K06** | iris | K05 | Journey design: esqueleto, estado vazio e erro |
| **K07** | iris | K06 | Journey design: mensagens agrupadas como balões |
| **K08** | iris | K07 | Journey design: filtros em folha deslizante no celular |
| **K09** | iris | K08 | Journey design: dica com a data e hora completas |
| **K10** | workertestes | K09 | Journey design: testes de ponta a ponta da fase K |
| **K11** | vera | K10 | Journey design: documentação da fase K |
