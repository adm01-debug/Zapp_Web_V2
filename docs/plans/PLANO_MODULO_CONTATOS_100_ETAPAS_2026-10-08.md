# Plano — Módulo Contatos, 100 etapas (08/10/2026)

> **Status:** proposta para aprovação. Nenhum cartão foi criado. Os cartões nascem pelo motor de gatilhos, em ondas, depois da sua aprovação.

**Onde fica:** `~/projetos/Zapp_Web_V2/docs/plans/PLANO_MODULO_CONTATOS_100_ETAPAS_2026-10-08.md` · **Base:** inventário de melhorias (57 itens de Contatos, 20 em aberto) + varredura de código (72 arquivos) + auditoria ao vivo na pré-visualização (desktop e celular).

## 1. Por que este plano e o que ele não repete

O módulo já passou por grandes planos executados (Contatos 100 etapas e finalização, redesign Navy 100, sidebar em 3 seções 100, melhorias 50, e-mail na sidebar 50). Aqui entra **o que ainda não foi feito** e o que a auditoria de hoje encontrou. **Fora deste plano** (têm plano próprio): Journey/Histórico (J/K), e-mail no contato (L/U), Arquivos (F/R/A) e Sidebar do contato em 3 seções. A importação por CSV continua **removida** e, por decisão do dono (08/10), **o Zapp não importa, não exporta e não faz edição em massa**: isso é do Singu.

## 2. O que a auditoria de hoje encontrou

**Ao vivo (pré-visualização, 9 contatos):**

- Celular: a toolbar empilha em 5 linhas e **a primeira linha de contatos só aparece depois de 700 px**; KPIs 2×2 ocupam meia tela.
- A **barra de seleção/ações fica coberta** pelo aviso do 2FA e pelo toast do SIP; o botão + e o microfone flutuantes **cobrem a timeline** do painel de detalhe e o cabeçalho do painel fica cortado pelo banner.
- Telefone aparece **cru** (5511999990011) em todas as visões; avatar de "[E2E] Contato…" vira "[C".
- Detalhe enxuto: só telefone e data de criação; sem e-mail, empresa, cargo, endereço, responsável, tags ou campos personalizados; sem edição inline.
- Filtros avançados só têm Empresa, Cargo, Etiqueta e Período (faltam responsável, fila, status, último contato, e-mail/endereço, cidade/UF, score).
- Formulário: rótulos desalinhados; sem tags, responsável, nascimento, documento; telefone sem máscara; um alternador sem nome acessível ("Mostrar legados").
- KPIs "Empresas" e "Fornecedores" zerados sem definição; rótulo de ordenação truncado ("Nome (A-…").

**No código (72 arquivos, sem TODO/any):**

- Regras do sistema violadas: selo "💬 WhatsApp" no `CRMContactCard`; `navigator.clipboard` em `ContactDialogs` (copiar protocolo); cor `amber-600` fora dos tokens no `ContactForm`.
- **17 unidades sem nenhum teste**: mesclar, comparar, serviço de ações em massa, agrupamento, estado vazio, skeleton, card CRM, filtros CRM, `useContactAssignment`, `useContactPurchases` e outras.
- Specs E2E que pulam por falta de dados, baselines visuais ausentes e `mapboxLoader.ts` com 0% de cobertura.
- Banco: `search_contacts` ainda chama `can_edit_contact` por linha e usa `COUNT(*) OVER()`; faltam prova do conjunto `pg_trgm` e flag/teto de custo do mapa.

## 3. Regras permanentes que valem em todas as etapas

O Zapp Web **não exporta, não importa e não permite edição em massa** (a edição em massa de contatos é feita só pelo Singu) · nenhuma informação pode sair do sistema (sem exportar, baixar, copiar, imprimir ou compartilhar novos) · só as cores que o sistema já tem · efeitos sutis com `motion-safe` e reduzir movimento · **sem selo de canal/origem** · sem dependência nova · agentes nunca acessam produção · push/PR/deploy e **toda migration em produção só com a sua autorização** (uma por vez, hash conferido).

## 4. Resumo

| Fase | Etapas | Quantas |
|---|---|--:|
| A · Base, dados e regras | MC-001 a MC-010 | 10 |
| B · Regras do sistema e acessibilidade | MC-011 a MC-026 | 16 |
| C · Toolbar, busca e filtros | MC-027 a MC-042 | 16 |
| D · Cards, lista, tabela e KPIs | MC-043 a MC-054 | 12 |
| E · Painel de detalhe do contato | MC-055 a MC-068 | 14 |
| F · Formulário e qualidade dos dados | MC-069 a MC-078 | 10 |
| G · Duplicados, mesclar, comparar e excluir | MC-079 a MC-086 | 8 |
| H · Tags, segmentos e atribuição | MC-087 a MC-092 | 6 |
| I · Desempenho e banco | MC-093 a MC-097 | 5 |
| J · Testes, documentação e entrega | MC-098 a MC-100 | 3 |

