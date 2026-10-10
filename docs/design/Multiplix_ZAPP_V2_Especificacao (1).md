# MULTIPLIX — ZAPP Web V2
## Uma mensagem. Várias conversas. Zero complicação.

**Documento de produto, experiência e integração — proposta v1.0**  
**Data de referência:** 25/09/2026  
**Escopo:** módulo operacional de comunicação individual para múltiplos destinatários.  
**Entrega:** protótipo HTML navegável e especificação para implementação. Nenhuma alteração foi feita no repositório, no banco ou no sistema em produção.

---

## 1. Decisão de produto

O Multiplix não deve ser uma cópia compactada do Campanhas. A proposta é uma bancada de comunicação cotidiana: o usuário escolhe com quem falar, prepara a mensagem uma única vez, confere as exceções e acompanha os retornos sem perder o contexto do ZAPP.

**Campanhas planeja ações. Multiplix resolve comunicações.**

A distinção é de intenção e fluxo, não apenas de quantidade. Enviar uma cotação a vários fornecedores continua sendo uma ação operacional, mesmo quando o público é grande. Uma campanha com poucos destinatários pode continuar exigindo planejamento, objetivos e relatórios próprios.

| Dimensão | Campanhas / Talk X | Multiplix proposto |
|---|---|---|
| Ponto de partida | Planejamento de uma campanha | Necessidade imediata de falar com várias pessoas |
| Entrada principal | Visão geral e editor de campanha | Bancada de composição aberta |
| Processo | Assistente estruturado | Público, mensagem e prévia simultâneos |
| Conteúdo | Peça de campanha | Blocos cotidianos de texto, voz e arquivos |
| Público | Segmento de uma ação | Contatos avulsos, ramos e públicos combinados |
| Reutilização | Duplicar campanha | Reusar mensagem, voz ou seleção independentemente |
| Resultado central | Desempenho da campanha | Conversas iniciadas, respostas e próximos passos |
| Infraestrutura | Serviços existentes | Reutilização seletiva dos serviços, sem duplicar regras |

O nome “Multiplix” será um item próprio na navegação. Não haverá, nesta área do operador, configuração de APIs, credenciais, criação administrativa de conexões ou administração da clonagem de voz.

## 2. Pesquisa e evidências utilizadas

A pesquisa foi documental, em páginas oficiais dos fornecedores, acompanhada de leitura direcionada de arquivos do repositório `adm01-debug/Zapp_Web_V2`. Não incluiu teste autenticado das interfaces dos concorrentes, auditoria integral do repositório ou comprovação das integrações em produção. As funcionalidades novas deste documento são propostas, não afirmações de que já existem no sistema.

### 2.1 Padrões que valem adaptar

**Respond.io:** o fluxo documentado combina segmentação, prévia, envio de teste e distinção entre quantidade de destinatários e mensagens. A adaptação para o Multiplix é manter essas verificações visíveis, mas evitar transformar a comunicação rápida em um assistente longo. [R1]

**Wati — públicos:** a documentação distingue segmentos ativos e estáticos e permite visualizar contatos antes de salvar. A adaptação é separar claramente a regra de um público da lista efetivamente aprovada para um envio. [R2]

**Wati — mídia individualizada:** a plataforma documenta substituição de mídia por atributos do contato em campanhas. A inspiração é permitir ativos por destinatário; o áudio clonado personalizado descrito aqui é uma proposta do Multiplix, não uma funcionalidade atribuída a essa página da Wati. [R3]

**ElevenLabs:** a integração de texto para fala e as possibilidades de voz fundamentam o estúdio de áudio proposto. A interface deve separar roteiro, voz, preparação do arquivo e envio. [R4]

Não é necessário copiar a aparência, o código ou as marcas dos concorrentes. Devem ser adaptados os padrões de interação que resolvem o problema, mantendo a identidade do ZAPP.

### 2.2 Achados específicos do projeto

