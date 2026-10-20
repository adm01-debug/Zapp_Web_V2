# Plano de redesign do módulo Contatos: REVISÃO 2 (adendo, 12/10/2026)

> Prevalece sobre `PLANO_CONTATOS_REDESIGN_100_ETAPAS_2026-10-12.md` onde divergir. Nasceu de uma análise exaustiva do plano contra o código vivo (branch `dia/2026-10-12`) e contra as medidas reais do design. **Nenhum cartão RD tinha começado** quando a revisão foi aplicada; os 100 cartões foram atualizados no quadro (corpo, título e dependências). Gerado de `~/arquitetura-v2/gatilhos/rd_rev2.py`.

## O que a análise encontrou (e o que foi feito)

| # | Achado (fato verificado) | Gravidade | Correção na revisão 2 |
|---|---|---|---|
| 1 | O caminho crítico tinha **60 etapas em série** (largura 1 na maior parte): travas artificiais de fase e cadeias por arquivo desperdiçavam o paralelismo de 20 agentes. | Alta | Travas removidas; ordem por arquivo calculada; barra de ferramentas, estados e fecho de qualidade em paralelo. **Caminho crítico: 35 etapas.**|
| 2 | **68 pares de etapas** alteravam o mesmo arquivo sem ordem entre si (ContactContentArea 18, tokens.css 16, ContactDetailPanel 10, ContactsTable 9...), o que gera conflito na integração. | Alta | Regra automática: quem mexe no mesmo arquivo espera o anterior. **Corridas restantes: 0.** |
| 3 | A reescrita quebra **38 arquivos de teste** existentes (unidade e e2e) e **35 não estavam em nenhuma lista de arquivos**: o revisor recusa diff fora da lista e o `zapp-verify` falharia. | Alta | Os testes existentes entram na lista de arquivos de cada etapa, com a regra de atualizá-los no mesmo cartão sem apagar a intenção (contratos de tipografia, alvo de toque, seleção unificada e permissões continuam valendo). |
| 4 | O script de semente do **CT-003 não está na `dia`** (entrega recusada 2 vezes; só numa branch antiga), mas o RD-009 dependia dele. | Alta | RD-009 recriado: semente própria `seed-contatos-redesign-local`, independente e só local. |
| 5 | **Alturas do retrato e fontes do card estavam erradas** no plano (286/220 px e 20-22 px). Medido no HTML original: retrato 308/296/285/311/338 px por faixa de largura; nome do contato 21 a 27 px. | Média | RD-051 corrigido e `design-medidas.json` (4 larguras) entra no repositório. |
| 6 | **PageHeader compartilhado já existe** (Breadcrumb, ícone, subtítulo, ações, `topRight`) e o ContactsView já o usa; o plano criava um cabeçalho paralelo. | Média | RD-011/013/014/017 reutilizam o PageHeader; nenhuma mudança no visual das outras 15 telas. |
| 7 | **Ferramentas de QA já existem** (`scripts/qa/contraste-contatos.mjs`, `medir-tipografia.cjs` com orçamento, `e2e/contacts-snapshots.spec.ts` com 6 imagens de referência, 10 specs e2e de Contatos e a fixture `contacts-page`). O plano as duplicava (RD-092, RD-097, RD-096, RD-001, RD-010). | Média | Todas passam a estender o que existe; as imagens de referência são regeneradas de propósito. |
| 8 | `useContactsSearch` usa `PAGE_SIZE` **constante**, não parâmetro (o RD-043 supunha parâmetro). | Média | RD-043 manda parametrizar com o valor atual como padrão. |
| 9 | A **ficha atual faz mais que o design**: envio de produto do catálogo e histórico de envios, CRM 360, engajamento, histórico de compras, mapa. O plano não dizia onde elas ficam. | Média | RD-071/073/074 listam o que preservar e em que aba encaixar. |
| 10 | O RD-020 era um marco **sem código** (a fila trata entrega vazia como `vazio`, hoje 267 entregas). | Baixa | Virou "Medida de fidelidade contra o design": comando que compara alturas e proporções da tela com `design-medidas.json`. |
| 11 | Dois formatadores de telefone existem; o plano mandava "usar o existente". `getRegionFromPhone` devolve texto ("São Paulo - SP"), não UF. | Baixa | RD-007 aponta `formatPhoneBR` e o parse do sufixo " - UF". |
| 12 | A decisão aprovada do plano CT "**celular primeiro**" não aparecia nas regras do redesign (que andava desktop-primeiro). | Baixa | Regra acrescentada ao corpo de todos os cartões. |
| 13 | Foto grande de contato é dado pessoal exposto com mais destaque; a proteção de tela do módulo (CT-093/094) precisa valer para ela. | Baixa | RD-006: `draggable={false}`, sem menu de salvar imagem, sem background público. |