Por perfil: iris 46, hugo 28, workersql 10, workertestes 5, workerauth 3, complexo 3, vera 2, designer 2, coordenador 1. Tamanho: P 13, M 64, G 23. Etapas com banco (trilha separada, só local até você autorizar): 15.

## 5. As 100 etapas

Legenda: **Dep** = etapas que precisam estar integradas antes · **Tam** P (≤1 h de agente), M, G · todas as etapas de tela passam pelo roteiro visual MC-009 e ficam atrás da flag MC-010.

### Fase A · Base, dados e regras

| ID | Etapa | Critério de aceite | Perfil | Dep | Tam | Tipo |
|---|---|---|---|---|---|---|
| **MC-001** | Baseline medido do módulo: roteiro Playwright reprodutível (tempo de carga, nº de requisições, peso do chunk, erros de console, achados de acessibilidade) e relatório em docs/audits. | Relatório com números de antes; roteiro roda com 1 comando. | workertestes | — | P | teste |
| **MC-002** | Dados semente determinísticos só para banco local/CI: ≥150 contatos (7 tipos, com/sem e-mail/endereço/empresa, tags, responsáveis, legados, excluídos, duplicados propositais). | Script idempotente; recusa rodar contra produção; E2E nunca pula por falta de dados. | workersql | — | M | banco local |
| **MC-003** | Decisões do dono D1–D7 registradas em ADR curto (definição de KPI Empresas/Fornecedores, papel de "legados", contagem aproximada, fotos reais, lixeira/restaurar, escopo do CRM externo/Singu, mesclar e comparar). | Cada decisão com resposta ou padrão aprovado, em docs/adr. | vera | — | P | decisão |
| **MC-004** | Matriz de permissões do módulo (ver/criar/editar/excluir/mesclar/atribuir) por papel, com teste de tabela contra contactPermissions.ts e as policies. Exportar/baixar permanece proibido. | Tabela documentada; teste falha se uma permissão divergir. | workerauth | 003 | M | teste + doc |
| **MC-005** | Mapa de fronteiras com os planos vivos (Journey J/K, E-mail L/U, Arquivos F/R/A, Sidebar 3 seções) e matriz de arquivos tocados por cada um, para não gerar conflito de merge. | Doc com "o que é de quem"; nenhum arquivo com dois donos sem ordem definida. | coordenador | — | P | doc |
| **MC-006** | Contrato de regras do sistema para o módulo: teste que falha se surgir exportar/importar/baixar/copiar/imprimir, ação de edição em massa, selo de canal/origem, cor fora dos tokens ou texto <10px sem exceção, em src/components/contacts e hooks/crm. | Guarda no CI; hoje acusa 3 violações (MC-011/012/013). | workertestes | — | M | teste |
| **MC-007** | Orçamento de desempenho do módulo (peso do chunk de Contatos, re-renders, p95 de busca em 5 mil contatos) em scripts/ci, sem dependência nova. | Orçamento medido e travado no CI. | hugo | 001 | M | ci |
| **MC-008** | Telemetria mínima de uso do módulo na infra de auditoria/log já existente (visão usada, filtros mais usados, busca sem resultado), sem enviar nada para fora do sistema. | Eventos gravados; painel interno de leitura. | hugo | 003 | M | front |
| **MC-009** | Roteiro visual reutilizável (celular 390, tablet 768, desktop 1672; claro/escuro; reduzir movimento) para toda etapa de tela do plano. | scripts/qa/contatos-visual.cjs gera as 12 capturas padrão. | workertestes | 001 | M | teste |
| **MC-010** | Feature flag contacts.v2 por área (toolbar, cards, detalhe, formulário) usando a infraestrutura de flags existente, para liberar em partes e reverter sem deploy. | Cada onda atrás da flag; desligar volta ao comportamento atual. | hugo | — | M | front |

### Fase B · Regras do sistema e acessibilidade