| Evidência consultada | Constatação delimitada | Consequência para o Multiplix |
|---|---|---|
| `docs/talkx/ARQUITETURA.md` | Documenta componentes, tabelas, scheduler, envio via Evolution e tratamento de eventos. | Investigar e reutilizar serviços. Não criar um segundo universo de mensagens sem contexto. |
| `src/components/talkx/useCampaignEditor.ts` | Define quatro etapas, fontes de público, variáveis e tipos de mídia. | Reaproveitar capacidades; substituir o fluxo obrigatório por composição simultânea. |
| `src/hooks/integrations/useTalkXSegments.ts` | O modelo de regras consultado não expõe ramo de atividade. | Mapear o campo organizacional correto antes de implementar o filtro. |
| Mesmo arquivo | O seletor de tipos lista cliente, lead, fornecedor e parceiro; transportadora não aparece como opção própria. | Verificar a modelagem existente e representar transportadoras sem classificá-las por suposição. |
| Mesmo arquivo | `resolveAudience` tem limite padrão de 5.000 registros. | Não confundir amostra carregada no navegador com “todos os resultados”. Materializar o público completo no servidor. |
| Mesmo arquivo | `updated_at` aparece com o rótulo “Última interação”. | Usar um evento real de comunicação para critérios de última interação; uma edição cadastral não deve alterar esse significado. |
| `supabase/functions/elevenlabs-tts/index.ts` | A função consultada requer autenticação, lê a chave no servidor e retorna MP3. Há limitação de requisições por usuário. | Não disparar uma chamada por destinatário diretamente no navegador. Preparar voz em fila, com reaproveitamento e controle de custo. |
| `src/styles/tokens.css` | Tokens de cor, tipografia, raios e estados; fontes Plus Jakarta Sans e Outfit. | Usar o design system compartilhado na implementação, e não criar estilos desconectados. |

Esses achados descrevem os arquivos consultados. A ausência de um campo nesse construtor não prova ausência no banco inteiro. As referências de código estão em [C1] a [C5].

## 3. Casos de uso prioritários

### Compras: solicitar a mesma cotação

O operador seleciona fornecedores de embalagens, restringe a região quando isso fizer sentido, inclui um contato avulso e remove uma empresa específica. Prepara uma introdução por texto, um áudio com as condições gerais e, opcionalmente, um documento com a especificação. Cada fornecedor recebe uma conversa individual. A lista de fornecedores não é exposta aos demais.

O Multiplix não deve inventar valores, prazos ou requisitos. Dados do pedido só entram quando forem explicitamente fornecidos ou recuperados de fonte autorizada e confirmada.

### Logística: alinhar coleta

O operador escolhe transportadoras pertinentes, compõe um aviso e acrescenta um áudio. Informações específicas de pedido, destino, volume e janela de coleta não podem ser compartilhadas indiscriminadamente. Havendo diferenças por destinatário, o bloco precisa de uma variável válida ou de uma seleção separada.

### Comercial: comunicação com clientes

O usuário escolhe contatos da carteira permitida, usa um roteiro aprovado internamente e personaliza a saudação. A relação comercial ou a presença no CRM não devem ser interpretadas automaticamente como autorização para qualquer comunicação.

### Aviso simples a contatos avulsos

Selecionar pessoas, escrever uma frase, revisar e enviar deve funcionar sem exigir salvar público, cadastrar campanha, escolher objetivo ou dar um nome obrigatório à ação. O título pode ser sugerido a partir do conteúdo, mas permanece editável.

## 4. Arquitetura de informação e navegação

A navegação principal terá quatro destinos:

**Novo envio:** bancada operacional padrão.

**Públicos salvos:** regras reutilizáveis e listas fixas, com origem, proprietário, tamanho e última utilização. O tamanho de um público nunca substitui a contagem de aptos do envio atual.

**Biblioteca:** mensagens, sequências de blocos e ativos reutilizáveis. Rascunho interno e modelo aprovado pelo WhatsApp são entidades diferentes e precisam de rótulos distintos.

**Histórico:** ações anteriores, rascunhos, agendamentos, resultados e acesso ao monitor. O retorno às conversas deve abrir o Chat existente com o contexto correto, não criar um inbox concorrente.

A entrada em Novo envio não deve exigir um formulário intermediário. O envio pode nascer também da seleção de contatos no CRM ou no módulo de Contatos, preservando o contexto e as permissões da origem.

## 5. Direção visual

A proposta visual é **DarkBlue operacional**, com superfícies azul-marinho em camadas, ação primária azul e indicadores semânticos discretos. O estúdio de voz ganha destaque através de uma forma de onda e um pequeno elemento visual de voz, não através de um painel inteiro com cores extravagantes.

Na implementação, as cores, fontes, bordas e espaçamentos devem derivar dos tokens compartilhados. O HTML fornecido é uma representação autônoma dessa direção e usa fontes de fallback quando as fontes do produto não estão instaladas.

### Composição desktop

A tela utiliza três regiões principais. A esquerda é dedicada ao público; o centro recebe a maior área, pois é onde o trabalho acontece; a direita mostra prévia e aptidão. O rodapé contém o resumo e a ação principal. O menu global permanece reconhecível.

Os rótulos 01, 02 e 03 identificam áreas de trabalho, não etapas bloqueantes. O usuário pode voltar a qualquer área a qualquer momento, sem perder o que já digitou ou gravou.

