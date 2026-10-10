# Revisão dos testes — Inbox e contratos associados

Status: **SEMANTIC_REVIEW_COMPLETE**. Fonte `da307ba5626dce892f0b37cb6762463f55d14a96`. Arquivos adjudicados: **125/125**; linhas efetivamente lidas: **18903/18903**. Suíte não executada.

Leitura integral dos corpos, assertions, fixtures e mocks; confronto de consumidor quando necessário. Nenhuma suíte, banco, browser, microfone ou serviço executado. Roster/journal isolados não contam como revisão.

Autoria das leituras: inbox: 80 arquivos, root: 45 arquivos. Cada arquivo é contado uma vez; registros peer são preservados por conteúdo e hash.

## 001 — src/adapters/__tests__/inboxAdapter.test.ts

Leitura integral 1–23. Revisor: `inbox`. Blob `1b3f72a75e4bba34afda22b06cd34e8b8e6d40b9`; SHA-256 `00f37771246f739888831dc70c741903115948522987c069e82cd65a1df5c015`.

**Adjudicação.** Teste unitário útil de parsing, com controle negativo; não é teste do mapper duplo do consumidor.

**O que os asserts demonstram:**

- Adapter real hidrata location do JSON canônico e rejeita JSON malformado.

**Mocks/fixtures:**

- Duas linhas mínimas de mensagem, cast as never; nenhum mock do adapter.

**Limites:**

- Não atravessa useMessages→ChatPopup nem confere preservação de external_id/is_deleted/link_preview; passar este teste não contradiz INB-023.

**Relação com achados.** R2-INB-023: campo válido pode ser perdido depois pelo popup.

## 002 — src/components/catalog/__tests__/ContactSelectionStep.test.tsx

Leitura integral 1–286. Revisor: `inbox`. Blob `5f701167bb88e1d294485a3bfea1ea693c56c72c`; SHA-256 `a70071d2d930f25120b3689fd675b8dc1873a47f985c4fab3d7e9b71d4fb8aea`.

**Adjudicação.** Cobertura de apresentação e callbacks com casos positivos/negativos; nomes de etapas não ampliam a prova para o hook/backend.

**O que os asserts demonstram:**

- Estado do botão por seleção/envio/bloqueio/prontidão; callbacks de seleção e link Criar contato.
- Apresentação de thumb/modelo/variação, telefone formatado, avatar e radio; dedupe/ordem de recentes fornecidos.
- Mensagem de mínimo de caracteres, contador de progresso recebido e região aria-live de prontidão.

**Mocks/fixtures:**

- ContactSelectionStep e Dialog reais; hook de recentes substituído; todos os contatos, readiness e progresso vêm de props controladas.

**Limites:**

- CT-43 verifica aviso com um caractere, não a ausência de uma consulta real; CT-46 comprova render do contador recebido, não produção do progresso pelo envio.
- Não chama onSend nem valida pipeline, RLS, busca paginada, entrega ou tecnologia assistiva real; não executado nesta auditoria.

## 003 — src/components/contacts/__tests__/BulkActionsBar.test.tsx

Leitura integral 1–132. Revisor: `inbox`. Blob `6169b5dea117e36293b4f31b909a7a54dc2a1f28`; SHA-256 `099b49cf5206697935b6a6c0b9ec2ecb3669acb899128e8bc50ed8fe91ef253b`.

**Adjudicação.** Testes de contrato úteis para exclusão por contagem; limites do mock de UPDATE permanecem explícitos.

**O que os asserts demonstram:**

- Tag é acrescentada apenas ao contato sem ela; atribuição/tipo produzem payloads esperados.
- DELETE usa RPC e quantidade retornada; retorno parcial avisa, zero/null conserva seleção e não anuncia sucesso.

**Mocks/fixtures:**

- BulkActionsBar real; Supabase mock guarda payload/filtro, consultas retornam tags locais e RPC retorna contagem controlada; toast simulado.

**Limites:**

- from não distingue tabelas; UPDATE sem linhas afetadas retorna somente error, sem comprovar persistência/ACL.
- Testes de zero/null são específicos da RPC DELETE e não atestam as outras mutations; nenhuma chamada viva executada.

## 004 — src/components/contacts/__tests__/BulkActionsBarTypeGate.test.tsx

Leitura integral 1–75. Revisor: `inbox`. Blob `e78e70c24e5d6779103b1a9a36c75ea62588dab3`; SHA-256 `f3b242783c707af5c0f4f3d9e9a871985f71eb13ae2dad1b9a6b5dab2cfac505`.

**Adjudicação.** Controles úteis da regra visual declarada, separados da autorização efetiva no servidor.

**O que os asserts demonstram:**

- Predicado canChangeSelectedContactsType nega seleção conhecida sem permissão, permite true, devolve undefined fora da página e permite informação pendente.
- Botão Tipo fica disabled com title para false e habilitado para true.

**Mocks/fixtures:**

- Predicado e barra reais com uma seleção de fixture; callbacks noop; nenhuma consulta de permissões executada.

**Limites:**

- Comentário que equipara can_delete a autorização de UPDATE não prova a policy do banco.
- Não testa escrita aceita/negada, seleção mista ou retorno tardio de RPC no consumidor completo; habilitar enquanto desconhecido é expectativa codificada, não validação de ACL.

## 005 — src/components/contacts/__tests__/CT51_52_sendProduct.test.tsx

Leitura integral 1–231. Revisor: `inbox`. Blob `9aeeecda5771684a1ed52c1dab14ac25d6a3e530`; SHA-256 `036dd8d5d00b4994b27c574b33af70c2fa0a3ddc90bfce97c40b685c89e08570`.

**Adjudicação.** Teste de wiring coerentemente delimitado; não foi apresentado como homologação do transporte.

**O que os asserts demonstram:**

- Botão Enviar produto abre o catálogo real e encaminha id/nome/telefone/avatar do contato ao dialog de envio.
- Telefone ausente/curto bloqueia o botão e impede abertura; telefone válido habilita.

**Mocks/fixtures:**

- ContactDetailPanel e ExternalProductCatalog reais; hooks de catálogo/favoritos controlados, filhos do painel substituídos, card e SendProductDialog como stubs que expõem props.

**Limites:**

- A prova termina na entrada do SendProductDialog: não envia produto, não testa edição/validação interna, disponibilidade da conexão ou RLS.
- Comentário de decisão histórica é contexto versionado, não nova autorização nesta auditoria.

## 006 — src/components/contacts/__tests__/ContactCatalogSendHistory.test.tsx

Leitura integral 1–68. Revisor: `inbox`. Blob `8c353069087c04e6fb7aede2563f8fb3a8666a90`; SHA-256 `f541d18adf8ea1f369b06d04746cc14f8100740b19a27adec469c6e897e65864`.

**Adjudicação.** Boa cobertura dos estados visuais do bloco, sem concluir isolamento/entrega pelo dado mockado.

**O que os asserts demonstram:**

- Bloco de histórico passa contactId ao hook e renderiza produto/variação/status; distingue loading, vazio e erro.

**Mocks/fixtures:**

- ContactCatalogSendHistory real, hook totalmente mockado com uma linha sent e três estados alternativos.

**Limites:**

- O recorte por destinatário é demonstrado apenas na prop do hook; RLS, filtro real, paginação, persistência do evento e status de entrega ficam fora.

## 007 — src/components/contacts/__tests__/ContactDeleteEntryPoints.test.tsx

Leitura integral 1–90. Revisor: `inbox`. Blob `ad9c146f2e0f44edab54c4124460b1a25885a543`; SHA-256 `31100001f964a7db6b187c02e32c998e73be7dee4cf92dbf02f46d554b61d9e9`.

**Adjudicação.** Casos positivos e negativos úteis de UI/predicado, sem equivaler visibilidade a autorização no servidor.

**O que os asserts demonstram:**

- Tabela oculta Excluir para false, permite true/undefined e aciona callback; mantém Editar.
- Predicado do lote distingue ausência de seleção/informação, todos recusados, pelo menos um autorizado e itens fora da seleção.

**Mocks/fixtures:**

- Tabela e predicado reais; contatos sintéticos e helpers de menu/Noop compartilhados; callback delete spy.

**Limites:**

- Teste de callback não executa exclusão nem RPC; autorização unknown é comportamento codificado e não evidência de permissão concedida.
- A seleção fora da página é modelada no helper, sem navegar páginas do consumidor completo.

## 008 — src/components/contacts/__tests__/ContactDeletePermission.test.tsx

Leitura integral 1–96. Revisor: `inbox`. Blob `27b9b6fb307c878dd3afc27173afaecdfb492992`; SHA-256 `a0160f4054382c3a1baac00fbf5089dc6f1460c7fc0ee2f46e04005fa79f77b4`.

**Adjudicação.** Contrato efetivamente testado foi registrado sem reproduzir a formulação mais forte do comentário.

**O que os asserts demonstram:**

- canDeleteContact nega somente false e permite true/undefined.
- Lista e card ocultam ou exibem o menu; a lista dispara onDelete quando autorizado.

**Mocks/fixtures:**

- Componentes e helper reais com flags de permissão em contatos sintéticos; operações externas substituídas por callbacks.

**Limites:**

- Introdução afirma 'só quando o banco confirma', mas os próprios asserts aceitam undefined. O alcance real testado é esconder a recusa explícita.
- Não testa chegada da RPC, invalidação da permissão, recusa da mutation ou confirmação de exclusão.

## 009 — src/components/contacts/__tests__/ContactEngagementScore.test.tsx

Leitura integral 1–154. Revisor: `inbox`. Blob `82ec78cae9f0d2543833f853f9d66cc757401954`; SHA-256 `a1e2ec4860055a35761dcd6d15da4288fda8933ba7cc365b1856de7adbe54675`.

**Adjudicação.** Teste determinístico útil da função pura; alcance matemático/visual dos títulos foi delimitado, sem finding por ausência de casos.

**O que os asserts demonstram:**

- calculateEngagement real classifica fixtures em hot/warm/cold/frozen, limita a 100 na entrada alta, retorna zero sem mensagem e confere labels/classes.
- Relógio fixo evita cruzar o balde de recência; limiar 70 exato é hot e caso 65 é warm.

**Mocks/fixtures:**

- Função real com Date congelado; datas calculadas a partir do mesmo instante; nenhuma montagem do componente.

**Limites:**

- Comentários de paridade com JSX e razões de contraste não são verificados pelo teste: asserções examinam strings retornadas, não CSS calculado/JSX/contraste.
- Título 'score=69' usa 65 explicitamente; 'todos os extremos' usa uma entrada. Não prova todo domínio nem semântica dos agregados de origem.

## 010 — src/components/contacts/__tests__/ContactFormEndereco.integration.test.tsx

Leitura integral 1–226. Revisor: `inbox`. Blob `06aeb4506cd390c78b249f805536d861f540a79f`; SHA-256 `e0d6d8209652385a467e66f66595e3b0ead5d7f7c3e035cba0638a11254bdbf9`.

**Adjudicação.** Integração local substancial de parsing e seleção, sem conferir API viva ou descartar as corridas já identificadas.

**O que os asserts demonstram:**

- Integração ContactForm→autocomplete/reducer→mapboxGeocode usa fetch controlado e verifica suggest único, fallback forward, erro recuperável e retry.
- Seleção retrieve preenche endereço/coordenadas; resultado forward com coordenadas evita retrieve; request traz types/country/language/session_token.
- Fora de foco não solicita token; uma interação focada solicita token uma vez.

**Mocks/fixtures:**

- ContactForm/hooks/parsers reais; fetch roteado por endpoint e fixtures JSON versionadas; token, budget guard, auth e toast são substituídos.

**Limites:**

- Não é 'só fetch' em sentido literal: auth, token e budget também são mocks, conforme comentário detalhado.
- A asserção de retry eventual não mede ausência do debounce; uma busca com token não prova toda uma sessão de múltiplas buscas.
- Não exercita retrieve A pendente seguido de digitação B, GPS concorrente, schema/serviço vivo nem salvamento do contato.

**Relação com achados.** R2-INB-037: cenário de retrieve tardio após nova digitação não coberto.

## 011 — src/components/contacts/__tests__/ContactFormEndereco.test.tsx

Leitura integral 1–326. Revisor: `inbox`. Blob `2305cb0d2bf2fd3385e2463d064e768f17c3f275`; SHA-256 `d59b6796a1248b8e598ad389b9bc6706bcb63cd9e411417aa2a009d21a2a5284`.

**Adjudicação.** Teste de consumidor com estados úteis e fronteiras declaradas; valida wiring/feedback, sem anular corridas do hook real.

**O que os asserts demonstram:**

- Campos/endereço salvo, máscara e corte de CEP/UF, preenchimento por seleção com/sem componentes e editabilidade posterior.
- Retry encaminha ao hook; aviso de coordenada antiga reage a campos de endereço, some na seleção/recalcular bem-sucedido e fica quando busca vazia.
- Axe examina o combobox/lista inline no fixture com três opções.

**Mocks/fixtures:**

- ContactForm real; autocomplete, searchPlaces, token, cargos/empresas e leitura Supabase controlados; formulário permanece controlado por props estáticas.
- Axe desativa region e color-contrast explicitamente.

**Limites:**

- O título /forward corresponde ao mock de searchPlaces, sem request/parser real neste arquivo; integração de rede está em outro teste.
- Callbacks onChange não demonstram gravação nem reconciliação de valores no pai; nenhum pedido é deixado pendente durante nova digitação.
- Axe local não mede contraste/layout/leitor de tela e não foi executado nesta auditoria.

**Relação com achados.** R2-INB-037: nova digitação enquanto select/retrieve está pendente permanece fora dos casos.

## 012 — src/components/contacts/__tests__/ContactKanbanAggregates.test.tsx

Leitura integral 1–88. Revisor: `inbox`. Blob `24a56be79a4da9f3502f9e1e0244c08f3d263daa`; SHA-256 `02fc1d44ad520af1ecc1e291d2ec2dd69bb62f768efc2d8da95cb38ce48bec20`.

**Adjudicação.** Boa prova do contrato de invalidação em uma ordem concorrente específica, com controle negativo de falha.

**O que os asserts demonstram:**

- Drag aceito invalida contacts-kpi/type-counts/search; falha isolada não invalida.
- Primeiro drag aceito ainda invalida depois de superado, mesmo quando segundo drag falha.

**Mocks/fixtures:**

- ContactKanbanView real; DnD entrega callback diretamente; UPDATE vira fila de promessas controladas e QueryClient registra chaves.

**Limites:**

- Não confere payload/filtro do UPDATE, estado final do card ou refetch real; {error:null} não modela zero linhas por permissão.
- Não há gesto físico de arrastar nem execução do banco.

## 013 — src/components/contacts/__tests__/ContactMergePermission.test.tsx

Leitura integral 1–114. Revisor: `inbox`. Blob `a8b966254ae4427514bf4016ee2b533c152d0edb`; SHA-256 `449b4cefb5db0079c38be2d9a69faba2cdba0b994ac0adfa554b5041e5fb34cd`.

**Adjudicação.** Gate visual e cardinalidade mínima testados; transação de merge é fronteira independente.

**O que os asserts demonstram:**

- canMergeContacts nega false e permite true/null/undefined.
- Toolbar conserva Comparar quando Mesclar é negado; Mesclar chama callback quando permitido e exige pelo menos dois selecionados.

**Mocks/fixtures:**

- Toolbar/helper reais, props e permissões fornecidas diretamente, callback de merge spy.

**Limites:**

- Não monta useCRMAdminAccess nem executa merge_contacts_atomic; comentários sobre RPC/DELETE não são comprovados pelos asserts.
- Não demonstra preservação de relações/notas ou efeitos do merge no banco.

**Relação com achados.** Conflitos SQL de merge pertencem a database; este teste não os refuta.

## 014 — src/components/contacts/__tests__/ContactOpenChat.test.tsx

Leitura integral 1–57. Revisor: `inbox`. Blob `5f72f32b4eb9dffa8f4266d7a92ae6183072f23e`; SHA-256 `1aa1e34575e17cb267961328675eab1e8ae2ba59e74b6fa048ec4c9439f336b4`.

**Adjudicação.** Contrato direto de eventos bem delimitado; título abrir chat significa chamar o callback no alcance demonstrado.

**O que os asserts demonstram:**

- Card/lista/tabela enviam ID correto no clique Conversar; o corpo abre detalhes.
- Clique Conversar não propaga para detalhes; card/lista não repetem onOpenChat ao clicar no corpo.

**Mocks/fixtures:**

- Três componentes reais com contato e handlers spy/noop.

**Limites:**

- O teste termina no callback; não monta roteador/Inbox nem comprova seleção/carregamento da conversa.
- Não testa teclado ou popup; nenhuma navegação real nesta auditoria.

## 015 — src/components/contacts/__tests__/ContactRegionMap.test.tsx

Leitura integral 1–175. Revisor: `inbox`. Blob `5b35ff1dc8dafd16c80d8c79eb515d6f41f0eab3`; SHA-256 `7d67323e5cba5749b40356f78dbc5e859a52b255ca9b0d9087ebc9843cf70745`.

**Adjudicação.** Testes úteis dos marcadores e estados de falha, com limite explícito de biblioteca simulada.

**O que os asserts demonstram:**

- Mapa cria marcadores para regiões conhecidas, dimensiona por contagem, emite região ao clicar e explica pontos aproximados/omitidos.
- Token com erro seguido de retry cria mapa; ponto preciso e agregados DDD coexistem com legenda e ordem lng/lat.
- Quatro DDDs brasileiros têm coordenada, DDD inexistente retorna null e tabela contém mais de 60 entradas.

**Mocks/fixtures:**

- ContactRegionMap/helper de região/token reais; invoke e loader mockados; Map/Marker/Bounds sintéticos, eventos load controlados, DOM de marcadores local.

**Limites:**

- Título 'todo DDD conhecido' cobre cardinalidade e quatro exemplos, não enumera o catálogo todo.
- Não testa WebGL, mapa físico, cleanup/unmount ou token pendente; coordenada 'confirmada' é prop fornecida, não confirmação geográfica.
- Contagem de aproximações corresponde à fixture, sem provar consulta/agregados produtivos.

## 016 — src/components/contacts/__tests__/ContactStatsCards.test.tsx

Leitura integral 1–87. Revisor: `inbox`. Blob `cebc182213e2bb39f369188e9b4b426f7be514f3`; SHA-256 `d2064369def7e3cbff50fb42178b295ef96c7602bae21c4246e79653aff9a7bb`.

**Adjudicação.** Testes de formatação/wiring, sem elevar fixtures de métrica a dados reais.

**O que os asserts demonstram:**

- Skeleton de quatro cards; formatação de total/fornecedores vindos de props; sinais e zero dos deltas.
- Empresa sem série útil não exibe sparkline/delta; classes de geometria e flag includeLegacy chegam ao hook.

**Mocks/fixtures:**

- ContactStatsCards real; hook KPI substituído por valores/arrays fixos e dois totais por props.

**Limites:**

- 'Valores reais' significa valores recebidos na fixture: não executa cálculo, consulta, paginação ou reconciliação com a lista.
- As classes não medem dimensões/contraste de tela; o caso de quatro KPIs confere diretamente os dois totais mencionados.

## 017 — src/components/contacts/__tests__/ContactToolbar.test.tsx

Leitura integral 1–111. Revisor: `inbox`. Blob `35b3b7a0452dddd4f585c469e158b589be5702ea`; SHA-256 `703902f171921827f371b154abb8284f00b9a58a4092065332a54c7fd67603e1`.

**Adjudicação.** Cobertura focada de opções e encaminhamento de eventos, com contratos de Select/filhos isolados.

**O que os asserts demonstram:**