| ID | Etapa | Critério de aceite | Perfil | Dep | Tam | Tipo |
|---|---|---|---|---|---|---|
| **MC-011** | Remover o selo "💬 WhatsApp" do CRMContactCard e varrer o módulo por outros selos de canal/origem (regra: sem selo de canal). | Guarda MC-006 verde; nenhum selo de canal nas visões. | iris | 006 | P | front |
| **MC-012** | Remover o botão "copiar protocolo" de ContactDialogs (regra: nada sai do sistema); o protocolo fica visível na tela. | Nenhum navigator.clipboard no módulo. | iris | 006 | P | front |
| **MC-013** | Trocar text-amber-600 do ContactForm pelo token warning e varrer cores literais do módulo. | Zero cor literal; claro e escuro conferidos. | iris | 006 | P | front |
| **MC-014** | Alternador "Mostrar legados": role=switch, aria-checked, nome claro e explicação ("contatos antigos importados sem telefone válido"). | Leitor de tela anuncia o estado; tooltip explicativo. | iris | 003 | P | front |
| **MC-015** | Dar nome acessível a todo controle de ícone (Conversar, Editar, "Mais ações de {nome}"), com teste que falha para botão sem nome. | 0 controles sem nome nas 6 visões. | iris | — | M | front |
| **MC-016** | Iniciais do avatar: ignorar colchetes, prefixos como [E2E], emojis e números; fallback "?". | "[E2E] Contato" vira "CT"; 20 nomes em teste de tabela. | hugo | — | P | front |
| **MC-017** | Telefone formatado em todo o módulo (+55 (11) 99999-9999) com função única; número cru fica no atributo para leitura falada. | Cards, lista, tabela, detalhe e formulário iguais; teste com 15 formatos. | hugo | — | M | front |
| **MC-018** | Rótulo de ordenação sem truncar ("Nome (A–Z)") e menu com nome, último contato, criado em, score e empresa. | Rótulo completo em 1672 e 390 px. | iris | — | P | front |
| **MC-019** | Alinhamento do formulário: rótulos na mesma linha-base (Nome Principal/Sobrenome etc.), ícones de ajuda focáveis, campos de tamanho consistente. | Captura antes/depois sem desalinhamento. | iris | — | P | front |
| **MC-020** | Teclado: ordem de tab lógica, grade de cards com setas (roving tabindex), Enter abre o detalhe, Esc fecha, foco volta ao card de origem. | Percurso completo só com teclado, em teste. | iris | — | G | front |
| **MC-021** | Atalhos do módulo (/ busca, N novo, F filtros, Shift+setas seleção) com ajuda "?", sem conflito com ⌘K global. | Atalhos documentados e testados. | iris | 020 | M | front |
| **MC-022** | Anúncios para leitor de tela (aria-live): "9 selecionados", "Exibindo N contatos", resultado da busca, sucesso e erro de ações. | Cada ação com mensagem falada. | iris | — | M | front |
| **MC-023** | Contraste AA e tamanho mínimo: badge do tipo ≥11 px, "Último contato" e KPIs, claro e escuro, sem mudar a paleta. | Medição de contraste ≥4,5:1 nos textos do módulo. | designer | — | M | front |
| **MC-024** | Reduzir movimento: auditar todas as animações do módulo (aba, hover do card, painel) com motion-safe e teste emulando prefers-reduced-motion. | Durações ≈0 com a preferência ligada. | iris | — | P | front |
| **MC-025** | Estados unificados (ContactEmptyState + ContactsSkeleton): 503/offline mostram aviso e "Tentar de novo"; vazio por filtro oferece "Limpar filtros"; vazio absoluto oferece "Novo contato". | 3 estados cobertos por teste e captura. | iris | — | M | front |
| **MC-026** | Foco visível consistente em cards, linhas e toolbar (anel do token ring) e teste visual de hover/focus/active. | Anel visível em todos os alvos. | designer | — | P | front |

### Fase C · Toolbar, busca e filtros

