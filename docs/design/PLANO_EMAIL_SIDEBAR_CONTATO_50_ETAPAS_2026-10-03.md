# Email — plano do sidebar de contato e empresa em 50 etapas

## Decisão vigente e entrega

**A referência visual orienta estrutura, conteúdo, hierarquia, espaçamento e ações. As cores vêm exclusivamente do tema global do ZAPP.** A orientação NAVY dos documentos anteriores está substituída neste ponto; preservar a correção da PR #1793.

Pedido: melhorar o painel lateral da rota `?view=email-chat`, com dados do Singu CRM, incluindo **site, LinkedIn da empresa, Instagram da empresa, Sobre da empresa, logo e tipos de relacionamento empresarial** (cliente, fornecedor, transportadora etc.). Participantes, anexos, conversas relacionadas, tags e notas devem continuar úteis no mesmo painel.

Esta entrega é o plano versionado. **ES-01 a ES-50 estão planejadas; nenhuma foi executada como implementação nesta entrega.** A inspeção preparatória não fecha etapas futuras. Código, banco, serviços externos e produção não são modificados por este documento.

## Evidência da preparação

- Data: 03/10/2026. Base inspecionada: `27ac8469ef605a1703195db2106aff9aa88f3f65`, obtida de `origin/main`.
- Branch de planejamento: `docs/email-contact-sidebar-plan-20261003`, em worktree separada; checkout compartilhado preservado.
- Fontes: código, tipos, contratos e documentos versionados; duas imagens anexadas pelo usuário, incluindo o recorte do painel. As imagens foram examinadas na conversa, não incorporadas como arquivos nem tratadas como dados reais.
- Limite: não foram consultados registros do CRM vivo, schema vivo ou código publicado das Edge Functions. Tipos TypeScript e allowlists são evidência do contrato local, não prova de disponibilidade externa.
- O grafo de outra worktree foi consultado, mas o resultado amplo não resolve o contrato empresarial; as conclusões abaixo vêm da leitura direta da base fixada.

### Trabalho paralelo a reaproveitar

PRs abertas consultadas, incluindo seus arquivos/diffs relevantes, nesta preparação:

