# TALK ME — Plano de implementação em 100 etapas

**Data:** 30/09/2026
**Status:** plano-base preservado; execução autorizada posteriormente em 30/09/2026.
**Pedido original:** criar e commitar somente este plano. A autorização posterior para executar todas as etapas substituiu esse limite.
**Base da implementação:** `origin/main` em `211fe16069a549dc233a5097edfcb10cad3cf870`.
**Repositório:** [adm01-debug/Zapp_Web_V2](https://github.com/adm01-debug/Zapp_Web_V2).

> **Registro de mudança de escopo:** este texto preserva a especificação que antecedeu a implementação. O resultado técnico, as decisões fechadas, os cenários simulados e as evidências estão em `RELATORIO_EXECUCAO_TALK_ME_2026-09-30.md` e no PR da funcionalidade.

## Objetivo e limite desta entrega

Planejar um botão **TALK ME** no canto superior direito do Inbox, acima dos avatares de favoritos, no antigo local do botão Zen. Ao acioná-lo, o usuário acessará uma tela visual de atendimentos recebidos por um departamento e ainda não aceitos. Poderá consultar foto, nome, empresa, cargo e mensagens recebidas, escolher um atendimento, assumir sua responsabilidade e abrir o chat.

Este documento não implementa componentes, não instala dependências, não modifica configurações, não cria migrations, não executa SQL e não publica a funcionalidade. As ações abaixo são trabalho futuro. Todas as 100 etapas permanecem pendentes. A publicação deste Markdown não autoriza executar as etapas.

## Requisitos confirmados e premissas propostas

| Tema | Classificação | Definição |
|---|---|---|
| Texto e posição | Confirmado | TALK ME no topo direito do Inbox, acima dos favoritos, no antigo lugar do Zen. |
| Aparência | Confirmado | Botão com efeito de metal líquido inspirado na referência enviada. |
| Experiência | Confirmado | Abrir uma tela de seleção inspirada no Feature Carousel, com foto, nome, empresa, cargo e mensagem. |
| Finalidade | Confirmado | Escolher atendimento do departamento ainda não aceito e iniciar a conversa. |
| Tipo de abertura | Premissa proposta | Tela dedicada dentro do aplicativo, com retorno ao Inbox e preservação de rascunho. Confirmar página versus sobreposição ampla antes de implementar. |
| Mais de um departamento | Premissa proposta | Seletor restrito aos departamentos autorizados; lembrar a escolha somente enquanto continuar válida. |
| Aceite | Premissa proposta | Selecionar cartão apenas destaca; “Aceitar e conversar” assume o atendimento e abre o chat após confirmação do servidor. |
| Ordenação | Premissa proposta | Maior tempo de espera primeiro, sem rotação automática do carrossel. |
| Mensagem exibida | Premissa proposta | Última mensagem recebida em destaque, com acesso às demais pendentes. |
| Contador | Premissa proposta | Quantidade de atendimentos elegíveis no departamento selecionado, não quantidade de mensagens. |
| Abrangência inicial | Premissa proposta | Inbox de WhatsApp; grupos, conversas internas e outros canais dependem de decisão explícita. |
| Sem ninguém esperando | Premissa proposta | Botão acessível com contador zero e tela de fila vazia. |

As perguntas da revisão anterior não receberam respostas individuais. As premissas acima permitem especificar o trabalho, mas não devem ser apresentadas como decisões aprovadas. A etapa 010 consolida essas decisões antes da execução técnica.

## Fontes e evidências disponíveis

- [Liquid Metal Button, johuniq / 21st.dev](https://21st.dev/@johuniq/components/liquid-metal-button).
- [Feature Carousel, Ravi Katiyar / 21st.dev](https://21st.dev/@ravikatiyar162/components/feature-carousel).
- Prints enviados pelo usuário: acesso aos atendimentos aguardando no Whaticket, carrossel desejado e posição no Inbox do ZAPP.
- Quatro anexos de texto: um contém `LiquidMetalButton`; três contêm o mesmo `HeroSection`/Feature Carousel. Os três carrosséis são idênticos.
- O botão fornecido usa `@paper-design/shaders`, mede inicialmente 142 × 46 px no modo texto e contém canvas, animação de clique e aceleração no hover.
- O carrossel fornecido contém apenas imagens e navegação, inicia no índice intermediário e avança automaticamente a cada quatro segundos. O demo envia propriedades ausentes da interface. São referências a adaptar, não componentes prontos para atendimento.
- O código inspecionado já usa React, TypeScript, Tailwind, componentes em `src/components/ui`, Radix, Lucide e React Query. A dependência `@paper-design/shaders` não foi encontrada no `package.json` consultado; a situação deve ser revalidada na execução.
- `src/hooks/inbox/useInboxFilters.ts` diferencia o filtro “Aguardando”: com FSM utiliza `conversation_status === 'waiting'`; no caminho legado utiliza ausência de `assigned_to`. Também filtra por `queue_id`. Isso não prova que uma consulta pronta satisfaz os requisitos do TALK ME.
- `src/types/queue.ts` referencia `queues` e `queue_members`; `src/hooks/inbox/useConnectionQueues.ts` trabalha com vínculos entre conexões e filas. A equivalência comercial entre “departamento” e “fila” precisa ser validada.
- A auditoria desta entrega foi documental e de código. Não foi feita auditoria do schema vivo, das permissões ou dos dados dos clientes para criar este plano.

## Pontos de integração a avaliar

| Área existente | Papel a avaliar na implementação |
|---|---|
| `src/components/layout/AppShell.tsx` | Limites do layout, modo Zen e região superior. |
| `src/contexts/LayoutContext.tsx` | Estado compartilhado que já existe; evitar acoplar toda a fila a esse contexto. |
| `src/components/inbox/RealtimeInboxView.tsx` | Entrada da experiência e retorno à conversa escolhida. |
| `src/components/inbox/chat/ConversationTabs.tsx` | Distribuição do espaço entre abas e nova ação superior. |
| `src/components/inbox/ConversationListSidebar.tsx` | Preservação do Zen ao lado de Conversas e dos filtros atuais. |
| `src/hooks/inbox/useRealtimeInbox.ts` | Seleção, mensagens, carregamento e sincronização. |
| `src/hooks/inbox/useInboxFilters.ts` | Comparação entre regras atuais e elegibilidade da nova fila. |
| `src/hooks/business/useQueues.ts` e `src/hooks/inbox/useConnectionQueues.ts` | Departamentos, membros e conexões autorizadas. |
| `src/components/ui` e `src/lib/utils.ts` | Componentes e utilitários reutilizáveis. |
| `supabase/migrations`, tipos e scripts de auditoria | Somente se a implementação aprovada exigir mudança de contrato do banco. |

Nomes como `TalkMeButton`, `TalkMeView`, `TalkMeContactCard` e `useTalkMeQueue` abaixo são propostas de organização, não arquivos existentes nem nomes de API confirmados.

## Método de execução futura

Executar os blocos em sequência, respeitando suas dependências. Uma etapa só estará concluída quando sua entrega e seu aceite tiverem evidência anexada ao PR ou ao registro de execução. Falta de decisão de produto bloqueia apenas o trabalho que depende dela.

Papéis sugeridos: produto/UX para decisões e protótipos; frontend para interface e integração; backend para contratos e concorrência; QA para validação; responsável por release para publicação. Essa divisão descreve responsabilidades e não solicita delegação ou execução agora.

### Bloco A — Escopo, regras de produto e decisões
**Etapas 001–010. Dependência:** autorização futura para começar o trabalho; leitura deste plano.

### 001 — Atualizar a base de implementação
- **Ação e entrega:** consultar a main mais recente, mudanças em andamento e instruções do repositório; registrar o SHA usado e os arquivos que colidem com outros trabalhos.
- **Aceite:** a implementação futura terá uma base identificável e não sobrescreverá alterações de outra sessão.

### 002 — Confirmar a posição do botão
- **Ação e entrega:** marcar no print a área do topo direito acima dos favoritos; relacioná-la ao contêiner real, considerando detalhes do contato abertos ou fechados e modo Zen.
- **Aceite:** produto confirma a posição, e o desenho identifica limites para evitar sobrepor abas, avatares ou controles.

### 003 — Definir o significado de departamento
- **Ação e entrega:** mapear departamento comercial para fila, equipe, conexão ou combinação existente; documentar relação entre membros e unidades.
- **Aceite:** cada opção do seletor corresponde a um identificador real e verificável; nomes parecidos não são usados como chave de autorização.

### 004 — Definir a unidade de atendimento
- **Ação e entrega:** decidir a identidade do item: conversa, ticket ou registro atual equivalente; tratar o mesmo contato em diferentes conexões ou departamentos.
- **Aceite:** várias mensagens do mesmo atendimento geram um cartão; atendimentos independentes não são unidos indevidamente por telefone ou contato.

### 005 — Especificar a elegibilidade da fila
- **Ação e entrega:** escrever uma tabela com status, responsável, origem da mensagem, departamento e resultado esperado; incluir resolvido, aberto, aguardando, transferido e reaberto.
- **Aceite:** “ainda não aceito” tem uma regra única de negócio; existir mensagem não lida, isoladamente, não torna o atendimento elegível.

### 006 — Fechar o escopo de canais e exceções
- **Ação e entrega:** decidir WhatsApp individual, grupos, bot em atendimento, contatos bloqueados, arquivados, excluídos e registros sem departamento.
- **Aceite:** cada categoria tem comportamento explícito; um item sem roteamento não aparece como pertencente a um departamento escolhido arbitrariamente.

### 007 — Definir as permissões de visualização e aceite
- **Ação e entrega:** montar matriz para atendente, supervisor e administrador, distinguindo consultar fila, ver mensagem, visualizar mídia e assumir atendimento.
- **Aceite:** pertencer a uma fila não concede automaticamente todas as ações; mudanças de permissão durante a sessão também têm comportamento definido.

### 008 — Definir espera, prioridade e mensagem de destaque
- **Ação e entrega:** escolher o início do relógio de espera, desempate por identificador estável, política de prioridade e seleção da mensagem exibida.
- **Aceite:** novas mensagens não zeram indevidamente a espera; o critério de ordem é explicável ao atendente e reproduzível no servidor.

### 009 — Definir navegação e contagem
- **Ação e entrega:** especificar página ou sobreposição, retorno, histórico do navegador, departamento inicial e significado do badge. Registrar se o contador inclui a busca atual.
- **Aceite:** o botão e a tela deixam claro qual departamento e conjunto estão sendo contados, inclusive quando o usuário participa de várias filas.

### 010 — Consolidar as decisões de produto
- **Ação e entrega:** apresentar as escolhas de 002–009, registrar aprovação ou ajustes e atualizar a tabela de premissas com data e responsável.
- **Aceite:** nenhuma hipótese vira requisito silenciosamente. A construção da funcionalidade começa apenas após autorização explícita; publicar este plano não supre essa autorização.

### Bloco B — Auditoria da arquitetura e dos dados
**Etapas 011–020. Dependência:** regras aprovadas em 010.

### 011 — Mapear o cabeçalho do Inbox
- **Ação e entrega:** seguir a composição de AppShell, RealtimeInboxView, ConversationTabs, favoritos e painel de detalhes; registrar o local responsável pelo espaço do botão.
- **Aceite:** o ponto de montagem funciona com e sem contato selecionado e evita reaproveitar cegamente o posicionamento absoluto antigo do Zen.

### 012 — Mapear a abertura de conversa
- **Ação e entrega:** rastrear seleção de contato/conversa, carregamento de mensagens, atualização de lidos, URL e rascunho.
- **Aceite:** o plano de integração distingue pré-visualização de abertura efetiva e identifica efeitos que não podem ocorrer ao apenas navegar pelo carrossel.

### 013 — Auditar campos de identidade e apresentação
- **Ação e entrega:** localizar as fontes de foto, nome, empresa e cargo; documentar precedência entre cadastro, CRM e dados do canal, incluindo campos ausentes.
- **Aceite:** cada informação do cartão tem origem conhecida; campos não são inventados, inferidos de mensagens ou obtidos por consultas repetidas por cartão.

### 014 — Auditar a atribuição e o ciclo de vida
- **Ação e entrega:** localizar os mecanismos existentes de aceite, transferência, encerramento, reabertura e distribuição automática; confrontar FSM e caminho legado.
- **Aceite:** fica definido qual mecanismo pode ser reutilizado e quais lacunas exigem contrato adicional, com evidência no código.

### 015 — Verificar o contrato canônico do banco
- **Ação e entrega:** quando a execução estiver autorizada, consultar metadados necessários do projeto oficial identificado em CLAUDE.md; comparar schema, migrations e tipos gerados.
- **Aceite:** nenhuma decisão depende de snapshot legado; divergências são registradas separadamente, sem declarar sincronismo global com base apenas na contagem de migrations.

### 016 — Auditar a autorização ponta a ponta
- **Ação e entrega:** inspecionar autenticação, perfis, associação organizacional quando existente, membros de fila e permissões da conexão; mapear RLS e funções envolvidas.
- **Aceite:** a visibilidade do botão não é a única barreira; leitura, contagem, prévia e aceite possuem proteção no servidor.

### 017 — Auditar a atualização em tempo real
- **Ação e entrega:** identificar inscrições existentes, payloads recebidos, invalidação de cache e comportamento na reconexão; avaliar se o transporte revela dados não autorizados.
- **Aceite:** há estratégia de reaproveitamento com isolamento de escopo e reconciliação com o servidor após eventos perdidos.

### 018 — Medir volume e desempenho de referência
- **Ação e entrega:** medir cardinalidade das filas, tamanho de resposta e tempo de consulta por dados agregados; observar custo atual do Inbox em ambiente adequado.
- **Aceite:** registrar valores e condições de medição, sem copiar mensagens, telefones ou fotos reais para documentos públicos.

### 019 — Revisar componentes externos e dependências
- **Ação e entrega:** conferir origem, licença, versão e API dos componentes; avaliar o shader e as bibliotecas já instaladas, sem substituir os componentes shadcn existentes.
- **Aceite:** resolver propriedades inválidas do demo, tratamento de lista vazia, tipos, limpeza de timers e contexto gráfico antes de reutilizar o código.

### 020 — Aprovar a arquitetura técnica
- **Ação e entrega:** registrar componentes, hooks, contrato de consulta, operação de aceite, cache e eventuais migrations; separar alternativas descartadas e riscos concretos.
- **Aceite:** arquitetura reaproveita o domínio existente e não cria uma segunda fonte de verdade para status, responsável ou departamento.

### Bloco C — Fluxos e protótipos de UX
**Etapas 021–030. Dependência:** decisões de 010 e arquitetura de 020.

### 021 — Desenhar o fluxo principal
- **Ação e entrega:** produzir wireframe de TALK ME, fila, seleção, aceite, confirmação e chat aberto; incluir retorno à conversa anterior.
- **Aceite:** cada transição tem ação explícita e resultado compreensível, e o atendente sabe em qual ponto passa a ser responsável.

### 022 — Desenhar o cabeçalho da tela
- **Ação e entrega:** posicionar título, departamento, contador, busca e voltar/fechar; escolher rótulos curtos em português, preservando a marca TALK ME.
- **Aceite:** departamento e quantidade têm contexto suficiente sem ocupar a área destinada à leitura do atendimento.

### 023 — Desenhar o carrossel de contatos
- **Ação e entrega:** definir cartão central, laterais, profundidade, limites de deslocamento, posição na fila e setas; iniciar pelo primeiro item da ordenação aprovada.
- **Aceite:** a pessoa selecionada é inequívoca; a navegação não roda sozinha nem volta ao começo sem sinalizar o limite da fila.

### 024 — Desenhar a hierarquia do cartão
- **Ação e entrega:** organizar foto, nome, empresa, cargo, departamento, espera e ação; reservar alturas flexíveis para nomes e cargos longos.
- **Aceite:** os dados principais continuam legíveis com foto pequena, ausência de cadastro e zoom; não há texto essencial desenhado sobre rostos.

### 025 — Desenhar a área de mensagem
- **Ação e entrega:** planejar resumo, expansão de texto e acesso às demais mensagens pendentes; indicar remetente e horário sem confundir mensagens do cliente com notas internas.
- **Aceite:** ler a mensagem completa não exige aceitar o atendimento; links e conteúdo recebido não executam HTML arbitrário.

### 026 — Desenhar navegação em filas grandes
- **Ação e entrega:** acrescentar busca por nome e empresa, posição e carregamento progressivo; avaliar atalhos para localizar alguém sem percorrer centenas de cartões.
- **Aceite:** a identidade visual do carrossel é mantida e tarefas de localização têm caminho eficiente, inclusive com 500 atendimentos de teste.

### 027 — Desenhar estados de atendimento indisponível
- **Ação e entrega:** prototipar aceite por outro agente, transferência, resolução ou perda de acesso enquanto um cartão está aberto.
- **Aceite:** a ação fica indisponível com explicação contextual; o cartão não troca silenciosamente por outra pessoa sob o ponteiro.

### 028 — Desenhar vazio, erro e reconexão
- **Ação e entrega:** separar fila vazia, busca sem resultado, carregamento inicial, falha de rede, sessão expirada e departamento removido.
- **Aceite:** nenhuma falha de consulta aparece como “zero aguardando”; cada estado indica como continuar e preserva contexto quando possível.

### 029 — Desenhar comportamento responsivo
- **Ação e entrega:** produzir versões desktop, tablet e celular, incluindo cabeçalhos estreitos, teclado virtual, áreas seguras e gestos.
- **Aceite:** campos e mensagem permanecem acessíveis; o swipe horizontal não impede rolar uma mensagem longa nem colide com gestos existentes do Inbox.

### 030 — Validar o protótipo antes de codificar
- **Ação e entrega:** revisar com produto posição, metal líquido, legibilidade, navegação e ato de aceitar; executar tarefas guiadas com representantes do atendimento.
- **Aceite:** registrar ajustes e aprovar o fluxo; nenhuma interação crítica depende apenas do efeito visual ou de uma suposição não confirmada.

### Bloco D — Design visual, acessibilidade e movimento
**Etapas 031–040. Dependência:** protótipo validado em 030.

### 031 — Definir dimensões do botão
- **Ação e entrega:** usar os 142 × 46 px da referência como ponto de partida, ajustando ao cabeçalho real; especificar padding, raio e área de interação.
- **Aceite:** TALK ME cabe por inteiro; o badge não reduz a área clicável e o botão não invade favoritos ou abas em nenhuma largura aprovada.

### 032 — Definir materiais e contraste
- **Ação e entrega:** especificar fundo escuro, borda metálica, reflexos e texto por tokens do projeto; medir contraste nos quadros claros e escuros da animação.
- **Aceite:** texto normal atende a 4,5:1 e indicadores essenciais a 3:1; brilho não apaga rótulo, contador ou foco.

### 033 — Definir a linguagem de movimento
- **Ação e entrega:** estabelecer velocidade de repouso, hover e clique, duração de transição e intensidade máxima; registrar valores candidatos no protótipo.
- **Aceite:** o efeito comunica interação sem flashes nem deslocamento do layout; entrar no botão com teclado recebe feedback equivalente ao mouse.

### 034 — Definir o fallback do shader
- **Ação e entrega:** especificar borda metálica estática para falta de suporte, erro de carregamento ou perda do contexto gráfico.
- **Aceite:** botão mantém texto, contador e funcionamento quando o canvas falha; a falha decorativa não bloqueia acesso à fila.

### 035 — Definir redução de movimento e economia
- **Ação e entrega:** respeitar prefers-reduced-motion; suspender animação com aba oculta, botão desmontado ou experiência fora de foco quando apropriado.
- **Aceite:** usuário sensível a movimento acessa o mesmo fluxo com efeitos estáticos, e o shader libera recursos ao sair da tela.

### 036 — Especificar semântica e estados acessíveis
- **Ação e entrega:** definir nome acessível, descrição, tooltip, foco, estado ocupado e ativação do botão; escolher semântica de página ou diálogo conforme decisão de produto.
- **Aceite:** Enter e Espaço acionam o controle; foco é visível e a leitura não depende de texto desenhado apenas em canvas.

### 037 — Especificar acesso ao carrossel por teclado
- **Ação e entrega:** mapear anterior/próximo, seleção, expansão da mensagem e retorno; evitar interceptar setas em campos de busca ou conteúdo editável.
- **Aceite:** o ciclo de Tab alcança apenas controles úteis; cartões laterais ocultos não recebem foco acidental.

### 038 — Definir anúncios de atualização
- **Ação e entrega:** anunciar carregamento, sucesso, conflito e alterações relevantes com prioridade apropriada; agrupar mudanças de contagem para evitar excesso de leitura.
- **Aceite:** leitor de tela recebe contexto suficiente sem anunciar todos os eventos da fila nem ler conteúdo privado automaticamente.

### 039 — Definir recuperação de foco e zoom
- **Ação e entrega:** planejar foco ao abrir, voltar, aceitar e remover um item; validar zoom de 200%, reflow a 320 CSS px e alvos de toque adequados.
- **Aceite:** foco nunca desaparece em um cartão removido e o texto permanece utilizável sem depender de rolagem horizontal da página.

### 040 — Fechar especificação visual e conteúdo
- **Ação e entrega:** reunir tokens, estados, ícones, microtextos e exemplos com dados fictícios em uma referência de implementação.
- **Aceite:** o documento cobre normal, hover, foco, pressionado, ocupado, zero, erro e indisponível; há rastreabilidade com os prints aprovados.

### Bloco E — Consulta, contagem e integridade do domínio
**Etapas 041–050. Dependência:** auditoria de 011–020 e decisões de 010. Validação visual ocorre antes da implementação final da interface.

### 041 — Formalizar o contrato de leitura
- **Ação e entrega:** especificar parâmetros autorizados, retorno mínimo, atendimento estável, contato, departamento, mensagem, espera, versão e paginação.
- **Aceite:** diferenciar valor ausente de acesso proibido e de falha; não expor segredos, tokens ou campos internos desnecessários.

### 042 — Definir a consulta canônica de elegibilidade
- **Ação e entrega:** implementar futuramente a regra de 005 no servidor, preferindo o mecanismo existente; documentar diferenças necessárias em relação ao filtro local.
- **Aceite:** contador, listagem e aceite usam o mesmo conceito de elegibilidade, com testes de todos os estados aprovados.

### 043 — Proteger a leitura por escopo
- **Ação e entrega:** exigir identidade autenticada e validar organização quando aplicável, departamento, vínculo de membro e conexão em listagem e busca.
- **Aceite:** mudar um identificador no request não permite listar atendimentos de outra área ou inferir seus dados por contadores.

### 044 — Definir a contagem autoritativa
- **Ação e entrega:** consultar o total elegível no servidor, reaproveitando filtros e permissões; especificar atualização, arredondamento visual e limite do badge.
- **Aceite:** o número não depende dos itens já carregados no navegador; uma fila de 501 entradas não aparece como 50 por paginação.

### 045 — Planejar paginação estável
- **Ação e entrega:** usar cursor com ordenação aprovada, instante de espera e desempate estável; definir limites por página e deduplicação entre páginas.
- **Aceite:** entradas e remoções concorrentes não fazem a navegação repetir indefinidamente itens ou perder atendimentos sem possibilidade de reconciliação.

### 046 — Selecionar corretamente as mensagens
- **Ação e entrega:** identificar direção, remetente, timestamp, edição, exclusão e conteúdo suportado; escolher última mensagem recebida e carregar as anteriores sob demanda.
- **Aceite:** mensagens de sistema, campanhas de saída e notas internas não são confundidas com o pedido pendente do cliente.

### 047 — Planejar resolução de foto e cadastro
- **Ação e entrega:** consolidar dados necessários sem consultas individuais em cascata; respeitar proteção de mídia, expiração de URLs e alterações de cadastro.
- **Aceite:** quantidade de consultas por página é limitada e conhecida; a imagem real é substituída por iniciais quando indisponível.

### 048 — Definir comportamento de busca
- **Ação e entrega:** limitar campos pesquisáveis, tamanho do termo, normalização, debounce e cancelamento de respostas obsoletas; aplicar busca no conjunto autorizado.
- **Aceite:** busca encontra atendimentos fora da primeira página, sem incluir conversas atribuídas ou revelar registros fora do escopo.

### 049 — Dimensionar consulta e índices
- **Ação e entrega:** avaliar plano de execução com massa representativa; propor somente índices justificados, limites e métricas, seguindo o procedimento de migrations do projeto.
- **Aceite:** estabelecer orçamento mensurável; proposta inicial de p95 abaixo de 800 ms para leitura/contagem deve ser confirmada conforme ambiente e volume.

### 050 — Documentar migrations e compatibilidade
- **Ação e entrega:** se houver lacuna real, preparar proposta de alteração aditiva, segurança, contratos, tipos e rollback; se não houver, registrar reutilização sem DDL.
- **Aceite:** nenhuma migration é aplicada por este plano. Na execução, seguir a ordem e os controles vigentes em CLAUDE.md, sem presumir que um novo endpoint é obrigatório.

### Bloco F — Aceite exclusivo e sincronização
**Etapas 051–060. Dependência:** contrato e autorização definidos em 041–050.

### 051 — Especificar o contrato de aceite
- **Ação e entrega:** receber identidade do atendimento e dados de concorrência necessários; derivar o atendente da sessão autenticada no servidor.
- **Aceite:** cliente não escolhe outro responsável por parâmetro livre; erros distinguem conflito, permissão, sessão e indisponibilidade sem expor informação restrita.

### 052 — Implementar futuramente a aquisição atômica
- **Ação e entrega:** reutilizar ou criar operação transacional que confira elegibilidade e atribua responsável numa única decisão no banco.
- **Aceite:** duas requisições simultâneas resultam em exatamente um novo responsável; um fluxo de consultar e depois atualizar sem condição não é aceito.

### 053 — Tornar a operação idempotente
- **Ação e entrega:** definir resultado para duplo clique, retry, duas abas do mesmo usuário e resposta perdida; usar o estado persistido para confirmar uma aceitação já concluída.
- **Aceite:** repetição não cria eventos duplicados de negócio nem transfere responsabilidade; timeout não é apresentado automaticamente como falha definitiva.

### 054 — Integrar o aceite ao ciclo de vida
- **Ação e entrega:** atualizar responsável, status, instante de aceite e demais invariantes usando o mecanismo oficial da conversa.
- **Aceite:** não existe estado intermediário observável de “aceito sem responsável”; trilhas legada e FSM têm compatibilidade explicitamente testada.

### 055 — Preservar permissões durante o aceite
- **Ação e entrega:** revalidar escopo no momento da gravação, incluindo revogação de vínculo, mudança de departamento e permissão da conexão.
- **Aceite:** uma tela aberta antes da perda de acesso não permite assumir atendimento depois da revogação.

### 056 — Tratar conflito com transferência e automação
- **Ação e entrega:** testar aceite contra roteamento automático, bot, transferência, resolução e reabertura; estabelecer ordem transacional e versão esperada.
- **Aceite:** nenhuma operação sobrescreve silenciosamente uma decisão mais recente de outro fluxo do sistema.

### 057 — Registrar auditoria mínima de aceite
- **Ação e entrega:** armazenar evento compatível com a auditoria existente contendo ator, atendimento, fila, horário e origem TALK ME.
- **Aceite:** evento confirma a alteração efetiva, possui política de acesso e evita conteúdo de mensagens e dados pessoais desnecessários.

### 058 — Definir cache e invalidação
- **Ação e entrega:** separar chaves por identidade, organização quando existente, departamento, busca e página; atualizar listagem, contador e Inbox após aceite.
- **Aceite:** trocar conta ou departamento não exibe dados anteriores; invalidar não faz desaparecer rascunhos nem reinicia toda a aplicação.

### 059 — Sincronizar eventos preservando a seleção
- **Ação e entrega:** reconciliar entradas, mensagens novas e saídas por identidade estável; congelar a identidade do alvo enquanto o aceite está em andamento.
- **Aceite:** mensagem nova não altera o destinatário do clique; entrada prioritária é sinalizada sem deslocar abruptamente o cartão selecionado.

### 060 — Recuperar falhas de rede e sessão
- **Ação e entrega:** reconsultar estado ao reconectar, retomar aba ou obter resposta incerta; desabilitar aceite offline e aplicar retry limitado apenas quando seguro.
- **Aceite:** o usuário pode descobrir se assumiu um atendimento após timeout; não ocorre aceite automático enfileirado ao recuperar conexão.

### Bloco G — Implementação futura do botão e da entrada
**Etapas 061–070. Dependência:** UX aprovada e contrato disponível para integração.

### 061 — Organizar arquivos e responsabilidades
- **Ação e entrega:** escolher localização de TalkMeButton, tela, cartões, hooks e contratos seguindo a estrutura real; manter lógica de domínio fora do componente decorativo.
- **Aceite:** componentes têm interfaces tipadas e o contexto global não recebe lista de mensagens ou estado de animação sem necessidade.

### 062 — Integrar o shader com carregamento controlado
- **Ação e entrega:** validar API e versão de @paper-design/shaders; usar importação compatível com o orçamento do bundle e inicialização no cliente.
- **Aceite:** decorativo carrega sem bloquear o Inbox ou a ação do botão; componente funciona antes de o efeito ficar disponível.

### 063 — Adaptar LiquidMetalButton aos padrões locais
- **Ação e entrega:** substituir any por tipos reais, implementar limpeza de recursos, evitar estilos globais injetados e timers órfãos; usar logger e tokens existentes.
- **Aceite:** montar/desmontar repetidamente não deixa canvas, listeners ou callbacks ativos e não gera erros em Strict Mode.

### 064 — Aplicar estados e semântica ao botão
- **Ação e entrega:** integrar texto, badge, tooltip, foco, type=button, clique, teclado e estados de consulta, sem associar loading decorativo a bloqueio funcional.
- **Aceite:** abrir TALK ME exige uma única ativação e não dispara submissões de formulários ou cliques duplicados.

### 065 — Posicionar a ação no cabeçalho
- **Ação e entrega:** reservar espaço no contêiner apropriado, com regras responsivas e limites de empilhamento; usar a posição aprovada acima dos favoritos.
- **Aceite:** modo Zen, detalhes de contato e largura da lista não causam sobreposição; o Zen permanece utilizável ao lado de Conversas.

### 066 — Conectar o badge ao departamento
- **Ação e entrega:** apresentar contagem autoritativa, estado de carregamento e erro com tooltip contextual; respeitar a escolha de fila aprovada.
- **Aceite:** falha de contagem não é representada como zero e o texto acessível inclui departamento e quantidade.

### 067 — Implementar a entrada e a saída da tela
- **Ação e entrega:** registrar rota ou estado de navegação conforme o modelo aprovado, incluindo botão voltar, Escape quando apropriado e histórico do navegador.
- **Aceite:** retornar restaura contexto e foco; refresh e acesso direto têm comportamento definido sem revelar conteúdo antes da autorização.

### 068 — Preservar o trabalho em andamento
- **Ação e entrega:** manter rascunho, anexos ainda não enviados, contato selecionado, scroll e contexto de filtros ao abrir e fechar TALK ME.
- **Aceite:** navegação não envia conteúdo nem perde rascunhos; fluxo ativo de gravação de áudio recebe tratamento explícito em vez de interrupção silenciosa.

### 069 — Implementar o seletor de departamento
- **Ação e entrega:** listar apenas unidades autorizadas, exibir seleção ativa e reagir à troca ou remoção da fila; redefinir seleção do cartão e cursor quando necessário.
- **Aceite:** respostas tardias do departamento anterior são descartadas e não alteram o badge ou a tela atual.

### 070 — Cobrir disponibilidade da entrada
- **Ação e entrega:** integrar tratamento de sessão expirada, sem fila autorizada, feature desabilitada e ausência de contato selecionado.
- **Aceite:** cada situação possui navegação coerente; não há botão funcional apontando para tela quebrada ou endpoint não publicado.

### Bloco H — Implementação futura da tela de atendimento
**Etapas 071–080. Dependência:** entrada de 061–070 e operações de 041–060.

### 071 — Construir a estrutura da tela
- **Ação e entrega:** implementar cabeçalho, voltar, departamento, contagem, busca e região principal; reaproveitar componentes de interface existentes.
- **Aceite:** estrutura corresponde ao protótipo e mantém uma única região principal e hierarquia de títulos apropriada.

### 072 — Adaptar o carrossel para atendimentos
- **Ação e entrega:** trocar o array estático de imagens por entidades tipadas com chaves estáveis; remover autoplay e dependência do índice como identidade.
- **Aceite:** coleção vazia não produz divisão por zero; coleções de um ou dois itens possuem navegação correta e sem cartões duplicados fictícios.

### 073 — Montar o cartão com dados reais
- **Ação e entrega:** apresentar foto, nome, empresa, cargo e tempo de espera; aplicar fallback, política de truncamento e acesso ao texto completo.
- **Aceite:** ausência ou erro de imagem não desloca o layout; nenhum dado demonstrativo dos anexos aparece em produção.

### 074 — Implementar prévia de mensagens
- **Ação e entrega:** renderizar texto longo, emojis, URLs e mensagens editadas/excluídas com os componentes seguros existentes; permitir ler mais sob demanda.
- **Aceite:** conteúdo é legível e sanitizado; visualizar prévia não assume atendimento nem altera confirmação de leitura sem decisão explícita de produto.

### 075 — Implementar prévia de mídia
- **Ação e entrega:** tratar áudio, imagem, vídeo, arquivo e conteúdo não suportado; carregar arquivos autorizados sob demanda e sem reprodução automática.
- **Aceite:** trocar de contato encerra reprodução anterior; mídia expirada tem fallback e nenhum áudio começa sem ação do usuário.

### 076 — Integrar busca e paginação ao carrossel
- **Ação e entrega:** adicionar cancelamento de requisições antigas, carregamento próximo do fim e deduplicação por atendimento; anunciar posição de forma honesta.
- **Aceite:** “item X de Y” não confunde carregados com total; busca continua funcionando além dos itens já presentes no navegador.

### 077 — Integrar navegação acessível e toque
- **Ação e entrega:** aplicar mapa de teclado, nomes de setas, foco e swipe; limitar animação a cartões próximos e manter controles fora de áreas desfocadas.
- **Aceite:** o mesmo atendimento pode ser encontrado, lido e aceito por teclado, leitor de tela e toque.

### 078 — Integrar Aceitar e conversar
- **Ação e entrega:** vincular a ação ao identificador selecionado, apresentar andamento e abrir o chat retornado pelo contrato somente após sucesso.
- **Aceite:** o destinatário aberto corresponde ao atendimento assumido, incluindo casos do mesmo contato em conexões distintas.

### 079 — Implementar respostas de conflito
- **Ação e entrega:** tratar atribuído a outro, transferido, resolvido, removido ou acesso revogado; atualizar contador e oferecer continuar pela fila restante.
- **Aceite:** não abrir conversa não autorizada; aviso diferencia indisponibilidade de falha de rede sem expor identidade de outro agente quando não permitido.

### 080 — Finalizar estados e reconciliação visual
- **Ação e entrega:** integrar skeleton, vazio, erro, reconexão, seleção removida e atualização de cadastro; usar limites de erro compatíveis com a aplicação.
- **Aceite:** recuperar uma falha não exige recarregar toda a página e a seleção válida não é reiniciada a cada atualização da fila.

### Bloco I — Testes, desempenho e homologação
**Etapas 081–090. Dependência:** implementação integrada; usar ambientes e dados adequados para cada teste.

### 081 — Preparar matriz de teste e dados sintéticos
- **Ação e entrega:** definir agentes, perfis, duas ou mais filas, conexões, estados e volumes 0, 1, 2, 50 e 500; criar fixtures com nomes e mídias fictícios.
- **Aceite:** cenários são reproduzíveis, isolados e removíveis; nenhum teste assume conversas reais de clientes em produção.

### 082 — Testar elegibilidade, ordem e contagem
- **Ação e entrega:** validar tabela de 005, tie-break, espera, busca e paginação; incluir várias mensagens para um atendimento e múltiplos atendimentos para um contato.
- **Aceite:** listagem, contador e aceite concordam no conjunto elegível; regressões entre FSM e legado ficam cobertas por comportamento.

### 083 — Testar concorrência real no banco
- **Ação e entrega:** disparar aceites simultâneos de usuários distintos, mesmo usuário em duas abas e retries com resposta perdida; verificar estado e auditoria persistidos.
- **Aceite:** apenas uma atribuição vence e não há duplicação de efeito; mocks isolados de frontend não são considerados prova dessa garantia.

### 084 — Testar autorização e exposição de dados
- **Ação e entrega:** tentar leitura, contagem, busca, prévia e aceite fora do departamento/conexão; revogar permissão com a tela aberta e trocar de conta.
- **Aceite:** servidor rejeita cada acesso proibido; cache, eventos e mensagens de erro não vazam dados entre escopos.

### 085 — Testar os fluxos do usuário ponta a ponta
- **Ação e entrega:** automatizar abertura, leitura, navegação, aceite e chat correto, além de retorno com rascunho e conflito entre atendentes.
- **Aceite:** navegador comprova o fluxo com contratos reais em ambiente de teste, e as verificações não dependem apenas de classes CSS.

### 086 — Testar acessibilidade e movimento
- **Ação e entrega:** executar verificação automatizada e inspeção manual de teclado, leitor de tela, contraste, zoom, foco e reduced-motion.
- **Aceite:** não há bloqueio funcional por acessibilidade; controles, anúncios e fallback gráfico cumprem os critérios de 032–039.

### 087 — Testar responsividade e navegadores
- **Ação e entrega:** verificar Chromium, Firefox e WebKit, desktop e toque; combinar viewport estreito, modo Zen, detalhes abertos e nomes longos.
- **Aceite:** não existem controles encobertos, barras horizontais da página ou mudanças inesperadas de contato durante interação.

### 088 — Medir desempenho e estabilidade
- **Ação e entrega:** comparar com 018, medir p95 de consultas/aceite, bundle, memória, frames e reconexão; repetir abertura/fechamento e lista grande.
- **Aceite:** cumprir orçamentos aprovados; limitar montagem de cartões e mídia. Proposta inicial: visualização útil em até 2 s e aceite p95 até 1 s em rede de referência, sem alegar garantia antes da medição.

### 089 — Validar regressões e controles do repositório
- **Ação e entrega:** rodar testes pertinentes, build, lint/typecheck e guards exigidos; verificar Inbox, abas, favoritos, Zen, notificações e atribuição existentes.
- **Aceite:** não há novas ocorrências nos controles oficiais; falhas anteriores são identificadas com evidência e não mascaradas como aprovação total.

### 090 — Homologar a experiência completa
- **Ação e entrega:** demonstrar os cenários aprovados, comparar screenshots com o protótipo, coletar ajustes finais e registrar aceite funcional.
- **Aceite:** produto confirma localização, legibilidade, navegação e regra de aceite; pendências impeditivas são resolvidas antes de habilitar para usuários.

### Bloco J — Entrega controlada, operação e encerramento
**Etapas 091–100. Dependência:** homologação em 090. Todas estas ações também são futuras e não estão autorizadas pela publicação do plano.

### 091 — Organizar PRs e evidências
- **Ação e entrega:** separar contratos/backend compatíveis, interface e integração conforme dependências; atualizar com a main antes de publicar e descrever cenários validados.
- **Aceite:** cada PR tem escopo revisável e não habilita caminho parcial que dependa de mudança ainda não disponível.

### 092 — Preparar controle de habilitação
- **Ação e entrega:** reutilizar mecanismo existente de feature flag se disponível; definir desligamento rápido, público piloto e valor inicial desabilitado.
- **Aceite:** desabilitar TALK ME remove a entrada de forma consistente, sem interromper conversas já aceitas ou enfraquecer autorização.

### 093 — Preparar publicação e migrations
- **Ação e entrega:** registrar sequência de merge, deploy, eventual aplicação e regeneração dos artefatos conforme CLAUDE.md; planejar código tolerante até o contrato estar pronto.
- **Aceite:** DDL segue o procedimento vigente e seus controles; compatibilidade aditiva ou qualquer exceção é fundamentada, nunca presumida.

### 094 — Executar a publicação somente quando autorizada
- **Ação e entrega:** após autorização de implementação/release, integrar PRs verdes, publicar artefatos e registrar hashes e resultados; aplicar apenas migrations aprovadas se necessárias.
- **Aceite:** versão publicada corresponde ao commit revisado e o recurso permanece desabilitado até contratos e verificações estarem prontos.

### 095 — Verificar o estado após publicação
- **Ação e entrega:** conferir versão online, assets, saúde dos endpoints, contrato vivo e, se houve DDL, ledger, schema, tipos, catálogo, manifesto e grants.
- **Aceite:** evidências distinguem código publicado de funcionalidade validada; contar migrations não basta para declarar todo o banco sincronizado.

### 096 — Habilitar um piloto controlado
- **Ação e entrega:** liberar para usuários e departamentos definidos, usando fluxo normal de atendimento e contas de teste adequadas para verificações técnicas.
- **Aceite:** validar uma aceitação real autorizada e os principais estados sem assumir aleatoriamente clientes da operação nem disparar mensagens de teste a eles.

### 097 — Acompanhar métricas de operação
- **Ação e entrega:** observar tempo até aceite, espera, abandono da tela, conflitos, latência, erros e indisponibilidade gráfica; comparar ao baseline.
- **Aceite:** telemetria usa identificadores e agregados mínimos, política de retenção e acesso; conteúdo de mensagens não vai para logs de analytics.

### 098 — Validar o procedimento de reversão
- **Ação e entrega:** ensaiar desligamento da flag e rollback do frontend compatível; documentar tratamento de mudanças aditivas e atendimentos já assumidos.
- **Aceite:** reversão não limpa dados, não remove auditoria e não devolve automaticamente à fila conversas em atendimento; recuperação do domínio é uma decisão explícita.

### 099 — Ampliar a liberação e documentar uso
- **Ação e entrega:** expandir o público após cumprir critérios do piloto; publicar orientação curta sobre departamento, consulta, aceite, conflitos e acesso pelo teclado.
- **Aceite:** responsáveis operacionais conhecem o significado do contador, como retornar ao chat e como reportar erro sem divulgar dados sensíveis.

### 100 — Encerrar com rastreabilidade
- **Ação e entrega:** revisar as 100 etapas, vincular evidências, PRs, commits, versão online e resultados do banco aplicáveis; registrar pendências reais e responsável por acompanhamento.
- **Aceite:** somente itens comprovados são concluídos. A entrega funcional é encerrada após produto e validações confirmarem o fluxo; este plano continua pendente até execução autorizada.

## Dependências e marcos de controle

| Marco | Etapas | Evidência exigida para avançar |
|---|---|---|
| Escopo fechado | 001–010 | Regras de elegibilidade e decisões de produto registradas. |
| Arquitetura conhecida | 011–020 | Fontes dos dados, autorização e mecanismo de atribuição mapeados. |
| UX validada | 021–030 | Protótipo revisado com fluxo e estados. |
| Design especificado | 031–040 | Estados, acessibilidade e fallback aprovados. |
| Leitura protegida | 041–050 | Contrato, paginação e contagem coerentes. |
| Aceite exclusivo | 051–060 | Concorrência e reconciliação definidas e verificáveis. |
| Entrada integrada | 061–070 | Botão no local correto, navegação e rascunho preservados. |
| Experiência completa | 071–080 | Cartões, mensagens e aceite ligados ao domínio real. |
| Qualidade comprovada | 081–090 | Testes, desempenho e homologação documentados. |
| Publicação encerrada | 091–100 | Release autorizado, verificação online, operação e reversão. |

## Critérios globais de conclusão futura

- TALK ME ocupa a posição aprovada e apresenta a estética de metal líquido com fallback utilizável.
- A tela apresenta atendimentos do departamento autorizado que atendem à regra aprovada de “ainda não aceito”.
- Cada cartão mostra dados reais disponíveis e mensagens apropriadas, com tratamento de ausência, mídia e conteúdo longo.
- A navegação é manual, acessível e utilizável em filas grandes, sem trocar inadvertidamente o alvo do aceite.
- Aceitar atribui exatamente um responsável, respeita as permissões no instante da operação e abre o atendimento correto.
- Contador, lista, chat e demais atendentes convergem para o estado confirmado pelo servidor.
- A experiência anterior do Inbox, inclusive rascunhos e modo Zen, permanece utilizável.
- Testes e release têm evidências; limitações conhecidas não são omitidas no encerramento.

## Registro desta entrega documental

A única alteração pretendida por este commit é este arquivo Markdown. Não existe implementação do TALK ME vinculada a este documento. Controles de planejamento, consultas de código e conferência de numeração não constituem execução das 100 etapas. O próximo passo depende de autorização do usuário para iniciar a implementação.