| ID | Etapa | Critério de aceite | Perfil | Dep | Tam | Tipo |
|---|---|---|---|---|---|---|
| **MC-027** | Toolbar do celular: busca + Filtros + Ordenar em uma linha, o resto numa folha inferior; o primeiro card aparece sem rolar (hoje a lista só começa depois de 700 px). | Em 390×844 o primeiro card está visível. | iris | 010 | G | front |
| **MC-028** | KPIs no celular em faixa horizontal compacta (ou recolhíveis) e abas por tipo com indicador de rolagem. | KPIs ocupam ≤120 px de altura no celular. | iris | 027 | M | front |
| **MC-029** | Barra de seleção (mesclar/comparar) com folga acima dos avisos globais (2FA, SIP, botões flutuantes): nunca coberta; no celular vira folha inferior. | Todos os botões da barra clicáveis com os avisos abertos. | iris | — | M | front |
| **MC-030** | Reserva de espaço para sobreposições globais no módulo (botão +, microfone, banners): conteúdo ganha folga; botões flutuantes não cobrem a timeline do detalhe. | Nada coberto em 3 larguras. | iris | 029 | M | front |
| **MC-031** | Filtros avançados novos: responsável, fila, status da conversa, último contato (hoje/7/30/90 dias/sem contato), com/sem e-mail, com/sem endereço, cidade/UF, score. | Cada filtro com teste de resultado. | hugo | 010 | G | front |
| **MC-032** | Filtro de tags múltiplas com E/OU e exclusão ("sem a tag X"); tags do sistema separadas das de WhatsApp (que seguem ocultas). | Combinações cobertas em teste. | hugo | 031 | M | front |
| **MC-033** | Chips de filtros ativos acima da lista, com remover individual, "Limpar tudo" e contador, anunciados ao leitor de tela. | Remover chip atualiza lista e URL. | iris | 031 | M | front |
| **MC-034** | Filtros e visão refletidos na URL (voltar/atualizar restauram), tudo dentro do sistema. | Recarregar mantém filtros e visão. | hugo | 031 | M | front |
| **MC-035** | Filtros Salvos: renomear, atualizar, excluir, padrão por usuário e (admin) deixar um filtro visível para a equipe dentro do sistema (sem link, sem exportar, sem copiar); limite e confirmação. | CRUD completo coberto em teste. | hugo | 034 | G | front |
| **MC-036** | Busca por trecho de telefone (últimos dígitos, com/sem DDI), e-mail, empresa e tag; tolerante a acento e caixa; destaque do trecho (HighlightText ganha teste). | 20 consultas de teste com resultado esperado. | hugo | — | M | front |
| **MC-037** | Sugestões de busca (ContactSearchWithSuggestions): recentes do próprio usuário (só no navegador), contatos mais próximos e navegação por teclado, sem enviar nada para fora. | Sugestões em ≤150 ms; teclado completo. | iris | 036 | M | front |
| **MC-038** | Ordenação persistente por usuário e visão; ordenar por coluna na tabela com indicador. | Ordem sobrevive a recarregar. | hugo | 018 | M | front |
| **MC-039** | Paginação/carga: páginas ou "carregar mais" com contagem honesta e virtualização da grade acima de 200 itens, sem dependência nova. | 5 mil contatos rolam sem travar (≥50 fps no roteiro). | complexo | 002 | G | front |
| **MC-040** | Visão lembrada por usuário (cards/lista/tabela/pipeline/mapa/analytics); seleção e filtros preservados ao trocar de visão. | Trocar de visão não perde seleção nem filtro. | hugo | 034 | M | front |
| **MC-041** | Tabela: escolher, ordenar e redimensionar colunas, cabeçalho fixo e densidade (confortável/compacta) com persistência. | Preferências salvas por usuário. | iris | 038 | G | front |
| **MC-042** | Menu "Mais" (Pipeline, Mapa, Analytics): rótulos e ícones consistentes e mensagem quando a visão não tem dados, com atalho para completar cadastros. | Estado vazio útil nas 3 visões. | iris | 025 | M | front |

### Fase D · Cards, lista, tabela e KPIs

| ID | Etapa | Critério de aceite | Perfil | Dep | Tam | Tipo |
|---|---|---|---|---|---|---|
| **MC-043** | Card mais útil: empresa/cargo, e-mail, responsável (mini avatar), até 2 tags + "+n", último contato relativo ("há 2 h", data no tooltip), score; densidade compacta/confortável. | Captura aprovada nas duas densidades. | iris | 010 | G | front |
| **MC-044** | Ações rápidas do card: Conversar, Ligar (liga no painel, como a C02), E-mail (link do contato, L/U), Editar; menu ⋮ com atribuir, tag, mesclar e excluir conforme permissão. | Cada ação aparece só para quem pode. | iris | 043 | G | front |
| **MC-045** | Seleção só para mesclar/comparar: até 3 contatos, aviso claro do limite; sem seleção massiva de resultados (o Zapp não faz edição em massa). | Limite de 3 respeitado; teste de seleção. | hugo | 029 | M | front |
| **MC-046** | Lista compacta e Tabela com as mesmas informações e ações do card; linha inteira clicável; estado selecionado claro. | Paridade de informação nas 3 visões. | iris | 043 | M | front |
| **MC-047** | Agrupamento (ContactGroupedList) por empresa, tipo, responsável e inicial, com recolher/expandir e teste. | Agrupar e desagrupar sem perder seleção. | iris | — | M | front |
| **MC-048** | KPIs com definição clara: Empresas = empresas distintas dos contatos; Fornecedores = tipo fornecedor; tooltip com a definição; clique aplica o filtro. | KPIs batem com a base semente (conferência por consulta). | hugo | 003 | M | front |
| **MC-049** | KPI de variação: tratar base sem histórico (hoje mostra dezenas de milhares de %): exibir "novo" ou comparar janelas válidas; sparkline com descrição textual. | Nenhum percentual absurdo; leitor de tela lê a tendência. | hugo | — | M | front |
| **MC-050** | Contagens por tipo nas abas vindas de uma única consulta agregada, com cache curto e erro tratado; abas vazias desabilitadas com dica. | 1 requisição para todas as abas. | hugo | — | M | front |
| **MC-051** | Avatar: foto real quando houver avatar_url (carregamento preguiçoso) e fallback de iniciais com cor estável por contato (decisão D4). | Sem salto de layout; fallback sempre estável. | iris | 003 | M | front |
| **MC-052** | Tipos de contato: configuração central (contactTypeConfig) com ícone/cor dos tokens existentes e ordem; teste de que todo tipo tem rótulo, ícone e cor. | Teste de contrato verde. | hugo | — | P | front |
| **MC-053** | Pipeline (Kanban): arrastar entre colunas com confirmação e desfazer, mesmas informações do card e teclado para mover. | Mover só com teclado em teste. | iris | 043 | G | front |
| **MC-054** | Mapa e Analytics: estados vazios, agrupamento de pins, custo do mapa sob controle (flag/teto, E89) e lista de "sem endereço"; Analytics com legendas acessíveis. Teto inicial fixo no código (sem banco); MC-097 passa o teto para o banco depois. | Mapa com 5 mil pins sem travar. | complexo | 003 | G | front |