- Enumeração dos cinco critérios, regra de Comparar por seleção, aria-expanded/filtro e toggle de legados.
- Switcher transmite seis modos, oferece 3–6 colunas em Cards e agrupamento nas demais vistas.

**Mocks/fixtures:**

- Toolbar e ViewSwitcher reais; busca/filtros/presets substituídos e Select vira lista de elementos data-value; callbacks spy.

**Limites:**

- Não seleciona um critério no Select real nem ordena dados; chamadas de modo não montam as respectivas telas.
- Não comprova resultados de filtros, persistência de preferências ou navegação física.

## 018 — src/components/contacts/__tests__/ContactTypeTabs.test.tsx

Leitura integral 1–37. Revisor: `inbox`. Blob `e85318b62abf1e7a1ccd3bf9f83d79272c06e352`; SHA-256 `bbe2b7037402c21f65d2e63196624233eec4688f314c5dd7d3b009f85f0506fa`.

**Adjudicação.** Teste de apresentação das abas; não é prova dos filtros de grupo da Inbox.

**O que os asserts demonstram:**

- Rótulos/ordem de Todos e seis tipos, badge zero apenas em Todos, omissão de tipo zero e formatação pt-BR.

**Mocks/fixtures:**

- ContactTypeTabs real, reduced motion forçado, contagens recebidas por props; setActiveTab noop.

**Limites:**

- Não testa clique/troca de aba nem cálculo dos contadores ou filtro aplicado; nenhum agregado real.

**Relação com achados.** R2-INB-055 é outro componente/predicado e não é coberto aqui.

## 019 — src/components/contacts/__tests__/ExternalDataIntegration.test.tsx

Leitura integral 1–309. Revisor: `inbox`. Blob `104582fe6106f0b30216b2fa78838467405dde00`; SHA-256 `b4585ad9b3d074a6eefdfd186905d661ce1a322852d29338e75e8bf59de27b06`.

**Adjudicação.** Primeira metade contém testes de hooks úteis sob mock; duas promessas de cobertura foram explicitamente rejeitadas (erro não injetado e lógica local no lugar do consumidor). Sem novo ID de produto.

**O que os asserts demonstram:**

- Hooks reais de empresas/cargos consomem gateway mockado; empresas deduplica/trim/ordena e percorre página de 200 seguida de parcial.
- Erro RPC de empresas é codificado como query success com array vazio; cargos combina fontes e deduplica.
- Blocos posteriores exercitam apenas funções/expressões locais de filtro, cargo, email e telefone.

**Mocks/fixtures:**

- callCRMIntegration é reimplementado no teste e retorna meta inventada; flags de integração são sempre true; Supabase/gateway real não participa.
- salespeople recebe sempre seis valores, inclusive vazios/null; erro RPC controlado; filtros/validadores/formatador de ContactForm são cópias locais sem importar ContactForm.

**Limites:**

- Caso197–203 denominado erro de salespeople não muda o mock para erro: só repete sucesso e verifica length>0.
- Casos206–309 não protegem a implementação de ContactForm; poderiam passar mesmo se o formulário divergisse dessas cópias.
- Não valida autenticação do gateway, contrato real de meta, paginação de salespeople, cache por sessão ou formulário renderizado.

## 020 — src/components/contacts/__tests__/FilterPresets.test.tsx

Leitura integral 1–64. Revisor: `inbox`. Blob `9473bc2a2b1f3caae2d20c2408fbd8cdd6d4fa46`; SHA-256 `fbafcdd95165414f99759ca3707901f6e21e50043b25da56cfb9a52a3ab3977a`.

**Adjudicação.** Bom controle de migração/formato e aplicação; alcance da asserção de não escrita foi reduzido ao que observa.

**O que os asserts demonstram:**

- Load remove tipo extinto/preset sem filtros, conserva válidos, avisa contagem e lida com JSON corrompido.
- Clique aplica o preset selecionado ao callback.

**Mocks/fixtures:**

- Componente real com localStorage do ambiente de teste; toast spy e quatro shapes de preset.

**Limites:**

- O teste 'não regrava' compara string final, sem espiar setItem; uma regravação idêntica também passaria.
- Não testa quota/negação de storage, criar/excluir preset, troca de usuário ou efeito dos filtros no consumidor.

## 021 — src/components/contacts/__tests__/contactDeleteFixtures.tsx

Leitura integral 1–42. Revisor: `inbox`. Blob `4fd84cd760d2f58fa1a1d3033da74b82860d2b03`; SHA-256 `d02e2e537a2053b12f73da4521cf682eded04343327479609234653d980c5ea6`.

**Adjudicação.** Fixture/helper lido integralmente e classificado como suporte de testes, sem contagem fictícia de assertions.

**O que os asserts demonstram:**

- Helper de menu dispara pointerdown/pointerup/click; trigger busca primeiro botão de menu e falha explicitamente se ausente.
- Fixture de contato define campos base e aplica overrides; noop não produz efeito.

**Mocks/fixtures:**

- Arquivo auxiliar sem testes próprios, compartilhado pelos testes de exclusão/toolbar; eventos do Testing Library.

**Limites:**

- Não contém assertions: sua revisão cobre o suporte, não adiciona casos aprovados.
- Trigger presume uma única primeira superfície de menu; sequência sintética não certifica teclado/touch físico.

## 022 — src/components/contacts/__tests__/contactTypeConfig.test.ts

Leitura integral 1–28. Revisor: `inbox`. Blob `522bbd72600f8bd3293147cbdee216b40faaed17`; SHA-256 `50b438bae5c6bd789191b87623d09f1b3bf8978509253b37ea9fc7025a24b8a8`.

**Adjudicação.** Contrato estático útil de configuração; classificação canônica não é inferida só de um título.

**O que os asserts demonstram:**

- Configuração tem os mesmos tipos e ordem de CONTACT_TYPES; abas contêm all e excluem três valores extintos.
- Cada badge declara classes de texto para temas claro/escuro.

**Mocks/fixtures:**

- Constantes reais importadas; esperado deriva do catálogo canônico versionado e lista explícita de tipos extintos.

**Limites:**

- Confere coerência interna das constantes, não catálogo do banco ou migração de registros antigos.
- Regex de classes não mede contraste nem se CSS foi gerado/aplicado.

## 023 — src/components/contacts/__tests__/useContactFormValidation.test.ts

Leitura integral 1–348. Revisor: `inbox`. Blob `a71caec19b0f5c81fc620c7543fd4ec9f43d287c`; SHA-256 `1c5226641fae23eca194747c6fe39348d00cf65ca39d35923d95937337f3ffd6`.

**Adjudicação.** Cobertura real do hook com controles concorrentes relevantes; não confundir esses guards com todos os intervalos/lifecycles.

**O que os asserts demonstram:**

- Hook real debounceia email/telefone em 500ms, escolhe último valor e envia ilike escapado/heurística últimos oito dígitos.
- Avisos de duplicata e ausência, excludeContactId/limit e invalidação de resposta lenta após nova busca ou valor inválido/curto.

**Mocks/fixtures:**

- Cadeias Supabase simuladas por spies; timers falsos; promessas antigas resolvidas manualmente; valores do formulário e callbacks fornecidos.

**Limites:**

- Queries devolvem apenas data, sem erro/rejeição/zero por RLS; escaping é conferido como string, não executado em PostgREST.
- Guard é exercitado após avançar o debounce da segunda alteração; não testa resposta antiga durante esses 500ms nem desmontagem.
- Telefone por oito dígitos é uma heurística testada, não prova de identidade única ou bloqueio de cadastro duplicado no servidor.

## 024 — src/components/contacts/__tests__/useContactsCRUD.test.tsx

Leitura integral 1–393. Revisor: `inbox`. Blob `7a21f2bee287ef1c636e56ed73c790a6c354db7e`; SHA-256 `f22b6d3d5dc17d002104aa173ce74881ca681f4df7a0c0cc0024627a44c5eb14`.

**Adjudicação.** Regressões de payload e defesa de DELETE têm asserts úteis; alcance do bloco de invalidação é enfraquecido pelo histórico de mocks entre casos, documentado sem executar a suíte.

**O que os asserts demonstram:**

- Hook real busca linha completa antes de editar e preserva endereço; leitura que rejeita/retorna null omite campos não conhecidos do update; limpeza explícita vira null.
- Fluxo add→edit reutiliza payload de criação na fixture; toggle de legados limpa seleção.
- DELETE chama RPC com ID e trata null/error antes de refetch/invalidação; resultado não vazio aciona sucesso no feedback mockado.

**Mocks/fixtures:**

- Supabase registra payloads, ContactService/getById e busca são mockados; withFeedback é substituído por await da mutation e onSuccess opcional; QueryClient só registra invalidações.

**Limites:**

- Os três casos do bloco252–295 não têm reset próprio de invalidateQueries: chamadas do primeiro caso podem satisfazer asserts dos seguintes, sem provar invalidação individual de edit/delete.
- UPDATE mock não valida filtro nem quantidade afetada; {error:null} não representa autorização/persistência.
- Rejeição de DELETE é observada através do withFeedback substituído, não pelo feedback real de UI. Comentário E08 diz mudar empresa, mas helper efetivamente altera nome.

**Relação com achados.** Proteção de campos ausentes deste hook não se transfere para LeadRiskScorePanel (R2-INB-061).

## 025 — src/components/contacts/__tests__/useContactsViewState.test.tsx

Leitura integral 1–122. Revisor: `inbox`. Blob `79cff7d9fa79ddd56a5c61850aaf21db8cff3d59`; SHA-256 `8af05be3efce9b8244be53e470abf6a4e5fcac5c7e2b8560f9734e47b0d70f5d`.

**Adjudicação.** Testes úteis da prioridade de eventos e sanitização sob fronteiras locais, separados da navegação real.

**O que os asserts demonstram:**

- Atalhos Ctrl+N/A e defaultPrevented; seleção de todos alterna, input/textarea preservam seleção textual.
- Esc prioriza painel de detalhes, depois seleção, depois busca; presença de diálogo aberto conserva seleção.
- Preset de tipo extinto vira all e tipo canônico/empresa seguem para setters.

**Mocks/fixtures:**

- Hook real, CRUD substituído por objeto mutável e spies; KeyboardEvent/elementos do DOM de teste, diálogo representado por div com atributos.

**Limites:**

- Não monta formulário/diálogo Radix nem altera dados via CRUD real; updater de seleção é aplicado manualmente.
- Não cobre contenteditable, composição IME, conflito com atalhos globais ou teclado físico.

## 026 — src/components/email/__tests__/EmailChatInbox.test.tsx

Leitura integral 1–117. Revisor: `inbox`. Blob `d09a31c25ac4965a2dde4514654491c814f73376`; SHA-256 `b0577ad6a44c0536808dcb2102808790ff3268c455e80c75af1a2acb7823049b`.

**Adjudicação.** Cobertura de composição de estados e URL em uma conta; fonte/backend de Email pertencem aos revisores root/providers.

**O que os asserts demonstram:**

- EmailChatInbox distingue loading, offline,403 e nenhuma conta; conta ativa chega a thread/compositor.
- Seleção grava emailThread na URL e popstate restaura; ajuda, drawer contextual e modo embedded são verificados.

**Mocks/fixtures:**

- useGmail, lista/thread/painel/compositor e animação substituídos; uma conta e uma thread; state controlado a cada teste.

**Limites:**

- Não monta os consumidores de envio, OAuth, seleção entre contas ou consulta de thread fora da janela.
- O drawer é observado no ambiente de largura configurado, sem matriz de breakpoints; helper de histórico local não equivale a navegação física.
- Nenhum sincronismo/realtime/servidor real executado.

## 027 — src/components/email/__tests__/EmailContactPanel.test.tsx

Leitura integral 1–334. Revisor: `inbox`. Blob `f46a43d171f5693c39d11bcea6568f2eb0e8d3b3`; SHA-256 `cce4c97c6f8836dfd2b2395f2d0bdac7b3e63272ad543f9a1b5328b3a4ca70e6`.

**Adjudicação.** Cobertura ampla de apresentação e callbacks; frases sobre segurança/completude foram delimitadas às fronteiras realmente observadas.

**O que os asserts demonstram:**

- Painel renderiza empresa/campos/relações/sociais fornecidos e distingue CRM desativado; falha ao vincular mostra alert e transmite external ID.
- Identidade do interlocutor não vira a própria conta após outbound; iniciais, assunto, contagens, datas, tags/labels e fechar são exercitados.
- Participantes derivam das mensagens da fixture; download recebe objeto do anexo; botão Ver todos expande seis threads já fornecidas.

**Mocks/fixtures:**

- Painel real com accordion/scroll/avatar/badge simplificados; hooks CRM/notas substituídos; mensagens, anexos e linked flags fornecidos diretamente.

**Limites:**

- 'Campos seguros' usa somente payload previamente filtrado, sem testar whitelisting do produtor ou URL hostil.
- 'Baixar anexos autenticados' comprova apenas onDownloadAttachment(attachment), sem conta/token/autorização/transporte.
- Expandir seis relatedThreads não prova busca além da janela do backend; não testa consulta pendente ao mudar conta/thread.

## 028 — src/components/gmail/__tests__/EmailComposer.test.tsx

Leitura integral 1–255. Revisor: `inbox`. Blob `94a9fc78b5b3b0a94abbd5da9d4a4ab5a6d31acf`; SHA-256 `6c40956cbcec028dc94d29682b1c8f7eb0312c148b37a8a043ff42a31425dabe`.

**Adjudicação.** Controles positivos de perda de draft, duplicação e serialização são substanciais; não equivalem a entrega Gmail ou todas as transições de conta.

**O que os asserts demonstram:**

- Compositor inicializa new/reply/reply-all/forward, restaura draft da chave de conta e sinaliza nomes de anexos sem bytes.
- Discard confirmado remove sessão e solicita delete remoto; new/reply/forward chamam mutation correspondente com destinatário/assunto/thread; encaminhamento inclui conteúdo retornado do anexo.
- Duplo clique durante promessa pendente chama send uma vez; FunctionsFetchError conserva draft e instrui conferir Enviados.
- Autosave serializa uma escrita pendente e só inicia a próxima usando draft_id devolvido e texto mais recente.

**Mocks/fixtures:**

- EmailComposer/helpers de draft reais; useGmail mutations/attachment content totalmente mockados, animações simplificadas, localStorage e timers locais.

**Limites:**

- Não autentica getAttachmentContent ou transporte; teste reply-all confere Para e expansão de Cc, não o conteúdo final completo de Cc/Bcc.
- 'Fora de ordem' é prevenção por serialização, não duas respostas invertidas; não cobre fechar/trocar conta enquanto save/send está pendente.
- isPending dos mocks fica false; proteção observada depende do estado próprio do componente. Não confere todos os campos MIME/idempotência na mutation real.

## 029 — src/components/gmail/__tests__/GmailInboxView.test.tsx

Leitura integral 1–255. Revisor: `inbox`. Blob `ebe72def5331f7dc91f04cc796d316513cd56a3f`; SHA-256 `e92b00b87aacf558342ca51f860f1b3a03ac98240fad737b2b478e1a1a49a5cf`.

**Adjudicação.** Teste do estado local da view legada e de seus callbacks, com fronteiras que impedem concluir autenticação/consulta/entrega.

**O que os asserts demonstram:**

- View distingue ausência de conta; lista, favoritos, não lidas e busca por assunto filtram fixtures.
- Compor/selecionar thread montam filhos; Sync recebe {}; subscribeToThreads é chamado no mount.

**Mocks/fixtures:**

- useGmail e três filhos são stubs; Tabs usa contexto local e monta conteúdos sem regra Radix; Select não propaga onValueChange; animação/scroll simplificados.

**Limites:**

- Não testa troca de conta: conta é acc1 enquanto threads de exemplo têm a1, e mock entrega a coleção pronta; isso não prova isolamento por conta.
- Nenhum teste de cleanup da assinatura, erros, paginação ou resultado de sync; callback mount não prova realtime efetivo.
- Mocks de Tabs/Select não certificam comportamento real de foco/portal/seleção.

## 030 — src/components/inbox/__tests__/AIConversationAssistant.ia048.test.tsx

Leitura integral 1–171. Revisor: `inbox`. Blob `cdddab0015def1c6bf90cbf083284c98f0cd2637`; SHA-256 `f753251e8c067cd298673d2fda632f8903e8b96a0b8593848f3a8ad7b6b5ba92`.

**Adjudicação.** Teste de concorrência útil com controle positivo de mensagens vivas; asserção do callback não é efeito real no servidor.

**O que os asserts demonstram:**

- Assistant real aplica envelope no mesmo contato e chama o callback de alerta; mudança de contactId durante invoke descarta análise/refetch/alerta/sucesso.
- Mensagem nova no mesmo contato não invalida a resposta pendente.

**Mocks/fixtures:**

- Invoke e alerta/histórico/TTS são mocks; AnalysisTabs é stub; envelope válido e promessa controlada; geração de requisição do componente permanece real.

**Limites:**

- Não executa alerta do servidor nem seu toast/ação, portanto não cobre INB-064.
- Não muda período, fecha/desmonta, injeta envelope inválido ou deixa refetch pendente antes de trocar contexto.
- Rerender com outro contato testa defesa interna; a view ativa também remonta por key, conforme cobertura de produção.

**Relação com achados.** IA-048: proteção do contexto; R2-INB-064 permanece em outro contrato após o callback.

## 031 — src/components/inbox/__tests__/AISuggestions.ia048.test.tsx

Leitura integral 1–119. Revisor: `inbox`. Blob `745f4a85e31b6b9c9843d1edcbfdcbe69182c4ae`; SHA-256 `fbeba7ab6724760a63a40c6c97151edcd65a52832c58971eaf8fb2aee60729e4`.

**Adjudicação.** Guard de identidade tem caso negativo e controle positivo; validação de schema e aplicação ao editor permanecem contratos distintos.

**O que os asserts demonstram:**

- AISuggestions mostra resposta válida, descarta cards após mudar contactId e mantém pedido ao receber mensagem viva no mesmo contato.

**Mocks/fixtures:**

- Componente real com invoke/toast/animação substituídos; resposta de array bem formado e promessa pendente controlada.

**Limites:**

- Não aplica sugestão ao textarea: o título sobre rascunho é demonstrado pela ausência do card, sem testar callback de inserção.
- Não testa suggestions truthy malformado, contato omitido pelo consumidor, fechar o popover ou mudar rascunho no mesmo contato.

**Relação com achados.** Desencontro de schema/rascunho pertence a Infra; não criado novo ID.

## 032 — src/components/inbox/__tests__/CloseConversationDialog.test.tsx

Leitura integral 1–75. Revisor: `inbox`. Blob `7c86c4a5dbed490c6f2f15deb3736e1ea97b34f6`; SHA-256 `6c35a4f4efabc52bc34131392897ae8f048342a9e7a49bf338cbe07f426888f9`.

**Adjudicação.** Regressão narrow do retry, útil mas insuficiente para comprovar chave válida e toda transação de fechamento.

**O que os asserts demonstram:**

- Duas chamadas Encerrar no mesmo diálogo aberto, após error na primeira, usam close_conversation_atomic e o mesmo p_client_request_id.

**Mocks/fixtures:**

- RPC retorna erro resolvido e depois linha resolved; componentes Dialog/Select/Button/inputs simplificados; nenhum fechamento real do pai.

**Limites:**

- Igualdade da chave não exige que ela seja definida/não vazia: duas undefined também satisfariam o assert isolado.
- Não fecha/reabre diálogo, verifica novo UUID, backend idempotente ou conflito de índice diário após reabertura da conversa.
- Não confere feedback nem dados persistidos; fonte de produção foi lida separadamente e realmente gera UUID.

**Relação com achados.** R2-DB-008: novo fechamento após reabertura é cenário diferente do replay com a mesma chave.