Não usar grandes cartões estatísticos no topo da criação. Não usar gráficos decorativos sem dados. Não transformar o editor em uma página promocional. A personalidade deve vir da composição, tipografia, proporções e comportamento.

### Comportamento responsivo

Em telas largas, manter as três regiões simultâneas. Em uma largura intermediária, usar duas colunas e deslocar a prévia para baixo. Em celular, exibir público, composição e revisão em sequência, preservando seleção e rascunho. A adaptação não pode ocultar exclusões, destinatários fora do filtro ou o total de mensagens.

Acessibilidade de produção deve incluir navegação por teclado, foco visível, nomes acessíveis de botões, mensagens de erro associadas aos campos, contraste validado e funcionamento sem depender exclusivamente de cores. A gravação precisa ter controle textual, não apenas uma animação de onda.

## 6. Público: contatos, empresas e relacionamentos

### 6.1 Entidades que não podem ser confundidas

Uma empresa pode ter vários contatos; um contato pode representar mais de uma empresa; um telefone pode ser compartilhado. Cliente, fornecedor e transportadora são relacionamentos de negócio e não necessariamente classes mutuamente exclusivas.

A modelagem proposta deve permitir que uma organização tenha mais de um papel. Isso não significa executar imediatamente uma alteração de banco: primeiro é necessário mapear entidades, vínculos e integrações atuais.

Ramo deve vir de informação organizacional confiável. Pode ser uma taxonomia interna normalizada ou classificação oficial importada quando disponível. Não inferir automaticamente o ramo a partir do nome da empresa. “Não informado” deve ser uma condição explícita.

### 6.2 Seleção combinada

A lógica esperada é:

`público candidato = união das seleções manuais e públicos escolhidos, respeitados os filtros declarados e as exclusões explícitas`

`público do envio = público candidato resolvido, autorizado, deduplicado e apto para os blocos e o canal escolhidos`

O operador deve entender quando está usando “E” e quando está usando “OU”. Uma apresentação possível é: “Fornecedor OU transportadora; estado SP; ramo logística; excluir lista X”. A interface deve traduzir a consulta em uma frase legível e permitir inspecionar o motivo de inclusão de cada contato.

No protótipo, filtros simples demonstram essa seleção. A união de múltiplos segmentos e a avaliação das permissões de produção precisam de implementação no servidor.

### 6.3 Selecionar todos de verdade

Distinguir seleção da página visível de seleção de todos os resultados. Se o usuário escolher todos os resultados, o backend precisa materializar o conjunto completo e retornar uma contagem consistente. Não limitar silenciosamente ao que foi carregado no navegador.

Um filtro novo não deve apagar contatos previamente selecionados. O sistema deve mostrar quantos selecionados estão fora do filtro atual. Uma exclusão manual continua válida mesmo quando o contato também pertence a um segmento selecionado.

### 6.4 Deduplicação

Normalizar o destino com regras adequadas ao canal e ao país. Dentro do envio, eliminar repetições do mesmo destino autorizado de maneira explícita. Não mesclar pessoas ou empresas apenas porque compartilham telefone. Conflitos de identidade e preferências devem ser destacados, sobretudo quando há divergência de autorização.

Um contato vindo do CRM externo precisa ser resolvido para a identidade local adequada antes de criar relacionamentos no banco. Não inserir IDs externos diretamente em chaves estrangeiras locais.

### 6.5 Contato principal por empresa

Oferecer um modo explícito “contato principal por empresa” quando houver esse dado. Não escolher arbitrariamente o primeiro contato da consulta. Caso o operador queira falar com duas pessoas da mesma empresa, deve poder fazê-lo deliberadamente.

### 6.6 Regra dinâmica versus lista aprovada

Uma regra salva pode acompanhar a evolução dos cadastros. Um envio aprovado precisa ter destinatários definidos. O padrão proposto é congelar a lista na revisão, registrar a versão e impedir entradas silenciosas depois da confirmação.

Agendamento com recálculo de público será uma opção avançada. A política deve especificar o que acontece quando o público cresce, quando surge uma nova exceção ou quando o volume excede o que foi autorizado. Mudanças relevantes exigem nova revisão; não são licença para ampliar o envio sem controle.

## 7. Composição por blocos

O conteúdo será uma sequência ordenada. Cada bloco tem tipo, conteúdo, versão, posição e estado de preparação. O padrão inicial deve ser simples: um bloco de texto. O exemplo fornecido inclui texto e voz para mostrar a combinação.

O usuário pode adicionar, remover, duplicar e reordenar blocos. Os controles devem funcionar por teclado além de eventual arrastar e soltar. A prévia acompanha a ordem real de envio.