### Fase E · Painel de detalhe do contato

| ID | Etapa | Critério de aceite | Perfil | Dep | Tam | Tipo |
|---|---|---|---|---|---|---|
| **MC-055** | Detalhe como rota (?contact=<id>): deep link, abrir/fechar sem recarregar e restaurar a rolagem. | Link abre o mesmo contato; voltar fecha o painel. | hugo | 010 | M | front |
| **MC-056** | Seção Informações completa: e-mails, empresa, cargo, endereço, aniversário, documento, responsável, fila, tags; campo vazio mostra "Adicionar" sem poluir. | Todos os dados do formulário aparecem no painel. | iris | 055 | G | front |
| **MC-057** | Edição inline por campo (clicar, Enter salva, Esc cancela, desfazer por 10 s) respeitando permissões. | Editar sem abrir o formulário; permissões testadas. | iris | 056 | G | front |
| **MC-058** | Responsável: trocar no painel (com motivo opcional) e histórico visível; teste do hook useContactAssignment (hoje sem teste). | Troca registrada e exibida; hook coberto. | hugo | 056 | M | front |
| **MC-059** | Telefones e e-mails múltiplos (principal + adicionais, com rótulo) — interface; as colunas/tabelas necessárias entram na trilha de banco e só sobem com autorização. | UI pronta atrás da flag; migration separada. | iris | 056 | G | front + banco |
| **MC-060** | Timeline do contato: filtro por tipo (mensagem, ligação, e-mail, nota, tarefa), agrupamento por dia, "carregar mais" e link "Ver jornada completa" (plano Journey). | Filtro e paginação testados. | iris | 005 | M | front |
| **MC-061** | Notas: fixar, editar/excluir (permissão e auditoria), menção @colega com aviso, contador e ordenação; testes de ContactNotes. | Fluxo completo coberto. | iris | 056 | M | front |
| **MC-062** | Tarefas do contato no painel: criar e ver tarefas abertas/vencidas com link para Tarefas. | Criar tarefa sem sair do painel. | iris | 056 | M | front |
| **MC-063** | Compras e produtos enviados: lista com data/valor e link ao catálogo/produto; vazio explicado; teste de useContactPurchases. | Lista e vazio cobertos. | iris | 056 | M | front |
| **MC-064** | Empresa: cartão da empresa (CompanyLogo) e "outros contatos desta empresa" (até 5) com abertura direta. | Navegação entre contatos da mesma empresa. | iris | 056 | M | front |
| **MC-065** | Score de engajamento explicado (tooltip com fatores) e testes de ContactEngagementScore; cálculo documentado. | Cálculo igual ao documentado. | hugo | — | M | front |
| **MC-066** | Painel responsivo: largura/altura corretas, cabeçalho não cortado pelo banner, foco preso e devolvido, rolagem interna, sem colidir com botões flutuantes. | Nada cortado em 390 e 1672 px. | iris | 030 | M | front |
| **MC-067** | Endereço no painel: mini mapa opcional e "Abrir no mapa" dentro do sistema (sem link externo para copiar); estado sem endereço incentiva completar. | Mapa só carrega ao abrir (custo controlado, teto fixo no código até MC-097). | iris | 003 | M | front |
| **MC-068** | Revisar o enriquecimento atual do CRM externo (leitura, 3.5b): documentar exatamente o que lê e exibe e decidir com o dono se continua, já que o Zapp não importa informações (decisão D6); sem sincronização em massa. | Escopo documentado; decisão registrada; nada novo é importado. | hugo | 003 | M | decisão + doc |