## 033 — src/components/inbox/__tests__/ConversationListSidebar.test.tsx

Leitura integral 1–213. Revisor: `inbox`. Blob `aad0cf1642d6b1032818dea04ca7697a4ccfd009`; SHA-256 `197d0b2babb06ef9abfca30bd564c775021f696816947712e941bddb1f4d543b`.

**Adjudicação.** Regra de validade do alvo e wiring são testados; a camada de diálogo/mutation permanece fora.

**O que os asserts demonstram:**

- Sidebar abre diálogos para c1, remove-os quando o alvo sai da lista filtrada e conserva quando permanece.
- Repassa contagens de conversas/fixados/favoritos; arquivar sem handler avisa indisponibilidade e com handler chama/refaz carga.

**Mocks/fixtures:**

- Sidebar real; virtual list e diálogos são stubs com botões artificiais; filtros/status/bulk/mobile/erro substituídos; ações assíncronas no teste resolvem imediatamente.

**Limites:**

- Não monta TransferDialog nem confere queueId/type/resultados; não cobre o erro resolvido que fecha transferência de INB-009.
- Cabeçalho introdutório pode sugerir que fechar era o defeito; os asserts exigem exatamente fechamento quando o alvo sai do filtro. A leitura foi adjudicada pelos corpos.
- Remoção é rerender de props, sem realtime real ou erro de arquivamento.

**Relação com achados.** R2-INB-009: TransferDialog mockado impede verificar contrato de transferência.

## 034 — src/components/inbox/__tests__/ConversationMemoryPanel.test.tsx

Leitura integral 1–160. Revisor: `inbox`. Blob `7bda74489180a02738efc57376375764a0c2d1cc`; SHA-256 `f23d5ca7ccfac1f81a7fd1242675b584171d48fa831e2e3705e9080c5c3f3702`.

**Adjudicação.** Controles positivos reais de identidade/erro do load; não estender a proteção a toda mutation ou ao painel de scoring.

**O que os asserts demonstram:**

- Memória antiga some ao trocar contato, resposta lenta A não substitui B e linha com contact_id diferente é tratada como ausência.
- Erro e ausência de registro são estados distintos; update recebe filtros id/contact_id e payload do contato atual.

**Mocks/fixtures:**

- ConversationMemoryPanel real com cadeia Supabase controlada; query pode ficar pendente; builder de UPDATE devolve a si mesmo, sem Promise/then/error.

**Limites:**

- Assert de update verifica filtros, não persistência nem resposta de erro/zero linhas; builder não thenable não modela o SDK completo.
- Não troca contato durante save/refetch nem testa INSERT; a view ativa tem key por contato, considerada separadamente.

**Relação com achados.** Hipótese genérica A→B na sidebar já foi descartada pela montagem keyed; R2-INB-061 é outro componente e outro tratamento de erro.

## 035 — src/components/inbox/__tests__/ConversationSummary.ia048.test.tsx

Leitura integral 1–126. Revisor: `inbox`. Blob `89337232769182f7b3b6b2f3237057f60a9bada9`; SHA-256 `8d70d115049f46d9a3ad2b8b3ee9a11c42e7efe9a8373c776eac298e5854d6c7`.

**Adjudicação.** Controle útil do identificador de geração no resumo e da preservação de atualizações do mesmo contato. Alcance restrito à aplicação do resultado sob dependências simuladas.

**O que os asserts demonstram:**

- Resultado da geração no mesmo contato é aplicado; mudar contato descarta a resposta pendente; atualizar apenas a lista de mensagens do mesmo contato preserva a geração pendente.

**Mocks/fixtures:**

- Supabase invoke, toast, logging, animação e SummaryResult são simulados; useSummaryTts é simulado no caminho local realmente importado. Promessa controlada e resumo normalizado com 12/14 mensagens recentes.

**Limites:**

- Não troca o período, injeta erro ou resposta inválida; o marcador de SummaryResult não demonstra a renderização do conteúdo.
- TTS e playback estão substituídos, e o teste de rerender não reproduz a montagem com key da tela completa.

**Relação com achados.** IA-048: evidência favorável do guard de geração no consumidor corrigido.; Não cobre R2-INB-047, relativo à Promise do TTS compartilhado interrompido.

## 036 — src/components/inbox/__tests__/ConversationSummary.test.tsx

Leitura integral 1–128. Revisor: `inbox`. Blob `8c002e1b921b446c01cae581365cbcce16c26b5c`; SHA-256 `8ca4c5da097ebd99237df7d7557aa8cc7fb4c47725651200e58d5e8781f95aef`.

**Adjudicação.** Prova renderização inicial e etiquetas de status. As alegações de geração, seletor de período e fechamento no nome dos testes excedem os asserts disponíveis.

**O que os asserts demonstram:**

- Sem resumo inicial há botão Gerar; com resumo inicial há Regenerar e badges para quatro estados normalizados.

**Mocks/fixtures:**

- Invoke, toast, logger e animações simulados; resumo inicial pronto e 15 mensagens recentes. O mock de TTS usa @/hooks/useSummaryTts, mas o componente importa ./summary/useSummaryTts.

**Limites:**

- Nenhum teste dispara a geração apesar do invoke mockado; não há assert de contrato, erro ou cancelamento.
- O teste intitulado sobre botão fechar só exige que exista ao menos um botão; não identifica nem clica em fechar.
- O caminho antigo do mock de TTS não demonstra isolamento do hook realmente importado; não foi executada a suíte para inferir efeito de resolução de módulo.

## 037 — src/components/inbox/__tests__/ConversationTabs.test.tsx

Leitura integral 1–189. Revisor: `inbox`. Blob `fbc9801d5fa89f14e73141dcf6c09218bcac9119`; SHA-256 `f8250064e9e6bedb02e0c0f9ab1def40073bca2e3505bd896635e96d9ca2d8f6`.

**Adjudicação.** Evidência útil da migração das abas e da passagem de callbacks. A verificação de unicidade da configuração não equivale a ausência de conflito de atalhos em execução.

**O que os asserts demonstram:**

- As oito abas e badges fornecidos por props são renderizados; clique entrega o ID da aba e a aba ativa recebe aria-selected.
- Normalização e hidratação migram reminders para tasks; valores desconhecidos voltam a chat; a escolha é persistida.
- A configuração contém Alt+T e não repete as combinações comparadas; o contrato NotesTab→onTabChange tasks é repassado pelo container.

**Mocks/fixtures:**

- ConversationTabs, ConversationTabContent, useInboxUIState e constantes de atalhos são reais; NotesTab é um stub com botão de navegação. LocalStorage limpo em cada caso e contadores fornecidos como props.

**Limites:**

- Não busca contagens reais, não cobre o corpo de NotesTab nem o status de tarefas vindo do banco.
- O teste de conflito compara apenas configurações key/ctrl/shift/alt, sem metaKey, atalhos personalizados, handlers globais, navegador ou disparo real de Alt+T.

**Relação com achados.** Não afasta R2-INB-035: nenhuma tarefa com status done chega ao construtor da timeline.; Não afasta R2-INB-017: não monta os handlers de atalho concorrentes.

## 038 — src/components/inbox/__tests__/ImagePreviewDownload.test.tsx

Leitura integral 1–110. Revisor: `inbox`. Blob `d02a8697fab8aa176b61c62bda936d6f1287826d`; SHA-256 `c6afdb9a4f361077d4604d68c1e74f78480fd437e8c92d32b07537a0b6d6ea8a`.

**Adjudicação.** Comprova parte do controle visual de download do ImagePreview, sem demonstrar proteção do recurso nem os demais consumidores de mídia.

**O que os asserts demonstram:**

- A permissão simulada modifica classes do botão; clicar sem permissão produz toast de bloqueio. Fechar chama onClose mesmo sem permissão.

**Mocks/fixtures:**

- useDownloadPermission fornece booleano fixo e loading=false; toast, Tooltip e framer-motion simulados; URL pública de exemplo.

**Limites:**

- O caminho permitido não clica para testar download, URL, fetch ou falha.
- O teste de zoom só verifica botão habilitado e ausência de toast de download, sem verificar zoom efetivo.
- Não testa carregamento da permissão, ACL/Storage ou acesso direto ao objeto; seleção dos botões depende de índice.

**Relação com achados.** Não afasta R2-INB-031: esse achado é do caminho DocumentPreview e foi delimitado como bypass do controle versionado de UI.

## 039 — src/components/inbox/__tests__/ImagePreviewSize.test.tsx

Leitura integral 1–122. Revisor: `inbox`. Blob `9410dabe576fe601527393dd9fbedb2e9c8c3891`; SHA-256 `72eec1e62586b31d966f7e4e28f19587963d5b5043a360f3c135a38ac8d905f2`.

**Adjudicação.** Regressão útil de classes e fechamento por eventos. Não é validação visual do tamanho em browser.

**O que os asserts demonstram:**

- A imagem recebe classes de limites 58.5vw/55.25vh e alt padrão; Escape e backdrop fecham, Enter/letras e clique na imagem não fecham.

**Mocks/fixtures:**

- Permissão sempre permitida; animação e toast simulados; portal real em DOM de teste e imagem de exemplo sem carregamento.

**Limites:**

- A comparação aritmética 90×0.65 e 85×0.65 é independente do componente; classes não demonstram dimensões calculadas ou adequação ao viewport real.
- Src vazio é apenas observado como atributo ausente no DOM simulado; nenhum assert de imagem carregada, erro de rede ou acessibilidade visual.

## 040 — src/components/inbox/__tests__/LocationMessage.test.tsx

Leitura integral 1–211. Revisor: `inbox`. Blob `9d06fe3e25eb6bd19e8ba391eb06ac838192b83d`; SHA-256 `01fadbaa587808e4b2c40dc526769e3fdc13b7e28741cb945f52cec27a014af1`.

**Adjudicação.** Cobertura substancial dos estados do balão de localização sob falhas simuladas. As garantias permanecem no contrato do SDK substituído e não cobrem as corridas do seletor.

**O que os asserts demonstram:**

- Bolhas compartilham obtenção de token; erro permite retry, timeout é reportado e load tardio limpa erro; 401 do mapa vira mensagem específica.
- Abrir e Rotas preservam URLs com coordenadas sob erro; um chunk antigo após troca de coordenadas não cria mapa adicional.
- Reverse geocode produz endereço, evita consulta com endereço já presente, compartilha coordenadas iguais, tolera erro e permite nova tentativa após falha sem cache permanente.

**Mocks/fixtures:**

- Componentes e helpers de token/geocode reais; invoke, fetch, reportClientError e SDK/loader Mapbox simulados. FakeMap somente armazena handlers/instâncias e marcador tem métodos vazios; timers falsos para timeout.

**Limites:**

- Não verifica opções/posição do mapa no FakeMap, remoção dos recursos, interação WebGL ou token real.
- O caso assíncrono troca coordenada durante load do SDK, não durante resposta de reverse geocode ou escolha manual do LocationPicker.
- Caches são resetados por teste; nenhuma suíte foi executada.

**Relação com achados.** Não afasta R2-INB-036/R2-INB-037: GPS pendente e retrieve após nova digitação usam outro consumidor.

## 041 — src/components/inbox/__tests__/LocationPicker.integration.test.tsx

Leitura integral 1–260. Revisor: `inbox`. Blob `4fb5dc4a77db7e4cb6211fe88680f10d95a720ff`; SHA-256 `67c2c58ec09cc749f90e6492255dc082a2633b1affbf80cd86fa5360ff00a19c`.

**Adjudicação.** Boa cobertura do parsing e encadeamento entre busca e consumidor do Inbox. A expressão 'só fetch mockado' no título deve ser entendida junto aos demais mocks explícitos do arquivo.

**O que os asserts demonstram:**

- Integra hook de autocomplete, reducer, sessão, parsing e lista com respostas de fetch fixas: suggest→retrieve preserva longitude/latitude e componentes, fallback forward é aplicado e seleção fecha a lista com anúncio.
- Suggest/retrieve compartilham session_token não vazio e parâmetros br/pt; resposta vazia não seleciona e 429 mostra pausa/retry.

**Mocks/fixtures:**

- Fetch roteado por endpoint usa fixtures JSON de suggest, retrieve, forward, vazio e 429; as duas últimas fixtures de três linhas também foram lidas. useLocationPicker/WebGL, token, guarda de custo, toast, telemetria e preferência de movimento são substituídos.

**Limites:**

- A integração é da camada de busca até o callback chooseSearchResult, não do mapa/serviço real ou envio da localização.
- O teste de telemetry verifica ausência de name em um evento específico, não todas as formas de dados sensíveis.
- Não injeta nova digitação durante retrieve, custo bloqueado, retry de 429 após clique ou GPS concorrente. Fixtures versionadas não atestam formato vivo do fornecedor.

**Relação com achados.** Não reproduz a sequência de R2-INB-037: digitar um novo termo enquanto a seleção anterior resolve.

## 042 — src/components/inbox/__tests__/LocationPicker.test.tsx

Leitura integral 1–634. Revisor: `inbox`. Blob `bf3f90ddfc6dd3e478836d9a3a9e5e780aebfc56`; SHA-256 `a66280707c462bb1fa0f7f684a91e67df9e2dcb773b49e1143085c3b55d9241c`.

**Adjudicação.** Cobertura extensa do componente e dos callbacks sob hooks simulados, com controles úteis de erro, dupla seleção e movimento. O alcance não se estende ao estado assíncrono interno dos hooks substituídos.

**O que os asserts demonstram:**

- O seletor desabilita envio sem seleção, envia coordenadas/nome/endereço sem isLive, fecha/reset após sucesso e preserva diálogo em rejeição; registra apenas origin nos eventos de envio testados.
- Testa aplicação por clique/Enter, null de retrieve, retry delegado, limpeza ao receber nova seleção, ARIA/listbox/status, vazio versus typing/paused/error, e ausência do ramo legado.
- Controla clique duplo no mesmo item com promessa pendente e erro de outro item; blur fecha lista; destaque ignora acentos; preferência de movimento altera classes e estado inicial do cartão.

**Mocks/fixtures:**

- Hooks de mapa e autocomplete são stubs mutáveis; logger/toast simulados. O teste de anúncio atribui manualmente selectionAnnouncement e força rerender; mapa/GPS são simulados trocando o retorno do hook. Framer-motion real exceto useReducedMotion.

**Limites:**

- A maioria dos estados é injetada pronta, sem percorrer reducer/rede/GPS; não testa retrieve antigo após nova digitação ou resposta GPS depois de escolha manual.
- Axe exclui region e color-contrast; não comprova experiência completa de leitor de tela ou contraste. Spinner é verificado por classe, sem CSS calculado.
- O caso chamado Tab usa focus()/blur(), sem o percurso real do teclado entre todos os elementos; o caso de destaque nas duas linhas produz apenas uma marca no endereço.

**Relação com achados.** R2-INB-036 e R2-INB-037 continuam válidos: as interleavings determinantes não estão representadas.

## 043 — src/components/inbox/__tests__/MediaVolume.test.tsx

Leitura integral 1–525. Revisor: `inbox`. Blob `fe4dba36d2845f31ee8a68ce9a5b428dacdb46cd`; SHA-256 `7f641ed66857132054b82aeea05990a339baf10bd155e7bad07c4cd51c8ffdbb`.

**Adjudicação.** Controles úteis da aplicação e isolamento de volume, incluindo caminho read-only simulado. A lib de binding bem testada não comprova cleanup em todos os consumidores.

**O que os asserts demonstram:**

- Store e controle de volume propagam ganho/mudo entre elementos, reaplicam após recriação/loadedmetadata, limitam 0–100 e respondem a roda/teclado dentro do player.
- Alertas usam volume de notificação e contextos separados sob WebAudio falso; bindMediaVolume cria contexto no play e fecha ao chamar explicitamente o último unbind.
- Player expõe controle; slider tem atributos ARIA, variante sidebar indica mudo/baixo, controle desabilitado não altera mute.

**Mocks/fixtures:**

- Supabase, notificações, toast/logger/animação/ResizeObserver simulados; grafo FakeAudioContext/FakeGain/FakeOscillator registra conexões/rampas e close. Descritor volume read-only simula caminho iOS; harness áudio keyed por URL.

**Limites:**

- Contexto falso sempre running; não prova som audível, autoplay, comportamento real iOS ou reprodução suspensa.
- Testes de ciclo de vida chamam unbind manualmente; não garantem que consumidores imperativos soltem o binding em pausa/desmontagem.
- Checks de texto/imports e comentários-âncora não demonstram separação transitiva do grafo; regex só procura imports em uma linha nos arquivos escolhidos.

**Relação com achados.** R2-INB-041 permanece distinto: referências retidas por consumidores imperativos, sem chamada de cleanup, não por defeito no unbind testado.

## 044 — src/components/inbox/__tests__/PlaybackSpeed.test.tsx

Leitura integral 1–379. Revisor: `inbox`. Blob `08c2b55d948d4d62840cd40980705c5792fdc173`; SHA-256 `db435fbe3c68f50af430da6ae84bfd3b826a881bd2bfe49a13d126bde2e7e8af`.

**Adjudicação.** Regressão do ciclo de velocidade no player de áudio; diversas alegações de vídeo/TTS, valor desconhecido e play/pause não são exercidas pelos asserts.

**O que os asserts demonstram:**

- AudioMessagePlayer renderiza, percorre sete velocidades, formata rótulos e atribui playbackRate no mock; dois componentes mantêm rótulos independentes.

**Mocks/fixtures:**

- Supabase, toast, logger e animação simulados; protótipo HTMLAudioElement usa uma variável playbackRate compartilhada por todas as instâncias, duração fixa e play/pause/load falsos.

**Limites:**

- O teste 'persists across play/pause cycles' não chama play nem pause; o de playbackRate desconhecido só faz cliques normais e nunca injeta valor desconhecido.
- As verificações de array/range, bloco VideoFullscreen e consistência TTS comparam literais e lógica copiados no teste, sem importar esses produtores.
- Independência é demonstrada apenas para os rótulos: o descritor global de playbackRate não modela valores por elemento. Não há reprodução/erro real ou restauração dos descritores neste arquivo.

## 045 — src/components/inbox/__tests__/SLAIndicator.test.tsx

Leitura integral 1–224. Revisor: `inbox`. Blob `24eb2f3d0ab02ecb1e9e8ea921947ff50750e031`; SHA-256 `365ba235c15438736321fa66db001aead50180088f7e43b5ebc0401bbfaec593`.

**Adjudicação.** Prova estados iniciais de apresentação; cálculos duplicados e títulos mais abrangentes não constituem cobertura do contrato de SLA completo.

**O que os asserts demonstram:**

- SLAIndicator real exibe espera/violação e some após resposta no prazo nas datas fixas; aceita modo compacto e className.

**Mocks/fixtures:**

- Relógio congelado e framer-motion substituído. Os blocos formatTimeRemaining e calculateSLAState definem implementações locais dentro do teste.

**Limites:**

- As assertions de formatação/cálculo não chamam funções de produção; o título '30% threshold' aplica uma função local com regra de dois minutos e não valida limiar configurado.
- Contagem regressiva só exige o texto '1ª Resp'; não avança timers nem confere valor. 'compact with tooltip' verifica apenas classe, sem abrir tooltip.
- Não integra configuração SLA, horário útil ou fonte dos timestamps.

**Relação com achados.** Relacionado aos limites de configuração SLA analisados pelo root; não cria achado duplicado por ausência de teste.

## 046 — src/components/inbox/__tests__/StatusChips.test.tsx

Leitura integral 1–72. Revisor: `inbox`. Blob `80c01e2750da240ea311c81d9f31d0df35b5f5e0`; SHA-256 `aff736d10dd89e62fa30ce7f581d2c2ebd79c8861ce5bcf90954dd799ad64efc`.