## Decisão em aberto (do Joaquim)
**Como liberar o visual novo.** O sistema já tem a chave `contacts.v2` com sub-chaves por área (`toolbar`, `cards`, `detalhe`, `empresa`, `edicao`, `protecao`), desligada por padrão em produção, para liberar por partes e recolher sem versão nova (CT-005; CT-115 trata a liberação). Este plano **substitui o visual no mesmo componente, sem flag**: mais simples e sem duplicar código, mas a reversão passa a ser reverter o lote. A alternativa é criar componentes `V2` ao lado dos antigos, escolhidos pela flag: reversão instantânea e os testes antigos continuam intactos, ao custo de código duplicado até a limpeza. **Recomendação mantida: sem flag**, porque a promoção para a `main` já é feita por você e em lote; se preferir a flag, a revisão é grande (todo caminho de arquivo muda) e deve ser decidida antes de a Fase A começar.

## Dependências atuais (revisão 2)

Profundidade máxima: **35** níveis. Largura por nível: 1:9, 2:7, 3:6, 4:4, 5:4, 6:6, 7:10, 8:5, 9:4, 10:5, 11:2, 12:3, 13:2, 14:2, 15:2, 16:2, 17:1, 18:1, 19:2, 20:1, 21:2, 22:2, 23:1, 24:1, 25:1, 26:2, 27:1, 28:1, 29:1, 30:1, 31:5, 32:1, 33:1, 34:1, 35:1.