### Fase F · Formulário e qualidade dos dados

| ID | Etapa | Critério de aceite | Perfil | Dep | Tam | Tipo |
|---|---|---|---|---|---|---|
| **MC-069** | Validação e máscara de telefone (DDI, DDD, 9º dígito), normalização única e mensagem clara; testes de tabela. | Entradas inválidas bloqueadas com motivo. | hugo | 017 | M | front |
| **MC-070** | Aviso de duplicata em tempo real (telefone/e-mail/nome+empresa) com link ao contato existente e opção "mesclar depois". | E2E contact-form-email-duplicate cobre os 3 casos. | hugo | 069 | M | front |
| **MC-071** | Campos novos no formulário: tags, responsável (admin/supervisor), nascimento, documento (CPF/CNPJ com validação), observação curta e campos personalizados dinâmicos. | Campos persistem e aparecem no detalhe. | iris | 056 | G | front + banco |
| **MC-072** | Salvar com segurança: botão com estado, erro por campo, aviso de alterações não salvas ao fechar, Ctrl+Enter mantido e foco devolvido. | Perder dados sem aviso é impossível. | iris | — | M | front |
| **MC-073** | Criação rápida (botão +): nome e telefone, com "completar depois" e lembrete de cadastro incompleto. | Contato criado em ≤10 s. | iris | 069 | M | front |
| **MC-074** | Indicador de completude do cadastro (%) e filtro "cadastro incompleto" (sem e-mail, empresa ou endereço). | Percentual conferido com a base semente. | hugo | 031 | M | front |
| **MC-075** | Retirar do Zapp a edição em massa (tags, atribuir e excluir em massa): remover BulkActionsBar de edição, ContactBulkTagDialog e contact-bulk.service sem uso, e também os usos em ContactsView.tsx, as checagens de lote em contactPermissions.ts (canDeleteSelectedContacts, canChangeSelectedContactsType), os testes BulkActionsBar*/ContactBulkTagDialog e as menções em COMPLETE_SYSTEM_FEATURES.md e FUNCTIONALITIES_INVENTORY.md (conferir antes com grep, inclusive o BulkActionsBar genérico da raiz de components), e mostrar "edição em massa é feita no Singu"; ficam só ações por contato, mesclar e comparar. | Nenhuma ação de lote de edição na interface; sem código morto. | iris | 006 | M | front |
| **MC-076** | Endereço: CEP e autocompletar do Mapbox existente com erros claros; corrigir o 2º editor com endereço vazio e o onBlur/Tab (achados D–J). | Os 5 achados fechados com teste. | iris | — | M | front |
| **MC-077** | Higiene de legados: tela para revisar contatos legados (is_lid_legacy), reclassificar ou excluir UM contato por vez, com prévia (sem ação em lote); só admin. | Fluxo testado em banco descartável. | iris | 084 | M | front + banco |
| **MC-078** | Tipos canônicos (item 94 do CLAUDE.md): validar no serviço e no banco; teste de contrato. | Tipo inválido nunca grava. | workersql | 052 | M | banco |

### Fase G · Duplicados, mesclar, comparar e excluir

| ID | Etapa | Critério de aceite | Perfil | Dep | Tam | Tipo |
|---|---|---|---|---|---|---|
| **MC-079** | Fila "Possíveis duplicados": agrupar por telefone normalizado, e-mail e nome+empresa com nível de confiança; abrir a comparação. | Base semente: 100% dos duplicados propositais achados. | complexo | 002 | G | front + banco |
| **MC-080** | Mesclar: escolher o valor de cada campo, ver o que será movido (conversas, notas, tarefas, tags), confirmar; erro tratado; testes de ContactMergeDialog e contact-merge.service (hoje sem teste). | Mesclar sem perda; erro mostra motivo. | iris | 079 | G | front |
| **MC-081** | Comparar lado a lado (até 3) com diferenças destacadas e ação "usar este valor"; testes de ContactCompareDialog. | Diferenças destacadas corretamente. | iris | — | M | front |
| **MC-082** | Auditoria visível da mesclagem (quem, quando, quem foi mesclado) no histórico, sem expor dados sensíveis além do necessário. | Evento aparece na timeline. | hugo | 080 | M | front |
| **MC-083** | Exclusão de UM contato: confirmação clara, soft delete padrão, aviso do impacto (conversas associadas) e permissões; sem exclusão em massa no Zapp. | Excluir exige confirmação e respeita o papel. | iris | 004 | M | front |
| **MC-084** | Lixeira de contatos (30 dias): listar, restaurar e apagar definitivamente (admin); hoje o restaurar só existe por SQL manual. | Restaurar devolve o contato com histórico. | workersql | 083 | G | banco + front |
| **MC-085** | Testar as receitas do runbook de exclusão/legados por execução (B4) em banco descartável. | Receitas rodadas e registradas. | workersql | 084 | M | teste |
| **MC-086** | Relatório interno de qualidade da base (duplicados abertos, incompletos, legados, sem responsável) em Analytics, somente leitura na tela. | Números conferidos com a base semente. | hugo | 074 | M | front |