**Adjudicação.** Teste de render/callback válido para a fixture, mas inadequado como evidência de que o contador 'Em atendimento' funciona com identidades reais distintas.

**O que os asserts demonstram:**

- Cinco chips, contagens da fixture e callback do chip resolvidas; usa fallback por presença de mensagens quando status explícito não foi fornecido.

**Mocks/fixtures:**

- Auth retorna user.id='user-1'; assigned_to da conversa também é 'user-1'; nenhuma fixture separa auth.users.id e profiles.id ou define conversation_status.

**Limites:**

- Identidades coincidentes mascaram o contrato real da FK assigned_to e não exercitam profile.id distinto.
- Contagem de resolvidas pela ausência de mensagens não valida status persistido ou conversas paginadas sem mensagens carregadas.

**Relação com achados.** R2-INB-056: fixture reproduz exatamente a coincidência de IDs que encobre a comparação incorreta em produção.

## 047 — src/components/inbox/__tests__/TransferDialog.test.tsx

Leitura integral 1–63. Revisor: `inbox`. Blob `f242668d13059cd8b928ccc87cc81fb31da36f71`; SHA-256 `f97612ba16dae206b52ce383a5d8f2515b10496ed077d50313bbf3ce282b129d`.

**Adjudicação.** Cobertura da filtragem local da lista conforme prop de fila. Não atesta a execução da transferência ou a integração do diálogo com consumidores.

**O que os asserts demonstram:**

- Com queueId null o picker mostra apenas o perfil cujo user_id corresponde ao auth; com queueId presente mostra os dois agentes da fixture.

**Mocks/fixtures:**

- Auth, filas e agentes prontos; Supabase.from não tem implementação operacional; onTransfer é spy e QueryClient sem retry.

**Limites:**

- Não seleciona agente nem confirma transferência; não verifica payload, kind, contexto passado pelo consumidor, nota, erro ou atualização do banco.
- O comentário cita trigger, mas nenhuma função SQL/RLS é exercida e o teste de queueId undefined não existe.

**Relação com achados.** Não afasta R2-INB-009: contrato do callback, contexto e tratamento de erro permanecem fora do teste.

## 048 — src/components/inbox/__tests__/resolveActiveTab.test.ts

Leitura integral 1–31. Revisor: `inbox`. Blob `91b7af22163bae9755f250754cb12dca8e779fcd`; SHA-256 `f34c0ee45155a4b21f669ebcb7cbf72111a5433703ec73990c94b9fa61f3ab5e`.

**Adjudicação.** Teste unitário direto e adequado do resolver; sua garantia depende de o consumidor construir corretamente esse estado.

**O que os asserts demonstram:**

- Helper real restaura preferência sem contato e na primeira conversa; seleção não restaurada fica ancorada ao contato e mudar contato retorna chat; inclui orders/history.

**Mocks/fixtures:**

- Somente objetos de estado passados ao resolver puro; sem React, armazenamento ou mocks de rede.

**Limites:**

- Não hidrata nem grava localStorage, não monta a tela, não valida a origem do sinal restaurada nem normaliza entradas inválidas.

## 049 — src/components/inbox/chat/__tests__/ChatMessagesArea.loop.test.tsx

Leitura integral 1–157. Revisor: `inbox`. Blob `ac50ce39aa3a1fecefb8db853c9cec9f24d2ad71`; SHA-256 `c9017f90f2c809cbd6a69a11b72c070f201d2088e96986d6a8618a4b06ecfec8`.

**Adjudicação.** Regressão comportamental dirigida ao loop do virtualizer, com assert que evita mero render vazio; sem extensão para outros contratos da área de mensagens.

**O que os asserts demonstram:**

- ChatMessagesArea e virtualizer montam duas/três bolhas e recebem uma nova lista sem lançar loop, no cenário de medição assíncrona simulado.

**Mocks/fixtures:**

- MessageBubble, realtime e delete substituídos; ResizeObserver emite dimensões constantes com setTimeout(0), sem unobserve/disconnect efetivos; mensagens pequenas e callbacks spies.

**Limites:**

- Não testa histórico longo, mudança real de altura, prepend/paginação ou posição de rolagem.
- Callbacks agendados do observer falso não são cancelados ao desmontar; os asserts de bolhas não medem cleanup do observer/real canal.

**Relação com achados.** Não afasta R2-INB-004/R2-INB-025: paginação antiga e autoscroll não são exercidos.

## 050 — src/components/inbox/chat/__tests__/ChatPanelHeader.test.tsx

Leitura integral 1–195. Revisor: `inbox`. Blob `84be23f320873a3eca05b04012a2e21df814cf8d`; SHA-256 `6451af273a349b11d5ba1af83ea0cc235d9ada8c640c6e974cc82734a1bc4556`.

**Adjudicação.** Cobertura de exibição e encaminhamento de callbacks, com menus simplificados. Um assert cristaliza justamente a presença inferida indevidamente a partir de não estar digitando.

**O que os asserts demonstram:**

- Cabeçalho mostra nome/iniciais, itens condicionados ao handler de resumo e callbacks de resumo/busca/favorito; pinned faces navegam por ID e somem com detalhes abertos.

**Mocks/fixtures:**

- Mobile fixo false; popup, SLA, seletores e colaboração simulados; menus/popovers sempre abertos; conversa sem informação real de presença.

**Limites:**

- Não testa abertura/foco real dos menus, ações remotas, layout mobile, resultado do popup ou colaboração.
- O teste exige Online quando isContactTyping=false, sem fixture de presença/offline; confirma o rótulo estático, não disponibilidade real.

**Relação com achados.** R2-INB-030: teste Online representa a implementação fixa, não evidência de presença do contato.

## 051 — src/components/inbox/chat/__tests__/ChatSearchBar.test.tsx

Leitura integral 1–362. Revisor: `inbox`. Blob `39d151d3f6a63beca9e4a9cd0d4ff55e2ff89f1a`; SHA-256 `2bf20e85dfd2376ea2e7144bfecf4c0b51980393515f01cc8044b08f60e9abd1`.

**Adjudicação.** Boa cobertura do filtro e seleção local para mensagens disponíveis, com limites específicos nos asserts de debounce, reabertura e reset.

**O que os asserts demonstram:**

- Busca local por conteúdo/transcrição, filtros de tipo/link, combinações, resultados vazios e conteúdo nulo funcionam nas fixtures; setas percorrem resultados, Escape fecha e fechar limpa highlights.
- Com entrada rápida o resultado final corresponde ao termo final; regex literal especial não causa exceção.

**Mocks/fixtures:**

- Componente real, dez mensagens em props, callbacks spies e timers falsos com avanço; nenhuma consulta ou componente de mensagens montado.

**Limites:**

- O caso chamado fechar e reabrir só fecha; o de debounce verifica apenas o último resultado, sem excluir chamadas intermediárias.
- O teste de reset activeIndex condiciona o assert a activeId truthy, permitindo ausência de seleção sem falha.
- Não confere onNavigateToMessage/rolagem efetiva nem pesquisa mensagens ainda não carregadas; fixtures não integram paginação, foco global ou Ctrl+F concorrente.

**Relação com achados.** R2-INB-004 e R2-INB-017 permanecem fora do alcance: mensagens antigas não carregadas e handlers de atalho concorrentes.

## 052 — src/components/inbox/chat/__tests__/ChatWatermark.test.tsx

Leitura integral 1–25. Revisor: `inbox`. Blob `0e119488a21257d19c208b082bd66173af695232`; SHA-256 `6be968027dbb48c56e884264585e92ade6cecf4c098a8154aa5bb4ce145eea0b`.

**Adjudicação.** Regressão estrutural dirigida à decoração e constantes CSS, sem validação visual.

**O que os asserts demonstram:**

- Watermark renderiza elemento vazio aria-hidden; tokens.css contém valores textuais esperados de tile e opacidade.

**Mocks/fixtures:**

- Componente real e leitura direta do CSS; sem mock ou layout real.

**Limites:**

- Regex apenas encontra valores no arquivo, sem validar seletor/cascata, modo claro/escuro ou estilo calculado; aria-hidden/DOM vazio não medem eventos/pointer-events ou contraste.

## 053 — src/components/inbox/chat/__tests__/ConversationTabs.test.tsx

Leitura integral 1–103. Revisor: `inbox`. Blob `0278ecf817082a7e35bedee1f2b80d50fcaabb0c`; SHA-256 `6682f739412f5a01fff21ec9a02d9e9a64695ace2e361fb023afbcc083b2ded6`.

**Adjudicação.** Teste adequado de composição e contrato de props da barra; não é evidência de dados ou navegação completa das abas.

**O que os asserts demonstram:**

- Ordem exata das oito abas, ausência de reminders, rótulos SalesView/Journey, badges positivos/zero, callback files e ação trailing fora do tablist.

**Mocks/fixtures:**

- Componente real com contagens fornecidas; callback spy. Nenhum hook de contagem/banco é importado além do tipo.

**Limites:**

- O caso extraCounts.orders zero ou ausente só fornece ausente; aria-selected é conferido em duas abas.
- Não exerce teclado da barra, contagem via RPC, alteração de contato ou corpos dos painéis.

## 054 — src/components/inbox/chat/__tests__/HighlightedText.test.tsx

Leitura integral 1–44. Revisor: `inbox`. Blob `55c0e875de858225aa614e05061002c95e5ab651`; SHA-256 `0a14be403ca21280038606e49ea4eacd2f7ef04268aa6a0646c49015ffc14920`.

**Adjudicação.** Regressão direta da conservação do texto, com controle de trim; não comprova toda semântica de destaque/acentos ou experiência assistiva.

**O que os asserts demonstram:**

- Texto concatenado preserva espaços nos casos inicial, intermediário e repetido; query com espaços ainda produz ao menos um mark.

**Mocks/fixtures:**

- HighlightedText real; strings fixas e inspeção do DOM, sem mocks.

**Limites:**

- O caso chamado acentos usa 'Joao' sem acento; não demonstra normalização Unicode.
- Os quatro primeiros casos só verificam textContent, podendo passar sem qualquer destaque; somente o último exige mark. Leitor de tela real não foi exercido.

## 055 — src/components/inbox/chat/__tests__/PinnedConversationsStack.test.tsx

Leitura integral 1–41. Revisor: `inbox`. Blob `b532fc20f6e14555f84bde921045542aa0f9e2c2`; SHA-256 `29f1961365383e6187a2799ab9efc7a8d9c5000e450284fd8ddb9bd8a76b707a`.

**Adjudicação.** Teste pequeno e coerente de apresentação/callback do stack.

**O que os asserts demonstram:**

- Lista vazia rende nada; até seis faces não há overflow; nove itens produzem seis faces/+3; clique devolve ID do contato.

**Mocks/fixtures:**

- Componente real com avatarUrl null e callback spy.

**Limites:**

- Não abre overflow, navega na tela completa, persiste pins ou carrega avatares; só o limite positivo seis é testado.

## 056 — src/components/inbox/contact-details/__tests__/ContactActionButtons.test.tsx

Leitura integral 1–111. Revisor: `inbox`. Blob `fd032f79256cc2265031d49dd388dcd22eedc8ed`; SHA-256 `2a66c38da8ec2aeea9ee311ef49e3d7ed163f7b869fc53575ce924e06d6f4ffa`.

**Adjudicação.** Cobertura dos controles de entrada e alguns callbacks; não prova efeito operacional das ações delegadas.

**O que os asserts demonstram:**

- Menus de chamada/mais abrem com sequência pointer/click; Editar devolve ação; email ausente desabilita e presente navega para email-chat; wrapper disabled tem atributos de acessibilidade; flag controla exibição de vídeo.

**Mocks/fixtures:**

- CRM desabilitado/desconfigurado, sync e navegação spies, toast simulado e flag vídeo variável. Contato fixo com email/telefone.

**Limites:**

- O título do caso 63 diz que não chama navigateToView, mas o assert 69 exige a chamada; a evidência é o assert.
- Não efetua chamada, passa destinatário ao email, sincroniza CRM ou confirma handoff/quick-actions no pai; atributos focáveis não exercitam teclado ou tooltip real.

**Relação com achados.** Não afasta extensão de handoff R2-INB-009 ou ações sem implementação AUTH-012: esses consumidores não são montados.

## 057 — src/components/inbox/contact-details/__tests__/ContactHeaderSection.test.tsx

Leitura integral 1–427. Revisor: `inbox`. Blob `7d7414773bc55b04697e0df44f9f38d5de40f42e`; SHA-256 `486e7e260cdcae34e745f9fc1c020235cb2a4b5a426ab3e81ba784789276f488`.

**Adjudicação.** Cobertura ampla de apresentação e fallback para fixtures conhecidas, com limites entre estilo/markup e garantias de acessibilidade ou operações.

**O que os asserts demonstram:**

- Cabeçalho apresenta primeiro nome/apelido, empresa/iniciais, tipo/prioridade, estados sem enriquecimento e datas válidas; evita repetição do nome CRM por acento/caixa e aceita fallback de apelido.
- Scores das fixtures 50/75/80/100 recebem cores inline e texto esperado; menu inclui/exclui recolher conforme prop.

**Mocks/fixtures:**

- CRM360, configuração externa, favoritos, sincronização, flags e toast simulados; dados enriquecidos fornecidos diretamente e CRM variável resetado entre casos.

**Limites:**

- Aceitar onQuickAction e mostrar recolher não executa essas ações; modo compacto é verificado apenas por textos também presentes no modo comum.
- O teste de email procura qualquer botão disabled e o de telefone verifica apenas ausência de texto, não href.
- Ratios WCAG são comentários, sem cálculo/contraste real; assert universal de score>=50 usa uma única fixture. Não exercita consulta externa, autorização, gravação ou mudança assíncrona de identidade.

## 058 — src/components/inbox/contact-details/__tests__/ContactInfoSection.test.tsx

Leitura integral 1–64. Revisor: `inbox`. Blob `947b34742ae70eb7c6e2b92d94a878a6351d8b35`; SHA-256 `58049d841fb4d5db71b431b5d8df867c6c02dc897c29bbe30f8a4090a2e65090`.

**Adjudicação.** Regressão adequada de invalidação após sucesso assumido; não demonstra que o valor foi persistido nem que sucesso corresponde a linha alterada.

**O que os asserts demonstram:**

- Salvar edição de email chama filtro id=c1 e invalida queries contacts-search/contact-enriched previamente preenchidas.

**Mocks/fixtures:**

- QueryClient real; Supabase update/eq simulado sempre resolve error:null, sem retornar número de linhas; toast mockado.

**Limites:**

- O mock não captura nem valida o payload de update ou tabela; só verifica filtro id.
- Não testa erro, zero linhas/RLS, campos company/job_title, cancelamento ou confirmação da mudança pelos consumidores após refetch.

**Relação com achados.** Relaciona-se apenas como limite de teste aos contratos de edição/ACL auditados por Auth; não gera novo ID.

## 059 — src/components/inbox/contact-details/__tests__/EditContactDialog.test.tsx

Leitura integral 1–493. Revisor: `inbox`. Blob `ed7aad67797007ea9d5f665a94794cb0cfa4fb3a`; SHA-256 `b28aadbc9ed45783b1357cf5cec717eafb3f4508c98c11c0640f4ee5069743c9`.

**Adjudicação.** Cobertura relevante de payload diferencial, reabertura e erros retornados. Limites específicos impedem generalizar para autorização/zero linhas, estado otimista intermediário ou todas as condições de hidratação.

**O que os asserts demonstram:**

- Formulário preenche campos, salva payload de diferenças, converte campos opcionais apagados em null, preserva endereço/coordenadas não alterados e evita UPDATE quando nada mudou.
- Abrir após dados chegarem ressincroniza valores e baseline; cancelamento fecha; erro retornado gera toast/mantém diálogo e restaura estado final do cache; sucesso invalida chaves atuais, preservando chave antiga contacts.

**Mocks/fixtures:**

- QueryClient real; UPDATE/eq controlados, consultas de duplicidade sempre vazias e cargos/empresas simulados; stubs de APIs de ponteiro/scroll para Radix.

**Limites:**

- Nenhum resultado zero linhas ou regra RLS; phone modificado é validado apenas como truthy, não contra número esperado.
- Teste open=false busca role dialog no container local, embora Radix use portal; isoladamente pode passar com diálogo fora do container.
- Rollback só observa valor final original, sem provar atualização otimista intermediária; a suíte não reproduz callbacks múltiplos síncronos do autocomplete (limite explicitamente reconhecido no arquivo).
- Casos null contact_type e campos vazios exigem só título, não defaults concretos; não há resposta pendente ao trocar contato ou enriquecimento chegando com formulário já aberto.

## 060 — src/components/inbox/contact-details/__tests__/StoryViewer.test.tsx

Leitura integral 1–136. Revisor: `inbox`. Blob `788bc6785adaa04c9c64986275924cd04129dabd`; SHA-256 `57114caf0bfe6d770f57def9ac0c34676cbcf586b2cc84bbf3c88b1c33b6ea93`.

**Adjudicação.** Regressão útil da identidade do status visível e de erro, delimitada por mídia/API simuladas.

**O que os asserts demonstram:**

- Viewer inicia no índice pedido, navega por setas e reinicia ao receber key nova; resolve mídia por status, remove mídia anterior enquanto a seguinte está pendente e exibe erro de carregamento.

**Mocks/fixtures:**

- API de mídia com identidade estável, formato de tempo e volume substituídos; instância global fixa e strings base64 artificiais; promessa pendente controlada para segunda mídia.

**Limites:**

- Não decodifica imagem/reproduz vídeo, não verifica instância/argumentos completos ou permissões.
- O reset por key é imposto pelo teste; integração do pai é verificada em outro arquivo. Não resolve A tardiamente após B nem troca instância/contato durante fetch.

## 061 — src/components/inbox/contact-details/__tests__/WhatsAppStatusSection.test.tsx

Leitura integral 1–284. Revisor: `inbox`. Blob `6d6de59e4c129ec5cabbc5418e405fc0988e34f5`; SHA-256 `0f03e2656e728abb752738d215147bb7d90fb566265f1ab776642cc650f8c8cc`.

**Adjudicação.** Cobertura de apresentação da seção e integração positiva do reset por key do viewer, sem atestar dados/presença do provedor.

**O que os asserts demonstram:**

- Seção apresenta loading, erro/retry, vazio, presença e contagens de status; reabrir o viewer real após navegar/Escape retorna ao primeiro status.

**Mocks/fixtures:**

- useWhatsAppStatus devolve estado pronto ignorando telefone; API de mídia estável e formatRelativeTime simulados. Fixtures de diferentes tipos e até 50 status recentes.

**Limites:**

- Casos intitulados renderização de imagem/vídeo/texto só exigem botão Ver Status, sem visualizar o conteúdo; teste de refresh só exige algum botão, enquanto retry de erro efetivamente confere callback.
- O texto 'desaparecem após 24h' não valida expiração, consulta ou vínculo ao telefone; caso de clique sem crash não tem assert de abertura (coberta depois no cenário de reabertura).

**Relação com achados.** Não afasta R2-INB-030: esta seção usa estado de presença mockado; o achado trata o rótulo incondicional de outro cabeçalho.

## 062 — src/components/inbox/contact-details/__tests__/contactDetailSections.test.ts

Leitura integral 1–26. Revisor: `inbox`. Blob `d1819da03413420c6fd3d262fe2248912f7f21e6`; SHA-256 `2cae5bfa2a2ab5880156d9a70d9d7e1e91d0f4aa3deccdca9648b2e599816595`.

**Adjudicação.** Regressão específica da migração do catálogo de seções, coerente com o escopo dos asserts.

**O que os asserts demonstram:**

- Estado de accordion persistido com itens removidos é filtrado; se só removidos sobram, usa defaults; catálogo não inclui três seções migradas.