- [#1636 — lookup sidebar](https://github.com/adm01-debug/Zapp_Web_V2/pull/1636): já propõe aceitar `lookup: 'sidebar'`, chamar `get_contact_sidebar_by_phone` e validar identidade. **Reaproveitar após revisão/merge/deploy, sem abrir correção duplicada.** O diff ainda depende de telefone; sozinho não resolve Email sem telefone nem adiciona os seis campos empresariais.
- [#1654 — sidebar de três seções](https://github.com/adm01-debug/Zapp_Web_V2/pull/1654): altera o painel de contato do inbox, com seções Profissional, Pessoal e Perfil Singu; usa `CompanyLogo`. Não altera `EmailContactPanel`. Compartilhar primitives/contratos úteis após verificar compatibilidade; não importar redes pessoais, perfis comportamentais ou organização de seções para substituir o painel de Email pedido aqui.
- [#1621 — plano de três seções](https://github.com/adm01-debug/Zapp_Web_V2/pull/1621): documento para o sidebar do inbox, ainda fora da base inspecionada. Coordenar dependências comuns; este plano mantém escopo próprio de Email e empresa.

Estes estados são um snapshot. ES-01 precisa revalidá-los antes de qualquer implementação. Não fechar, substituir ou mergear trabalho paralelo como parte desta entrega documental.

### Por que o painel ficou incompleto

| Achado confirmado no código | Consequência | Etapas |
|---|---|---|
| [EmailContactPanel](../../src/components/email/EmailContactPanel.tsx) recebe `thread.contact` e não busca empresa no Singu. | Alterar somente o layout não preencherá as informações empresariais. | ES-06–ES-20 |
| [useGmail](../../src/hooks/integrations/useGmail.ts) seleciona somente `id, name, email, avatar_url, phone, company, job_title, tags` do contato, tanto na lista como na busca de thread por ID. | `company` é texto local; não contém site, perfis sociais, Sobre ou identidade empresarial validada. | ES-01, ES-06, ES-13 |
| [useContactSidebar](../../src/hooks/crm/useContactSidebar.ts) → [ExternalCRMService](../../src/services/crm/external-crm.service.ts) envia `lookup: 'sidebar'`; [crm-integration](../../supabase/functions/crm-integration/index.ts) aceita somente `360` ou `intelligence` em `contactLookup`. | O caminho existente seria rejeitado com 400 na implementação versionada. Reutilizar o hook sem corrigir o contrato perpetua a lacuna. | ES-02, ES-09, ES-16 |
| A mesma operação resolve o contato pelo telefone local e rejeita telefone inválido. | Contato de Email sem telefone não tem um caminho suficiente de enriquecimento. | ES-07–ES-09, ES-15 |
| Operações genéricas `select` e `rpc` da integração são restritas a administrador/supervisor, salvo a exceção limitada de cargos. | Testar só com administrador pode esconder um sidebar vazio para atendentes; não liberar consultas genéricas para contornar isso. | ES-04, ES-14, ES-43 |
| [contact360](../../src/types/contact360.ts) já descreve `company.website`, `company.logo_url` e `company_social`; [externalDB](../../src/types/externalDB.ts) distingue empresas, clientes, fornecedores e transportadoras. | Há contratos para reaproveitar, sem criar outra integração CRM. | ES-03, ES-10–ES-12 |
| `SidebarEmpresa` em [contactSidebar](../../src/types/contactSidebar.ts) só contém `id`, `nome`, `logo_url`; `personal.social` representa redes pessoais. | Não usar redes pessoais como redes da empresa. | ES-10, ES-11, ES-23–ES-24 |
| [CompanyLogo](../../src/components/contacts/CompanyLogo.tsx) oculta a imagem no `onError`, sem renderizar outro elemento nessa ramificação. | Reaproveitar exige tratar URL quebrada para não deixar espaço vazio. | ES-26, ES-44 |
| O Email mostra só iniciais, uma ação de e-mail e “Sobre” misturando contato com assunto/quantidade de mensagens. Relacionadas são limitadas a cinco no pai. | Faltam identidade da empresa, ações externas e distinção entre dados do contato e da conversa; contagem pode representar só a amostra. | ES-21–ES-39 |
| A evidência histórica aprova identidade/participantes/notas, mas isso não demonstra os seis campos empresariais pedidos agora. | O aceite precisa cobrir cada campo e a ligação até a fonte, não somente a presença do painel. | ES-05, ES-41–ES-50 |

## Resultado esperado

Ordem do painel, preservando o comportamento de fechar/abrir e o drawer existente:

```text
Detalhes do contato                                  [Fechar]
Identidade do contato + e-mail da conversa
Empresa vinculada: logo, nome, tipos de relacionamento
[E-mail] [Site] [LinkedIn] [Instagram] [Mais, se houver ações]
Sobre a empresa: nome, ramo, localidade, descrição expansível
Origem dos dados e estado de atualização do Singu
Participantes · Anexos da conversa · Conversas relacionadas
Tags e marcadores · Notas internas
```

Em contato pessoal, manter nome/avatar da pessoa e identificar explicitamente a empresa abaixo. Em caixa empresarial vinculada, a logo pode representar a empresa, com o endereço da conversa preservado. Nunca substituir a pessoa pela empresa sem indicar o que está sendo exibido. O selo “Empresa verificada” do desenho só aparece se existir evidência específica de verificação empresarial; vínculo CRM ou e-mail verificado não bastam.

### Matriz dos dados e decisões

Os caminhos abaixo são candidatos observados no código. Confirmar payload e semântica em ES-03; registrar campos não disponíveis como dependência, sem fingir conclusão.

| Informação | Fonte candidata | Regra e ausência | Aceite obrigatório |
|---|---|---|---|
| Nome empresarial | `company.nome_fantasia`, `nome_crm`, `razao_social` | Definir precedência explícita. `contact.company` pode aparecer como informação local, sem afirmar vínculo Singu. | Nome vem da empresa selecionada; nenhuma associação só por nome. |
| Site | `company.website` | URL validada; quando vazio, “Site não informado”, sem link fabricado pelo domínio do e-mail. | Botão e texto abrem a mesma URL. |
| LinkedIn empresarial | `company_social` / `company_social_media`, plataforma correspondente | Exigir vínculo ao `company_id`; não substituir por `personal.social`/`contact_social_media`. | Perfil empresarial correto ou ausência explícita. |
| Instagram empresarial | Mesma origem empresarial, plataforma correspondente | URL real; handle só vira URL se contrato e formato forem conhecidos. | Ação própria visível, sem depender de menu oculto. |
| Sobre a empresa | Campo canônico empresarial a confirmar; `ExtCustomer.sobre` é um candidato restrito a cliente | Validar significado e acesso. Não usar notas privadas, snippet de e-mail, resumo por IA ou texto genérico como descrição. | Texto real, expansível; ausência identificada também em fornecedor/transportadora. |
| Logo | `company.logo_url` | Validar URL e política de imagem; fallback de iniciais/ícone com identidade preservada. | Imagem correta; URL ausente/quebrada não deixa buraco. |
| Tipos de relacionamento | Relações `customers`, `suppliers`, `carriers` por `company_id`; demais categorias dependem de contrato | Pode haver mais de um tipo. `contact_type`, ramo, status ativo e natureza jurídica não são equivalentes. | Cliente + Fornecedor simultâneos; Transportadora isolada; desconhecido honesto. |
| Ramo e localização | `company.ramo_atividade` e endereço empresarial | Não copiar endereço residencial da pessoa; não inventar setor/localidade do desenho. | Cidade/UF/país formatados apenas quando disponíveis. |
| Origem e frescor | Metadados de origem, instante de obtenção e `updated_at` quando realmente disponível | Hora da consulta não é hora de alteração no Singu. | Distinguir “Consultado em” de “Atualizado no CRM em”. |

### Regras do fluxo de dados

1. Contexto autorizado: usuário → conta Gmail → thread → contato → vínculo Singu → empresa. IDs enviados pelo navegador não dispensam autorização no servidor.
2. Priorizar vínculo estável validado em `crm_contact_links`. Resolver e-mail exato no servidor somente dentro do escopo permitido e com resultado único; candidatos ambíguos exigem escolha explícita. Domínio de e-mail não comprova empresa.
3. `From`, `Reply-To` e remetente da última mensagem têm finalidades distintas. Uma resposta enviada por nós não deve transformar nossa própria empresa no contato do painel.
4. Manter o Singu como fonte dos campos empresariais. Nenhuma migration deste repositório deve alterar o banco externo. Se faltar contrato externo, produzir uma especificação de integração para o responsável pelo Singu.
5. Evitar duplicação: primeiro avaliar DTO de leitura e cache de consulta. Novo armazenamento local só com necessidade demonstrada, política de atualização e autorização; não criar tabela espelho para desenhar seis campos.
6. Edição de empresa nesta primeira entrega usa destino validado do CRM, conforme permissão. Notas locais continuam no serviço existente. Não adicionar sincronização bidirecional implícita.
7. Preservar tokens globais, inclusive alto contraste. Logo pode manter cores da própria marca; não recolorir os painéis a partir dela.

## As 50 etapas

Cada etapa só será concluída quando sua saída e seu aceite tiverem evidência ligada a commit/teste. Status inicial de todas: **planejada**. A dependência de fase é cumulativa; dependências específicas estão apontadas quando mudam a ordem. Os nomes de novos DTOs/hooks são propostas, não arquivos existentes.

### Fase 1 — baseline e decisões verificáveis (ES-01–ES-05)

- [ ] **ES-01 — Fixar a base da implementação.** Atualizar a branch isolada e comparar Email/Gmail/CRM com o SHA desta preparação; conferir PRs concorrentes. **Saída:** lista de arquivos e correções posteriores aproveitadas. **Aceite:** nenhuma alteração alheia sobrescrita e nenhuma tarefa repetida sem motivo.
- [ ] **ES-02 — Reproduzir o contrato do sidebar e aproveitar a correção existente.** Revalidar a PR #1636 e executar teste local da combinação serviço → validação de `contactLookup`, incluindo `lookup: 'sidebar'`, `360`, `intelligence`. **Saída:** prova do 400 na base antiga e do comportamento da versão adotada, sem duplicar a PR aberta. **Aceite:** distinguir o código versionado da versão de edge efetivamente publicada.
- [ ] **ES-03 — Confirmar o dicionário empresarial no Singu.** Obter schema/payload autorizado em leitura para empresa, redes sociais, descrição e relações cliente/fornecedor/transportadora. **Saída:** matriz campo → tabela/RPC → chave → nullable → permissão, com exemplos anonimizados. **Aceite:** cada um dos seis campos tem fonte comprovada ou dependência nominal registrada; declaração TypeScript sozinha não fecha a etapa.
- [ ] **ES-04 — Mapear quem pode ver e editar.** Verificar permissões de atendente, supervisor e administrador, acesso à conta Gmail e à empresa externa. **Saída:** matriz de autorização dos botões, consulta e vínculo. **Aceite:** teste previsto para atendente real e negação no servidor, sem transformar a operação genérica de CRM em consulta pública.
- [ ] **ES-05 — Fechar o contrato visual e de aceite.** Registrar hierarquia acima, cores globais, comportamento de campos vazios e distinção pessoa/empresa. **Saída:** checklist dos seis campos e das seções da referência. **Aceite:** estrutura comparável ao anexo com dados de teste completos; ausência de dados não aprova o caminho preenchido.

### Fase 2 — identidade correta (ES-06–ES-10; depende da fase 1)

- [ ] **ES-06 — Definir o DTO do painel.** Propor `EmailContactContext` separando `person`, `company`, `relationships`, `source` e estados por seção. **Saída:** contrato tipado, campos opcionais explícitos e validação na fronteira. **Aceite:** dados incompletos não viram strings “undefined” nem campos atribuídos à entidade errada.
- [ ] **ES-07 — Resolver vínculo estável.** Reutilizar `crm_contact_links` após validar contato, escopo e associação empresarial atual. **Saída:** ordem de resolução por ID e política para vínculo obsoleto/revogado. **Aceite:** ID CRM divergente bloqueia associação; telefone antigo não transfere dados de outra empresa.
- [ ] **ES-08 — Cobrir contatos somente com e-mail.** Especificar resolução por endereço normalizado no servidor, com busca exata e limite de candidatos, sem depender de telefone. **Saída:** caminhos para vínculo válido, zero resultado, resultado único e ambiguidade. **Aceite:** e-mail pessoal, alias e caixas compartilhadas não associam empresa por domínio; não remover pontos ou sufixos `+` indiscriminadamente.
- [ ] **ES-09 — Fixar o contato da conversa.** Priorizar vínculo explícito e selecionar participante externo de modo determinístico nos casos sem vínculo, excluindo a conta ativa e aliases próprios confirmados. **Saída:** regra para recebidos, enviados, reply-all e vários participantes. **Aceite:** resposta nossa ou mudança de `last_from_address` não muda a empresa apresentada; `Reply-To` não redefine automaticamente a identidade.
- [ ] **ES-10 — Definir empresa e classificação múltipla.** Resolver empresa pelo vínculo confirmado e relações por `company_id`; em múltiplas empresas, exibir escolha contextual explícita. **Saída:** conjunto de tipos com códigos estáveis e rótulos pt-BR, incluindo não classificada. **Aceite:** Cliente e Fornecedor coexistem sem perda; Transportadora não depende de compra prévia; categorias adicionais só aparecem com fonte reconhecida.

### Fase 3 — adaptador e acesso aos dados (ES-11–ES-15; depende da fase 2)

- [ ] **ES-11 — Mapear site e redes empresariais.** Normalizar `company.website` e `company_social`/`company_social_media`, escolhendo perfil principal/ativo por regra comprovada. **Saída:** adaptador único para URL, plataforma e entidade de origem. **Aceite:** rede pessoal nunca preenche ação empresarial; perfis duplicados e plataformas desconhecidas têm tratamento determinístico.
- [ ] **ES-12 — Mapear Sobre, logo e localização.** Projetar descrição canônica, logo, ramo e endereço empresarial no DTO, respeitando o dicionário ES-03. **Saída:** precedência e origem por campo. **Aceite:** `customers.sobre` só é usado se seu significado for adequado; fornecedor/transportadora sem descrição recebem estado vazio, sem reciclar notas privadas.
- [ ] **ES-13 — Escolher o menor caminho de leitura.** Comparar extensão compatível da integração existente com operação específica para contexto de Email; avaliar DTO sem tabela adicional. **Saída:** decisão registrada e mapa front → serviço → edge → Singu. **Aceite:** todos os campos podem chegar ao painel; não considerar suficiente aumentar o `select` local de `contacts`.
- [ ] **ES-14 — Autorizar a operação no servidor.** Validar usuário, conta, thread, contato e empresa; derivar os identificadores externos a partir de vínculos permitidos. **Saída:** operação limitada aos campos necessários. **Aceite:** manipular `accountId`, `threadId`, `contactId` ou `companyId` não permite ler outra entidade; segredo externo nunca chega ao navegador.
- [ ] **ES-15 — Fechar dependências de banco e CRM.** Se ES-03/ES-13 comprovarem necessidade de schema, documentar objeto, proprietário, mudança aditiva, rollback e sequência de publicação. **Saída:** decisão “sem migration” ou especificação revisável da migration canônica; eventual lacuna Singu vira handoff separado. **Aceite:** nenhum DDL no CRM externo por este repo; campo indisponível mantém aceite pendente até contrato utilizável.

### Fase 4 — integração funcional e estados (ES-16–ES-20; depende da fase 3)

- [ ] **ES-16 — Implementar o transporte decidido.** Reaproveitar `callCRMIntegration`/`ExternalCRMService` e a correção #1636 quando disponível; complementar somente o necessário ao caminho decidido em ES-13. **Saída:** transporte com contrato validado e tratamento de payload inválido. **Aceite:** painel não chama operação rejeitada; consumidores atuais de `360`/`intelligence` continuam compatíveis.
- [ ] **ES-17 — Consultar apenas o contexto aberto.** Criar/adaptar hook com chave que inclua sessão/usuário, conta, contato e empresa efetivos. **Saída:** cache com invalidação em troca de conta, logout e mudança de vínculo. **Aceite:** abrir uma conversa não dispara consultas empresariais para toda a lista; cache não vaza entre usuários/contas.
- [ ] **ES-18 — Modelar todos os estados do CRM.** Distinguir carregando, disponível, não vinculado, ambíguo, sem permissão, integração desativada, erro e dados anteriores. **Saída:** apresentação e ações adequadas para cada estado. **Aceite:** 403/timeout não aparece como “empresa inexistente”; e-mail e anexos seguem utilizáveis se o CRM falhar.
- [ ] **ES-19 — Proteger troca rápida de contexto.** Cancelar/ignorar resultado antigo e reinicializar seleção de empresa, expansão e rascunho de nota quando mudar a identidade efetiva. **Saída:** isolamento durante requisições concorrentes. **Aceite:** resposta lenta da empresa A nunca aparece no painel B, inclusive após fechar/reabrir e trocar conta.
- [ ] **ES-20 — Atualizar dados de forma controlada.** Definir frescor inicial, retry limitado, atualização manual e invalidação ao regressar do CRM. **Saída:** estados “Consultado em”, “Atualizando” e erro de atualização com dados anteriores identificados. **Aceite:** clique repetido não cria tempestade de chamadas; timestamp da consulta não se passa por atualização no Singu.

### Fase 5 — ações essenciais da empresa (ES-21–ES-25; depende da fase 4)

- [ ] **ES-21 — Reorganizar o cabeçalho do painel.** Exibir título, fechamento, identidade do contato e empresa conforme o contrato ES-05. **Saída:** separação visual pessoa/empresa e e-mail acessível por copiar/ação. **Aceite:** textos longos quebram/expandem sem cortar o destino ou trocar a identidade pelo nome do remetente não confirmado.
- [ ] **ES-22 — Entregar a ação Site.** Adicionar botão e link na seção Sobre usando o mesmo valor normalizado de ES-11. **Saída:** navegação externa segura e estado “Site não informado”. **Aceite:** clique abre exatamente o site cadastrado; não usa o domínio do e-mail como fallback automático.
- [ ] **ES-23 — Entregar LinkedIn da empresa.** Exibir ação própria com nome acessível e destino empresarial validado. **Saída:** link e indicação de ausência/URL inválida. **Aceite:** fixture com LinkedIn pessoal e empresarial abre somente o empresarial; não marcar empresa como verificada pela existência de um perfil.
- [ ] **ES-24 — Entregar Instagram da empresa.** Incluir ação no mesmo nível de Site e LinkedIn, também no drawer estreito. **Saída:** destino validado, label e fallback. **Aceite:** Instagram fica visível sem depender de “Mais”; abrir link não adiciona destinatários nem altera a thread.
- [ ] **ES-25 — Fechar política comum de links.** Centralizar normalização HTTP(S), hosts sociais e abertura com isolamento entre janelas; “Mais” contém só ações existentes e permitidas, como copiar link ou abrir cadastro validado. **Saída:** helper reutilizável e sem ações decorativas. **Aceite:** rejeitar `javascript:`, `data:`, credenciais na URL e hosts enganadores; URLs válidas preservam caminho, query e fragmento necessários.

### Fase 6 — informações empresariais completas (ES-26–ES-30; depende da fase 5)

- [ ] **ES-26 — Entregar a logo real com fallback.** Reutilizar/adaptar `CompanyLogo` ou primitive de avatar, com dimensão estável, proporção preservada e fallback após erro. **Saída:** logo, iniciais e ícone para os três estados. **Aceite:** não buscar favicon por domínio nem inferir marca; troca de empresa e URL quebrada atualizam corretamente a imagem/fallback.
- [ ] **ES-27 — Entregar tipos de empresa.** Mostrar badges/labels dos relacionamentos ES-10 com tokens existentes. **Saída:** Cliente, Fornecedor, Transportadora e tipos adicionais confirmados. **Aceite:** ordenação estável, múltiplos tipos legíveis; “não classificada” difere de erro/sem permissão e de empresa inativa.
- [ ] **ES-28 — Entregar Sobre da empresa.** Separar nome/razão social, ramo, localidade e descrição; oferecer “Ver mais/Ver menos” quando longa. **Saída:** seção editorial fiel ao conteúdo da referência. **Aceite:** informação disponível é legível; HTML do CRM é apresentado como texto ou sanitizado segundo o contrato, nunca inserido sem tratamento.
- [ ] **ES-29 — Mostrar vínculo e origem sem selo fictício.** Exibir “Vinculada ao Singu CRM” apenas para vínculo confirmado, estado/frescor e acesso ao cadastro autorizado. **Saída:** diferença clara entre contato local e empresa CRM. **Aceite:** email verificado, transporte homologado e conexão ativa não geram selo genérico “Empresa verificada”.
- [ ] **ES-30 — Tratar dados faltantes e correção cadastral.** Manter os seis campos com ausência compreensível e ação “Abrir no CRM”/“Vincular empresa” somente onde houver fluxo e permissão reais. **Saída:** caminho de resolução para vínculo ausente, ambíguo e campo vazio. **Aceite:** nenhuma ação sem destino/handler; sem edição externa disponível, informar claramente essa limitação.

### Fase 7 — seções da referência e continuidade (ES-31–ES-35; depende da fase 6)

- [ ] **ES-31 — Aprimorar Participantes.** Normalizar endereços, nomes, duplicação por To/Cc e indicação da conta própria; clicar pode selecionar contexto sem reatribuir o contato persistido. **Saída:** lista com contagem real e expansão. **Aceite:** Bcc não é inferido; “Adicionar” só abre seleção no compositor e exige confirmação do usuário, pois não altera mensagens já enviadas.
- [ ] **ES-32 — Completar Anexos da conversa.** Preservar metadados, vínculo à mensagem e download existente; adicionar data quando disponível e “Ver todos” se a lista estiver reduzida. **Saída:** amostra/total explícitos. **Aceite:** arquivo homônimo usa o ID correto; falha de download é exibida sem sucesso falso.
- [ ] **ES-33 — Completar Conversas relacionadas.** Separar relacionamento por contato de eventual relação por empresa, sempre limitado à conta/acesso atual; corrigir contagem derivada do `.slice(0, 5)`. **Saída:** assunto, data, estado real e lista completa/paginada acessível. **Aceite:** “Ver todas” alcança itens além dos cinco; não unir conversas só por domínio ou por empresa ainda ambígua.
- [ ] **ES-34 — Distinguir tags e marcadores.** Deduplicar valores e indicar origem: Gmail, thread local, contato ou empresa Singu. **Saída:** exibição consistente e gerenciamento conectado aos serviços/permissões de cada origem. **Aceite:** editar marcador Gmail não altera tag CRM; estados não editáveis explicam a origem e não fingem salvar.
- [ ] **ES-35 — Preservar Notas internas.** Reutilizar `useContactNotes`; melhorar lista, autor/data, expansão e estados de salvamento/erro. **Saída:** nota local associada ao contato validado, sem duplicar cadastro. **Aceite:** trocar contato durante digitação/envio não mistura texto; falha preserva conteúdo; nota não entra no MIME nem vira “Sobre da empresa”.

### Fase 8 — composição, responsividade e eficiência (ES-36–ES-40; depende da fase 7)

- [ ] **ES-36 — Aplicar a composição da referência.** Ajustar cabeçalho, bloco de identidade, ações, divisórias, densidade e ordem das seções. **Saída:** painel real na rota existente com dados completos. **Aceite:** comparação lado a lado avalia estrutura/conteúdo; cores usam `bg-inbox-panel`, `foreground`, `muted-foreground`, `border`, `primary` e demais tokens globais.
- [ ] **ES-37 — Ajustar painel e drawer.** Reutilizar os dois pontos de montagem em `EmailChatInbox`, preferindo um modelo compartilhado; definir largura/rolagem pelo espaço disponível. **Saída:** comportamento consistente em 320, 390, 768, 1280 e 1920 px e zoom 200%. **Aceite:** quatro ações essenciais legíveis, sem scroll horizontal, botão de fechar sempre alcançável e conversa/compositor preservados.
- [ ] **ES-38 — Fechar acessibilidade.** Garantir títulos, labels, ordem de tabulação, foco no drawer, Esc, retorno ao gatilho e expansão por teclado. **Saída:** semântica e estados anunciados corretamente. **Aceite:** links ausentes não viram alvos vazios; contraste nos temas claro/escuro e alto contraste; ações não dependem só de cor ou hover.
- [ ] **ES-39 — Ajustar listas e estados parciais.** Limitar amostras longas com acesso ao restante; preservar expansão útil e separar erro por seção. **Saída:** painel utilizável com descrição extensa, 50 participantes e 100 anexos de fixture. **Aceite:** scrollbar própria, contagens corretas e nenhuma seção indisponível impede as demais.
- [ ] **ES-40 — Medir custo das consultas.** Instrumentar requisições e tempos em fixture com latência controlada. **Saída:** orçamento inicial de uma chamada agregada de contexto ao abrir o painel, sem polling automático e sem consultas por linha da lista; consultas secundárias só sob ação. **Aceite:** alternância repetida reaproveita cache válido; documentar p95 e desvios, sem prometer latência do Singu sem medição.

### Fase 9 — testes que provam os campos e os riscos (ES-41–ES-45; depende da fase 8)

- [ ] **ES-41 — Criar fixtures representativas.** Cobrir cliente, fornecedor, transportadora, múltiplos tipos, pessoa sem empresa, contato apenas com e-mail, empresa completa/incompleta e redes pessoais distintas. **Saída:** dados sintéticos com resultados esperados por campo. **Aceite:** todos os seis campos essenciais exercitados preenchidos, vazios e inválidos; chamadas externas mutáveis interceptadas, nenhum envio real.
- [ ] **ES-42 — Testar resolução e mapeamento.** Testar ES-06–ES-12, normalização de URLs/endereços, prioridade de fonte, ambiguidade e múltiplas empresas. **Saída:** testes de comportamento do DTO/resolver. **Aceite:** associação errada, rede pessoal e descrição privada fazem o teste falhar; mocks de UI não substituem o teste da operação real.
- [ ] **ES-43 — Testar autorização e transporte.** Exercitar a edge/contrato com atendente permitido, acesso negado, IDs cruzados, credencial ausente, resposta malformada e contato sem telefone. **Saída:** testes que comprovem a fronteira e compatibilidade dos consumidores atuais. **Aceite:** 400 do caminho antigo reproduzido e removido no caminho adotado; nenhuma ampliação genérica de privilégios.
- [ ] **ES-44 — Testar comportamento do painel.** Cobrir links, logo quebrada, tipos múltiplos, descrição expansível, CRM offline, atualização, troca A→B e conta→conta, notas e contagens. **Saída:** extensão dos testes existentes de Email, logo e hook quando modificados. **Aceite:** testes observam valores, destinos e ações do usuário; simples existência de ícones não aprova recursos.
- [ ] **ES-45 — Homologar na rota real.** Estender Playwright/fixtures existentes com empresa completa e caminhos de falha, painel/drawer, teclado, contraste e temas. **Saída:** screenshots e relatório por viewport/estado. **Aceite:** Site, LinkedIn, Instagram, Sobre, logo e tipos aparecem com fonte de fixture correta; screenshot apenas de estado vazio não fecha aceite visual.

### Fase 10 — revisão, publicação e encerramento futuro (ES-46–ES-50; depende da fase 9)

- [ ] **ES-46 — Revisar matriz final de paridade.** Para cada campo e seção, ligar requisito → fonte → arquivo → teste → screenshot → eventual dependência. **Saída:** matriz reaproveitado/corrigido/novo/pendente. **Aceite:** todos os requisitos empresariais comprovados; recursos bloqueados permanecem pendentes e impedem declarar conclusão integral.
- [ ] **ES-47 — Rodar as verificações aplicáveis.** Executar lint/typecheck/build, testes tocados e regressões Gmail/Omnichannel/CRM; guard de banco só se contratos/schema forem alterados. **Saída:** comandos, SHA, resultado e falhas externas classificadas. **Aceite:** suite pertinente verde, sem repetir suites globais por mudança puramente textual; teste não executado nunca marcado como aprovado.
- [ ] **ES-48 — Publicar PRs revisáveis.** Agrupar entregas pelos lotes abaixo, revalidar base e sobreposição, com descrição do comportamento e evidências. **Saída:** PRs pequenas, compatíveis entre si. **Aceite:** nenhuma alteração de paleta, envio real ou feature não relacionada; CI obrigatório aprovado no SHA revisado antes de merge futuro.
- [ ] **ES-49 — Validar publicação e rollback.** Na execução autorizada, coordenar dependências compatíveis, migration canônica se necessária, deploy explícito da edge e build do frontend; conferir os SHAs e a operação publicada. **Saída:** registro de versões e retorno ao estado anterior. **Aceite:** merge não conta como deploy de edge; smoke autenticado em leitura confirma empresa correta sem disparar e-mail ou editar o Singu.
- [ ] **ES-50 — Fechar somente com evidência completa.** Atualizar este checklist e o índice/evidência de Email com commits, testes, capturas e resultado do smoke. **Saída:** relatório com campos disponíveis, ausências reais e limitações. **Aceite:** ES-01–ES-49 cumpridas, seis campos homologados e nenhum bloqueio escondido; cadastro real vazio é estado válido, implementação ausente não é.

## Simulação prévia dos cenários críticos

Esta tabela é análise de cenários para orientar os testes futuros; não é resultado de testes executados.

| Cenário | Comportamento exigido | Etapas que impedem regressão |
|---|---|---|
| Empresa completa com os seis campos | Todos visíveis; ações abrem destinos reais; descrição pode expandir. | 11–12, 21–30, 45 |
| Empresa cliente e fornecedora | Dois tipos, preservando identidade e informações de ambas as relações. | 10, 27, 42 |
| Transportadora sem cadastro de cliente | Logo, site e redes independem de `customers`; Sobre ausente é explícito. | 03, 10, 12, 41 |
| Contato tem e-mail, mas não telefone | Resolver por vínculo/e-mail exato autorizado, ou informar ambiguidade; não abortar todo painel com 409. | 07–08, 14–16, 43 |
| E-mail pessoal ou domínio compartilhado | Nenhuma empresa inferida somente pelo domínio. | 08–09, 42 |
| Duas empresas para o mesmo contato | Escolha contextual sem reatribuir silenciosamente o vínculo persistido. | 10, 19, 30 |
| Última mensagem foi enviada por nós | Contato/empresa continuam sendo o interlocutor correto. | 09, 44 |
| Pessoa e empresa têm LinkedIn diferentes | Ação empresarial aponta para a empresa. | 11, 23, 42 |
| Atendente sem permissão empresarial | Estado explícito; servidor nega leitura; e-mail permanece utilizável. | 04, 14, 18, 43 |
| CRM retorna lentamente depois de trocar thread/conta | Resposta antiga ignorada; nenhuma informação de A aparece em B. | 17–19, 44 |
| CRM indisponível, descrição vazia e logo quebrada | Estados distintos; fallback da logo; sem texto de exemplo ou sucesso falso. | 18, 20, 26, 30 |
| Site malicioso ou falso domínio social | URL não clicável; nenhum HTML/script executado. | 25, 28, 42 |
| Mais de cinco conversas/anexos/notas | Amostra e total corretos, acesso ao restante funcional. | 32–35, 39 |
| Layout estreito, zoom e tema claro | Mesma estrutura e dados, ações acessíveis, cores globais preservadas. | 36–38, 45 |
| Front publicado e edge antiga | Detectar contrato incompatível; não declarar integração pronta. | 16, 43, 49 |

## Sequência de implementação para reduzir retrabalho

| Lote futuro | Etapas principais | Condição para avançar |
|---|---|---|
| A — Contrato comprovado | 01–15 | Seis fontes mapeadas, identidade e permissão definidas, dependências externas explícitas. |
| B — Leitura integrada | 16–20 + testes 41–43 pertinentes | Caminho real retorna DTO correto para atendente autorizado e contato sem telefone. |
| C — Empresa no painel | 21–30 + testes 44 pertinentes | Seis requisitos obrigatórios completos em fixture e tokens globais preservados. |
| D — Contexto e apresentação | 31–40 + testes 44–45 | Seções da referência funcionais em painel e drawer, sem perda de contexto. |
| E — Homologação e entrega | 46–50 | Evidência funcional, visual e da versão publicada, sem dependências disfarçadas. |

Os números organizam rastreabilidade, não exigem cinquenta PRs ou cinquenta execuções da suite global. Escrever os testes de cada comportamento junto do respectivo lote. Não começar o layout final com tipos e fontes ainda inventados. Se a confirmação do Singu estiver indisponível, avançar somente nos itens independentes com fixtures claramente identificadas; integração e conclusão permanecem pendentes.

### Regra de fechamento

Marcar uma etapa com `[x]` exige acrescentar evidência e SHA. Uma dependência bloqueada recebe motivo, responsável e critério de desbloqueio. Este plano substitui orientações anteriores **somente quanto ao sidebar do Email e à exclusão da paleta NAVY**; preserva os demais requisitos funcionais de mensagens e Gmail já existentes.

## Execução incremental e evidências

> Este registro não fecha etapas cujo aceite completo ainda depende de fixtures, homologação visual ou smoke autenticado. Ele torna explícito o que foi alterado e o que ainda falta, conforme a regra de fechamento.

### Lote 1 — identidade externa e contexto empresarial (03/10/2026)

- Commit: `4dcc5984` (`fix(email): resolve empresa por participante externo`). Publicação Edge: `crm-integration`, versão 539 ativa.
- ES-06: o DTO recebeu estados explícitos de ambiguidade, origem da resolução e validação runtime na fronteira do front; payload inválido passa a falhar de forma segura.
- ES-08/ES-09: para thread sem contato local, a Edge deriva o participante externo a partir das mensagens visíveis ao usuário. A busca no Singu é somente por e-mail completo normalizado; `+`, ponto, domínio e nomes não são reescritos/inferidos. Mais de um resultado gera `ambiguous`; domínio não é usado.
- ES-14/ES-16: continuam exigidos usuário autenticado, conta Gmail visível e thread pertencente à conta. `contactId` é opcional somente para o fluxo de e-mail; quando informado, ainda deve coincidir com a thread. A operação permanece somente leitura e não grava no Singu.
- ES-18/ES-19/ES-20: interface diferencia ambiguidade, indisponibilidade de integração, falha e acesso negado; painel é remontado na troca de conta/thread/contato e cache de notas passa a incluir usuário. Exibe separadamente “Atualizado no CRM” e “Consultado em”.
- ES-26/ES-32/ES-33: logo passa pela normalização HTTP(S); anexos exibem data quando disponível; conversas relacionadas exibem data e estado.
- Verificações: `bun run build`; lint dos arquivos alterados; Vitest focado (5 arquivos, 38 testes); `deno check` e `deno test` da Edge (6 testes); smoke público da função com OPTIONS permitido, origem não correspondente e POST anônimo 401.
- Pendências que impedem `[x]`: resolver/UX de seleção para múltiplas empresas, fluxos autorizados de vincular/abrir CRM, matriz de permissões com atendente real, fixtures integrais, Playwright responsivo/acessível e smoke autenticado de uma empresa conhecida.

## Matriz final do contrato empresarial — OTH-013

Fecha a documentação do achado OTH-013 (`docs/reconciliation/FINDINGS.json`). Cada linha liga um campo ou cenário à origem autorizada no CRM externo (Singu), ao contrato TypeScript, ao arquivo de implementação, ao teste local/sintético e à evidência versionada. A coluna **Estado** usa a taxonomia de `docs/reconciliation/STATUS_TAXONOMY.md`.

### Estado da prova (legenda)

Diferenciação obrigatória entre as três provas — nenhuma substitui a seguinte:

- **contrato TS** — declaração de tipo + guarda de runtime em `src/types/emailContactContext.ts`. Prova apenas a forma local; não prova disponibilidade no Singu.
- **teste local** — Vitest (front) ou `deno test` (edge) sobre dados sintéticos. Não acessa o Singu nem produção.
- **publicado** — só quando existe registro de versão da edge ou migration aplicada **posterior** ao último commit de código. Nesta cópia a publicação não é verificável (regra R1) e permanece **pendência nominal**.

Ao pé desta seção estão as pendências nominais: ausência de prova de produção **nunca** equivale a aprovação.

### Campos (seis exigidos)

| Campo | Origem autorizada no Singu | Contrato TS | Implementação | Teste local/sintético | Evidência versionada | Estado |
|---|---|---|---|---|---|---|
| Site | `companies.website` — `supabase/functions/crm-integration/index.ts` (readEmailCompanyContext, select de `companies`) | `EmailCompanyContext.website` | `src/components/email/EmailContactPanel.tsx` (CompanyLink "Site") + `src/lib/emailCompanyLinks.ts` (`normalizeExternalUrl`) | `src/lib/__tests__/emailCompanyLinks.test.ts`; `src/components/email/__tests__/EmailContactPanel.test.tsx` ("renders only the safe company fields") | `c6c793f9c` (#1812), `77210533e` (#1846) | comprovado local |
| LinkedIn empresarial | `company_social_media` plataforma `linkedin`, `is_active` — `index.ts` (readEmailCompanyContext) | `EmailCompanySocial.platform` = `linkedin` | `EmailContactPanel.tsx` (CompanyLink "LinkedIn") + `emailCompanyLinks.ts` (`companySocialLinks`) | `supabase/functions/crm-integration/index.test.ts` ("projects only social networks accepted by the Email company contract"); `emailCompanyLinks.test.ts`; `EmailContactPanel.test.tsx` | `c6c793f9c`, `77210533e` | comprovado local |
| Instagram empresarial | `company_social_media` plataforma `instagram`, `is_active` — `index.ts` (readEmailCompanyContext) | `EmailCompanySocial.platform` = `instagram` | `EmailContactPanel.tsx` (CompanyLink "Instagram") | idem LinkedIn | idem LinkedIn | comprovado local |
| Sobre | descrição: `customers.sobre` por `company_id` (`aboutKnown` = sucesso da leitura); identidade: `companies.nome_fantasia` → `nome_crm` → `razao_social` — `index.ts` (readEmailCompanyContext) | `EmailCompanyContext.about`, `aboutKnown`, `name`, `legalName` | `EmailContactPanel.tsx` (`CompanyDescription` expansível "Ver mais/Ver menos" + cabeçalho da empresa) | `EmailContactPanel.test.tsx` (about "Descrição empresarial") | `c6c793f9c`, `77210533e` | comprovado local para cliente; fornecedor/transportadora sem descrição = estado vazio explícito; o significado de `customers.sobre` no Singu é pendência nominal (ES-03) |
| Logo | `companies.logo_url` — `index.ts` (readEmailCompanyContext) | `EmailCompanyContext.logoUrl` | `src/components/contacts/CompanyLogo.tsx` (imagem + fallback iniciais/ícone no `onError`) + `emailCompanyLinks.ts` | `EmailContactPanel.test.tsx` (logoUrl nulo → fallback; sem favicon por domínio) | `c6c793f9c`, `77210533e` | comprovado local (imagem + fallback) |
| Tipos de relacionamento | `customers`, `suppliers`, `carriers` por `company_id` — `index.ts` (readEmailCompanyContext, bloco de relações) | `EmailCompanyRelationship` (`cliente`/`fornecedor`/`transportadora`) + `relationshipsKnown` | `EmailContactPanel.tsx` (badges `relationshipLabels`) | `EmailContactPanel.test.tsx` (Cliente + Fornecedor simultâneos); `src/types/__tests__/emailContactContext.test.ts` (rejeita tipo fora do contrato) | `c6c793f9c`, `77210533e` | comprovado local para cliente + fornecedor; transportadora isolada coberta por código e tipo, sem teste dedicado = pendência nominal |

### Cenários críticos

| Cenário | Comportamento autorizado | Prova local/sintética | Estado |
|---|---|---|---|
| Atendente autorizado | A permissão nomeada `crm.email_contact_link.manage` (apenas admin/supervisor) libera "Vincular empresa"; a leitura fica limitada ao vínculo/aba visível ao usuário, nunca a uma consulta genérica de CRM | `supabase/migrations/20261003160000_add_email_crm_link_permission.sql`; `index.ts` (`canManageEmailContactLink`, gate 403 em linkEmailContactCompany); `EmailContactPanel.test.tsx` ("informs an authorized user when the explicit company link fails") | contrato e migration comprovados localmente; aceite com atendente real = pendência nominal |
| Atendente negado | A implementação tem ramo 403 quando falta `crm.email_contact_link.manage` e ramos 404 quando thread, conta ou contato não são visíveis; `canLink=false` não oferece vínculo, e o e-mail continua utilizável | `index.ts` (`linkEmailContactCompany`, ramos 403/404); `useEmailContactContext.test.tsx` ("mapeia o kill switch e a negação de visibilidade sem expor fallback") prova o estado seguro do hook; `index.test.ts` (matriz de permissões, 5 casos: 403 sem a permissão nomeada mesmo com thread/conta/contato visíveis e sem ler o objeto protegido, 404 por thread fora da conta informada e por contato não visível, 403 que não vira 404 para thread inexistente) dirige o handler real e exerce os status HTTP | status HTTP 403/404 comprovados localmente com atendente sintético na fronteira do servidor; aceite com atendente real (Singu vivo/edge publicada) = pendência nominal |
| Contato somente com e-mail | Sem telefone, resolve por e-mail exato normalizado (`resolution` = `email_exact`); zero resultado → `not_linked`; mais de um → `ambiguous` bounded; domínio nunca infere empresa | `index.ts` (`findExactEmailCandidates`, ramo `!stableLink && participantEmail`); `index.test.ts` ("escapes SQL pattern characters before exact insensitive email lookup"); `emailContactContext.test.ts`; `src/hooks/crm/__tests__/useEmailContactContext.test.tsx` | comprovado local (contrato + unidade + hook); sem prova contra o Singu vivo = pendência nominal |
| Escolha entre múltiplas empresas | `candidates` (2 a 3) com escolha explícita `selectedExternalContactId`; seleção inválida → 409; ambiguidade nunca vira empresa A silenciosa | `index.ts` (ramo `candidates.length > 1` e validação de `selectedExternalContactId`); `emailContactContext.test.ts`; `useEmailContactContext.test.tsx` ("consulta o contexto com a identidade da thread e a escolha explícita") | contrato e fronteira comprovados; UX completa de seleção = pendência nominal (ver Lote 1) |

### Migration e edge — versionado versus publicado

| Objeto | Origem versionada | Prova local | Estado publicado |
|---|---|---|---|
| Migration de vínculo manual | `supabase/migrations/20261003151520_add_manual_email_crm_link_guard.sql` (RPC `link_email_crm_contact_guarded`, executável só por `service_role`) | `db:guard` (`scripts/db-audit/check-migration-drift.mjs`) e testes de fronteira RLS | não verificável nesta cópia (R1): pendência nominal |
| Migration de permissão | `supabase/migrations/20261003160000_add_email_crm_link_permission.sql` (`crm.email_contact_link.manage` → admin/supervisor) | idem vínculo manual | pendência nominal |
| Edge `crm-integration` | `supabase/functions/crm-integration/index.ts`; últimos commits `2dab15912` (#1636), `77210533e` (#1846), `ccd0f0d8d` (#1855) | `deno test` (13 testes) e `scripts/ci/crm-integration-contract.unit.mjs` | versão publicada sem registro posterior a esses commits = pendência nominal |

### Pendências nominais (não são aprovação)

1. Aceite do contrato empresarial contra o **Singu vivo** (leitura autorizada) — bloqueio externo, ES-03.
2. **Smoke autenticado** de uma empresa conhecida, após deploy — ES-49.
3. **Publicação da edge** e **aplicação das migrations** no projeto canônico, com SHA posterior ao código — ES-49.
4. **Matriz de permissões com atendente real** — ES-04: os status HTTP 403/404 já são exercidos localmente com atendente sintético (`supabase/functions/crm-integration/index.test.ts`); o aceite com atendente real (Singu vivo/edge publicada) segue pendência nominal. **Playwright/responsivo/acessibilidade** do painel — ES-45 — tem spec ativa (`e2e/email-navy-visual.spec.ts`: matriz por viewport, axe, temas claro/escuro/alto contraste, teclado e 320 px) e aguarda a homologação visual com dados reais.

Comando determinístico de consistência desta matriz (falha se a seção, os seis campos, os quatro cenários ou um caminho citado estiverem ausentes, se OTH-013 tiver chaves duplicadas/ausentes ou se o cenário negado alegar prova inexistente): `python3 scripts/ci/matriz-oth013-validar.py docs/design/PLANO_EMAIL_SIDEBAR_CONTATO_50_ETAPAS_2026-10-03.md`.