Uma sequência de três blocos enviada a vinte contatos representa até sessenta mensagens, não vinte. A contagem exata deve considerar os tipos de mensagem do adaptador, eventuais blocos opcionais e falhas de preparação. Não apresentar “N contatos” como equivalente a “N mensagens”.

### Texto

Permitir variáveis de dados verificáveis, prévia por contato e tratamento de campos ausentes. Não deixar `{{empresa}}`, `undefined` ou uma saudação quebrada chegar ao destinatário.

O tratamento de ausência pode ser uma substituição aprovada ou a exclusão do contato daquele envio. A substituição deve aparecer na revisão. Uma IA não deve inventar o nome de alguém para completar a variável.

### Sequências

Preservar a ordem por destinatário. É aceitável processar destinatários em paralelo dentro dos limites do canal, mas não enviar o segundo bloco para alguém antes de resolver o primeiro quando há dependência.

Após uma resposta, o comportamento dos blocos restantes precisa estar definido: interromper uma sequência de acompanhamento pode ser correto; interromper no meio de um conjunto de documentos solicitado pode não ser. Separar “blocos do mesmo envio” de “lembretes futuros”.

### Arquivos

Validar tipo real, extensão, tamanho, acesso e compatibilidade do canal. O arquivo deve estar preparado antes da confirmação final. Validar que uma URL privada continuará acessível ao provedor pelo tempo necessário, sem torná-la pública indefinidamente.

Personalização de arquivos por destinatário exige associação explícita e prévia. Nunca enviar uma proposta comercial individual ao conjunto inteiro por erro de mapeamento.

## 8. Áudio: três experiências distintas

### 8.1 Gravação do operador

Fluxo de produção: solicitar permissão de microfone após ação do usuário, mostrar o dispositivo ativo, iniciar, pausar, retomar, parar, reproduzir e refazer. Corte simples de início e fim é uma evolução útil. Não iniciar captação em segundo plano.

Mostrar tempo decorrido real, estado do microfone e confirmação de que o áudio foi guardado. Se a gravação falhar, preservar o restante da composição. Se o usuário mudar de aba, não descartar o áudio sem aviso.

O protótipo contém gravação local através do navegador quando disponível. Não faz upload e não guarda o áudio no rascunho persistente. A captura em hardware real não foi testada neste ambiente.

### 8.2 Mesmo áudio de IA para todos

O usuário escolhe uma voz permitida e escreve um roteiro comum. A aplicação prepara um arquivo, permite ouvi-lo e reaproveita exatamente essa versão nos destinatários aprovados. Alterar o roteiro ou a voz invalida a aprovação anterior.

Uma variável individual não pode estar escondida no modo de áudio único. Se houver `{{nome}}`, o sistema deve exigir personalização ou remover a variável explicitamente, nunca gerar usando o primeiro contato e distribuir para os demais.

### 8.3 Áudio de IA personalizado

O roteiro-base é resolvido com os dados de cada destinatário. A unidade de geração é o conjunto distinto de roteiro final, voz, modelo e parâmetros. Contatos cujo roteiro final seja idêntico podem compartilhar o mesmo ativo, quando as permissões permitirem.

Isso permite dizer o primeiro nome ou mencionar a empresa sem obrigar o operador a gravar repetidamente. A personalização deve ser opcional e visualmente explícita. A experiência de voz não deve fingir que um áudio foi gravado ao vivo especificamente para a pessoa.

### Voz autorizada

O operador escolhe entre vozes disponíveis para seu perfil. A autorização e a origem da voz precisam ser verificáveis, não apenas uma caixa marcada no envio. Na clonagem profissional da ElevenLabs, a criação deve ser feita e verificada pelo próprio titular; uma voz de terceiro pode ser compartilhada pelo titular conforme os mecanismos do serviço. [R5]

A administração do catálogo, chaves e concessões de uso fica fora da bancada do operador. A revogação de uma voz deve impedir novas gerações e acionar a política definida para ativos pendentes.

### Preparação e custo

Antes de produzir muitos áudios, exibir quantos roteiros distintos serão gerados, o modelo selecionado, a estimativa de consumo e o limite autorizado. O valor deve vir do plano e dos parâmetros efetivos, não de uma tabela fictícia.

Uma fórmula de planejamento é: somar o consumo estimado das versões distintas, acrescentar as cobranças aplicáveis do canal e apresentar separadamente eventual custo de processamento. Não prometer “custo de um áudio” quando cada contato recebe um roteiro diferente.