**Mocks/fixtures:**

- Constantes/helper reais e localStorage de teste limpo antes de cada caso.

**Limites:**

- Não testa JSON inválido, falha de acesso ao armazenamento, valores de tipo inesperado ou interação do accordion na tela.

## 063 — src/components/inbox/contact-details/__tests__/editContactShape.test.ts

Leitura integral 1–93. Revisor: `inbox`. Blob `c9f516857e84ac279d9626d5b2d647861f1cade1`; SHA-256 `ed1f8abf67d5237529d3079140323c78c8e7d4bd1fbf1921fbd817340a715e50`.

**Adjudicação.** Cobertura direta e útil do adaptador de props, sem estender a garantia à consulta e persistência.

**O que os asserts demonstram:**

- Helper repassa seis colunas de endereço e coordenadas, prioriza valor enriquecido e usa contato como fallback; ausências permanecem undefined e campos antigos listados são preservados.

**Mocks/fixtures:**

- Helper puro real, contato/endereço/coordenadas literais; sem rede/React.

**Limites:**

- Não monta os chamadores nem salva formulário: a conclusão no título sobre não gravar null depende de outro contrato.
- Prioridade com null explícito, dados desatualizados e erros de enriquecimento não são exercidos; não valida formato/intervalo das coordenadas.

## 064 — src/components/inbox/contact-details/sidebar/__tests__/professionalFallback.test.ts

Leitura integral 1–47. Revisor: `inbox`. Blob `8b12ccac1febc53c6587fbca083a36a5d967f322`; SHA-256 `28ac2b175f1d9737a8e72bd96a15d7eb072ab00c0fccece07fd560ebdab3f22b`.

**Adjudicação.** Teste unitário pequeno e adequado ao contrato declarado de fallback.

**O que os asserts demonstram:**

- Helper monta fallback profissional com telefone/email locais e empresa/cargo enriquecidos; ausências viram null e departamento permanece null.

**Mocks/fixtures:**

- Função pura real com fixtures completas, parciais e sem enriquecimento.

**Limites:**

- Não integra painel CRM, carregamento assíncrono, precedência de dados remotos ou persistência; só transformação de objetos.

## 065 — src/components/inbox/location-picker/__tests__/SuggestionList.test.tsx

Leitura integral 1–244. Revisor: `inbox`. Blob `81292eddfade49c74f50261195c95b630edecc24`; SHA-256 `cd821ca8b08b76b8b1aaa46d22fec0e0c6d201d215f5a90839f73b56dc1edd27`.

**Adjudicação.** Boa cobertura de estados e affordance de retry, com limite claro entre markup/atributos e comportamento visual/assistivo do browser.

**O que os asserts demonstram:**

- Lista pausada mostra contagem/retry, pausa vencida usa texto de nova tentativa e teto mensal não oferece retry; callback de retry é chamado.
- Região viva tem contagem/estado e texto estável para query distinta com mesmo estado/quantidade; visualViewport resize altera maxHeight e unmount pede remoção de listener; classes de responsividade/alvos/movimento são verificadas.

**Mocks/fixtures:**

- Componente real com estados prontos, sugestões literais e visualViewport falso; relógio real com tolerância de segundos e callbacks spies.

**Limites:**

- Não avança contagem pelo tempo até zero: estado vencido é montado diretamente.
- Resize só exige que maxHeight mude e removeEventListener receba alguma função, não o mesmo callback exato; visualViewport definido no teste não é restaurado neste arquivo.
- Classes não comprovam altura física, ausência de overflow a 360px ou animação reduzida real; texto estável não mede quantidade de anúncios de leitor de tela.

## 066 — src/components/inbox/location-picker/__tests__/searchErrors.test.ts

Leitura integral 1–41. Revisor: `inbox`. Blob `dd06c7802dbc85e1ff6f17ae774b9ef3e4da8c03`; SHA-256 `48a3dfb6fa010258cc530039aa9a55582c879ee427f7287e72deb1cbec6ff37a`.

**Adjudicação.** Teste de catálogo de textos e distinções específicas, sem garantia global de privacidade ou todas as rotas de erro.

**O que os asserts demonstram:**

- Helper real produz texto não vazio/pontuado para sete causas, distingue limite temporário/custo mensal e inclui contagem/orientação de Enter no aviso de pausa.

**Mocks/fixtures:**

- Funções puras reais; lista local de causas e entradas literais.

**Limites:**

- O teste 'toda causa tem texto próprio' não compara unicidade de todos os textos, apenas de duas causas.
- Ausência das strings xbz/rua em mensagens fixas não prova que o termo digitado não saia por requisições/telemetria em outros caminhos; helper nem recebe query.

## 067 — src/components/inbox/location-picker/__tests__/useAddressAutocomplete.reducer.test.ts

Leitura integral 1–58. Revisor: `inbox`. Blob `b7d15c6aee29afcfce7fb8ba3ea57ab69353fd35`; SHA-256 `c7fba42ff9f8ce444eba943c656e2ead69b6a5aa3e3b4668705db010dc3301b0`.

**Adjudicação.** Controles diretos que isolam a autoria das transições no reducer. Não demonstram invalidação da seleção assíncrona ao mudar query.

**O que os asserts demonstram:**

- Reducer real faz RETRY limpar pausa e incrementar attempt; CLEAR conserva rateLimitedUntil e reseta os campos conferidos; SET_QUERY limpa highlight mantendo a lista.

**Mocks/fixtures:**

- Reducer e initialState importados do hook; objetos de estado construídos diretamente, sem efeitos/rede.

**Limites:**

- Não exercita refs, controllers, timers, seleções pendentes ou a retomada de consultas do hook; CLEAR confere campos específicos, não igualdade de todo o objeto.

**Relação com achados.** R2-INB-037 usa refs/await de select; limpar o destaque no reducer não cancela a promise antiga.

## 068 — src/components/inbox/location-picker/__tests__/useAddressAutocomplete.test.tsx

Leitura integral 1–1006. Revisor: `inbox`. Blob `ae2281005efe9356414cf659edc41d1d41adf192`; SHA-256 `9dad5197d4d2990b24e31c27b31e105446825bc210c4c0cf5625e17be02548d6`.

**Adjudicação.** Arquivo com controles positivos sólidos de concorrência, retry e cache no hook. As sequências protegidas são específicas: elas não cobrem a invalidação de retrieve por mera mudança de termo, e alguns asserts de sessão/contagem são mais fracos que os títulos.

**O que os asserts demonstram:**

- Hook real controla debounce, limiar mínimo, enabled, cache antes de sessão, estado typing/loading/ok/empty/error, bloqueio de custo e backoff/retry; telemetria de seleção usa campos limitados nos casos testados.
- Promessas controladas demonstram descarte de suggest antigo inclusive durante debounce novo, seleção A superada por seleção B, clear invalidando retrieve e enabled=false invalidando suggest/retrieve.
- Fallback suggest→forward e retrieve→forward preserva coordenadas e diferencia falha de rota/sem resultado; seleção retorna ponto, encerra sessão e atualiza anúncio sem acumular.

**Mocks/fixtures:**

- Geocode suggest/retrieve/search/cache, sessão, orçamento e telemetria simulados; demais exports reais. Timers falsos, sugestões/locais literais e promises resolvidas manualmente; getSearchSession sempre retorna 'session-1' por padrão.

**Limites:**

- Nenhum cenário inicia retrieve, muda apenas query e depois resolve retrieve; os testes de nova query são de suggest ou destaque, e os testes de retrieve usam nova seleção, clear ou disable.
- E80 usa token constante do mock: Set de tokens com tamanho um não demonstra uma única criação/renovação de sessão real; não mede custo real do fornecedor.
- O caso E51 intitulado 'reporta uma vez' repete o mesmo toHaveBeenCalledWith e não verifica contagem; keyboard menciona ArrowUp mas a sequência testa ArrowDown/Home/End.
- Não valida parsing/AbortSignal consumido pelo transporte vivo, GPS, unmount com request pendente ou schema real da Mapbox; privacidade é conferida nos eventos simulados, sem provar todo tráfego.

**Relação com achados.** R2-INB-037 preservado: setQuery durante retrieve não equivale às transições clear/disable/nova seleção cobertas.; Qualidade dos asserts é extensão de evidência de GOV003/TC-011, sem novo ID de produto.

## 069 — src/components/inbox/location-picker/__tests__/useLocationPicker.test.tsx

Leitura integral 1–521. Revisor: `inbox`. Blob `a4a1523d9c72d1c983f5ba8e18476e4ab94b80ab`; SHA-256 `c72792384d66384e14bfd122c211caf5dcdd3d061f7a9fde41f1fe44ec6fab4a`.

**Adjudicação.** Cobertura substancial dos estados, da geometria enviada ao SDK falso e da transição de abas. Mantém limites claros de GPS concorrente e fronteiras físicas/externas.

**O que os asserts demonstram:**

- Hook real cria mapa após container tardio, trata token/mapa/timeout e retry force; load tardio limpa erro e troca de aba remove/recria mapa centrado na seleção.
- Busca trata 429/rede/vazio, aborta consulta anterior e usa resultado novo; reverse geocode timeout preserva coordenadas. Múltiplos candidatos aguardam escolha, único aplica direto.
- Proximity acompanha mapa/GPS/fallback e origem click/gps/forward/suggest/reset é observada.

**Mocks/fixtures:**

- Token, report, SDK e toast simulados; FakeMap registra centro/zoom/remoção/eventos e FakeMarker registra posição. Geolocalização chama sucesso de forma síncrona; fetch por caso usa respostas fixas ou promessa que rejeita ao receber abort.

**Limites:**

- Nenhum GPS retorna depois de escolha manual: callback getCurrentPosition é imediato em todas as fixtures, portanto não cobre R2-INB-036.
- Cancelamento é demonstrado com fetch que respeita AbortSignal, sem decodificação/WebGL/dispositivo real; não monta Radix, apenas reproduz a ordem esperada de chegada do container.
- Object.defineProperty de navigator.geolocation não tem restauração explícita neste arquivo; nem todo caso GPS com token define fetch localmente, e a configuração global determina o isolamento restante. Suíte não executada.

**Relação com achados.** R2-INB-036 permanece fora da ordem de eventos das fixtures; não é invalidado por GPS síncrono ou nova busca textual cancelando outra busca.

## 070 — src/components/inbox/media-gallery/__tests__/MediaPreviewDialog.test.tsx

Leitura integral 1–135. Revisor: `inbox`. Blob `7dbbbef585d30c1356434f335f7ba532e58d290b`; SHA-256 `70524829b40b6e2333fb7f21878608f3e5f81cb97ae27abc158a526f52511a6f`.

**Adjudicação.** Boa cobertura da navegação interna e contrato visual de preview sob resolver instantâneo; a palavra assinada nas fixtures não equivale a segurança/renovação exercida.

**O que os asserts demonstram:**

- Viewer navega na coleção por botões/setas, desabilita limites, mostra nome amigável/técnico e devolve foco após Escape; PDF usa iframe e planilha chama window.open com noopener/noreferrer.
- Áudio usa controlslist=nodownload e os tipos internos não exibem botão Abrir; classe max-h é conferida.

**Mocks/fixtures:**

- Resolver de Storage devolve diretamente a string recebida sem loading/erro; volume é stub. Harness controla item e abertura; URLs chamadas signed.test são literais, sem assinatura.

**Limites:**

- Não comprova validade/renovação/ACL de URL assinada, erro de mídia ou conteúdo do iframe; nodownload e ocultar botões são affordances, não controle de acesso ao recurso.
- Navegação usa coleção já filtrada em props; não testa exclusão concorrente do item, carregamento paginado ou foco no aplicativo completo.

**Relação com achados.** Não afasta R2-INB-031/R2-INB-059: controle de download e renovação por outro caminho não são integrados.

## 071 — src/components/inbox/tabs/__tests__/AiTab.test.tsx

Leitura integral 1–99. Revisor: `inbox`. Blob `bce0dc4c5f1620c191d35de5423528748501126f`; SHA-256 `8304ba8358732efc5ce1ed644b0fb105f5fbab01d7b04dea3543071bd4499e93`.

**Adjudicação.** Teste de composição e estados vazios, sem cobertura das operações IA ou de produtos não vazios.

**O que os asserts demonstram:**

- AiTab exibe ausência/presença de análise, ausência de sentimento/ações/produtos e repassa texto do callback de sugestão.

**Mocks/fixtures:**

- Hooks de análise/ação/lead score e subcomponentes de IA substituídos; Supabase chain ignora filtros e retorna produtos vazios; QueryClient real.

**Limites:**

- Horário só verifica prefixo; nenhuma análise/ação/produto real é renderizado, erro/estado loading não é injetado.
- Não verifica contactId no stub de sugestões, contrato da geração ou moeda de produto não BRL; empty state honesto depende de error:null fornecido pelo mock.

## 072 — src/components/inbox/tabs/__tests__/ContactStatsStrip.test.tsx

Leitura integral 1–73. Revisor: `inbox`. Blob `cc7890b7512a1d9db089dce299dd0d1cb0ab65a4`; SHA-256 `fa65048c3bc43cc93593465ec7a71d20e3a431cdf772578e44afed95f8102731`.

**Adjudicação.** Cobertura de formatação e apresentação das métricas recebidas; não prova a semântica ou completude das métricas produzidas.

**O que os asserts demonstram:**

- Strip apresenta quatro métricas, formata 90 minutos, trata CSAT ausente e mostra duas variações com classes positivas/negativas; isLoading produz quatro filhos.

**Mocks/fixtures:**

- useContactStats retorna métricas/percentuais prontos. renderStrip possui default data=STATS, inclusive ao receber undefined explicitamente.

**Limites:**

- Percentual chamado real é valor literal do mock, sem cálculo de período/consulta; isLoading é testado ainda com STATS pelo default do helper.
- Não verifica erro, ausência de data sem loading, precisão estatística ou contato passado ao hook; classes não medem cor visual.

## 073 — src/components/inbox/tabs/__tests__/Crm360Tab.test.tsx

Leitura integral 1–207. Revisor: `inbox`. Blob `4f96c82bac6684fbb2a58d4d4e4eb5e6de0573e1`; SHA-256 `70eaaf2128b648a123ab59c03fdc593383889e28f0c9694a3d18f1141d2e156a`.

**Adjudicação.** Controles úteis do wiring de abas e da espera por enriquecimento antes do editor. Dados e mutações do CRM ficam fora da prova.

**O que os asserts demonstram:**

- CRM tab apresenta KPIs/empty states, moeda BRL da fixture e stepper; links delegam SalesView/Journey/pipeline.
- Editor stub recebe endereço/coordenadas do enriquecimento do contato correto; cache frio impede montagem até isLoading=false com dados.

**Mocks/fixtures:**

- CRM360, score, enriquecimento, etapas, tarefas e navegação simulados; editor lazy substituído por marcador JSON; QueryClient real e fixtures comerciais locais.

**Limites:**

- Não executa avanço de etapa, criação de tarefa ou persistência no editor; stepper só exige texto/botão.
- Ausência de strings da imagem de referência é uma blacklist pequena, não prova geral de ausência de dados inventados.
- Não injeta falha do enriquecimento, troca de contato pendente ou disputa de cache; o formulário real é excluído.

## 074 — src/components/inbox/tabs/__tests__/FileCard.test.tsx

Leitura integral 1–161. Revisor: `inbox`. Blob `59a69692973b7f471a0d4d74f237747727885104`; SHA-256 `d2fe9d7edfa56667c769d25dc189ce905fb9a8f41adfde29132ce9bc18c02eb4`.

**Adjudicação.** Regressão de apresentação e roteamento de cliques. Títulos de teclado/semântica possuem alcance maior que os eventos/asserts usados.

**O que os asserts demonstram:**

- Card distingue preview/detalhes/seleção por callbacks, exibe nomes e metadados, bloqueia encaminhar/baixar no estado testado, restringe menu excluir a mensagem do atendente e usa object-contain.

**Mocks/fixtures:**

- Resolver retorna a entrada imediatamente; item de imagem com signedUrl fixo e documento recebido derivados da mesma fixture; callbacks e clipboard spies.

**Limites:**

- Testes chamados Enter/Space usam somente click; o caso 'é article' só verifica testid e botões, sem tagName do article.
- Caso intitulado sem download para contato verifica ausência de Excluir; não exercita ACL do objeto ou execução do delete.
- Não confirma payload/efeito de encaminhar, download real, assinatura ou layout calculado; ausência de clipboard durante abertura do menu não prova todos os fluxos.

**Relação com achados.** Não afasta R2-INB-059: resolver é instantâneo e não recebe falha de URL assinada em lote.

## 075 — src/components/inbox/tabs/__tests__/FileThumb.test.tsx

Leitura integral 1–236. Revisor: `inbox`. Blob `9001744655a2101c973fe5e23eeaf01921e19cd9`; SHA-256 `b0a2d76063d87c08994bc5673d09ac20482be81aa2f69a968ee241f016968dc8`.

**Adjudicação.** Controles positivos de estados e retry no componente sob resolver substituído. A fixture exclui a precondição principal do defeito de renovação em lote.

**O que os asserts demonstram:**

- FileThumb apresenta loading/ready/error/no-preview, limita refresh automático a uma chamada nos eventos de erro testados e atualiza src quando o estado simulado muda.
- Variantes CF produzem srcSet; observer controlado adia video, loadedmetadata fornece duração, e áudio/documentos usam ícones/labels sem conteúdo inventado.

**Mocks/fixtures:**

- useResolvedStorageUrl ignora seus argumentos e devolve hooks.current; refresh é spy com resultado controlado. Sucesso é representado também por setResolved/rerender manual. IntersectionObserver não mede layout e evento de duração é sintético.

**Limites:**

- Todos os cenários de erro/refresh usam item.signedUrl undefined; nenhum testa erro quando o item já traz signedUrl em lote e o resolver real recebe string vazia.
- Atualização manual do mock não prova que refresh real muda a URL nem cobre mudança de item com resposta pendente; assinatura/TTL/ACL/codec não são executados.
- Observer e classes só validam intenção de preload/estilo; não medem download de bytes, duração real, saída da zona ou cleanup de observer.

**Relação com achados.** R2-INB-059: signedUrl ausente nos testes de erro mascara o caminho ativo problemático; R2-INB-033 pertence ao resolver real, substituído aqui.

## 076 — src/components/inbox/tabs/__tests__/FilesColumnSelector.test.tsx

Leitura integral 1–55. Revisor: `inbox`. Blob `0887b1c0bd6c965446a7d2ec2df1969332f8ac1e`; SHA-256 `bc5ea14c2d7ad613d26ed4a67c22225c428710da922c764c6adf11e67ba9a02a`.

**Adjudicação.** Teste direto do controle de colunas e de suas fronteiras de responsabilidade, sem prometer layout real.

**O que os asserts demonstram:**

- Cinco opções permanecem visíveis, fits controla bloqueio/motivo e clique bloqueado não altera; ArrowRight pula opções que não cabem; valor ativo vem de props e não escreve storage/lê innerWidth no cenário testado.

**Mocks/fixtures:**

- Componente real; options construídas por fits, callbacks spies e spies de Storage/innerWidth restaurados.

**Limites:**

- Não mede largura real/container nem integra cálculo de fits; só uma direção de teclado e combinação de opções são exercidas.

## 077 — src/components/inbox/tabs/__tests__/FilesContent.test.tsx

Leitura integral 1–140. Revisor: `inbox`. Blob `2ee3392cfa3d50a8b5d77face8b064155c8ae7db`; SHA-256 `7d797018aa457afda493fd6c69ce31e20764275184e6d396690306f5edf2d346`.

**Adjudicação.** Cobertura útil da composição nos três modos e de estados de consulta apresentados por props; não demonstra a cadeia de paginação/dados completa.

