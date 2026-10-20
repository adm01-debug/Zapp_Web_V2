# Plano de implementação Email NAVY em 100 etapas

> **Decisão vigente — 03/10/2026:** a imagem de Email é referência de estrutura e conteúdo, **exceto as cores**, que devem seguir o tema global do ZAPP (correção #1793). Para o sidebar de contato/empresa e a integração Singu, seguir o [plano específico de 50 etapas](./PLANO_EMAIL_SIDEBAR_CONTATO_50_ETAPAS_2026-10-03.md). As orientações NAVY deste documento são históricas; os demais requisitos funcionais permanecem aplicáveis.

> **Atualização de 02/10/2026:** este documento registrou o gate documental original. O usuário autorizou a implementação em solicitação posterior. O estado executado, os resultados reais, os critérios parciais e os bloqueios do backend canônico estão em [EMAIL_NAVY_IMPLEMENTATION_EVIDENCE_2026-10-02.md](./EMAIL_NAVY_IMPLEMENTATION_EVIDENCE_2026-10-02.md). As expressões “não autorizada” e “planejada” abaixo devem ser lidas como histórico do pedido original, não como o estado atual da branch de implementação.

## Escopo e autorização

Este documento planeja o redesign do módulo Email do ZAPP na rota existente `?view=email-chat`, combinando fidelidade à referência azul-marinho com integridade de mensagens, anexos, destinatários, rascunhos e isolamento de contas.

**Esta entrega é exclusivamente documental. A implementação ainda não está autorizada por esta solicitação.** O pedido expresso “APENAS CRIE O PLANO E COMITE NO REPOSITÓRIO — AINDA NÃO EXECUTE” prevalece sobre as instruções de execução transcritas no pacote. Não foram alterados componentes, serviços, testes, migrations, configurações, permissões ou dados. Não foram enviados e-mails, executados testes do aplicativo, aplicados DDL, feitos deploys ou merges.

As 100 etapas EN-001 a EN-100 estão **PLANEJADAS, NÃO EXECUTADAS**. Os 80 critérios de aceite estão **PENDENTES**. Leitura de código para preparar este plano não equivale ao fechamento de uma etapa futura. Não existe plano infalível: a redução de risco depende dos testes negativos, decisões explícitas e gates abaixo, sem mascarar limitações com uma nota “10/10”.

Após autorização de implementação, o executor deverá trabalhar no código real, preservar autenticação e consumidores compartilhados, produzir evidências e entregar alterações revisáveis. Mesmo nessa execução futura, permanecem proibidos envio real, DDL aplicado, deploy e merge de produção sem autorização própria. Testes de banco que precisem criar estruturas também dependem de autorização específica: enquanto DDL estiver vedado, usar mocks/contratos e registrar a validação SQL comportamental como pendente.

## Baseline e fontes

### Revisões verificadas em 2 de outubro de 2026

| Item | Evidência desta preparação |
|---|---|
| Repositório | `adm01-debug/Zapp_Web_V2` |
| Snapshot da auditoria fornecida | `c82c0995dbdc30b316a7e88c979ea8fb5fa55969` |
| Base remota da inspeção inicial | `024c644e1dd638d5016b1ae36409a8b93821fe6f` |
| Revalidação anterior ao commit documental | Base avançou durante o trabalho; branch documental atualizada por fast-forward para `3fce66a5925eaf1e69333ea42c7510e195bf636b` e diferenças novamente inspecionadas. |
| Checkout original preservado | `main` em `b22b91f8f5912f280d884b691b696881183e9cfb`; estava 263 commits atrás da referência remota |
| Branch documental | `codex/docs-email-navy-plan-100-20261002`, criada da base remota e atualizada apenas na sua própria worktree separada fora de `/tmp`; checkout original intocado |
| Diferenças após o snapshot | Cinco commits até a revalidação: Multiplix `1b5d0144a`, Catálogo `024c644e1`, documentação Contatos `ce4e918d5`, E2E `e4f6b6a85`, correlação do worker IA `3fce66a59`; 21 arquivos. Nenhum arquivo funcional Email/Gmail examinado foi alterado. |
| Correção posterior aproveitável no QA | `e4f6b6a85` fez o webServer Playwright derivar a porta de `PLAYWRIGHT_BASE_URL` e adicionou tratamento de onboarding nos specs afetados. Reaproveitar essa infraestrutura; ainda é necessário projeto Email dedicado e isolamento de rede. |
| Correções posteriores no produto Email | **Nenhuma identificada no intervalo acima.** Não presumir que comentários `FIX E…` ou mudanças de QA/outros módulos resolveram os achados funcionais. Repetir a comparação no início da execução. |
| Concorrência | Consulta de até 100 PRs abertas não encontrou títulos/branches contendo Email/Gmail/NAVY. Isso não exclui sobreposição dentro de PRs com outros nomes nem trabalho local não publicado. |
| Instruções | `AGENTS.md`, `CLAUDE.md`, baseline `.codex/AGENTS.md` e convenções locais lidos; instruções atualizadas da base remota comparadas com o checkout original. |
| Grafo | `graphify-out/graph.json` não estava disponível na worktree de planejamento. Relações verificadas por imports, buscas e leitura direta; nenhum grafo novo gerado. |
| Limite probatório | Inspeção estática e comparação Git. Não é certificação do banco vivo, da versão de Edge Functions publicada ou do comportamento autenticado em produção. |

Os três documentos foram lidos integralmente no diretório de projetos fornecido pelo usuário. Para rastreabilidade sem duplicar a especificação inteira, ficam registrados seus hashes SHA-256:

| Documento fornecido | SHA-256 |
|---|---|
| `01_PROMPT_CODEX_EMAIL_NAVY.md` | `4e813e610cb742dd107f28af3e087a4e6e1217b00ef80cb14c4bafaeea4511ea` |
| `02_AUDITORIA_REPOSITORIO.md` | `5a63d90103c2c29ddc981f5fbee36f35eda1c9a5cad55da35a91d28185d20331` |
| `03_CRITERIOS_DE_ACEITE.md` | `cec126c7fbaf7f933b05527fdca311645290bd06aad07227d1cf180d1dcb6cda` |

Antes de executar em outra máquina, disponibilizar esses documentos no workspace e conferir os hashes. Este plano contém a decomposição executável e a rastreabilidade dos 36 achados e 80 critérios, mas não transforma arquivos locais externos ao Git em fontes já publicadas.

### Referências visuais e limitação conhecida

A imagem NAVY de Email anexada à solicitação foi inspecionada: barra de busca superior, título Email com ícone azul e subtítulo, lista com tabs e filtros, conversa com cabeçalho e compositor integrado, contexto lateral. As capturas cinza/preto do aplicativo representam o **antes**, não a direção visual.

O arquivo de nome exato `referencias/01_EMAIL_DIRECAO_VISUAL.png` **não foi localizado** na busca realizada no workspace, anexos locais e diretórios pertinentes de referências. Portanto, não há hash nem medição de pixels desse arquivo nesta entrega. O usuário foi consultado sobre o caminho/PNG original. Isso não impede planejar, mas bloqueia o aceite visual definitivo AC-002 até obter, abrir e identificar o original aprovado. Não recriar a imagem, renomear outra para simular sua presença ou substituir por HTML.

Foram abertas as seguintes referências já versionadas, equivalentes às direções de Campanhas/Segmentos solicitadas; não se afirma que vieram do diretório ausente do novo pacote:

- [Campanhas, visão geral](../talkx/references/01_Campanhas_Visao_Geral.png).
- [Segmentos, biblioteca e detalhes](../talkx/references/02_Segmentos_Biblioteca_Detalhes.png).
- [Segmentos, criação e edição](../talkx/references/03_Segmentos_Criar_Editar.png).

Elas orientam contornos discretos, superfícies NAVY, densidade, tabs e rail. Não autorizam importar regras de Campanhas, trocar todas as cores do sistema ou usar dados ilustrativos. `zapp-email-redesign.html`, `zapp-email-desktop.png` e o primeiro protótipo cinza estão explicitamente excluídos.

### Mapa de arquivos e consumidores

Os identificadores abaixo são usados nas etapas. Os links relativos apontam para a árvore do repositório; a base de evidência é o SHA fixado acima, não uma promessa sobre futuras versões.

| Área | Arquivos e contratos a preservar |
|---|---|
| A — Entrada e shell | [lazyViews](../../src/pages/lazyViews.ts), [ViewRouter](../../src/pages/ViewRouter.tsx), [AppShell](../../src/components/layout/AppShell.tsx), [ViewContainer](../../src/components/layout/ViewContainer.tsx), [VoiceCopilotFAB](../../src/components/layout/VoiceCopilotFAB.tsx), [navegação](../../src/services/navigation.service.ts) |
| B — Workspace e lista | [EmailChatInbox](../../src/components/email/EmailChatInbox.tsx), [EmailThreadList](../../src/components/email/EmailThreadList.tsx) |
| C — Conversa | [EmailChatThread](../../src/components/email/EmailChatThread.tsx), [EmailChatBubble](../../src/components/email/EmailChatBubble.tsx), [EmailFullViewDialog](../../src/components/email/EmailFullViewDialog.tsx) |
| D — Composição | [EmailChatReplyBar](../../src/components/email/EmailChatReplyBar.tsx), [EmailComposer](../../src/components/gmail/EmailComposer.tsx) |
| E — Dados e transporte | [useGmail](../../src/hooks/integrations/useGmail.ts), [gmailApi](../../src/hooks/gmail/gmailApi.ts), [gmailTypes](../../src/hooks/gmail/gmailTypes.ts) |
| F — Contexto | [EmailContactPanel](../../src/components/email/EmailContactPanel.tsx), [useContactNotes](../../src/hooks/crm/useContactNotes.ts), [contact.service](../../src/services/contact.service.ts) |
| G — Edge Functions | [gmail-send](../../supabase/functions/gmail-send/index.ts), [gmail-sync](../../supabase/functions/gmail-sync/index.ts), [gmail-helpers](../../supabase/functions/_shared/gmail-helpers.ts), [schemas](../../supabase/functions/_shared/schemas.ts) |
| H — Segurança HTML | [emailHtml](../../src/lib/emailHtml.ts), [testes do sanitizador](../../src/lib/__tests__/emailHtml.test.ts), testes de bypass em `src/components/email/__tests__/` |
| I — Banco versionado | [catálogo](../../supabase/schema-catalog.json), [tipos gerados](../../src/integrations/supabase/types.ts), [criação de anexos](../../supabase/migrations/20260827210200_email_attachments_table.sql), [chave composta de anexos](../../supabase/migrations/20260828220100_email_attachments_unique_msg_att.sql) |
| J — Consumidores compartilhados | [GmailInboxView](../../src/components/gmail/GmailInboxView.tsx), [EmailThreadView](../../src/components/gmail/EmailThreadView.tsx), [OmnichannelInbox](../../src/components/omnichannel/OmnichannelInbox.tsx) |
| K — Visual | [tokens](../../src/styles/tokens.css), [components](../../src/styles/components.css), [diversity-overrides](../../src/styles/diversity-overrides.css), [talkxShared](../../src/components/talkx/talkxShared.tsx), [DashboardCard](../../src/components/dashboard/overview/DashboardCard.tsx) |
| L — QA | [package.json](../../package.json), [Playwright](../../playwright.config.ts), [testes Email](../../src/components/email/__tests__), [testes Gmail](../../src/components/gmail/__tests__), [contratos Vitest](../../vitest.contracts.config.ts) |

Fluxo atual: `ViewRouter → EmailChatInbox → lista / thread / contexto / EmailComposer → useGmail → callGmailFunction → gmail-send ou gmail-sync`. O legado Gmail compartilha hook/compositor; Omnichannel monta `EmailChatInbox`. Alterar apenas a rota standalone sem testar esses consumidores é entrega incompleta.

### Matriz inicial de reaproveitamento

“Existente” significa observado em código, não homologado em produção. “Corrigir” e “novo” significam trabalho futuro.

| Capacidade | Classificação inicial | Decisão |
|---|---|---|
| Rota, guards, Sidebar, MobileShell, OAuth e transporte autenticado | Reaproveitar | Manter rota/contratos; não abrir rota pública nem copiar tokens. |
| Threads, mensagens, conta e queries | Reaproveitar e corrigir | Escopo compartilhado, seleção por ID, paginação, erros e completude. |
| MIME e suporte de envio/download de anexos | Reaproveitar e corrigir | Corrigir integração e validação; não construir outro serviço Gmail. |
| `email_attachments` e chave composta | Reaproveitar | Metadados existentes; binários ficam no Gmail. Não criar bucket/coluna fictícia. |
| `message_id_header` | Reaproveitar e corrigir | Existe no tipo gerado/backend; ajustar tipo manual e remover fallback de ID incorreto. |
| DOMPurify isolado e leitor em sandbox | Reaproveitar | Preservar hardening; leitura completa e privacidade são camadas adicionais. |
| Notas de contato | Reaproveitar | Usar `useContactNotes` com contato autorizado; não criar `email_notes`. |
| Tema, shell interno NAVY, cards de arquivo, composer core | Novo sobre a base existente | Componentizar sem trocar defaults de componentes globais. Nomes novos abaixo são propostas, não arquivos existentes. |
| Editor rico, drafts update/delete, reconciliação robusta de envio | Parcial ou novo | Toolbar/create-draft não comprovam feature completa. Exigir contrato e teste. |
| Selo empresarial e leitura pelo destinatário | Sem contrato demonstrado | Não implementar como decoração. `contact_id` e `is_read` não provam esses fatos. |
| PNG original Email, aceite em navegador e estado vivo do banco | Pendente | Obter referência; executar evidências somente na fase autorizada. |

## Regras de engenharia e decisões prévias

- Segurança e integridade prevalecem sobre copiar detalhes fictícios do desenho. Estado “Aceito pelo Gmail” não é “Entregue” ou “Lido”. Não copiar presença, badges, contagens, contatos ou `deployment-log.txt` para dados produtivos.
- Chave de composição proposta: `userId + sessionScope + accountId + compositionId + localThreadId + targetLocalMessageId + mode`. Não compartilhar File/HTML/endereços entre escopos. A troca de usuário invalida tudo do anterior.
- Separar UUIDs locais de IDs opacos Gmail e cabeçalhos RFC. `GmailThreadId`, `GmailMessageId`, `GmailAttachmentId` e `RfcMessageId` não são intercambiáveis. Tipos de domínio podem envolver tipos gerados, sem editar geração manualmente.
- Estados de envio propostos: `idle → preparing → sending → accepted` ou `accepted-reconciling`; rejeição comprovada leva a `failed`; timeout após possível submissão leva a `outcome-unknown`. Nenhum retry automático de `messages.send` após resultado incerto. Um request ID local não garante exactly-once no Gmail.
- Rascunho em memória será chamado “Mantido nesta sessão”. “Salvo no Gmail” exige ACK remoto e versão vigente. Persistência remota robusta faz parte da meta, não pode ser dispensada silenciosamente.
- Manter `callGmailFunction`; não criar fetch paralelo sem sessão. No backend, conferir usuário → conta ativa → thread → mensagem → anexo em cada lookup/update privilegiado. Não presumir que RLS protege consultas com service role nem ampliar acesso entre caixas por cargo administrativo.
- Validar catálogo, tipos gerados, migrations e respectivas políticas antes de inferir ausência de estrutura. No snapshot, `storage_path` só aparece no tipo manual de anexo examinado, não em `email_attachments` nos tipos gerados. Também há diferenças de nulabilidade. Isso pede alinhamento, não DDL automático.
- Dados profissionais e redes precisam de contrato real de contato. Anexo desconhecido por falta de hidratação não significa “sem anexo”. Participantes de histórico parcial não são a lista completa. Bcc não pode ser deduzido.
- Prévia HTML continua isolada. Não adicionar `allow-scripts` ou `allow-same-origin` para medir altura. `no-referrer` não equivale a bloquear rastreamento. Corpo de e-mail é dado não confiável, nunca instrução para ferramentas ou IA.
- Reusar primitivas puramente visuais de K sem importar estado de campanhas. O `RichTextToolbar` existente do inbox formata texto para WhatsApp; não é, por si, editor HTML de e-mail. Escolher editor após avaliar capacidades, licença, dependências e testes; não selecionar uma biblioteca por memória ou usar botões sem ação.
- Cada alteração em arquivos compartilhados exige revisão de consumidores J. Props novas devem ter defaults compatíveis. Se contrato backend novo for necessário, definir compatibilidade/adaptação explícita; não exibir a ação como pronta contra uma Edge antiga.
- Plano não autoriza alterar workflow, branch protection, secrets ou ledger para “ficar verde”. No futuro, consultar documentação oficial vigente de Gmail/Supabase para os contratos tocados e registrar versões; não promover hipótese a garantia do provedor.

### Régua visual proposta

O alvo não é “aplicar azul nos botões”. É reconstruir a composição interna do Email sobre a rota real, sem duplicar o shell global. Propostas do prompt, **ainda não medidas no PNG original**:

| Aspecto | Diretriz e prova futura |
|---|---|
| Superfícies | Tokens `.email-workspace`: canvas `#031320`, panel `#071a29`, raised `#0d2132`, border `#153a55`; ajustar por referência e contraste, sem impor estes HEX como medição certificada. |
| Texto e seleção | Principal `#f4f8ff`, secundário `#b4c9df`, seleção `#08294d` com borda `#147bff`; estados também reconhecíveis sem cor. |
| Mensagens | Entrada `#0c2030`, saída `#07366a`; sem perder legibilidade ou criar recibos fictícios. |
| Grade | Lista proposta 360–420 px, contexto 300–340 px, conversa com cerca de 560 px mínimos. Somar gaps/paddings e largura real do shell antes de decidir três painéis. |
| Adaptação | Se a soma não couber, contexto em drawer; em celular, lista ou conversa. Não basear tudo em `xl`/viewport ignorando sidebar e embed. |
| Forma | Controles/cards com raios aproximados 10–12 px; painéis/balões 14–16 px; bordas discretas; destaque seletivo, sem glow universal. |
| Fontes | Usar famílias atuais do sistema e escala legível; não transplantar decisões de fonte de outro plano antigo de Contatos. |
| Escopo | Popovers/portals também recebem a variante local. Tema claro/alto contraste permanecem funcionais. Nada de reset global NAVY. |

## Execução futura em dez fases

Cada etapa terá registro de responsável, SHA, arquivos, teste/artefato, resultado e bloqueio. As dependências indicadas são mínimas; **o gate da fase anterior é obrigatório**. Uma etapa só fecha depois de implementar, testar e revisar seu aceite. “Já existe” permite reaproveitar, mas não pular sua validação. Os gates não são etapas adicionais.

### Fase 1 — Baseline e contratos

Áreas A–L. Objetivo: fixar a realidade antes de alterar o produto e montar testes que não tenham acesso mutável externo.

#### EN-001 — Revalidar base e isolamento do trabalho

- Entrega: conferir instruções, HEAD/local/remoto, worktrees, arquivos modificados e PRs concorrentes; criar branch de implementação a partir da base então vigente, sem trocar a branch de outra sessão.
- Aceite: registrar SHAs e sobreposições por arquivo; comparar novamente com `c82c0995…` e com a base deste plano. Nenhuma alteração alheia incorporada ou revertida. Dependência: autorização de implementação.

#### EN-002 — Fixar a referência visual correta

- Entrega: obter e abrir o PNG original Email NAVY, registrar hash/dimensão/proveniência, abrir as três referências de Campanhas/Segmentos e distinguir capturas atuais da proposta.
- Aceite: original identificável e disponível ao QA; não usar protótipo cinza ou HTML substituto. Se ausente, marcar o aceite visual bloqueado e não alegar fidelidade certificada. Dep.: EN-001.

#### EN-003 — Inventariar caminhos e contratos compartilhados

- Entrega: percorrer imports de A–L, incluindo standalone, Gmail legado, Omnichannel, OAuth, webhook/cron quando afetados; criar matriz reaproveitado/corrigir/novo/pendente por arquivo e consumidor.
- Aceite: toda alteração prevista tem proprietário e consumidores identificados; nenhum segundo inbox ou shell paralelo proposto. Dep.: EN-001.

#### EN-004 — Conferir modelo de dados e autorização

- Entrega: comparar I com E/G, incluindo IDs, nulabilidade, constraints, RLS/grants, `message_id_header`, vínculo de contato e escopo de anexos. Catalogar divergências sem executar SQL mutável.
- Aceite: dicionário de IDs e cadeia de autorização revisados; eventual necessidade de migration é hipótese documentada, não tabela duplicada ou aplicação automática. Dep.: EN-003.

#### EN-005 — Registrar contratos reais das ações Gmail

- Entrega: mapear schemas, entradas, respostas, erros e callers de send/reply/create-draft/labels/leitura/lixeira/sync/get-thread/get-attachment. Usar `GmailSendActionSchema`, não o schema genérico de outro serviço.
- Aceite: fixtures de contrato separam UUID, ID Gmail e Message-ID RFC; compatibilidade com versões de Zod frontend/Edge e consumidores compartilhados prevista. Dep.: EN-003, EN-004.

#### EN-006 — Resolver decisões que causariam retrabalho

- Entrega: registrar decisões de editor, representação HTML/texto, aliases, política de imagens, persistência/expiração de drafts, semântica de filtros/contagens e teto agregado de anexos. Preferir infraestrutura existente; indicar decisão dependente de autorização.
- Aceite: alternativas e critério de escolha explícitos, sem “implementar depois” oculto. Nenhum novo storage, ledger de envio ou campo CRM sem demonstrar necessidade. Dep.: EN-004, EN-005.

#### EN-007 — Preparar ambiente isolado e fixtures sintéticas

- Entrega: montar sessão/permissões de teste controladas, mockar Gmail/Supabase e negar chamadas externas não previstas, inclusive sync e mark-read automáticos na montagem. Bloquear também WebSocket, trackers e service workers que escapem das interceptações.
- Aceite: teste negativo comprova que chamada inesperada falha; contador de mutações externas reais permanece zero. Sem copiar sessão, caixa ou segredos de produção. Dep.: EN-005.

#### EN-008 — Reproduzir defeitos antes das correções

- Entrega: adicionar casos que falham pelo motivo esperado para anexos omitidos, alvo histórico, Reply-To, Cc duplicado, A→B→A, submissão dupla, aceite remoto com falha local e tentativa de acesso à conta B.
- Aceite: relatório fail-before identifica falha de negócio, não erro de fixture; incluir regressões que atravessem componentes reais, sem mocks eliminarem a ação testada. Dep.: EN-007.

#### EN-009 — Medir baseline funcional e visual

- Entrega: inventariar e executar as suítes pertinentes existentes no ambiente isolado; capturar a rota real antes da mudança, incluindo seleção, rail e composer. Registrar dívidas anteriores, volume, consultas e geometria.
- Aceite: comandos, quantidades coletadas, falhas e capturas com SHA; “não executado” separado de “aprovado”. Não atualizar snapshots para absorver defeitos. Dep.: EN-007.

#### EN-010 — Aprovar o gate de baseline

- Entrega: revisar EN-001–009, 36 achados e decisões abertas; congelar contratos mínimos e sequência de mudanças pequenas. Vincular cada risco crítico a teste negativo e fase responsável.
- Aceite: sandbox seguro e critérios mensuráveis; bloqueios de referência/ambiente explicitados. Não iniciar refatoração ampla com investigação fundamental pendente. Dep.: EN-001–009.

Gate G1: fixtures isoladas, defeitos reproduzidos ou classificados como não reproduzidos com evidência, contratos/impactos registrados. A falta do PNG não autoriza substituir a referência.

### Fase 2 — Correções de conteúdo e envio

Áreas C, D, E, G, I. Primeiro proteger conteúdo e destinatários; depois mudar apresentação.

#### EN-011 — Separar os identificadores e tipar os payloads

- Entrega: contratos de domínio distintos para conta/thread/mensagem/anexo locais, IDs Gmail e Message-ID RFC; incluir attachments tipados em reply e resolver divergências/nulabilidade do tipo manual.
- Aceite: remover cast de escape do ReplyBar; erro de família de ID detectável; tipos gerados não editados à mão. Dep.: G1, EN-004, EN-005.

#### EN-012 — Reforçar escopo de todas as operações tocadas

- Entrega: validar recursos contra usuário/conta ativa/thread antes de ler ou escrever com service role; qualificar consultas por conta, inclusive originalMsg, modify-labels e mark-read. Revisar autorização de download/metadata conjuntamente.
- Aceite: matriz A/B, outro usuário, conta desativada e ID inexistente nega operações sem revelar conteúdo; testes positivos da própria conta continuam válidos. Dep.: EN-011.

#### EN-013 — Implementar parser e validação de cabeçalhos

- Entrega: resolvedor compartilhado de endereços para nomes entre aspas/vírgulas/Unicode e listas; validar entradas e serialização de assunto, filename e MIME contra CR/LF/injeção.
- Aceite: corpus sintético cobre válido/inválido, erro por campo e round-trip sem destruir nomes, pontos ou plus addressing. Não deduplicar aliases por suposição. Dep.: EN-005, EN-011.

#### EN-014 — Corrigir Reply-To e os papéis To Cc Bcc

- Entrega: preferir Reply-To válido em inbound; resolver reply-all com To/Cc disjuntos, remover conta própria e apenas aliases confirmados; não reinserir Bcc automaticamente.
- Aceite: destinatários resultantes visíveis/editáveis e iguais ao payload; incluir outbound, múltiplos participantes e alias desconhecido. Dep.: EN-013.

#### EN-015 — Preservar alvo histórico de resposta

- Entrega: transportar a mensagem clicada de Bubble até o composer/Edge, em vez de apenas mudar o modo; mostrar banner com remetente/data do alvo e permitir cancelar a seleção conscientemente.
- Aceite: responder à primeira de três mensagens usa corpo/ID/destinatários/cabeçalhos da primeira, inclusive após nova mensagem chegar. Dep.: EN-011, EN-014.

#### EN-016 — Preservar alvo histórico de encaminhamento

- Entrega: fazer `forwardMsg` efetivamente alimentar a composição; remover uso indevido de `lastMessage` e fallback de Gmail message para thread; preparar seleção de anexos originais.
- Aceite: encaminhar a segunda de três mensagens inclui sua origem e conteúdo, não a terceira. A integração dos binários selecionados será completada em EN-059. Dep.: EN-011, EN-015.

#### EN-017 — Incluir anexos reais nos dois caminhos de envio

- Entrega: compartilhar preparação de anexos entre novo composer e resposta, enviando os arquivos explicitamente em send/reply; alinhar MIME multipart e falhas de leitura.
- Aceite: duas fixtures binárias chegam com hash correto ao provedor mockado; falha de um arquivo impede envio incompleto silencioso. Limites finais serão consolidados em EN-065. Dep.: EN-011, EN-013.

#### EN-018 — Impedir submissão duplicada e payload mutável

- Entrega: trava síncrona no início de `preparing`, antes de FileReader/promessas, com snapshot imutável de conta/composição/alvo/destinatários/corpo/arquivos. Enter cria linha; Cmd/Ctrl+Enter envia por padrão.
- Aceite: double-click, key repeat, IME e serialização atrasada geram uma chamada; alterações posteriores pertencem à próxima versão do draft, não ao envio em curso. Dep.: EN-015–017.

#### EN-019 — Corrigir cabeçalhos RFC e precondições do envio

- Entrega: buscar Message-ID/References autorizados do alvo se ausentes; impedir fabricação de `<gmail_id>`. Validar associação da thread local antes de enviar, sem confundir encaminhamento com resposta.
- Aceite: MIME decodificado contém referências corretas, famílias de IDs distintas e encoding coerente; falta de metadados necessária gera recuperação explícita, não header fictício. Dep.: EN-012–016.

#### EN-020 — Separar aceite remoto e reconciliação local

- Entrega: modelar rejeição comprovada, aceite, aceite com persistência pendente e resultado desconhecido; checar erros de inserts/upserts; reconciliar pelos IDs reais sem reenviar automaticamente.
- Aceite: aceite Gmail + falha local não retorna orientação falsa de reenviar; timeout não inicia retry de send. UI recebe estados compatíveis e guarda a composição correta. Dep.: EN-017–019.

Gate G2: regressões de integridade passam, MIME/bytes e destinatários provados, isolamento negativo passa; nenhuma promessa de exactly-once ou leitura pelo destinatário.

### Fase 3 — Estado e consultas

Áreas B, E, G, I, J. Fazer o estado seguir a conta e a composição, não o ciclo incidental de montagem.

#### EN-021 — Centralizar a conta ativa

- Entrega: fonte única de conta para workspace, thread, composer, labels e ações; substituir escolhas independentes de `accounts[0]` sem romper consumidores legados.
- Aceite: troca de conta invalida seleção/requisições do escopo anterior; conta inválida não cai silenciosamente na primeira. Dep.: G2.

#### EN-022 — Corrigir chaves de cache e estados de consulta

- Entrega: incluir identidade de usuário/sessão/conta/recurso/filtros nas queries relevantes; expor loading/error/refetch/partial e cancelamento, sem confundir erro com lista vazia.
- Aceite: resposta lenta da conta A após abrir B não aparece em B; logout limpa caches sensíveis e assinaturas. Dep.: EN-021.

#### EN-023 — Selecionar thread por ID atualizado

- Entrega: guardar ID local selecionado, resolver objeto atual do cache e buscar detalhe autorizado se fora da página; evitar copiar o objeto inteiro para state persistente.
- Aceite: unread/star/count/labels atualizados refletem no header e rail; remoção/permissão revogada tem estado próprio. Dep.: EN-022.

#### EN-024 — Isolar estado de composição por identidade

- Entrega: store por usuário/sessão/conta/composição/thread/alvo/modo; manter texto e arquivos de A ao visitar B; vincular callbacks à versão submetida.
- Aceite: A→B→A preserva A sem contaminar B; conclusão de envio A não limpa B nem nova edição de A. Persistência remota permanece trabalho de EN-068. Dep.: EN-018, EN-021–023.

#### EN-025 — Paginar e filtrar no servidor com ordem estável

- Entrega: remover `.limit(100)` como universo completo; consulta com cursor `last_message_at + id`, tamanho limitado e filtros de conta/pasta/estado no servidor; projetar índice/RPC só se necessário.
- Aceite: timestamps empatados sem duplicação/perda em dataset estável; mudanças concorrentes têm política de refresh/deduplicação documentada. Não inventar SQL aplicado. Dep.: EN-004, EN-022.

#### EN-026 — Buscar remetentes além da primeira página

- Entrega: busca normalizada por nome/endereço de remetente, contato, assunto e snippet no universo declarado; debounce, parâmetros seguros e descarte de respostas antigas.
- Aceite: alvo sem CRM após a centésima thread é encontrado; consulta A lenta não substitui B. Não prometer busca em corpo/binário de anexos sem contrato. Dep.: EN-025.

#### EN-027 — Construir filtro verdadeiro de anexos

- Entrega: agregação de existência por mensagens/metadados autorizados com completude explícita; aplicar antes da paginação, não apenas sobre a página visível. Eliminar `HAS_ATTACHMENT` como pseudo-label.
- Aceite: com/sem/desconhecido diferenciados; thread não hidratada não se torna falso negativo. Consulta não dispara download nem N+1 por linha. Dep.: EN-025.

#### EN-028 — Definir contagens coerentes

- Entrega: contagens de threads por universo de conta/pasta/filtros com origem/completude; separar contadores de mensagens e labels Gmail dos totais de conversas.
- Aceite: fixture com várias mensagens por thread não infla badge; desconhecido não vira zero, página não vira total global e filtros combinados mantêm coerência. Dep.: EN-025–027.

#### EN-029 — Separar paginação local de histórico Gmail

- Entrega: contrato de continuação provider `pageToken/nextPageToken` limitado/cancelável e hidratação sob demanda via get-thread com reconciliação comum; estados de histórico parcial e trabalho em andamento.
- Aceite: pedir outra página local não afirma carregar Gmail completo; retorno bruto do provider não é tratado como persistido. Validar tratamento de cursor inválido e conta trocada. Dep.: EN-005, EN-012, EN-022.

#### EN-030 — Integrar navegação e URL sem perder drafts

- Entrega: parâmetros de Email namespaced, preservando `?view`, query alheia e histórico; restaurar thread/filtro e lista/scroll quando possível, sem pôr corpo/destinatários privados na URL.
- Aceite: back/forward/reload/link direto conservam contexto autorizado; draft obedece à política de sessão/persistência e não troca de conta implícita. Dep.: EN-023–029.

Gate G3: conta única, consultas sem vazamento, resultados/contagens com universo explícito e drafts isolados. Dependência de banco não implementada mantém a respectiva capacidade pendente.

### Fase 4 — Fundação visual NAVY

Áreas A, B, K. Obter a estrutura visual cedo, antes de polir cem detalhes sobre uma composição errada.

#### EN-031 — Criar tokens locais do workspace

- Entrega: superfícies, bordas, textos, seleção, entrada/saída e estados dentro de `.email-workspace`, reutilizando accent/fontes reais; revisar overrides e skins salvos que possam prevalecer.
- Aceite: computed styles da rota mostram NAVY proposto, sem mudar defaults globais ou quebrar Chat/Campanhas/Contatos. Dep.: G3, EN-002.

#### EN-032 — Propagar tema para overlays

- Entrega: aplicar variante de Email a menus, popovers, dialogs e drawer em portal, incluindo claro/alto contraste e focus states.
- Aceite: overlay não volta ao cinza por herança perdida nem altera outro módulo após fechar; contrastes medidos posteriormente em EN-089. Dep.: EN-031.

#### EN-033 — Montar cabeçalho de workspace funcional

- Entrega: busca, ícone/título/subtítulo, Ajuda e Nova mensagem no componente real; reaproveitar ações globais existentes só quando houver integração. Criar workbar local se o AppShell continuar sem o header da referência.
- Aceite: uma Sidebar, um cabeçalho apropriado ao contexto; nada de IA/calendário/presença decorativos. Dep.: EN-003, EN-031.

#### EN-034 — Implementar grade pela largura útil

- Entrega: grade lista/conversa/contexto baseada no contêiner; calcular mínimos de colunas, gaps e padding com sidebar expandida/recolhida. Se usar resizable-panels, configurar limites, teclado e preferência segura.
- Aceite: conversa utilizável, sem compressão forçada ou overflow de página; medir em 1672×941 e 1366×768. Dep.: EN-031, EN-033.

#### EN-035 — Criar contexto adaptativo real

- Entrega: rail inline quando couber, drawer quando não; botão Detalhes abre conteúdo visível em todas as larguras; prop de embed explícita e default compatível para Omnichannel.
- Aceite: abrir/fechar restaura foco e não perde thread/draft; nenhuma combinação com `hidden xl:block` torna o botão inócuo. Dep.: EN-032, EN-034.

#### EN-036 — Unificar tipografia e primitivas de Email

- Entrega: escala legível, espaçamentos, raios, bordas, ícones e alinhamentos de controles; extrair apenas repetição real, preservando variantes/defaults compartilhados.
- Aceite: assuntos, timestamps e ações essenciais legíveis; sem reduzir texto essencial a 9 px para caber ou reinventar design system. Dep.: EN-031–035.

#### EN-037 — Distribuir altura e scroll dos painéis

- Entrega: `min-w-0/min-h-0`, regiões de scroll independentes, header/composer visíveis, uso da altura disponível do shell em vez de `100vh` aninhado.
- Aceite: lista longa, rail longo e mensagem extensa não empurram Enviar para fora; sem barras horizontais na página. Dep.: EN-034–036.

#### EN-038 — Resolver colisão do FAB com o compositor

- Entrega: integração mínima com AppShell/VoiceCopilotFAB por slot, offset ou alternativa funcional, mantendo comportamento dos outros módulos.
- Aceite: Enviar, anexar, expandir e Fechar não ficam sob o FAB com rail aberto/fechado; voz continua acessível e teclado não fica preso. Dep.: EN-037.

#### EN-039 — Ajustar mobile safe areas e zoom

- Entrega: lista ou conversa em celular, controles touch, teclado virtual e áreas seguras, sem duplicar barras do MobileShell; definir comportamento a 320 px e zoom 200%.
- Aceite: ações críticas alcançáveis sem hover ou scroll horizontal global; composer não fica encoberto pelo teclado. Dep.: EN-035–038.

#### EN-040 — Validar a primeira composição NAVY

- Entrega: screenshot 1672×941 da rota autenticada com fixture, comparativo lado a lado com PNG aprovado e lista objetiva de diferenças de estrutura, paleta, densidade e hierarquia.
- Aceite: header/lista/timeline/rail reconhecíveis antes de polimento; sem aprovação se original ausente. Corrigir estrutura, não substituir por screenshot estática no aplicativo. Dep.: EN-002, EN-031–039.

Gate G4: direção visual confirmada por evidência inicial da rota real. Token azul isolado, HTML externo ou “parece bonito” não satisfazem o gate.

### Fase 5 — Lista e cabeçalho de conversa

Áreas B, C, E. Aplicar a estrutura NAVY às consultas e interações reais.

#### EN-041 — Construir tabs Todas Não lidas Favoritos

- Entrega: tabs com semântica acessível, contadores definidos por EN-028 e estado selecionado independente do estado de leitura das linhas.
- Aceite: cada tab muda efetivamente a consulta e informa total/parcial honestamente; não copiar 92/24/5 do desenho. Dep.: G4, EN-028.

#### EN-042 — Separar pasta e marcadores

- Entrega: Entrada/Enviados/Rascunhos/Lixeira/Todas conforme contratos reais; display names em português para labels de sistema e nomes de usuário preservados. Remover a faixa horizontal de chips técnicos como navegação principal.
- Aceite: pastas têm resultados distintos corretos, sem apenas renomear o mesmo array; rascunhos refletem seu contrato real. Dep.: EN-025, EN-041.

#### EN-043 — Integrar refinamentos combináveis

- Entrega: controles de anexos, período e demais refinamentos suportados, AND definido com conta/pasta/tab; limpar filtros de forma previsível. Datas usam timezone escolhido e intervalos inequívocos.
- Aceite: composição de filtros equivale à query; limpar atualiza URL/contagem/seleção sem resetar conta ou perder texto. Dep.: EN-027, EN-030, EN-042.

#### EN-044 — Resolver identidade e conteúdo da linha

- Entrega: avatar/nome/endereço, assunto, snippet, horário e tags reais; fallback sem CRM pelo remetente/participantes, evitando exibir a própria conta como interlocutor de saída.
- Aceite: lista/header/rail usam resolvedor comum; nomes/endereço longos têm leitura completa acessível, sem “Desconhecido” injustificado. Dep.: EN-013, EN-023.

#### EN-045 — Tornar linhas e ações semanticamente corretas

- Entrega: seleção, não lido, anexo, favorito e foco distinguíveis; estrela como ação independente sem botão aninhado e sem selecionar a thread por propagação involuntária.
- Aceite: teclado/touch acionam cada intenção uma vez; estado sem cor também compreensível. Dep.: EN-041, EN-044.

#### EN-046 — Mostrar paginação e conta no rodapé

- Entrega: anterior/próxima ou continuação conforme cursor, faixa carregada e total somente quando conhecido; conta ativa visível com seletor suportado e estado de sync.
- Aceite: nenhuma página ou contagem fictícia; não misturar quantidade recebida do Gmail com tamanho da lista local. Dep.: EN-021, EN-025, EN-028, EN-029.

#### EN-047 — Conectar busca Ajuda e Nova mensagem

- Entrega: busca superior e filtros sem dois estados concorrentes; atalho existente sem colisão global; Ajuda contextual verdadeira e Nova mensagem abrindo composição vazia na conta selecionada.
- Aceite: sem botões no-op, guia genérico fingindo suporte ou draft anterior reaproveitado como mensagem nova. Dep.: EN-024, EN-026, EN-033.

#### EN-048 — Redesenhar o cabeçalho da conversa

- Entrega: identidade/endereço, assunto único, horário/contexto real, labels e ações autorizadas; apenas assuntos efetivamente diferentes reaparecem nas mensagens.
- Aceite: header reflete o objeto atual e alvo/completude quando necessário; sem selo verificado ou status online inventado. Dep.: EN-023, EN-044.

#### EN-049 — Diferenciar estados vazios e falhas

- Entrega: variantes visuais de carregando conta, desconectado, sem permissão, caixa vazia, filtro vazio, erro inicial, refresh e histórico parcial; retry da ação correta.
- Aceite: falha não vira zero/desconexão; dados existentes permanecem quando refresh falha; skeleton finito e mensagens acessíveis. Dep.: EN-022, EN-041–048.

#### EN-050 — Validar navegação integral da lista

- Entrega: testes lista→thread→voltar, tabs, filtros, busca, página posterior, conta, mobile e embed com screenshots intermediários.
- Aceite: sem header duplicado, perda de draft, invisibilidade de detalhes ou scroll quebrado; contratos do Gmail legado preservados. Dep.: EN-041–049.

Gate G5: lista e cabeçalho não são só visualmente novos; consultas, pastas, ações e navegação correspondem ao que prometem.

### Fase 6 — Timeline e anexos

Áreas C, E, G, H, I. Conteúdo completo, arquivos utilizáveis e nenhuma redução do hardening.

#### EN-051 — Organizar timeline determinística

- Entrega: ordem por data com desempate, separadores locais de dia, entrada à esquerda/saída à direita, dedupe por identidade e indicação de histórico incompleto.
- Aceite: datas inválidas, empates e carregamento incremental não desordenam mensagens nem fundem threads por contato. Dep.: G5, EN-029.

#### EN-052 — Corrigir linguagem de estado de mensagem

- Entrega: diferenciar preparando/enviando/aceito/reconciliação/falha/incerto; retirar CheckCheck derivado de `is_read` como confirmação do destinatário.
- Aceite: leitura da caixa continua utilizável sem sugerir entrega/leitura externa; fixture sem evidência não ganha selo por ter contato vinculado. Dep.: EN-020, EN-048.

#### EN-053 — Renderizar texto com boa leitura

- Entrega: parágrafos, quebras, citações e links seguros em texto simples, largura/contraste legíveis; conteúdo longo completo por expansão/reader acessível.
- Aceite: sem clipping definitivo de 280 px, assunto repetido desnecessário ou conteúdo Vercel transformado em card especial hardcoded. Dep.: EN-036, EN-051.

#### EN-054 — Evoluir leitor HTML mantendo isolamento

- Entrega: preservar DOMPurify isolado/fail-closed e iframe sandbox; melhorar entrada, expansão, fechamento e foco do leitor, distinguindo exportação sanitizada de mensagem RFC original.
- Aceite: script/eventos/CSS hostil/escapes não executam nem acessam parent; tabelas largas rolam no leitor, não na página. Dep.: EN-053, EN-007.

#### EN-055 — Aplicar política de imagens e CID

- Entrega: bloquear/carregar imagens conforme decisão explícita, tratar trackers, resolver CID somente a partir de partes MIME autorizadas e mostrar placeholder quando indisponível.
- Aceite: inspeção de rede corresponde à política exibida; no-referrer não é anunciado como anonimato. Não criar proxy inseguro ou buscar URL arbitrária para “consertar” imagem. Dep.: EN-006, EN-012, EN-054.

#### EN-056 — Consultar metadados de arquivos em lote

- Entrega: hook de anexos com escopo e query agrupada; tratar filename/MIME/tamanho nulos e preservar múltiplos anexos pela chave composta existente.
- Aceite: ressincronização de três anexos não duplica/sobrescreve; nenhuma query por bolha ou download antecipado. Validação SQL não executada fica declarada. Dep.: EN-004, EN-027, EN-029.

#### EN-057 — Implementar download binário autenticado

- Entrega: integrar get-attachment usando IDs corretos, converter base64url para bytes/Uint8Array/Blob, filename seguro e erros específicos, sem decodificar binário como UTF-8.
- Aceite: hashes equivalentes para bytes com zeros e não UTF-8; conta trocada durante download não recebe arquivo da anterior. Dep.: EN-012, EN-056.

#### EN-058 — Criar preview seguro e controlar recursos

- Entrega: `EmailAttachmentCard` compartilhável, viewer permitido para imagem/texto/PDF suportado, fallback de download para formatos não suportados e revogação de object URLs.
- Aceite: HTML/SVG ativo não ganha origem privilegiada; sem viewer externo recebendo documentos corporativos; abrir/fechar repetido não acumula blobs. Dep.: EN-054, EN-057.

#### EN-059 — Encaminhar os anexos originais escolhidos

- Entrega: carregar explicitamente arquivos do alvo histórico, combiná-los com novos arquivos e incluí-los no mesmo contrato de payload/limites, com progresso e cancelamento.
- Aceite: dois originais mais um novo chegam íntegros ao mock; falha de um original bloqueia envio até retry ou remoção consciente. Dep.: EN-016, EN-017, EN-057, EN-058.

#### EN-060 — Preservar scroll e posição de leitura

- Entrega: autoscroll somente perto do fim ou envio próprio relevante; âncora ao paginar/expandir/imagens, indicador de novas mensagens e reduced-motion.
- Aceite: leitura antiga não salta com mensagens novas; testes de timeline/arquivos/HTML seguros passam e capturas mostram conteúdo utilizável. Dep.: EN-051–059.

Gate G6: timeline completa nos limites declarados, segurança preservada, bytes provados e anexos utilizáveis no centro e pelo mesmo contrato no futuro rail.

### Fase 7 — Compositor unificado e rascunhos

Áreas D, E, G, J. Consolidar a lógica corrigida sem reintroduzir bugs nas apresentações compacta/expandida/legada.

#### EN-061 — Extrair núcleo de composição compatível

- Entrega: criar núcleo compartilhado de estado, validação, destinatários, arquivos e submissão; manter facades de EmailComposer/ReplyBar com contratos compatíveis e modos explícitos.
- Aceite: novo/reply/reply-all/forward usam a mesma lógica testada; GmailInboxView/EmailThreadView continuam funcionais. Dep.: G6, EN-011–020, EN-024.

#### EN-062 — Editar destinatários com validação visível

- Entrega: campos/chips To/Cc/Bcc acessíveis, colar lista, remover/editar, mensagens por campo e identidade da conta remetente; impedir envio enquanto endereço inválido.
- Aceite: papéis, display names e regras de aliases de EN-014 preservados; Bcc não aparece no resumo público de participantes recebidos. Dep.: EN-013, EN-014, EN-061.

#### EN-063 — Implementar editor rico de verdade

- Entrega: editor escolhido em EN-006 com bold/italic/lista/link, colagem sanitizada, undo/redo, seleção e texto simples equivalente; verificar necessidades adicionais da referência antes de expor controles.
- Aceite: cada ícone altera conteúdo enviado; segurança vale também para citações HTML; sem `execCommand` frágil ou toolbar WhatsApp tratada como HTML pronto. Dep.: EN-054, EN-061.

#### EN-064 — Integrar modos e alvo com apresentação clara

- Entrega: ações Responder/Responder a todos/Encaminhar no layout NAVY, banner do alvo, assunto/quote apropriados e confirmação para mudança que descarte edição.
- Aceite: modo visual, estado, destinatários e payload concordam após trocar alvo ou receber nova mensagem; nova composição recebe identidade própria. Dep.: EN-015, EN-016, EN-061–063.

#### EN-065 — Unificar experiência e limites de anexos

- Entrega: cards de anexos selecionados, remoção/erro/preparação, teto por quantidade e tamanho agregado incluindo expansão base64/MIME e limite do gateway vigente. Se houver drag/drop/colar, aplicar as mesmas regras.
- Aceite: dez/onze arquivos e limiar/limiar+1 têm resultados coerentes entre cliente/servidor; não ampliar gateway ou descartar arquivo silenciosamente. Dep.: EN-005, EN-017, EN-058, EN-059, EN-061.

#### EN-066 — Expor a máquina de envio no compositor

- Entrega: feedback de preparing/sending/accepted/reconciling/failed/unknown, controles adequados e política explícita de cancelamento antes/depois da submissão.
- Aceite: timeout não oferece reenvio automático como recuperação; editar B enquanto A envia é seguro; “Cancelar” não promete desfazer e-mail já aceito. Dep.: EN-018, EN-020, EN-064, EN-065.

#### EN-067 — Preservar composição ao expandir e fechar

- Entrega: versões compacta/expandida usam o mesmo draft, incluindo seleção, destinatários, alvo e arquivos; fechar, guardar e descartar têm efeitos distintos e diálogo de perda.
- Aceite: expandir/recolher não remonta estado destrutivamente; cancelar descarte mantém conteúdo; teclado/FAB não cobrem ações. Dep.: EN-024, EN-038, EN-061–066.

#### EN-068 — Implementar ciclo remoto de rascunho

- Entrega: create-once, update por draft ID, autosave serializado/versionado, ACK vigente, remoção após envio/descarte segundo contrato Gmail; validar endpoints e escopos antes de adicioná-los.
- Aceite: múltiplas edições/respostas fora de ordem produzem um draft com versão mais recente, sem ressuscitar descartado. Sem esse contrato, UI diz “Mantido nesta sessão” e a etapa permanece parcial. Dep.: EN-005, EN-012, EN-024, EN-067.

#### EN-069 — Definir reload expiração e multissessão

- Entrega: restauração segundo política de privacidade, geração/expiração de drafts, isolamento de abas quando necessário e limpeza no logout. Arquivos não persistíveis exigem aviso/reanexo, nunca File fictício.
- Aceite: reload não promete anexos inexistentes; nenhum base64 corporativo eterno em localStorage; mudança de usuário remove caches/blobs acessíveis ao anterior. Dep.: EN-022, EN-024, EN-068.

#### EN-070 — Validar composição ponta a ponta isolada

- Entrega: cenários A→B→A, conta A→B, envio A terminando em B, edição durante autosave, IME, rejeição/timeout, expandir, descartar e legado; contrato completo de bytes/recipientes/HTML.
- Aceite: nenhuma composição contaminada, perda silenciosa ou chamada mutável real; pending/blocked não é tratado como funcionalidade concluída. Dep.: EN-061–069.

Gate G7: composer realmente unificado, formatação funcional, dados íntegros e persistência conforme prometida. Memória transitória não fecha autosave remoto.

### Fase 8 — Contexto e ações de caixa

Áreas C, E, F, G, I. Contexto acionável e operações com unidade, autorização e rollback corretos.

#### EN-071 — Compor rail com identidade honesta

- Entrega: seções identidade/ações/sobre/participantes/arquivos/relacionadas/tags/notas com o resolvedor comum; remover estatísticas redundantes ou semanticamente erradas.
- Aceite: ausência de CRM tem fallback do remetente; “Contato vinculado” não vira “Empresa verificada”; data de criação usa dado de criação, não última mensagem. Dep.: G7, EN-044, EN-048.

#### EN-072 — Integrar dados profissionais e links reais

- Entrega: consulta autorizada aos campos já existentes de empresa/cargo/departamento/site/redes; E-mail abre composição e CRM abre cadastro permitido. Links só de dados validados e protocolos seguros.
- Aceite: sem inventar sede/descrição/LinkedIn pelo domínio; `noopener` e regras de URL testados; ausência de dado não vira botão no-op. Dep.: EN-004, EN-071.

#### EN-073 — Mostrar participantes sem alterar o histórico

- Entrega: participantes derivados do envelope autorizado, deduplicados e com indicação de recorte quando incompleto; “Adicionar” edita destinatários da próxima mensagem, se implementado.
- Aceite: não reescreve mensagens antigas nem expõe Bcc de terceiros; ação indisponível não parece ativa. Dep.: EN-014, EN-029, EN-062, EN-071.

#### EN-074 — Consultar conversas relacionadas com escopo

- Entrega: relacionadas por conta e contato autorizado/endereço comprovado, paginadas e com assuntos separados; abertura preserva draft e seleção/retorno coerentes.
- Aceite: remetentes iguais não fundem GmailThreadIds; nenhuma relacionada de outra conta ou baseada em correspondência de domínio indiscriminada. Dep.: EN-023, EN-024, EN-030, EN-072.

#### EN-075 — Reaproveitar notas internas do contato

- Entrega: ligar `useContactNotes` somente ao UUID válido e autorizado do contato; loading/erro/salvamento real, sem cadastrar contato automaticamente para viabilizar nota.
- Aceite: nota persiste pelo serviço existente e jamais entra no MIME; sem vínculo, orientar corretamente em vez de passar string vazia/ID de mensagem. Dep.: EN-004, EN-071.

#### EN-076 — Reutilizar anexos no contexto lateral

- Entrega: mesmos metadados/cards/download/previews da timeline, contador/universo explícitos e “Ver todos” com resultado real.
- Aceite: rail e centro concordam sobre arquivos e completude; nenhuma query duplicada por card, URL inventada ou arquivo do mockup. Dep.: EN-056–058, EN-071.

#### EN-077 — Separar labels Gmail de tags internas

- Entrega: apresentação por nomes legíveis e mutações com permissão/escopo, definindo origem de cada marcador; gerenciamento de tag interna somente sobre contrato existente validado.
- Aceite: “Gerenciar” tem efeito persistente testado ou indisponibilidade explícita; cache só confirma resultado aceito e reversão é real. Dep.: EN-005, EN-012, EN-042, EN-071.

#### EN-078 — Arquivar a conversa inteira com reconciliação

- Entrega: operação thread-level de remoção de INBOX, alcançando também mensagens não carregadas; resposta verificada e atualização consistente de cache/agregados.
- Aceite: três mensagens INBOX são tratadas; falha preserva seleção/dados ou faz rollback. Atualizar teste antigo que exigia somente lastMessage, adicionando a regressão correta. Dep.: EN-012, EN-025, EN-077.

#### EN-079 — Corrigir lixeira restauração e favoritos

- Entrega: distinguir TRASH de arquivamento interno, implementar inversas verdadeiras quando expostas e definir se favorito/leitura operam em mensagem ou thread; resultado do provider dirige o espelho.
- Aceite: refetch não ressuscita conversa na pasta errada; undo não é apenas toast/local state; falhas/ações parciais visíveis. Dep.: EN-012, EN-042, EN-078.

#### EN-080 — Confirmar leitura somente após resposta válida

- Entrega: conferir cada resposta do mark-read, atualizar apenas sucessos, retornar parcial e recomputar agregados; evitar efeitos sobre mensagens stale de outra conta/thread.
- Aceite: metade recusada continua não lida; sem loop de efeito/assinatura ou navegação fingindo sucesso. Rodar regressões de todas as ações desta fase. Dep.: EN-022, EN-023, EN-078, EN-079.

Gate G8: todas as ações visíveis têm contrato real, autorização e erro/rollback; rail mostra contexto comprovado, não marketing fictício.

### Fase 9 — Sincronização e estados extremos

Áreas E, G, I, J, L. Completar caminhos de reconciliação sem prometer espelho perfeito de um histórico parcial.

#### EN-081 — Preservar falhas parciais da sincronização

- Entrega: não sobrescrever falhas do helper por `synced/last_error:null`; retornar sucesso/parcial/falha com diagnóstico sanitizado e invalidar estado da conta/queries pertinentes.
- Aceite: uma mensagem recusada aparece como parcial recuperável; retry só do necessário, sem reenvio de e-mail ou reset indevido de cursor. Dep.: G8, EN-029.

#### EN-082 — Aplicar eventos incrementais e páginas de history

- Entrega: processar added/deleted/labelsAdded/labelsRemoved e cursores reais, em vez de buscar novamente um subconjunto genérico de INBOX; mapear quem chama o caminho.
- Aceite: fixtures de mudanças externas reconciliam mensagens/labels/exclusões sem ampliar escopo; cursor só avança quando o trabalho correspondente estiver seguro. Dep.: EN-005, EN-029, EN-081.

#### EN-083 — Recuperar cursores e hidratação incompletos

- Entrega: tratar history expirado, página falha, thread não hidratada, quota/429 e cancelamento; continuação limitada e checkpoint recuperável, preservando OAuth/watch/webhook/cron existentes.
- Aceite: falha no meio não perde páginas nem declara caixa completa; backoff para leitura/sync não se aplica a send; estado autorizado sempre respeitado. Dep.: EN-029, EN-082.

#### EN-084 — Reconciliar agregados deterministicamente

- Entrega: resumo/data/remetente/contagem/unread/star/labels calculados pela ordem real e unidade definida; revisar triggers existentes e concorrência de sync/persistência para evitar duas fontes conflitantes.
- Aceite: mensagem antiga após nova, empate, reprocessamento e syncs sobrepostos não deixam resumo errado; especificar teste SQL que depender de autorização, sem afirmar que mock prova transação real. Dep.: EN-004, EN-080–083.

#### EN-085 — Controlar assinaturas e respostas atrasadas

- Entrega: canal Realtime por escopo, cleanup, invalidação limitada/coalescida, ressubscrição segura e proteção por geração após trocar conta/usuário.
- Aceite: montar/desmontar/StrictMode/navegar não duplica listeners; atualização real do cache chega à seleção por ID sem multiplicar syncs. Dep.: EN-021–024, EN-084.

#### EN-086 — Cobrir rede autenticação e falhas intermediárias

- Entrega: estados distintos 401/403/desconexão/offline/timeout/refresh/parcial; preservação de drafts e dados já conhecidos com aviso de desatualização, sem reconectar durante loading.
- Aceite: ações de recuperação não vazam dados, não limpam composição e não disparam mutação indevida; mensagens de erro não publicam corpo privado ou credenciais. Dep.: EN-049, EN-066, EN-081–085.

#### EN-087 — Executar testes adversariais de segurança

- Entrega: retestar escopo em todos os handlers tocados, metadata/download/notas/relacionadas, CRLF, URLs hostis, HTML/CSS e roles diferentes; revisar exposição de campos em queries e logs.
- Aceite: acesso cruzado negado sem enfraquecer RLS/guards; sandbox e validação mantidos. Vulnerabilidade não reproduzida não será apresentada como vazamento comprovado. Dep.: EN-012, EN-054–058, EN-072–086.

#### EN-088 — Medir volume memória e consultas

- Entrega: fixture de mil threads paginadas e thread longa; medir renderização, consultas, memória, iframes, listeners e blobs. Virtualizar somente onde a medição exigir, com alturas variáveis e âncoras.
- Aceite: sem N+1, download em massa ou crescimento ilimitado; apresentar antes/depois e orçamento justificado, não número arbitrário de performance “aprovado”. Dep.: EN-025, EN-056–060, EN-085.

#### EN-089 — Auditar acessibilidade e responsividade

- Entrega: teclado, foco/restauração, nomes acessíveis, live regions pontuais, reduced-motion, touch e contraste em temas/portals; medir texto 4,5:1, texto grande 3:1 e requisitos não textuais aplicáveis.
- Aceite: alvos mínimos aplicáveis de 24 px/exceções documentados, 40–44 px como meta de usabilidade para ações principais; não declarar AA apenas com automação. Dep.: EN-032–039, EN-050, EN-060, EN-067.

#### EN-090 — Validar todos os consumidores e extremos

- Entrega: regressões no Email standalone, GmailInboxView, EmailThreadView e Omnichannel, incluindo dados nulos, nomes longos, conta vazia, histórico parcial e falha de funções novas contra contrato antigo.
- Aceite: nenhum consumidor quebrado ou fallback fingindo recurso disponível; dependências de versão/infra registradas antes da validação final. Dep.: EN-081–089.

Gate G9: sync honesto, agregados consistentes nos testes executados, segurança negativa, acessibilidade medida e regressões compartilhadas cobertas.

### Fase 10 — Validação documentação e entrega revisável

Áreas A–L. Consolidar evidências sem confundir branch, main, aplicação de schema e publicação.

#### EN-091 — Revalidar o ambiente e os comandos de QA

- Entrega: conferir HEAD, lockfile, Node/Bun e scripts vigentes, dívidas do baseline e isolamento; preparar comandos exatos de cada suíte e inventário de testes previstos.
- Aceite: versões/ambiente e critérios cobertos anotados; nenhum comando sugerido como existente sem checar. Não instalar dependência ou atualizar baseline só para ocultar falha. Dep.: G9.

#### EN-092 — Executar unitários componentes e regressões

- Entrega: suítes Email/Gmail/HTML, estado/query/recipient/parser/attachment e integrações do composer com componentes reais; typecheck, lint tocado e build.
- Aceite: relatórios com coletados/aprovados/reprovados/ignorados e SHA; defeitos críticos têm fail-before/pass-after. Falha preexistente é separada, não apagada. Dep.: EN-091.

#### EN-093 — Executar contratos de Edge e MIME

- Entrega: testes de schemas/send/sync/isolamento/aceite parcial/cursor/binários usando fetch e persistência mockados, junto aos contratos existentes; confirmar runner de Deno/compatibilidade quando aplicável.
- Aceite: payload, bytes, cabeçalhos e estados conferidos; nenhuma chamada real ou DDL. Listar explicitamente o que ainda exigiria banco isolado autorizado. Dep.: EN-091, EN-092.

#### EN-094 — Validar coleta Playwright dedicada

- Entrega: projeto proposto `chromium-email-visual` para specs Email, com fixtures autorizadas isoladas, exclusão do catch-all autenticado e coleta comprovada antes de rodar; configurar URL/porta de preview local coerentes.
- Aceite: número esperado maior que zero, nenhum login real implícito e contador de mutações externas zero. Não usar o projeto `chromium` atual como se coletasse Email: ele coleta `auth.spec.ts`. Dep.: EN-007, EN-091.

#### EN-095 — Capturar a matriz visual da rota real

- Entrega: screenshots com fixture/relogio/fontes estáveis em todos os formatos listados na seção de QA, mais estados críticos de rails/drafts/anexos/HTML/erros.
- Aceite: caminhos e SHA verificáveis; sem dados privados ou screenshot externa servindo de UI. Resultado a 320 px e zoom 200% documentado com ações alcançáveis. Dep.: EN-094.

#### EN-096 — Revisar fidelidade NAVY sem mascarar diferenças

- Entrega: comparação lado a lado/overlay orientativo com a referência correta e revisão de composição, paleta, densidade, hierarquia e interações; registrar desvios e justificativas de integridade.
- Aceite: não chamar pixel-diff de textos diferentes de prova de igualdade. Obter aceite visual explícito; PNG ausente ou composição divergente mantém o gate reprovado/bloqueado. Dep.: EN-002, EN-040, EN-095.

#### EN-097 — Fechar a matriz dos 80 critérios com evidência

- Entrega: atualizar cada AC com status, teste/artefato e SHA; rever combinações de risco, não somente happy path. Critério bloqueado mantém motivo, impacto, responsável e próximo passo.
- Aceite: zero aprovação por mera inspeção do plano; sem “100%” se houver requisito pendente, parcial, teste ignorado relevante ou dependência sem autorização. Dep.: EN-092–096.

#### EN-098 — Atualizar contratos e matriz de capacidades

- Entrega: registrar reutilizado/corrigido/novo/pendente por arquivo/achado, compatibilidade frontend/Edge, mudanças de domínio e eventuais propostas de schema com justificativa e testes ainda necessários.
- Aceite: evidência no Git não é confundida com banco aplicado ou Edge publicada; todos os 36 achados têm desfecho verificável, inclusive “não reproduzido”. Dep.: EN-097.

#### EN-099 — Revisar diff segurança e rollback

- Entrega: revisão de secrets/artefatos/links, alcance do diff, permissões, dependências, contratos e plano de reversão por commits; commits pequenos em branch, documentação de revisão/PR conforme autorização.
- Aceite: rollback de UI/código não apaga drafts nem tenta desfazer e-mails enviados; mudanças aditivas de contrato têm estratégia de compatibilidade. Nenhum force-push, guard enfraquecido ou merge automático. Dep.: EN-098.

#### EN-100 — Entregar implementação revisável e limites reais

- Entrega: sumário final com SHAs, arquivos, testes executados, screenshots, matriz completa, desvios visuais aceitos e bloqueios; registrar separadamente pronto para revisão, mergeado, aplicado e publicado.
- Aceite: todos os requisitos da meta comprovados ou declaração explícita de implementação parcial. Encerrar sem enviar e-mail real, aplicar DDL, fazer deploy ou merge de produção. Dep.: EN-097–099.

Gate G10: aceite funcional, visual e de segurança documentados separadamente. Aprovação do plano, quantidade de commits, teste sem coleta ou screenshot bonita não fecham implementação.

## Rastreabilidade dos 36 achados da auditoria

Estado desta preparação: os achados funcionais continuam relevantes porque não houve alteração dos arquivos Email/Gmail examinados após o snapshot. A infraestrutura Playwright recebeu a correção de porta/onboarding descrita no baseline; ela não resolve a falta de projeto Email dedicado. “Risco” significa hipótese a reproduzir; não é incidente confirmado. As evidências abaixo foram cotejadas com o código da base do plano. Os identificadores E01–E36 são da auditoria fornecida, não dos comentários históricos `FIX E…` nos arquivos.

| Achado | Evidência estática ou limite | Etapas responsáveis |
|---|---|---|
| E01 | `EmailComposer.handleSend` omite attachments nos payloads, embora guarde File[] | EN-008, EN-017, EN-065, EN-093 |
| E02 | Toolbar do composer sem handlers; estado HTML não dirigido pelo editor | EN-006, EN-063 |
| E03 | `forwardMsg` é preenchido, mas `replyTo={lastMessage}` permanece | EN-016, EN-059 |
| E04 | Reply/ReplyAll dos balões só trocam modo; ReplyBar recebe lastMessage | EN-015, EN-064 |
| E05 | ReplyBar inbound usa From, não Reply-To | EN-013, EN-014 |
| E06 | Cc entra no resolvedTo e também no campo cc | EN-014, EN-062 |
| E07 | Split por vírgula e regex simples de endereço; risco com display names | EN-013, EN-093 |
| E08 | State local da composição não isolado por thread/alvo; risco de A→B | EN-008, EN-024, EN-070 |
| E09 | Sem trava síncrona antes de FileReader; Enter sem proteção IME/repeat | EN-018, EN-066 |
| E10 | Inbox guarda objeto selectedThread, não identidade derivada do cache | EN-023, EN-030 |
| E11 | Inbox testa ausência de conta sem distinguir accountsLoading/erro | EN-022, EN-049, EN-086 |
| E12 | Query limitada a 100; busca local não inclui last_from | EN-025, EN-026 |
| E13 | Opção has_attachment sem branch de filtro efetivo | EN-027, EN-043 |
| E14 | Contadores calculados no array local; helper usa campos de mensagens | EN-028, EN-041, EN-046 |
| E15 | Helper retorna nextPageToken, sem receber pageToken | EN-029, EN-083 |
| E16 | get-thread retorna provider cru; frontend lê mensagens locais | EN-029, EN-051, EN-083 |
| E17 | sync-inbox pode apagar last_error do helper mesmo com falhas | EN-081 |
| E18 | Incremental examinado consome messagesAdded e refaz inbox limitada | EN-082, EN-083 |
| E19 | Upsert de resumo por mensagem cria risco de ordem; revisar também triggers | EN-084 |
| E20 | Rail usa só contact e botões Email/CRM sem ação | EN-044, EN-071, EN-072 |
| E21 | Rail usa HAS_ATTACHMENT e last_message_at como criação; labels técnicas | EN-027, EN-042, EN-071, EN-076 |
| E22 | CheckCheck condicionado a is_read; outbound inserido como lido local | EN-052 |
| E23 | Archive remove INBOX apenas de lastMessage e navega antes do resultado | EN-078 |
| E24 | Trash-thread grava status archived no espelho, sem labels equivalentes | EN-079 |
| E25 | mark-read não verifica cada fetch antes de confirmar todos localmente | EN-080 |
| E26 | Reply faz send antes de validar thread local; inserts sem erro tratado | EN-019, EN-020, EN-093 |
| E27 | Busca originalMsg e updates por Gmail ID sem filtro de conta em trechos; risco, não vazamento provado | EN-012, EN-087 |
| E28 | Fallback fabrica RFC Message-ID e composer confunde thread/message ID | EN-011, EN-019 |
| E29 | Quantidade/tamanho/validação de cabeçalhos desalinhados | EN-013, EN-017, EN-065 |
| E30 | Balão só indica anexos; metadata/download backend já existem | EN-056–058, EN-076 |
| E31 | Tipo manual diverge dos gerados em storage_path, nulabilidade e Message-ID | EN-004, EN-011 |
| E32 | Só create-draft no handler examinado; sem ciclo update/delete no hook | EN-068, EN-069 |
| E33 | Rail hidden em telas menores e FAB/composer fixos concorrentes; geometria por medir | EN-034–039, EN-067 |
| E34 | Tema carvão/herança global e ausência da workbar equivalente no shell | EN-031–040 |
| E35 | Sanitização e sandbox existem; imagem remota ainda pode rastrear | EN-054, EN-055, EN-087 |
| E36 | Nove arquivos Email; Thread.test mocka balões e espera archive da última mensagem; chromium coleta auth | EN-008, EN-078, EN-091–094 |

## Matriz de aceite dos 80 requisitos

Todos os resultados abaixo permanecem **PENDENTES** nesta entrega de planejamento. Na execução, adicionar a cada linha: resultado, SHA, nome do teste/caminho do artefato e justificativa quando bloqueado. O mapeamento não é uma execução de teste.

| Critério | Verificação obrigatória | Etapas | Evidência futura mínima |
|---|---|---|---|
| AC-001 | Rota real protegida, não HTML paralelo | EN-003, EN-033, EN-094 | E2E no shell |
| AC-002 | Referência NAVY correta | EN-002, EN-040, EN-096 | PNG original + comparação |
| AC-003 | Tema local sem regressão externa | EN-031, EN-032, EN-090 | Navegação + visual |
| AC-004 | Shell único e embed correto | EN-033–035, EN-050, EN-090 | Standalone e Omnichannel |
| AC-005 | Header com ações efetivas | EN-033, EN-047 | Interações E2E |
| AC-006 | Seleção distinta de não lido | EN-041, EN-045 | Visual + semântica |
| AC-007 | Assunto e identidade consistentes | EN-044, EN-048, EN-051 | Componente + captura |
| AC-008 | Nomes/assuntos/arquivos longos | EN-036, EN-044, EN-058, EN-095 | Geometria e leitura completa |
| AC-009 | Nenhum dado ilustrativo em produção | EN-052, EN-071, EN-099 | Revisão de diff + teste |
| AC-010 | Tipografia e alinhamento NAVY | EN-036, EN-040, EN-096 | Comparativo visual |
| AC-011 | Filtro de anexos verdadeiro | EN-027, EN-043 | Query com desconhecido |
| AC-012 | Busca por remetente sem CRM | EN-026, EN-044 | Query com last_from |
| AC-013 | Busca além de 100 threads | EN-025, EN-026 | Fixture multipágina |
| AC-014 | Paginação estável em empates | EN-025 | Cursor + desempate |
| AC-015 | Pastas com universos corretos | EN-042, EN-078, EN-079 | Contrato + navegação |
| AC-016 | Filtros combinados e limpar | EN-030, EN-043 | Query + E2E |
| AC-017 | Contagens de threads coerentes | EN-028, EN-046 | Mensagens ≠ threads |
| AC-018 | Busca antiga não sobrepõe atual | EN-022, EN-026 | Promessas fora de ordem |
| AC-019 | Back/forward/reload/link direto | EN-030, EN-050 | Histórico do navegador |
| AC-020 | Loading/vazio/403/offline/erro | EN-049, EN-086 | Estados de componente |
| AC-021 | Conta carregando não desconectada | EN-022, EN-049 | Resposta inicial atrasada |
| AC-022 | Troca de conta isolada | EN-021, EN-022, EN-085 | A lenta concluindo em B |
| AC-023 | Seleção acompanha cache atual | EN-023 | Atualização de status/count |
| AC-024 | Draft A→B→A com arquivo | EN-024, EN-070 | Componente + E2E |
| AC-025 | Envio A não apaga draft B | EN-018, EN-024, EN-066 | Mutation atrasada |
| AC-026 | Compacto/expandido sem perda | EN-067 | E2E corpo/arquivos/alvo |
| AC-027 | Fechar e descartar distintos | EN-067 | Confirmar/cancelar descarte |
| AC-028 | Draft remoto único e atualizado | EN-068 | ACKs fora de ordem |
| AC-029 | Reload cumpre política de arquivos | EN-069 | Restore/aviso de reanexo |
| AC-030 | Logout elimina dados do anterior | EN-022, EN-069, EN-087 | Duas sessões no navegador |
| AC-031 | Responder à primeira mensagem | EN-015, EN-064 | Regressão de três mensagens |
| AC-032 | Encaminhar à segunda mensagem | EN-016, EN-059 | Alvo + conteúdo + binários |
| AC-033 | Reply-To tem precedência válida | EN-013, EN-014 | Unitário de envelopes |
| AC-034 | To/Cc disjuntos e aliases | EN-014, EN-062 | Parser + payload |
| AC-035 | Bcc não inferido nem reinserido | EN-014, EN-073, EN-087 | Casos inbound/outbound |
| AC-036 | Nomes com vírgula e Unicode | EN-013, EN-062 | Corpus sintético |
| AC-037 | Editor envia formatação efetiva | EN-063 | Editar/colar/undo + MIME |
| AC-038 | IDs RFC e Gmail corretos | EN-011, EN-019 | Decodificação MIME |
| AC-039 | Concorrência e IME sem duplicação | EN-018, EN-066 | Contagem de submissões |
| AC-040 | Aceite/falha/timeout distinguíveis | EN-020, EN-066, EN-093 | Fault injection |
| AC-041 | Anexos na nova mensagem | EN-017, EN-065 | Hashes no MIME |
| AC-042 | Anexos em reply e reply-all | EN-011, EN-017 | Payload tipado e MIME |
| AC-043 | Limite de quantidade | EN-065 | Dez/onze conforme contrato |
| AC-044 | Limite agregado real | EN-017, EN-065 | Limiar/base64/gateway |
| AC-045 | Download base64url binário | EN-057 | Hash original = baixado |
| AC-046 | Múltiplos anexos sem sobrescrita | EN-004, EN-056, EN-093 | Chave composta + upsert |
| AC-047 | Originais e novos ao encaminhar | EN-059 | Dois + um ou bloqueio |
| AC-048 | Viewer sem executar HTML/SVG | EN-058, EN-087 | Segurança no browser |
| AC-049 | Cleanup blobs/erro/troca de conta | EN-057, EN-058, EN-088 | Memória e cancelamento |
| AC-050 | Card real e metadados incompletos | EN-056, EN-058, EN-076 | Nome longo/MIME nulo |
| AC-051 | Arquivamento de thread completa | EN-078 | Mensagens não carregadas |
| AC-052 | Falha de archive sem falso sucesso | EN-078 | Provider recusado |
| AC-053 | Lixeira e restauração reais | EN-079 | Labels/pastas + inversa |
| AC-054 | Favoritos e marcadores persistentes | EN-077, EN-079 | Mutation/reload |
| AC-055 | Leitura parcialmente recusada | EN-080 | Sucesso apenas dos aceitos |
| AC-056 | Sync parcial com cursor | EN-029, EN-081, EN-083 | Página falha + continuação |
| AC-057 | Eventos externos e history paginado | EN-082, EN-083 | Added/deleted/labels |
| AC-058 | Agregados fora de ordem | EN-084 | Antigas depois de novas |
| AC-059 | Identidade e relacionadas isoladas | EN-044, EN-071, EN-074 | Sem/com CRM + conta |
| AC-060 | Notas internas fora do MIME | EN-075 | Persistência autorizada + envio mock |
| AC-061 | Recursos de B negados à conta A | EN-012, EN-087 | Matriz por handler |
| AC-062 | Cabeçalhos resistentes a CRLF | EN-013, EN-093 | Destinatário/assunto/arquivo/MIME |
| AC-063 | Hardening do sanitizador preservado | EN-054, EN-087, EN-092 | Suítes de bypass |
| AC-064 | Sandbox nega script e parent | EN-054, EN-087 | Browser adversarial |
| AC-065 | Imagens respeitam política | EN-055 | Rede e tracker controlado |
| AC-066 | HTML longo legível por inteiro | EN-053, EN-054, EN-095 | Tabela larga/quote longo |
| AC-067 | Links de corpo/site seguros | EN-054, EN-072, EN-087 | Protocolos permitidos/hostis |
| AC-068 | Sem selos/checks fictícios | EN-052, EN-071 | Revisão + componente |
| AC-069 | CID/data ausente com placeholder | EN-055 | MIME incorporado autorizado |
| AC-070 | Ambiente sem mutação externa/segredo | EN-007, EN-094, EN-099 | Interceptação e logs sanitizados |
| AC-071 | Oito formatos e zoom 200% | EN-034–039, EN-095 | Capturas + geometria |
| AC-072 | Foco e teclado completos | EN-045, EN-050, EN-089 | Tab/Shift+Tab/Enter/Esc |
| AC-073 | Touch sem depender de hover | EN-039, EN-045, EN-089 | E2E touch |
| AC-074 | Contraste realmente medido | EN-032, EN-036, EN-089 | Relatório por estado/tema |
| AC-075 | Scroll e reduced-motion | EN-060, EN-089 | Âncora/new message indicator |
| AC-076 | Composer não coberto pelo FAB | EN-038, EN-039, EN-067 | Bounding boxes + teclado |
| AC-077 | Volume e recursos limitados | EN-025, EN-056, EN-088 | Mil threads e memória |
| AC-078 | Playwright coleta Email de verdade | EN-094 | Listagem + execução > 0 |
| AC-079 | Regressões e gates reais | EN-090–094 | Typecheck/build/lint/testes |
| AC-080 | Entrega revisável sem produção | EN-097–100 | Diff, evidências e rollback |

## Simulações de risco a executar antes de aceitar o redesign

Estas são simulações **projetadas**, não executadas nesta preparação. Usar relógio fixo, promessas controladas, fixtures sem dados privados e fault injection. Toda falha descoberta adiciona regressão ao cenário correspondente, sem aumentar artificialmente o contador de etapas.

| Cenário adversarial | Falha a impedir | Invariante e evidência |
|---|---|---|
| Digitar/anexar em A; abrir B; concluir envio A; voltar a A | Vazamento/perda de drafts | B intacto; só a versão enviada de A pode ser limpa; EN-024/070 |
| Trocar conta/usuário durante query/download/autosave | Dados da caixa anterior reaparecem | Geração/escopo impedem publicação tardia; cache/blob limpos; EN-022/069 |
| Responder primeira ou encaminhar segunda de três mensagens | Uso silencioso de lastMessage | IDs, envelope, quote e arquivos pertencem ao alvo; EN-015/016/059 |
| Nome `"Silva, Ana"`, Reply-To diferente, aliases e Cc duplicados | Parser destrutivo/endereçamento errado | To/Cc disjuntos, Bcc não inferido, erros claros; EN-013/014 |
| Duplo clique durante base64 lento e Enter em IME | Dois envios | Uma submissão desde preparing; Enter padrão cria linha; EN-018 |
| Gmail aceita, banco falha; depois timeout sem resultado | Retry duplica e-mail | Aceite/reconciliação/incerto separados; sem retry automático; EN-020 |
| Onze arquivos ou agregado excedido após base64 | Envio incompleto/estouro de memória | Front/Edge rejeitam antes do provider; bytes íntegros; EN-065 |
| Duzentas threads; alvo fora da primeira página; timestamps iguais | Busca/contagem falsa e paginação instável | Busca no universo declarado, cursor com desempate; EN-025–028 |
| Sync com falha parcial, duas páginas, history expirado e labels externas | Falso synced/perda de alterações | Checkpoint e estado parcial preservados, recuperação limitada; EN-081–084 |
| Arquivar thread com mensagens não carregadas; Gmail recusa | Caixa muda só localmente | Thread-level, resultado verificado/rollback; EN-078–080 |
| HTML com script, CSS hostil, tracker e CID ausente | Execução/rastreamento não declarado | Sandbox/hardening intactos e política de rede verificável; EN-054/055/087 |
| Sidebar larga + rail + 1366 px; depois 320 px e teclado | Composer/FAB inacessíveis | Drawer acionável, safe areas, sem overflow global; EN-034–039 |
| Nota interna, relacionada de outra conta e “adicionar participante” | Dado privado no envio ou alteração retroativa | Nota nunca MIME; relacionadas autorizadas; só próximos destinatários; EN-073–075 |
| Suite verde com bubbles mockados ou zero testes Playwright | Falsa confiança | Testar ação real, coleta > 0, prova de contrato e screenshot da rota; EN-008/094 |

## Protocolo de QA e evidências

### Ambiente e comandos previstos

Na base consultada, `package.json` exige Node >=24 e Bun >=1.3; existem scripts `test` (Vitest run), `test:contracts`, `typecheck`, `build`, `lint`, `test:e2e` e `implicit-any-check`. **Nenhum desses testes do aplicativo foi executado para criar este plano.** Revalidar scripts e lockfile antes de usar os comandos abaixo na execução autorizada:

```sh
bun run typecheck
bun run test -- src/components/email/__tests__ src/components/gmail/__tests__ src/lib/__tests__/emailHtml.test.ts
bun run test:contracts
bun run build
bun run implicit-any-check
```

Adicionar lint dos arquivos tocados e ratchets/gates aplicáveis conforme o CI vigente, sem reescrever suas baselines. Incluir testes novos de helpers/query/Edge que não estejam abrangidos pelos diretórios acima. A existência de nove arquivos Email não informa, sozinha, quantos testes passarão. Os testes existentes de `gmail-helpers-account-scope` e `gmail-send-schema` devem ser mantidos e expandidos conforme o runner real, não presumidos dentro de toda invocação de Vitest.

O projeto Playwright `chromium-email-visual` **ainda não existe na base deste plano**. Após criá-lo e configurar a coleta e o isolamento em EN-094:

```sh
bun run test:e2e -- --project=chromium-email-visual --list
bun run test:e2e -- --project=chromium-email-visual
```

Conferir `PLAYWRIGHT_BASE_URL`, porta do processo local e webServer antes de executar. Na base revalidada, o browser ainda usa `http://localhost:5173` como fallback e o webServer usa `http://127.0.0.1:5173`; quando a variável é definida, a correção `e4f6b6a85` deriva a porta dela. Definir uma URL loopback e porta exclusiva desta worktree e conferir que o processo servido é o seu, evitando adotar o servidor de outra sessão via `reuseExistingServer`. Não refazer essa correção já mergeada nem apontar testes para a URL produtiva. Reaproveitar fixtures de sessão/permissão e onboarding existentes sem enfraquecer guards reais. Falhar na primeira requisição externa inesperada, inclusive GET que aciona sync, imagens, WebSockets e mutações disparadas por efeitos.

### Matriz de screenshots e inspeção

| Formato | Casos mínimos |
|---|---|
| 1672×941 | Comparação principal com referência original; sidebar aberta, lista, conversa e rail; nova mensagem e resposta com anexo |
| 1920×1080 | Uso do espaço, leitura longa, rail/HTML completo |
| 1440×900 | Três painéis quando mínimos couberem, rail fechado e composer expandido |
| 1366×768 | Mínimos/drawer, FAB e composer, sem overflow global |
| 1024×768 | Detalhes abre de verdade; tabs/filtros/ações por teclado |
| 768×1024 | Embed/tablet, mudança de orientação e foco do drawer |
| 390×844 | Lista↔thread, touch, resposta, anexos e teclado |
| 320 px de largura | Altura escolhida registrada, leitura e ações críticas alcançáveis |
| Zoom 200% | Registrar viewport e zoom real do browser; não confundir deviceScaleFactor com zoom/reflow |

Combinar, onde pertinente: sidebar aberta/recolhida, rail aberto/fechado, selecionada lida versus não lida, contato ausente, nomes longos, loading, offline, erro, HTML complexo, arquivos e resultado de envio incerto. Usar baseline de DOM produzido pela aplicação para regressão futura; o mockup com outros textos não é golden pixel-perfect. Não atualizar golden por conveniência.

### Formato do registro por etapa

```text
Etapa e responsável:
Status: PLANEJADA / EM ANDAMENTO / VALIDADA / PARCIAL / BLOQUEADA
SHA e arquivos:
Achados E e critérios AC:
Ambiente e versões:
Comando efetivamente executado:
Coletados / aprovados / reprovados / ignorados:
Artefatos e screenshot da rota:
Mutações externas reais: esperado zero; observado:
Limitações, risco residual e próximo passo:
Revisor e aceite visual quando aplicável:
```

## Gestão de mudanças e conclusão

Fases são fronteiras de revisão, não autorização para PRs gigantes. Dividir em mudanças pequenas de contrato/regressão, estado, fundação visual, componentes e validação; evitar dois executores editando simultaneamente `useGmail`, schemas ou compositor compartilhado. Se houver paralelização futura, definir propriedade explícita por arquivo e revisar integrações antes de unir o trabalho.

Ao iniciar cada fase, conferir divergências de `main`; incorporar trabalho de outras sessões sem reverter suas mudanças. Commit documental não precisa tocar runtime. Na implementação, nenhuma migração deve ser criada para uma tabela já existente; eventual desenho aditivo precisa de revisão de segurança, grants/RLS, plano de compatibilidade e autorização antes de qualquer aplicação. Não atualizar catálogos, ledger ou tipos gerados para simular que o banco foi modificado.

Rollback significa retornar código/variante ao comportamento compatível e preservar os drafts/IDs já produzidos. Não significa apagar mensagens, anexos do usuário ou tentar desfazer aceite remoto. Registrar dependências frontend/Edge e não oferecer ações novas como funcionais contra backend incompatível. A publicação permanece uma atividade separada e não autorizada por este plano.

Critério final da meta: 100 etapas com resultado sustentado, 80 AC aprovados por evidências reais, 36 achados resolvidos ou comprovadamente não reproduzidos com justificativa, aceite NAVY sobre o original, nenhum P0/P1 aberto nem dependência bloqueada ocultada. Se um requisito for removido por decisão do usuário, registrar mudança de escopo — não marcá-lo aprovado. Até lá, declarar entrega parcial com exatidão.

**Estado desta entrega:** plano produzido a partir de documentos, referências disponíveis e código revalidado; implementação não iniciada. Banco vivo, Edge publicada, testes do aplicativo e screenshots da rota redesenhada permanecem não validados. O PNG original Email NAVY continua como pendência explícita para a execução visual futura.