O cache deve ser privado e associado ao workspace, à permissão de voz, ao roteiro e à versão dos parâmetros. O arquivo aprovado deve ser reutilizado no envio; não regenerar silenciosamente outra interpretação da fala.

### Pronúncia e compatibilidade

A prévia deve ajudar a revisar nomes, siglas, quantidades e marcas. Ajustes de pronúncia não podem alterar os dados comerciais. Modelos diferentes podem oferecer controles diferentes; a interface só expõe os que a integração suporta.

O endpoint do projeto consultado retorna MP3. A implementação precisa verificar o formato, o codec, o contêiner e a sinalização aceitos pelo provedor para entregar áudio comum ou nota de voz. Ter um arquivo de áudio não comprova, sozinho, que ele aparecerá como mensagem de voz nativa. [C4]

## 9. Prévia, aptidão e confirmação

A prévia troca o destinatário sem modificar a composição. Deve mostrar o texto final e o ativo exato aprovado, com campos ausentes e incompatibilidades visíveis.

Classificações propostas: apto agora, exige modelo, sem autorização suficiente, destino inválido, bloqueado por preferência, mídia pendente, conexão indisponível e restrição de permissão. O operador deve enxergar motivo e ação possível; não basta um total vermelho.

As verificações de produção devem acontecer em dois momentos: antes da confirmação e imediatamente antes da transmissão. Uma lista congelada não autoriza ignorar mudanças de preferência, conexão ou permissão.

A política consultada do WhatsApp exige opt-in e respeito ao opt-out. Na Business Platform, mensagem livre depende da janela de 24 horas aberta pela mensagem do usuário; fora dela, usa-se modelo aprovado. Enviar o modelo, por si só, não equivale a receber uma resposta. [R6]

A proposta, portanto, não mistura os destinatários inelegíveis no botão de envio livre. Pode oferecer uma ação separada de reabertura permitida e um acompanhamento posterior à resposta. Não trocar silenciosamente o conteúdo nem prometer proteção absoluta contra bloqueios.

O envio de teste real também exige destinatário permitido e conta como mensagem. O “teste” do HTML é somente uma prévia local.

## 10. Execução, filas e falhas

### Estados do envio

`rascunho → em preparação → pronto para revisão → agendado ou em fila → enviando → concluído / concluído com falhas / cancelado`

`enviando ↔ pausado`

“Concluído” significa que não restam tarefas pendentes de transmissão segundo a política definida. Não é sinônimo de todas as mensagens entregues ou lidas.

Cada destinatário também tem estados próprios; cada bloco transmitido tem um registro próprio. Um destinatário pode ter recebido o primeiro bloco e ter falhado no segundo. Não reduzir esse caso a sucesso total.

### Fila persistente

O navegador não será o motor de envio. Fechar a aba, atualizar a página ou trocar de computador não deve perder a ação aprovada. A execução precisa de tarefas persistentes, trabalhadores com identificação de posse e proteção contra processamento concorrente do mesmo item.

### Idempotência e confirmação ambígua

Aplicar chaves de idempotência na criação da ação, na confirmação e nos itens de transmissão. O identificador deve incluir versão do envio, destinatário, bloco e canal quando pertinente.

Uma falha de rede depois da aceitação pelo provedor é um estado ambíguo. Não reenviar automaticamente apenas porque a interface não recebeu a resposta. Conciliar com identificadores e eventos do provedor. Se ele não oferecer garantia suficiente, expor a incerteza e uma ação de revisão. Não prometer entrega exatamente uma vez em uma integração que não permite essa garantia.

### Pausa e cancelamento

Pausa impede novas transmissões pendentes; requisições já iniciadas podem terminar. Cancelamento encerra o que ainda não saiu. Não pode ser apresentado como “desenviar” mensagens entregues.

### Novas tentativas

Separar erro transitório de erro permanente. Uma indisponibilidade temporária pode ser tratada com nova tentativa limitada; número inválido, opt-out e proibição do canal não são resolvidos aumentando tentativas.

Aplicar espera progressiva e limites por conexão e por usuário conforme a capacidade real do serviço. A finalidade é confiabilidade e respeito às regras, não evasão de detecção ou disfarce de automação.

## 11. Retornos: a parte que transforma envio em trabalho concluído

### Sala de retornos, sem um segundo Chat

Criar uma visão filtrada do Chat existente a partir do envio. Ela mostra destinatários, respostas, responsável e próximo passo. Abrir uma linha leva à conversa original com o contexto do Multiplix.

Para Compras, essa visão pode apoiar um quadro “aguardando resposta / respondeu / cotação recebida / exige ação”. Esses estados operacionais não devem ser confundidos com delivery/read do provedor. O recebimento de qualquer mensagem não prova que uma cotação chegou.