**O que os asserts demonstram:**

- Grid/list/table preservam ordem dos três IDs e encaminham ação Preview; skeletons, vazio real, busca/filtro vazios, erro com/sem lista e loading de próxima página têm estados distintos.
- Botões limpar/retry/loadMore chamam os callbacks; ausência de próxima página remove botão e sentinel.

**Mocks/fixtures:**

- Resolver instantâneo e três itens em props; callbacks de ações/seleção/paginação spies, sem hook de consulta.

**Limites:**

- A paridade verifica somente Preview, sem payload ou todas as ações; sentinel é apenas localizado, sem IntersectionObserver efetivo.
- Não integra carregamento da próxima página, retenção de seleção, ordenação no hook, falha de mídia ou acesso Storage.

**Relação com achados.** Paginação da aba Arquivos aqui possui controles, diferentemente de R2-INB-004 no histórico de mensagens; não confundir os consumidores.

## 078 — src/components/inbox/tabs/__tests__/FilesLayoutPopover.test.tsx

Leitura integral 1–78. Revisor: `inbox`. Blob `8ba39a453e5a600394db6b6928c6728cc411e7ee`; SHA-256 `8d4b682258d6a2a91dee970fbb76532ef90b2cf59e210ba14dec435fd1ab1a2e`.

**Adjudicação.** Regressão pequena do controle por props e visibilidade das opções, sem integração da persistência/layout.

**O que os asserts demonstram:**

- Popover expõe rótulo/title, modo ativo, esconde colunas fora do grid e repassa mudanças; seleção de colunas continua marcada pela prop até rerender.

**Mocks/fixtures:**

- Componente real, cinco opções que cabem e callbacks spies; rerender simula estado do pai.

**Limites:**

- Título diz ausência de Tooltip aninhado, mas asserts verificam só atributos/texto do gatilho; nenhum teste de foco/escape/teclado ou restrição por largura real.

## 079 — src/components/inbox/tabs/__tests__/FilesListView.test.tsx

Leitura integral 1–78. Revisor: `inbox`. Blob `50fed6d54fe15beba27728a98dbc8a7312cc9347`; SHA-256 `b4cfb6a1f30df8adac46b96122efeac7d63d8765de23a5e88ecaa67e1cd9467d`.

**Adjudicação.** Teste de apresentação responsiva por prop e callback de seleção, limitado às duas fixtures.

**O que os asserts demonstram:**

- Lista exibe nomes técnicos/amigáveis, remetentes/metadados e botões; largura fornecida de 600 oculta remetentes/encaminhar; checkbox repassa ID sem preview; size null omite tamanho.

**Mocks/fixtures:**

- Dois itens com signedUrl literal e props/callbacks; sem medir container no browser.

**Limites:**

- Alinhamento/altura/posição à esquerda são inferidos de classes/presença, sem geometria; não testa preview/delete real, renovação, teclado ou persistência de seleção.

## 080 — src/components/inbox/tabs/__tests__/FilesSelectionBar.test.tsx

Leitura integral 1–93. Revisor: `inbox`. Blob `a1846bde558cb24d262faced661f4d04f6a6c9bf`; SHA-256 `43735c3527ed9202f4245c6bc31c2cfe5e671e8dfb93fcec24dc1514aab9df01`.

**Adjudicação.** Boa cobertura do contrato visual e dos callbacks da barra; não prova seleção ou encaminhamento completos.

**O que os asserts demonstram:**

- Barra apresenta contagens/singular/aria-live, estado misto/marcado, seleção geral/clear/cancel e callback forward; motivo fornecido desabilita encaminhar e mostra texto; informa seleção fora do filtro.

**Mocks/fixtures:**

- Todos os counts/flags/reason são props e todos os handlers são spies; nenhum hook de seleção/envio montado.

**Limites:**

- Expressão 'handler real' refere-se a spy vi.fn, sem efeito operacional; acima de dez é testado junto a forwardLimitReason pronto, sem provar cálculo do limite.
- Aviso de 54 fora do filtro não exercita se essas mensagens serão incluídas no payload de encaminhamento; não há resultados/falhas por destino.

**Relação com achados.** Não afasta OTH-001: seleção fora do filtro exibida em props não garante inclusão no envio.

## 081 — src/components/inbox/tabs/__tests__/FilesTab.fase6.test.tsx

Leitura integral 1–275. Revisor: `root`. Blob `36641b2a46bc248b273f0fe6f3b357409df1bbcf`; SHA-256 `d477aa6470525884e888c6ef10635729554993ca55d5b18a5bbe673c716b33e0`.

**Adjudicação.** Renderiza FilesTab real com hooks de dados e larguras simulados; verifica grid8→6 com painel inline, Sheet sobreposto preservando5 colunas, seleção por filtro56→2, sobrevivência ao recorte e ausência de ids no localStorage. Exclusão recusada mantém seleção e toast de erro; aceita exige payload/id exatos e limpeza da seleção.

O sucesso explicita que o item só sai após refetch, não realizado pelo mock; não se contou essa remoção como observada. Largura retorna valores fixos e classes são assertadas sem motor de layout, enquanto RLS e Storage não são executados.

Revisão peer preservada em `peer-evidence/inbox-peer-test-review-extra.json`, SHA-256 `9075d8d9d81e215972caeb4b6b5729c0b8c643b5e70b1c77d10eeb8aaf034658`. As observações específicas de assertions, mocks e limites acima são do revisor indicado; não foram contadas como segunda leitura do Inbox.

**Limite de execução:** Leitura das assertions, mocks e contrato. Não houve execução de suíte, homologação de UI, SQL ou provedor.

## 082 — src/components/inbox/tabs/__tests__/FilesTab.test.tsx

Leitura integral 1–166. Revisor: `root`. Blob `867bec9c3db0f9dbbc80b7387f3f6cab1bac2089`; SHA-256 `1bb241b01c4593f706ecfa60ab044e054ec9c5e6cbdddb0053c47123708e2cdf`.

**Adjudicação.** Renderiza FilesTab real com duas mídias e contagens de fixtures; testa classes da grade, chips, busca/filtro, vazio, limpeza, detalhe e Carregar tudo chamando duas páginas simuladas. Reseta preferências e memória por conversa antes de cada caso.

O teste Carregar tudo observa o loop pelas flags retornadas, sem incorporar novas linhas no hook mockado. Contagens ditas reais são fixtures calculadas sobre o array e não banco; não há reprodução física ou validação visual das classes.

Revisão peer preservada em `peer-evidence/inbox-peer-test-review-extra.json`, SHA-256 `9075d8d9d81e215972caeb4b6b5729c0b8c643b5e70b1c77d10eeb8aaf034658`. As observações específicas de assertions, mocks e limites acima são do revisor indicado; não foram contadas como segunda leitura do Inbox.

**Limite de execução:** Leitura das assertions, mocks e contrato. Não houve execução de suíte, homologação de UI, SQL ou provedor.

## 083 — src/components/inbox/tabs/__tests__/FilesTableView.test.tsx

Leitura integral 1–98. Revisor: `root`. Blob `224f9bea55a74d47be3e9685b552919854261089`; SHA-256 `2e1d31dd2c044ea156d80e5f927e92388f00a3c02e8e10645ddd8025a155a1dd`.

**Adjudicação.** Renderiza tabela real com duas linhas, identifica colunas ordenáveis, callbacks de ordenação e aria-sort, removendo colunas por largura683/520. Confere table-fixed, wrapper de overflow e ids de linha.

O caso cujo título inclui Tamanho→biggest só monta o estado biggest e clica Arquivo→alpha; não clica o botão Tamanho. As larguras são props e não layout medido, e não há ordenação do array pelo consumidor nesse teste.

Revisão peer preservada em `peer-evidence/inbox-peer-test-review-extra.json`, SHA-256 `9075d8d9d81e215972caeb4b6b5729c0b8c643b5e70b1c77d10eeb8aaf034658`. As observações específicas de assertions, mocks e limites acima são do revisor indicado; não foram contadas como segunda leitura do Inbox.

**Limite de execução:** Leitura das assertions, mocks e contrato. Não houve execução de suíte, homologação de UI, SQL ou provedor.

## 084 — src/components/inbox/tabs/__tests__/FilesToolbar.test.tsx

Leitura integral 1–77. Revisor: `root`. Blob `3d4dd943d46662d713c4eaff5ed9ff75c4912405`; SHA-256 `7fa3bbe774630e049f67222784c6fab90106c29bbc2b054faa8a9a66d084b91b`.

**Adjudicação.** Renderiza FilesToolbar real e verifica controles nomeados, classes flex-wrap/min-width, callback de digitação, quatro opções e alternância Selecionar/Cancelar com aria-pressed e contador após rerender explícito.

A assertiva com título ordem do plano só exige presença, sem comparar ordem DOM. Não executa busca/ordenação do hook ou geometria responsiva; os callbacks e atributos do componente são os efeitos observados.

Revisão peer preservada em `peer-evidence/inbox-peer-test-review-extra.json`, SHA-256 `9075d8d9d81e215972caeb4b6b5729c0b8c643b5e70b1c77d10eeb8aaf034658`. As observações específicas de assertions, mocks e limites acima são do revisor indicado; não foram contadas como segunda leitura do Inbox.

**Limite de execução:** Leitura das assertions, mocks e contrato. Não houve execução de suíte, homologação de UI, SQL ou provedor.

## 085 — src/components/inbox/tabs/__tests__/KpiStrip.test.tsx

Leitura integral 1–46. Revisor: `root`. Blob `841397b158529ebeaabc4c16770b8a523280565b`; SHA-256 `fb516ecdc56f75e1b44b4aaf448be407e5be067eeea5b87053449edbe2443651`.

**Adjudicação.** Renderiza KpiStrip real e verifica rótulo, número, subtítulo, tabela de cinco tons e precedência de iconClassName sobre tone.

As assertivas inspecionam classes, não contraste calculado ou KPI derivado de dados. Os tons com alfa preservam o contrato de skin e não foram promovidos a nova violação de contraste sem medição e decisão.

Revisão peer preservada em `peer-evidence/inbox-peer-test-review-extra.json`, SHA-256 `9075d8d9d81e215972caeb4b6b5729c0b8c643b5e70b1c77d10eeb8aaf034658`. As observações específicas de assertions, mocks e limites acima são do revisor indicado; não foram contadas como segunda leitura do Inbox.

**Limite de execução:** Leitura das assertions, mocks e contrato. Não houve execução de suíte, homologação de UI, SQL ou provedor.

## 086 — src/components/inbox/tabs/__tests__/NotesTab.test.tsx

Leitura integral 1–128. Revisor: `root`. Blob `a1c15b1733c18d6daaa41fec85d3ea46dbfd91e9`; SHA-256 `2e6869ec893ce1e23f6de4f4ba7458b82e52785e6c7575ca19cb00a607666542`.

**Adjudicação.** Renderiza NotesTab real com hooks atuais simulados; verifica nota/objeção, criação de fato e tarefa com contato fixo, toggle de promessa, data sem hora e horário local, contagem de tarefas sem duplicar lista e navegação para tasks.

Os callbacks de escrita são spies, sem erros, persistência ou alteração da fixture retornada. A data local usa o fuso do processo e não matriz de navegadores; presença de texto da nota não prova sozinha seu agrupamento visual correto.

Revisão peer preservada em `peer-evidence/inbox-peer-test-review-extra.json`, SHA-256 `9075d8d9d81e215972caeb4b6b5729c0b8c643b5e70b1c77d10eeb8aaf034658`. As observações específicas de assertions, mocks e limites acima são do revisor indicado; não foram contadas como segunda leitura do Inbox.

**Limite de execução:** Leitura das assertions, mocks e contrato. Não houve execução de suíte, homologação de UI, SQL ou provedor.

## 087 — src/components/inbox/tabs/__tests__/SalesViewTab.test.tsx

Leitura integral 1–140. Revisor: `root`. Blob `7d60b38ab5fcf86d2524d6f0af00cb3fb9b7ab1d`; SHA-256 `f413520f416f1b78809adc7cae01fa86f46031888913c8de059d156fd622042c`.

**Adjudicação.** Renderiza SalesViewTab com resumo CRM mockado e consulta de compras simulada; testa vazio, dados, proposta aberta e vocabulário. Pela UI cria compra e exige created_by/profileId, contact_id, título e invalidação da chave CRM.

A prova de insert atravessa componente real, mas termina no stub e não testa RLS/erro/persistência. A consulta de compras e o resumo são fixtures independentes, sem assertiva de consistência entre valor total500 e os dois valores100 fornecidos.

Revisão peer preservada em `peer-evidence/inbox-peer-test-review-extra.json`, SHA-256 `9075d8d9d81e215972caeb4b6b5729c0b8c643b5e70b1c77d10eeb8aaf034658`. As observações específicas de assertions, mocks e limites acima são do revisor indicado; não foram contadas como segunda leitura do Inbox.

**Limite de execução:** Leitura das assertions, mocks e contrato. Não houve execução de suíte, homologação de UI, SQL ou provedor.

## 088 — src/components/inbox/tabs/__tests__/SectionCard.test.tsx

Leitura integral 1–63. Revisor: `root`. Blob `c0ecd2e77881c9cd9f8b3e6e1d597690afe52bff`; SHA-256 `f3741b1ca715bbe0c6a58b1c01b37860b175f640cf5bec970acee6c0c1dd5d60`.

**Adjudicação.** Renderiza SectionCard real com título, count, conteúdo, tom, ações e subtítulo/headerRight; clica a ação e exige uma chamada.

Link/pill são verificados por classes e os seletores de span são globais; não prova navegação semântica, contraste ou layout. O caso default cita texto e background mas só exige background na assertiva.

Revisão peer preservada em `peer-evidence/inbox-peer-test-review-extra.json`, SHA-256 `9075d8d9d81e215972caeb4b6b5729c0b8c643b5e70b1c77d10eeb8aaf034658`. As observações específicas de assertions, mocks e limites acima são do revisor indicado; não foram contadas como segunda leitura do Inbox.

**Limite de execução:** Leitura das assertions, mocks e contrato. Não houve execução de suíte, homologação de UI, SQL ou provedor.

## 089 — src/components/inbox/tabs/__tests__/TasksTab.test.tsx

Leitura integral 1–153. Revisor: `root`. Blob `d37378644b012d24995ea8cbcf2b36874c3ef4db`; SHA-256 `1b4eee06b79006e898946446363e4a55e87d28fcf87c7358099341acafdfc8df`.

**Adjudicação.** Renderiza TasksTab real com byStatus/byDue simulados; exige contactId no hook, cinco grupos, contadores, tarefa no grupo correto, colapso/reabertura e chamadas complete/move para os itens corretos.

O hook já entrega agrupamentos prontos e a suíte não valida cálculo de status/prazo no banco. QuickAdd é apenas mostrado neste arquivo, sem submissão; o teste NotesTab complementar observa criação, mas não transforma estes casos em prova de gravação.

Revisão peer preservada em `peer-evidence/inbox-peer-test-review-extra.json`, SHA-256 `9075d8d9d81e215972caeb4b6b5729c0b8c643b5e70b1c77d10eeb8aaf034658`. As observações específicas de assertions, mocks e limites acima são do revisor indicado; não foram contadas como segunda leitura do Inbox.

**Limite de execução:** Leitura das assertions, mocks e contrato. Não houve execução de suíte, homologação de UI, SQL ou provedor.

## 090 — src/components/inbox/tabs/__tests__/fileDisplay.test.ts

Leitura integral 1–30. Revisor: `root`. Blob `d35777f8cc200b4103e56de204b77a85173c415b`; SHA-256 `3a1845386356e38ee920d33f309cc09eebbb8c44e14610726c1865a7f2346ef0`.

**Adjudicação.** Chama formatMeta/formatSize/formatFileDate reais; verifica composição, tamanho ausente sem separador duplo e B/KB/MB com valores concretos.

A data esperada vem do próprio formatFileDate para testar consistência entre formatadores, não um valor independente de data/fuso. Não há layout nem cobertura de tamanhos negativos/NaN por esses cinco casos.

Revisão peer preservada em `peer-evidence/inbox-peer-test-review-extra.json`, SHA-256 `9075d8d9d81e215972caeb4b6b5729c0b8c643b5e70b1c77d10eeb8aaf034658`. As observações específicas de assertions, mocks e limites acima são do revisor indicado; não foram contadas como segunda leitura do Inbox.

**Limite de execução:** Leitura das assertions, mocks e contrato. Não houve execução de suíte, homologação de UI, SQL ou provedor.

## 091 — src/components/inbox/tabs/__tests__/filesSort.test.ts

Leitura integral 1–81. Revisor: `root`. Blob `e1708a3e054d0846a6cc4884fa07aa2499a54de6`; SHA-256 `29003e14037bae1c3c70054bffb95c2db20d45de230591d8df7562ecf79ffdd0`.

**Adjudicação.** Chama sortMediaItems e filterMediaItems reais; verifica tamanho desconhecido no fim, desempate data/id, sentidos recente/antigo, ordem alfabética, não mutação da entrada e busca por nome/caption sem distinguir caixa.

As regras puras são observadas com ids esperados; isso não prova ordenação ou filtragem no servidor nem todas as datas inválidas. O caso não mutar usa array já em ordem alfabética, tornando esse controle menos forte do que uma entrada invertida.

Revisão peer preservada em `peer-evidence/inbox-peer-test-review-extra.json`, SHA-256 `9075d8d9d81e215972caeb4b6b5729c0b8c643b5e70b1c77d10eeb8aaf034658`. As observações específicas de assertions, mocks e limites acima são do revisor indicado; não foram contadas como segunda leitura do Inbox.

**Limite de execução:** Leitura das assertions, mocks e contrato. Não houve execução de suíte, homologação de UI, SQL ou provedor.

## 092 — src/components/mobile/__tests__/SwipeableMessage.test.tsx

Leitura integral 1–51. Revisor: `root`. Blob `dc59d548247515f3053f4f29891bda41ff490388`; SHA-256 `a5fe7d10446a06bf71297b91299868301f41e64ab9de160a5332775bb88aaba0`.

**Adjudicação.** Renderiza SwipeableMessage real em ramo desktop/mobile e com className; observa os filhos e classe de raiz.

O mock motion descarta handlers e useMotionValue sempre retorna0; nenhum gesto ou callback swipe é acionado. O modo mobile não é resetado entre o segundo e terceiro casos, e a mera presença dos filhos não distingue a existência do wrapper anunciado.

Revisão peer preservada em `peer-evidence/inbox-peer-test-review-extra.json`, SHA-256 `9075d8d9d81e215972caeb4b6b5729c0b8c643b5e70b1c77d10eeb8aaf034658`. As observações específicas de assertions, mocks e limites acima são do revisor indicado; não foram contadas como segunda leitura do Inbox.

**Limite de execução:** Leitura das assertions, mocks e contrato. Não houve execução de suíte, homologação de UI, SQL ou provedor.

## 093 — src/components/mobile/__tests__/VoiceDictationButton.test.tsx

Leitura integral 1–64. Revisor: `root`. Blob `3a91310e8b94b0c76b343aa5d0dbe2db77b13ccc`; SHA-256 `31da7f25d34b8c80f6ec2b0860762c559cbd40b03882110cc9ea8970c6572f69`.

**Adjudicação.** Renderiza VoiceDictationButton real com speech hook simulado; confere botão suportado, retorno null quando não suportado, aria-label idle e disabled.

Não clica, injeta transcrição ou percorre listening; mockToggleListening não é assertado. Tooltip/motion são substituídos e não há microfone ou Speech API real.