### Fase H · Tags, segmentos e atribuição

| ID | Etapa | Critério de aceite | Perfil | Dep | Tam | Tipo |
|---|---|---|---|---|---|---|
| **MC-087** | Gerenciador de tags: ver, renomear e ocultar tags, com contagem de uso e cor dentro dos tokens; permissão admin; sem mesclar tags em lote. | Renomear atualiza os contatos sem perda. | iris | 004 | M | front |
| **MC-088** | Campos sensíveis (documento CPF/CNPJ, e-mail, telefone adicional) mascarados para quem não é admin/supervisor, com registro de quem revelou e quando. | Teste por papel; revelação auditada. | workerauth | 004 | M | front + banco |
| **MC-089** | LGPD por contato: anonimizar/eliminar UM contato a pedido do titular (admin), com registro auditável e sem exportar nada. | Anonimização irreversível testada em banco descartável. | workersql | 084 | M | banco + front |
| **MC-090** | Segmentos dinâmicos: Filtros Salvos viram "Segmentos" com contagem ao vivo e uso em campanhas (Talk X) dentro do sistema. | Segmento atualiza a contagem sozinho. | hugo | 035 | G | front |
| **MC-091** | Visibilidade: agente vê os seus, supervisor a equipe, admin tudo; aviso "você vê N de M"; teste dos 3 papéis. | Teste de papéis verde. | workerauth | 004 | M | teste |
| **MC-092** | Preferências do usuário no módulo (visão, colunas, densidade, ordenação) salvas por usuário, com reserva local. | Preferência segue o usuário entre aparelhos. | hugo | 038 | M | front + banco |

### Fase I · Desempenho e banco

| ID | Etapa | Critério de aceite | Perfil | Dep | Tam | Tipo |
|---|---|---|---|---|---|---|
| **MC-093** | search_contacts: inlinar a visibilidade (sem chamar can_edit_contact por linha), W4-1, com teste de equivalência de resultados. | Mesmo resultado e ≥50% mais rápido. | workersql | 002 | G | banco |
| **MC-094** | Contagem: exata até o limite e aproximada/cacheada acima (W4-4), com rótulo "≈" honesto. | Contagem em 100 mil contatos ≤200 ms. | workersql | 003 | G | banco |
| **MC-095** | Conjunto completo de índices pg_trgm nas 7 colunas do OR e benchmark 10k/30k/100k, concorrência e ordenação por updated_at (W4-2 e W4-6). | Benchmark documentado e repetível. | workersql | 093 | G | banco |
| **MC-096** | Trigger de endereço: monitorar custo e lock (W4-5) e investigar por que nunca registrou evento (E96) com dados reais, em leitura. | Diagnóstico por escrito. | workersql | — | M | banco |
| **MC-097** | Controle de custo do mapa (E89): flag ou teto em banco para conter sessões Mapbox sem deploy e painel interno do consumo. | Teto muda sem deploy. | workersql | 003 | M | banco |

### Fase J · Testes, documentação e entrega

| ID | Etapa | Critério de aceite | Perfil | Dep | Tam | Tipo |
|---|---|---|---|---|---|---|
| **MC-098** | Cobertura dos itens sem teste do módulo (mesclar, comparar, agrupamento, estado vazio, skeleton, card CRM, filtros CRM, useContactAssignment, useContactPurchases etc.), testes de permissões e do mapboxLoader (0%); itens de edição em massa saem do Zapp (MC-075) em vez de ganhar teste. | Nenhuma unidade do módulo sem teste. | workertestes | — | G | teste |
| **MC-099** | E2E com dados semente (nunca pular por falta de dados) e baselines visuais (chromium-contacts-visual) em claro/escuro/celular; specs de filtros, seleção, mesclar, detalhe e teclado. | Nenhum test.skip por dado; baselines commitadas. | workertestes | 002 | G | teste |
| **MC-100** | Documentação e verificação final: 6 linhas de Contatos no CLAUDE.md (94), COMPLETE_SYSTEM_FEATURES e FUNCTIONALITIES_INVENTORY (3.9), runbook, relatório de fechamento com evidência por etapa e checklist visual na pré-visualização. | Fechamento com 100/100 etapas e prova de cada uma. | vera | — | M | doc |