### Atribuição honesta

Sempre que houver identificador de resposta, usar esse vínculo. Sem ele, uma atribuição temporal é uma hipótese e deve ser marcada como inferida. Não associar automaticamente toda mensagem futura do contato ao último Multiplix.

### Automação assistida

Resumir respostas, sugerir tarefa e apontar pendências são evoluções úteis. A IA não deve inventar preço nem converter um áudio ambíguo em compromisso confirmado. Valores e condições devem preservar o acesso à evidência original.

Não transferir ou expor uma conversa de um fornecedor a outro. Ao criar tarefa, incluir somente as informações necessárias para a equipe autorizada.

## 12. Diferenciais propostos

**Enviar a partir do contexto:** iniciar o Multiplix a partir de uma seleção no CRM, de fornecedores vinculados a um projeto ou de uma lista de transportadoras, mantendo os vínculos e o escopo permitido.

**Seleção por linguagem natural, com conferência:** interpretar “fornecedores de embalagens de São Paulo” em filtros estruturados suportados. Mostrar os filtros produzidos e o público resultante. Nunca transformar uma frase diretamente em disparo e nunca ampliar a base porque a interpretação falhou.

**Pressão de contato unificada:** mostrar comunicações recentes provenientes de Campanhas e Multiplix e alertar quando a pessoa já foi acionada. A regra precisa considerar finalidade e contexto; um aviso operacional necessário não deve ser confundido com uma repetição de marketing.

**Repetir com inteligência:** duplicar o conteúdo sem reenviar cegamente aos mesmos destinatários. Oferecer filtros explícitos de não respondidos, falhas corrigíveis ou novos contatos — todos sujeitos a nova revisão e autorização.

**Nome sugerido da ação:** sugerir um título interno a partir do público e do assunto, permitindo editar. Não obrigar o operador a “cadastrar uma campanha” para enviar um aviso.

## 13. Integração recomendada

Criar uma interface e um domínio operacional próprios, mas compartilhar a infraestrutura de comunicação já existente. Não copiar o código de `talkx-send` para uma função independente que passe a divergir nas regras.

### Interface sugerida

Componentes conceituais: `MultiplixView`, `MultiplixAudiencePanel`, `MultiplixComposer`, `MultiplixVoiceBlock`, `MultiplixPreview`, `MultiplixReview` e `MultiplixMonitor`.

Esses nomes são sugestões, não arquivos criados no repositório. Devem seguir as convenções efetivas da aplicação, a navegação existente e o carregamento de views utilizado pelo projeto.

### Serviços compartilhados

Extrair ou reutilizar resolução de identidade, avaliação de preferência e canal, preparação de mídia, renderização de variáveis, enfileiramento, envio pelo provedor e processamento de eventos. A extração precisa de testes de regressão de Campanhas antes da adoção pelo Multiplix.

A documentação consultada cita Evolution como caminho de envio. Isso não comprova, por si só, a modalidade ou conformidade de cada conexão implantada. O adaptador de produção deve declarar capacidades e limites reais da conexão utilizada. [C1]

### Entidades propostas

| Entidade conceitual | Responsabilidade |
|---|---|
| `multiplix_dispatches` | Dono, workspace, origem, objetivo interno, estado, versão e agendamento |
| `multiplix_blocks` | Ordem, tipo, conteúdo versionado, regras de personalização e ativos |
| `multiplix_recipients` | Identidade resolvida, destino, versão de público e resultado de aptidão |
| `multiplix_delivery_items` | Uma unidade destinatário × bloco, com tentativas e identificador externo |
| `multiplix_events` | Histórico de transições, auditoria e correlação de retornos |
| Ativos de voz compartilhados | Roteiro final, voz, modelo, parâmetros, autorização, hash e armazenamento |

Os nomes e a necessidade de novas tabelas dependem de validar o esquema existente. Se já houver entidade compartilhada com a mesma responsabilidade, preferir a reutilização. Não executar migration a partir deste documento sem essa análise.

Mensagens e eventos devem identificar sua origem como Multiplix sem quebrar o histórico único de conversas. Os relatórios de Campanhas não devem incorporar envios operacionais involuntariamente.

### Fronteiras de API

Resolver público, preparar prévia, estimar geração, preparar áudios, revisar, confirmar envio e consultar execução são operações diferentes. Preparar não autoriza enviar. A confirmação deve vincular a versão exata do público e dos blocos. Qualquer alteração posterior exige nova revisão.

## 14. Segurança, privacidade e observabilidade