Revisão peer preservada em `peer-evidence/inbox-peer-test-review-extra.json`, SHA-256 `9075d8d9d81e215972caeb4b6b5729c0b8c643b5e70b1c77d10eeb8aaf034658`. As observações específicas de assertions, mocks e limites acima são do revisor indicado; não foram contadas como segunda leitura do Inbox.

**Limite de execução:** Leitura das assertions, mocks e contrato. Não houve execução de suíte, homologação de UI, SQL ou provedor.

## 094 — src/components/omnichannel/__tests__/OmnichannelInbox.test.tsx

Leitura integral 1–217. Revisor: `root`. Blob `a0cdf817e81e6acd187540fc6bd2aefa3abeabc5`; SHA-256 `feea10dcb1493144d0c6d3abc96cc654df77ebf7bcec37163d8f34c8987df140`.

**Adjudicação.** Arquivo misto: renderiza OmnichannelInbox real para títulos, seis cards, input, botão de limpar filtro e badges de conexões. Outros blocos definem CHANNEL_CONFIG local e calculam filtros, contadores, initials e arrays vazios inteiramente no próprio teste.

A busca real observa apenas valor digitado, e o filtro de canal apenas a presença de Limpar filtro, sem exigir a lista resultante. As fórmulas locais não validam a implementação; isso complementa GOV003/TC-011 sem novo ID, preservando os controles reais de renderização.

Revisão peer preservada em `peer-evidence/inbox-peer-test-review-extra.json`, SHA-256 `9075d8d9d81e215972caeb4b6b5729c0b8c643b5e70b1c77d10eeb8aaf034658`. As observações específicas de assertions, mocks e limites acima são do revisor indicado; não foram contadas como segunda leitura do Inbox.

**Limite de execução:** Leitura das assertions, mocks e contrato. Não houve execução de suíte, homologação de UI, SQL ou provedor.

## 095 — src/hooks/__tests__/useAudioPlayer.test.tsx

Leitura integral 1–126. Revisor: `root`. Blob `7f0ffd37069448bc43a0adb067af3c665949df20`; SHA-256 `269b3c0b78b67d0e0cc46da5874ea4cecb3e20fba679ef2bb128bdde65b2b355`.

**Adjudicação.** Exercita o useAudioPlayer real com assinatura de Storage simulada: não expõe URL vencida enquanto aguarda, assina locator estável, mantém erro sem voltar à credencial vencida e preserva URL externa sem fetch. Avança Date.now em51 minutos e aciona togglePlay para verificar nova assinatura, load e play.

O elemento de áudio e seu EventTarget são dublês; a prova não inclui decodificação, reprodução física ou ACL do Storage. O caso de renovação observa o hook real, sem confundir uma URL shaped public com a política real de acesso do bucket.

Revisão peer preservada em `peer-evidence/inbox-peer-test-review.json`, SHA-256 `bc09a8b506f983c2206c078accedc764891cedf63217132c1dffab0bab48a31b`. As observações específicas de assertions, mocks e limites acima são do revisor indicado; não foram contadas como segunda leitura do Inbox.

**Limite de execução:** Leitura das assertions, mocks e contrato. Não houve execução de suíte, homologação de UI, SQL ou provedor.

## 096 — src/hooks/__tests__/useContactCustomFields.test.tsx

Leitura integral 1–59. Revisor: `root`. Blob `ac7ab2769b4467f43b856900c9f0c6de4da26fe2`; SHA-256 `96afe844d17f35691039c5676480c3e9cf5c1806f79212f864b2b0a4fe51b36b`.

**Adjudicação.** Monta useContactCustomFields real com builder de banco simulado; confirma consulta à tabela, estado vazio sem id, loading inicial e existência das funções add/remove.

Não chama as mutações nem verifica os campos retornados no caso nominal; as funções mockSelect/mockUpsert/mockDelete declaradas no topo não constituem assertivas dos writes. Ausência de contactId verifica saída vazia, sem afirmar que o mockFrom não foi chamado.

Revisão peer preservada em `peer-evidence/inbox-peer-test-review.json`, SHA-256 `bc09a8b506f983c2206c078accedc764891cedf63217132c1dffab0bab48a31b`. As observações específicas de assertions, mocks e limites acima são do revisor indicado; não foram contadas como segunda leitura do Inbox.

**Limite de execução:** Leitura das assertions, mocks e contrato. Não houve execução de suíte, homologação de UI, SQL ou provedor.

## 097 — src/hooks/__tests__/useContactNotes.test.tsx

Leitura integral 1–121. Revisor: `root`. Blob `9e2bab5828f44886a659f252cab9a5449853737e`; SHA-256 `6faa94456d260f548ebb82e2ad22d364ea91f17e4f01d7390aab4e558966f205`.

**Adjudicação.** Monta useContactNotes real com usuário/perfil/notas simulados e QueryClient; confere saída definida no fetch nominal e array vazio na fixture sem notas. Inclui rejeição de consulta e usuário ausente.

Os dois últimos casos exigem apenas o fim de loading, sem mensagem de erro, ausência de consulta ou contrato de autenticação. Os builders de insert/update/delete não são acionados por testes de mutação, e notes definido não certifica conteúdo/autoria/ordenação.

Revisão peer preservada em `peer-evidence/inbox-peer-test-review.json`, SHA-256 `bc09a8b506f983c2206c078accedc764891cedf63217132c1dffab0bab48a31b`. As observações específicas de assertions, mocks e limites acima são do revisor indicado; não foram contadas como segunda leitura do Inbox.

**Limite de execução:** Leitura das assertions, mocks e contrato. Não houve execução de suíte, homologação de UI, SQL ou provedor.

## 098 — src/hooks/__tests__/useMessageStatus.test.tsx

Leitura integral 1–90. Revisor: `root`. Blob `5b084bddba9525db4681dc5cc4390d1f11b1c07f`; SHA-256 `1bef9837b9dbf2bc412e43a769bf9376ce298f647b8046ff0ff0ee2dee5b6dbb`.

**Adjudicação.** Monta useMessageStatus real com consulta e canal simulados; cobre estado vazio sem contato, existência de getMessageStatus e limpeza ao remover id.

No caso nominal statusUpdates.size>=0 aceita também o mapa vazio; não confere os quatro status da fixture ou transições realtime. Erro exige só loading=false e a limpeza não exige previamente mapa não vazio; é limite concreto da prova, não novo defeito de status confirmado.

Revisão peer preservada em `peer-evidence/inbox-peer-test-review.json`, SHA-256 `bc09a8b506f983c2206c078accedc764891cedf63217132c1dffab0bab48a31b`. As observações específicas de assertions, mocks e limites acima são do revisor indicado; não foram contadas como segunda leitura do Inbox.

**Limite de execução:** Leitura das assertions, mocks e contrato. Não houve execução de suíte, homologação de UI, SQL ou provedor.

## 099 — src/hooks/__tests__/useMessages.test.tsx

Leitura integral 1–274. Revisor: `root`. Blob `6d68ed2b12ef9f1664ba45de647b60fd1a906f42`; SHA-256 `235fc66a7ac3542bd28ab1923bea565bc3deb7e564f827ec98d74b7605e49c5d`.

**Adjudicação.** Exercita useMessages e seu serviço real sobre builders de IO: ordem cronológica, erro exposto, limpeza, troca A→B com conclusão invertida, invalidação ao desabilitar e refresh ao habilitar. Verifica que refetch não volta a loading=true e preserva cinco mensagens antigas e a primeira da página anterior ao incorporar a nova, chegando a1006 ids.

O caso isolado enabled=false só confere retorno definido, mas o caso comportamental posterior observa efetivamente a invalidação da resposta pendente. Realtime e banco são simulados; esses controles não provam RLS nem todos os consumidores, e são evidência positiva que não pode ser descartada por outras suites usarem cópias.

Revisão peer preservada em `peer-evidence/inbox-peer-test-review.json`, SHA-256 `bc09a8b506f983c2206c078accedc764891cedf63217132c1dffab0bab48a31b`. As observações específicas de assertions, mocks e limites acima são do revisor indicado; não foram contadas como segunda leitura do Inbox.

**Limite de execução:** Leitura das assertions, mocks e contrato. Não houve execução de suíte, homologação de UI, SQL ou provedor.

## 100 — src/hooks/__tests__/useQuickReplies.test.tsx

Leitura integral 1–108. Revisor: `root`. Blob `db27217d8b915466cc2d9d186cdb2d2aa03e532c`; SHA-256 `ccf37192bfedc28ab74aed0ba8f3effc997de344387d24c76bd1e7fd37397d48`.

**Adjudicação.** Monta useQuickReplies real com usuário e QueryClient; espera fim do carregamento, saída definida e array vazio na fixture vazia.

O caso sem usuário verifica apenas loading=false; não afirma ausência de consulta nem visibilidade global/privada. Builders de insert/update/delete existem no mock, mas a suíte não os chama nem valida incrementos de uso ou gravação.

Revisão peer preservada em `peer-evidence/inbox-peer-test-review.json`, SHA-256 `bc09a8b506f983c2206c078accedc764891cedf63217132c1dffab0bab48a31b`. As observações específicas de assertions, mocks e limites acima são do revisor indicado; não foram contadas como segunda leitura do Inbox.

**Limite de execução:** Leitura das assertions, mocks e contrato. Não houve execução de suíte, homologação de UI, SQL ou provedor.

## 101 — src/hooks/chat/__tests__/useContactMedia.test.tsx

Leitura integral 1–250. Revisor: `root`. Blob `ac5f4376990bb2f8284dc33d439b3c0d33d72fff`; SHA-256 `61eed33738c7b18c647514a442ea23b4bce9cf3a25dfdc74bb44fed168d091f9`.

**Adjudicação.** Exercita useContactMedia e helpers reais: pedido60+1, cursor created_at/id,201 itens em quatro páginas sem ids repetidos, filtro de apagadas, classificação/fallbacks, assinatura por bucket, erros de Storage e consulta, labels e nomes. O controle sem contato exige nenhuma consulta.

As páginas chegam de fixtures e o filtro é observado como argumento do builder, sem execução SQL/ordenação no servidor. A simulação de contagem e assinatura não prova ACL, URLs válidas ou mídia decodificável; fornece prova comportamental útil do consumidor dentro dessa fronteira.

Revisão peer preservada em `peer-evidence/inbox-peer-test-review.json`, SHA-256 `bc09a8b506f983c2206c078accedc764891cedf63217132c1dffab0bab48a31b`. As observações específicas de assertions, mocks e limites acima são do revisor indicado; não foram contadas como segunda leitura do Inbox.

**Limite de execução:** Leitura das assertions, mocks e contrato. Não houve execução de suíte, homologação de UI, SQL ou provedor.

## 102 — src/hooks/chat/__tests__/useContactMediaCounts.test.tsx

Leitura integral 1–93. Revisor: `root`. Blob `f5f76bcc214e3f0c1b12a5e74b35c51de3669b2b`; SHA-256 `e38594e63e215eee8daf7f1fcc83085efe4322c3c54004a4bf6e2b86dd192494`.

**Adjudicação.** Monta hook real e exige cinco consultas de count exact/head, cinco resultados, filtro de apagadas e áudio+ptt. Confere zero sem contato e chave de invalidação real.

Os thenables devolvem contagens prontas por argumentos; não contam linhas reais nem executam SQL. O título em paralelo é apoiado por número de chamadas e resultados, sem medição de sobreposição temporal; paridade de MIME/classificação com todos os casos da lista não é demonstrada.

Revisão peer preservada em `peer-evidence/inbox-peer-test-review.json`, SHA-256 `bc09a8b506f983c2206c078accedc764891cedf63217132c1dffab0bab48a31b`. As observações específicas de assertions, mocks e limites acima são do revisor indicado; não foram contadas como segunda leitura do Inbox.

**Limite de execução:** Leitura das assertions, mocks e contrato. Não houve execução de suíte, homologação de UI, SQL ou provedor.

## 103 — src/hooks/chat/__tests__/useMessages.media.test.tsx

Leitura integral 1–110. Revisor: `root`. Blob `67cd9cb3fbd83ca07b3639b63894ba74bf9913fe`; SHA-256 `7d6d19b13695d3225066dce7c1e3ad14894435fb9583247c690fc8e368fc076e`.

**Adjudicação.** Monta useMessages real, captura a configuração entregue ao hook realtime e injeta INSERT. Exige exatamente três invalidações com as chaves reais de galeria, badge e chips para mídia do contato atual, com negativos para sem media_url e outro contato.

ChatService e assinatura realtime são substituídos; cobre callback e política de invalidação, sem tráfego WebSocket, atualização material da lista ou outros tipos de evento. O negativo de contato impede extrapolar uma mera presença de invalidateQueries.

Revisão peer preservada em `peer-evidence/inbox-peer-test-review.json`, SHA-256 `bc09a8b506f983c2206c078accedc764891cedf63217132c1dffab0bab48a31b`. As observações específicas de assertions, mocks e limites acima são do revisor indicado; não foram contadas como segunda leitura do Inbox.

**Limite de execução:** Leitura das assertions, mocks e contrato. Não houve execução de suíte, homologação de UI, SQL ou provedor.

## 104 — src/hooks/crm/__tests__/contactsAggregates.test.ts

Leitura integral 1–26. Revisor: `root`. Blob `7a492f66cf39734a5f13c02a79c2fe8d805bb264`; SHA-256 `5064954af0d2382d556b2fd8420d3147147c03368cb85e7eac77a91040faa59c`.

**Adjudicação.** Preenche um QueryClient real e chama invalidateContactsAggregates real; verifica invalidação de ambos filtros KPI, contadores e duas buscas.

Mantém como controle negativo a query de última mensagem não invalidada. São estados reais do cache em memória, sem executar fetch, mutação do contato ou consistência eventual do servidor.

Revisão peer preservada em `peer-evidence/inbox-peer-test-review.json`, SHA-256 `bc09a8b506f983c2206c078accedc764891cedf63217132c1dffab0bab48a31b`. As observações específicas de assertions, mocks e limites acima são do revisor indicado; não foram contadas como segunda leitura do Inbox.

**Limite de execução:** Leitura das assertions, mocks e contrato. Não houve execução de suíte, homologação de UI, SQL ou provedor.

## 105 — src/hooks/crm/__tests__/contactsAggregatesRefetchOnMount.test.tsx

Leitura integral 1–89. Revisor: `root`. Blob `a6408c10d265ae694488ba533c81d72f32af8f07`; SHA-256 `854cc472c9cc35548a7bbca6f418d7a04f41d8b1bcb32782dcec4158d71d03b5`.

**Adjudicação.** Monta os hooks reais de KPI e busca com staleTime de cinco minutos e refetchOnMount global false; desmonta/remonta no mesmo QueryClient e exige segunda consulta para KPI, tipos e lista.

A fronteira de dados é simulada e os resultados são vazios; o teste prova política de revalidação na remontagem, não novos números corretos ou atualização sem desmontar. O builder permissivo é suficiente para observar chamadas, sem substituir um teste de consulta SQL.

Revisão peer preservada em `peer-evidence/inbox-peer-test-review.json`, SHA-256 `bc09a8b506f983c2206c078accedc764891cedf63217132c1dffab0bab48a31b`. As observações específicas de assertions, mocks e limites acima são do revisor indicado; não foram contadas como segunda leitura do Inbox.

**Limite de execução:** Leitura das assertions, mocks e contrato. Não houve execução de suíte, homologação de UI, SQL ou provedor.

## 106 — src/hooks/crm/__tests__/useAdvancedContactSearch.filters.test.ts

Leitura integral 1–15. Revisor: `root`. Blob `9b3ca926f1009c9aa556d64512c5a6dab515b817`; SHA-256 `b074b55b7eb36c50aa44b0f9b0b02595785c3a7d691587e361c1d57f37803cb6`.

**Adjudicação.** Importa normalizeSearchFilterValue real e confere que false/zero sobrevivem, vazio vira undefined e texto ativo permanece.

É um contrato puro com cinco entradas, sem montar a tela ou efetuar pesquisa no servidor; não testa o restante do hook pelo simples fato de importar dele.

Revisão peer preservada em `peer-evidence/inbox-peer-test-review.json`, SHA-256 `bc09a8b506f983c2206c078accedc764891cedf63217132c1dffab0bab48a31b`. As observações específicas de assertions, mocks e limites acima são do revisor indicado; não foram contadas como segunda leitura do Inbox.

**Limite de execução:** Leitura das assertions, mocks e contrato. Não houve execução de suíte, homologação de UI, SQL ou provedor.

## 107 — src/hooks/crm/__tests__/useContactCrm360.test.ts

Leitura integral 1–89. Revisor: `root`. Blob `485165fc617afbef1d88e56ea613d41ba0d424de`; SHA-256 `098eade06d9c8557447ec5535768998ca0544ca4f349369f758ac59f49db7bbd`.

**Adjudicação.** Importa aggregateCrm360 real e fixa NOW; confere vazio honesto, estados de compra elegíveis, delta com duas janelas, deals abertos/propostas/ganhos, etapa recente, união de interações e interesses deduplicados limitados a três.

O caso de interações anuncia limite quatro mas fornece apenas três elegíveis; não prova truncamento acima do limite. Datas a um/oito meses usam múltiplos de30 dias distantes das bordas, e não certificam a fronteira de seis meses, query ou ACL.

Revisão peer preservada em `peer-evidence/inbox-peer-test-review.json`, SHA-256 `bc09a8b506f983c2206c078accedc764891cedf63217132c1dffab0bab48a31b`. As observações específicas de assertions, mocks e limites acima são do revisor indicado; não foram contadas como segunda leitura do Inbox.

**Limite de execução:** Leitura das assertions, mocks e contrato. Não houve execução de suíte, homologação de UI, SQL ou provedor.

## 108 — src/hooks/crm/__tests__/useContactEnrichedData.test.tsx

Leitura integral 1–168. Revisor: `root`. Blob `e7a7aff78e654c3561eb68ccafb0c15e27d8bfa6`; SHA-256 `f93b4b240fc56bd7dfe8d241efe6ba65e2556d26eab5137d3cfbd614a5142ea8`.

**Adjudicação.** Monta hook real e injeta UPDATE no callback do canal compartilhado simulado, alterando a fixture consultada; observa nickname atualizado. Confere erro transitório sem success:null e troca de contato com nova company; limpa log.error e restaura o mock de falha em finally.

O último caso verifica resultado da nova consulta, sem afirmar via callback que somente a assinatura do novo id foi mantida. A máquina realtime e banco têm fronteiras simuladas; a prova positiva de atualização não certifica ACL ou transporte WebSocket.

Revisão peer preservada em `peer-evidence/inbox-peer-test-review.json`, SHA-256 `bc09a8b506f983c2206c078accedc764891cedf63217132c1dffab0bab48a31b`. As observações específicas de assertions, mocks e limites acima são do revisor indicado; não foram contadas como segunda leitura do Inbox.

**Limite de execução:** Leitura das assertions, mocks e contrato. Não houve execução de suíte, homologação de UI, SQL ou provedor.

## 109 — src/hooks/crm/__tests__/useContactSidebar.test.tsx

Leitura integral 1–76. Revisor: `root`. Blob `69f852a1cb369d3d3bceef1ca467970fbfebd283`; SHA-256 `b1403ae8c76d2ce67f3a99392b5085d70615377a1c2582c154eb4722565e4363`.

**Adjudicação.** Monta useContactSidebar real com serviço/gate simulados: disabled sem chamada, loading pendente, found:false→not_found, rejeição→error, found:true→ok e dados, id ausente sem loader infinito.

O teste not_found não injeta explicitamente null embora o título mencione ambos; o fallback padrão é null, mas os casos relevantes o substituem. Retry é aguardado até error, sem afirmar contagem exata ou funcionamento do CRM externo.