| # | Etapa | Quem | Espera por |
|---|---|---|---|
| RD-001 | Linha de base visual e de medida do módulo atual | workertestes | — |
| RD-002 | Tokens de Contatos no sistema de design (escuro e claro) | designer | — |
| RD-003 | Guia de composição do módulo Contatos | designer | 002 |
| RD-004 | Movimento do módulo, com respeito a quem não quer animação | iris | — |
| RD-005 | Hook de colunas pela largura do contêiner | hugo | — |
| RD-006 | Componente de retrato do contato (foto ou iniciais) | iris | 002 |
| RD-007 | Modelo de exibição do contato (o que mostrar e o que omitir) | iris | — |
| RD-008 | Selo de tipo de contato reutilizável | iris | 002 |
| RD-009 | Contatos e retratos de teste do redesign no ambiente local | workersql | — |
| RD-010 | Roteiro de captura visual do redesign e fechamento da Fase A | workertestes | 001, 009 |
| RD-011 | Cabeçalho da página: título, subtítulo e trilha | iris | 002, 006 |
| RD-012 | Selo 'Origem dos dados' ligado ao estado real do Singu | hugo | — |
| RD-013 | Selo de origem no cabeçalho (visual) | iris | 012 |
| RD-014 | Ações do cabeçalho: Novo contato e CRM 360° | iris | 011, 013 |
| RD-015 | Composição da página: contêiner, espaçamentos e fundo | iris | 014, 004 |
| RD-016 | A primeira linha de contatos aparece sem rolar | iris | 015, 010 |
| RD-017 | Cabeçalho e página no celular e no tablet | iris | 016 |
| RD-018 | Testes do cabeçalho e da composição da página | workertestes | 017 |
| RD-019 | Revisão visual do cabeçalho e da composição | designer | 017, 018 |
| RD-020 | Medida de fidelidade: a tela contra as medidas do design | workertestes | 010, 019 |
| RD-021 | Cartão de indicador no novo visual | iris | 002 |
| RD-022 | Faixa de indicadores responsiva | iris | 021 |
| RD-023 | Indicadores honestos: sem 'zero' falso | hugo | 022 |
| RD-024 | Abas de tipo de contato no formato do design | iris | 008 |
| RD-025 | Contadores por tipo vindos de uma só fonte | hugo | 024, 023 |
| RD-026 | Teclado e leitor de tela nas abas de tipo | iris | 025 |
| RD-027 | Abas e indicadores no celular | iris | 026 |
| RD-028 | Cor e ponto de cada tipo em todo o módulo | iris | 027 |
| RD-029 | Testes da faixa de indicadores e das abas | workertestes | 028 |
| RD-030 | Revisão visual de indicadores e abas | designer | 029, 019 |
| RD-031 | Barra de ferramentas em uma linha | iris | 015, 024 |
| RD-032 | Caixa de busca como elemento principal | iris | 031 |
| RD-033 | Ordenação com seletor elegante e rótulos completos | iris | 031 |
| RD-034 | Botão e painel de Filtros | iris | 033 |
| RD-035 | Filtros salvos no novo visual | iris | 031 |
| RD-036 | Chave 'Mostrar legados' | iris | 034 |
| RD-037 | Alternador de visão: Cards, Lista, Tabela e Mais | iris | 031, 036 |
| RD-038 | Colunas (2, 3 ou 4 cards por linha) | iris | 036, 037, 005, 019 |
| RD-039 | Barra de ferramentas no celular e no tablet | iris | 038, 032, 035, 037 |
| RD-040 | Testes e revisão visual da barra de ferramentas | designer | 039 |
| RD-041 | Linha de resumo dos resultados | iris | 031 |
| RD-042 | Paginação no novo visual | iris | 041, 038 |
| RD-043 | Tamanho da página por visão e por colunas | hugo | 038 |
| RD-044 | Chips dos filtros ativos | iris | 042, 043 |
| RD-045 | Estado 'nenhum contato encontrado' | iris | 031 |
| RD-046 | Esqueleto de carregamento igual ao card | iris | 006 |
| RD-047 | Estados de erro e de Singu indisponível | iris | 046, 012, 044 |
| RD-048 | Foco e anúncio por voz ao filtrar | iris | 047 |
| RD-049 | Testes dos estados da lista | workertestes | 041, 042, 043, 044, 045, 046, 047, 048 |
| RD-050 | Revisão visual da Fase E e marco: toolbar e estados prontos | designer | 049, 040 |
| RD-051 | Card com retrato grande: estrutura | iris | 006, 007, 008 |
| RD-052 | Selo de tipo, localização e botão de abrir sobre o retrato | iris | 051 |
| RD-053 | Card sem foto: iniciais grandes sobre fundo elegante | iris | 052 |
| RD-054 | Ações do card: conversar, editar e mais | iris | 053 |
| RD-055 | Estados do card: passar o mouse, foco e selecionado | iris | 054, 004 |
| RD-056 | Rodapé: último contato e dados de relacionamento | iris | 055 |
| RD-057 | Grade de cards responsiva pelo contêiner | iris | 056, 043, 050 |
| RD-058 | Nome, empresa e e-mail longos não quebram o card | iris | 057 |
| RD-059 | Card no celular e no tablet | iris | 058 |
| RD-060 | Testes e revisão visual do card | designer | 059, 030 |
| RD-061 | Lista: linha horizontal com foto | iris | 008, 054, 028 |
| RD-062 | Lista agrupada por empresa | iris | 061, 057 |
| RD-063 | Tabela: cabeçalho e linhas no novo visual | iris | 061 |
| RD-064 | Escolha de colunas da tabela | iris | 063, 038, 040 |
| RD-065 | Ordenação única e clara na tabela | iris | 064 |
| RD-066 | Tabela no celular | iris | 065 |
| RD-067 | Mesma linguagem nas três visões | iris | 062, 066, 060 |
| RD-068 | Teclado nas três visões | iris | 067 |
| RD-069 | Testes das visões Lista e Tabela | workertestes | 068 |
| RD-070 | Revisão visual de Lista e Tabela | designer | 069 |
| RD-071 | Ficha completa: casca da janela | iris | 004 |
| RD-072 | Ficha: coluna do retrato e resumo | iris | 071, 013 |
| RD-073 | Ficha: abas Visão geral, Perfil Singu, Histórico e Anotações | iris | 072 |
| RD-074 | Ficha: aba Visão geral | iris | 073 |
| RD-075 | Ficha: aba Perfil Singu | iris | 074 |
| RD-076 | Ficha: aba Histórico | iris | 075 |
| RD-077 | Ficha: aba Anotações | iris | 076 |
| RD-078 | Ficha: anterior e próximo dentro dos resultados | iris | 077, 019 |
| RD-079 | Ficha no celular | iris | 078 |
| RD-080 | Testes e revisão visual da ficha | designer | 079, 070 |
| RD-081 | Carrossel 'Explore seus contatos': estrutura | iris | 008, 059 |
| RD-082 | Carrossel: movimento suave, pausa e controles | iris | 081, 004 |
| RD-083 | Comparar contatos no novo visual | iris | — |
| RD-084 | Seleção para comparar e mesclar | iris | 083, 041, 068, 070, 078 |
| RD-085 | Mesclar contatos no novo visual | iris | 084 |
| RD-086 | Pipeline, Mapa e Analytics no mesmo padrão | iris | — |
| RD-087 | Diálogo de novo e de editar contato | iris | 074 |
| RD-088 | Confirmação de exclusão | iris | 087 |
| RD-089 | Testes de comparar, mesclar, seleção e carrossel | workertestes | 085, 082, 086, 088 |
| RD-090 | Revisão visual da Fase I | designer | 089, 086, 087, 088, 080 |
| RD-091 | Tema claro de todo o módulo | designer | 060, 070, 080, 089, 090 |
| RD-092 | Contraste e tamanho de letra (WCAG AA) com as ferramentas que já existem | designer | 091 |
| RD-093 | Foco visível, rótulos e leitor de tela | iris | 091 |
| RD-094 | Movimento e toque: preferências do usuário | iris | 091 |
| RD-095 | Desempenho: fotos, renderização e orçamento | hugo | 091 |
| RD-096 | Teste de ponta a ponta do módulo redesenhado | workertestes | 092, 093, 094, 095 |
| RD-097 | Regressão visual com o teste de snapshots que já existe | workertestes | 096 |
| RD-098 | Guarda de regras do módulo (teste de contrato) | workertestes | 091 |
| RD-099 | Limpeza: código e estilos que ficaram para trás | iris | 096, 097, 098 |
| RD-100 | Documentação e revisão final contra o design | vera | 099 |

## Itens fora deste plano que a análise encontrou
- **CT-003 (`done` no quadro, não integrado):** a semente de contatos de teste do plano funcional não está na `dia`; os cartões CT que dependem dela devem ser revistos (fila: 2 recusas, 1 falha).
- **Integrador:** 320 entregas em `pronto`, 937 `rejeitado`, 215 `conflito`; o ritmo de integração (poucas por hora enquanto o lote de migrations roda) é o gargalo real do prazo, mais que o número de etapas.