Isolar dados por workspace e pelas permissões reais do usuário. Listas, contagens, amostras, histórico, mídia e exportações devem respeitar o mesmo escopo. Não proteger apenas o botão da interface e deixar a consulta agregada expor a base inteira.

Chaves de APIs permanecem no servidor. Arquivos sensíveis devem usar armazenamento privado, acesso controlado e política de retenção. Logs devem conter identificadores de correlação e códigos de erro suficientes para investigar incidentes sem registrar desnecessariamente roteiros ou conteúdos privados.

Registrar quem compôs, quem revisou, qual público foi aprovado, qual voz foi utilizada, quais parâmetros e ativos foram enviados e o que foi excluído. Auditoria é diferente de exposição indiscriminada do conteúdo para todo administrador operacional.

A política de proteção de dados e as permissões contratuais de voz precisam ser validadas com os responsáveis da empresa. O documento não declara conformidade jurídica automática nem substitui uma análise aplicável ao tratamento real.

Observar tempo de fila, falhas por tipo, latência de geração, consumo estimado versus realizado, eventos não conciliados e itens bloqueados após revisão. Alertas devem ter ação possível e responsável, não apenas números vermelhos.

## 15. Priorização

### Primeira entrega funcional: todo o núcleo solicitado

A primeira versão de produção deve contemplar seleção manual, clientes, fornecedores e transportadoras, filtro de ramo baseado em dados reais, texto, gravação, TTS com voz autorizada, prévia, revisão, bloqueios, fila persistente e histórico. Não relegar a voz ElevenLabs ou a seleção por ramo a uma promessa futura, pois fazem parte do pedido central.

O áudio único gerado e reutilizado pode ser o primeiro modo de IA. Se personalização por destinatário estiver habilitada, deve ter custo, cache e geração em fila desde o início; não simular que ela funciona no produto real.

### Evolução operacional

Públicos combinados avançados, listas dinâmicas, permissões de compartilhamento de biblioteca, respostas vinculadas ao Chat, pressão de contato entre módulos, agendamento com política de alterações e conversão de respostas em tarefas.

### Evolução assistida

Seleção em linguagem natural, auxílio na redação e pronúncia, classificação assistida das respostas e recomendações de próxima ação. Todas devem operar sobre dados e capacidades existentes e preservar a confirmação do operador.

## 16. Critérios de aceite de produção

| Área | Critério verificável |
|---|---|
| Escopo | O usuário não vê nem conta contatos fora de sua permissão. |
| Ramo | O filtro usa o cadastro canônico, sem inferir classificação pelo nome. |
| Relacionamentos | Uma empresa com múltiplos papéis não desaparece por exclusividade indevida. |
| Seleção | União de fontes não duplica a transmissão ao mesmo destino autorizado. |
| Amostragem | “Selecionar todos” inclui o conjunto completo, não apenas 5.000 ou a página atual. |
| Exclusões | A remoção manual prevalece sobre uma inclusão por segmento. |
| Variáveis | Nenhum placeholder desconhecido ou dado ausente passa sem tratamento aprovado. |
| Voz única | Uma mesma geração aprovada é reutilizada; não se usa o nome do primeiro contato para todos. |
| Voz individual | Quantidade de versões e consumo são calculados sobre roteiros finais distintos. |
| Autorização de voz | Usuário sem acesso não gera nem recupera ativos daquela voz. |
| Mídia | Arquivo inválido, expirado ou inacessível bloqueia o item antes de transmitir. |
| Revisão | Alterar o público, a mensagem ou a voz invalida a confirmação anterior. |
| Preferências | Mudança relevante depois da revisão é respeitada na execução. |
| Concorrência | Duplo clique e dois trabalhadores concorrentes não criam duplicações locais. |
| Timeout | Resposta ambígua do provedor não dispara reenvio cego. |
| Ordem | Blocos dependentes mantêm a sequência por destinatário. |
| Interrupção | Pausar ou cancelar não promete desfazer mensagens já transmitidas. |
| Persistência | Fechar o navegador não perde a execução aprovada. |
| Métricas | Entregue, lido, ouvido e respondido não são tratados como equivalentes. |
| Respostas | Atribuição incerta é identificada como inferida. |
| Regressão | Campanhas e Chat preservam seus fluxos existentes. |
| Acessibilidade | Todos os controles essenciais funcionam por teclado com foco e rótulos adequados. |

## 17. O que o protótipo entregue faz — e o que não faz

O arquivo `Multiplix_ZAPP_V2_Prototipo.html` é autônomo e não depende de bibliotecas remotas. Ele demonstra uma base de 18 contatos fictícios, com 8 selecionados no estado inicial. Os contadores são derivados desses registros; não são indicadores da empresa.