## 6. Ondas de execução (para o motor de gatilhos)

| Onda | Etapas | Foco | Libera quando |
|---|---|---|---|
| 1 | MC-001 a MC-026 | Base, regras, acessibilidade e correções rápidas | aprovação do plano e fila da leva 1 abaixo de ~100 |
| 2 | MC-027 a MC-042 | Toolbar, busca e filtros (celular primeiro) | onda 1 integrada (MC-006, 010, 015, 020) |
| 3 | MC-043 a MC-068 | Cards, KPIs e painel de detalhe | MC-027, 029, 031 e 055 integradas |
| 4 | MC-069 a MC-092 | Formulário, duplicados, tags e atribuição | MC-043 e MC-056 integradas |
| 5 | MC-093 a MC-100 | Banco/desempenho, testes finais e documentação | trilha de banco aprovada por você; MC-098 e MC-099 rodam durante todas as ondas |

**Ordem dentro da onda:** vale a coluna de dependência, não o número da etapa (ex.: MC-077 espera MC-084, que é da mesma onda 4).

**Cadência:** no máximo 6 a 8 cartões novos por dia por área; 1 cartão = 1 a 4 etapas do mesmo perfil e do mesmo arquivo; cada cartão com o plano já commitado, como a regra manda.

## 7. Trilha de banco (separada)

Etapas com banco: MC-002, MC-059, MC-071, MC-077, MC-078, MC-079, MC-084, MC-088, MC-089, MC-092, MC-093, MC-094, MC-095, MC-096, MC-097. Cada uma nasce como migration **local**, com teste em banco descartável, e só vai para a produção quando você autorizar, uma por vez, como no lote #1905 (conferência por hash do ledger). Nenhuma delas é pré-requisito de uma etapa de tela sem flag: a interface fica pronta e desligada até o banco subir.

## 8. Rastreabilidade com o inventário

| Item do inventário | Etapa |
|---|---|
| W4-1 inlinar visibilidade | MC-093 |
| W4-4 contagem exata | MC-094 |
| W4-2 índices pg_trgm | MC-095 |
| W4-6 benchmarks não medidos | MC-095 |
| W4-5 / E96 trigger de endereço | MC-096 |
| E89 e Achado B (flag/teto Mapbox) | MC-097 |
| 3.5b enriquecimento CRM externo | MC-068 |
| RES-fotos (fotos reais) | MC-051 |
| Restaurar contato excluído | MC-084 |
| B4 receitas do runbook | MC-085 |
| Snapshots visuais e test.skip por dados | MC-099 e MC-002 |
| lacuna F7 (mapboxLoader 0%) | MC-098 |
| Achado D–J (2º editor, onBlur/Tab) | MC-076 |
| 28 / 39 / 65 / 2-5 (abertas do fechamento) | MC-001, 003, 052, 098 |
| 3.9 e 94 (documentação) | MC-100 |

## 9. Decisões que preciso de você (D1–D7)

- **D1 · KPIs:** "Empresas" = empresas distintas e "Fornecedores" = contatos do tipo fornecedor? (recomendo sim, com clique que filtra)
- **D2 · "Mostrar legados":** manter com explicação e tela de higiene só para admin? (recomendo sim)
- **D3 · Contagem:** exata até 10 mil e aproximada (≈) acima disso? (recomendo sim)
- **D4 · Fotos:** usar foto real quando existir e iniciais quando não? (recomendo sim)
- **D5 · Lixeira:** 30 dias e só admin restaura? (recomendo sim)
- **D6 · Enriquecimento do CRM externo (Singu):** o Zapp hoje lê empresa/cargo/e-mail em modo leitura. Como o Zapp não importa informações, isso continua ou sai? (preciso da sua decisão)
- **D7 · Mesclar e comparar:** são operações sobre 2 ou 3 contatos específicos, não edição em massa. Ficam no Zapp? (recomendo sim)

## 10. Riscos e travas

- Conflito de merge com os planos de Journey, e-mail e arquivos nos mesmos componentes → MC-005 define a ordem; etapas de tela dos dois planos têm prioridade.
- Fila de integração ainda longa → ondas só liberam com a fila da leva 1 baixa e carga da máquina abaixo do limite.
- Migration em produção → sempre com sua autorização, uma por vez, hash conferido, rollback documentado no cabeçalho.
- Regressão visual → roteiro MC-009 em toda etapa de tela e flag MC-010 para reverter sem deploy.