Revisão peer preservada em `peer-evidence/inbox-peer-test-review.json`, SHA-256 `bc09a8b506f983c2206c078accedc764891cedf63217132c1dffab0bab48a31b`. As observações específicas de assertions, mocks e limites acima são do revisor indicado; não foram contadas como segunda leitura do Inbox.

**Limite de execução:** Leitura das assertions, mocks e contrato. Não houve execução de suíte, homologação de UI, SQL ou provedor.

## 110 — src/hooks/crm/__tests__/useContactsKpi.pagination.test.ts

Leitura integral 1–62. Revisor: `root`. Blob `612d6ba061a716710ba64693ae38aae02fb14706`; SHA-256 `536218a74426b60fdb1ce5ac6b44bb46df6056d7c0a515a767f415b8feedd39d`.

**Adjudicação.** Chama fetchKpiRows real com range que gera2498 linhas e registra intervalos; confere ids lógicos distintos, três páginas e ordens com coluna id. Cobre também múltiplo exato do tamanho da página com consulta extra vazia.

O servidor é um gerador de fixtures, sem filtros efetivos ou snapshot consistente sob inserts concorrentes. orders.every aceita array vazio e sozinho não exige order chamado; ranges e cardinalidade são assertivas concretas, e o arquivo complementar verifica soft-delete.

Revisão peer preservada em `peer-evidence/inbox-peer-test-review.json`, SHA-256 `bc09a8b506f983c2206c078accedc764891cedf63217132c1dffab0bab48a31b`. As observações específicas de assertions, mocks e limites acima são do revisor indicado; não foram contadas como segunda leitura do Inbox.

**Limite de execução:** Leitura das assertions, mocks e contrato. Não houve execução de suíte, homologação de UI, SQL ou provedor.

## 111 — src/hooks/crm/__tests__/useContactsKpi.query.test.tsx

Leitura integral 1–56. Revisor: `root`. Blob `8a0e6cf6472c0b233d788650fbd9d001c99f0255`; SHA-256 `47af88974bd4a50c0ce4cb9f0b70ee9019fcfac999f06246f126df8d6f0b88c2`.

**Adjudicação.** Chama fetchKpiRows real e registra .is; com includeLegacy false e true exige chamada e primeiro par deleted_at/null. O próprio comentário identifica a lacuna do mock no teste de paginação anterior.

As duas fixtures retornam página vazia; o título cada página não observa múltiplas páginas. Protege o filtro na primeira consulta dos dois modos, sem provar o resultado SQL ou todas as iterações.

Revisão peer preservada em `peer-evidence/inbox-peer-test-review.json`, SHA-256 `bc09a8b506f983c2206c078accedc764891cedf63217132c1dffab0bab48a31b`. As observações específicas de assertions, mocks e limites acima são do revisor indicado; não foram contadas como segunda leitura do Inbox.

**Limite de execução:** Leitura das assertions, mocks e contrato. Não houve execução de suíte, homologação de UI, SQL ou provedor.

## 112 — src/hooks/crm/__tests__/useContactsKpi.test.ts

Leitura integral 1–204. Revisor: `root`. Blob `0799ae0fc8f532e3ff039309651add57d4c6828c`; SHA-256 `f3273bf85a53dd1aa8145c25a932732127734ac27c533e992069c680e1fc98af`.

**Adjudicação.** Exercita aggregateKpi real com relógio fixado e fixtures independentes: janelas30/60, mínimo49/50, distintos com trim/case, fornecedores, sete buckets, cumulativos12, deltas totais e entradas exatamente no dia30. Verifica valores concretos como120%,50% e10% e ausência de percentual inventado em base toda nova.

Os dados são arrays completos e a função é pura; não demonstra a consulta, identidade de empresa além da normalização definida ou comportamento de datas futuras/inválidas. Casos de monotonicidade/tipo convivem com valores concretos, sem serem tratados como cópias locais.

Revisão peer preservada em `peer-evidence/inbox-peer-test-review.json`, SHA-256 `bc09a8b506f983c2206c078accedc764891cedf63217132c1dffab0bab48a31b`. As observações específicas de assertions, mocks e limites acima são do revisor indicado; não foram contadas como segunda leitura do Inbox.

**Limite de execução:** Leitura das assertions, mocks e contrato. Não houve execução de suíte, homologação de UI, SQL ou provedor.

## 113 — src/hooks/crm/__tests__/useEmailContactContext.test.tsx

Leitura integral 1–75. Revisor: `root`. Blob `dcfafb31b9f8e0c58730f6139cbaf76b7943c23b`; SHA-256 `2a41b0f2e11be5a7bbdc1acdba244563aaa8c6e6b6e50c9e0ddbf9645c22c950`.

**Adjudicação.** Monta hook real com identidade de usuário e CRM simulados; exige consulta com conta/thread/contato e escolha externa, disabled sem chamada, mapeamento de negação e payload exato da mutation linkCompany.

O título da mutation afirma invalidar contexto, mas o caso só confere chamada de vínculo e não observa invalidação/refetch. A rejeição por texto controlado não executa autorização da Edge ou relacionamento no banco.

Revisão peer preservada em `peer-evidence/inbox-peer-test-review.json`, SHA-256 `bc09a8b506f983c2206c078accedc764891cedf63217132c1dffab0bab48a31b`. As observações específicas de assertions, mocks e limites acima são do revisor indicado; não foram contadas como segunda leitura do Inbox.

**Limite de execução:** Leitura das assertions, mocks e contrato. Não houve execução de suíte, homologação de UI, SQL ou provedor.

## 114 — src/hooks/inbox/__tests__/useInboxFilters.dia-local.test.tsx

Leitura integral 1–135. Revisor: `root`. Blob `dc414919ebfb2aed5f3b91a4700b3eedbf29cfe9`; SHA-256 `1a5ae73be84b762f1aa89cf0fcc411d4ee28ef265ee323a4d862dfe888fe1d79`.

**Adjudicação.** Monta useInboxFilters real com MemoryRouter, helpers de dia reais e tempo fixado; observa round-trip dos filtros e exclusão da conversa no dia seguinte, preserva intervalo e limpa datas. Inclui controle sem data com ambos contatos.

O timezone usado é o do processo que executaria a suíte; o arquivo não configura uma matriz de fusos. window.location.search não representa a localização interna de MemoryRouter, portanto essa assertiva isolada é fraca, mas os valores do hook e a lista filtrada são evidência comportamental real.

Revisão peer preservada em `peer-evidence/inbox-peer-test-review.json`, SHA-256 `bc09a8b506f983c2206c078accedc764891cedf63217132c1dffab0bab48a31b`. As observações específicas de assertions, mocks e limites acima são do revisor indicado; não foram contadas como segunda leitura do Inbox.

**Limite de execução:** Leitura das assertions, mocks e contrato. Não houve execução de suíte, homologação de UI, SQL ou provedor.

## 115 — src/hooks/inbox/__tests__/useObjectionDetector.ia048.test.tsx

Leitura integral 1–103. Revisor: `root`. Blob `21955c0ed147c5aaeb006931062c683120b4a4e3`; SHA-256 `bb4d89531ad71244eebff42ee3ffb29f3630d2ce8b0e0d253f257c6251da8697`.

**Adjudicação.** Monta useObjectionDetector real e usa promises controladas para analyze/rewrite; exige resultado no contato atual e descarte após A→B, reset de loading/analyzed e ausência de toast de sucesso da reescrita antiga.

A Edge é mockada e não há execução de modelo; a prova cobre o consumidor e guardas de resultado superado, sem certificar precisão da objeção, persistência ou abort do trabalho remoto.

Revisão peer preservada em `peer-evidence/inbox-peer-test-review.json`, SHA-256 `bc09a8b506f983c2206c078accedc764891cedf63217132c1dffab0bab48a31b`. As observações específicas de assertions, mocks e limites acima são do revisor indicado; não foram contadas como segunda leitura do Inbox.

**Limite de execução:** Leitura das assertions, mocks e contrato. Não houve execução de suíte, homologação de UI, SQL ou provedor.

## 116 — src/hooks/inbox/useInboxUIState.test.ts

Leitura integral 1–35. Revisor: `root`. Blob `6e9d94feed953f3fa32f01d765a905c2ceeb6c95`; SHA-256 `f295780b34d84d49df09f5fc964fd4cb1e294ae6f6baf48a413167d0bb47a28f`.

**Adjudicação.** Monta useInboxUIState real com innerWidth390/1280; exige detalhes inicialmente fechados/abertos e toggle explícito no celular. Restaura largura após cada caso.

São dois valores de viewport e estado do hook, sem layout, breakpoint exato, evento resize ou painel visual; não transforma todo comportamento responsivo em homologado.

Revisão peer preservada em `peer-evidence/inbox-peer-test-review.json`, SHA-256 `bc09a8b506f983c2206c078accedc764891cedf63217132c1dffab0bab48a31b`. As observações específicas de assertions, mocks e limites acima são do revisor indicado; não foram contadas como segunda leitura do Inbox.

**Limite de execução:** Leitura das assertions, mocks e contrato. Não houve execução de suíte, homologação de UI, SQL ou provedor.

## 117 — src/hooks/integrations/__tests__/useCatalogContactSearch.test.ts

Leitura integral 1–164. Revisor: `root`. Blob `dd364b82e23ca11d79ad0684c21ea4884fccd7dc`; SHA-256 `1e42b4e22c924d947276ea8c49955d9fd640f758c9e56b4a8a6f5dabfdbd862c`.

**Adjudicação.** Importa os helpers reais de busca e registro; confere payload completo snake_case, opcionais null, zeros preservados, três status e erro de insert logado sem rejeição. Cobre mínimo dois caracteres, normalização de dígitos e escape de vírgula/aspas na construção do filtro.

O caso de telefone usa substring includes local como explicação e também observa filtro real, sem executar PostgREST. O contrato de erro absorvido fica explícito; não prova durabilidade do log ou que uma busca mascarada encontra todo formato possível.

Revisão peer preservada em `peer-evidence/inbox-peer-test-review.json`, SHA-256 `bc09a8b506f983c2206c078accedc764891cedf63217132c1dffab0bab48a31b`. As observações específicas de assertions, mocks e limites acima são do revisor indicado; não foram contadas como segunda leitura do Inbox.

**Limite de execução:** Leitura das assertions, mocks e contrato. Não houve execução de suíte, homologação de UI, SQL ou provedor.

## 118 — src/hooks/team-chat/__tests__/useTeamMessages.test.tsx

Leitura integral 1–65. Revisor: `root`. Blob `29239f417bfd7a348aa64233cd7d3d1ea6e394ac`; SHA-256 `9ccc99d2dffc45ce4ad1d518121fa82f67e0630a8ec4b59074f96735e0385a3d`.

**Adjudicação.** Monta useTeamMessages real com useQuery simulado fornecendo duas mensagens; exige apenas um recibo para remetente alheio, perfil/status/conversation_id exatos e onConflict composto.

Não executa a consulta, RLS ou NOT NULL no Postgres; protege o payload do hook para a fixture atual. É evidência comportamental de Team Chat e deve coexistir com a crítica TC-011 aos outros testes desconectados.

Revisão peer preservada em `peer-evidence/inbox-peer-test-review.json`, SHA-256 `bc09a8b506f983c2206c078accedc764891cedf63217132c1dffab0bab48a31b`. As observações específicas de assertions, mocks e limites acima são do revisor indicado; não foram contadas como segunda leitura do Inbox.

**Limite de execução:** Leitura das assertions, mocks e contrato. Não houve execução de suíte, homologação de UI, SQL ou provedor.

## 119 — src/lib/__tests__/emailContactIdentity.test.ts

Leitura integral 1–37. Revisor: `root`. Blob `9441ca71e71b6346d3d41e2023fb8f3ff0dec940`; SHA-256 `5f5e6a9f8ac47b877bc9051f859c99d9cb221679a10b67c9bc9316ead34b15f2`.

**Adjudicação.** Chama resolveEmailConversationPerson real para thread cuja última mensagem é nossa, thread só de saída e resposta posterior de outro endereço; preserva participante externo original e destinatário principal sem usar CC.

O primeiro título fala latest inbound, mas só fornece uma mensagem inbound; o terceiro fixa a escolha do participante original. Não cobre uma thread com múltiplos participantes originais ambíguos, conta inexistente ou transporte Gmail.

Revisão peer preservada em `peer-evidence/inbox-peer-test-review.json`, SHA-256 `bc09a8b506f983c2206c078accedc764891cedf63217132c1dffab0bab48a31b`. As observações específicas de assertions, mocks e limites acima são do revisor indicado; não foram contadas como segunda leitura do Inbox.

**Limite de execução:** Leitura das assertions, mocks e contrato. Não houve execução de suíte, homologação de UI, SQL ou provedor.

## 120 — src/services/__tests__/contact.service.enriched.test.ts

Leitura integral 1–51. Revisor: `root`. Blob `43d0c4ddd3bb2ecd16a964b4cc99e23d14a6f921`; SHA-256 `6afc032c39cf3bee100721b061abf1e686529a2b6fea9413de79bc9fe92a0333`.

**Adjudicação.** Chama ContactService.fetchEnrichedData real e captura a string select para exigir seis colunas de endereço, cinco campos já existentes e latitude/longitude.

As verificações usam toContain, de modo que address pode estar contido em address_number; não equivalem a análise de identificadores. Não retornam dados de endereço nem montam/salvam o editor, e a lista de chamadas não é resetada entre os três casos, embora cada um chame o serviço e leia a última.

Revisão peer preservada em `peer-evidence/inbox-peer-test-review.json`, SHA-256 `bc09a8b506f983c2206c078accedc764891cedf63217132c1dffab0bab48a31b`. As observações específicas de assertions, mocks e limites acima são do revisor indicado; não foram contadas como segunda leitura do Inbox.

**Limite de execução:** Leitura das assertions, mocks e contrato. Não houve execução de suíte, homologação de UI, SQL ou provedor.

## 121 — src/services/__tests__/contact.service.legacy.test.ts

Leitura integral 1–32. Revisor: `root`. Blob `540f66bbd86dc2b72fd2f1e1bc389abae482f235`; SHA-256 `d69882b18fef4ae2f975756f928d7362fa8adc117ac2585083d23acef052130d`.

**Adjudicação.** Chama os métodos reais de ContactService e verifica os argumentos de search_contacts e contacts_count_by_type com legado desligado/ligado, incluindo objeto vazio no contador padrão.

O primeiro matcher impede um valor não nulo reconhecido por expect.anything, mas não é teste estrito de ausência de propriedade undefined/null. A RPC devolve fixture vazia e seus defaults e permissões são avaliados separadamente no banco.

Revisão peer preservada em `peer-evidence/inbox-peer-test-review.json`, SHA-256 `bc09a8b506f983c2206c078accedc764891cedf63217132c1dffab0bab48a31b`. As observações específicas de assertions, mocks e limites acima são do revisor indicado; não foram contadas como segunda leitura do Inbox.

**Limite de execução:** Leitura das assertions, mocks e contrato. Não houve execução de suíte, homologação de UI, SQL ou provedor.

## 122 — src/services/__tests__/outbound-message.service.test.ts

Leitura integral 1–98. Revisor: `root`. Blob `fe47c2a45573346de738392d2a91ee1b75212958`; SHA-256 `edb31a6f6efb5c8b7e475b88432957d270a66a04946c8f538eb1a95bdcd4d19d`.

**Adjudicação.** Chama os serviços reais de envio simples/rico com RPC e Edge simuladas; exige payload de enqueue, resultado do gateway, ausência de dispatch em erro de enqueue e corpo de enquete. Inclui uma falha ambígua seguida de retry com ids observados.

crypto.randomUUID está fixo no mesmo literal em todas as chamadas; por isso os ids iguais no teste de reuso não distinguem preservação da ação de nova geração a cada tentativa. Não executa SQL, entrega ou durabilidade, e a prova de idempotência precisa de gerador sequencial/controle negativo para detectar perda da identidade.

Revisão peer preservada em `peer-evidence/inbox-peer-test-review.json`, SHA-256 `bc09a8b506f983c2206c078accedc764891cedf63217132c1dffab0bab48a31b`. As observações específicas de assertions, mocks e limites acima são do revisor indicado; não foram contadas como segunda leitura do Inbox.

**Limite de execução:** Leitura das assertions, mocks e contrato. Não houve execução de suíte, homologação de UI, SQL ou provedor.

## 123 — src/types/__tests__/emailContactContext.test.ts

Leitura integral 1–51. Revisor: `root`. Blob `81e77f87ebf4ef45529079014703daa0cdc21c68`; SHA-256 `776562ff41e5bc582855fe6937e99a1432d3a499e7aeaaad980a4f620fe3e89d`.

**Adjudicação.** Chama isEmailContactContext real com estados e objetos positivos/negativos: not_linked, company incompleta, about objeto, rede social fora do contrato, candidatos ambíguos tipados e estado não modelado.

O título bounded do estado ambíguo fornece apenas dois candidatos; não observa o limite superior nem candidatos malformados. O teste valida shape, sem renderização, resolução de identidade ou autorização do contexto.

Revisão peer preservada em `peer-evidence/inbox-peer-test-review.json`, SHA-256 `bc09a8b506f983c2206c078accedc764891cedf63217132c1dffab0bab48a31b`. As observações específicas de assertions, mocks e limites acima são do revisor indicado; não foram contadas como segunda leitura do Inbox.

**Limite de execução:** Leitura das assertions, mocks e contrato. Não houve execução de suíte, homologação de UI, SQL ou provedor.

## 124 — tests/contracts/ai-conversation-messages.contract.test.ts

Leitura integral 1–113. Revisor: `root`. Blob `a35e19b145d2077cb4d5bd62ec80d779dd06e7ef`; SHA-256 `95d9961310fbbfe4cdf32577adfd44819b7b34128d102209d0eb54f9a6e1ef74`.

**Adjudicação.** Exercita schemas e medidor reais; protege id/type/mediaUrl/created_at/periodDays, legado message_type, período opcional, erro agregado150 mil contra aceitação100 mil caracteres, limite individual5001 e métricas3 mensagens/5 caracteres.

São parse e contagem sobre dados sintéticos, sem consulta de conversa, tokens do provedor ou execução da análise. O título1..365 testa30,0,999 e não cada borda; os tetos textuais são guardas do envelope, sem afirmar orçamento real em tokens.

Revisão peer preservada em `peer-evidence/inbox-peer-test-review.json`, SHA-256 `bc09a8b506f983c2206c078accedc764891cedf63217132c1dffab0bab48a31b`. As observações específicas de assertions, mocks e limites acima são do revisor indicado; não foram contadas como segunda leitura do Inbox.

**Limite de execução:** Leitura das assertions, mocks e contrato. Não houve execução de suíte, homologação de UI, SQL ou provedor.

## 125 — tests/contracts/axe-inbox.contract.test.ts

Leitura integral 1–51. Revisor: `root`. Blob `01bd7a583b8d997fc1c46a10be4b43b9e520fb96`; SHA-256 `ba43bbf87daeab21c411318dac92d1380b724bd8cdca7a78b7a10c35e03862ac`.

**Adjudicação.** Lê quatro fontes reais para preservar nav sem role inadequado, classe de avatar e nomes dos botões do modal/aviso; as assertivas são regex de contrato.

Não executa axe ou navegador. O cabeçalho cita medições históricas e exceções de skin explicitamente decididas; essas razões não foram reapresentadas como medição atual nem as exceções autorizadas como defeito novo.

Revisão peer preservada em `peer-evidence/inbox-peer-test-review.json`, SHA-256 `bc09a8b506f983c2206c078accedc764891cedf63217132c1dffab0bab48a31b`. As observações específicas de assertions, mocks e limites acima são do revisor indicado; não foram contadas como segunda leitura do Inbox.

**Limite de execução:** Leitura das assertions, mocks e contrato. Não houve execução de suíte, homologação de UI, SQL ou provedor.