Funciona no HTML: navegação interna, busca, filtros, seleção e exclusão, contagem de aptos, prévia por destinatário, edição de texto, variáveis, reordenação, composição por blocos, modo de roteiro comum ou personalizado, biblioteca com confirmação de substituição, listas locais, rascunho local, planejamento ilustrativo e execução simulada com pausa e histórico. A captura de microfone depende das permissões e capacidades do navegador.

Não está conectado: Supabase, CRM 360, WhatsApp, ElevenLabs, cobrança, geração de voz, upload remoto, consulta real de opt-in, validação real de destino ou worker de agendamento. A forma de onda de IA é ilustrativa. Os arquivos selecionados são representados pelos metadados; o protótipo não transmite seu conteúdo.

Para visualizar, abrir o HTML em um navegador desktop. Um visualizador de arquivos do aplicativo de mensagens pode não executar JavaScript. A imagem PNG fornecida mostra a tela inicial em 1920 × 1080 e pode ser consultada sem executar o protótipo.

O formulário de agenda guarda somente uma intenção local; não dispara no horário. O monitor não deve ser adaptado para produção substituindo apenas as mensagens do toast: o motor de fila real precisa ser de servidor.

## 18. Validação do protótipo

Foram exercitados 25 testes automatizados de interface em Chromium: contagem inicial, distinção entre contatos e mensagens, busca com seleção persistente, filtros combinados, exclusão individual, personalização da prévia, explicação de bloqueio, variações de roteiro, reordenação, validação de conteúdo, confirmação, Escape, pausa, retomada, histórico, biblioteca, seleção de transportadoras, lista vazia, selecionar todos, quatro larguras de tela, ausência de erros JavaScript e ausência de solicitações de rede.

As quatro larguras verificadas foram 1920 × 1080, 1440 × 900, 1024 × 1000 e 390 × 844, sem transbordamento horizontal nos estados avaliados. Isso não constitui auditoria completa de acessibilidade ou compatibilidade entre navegadores.

Não foram testados: hardware de microfone real, serviços externos, persistência local em todos os ambientes ou equivalência visual com a versão implantada do ZAPP. As APIs não conectadas não foram “aprovadas” por esses testes.

## 19. Resultado pretendido

O Multiplix deve permitir que a equipe trabalhe com muitos destinatários mantendo a clareza de uma conversa individual. O ganho não é simplesmente disparar mais mensagens: é reduzir repetição, evitar enganos de público, usar voz de forma controlada e acompanhar o que cada pessoa respondeu.

**Uma bancada de comunicação rápida, com a infraestrutura e a responsabilidade de um produto operacional.**

---

## Referências públicas consultadas

[R1] Respond.io — How to Send a Simple Broadcast. https://respond.io/help/broadcasts/sending-a-simple-broadcast

[R2] Wati — How to create and use custom segments in Wati. https://support.wati.io/en/articles/14192386-how-to-create-and-use-custom-segments-in-wati

[R3] Wati — How to send personalized media content in a Campaign. https://support.wati.io/en/articles/11463450-how-to-send-personalized-media-content-in-a-campaign

[R4] ElevenLabs — Text to Speech. https://elevenlabs.io/docs/overview/capabilities/text-to-speech

[R5] ElevenLabs — Voice Cloning overview, especialmente regras de Professional Voice Cloning e compartilhamento. https://elevenlabs.io/docs/eleven-creative/voices/voice-cloning

[R6] WhatsApp — Business Messaging Policy. https://business.whatsapp.com/policy

## Referências do repositório consultado

[C1] `docs/talkx/ARQUITETURA.md` — https://github.com/adm01-debug/Zapp_Web_V2/blob/main/docs/talkx/ARQUITETURA.md

[C2] `src/components/talkx/useCampaignEditor.ts` — https://github.com/adm01-debug/Zapp_Web_V2/blob/main/src/components/talkx/useCampaignEditor.ts

[C3] `src/hooks/integrations/useTalkXSegments.ts` — https://github.com/adm01-debug/Zapp_Web_V2/blob/main/src/hooks/integrations/useTalkXSegments.ts

[C4] `supabase/functions/elevenlabs-tts/index.ts` — https://github.com/adm01-debug/Zapp_Web_V2/blob/main/supabase/functions/elevenlabs-tts/index.ts

[C5] `src/styles/tokens.css` — https://github.com/adm01-debug/Zapp_Web_V2/blob/main/src/styles/tokens.css

As referências em `main` podem mudar. Os achados se referem ao conteúdo retornado durante esta análise, não a uma garantia de que futuros commits preservarão a mesma implementação.
