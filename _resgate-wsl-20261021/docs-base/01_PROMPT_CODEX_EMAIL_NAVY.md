# PROMPT TÉCNICO PARA CODEX — ZAPP WEB V2 / EMAIL CHAT / NAVY

**Versão:** 2.0 — direção visual posterior à rejeição do primeiro protótipo.  
**Data da auditoria de origem:** 02/10/2026.  
**Repositório:** `adm01-debug/Zapp_Web_V2`.  
**Snapshot analisado:** `c82c0995dbdc30b316a7e88c979ea8fb5fa55969`.  
**Rota existente:** `?view=email-chat`.  
**Missão:** implementar no aplicativo real a experiência de e-mail conversacional da imagem `referencias/01_EMAIL_DIRECAO_VISUAL.png`, respeitando os contratos e critérios deste documento.

## 0. Instrução de execução e limites de autorização

Atue como responsável pela implementação frontend, integração e qualidade deste módulo. Execute o trabalho no código do projeto; não entregue outro plano no lugar da implementação. Antes de editar, faça a revalidação curta descrita abaixo. Trabalhe em fases verificáveis, com alterações pequenas e evidência de comportamento e aparência.

Este pedido autoriza a implementação e os testes em ambiente de desenvolvimento isolado. **Não autoriza enviar e-mails reais, editar contas reais, testar marcadores/lixeira em caixas de produção, fazer deploy, aplicar migrations em produção, alterar secrets, fazer merge automático ou escrever em bancos externos.** Se faltar uma autorização de infraestrutura, conclua as partes independentes e registre a dependência exata. Não falsifique um recurso para contornar o bloqueio.

O snapshot acima é evidência, não ordem para voltar o repositório a uma versão antiga. Preserve mudanças posteriores e trabalho de outras sessões. Não use `git reset --hard`, `git clean -fd`, force-push, `--no-verify` ou substituição integral de arquivos atuais por versões antigas. Não publique credenciais, conteúdos de `.env`, dados reais de e-mail ou sessões de autenticação em logs, screenshots ou commits.

Leia `AGENTS.md`, `CLAUDE.md` e instruções adicionais aplicáveis aos diretórios modificados. O `CLAUDE.md` examinado identifica o Supabase Cloud `tnnnlkbymytvtqngbbqh` como projeto do ZAPP; reconfirme o documento e a configuração atual antes de qualquer acesso. O banco externo de CRM e o de catálogo não são destinos de migrations deste módulo.

## 1. Referência visual obrigatória e hierarquia de decisão

Abra a imagem `referencias/01_EMAIL_DIRECAO_VISUAL.png` antes de programar. Abra também as três referências de Campanhas/Segmentos para observar a linguagem compartilhada. Todas têm dimensão nativa de **1672 × 941 px**.

A referência principal é a imagem mais recente de Email: fundo azul-marinho profundo, contornos azuis discretos, seleção azul evidente, cabeçalho de módulo com ícone, lista de conversas à esquerda, histórico conversacional ao centro e contexto à direita. A referência NÃO é o primeiro protótipo cinza, nem `zapp-email-redesign.html`, nem `zapp-email-desktop.png` da entrega rejeitada.

Ordem de prioridade:

1. Segurança, integridade dos dados e significado verdadeiro das ações.
2. Composição, hierarquia, identidade visual e densidade da imagem principal.
3. Componentes, temas, navegação e contratos reais do repositório atualizado.
4. Melhorias propostas neste documento que não acrescentem funcionalidades sem suporte.

A imagem é uma especificação de aparência, não evidência de que seus dados existem. Não codifique números, mensagens, avatares, links, notas ou empresas do exemplo em produção. Não crie gráficos, métricas ou módulos de Campanhas no Email: essas três imagens são referências de linguagem visual, não de escopo funcional.

### 1.1 Elementos ilustrativos que exigem adaptação semântica

- “Empresa verificada” só pode existir com campo e origem de verificação comprovados. Um `contact_id` indica vínculo cadastral, não empresa verificada. Quando útil, use “Contato vinculado” para esse significado; caso contrário, omita o selo preservando a composição.
- O duplo check da imagem NÃO permite usar `is_read` como leitura pelo destinatário. Use estados comprovados de envio, com texto acessível.
- O arquivo `deployment-log.txt` da imagem é apenas exemplo. A interface só mostra cartões para anexos reais da mensagem, ou fixtures explicitamente restritas aos testes.
- O cartão de implantação não pode ser gerado por uma condição `if remetente === Vercel`. Renderize conteúdo real sanitizado, ou uma representação genérica fiel. Não invente o resultado de um deploy.
- Site, LinkedIn, endereço, empresa e cargo só aparecem com dados reais autorizados. Não derive uma identidade empresarial verificada do domínio do remetente.
- “Adicionar participante” não altera destinatários de mensagens já enviadas. Pode abrir a edição de destinatários DA PRÓXIMA mensagem, com esse significado explícito.
- O indicador global “Online”, se existente, é do operador/sistema. Nunca simule presença ou digitação de quem enviou e-mail.
- Botões de IA, calendário, agendamento e outras ações da barra global só permanecem quando já têm uma ação real e autorizada. Não acrescente controles decorativos.

## 2. Revalidação obrigatória antes da primeira mudança

Registre branch, SHA de HEAD, estado do diretório e diferenças pertinentes em relação ao snapshot auditado. Use branch/worktree próprio conforme o ambiente e as regras do projeto; não adote caminhos absolutos de outras sessões. Havendo `graphify-out/graph.json`, faça query/path conforme `AGENTS.md`. A ausência do grafo não autoriza inventar resultados.

Leia os arquivos atuais da lista abaixo e confira seus consumidores. A auditoria complementar `02_AUDITORIA_REPOSITORIO.md` separa evidência estática de risco a reproduzir. Procure implementações novas antes de criar abstrações duplicadas.

```text
AGENTS.md
CLAUDE.md
package.json
playwright.config.ts
src/pages/lazyViews.ts
src/pages/ViewRouter.tsx
src/components/layout/AppShell.tsx
src/components/layout/VoiceCopilotFAB.tsx
src/components/layout/ViewContainer.tsx
src/services/navigation.service.ts
src/components/email/*
src/components/email/__tests__/*
src/components/gmail/EmailComposer.tsx
src/components/gmail/GmailInboxView.tsx
src/components/gmail/EmailThreadView.tsx
src/components/omnichannel/OmnichannelInbox.tsx
src/hooks/integrations/useGmail.ts
src/hooks/gmail/gmailApi.ts
src/hooks/gmail/gmailTypes.ts
src/hooks/crm/useContactNotes.ts
src/services/contact.service.ts
src/lib/emailHtml.ts
src/styles/tokens.css
src/styles/components.css
src/styles/diversity-overrides.css
src/components/talkx/talkxShared.tsx
src/components/dashboard/overview/DashboardCard.tsx
supabase/functions/gmail-send/index.ts
supabase/functions/gmail-sync/index.ts
supabase/functions/_shared/gmail-helpers.ts
supabase/functions/_shared/schemas.ts
supabase/migrations/20260827210200_email_attachments_table.sql
supabase/migrations/20260828220100_email_attachments_unique_msg_att.sql
supabase/schema-catalog.json
src/integrations/supabase/types.ts
```

Alguns caminhos acima são dependências a expandir durante a execução, não arquivos integralmente auditados nesta entrega. A lista de fontes do pacote informa a distinção. Examine também OAuth, webhook e cron quando uma mudança de sincronização afetar seus contratos. Não faça uma reforma de todos os módulos sob pretexto desse levantamento.

Produza uma matriz inicial curta: arquivo; capacidade existente; alteração necessária; dependência; teste correspondente. Não permaneça indefinidamente planejando: após a revalidação, comece pelas falhas de conteúdo/destinatário e por um esqueleto visual fiel com fixtures de teste isoladas.

## 3. Base existente: reaproveitar em vez de reconstruir

No snapshot de origem há React/TypeScript/Vite, Tailwind, primitivas Radix, TanStack Query, TanStack Virtual, react-resizable-panels, Framer Motion, Lucide, DOMPurify, Vitest e Playwright. Use as versões resolvidas pelo lockfile atual. O manifesto examinado requer Node >=24 e Bun >=1.3; confira o ambiente. Não faça upgrade geral de dependências nem misture gerenciadores para conseguir um build.

`EmailChatInbox` já organiza lista, conversa e detalhes. `EmailChatThread` já tem datas e histórico. `useGmail` e `gmailApi` já fornecem autenticação, consultas e mutations. A rota `gmail` continua usando componentes compartilhados: não a quebre ao melhorar `email-chat`.

O backend **já** aceita anexos em `send` e `reply`. `gmail-sync` **já** tem `get-attachment` e `get-thread`. A tabela `email_attachments` guarda metadados; o binário fica no Gmail e é buscado sob demanda. Existe uma migration posterior corrigindo a chave para `(email_message_id, gmail_attachment_id)`. Não recrie essas peças como se estivessem ausentes.

`useContactNotes` já gerencia notas de contatos. `talkxShared` contém primitivas visuais úteis, mas também regras de Campanhas. Reutilize ou extraia somente a parte visual necessária, sem acoplar Email a regras de disparo de campanhas. Preserve o design system do sistema e seus consumidores.

## 4. Arquitetura de layout: padrão NAVY, não um inbox genérico

### 4.1 Estrutura

O aplicativo já possui Sidebar global e MobileShell. Não crie uma segunda Sidebar dentro do Email. No AppShell auditado não há a mesma barra global superior desenhada no mockup; verifique HEAD antes de assumir um slot existente. Se continuar ausente, implemente uma barra de trabalho ESCOPADA ao Email com busca e ações reais. Não refatore o shell inteiro para simular uma imagem.

A hierarquia da área de Email deve ser:

```text
Shell do ZAPP existente — navegação e permissões preservadas
└── EmailWorkspace — escopo de tema, estado e dimensões
    ├── Barra de busca/ações reais, sem duplicar a global
    ├── Cabeçalho: ícone Email + título + subtítulo + Ajuda + Nova mensagem
    └── Grade de trabalho
        ├── Lista: tabs + filtros + conversas + paginação/estado da conta
        ├── Conversa: identidade + assunto + timeline + compositor
        └── Contexto: contato + participantes + arquivos + relacionadas + notas
```

Em modo incorporado, como no Omnichannel, o mesmo workspace deve evitar cabeçalhos duplicados e obedecer à largura do contêiner. Caso seja necessário `embedded`, introduza prop explícita com default compatível, em vez de detectar páginas por seletores frágeis.

### 4.2 Geometria proposta

Use largura disponível do CONTEÚDO, descontando a Sidebar; não apenas `window.innerWidth`. Como ponto de partida: lista 360–420 px, contexto 300–340 px, conversa com mínimo utilizável de aproximadamente 560 px. Esses números são diretrizes de projeto a validar, não medições do aplicativo atual.

Abaixo da largura necessária para os três painéis, transforme contexto em drawer acionável. Em larguras menores, exiba lista OU conversa. Não mantenha o botão Detalhes ativo quando o painel está apenas escondido por CSS. Em telas amplas, permitir redimensionamento com a dependência existente é aceitável desde que preserve mínimos, teclado, foco e preferência por usuário.

Use `min-width:0`, `min-height:0`, altura limitada pelo shell e rolagens delimitadas. O histórico e a lista têm suas próprias rolagens; o compositor não sai da área visível. Evite rolagem horizontal da página. No mobile, respeite barra superior/inferior do MobileShell, teclado virtual e safe area. Não adicione outro `100vh` interno que ignore esses descontos.

### 4.3 Paleta e tokens

Reproduza o azul-marinho profundo e os contornos azuis da referência, não o carvão quase uniforme da versão atual. Faça isso por tokens semânticos ESCOPADOS a `.email-workspace` e ao tema. Não sobrescreva `:root`, `html` ou todas as variantes de `Card`/`Button` do projeto.

Valores iniciais sugeridos para ajuste visual, não amostragem certificada:

```css
.email-workspace[data-email-theme="dark"] {
  --email-canvas: #031320;
  --email-panel: #071a29;
  --email-panel-raised: #0d2132;
  --email-border: #153a55;
  --email-text: #f4f8ff;
  --email-text-secondary: #b4c9df;
  --email-selected: #08294d;
  --email-selected-border: #147bff;
  --email-bubble-in: #0c2030;
  --email-bubble-out: #07366a;
}
```

Derive o acento principal dos tokens vigentes; ajuste somente os tokens locais quando necessário para fidelidade. Tokens de exemplos não podem ser inseridos sem medir contraste em todos os estados. Use a fonte sans/display do projeto; não troque a tipografia global para imitar uma imagem.

Botões principais com azul intenso, superfícies secundárias discretas, bordas finas, seleção com contorno e fundo — não somente cor do texto. Raios sugeridos: 10–12 px em controles e cartões compactos, 14–16 px em painéis/balões, círculos somente em avatar/ícone apropriado. Evite glow em todos os elementos, sombras pesadas e fontes de 9 px para informação essencial.

Trate portais Radix: menus/dialogs renderizados fora da raiz devem receber o contexto/escopo de tema, sem perder contraste. Preserve tema claro e alto contraste existentes; não force modo escuro global. Se um novo modo visual ficar limitado à raiz de Email, documente essa escolha.

## 5. Lista, filtros, busca e contagem

Separe três dimensões: conta; pasta/marcador; estado/refinamento. `Todas`, `Não lidas` e `Favoritos` referem-se a conversas no universo explicitamente selecionado. `Com anexos` e período são refinamentos combináveis. Caixa de entrada, Enviados, Rascunhos, Lixeira e todos os e-mails não são equivalentes.

Substitua a longa faixa horizontal de chips por controles legíveis: tabs principais, seletor de pasta, filtro de anexos, período e menu de marcadores. Mostre filtros aplicados e ação Limpar. Traduza IDs de marcadores de sistema na apresentação, preservando IDs e nomes de marcadores pessoais. Não exiba `CATEGORY_*` como nome bruto na experiência principal.

Cada linha deve ter avatar, nome do interlocutor, hora/data, assunto, trecho da última mensagem e indicadores reais de anexo/favorito/não lida. Não confunda estado selecionado e não lido. Garanta truncamento com acesso ao conteúdo completo. A estrela deve ser botão independente do botão de abrir conversa; não aninhe botões HTML.

Corrija a busca para contemplar remetente/endereços normalizados além de contato, assunto e trecho. Não prometa busca em corpo completo/anexos se o backend só busca assunto/snippet. Nesse caso, implemente o contrato correspondente ou ajuste a descrição do campo para o escopo real.

Remova o limite silencioso de 100 como universo da experiência. Implemente paginação no servidor com ordenação estável (`last_message_at` + desempate por ID), query key contendo conta, filtros e busca, cancelamento e estado de próxima página. Não filtre apenas a página corrente para simular uma busca completa. Evite N+1 de contagem ou anexos por linha.

Para `has_attachments`, use existência real de anexos/mensagens com esse indicador, com agregação segura e paginação do mesmo universo. **Não use a label inexistente `HAS_ATTACHMENT`.** Uma thread ainda não hidratada não equivale a “sem anexo”.

Contadores precisam dizer se medem conversas, mensagens, página carregada, cache sincronizado ou caixa do Gmail. Não calcule o total do provedor a partir de 100 linhas. Não use `messagesUnread` como `threadsUnread`. Para contagem indisponível, apresente estado indeterminado honesto, não zero fabricado.

**Paginar o banco local não torna a sincronização Gmail completa.** O helper auditado devolve `nextPageToken` mas não recebe cursor de continuação. Acrescente fluxo limitado e verificável de carregamento/hidratação, sem baixar toda a caixa indiscriminadamente. O usuário deve saber quando o histórico disponível é parcial.

## 6. Estado, isolamento de conta e identidade

Separe estado de servidor, estado de interface e estado de composição. Não mantenha uma cópia antiga da thread inteira como fonte definitiva do painel. Guarde sua identidade e derive os dados atuais da consulta/cache; preserve uma seleção que não está na página corrente por consulta específica autorizada.

Use uma fonte compartilhada de conta ativa para lista, detalhes, envio, rascunhos e downloads. Uma instância de `useGmail()` com `accounts[0]` em cada filho não é um contrato confiável de múltiplas contas. Não trate setters de hooks independentes como estado global.

As chaves de consulta e rascunho devem incluir escopo de usuário/sessão, conta e recurso apropriado. Limpe caches sensíveis no logout/troca de usuário. Ao alternar conta, cancele requisições antigas ou descarte resultados por geração/identidade; não deixe corpo da conta A aparecer em B.

Defina IDs separados, mesmo que por aliases nominais/branded types:

```text
LocalAccountId      UUID do banco
LocalThreadId       UUID de email_threads
LocalMessageId      UUID de email_messages
GmailThreadId       identificador opaco do Gmail
GmailMessageId      identificador opaco do Gmail
GmailAttachmentId   identificador opaco de anexo, contrato próprio
RfcMessageId        cabeçalho Message-ID do e-mail
```

Nunca passe GmailMessageId no campo GmailThreadId, nem use UUID local na rota do provedor. `storage_path` e `message_id_header` devem ser reconciliados com catálogo/tipos reais, não presumidos a partir de uma interface antiga. Não edite tipos gerados para fingir que uma coluna existe.

Crie um resolvedor de identidade único usado por lista/cabeçalho/contexto. Contato vinculado prevalece quando corresponde à conversa; sem vínculo, use participantes/remetente reais e endereço. Considere a última mensagem enviada pelo próprio operador: `last_from_address` pode ser a conta ativa, não o interlocutor. Evite “Desconhecido” se um endereço conhecido está disponível. Exponha “Não vinculado ao CRM” para falta de vínculo, sem criar cadastro automaticamente.

## 7. Thread, balões e leitura HTML

Mantenha uma thread do Gmail como unidade da conversa. O mesmo contato pode ter várias conversas com assuntos diferentes. Não funda histórico por nome, domínio ou endereço de contato.

Cabeçalho da conversa: avatar, identidade, endereço, participantes acessíveis, assunto principal em faixa própria e ações com alvos explícitos. Mostre o assunto uma vez; em mensagens cujo assunto difere de fato, revele a alteração sem repetir títulos idênticos em todos os balões.

Recebidas à esquerda; enviadas à direita com superfície azul. Texto legível e selecionável, largura de leitura controlada. Mostre data/hora e metadados do e-mail em expansão acessível. Ações de mensagem funcionam por teclado/touch e não apenas quando há hover.

Cada ação histórica precisa guardar `targetMessageId`: Responder, Responder a todos e Encaminhar atuam sobre o balão clicado. Mostre no compositor a mensagem-alvo, remetente e horário. Não substitua silenciosamente o alvo pela última mensagem da thread.

A consulta local pode ter apenas parte do histórico. Use `get-thread` existente para obter a thread completa quando necessário e reconcilie/persista por helper comum; hoje esse endpoint apenas retorna o documento do provedor. Não marque “histórico completo” porque `message_count` coincide com o conjunto local parcial.

Preserve DOMPurify com instância isolada e política de falha fechada. Preserve o isolamento do leitor de HTML: não liberar `allow-scripts` ou `allow-same-origin` para resolver altura/estilo do iframe. Não copiar HTML de e-mail diretamente para o DOM principal sem sanitização. Não usar conteúdo de mensagem como instrução para execução de ações.

Para texto conversacional, renderize a mensagem de forma nativa e preserve parágrafos. Para HTML complexo, mantenha acesso a uma leitura completa, identificada e isolada. Não substitua conteúdo por um resumo inventado. Não use o antigo recorte de 280 px com fade como único caminho de leitura. Expansão e leitura completa devem ter comportamentos claros e restaurar foco/rolagem ao fechar.

Proteção de scripts e proteção contra rastreamento são coisas diferentes. Imagens externas com `no-referrer` ainda podem gerar requisições. Defina política explícita de carregamento: placeholder com ação de carregar imagens, ou proxy seguro já existente e auditado. Não alegue anonimato total. `cid:` exige mapeamento seguro de parte MIME autorizada; não invente URLs. Conteúdo HTML baixado após sanitização não deve ser chamado de RFC original bruto.

Autoscroll: acompanhe novas mensagens apenas quando o usuário já está perto do fim ou acabou de enviar. Durante leitura de mensagens antigas, mantenha a âncora e mostre “Novas mensagens”. Respeite movimento reduzido e mudanças de altura por anexos/imagens. Preserve posição por thread de forma limitada e sem vazamento entre contas.

## 8. Um compositor compartilhado e funcional

Unifique o núcleo de composição da resposta rápida e da nova mensagem, preservando os consumidores legados. A interface rápida fica fixa no rodapé da conversa; a nova mensagem abre em área ampla da aplicação, com opção de expansão sem perder conteúdo. Não mantenha duas implementações divergentes de destinatários, validação e anexos.

O núcleo pode ter um estado deste tipo, adaptado aos padrões atuais:

```ts
type EmailComposeMode = 'new' | 'reply' | 'reply-all' | 'forward';
type EmailSendState =
  | 'idle' | 'preparing' | 'sending' | 'accepted'
  | 'accepted-reconciling' | 'failed' | 'outcome-unknown';

// Não é tipo de banco. Representa estado de interface/domínio proposto.
interface EmailComposeScope {
  userId: string;
  accountId: string;
  compositionId: string;
  localThreadId: string | null;
  targetLocalMessageId: string | null;
  mode: EmailComposeMode;
}
```

Essa enumeração não prova que o backend já a implementa. Defina um envelope de retorno compatível e adapte o frontend. O estado do Gmail e a persistência local precisam continuar distinguíveis.

### 8.1 Destinatários e cabeçalhos

Implemente parser/normalização compartilhados para nome+endereço, aspas e vírgulas, preservando endereços válidos e rejeitando CR/LF em campos de cabeçalho. Uma simples divisão por vírgula não é suficiente para `"Silva, Maria" <maria@exemplo.com>`. Evite normalizações destrutivas de pontos/plus tags ou regras específicas de Gmail aplicadas a qualquer domínio.

Resposta recebida usa `Reply-To` válido quando presente; caso contrário, From. Responder a todos deduplica a identidade do remetente e To, preserva Cc separado, remove a conta ativa e aliases comprovadamente seus. Não invente aliases. To e Cc devem ficar disjuntos. Bcc não pode ser revelado, inferido nem reinserido automaticamente a partir do histórico.

Antes do envio, mostre destinatários de forma expandível/editável e valide campos tanto no cliente quanto no schema Gmail do backend. Preserve assunto e cabeçalhos RFC de thread; não construa `In-Reply-To` com `<gmail_message_id>` quando o Message-ID real não está disponível. Busque a mensagem autorizada e recupere os cabeçalhos corretos.

### 8.2 Editor, teclado e rascunho

Negrito, itálico, listas, links e demais controles exibidos devem funcionar. Verifique se o HEAD já tem editor reutilizável. Na base auditada não identifiquei um editor rich text pronto nas dependências e componentes consultados. Se continuar ausente, documente uma decisão técnica de editor mantido e compatível, com aprovação exigida pela política de dependências do projeto. Não escreva um editor frágil com `execCommand`, nem deixe botões sem efeito. Preserve texto simples como alternativa e MIME multipart adequado quando houver HTML.

Use Enter para nova linha e Ctrl/Cmd+Enter para enviar como padrão proposto. Preferência de enviar com Enter pode ser oferecida sem ambiguidades. Em todos os casos: proteger IME (`isComposing`), tecla repetida, clique duplo e submissão enquanto prepara anexos. O bloqueio deve cobrir o início do handler, não apenas `disabled` depois que a mutation começou.

O rascunho pertence a `userId + accountId + compositionId`, com thread/alvo vinculados; alternar para outra conversa não move texto/anexos para o novo destinatário. Trocar entre modo compacto e expandido mantém a MESMA composição. Ao concluir envio de A após navegar para B, limpe apenas A. Snapshot imutável do payload evita alterações de destinatários durante um envio em andamento.

Fechar, guardar e descartar não podem ser sinônimos. Sem persistência efetiva, comunique “Mantido nesta sessão”, não “Salvo no Gmail”. Existe somente `create-draft` no backend examinado: autosave robusto exige create UMA vez, update do draft ID, prevenção de respostas fora de ordem e política de remoção após envio/descartar. Não crie um novo draft a cada tecla. Se essa persistência não puder ser entregue, mantenha proteção de navegação e documente a limitação, sem declarar a fase completa.

Arquivos File não sobrevivem ao reload por mágica. Persistência de rascunho com anexos deve estar coberta pelo mesmo backend autorizado; caso contrário, informe a necessidade de reanexar. Não guarde e-mails inteiros/base64 indefinidamente em localStorage, compartilhado por usuários, sem política de escopo, expiração e limpeza.

### 8.3 Envio confiável

Reaproveite `callGmailFunction` com autenticação. Alinhe o tipo de `replyEmail` para aceitar attachments; elimine o cast `as unknown as` usado para contornar esse contrato.

Separe: (a) falha antes do envio; (b) Gmail aceitou, banco local ainda não confirmou; (c) resultado desconhecido por interrupção de rede. Corrija a rota que retorna 400 após envio remoto aceito quando não acha a thread local. A UI não deve incentivar um segundo envio nesse caso.

Não repita automaticamente `messages.send` após timeout. Uma chave de requisição interna ajuda a reconciliar, mas não torna o provedor automaticamente idempotente. Se uma estratégia de idempotência persistente exigir schema, apresente migration aditiva e testes do fluxo, sem prometer garantia exatamente-uma-vez não demonstrada. Reconciliar um envio confirmado é diferente de reenviar.

Após aceite, guarde IDs reais retornados e reconcilie a mensagem via provedor para cabeçalhos, labels e anexos. Não perca o corpo em erro. Não mostre “Entregue”/“Lido” sem sinal que comprove esses estados. `is_read` segue sendo leitura na caixa local do operador.

## 9. Anexos: integrar o que já existe

Crie consulta de metadados por mensagens/conta autorizadas, com deduplicação e sem N+1 por balão. Renderize `EmailAttachmentCard` com ícone/tipo, nome, tamanho, baixar, visualizar quando suportado e estado de erro/progresso. O mesmo contrato alimenta balões e rail de arquivos. Não invente `storage_url` ou um bucket público.

Use `gmail-sync: get-attachment`. O retorno `data` é base64url de bytes: converta para `Uint8Array`/Blob, não para uma string UTF-8 destinada a texto. Respeite os IDs reais, sanitize filename para download, valide MIME e revogue object URLs no momento adequado. URLs devem ser geradas apenas a partir dos arquivos autorizados, não por concatenação arbitrária de dados da mensagem.

Pré-visualize somente tipos tratados com segurança: imagens raster, texto como texto escapado e formatos que o viewer efetivamente suporta. HTML/SVG ativo não pode ganhar uma aba com privilégios da aplicação. Não envie arquivo corporativo a visualizador externo de terceiros sem uma política explícita.

Na composição, liste nome/tamanho/remoção e total dos anexos. O schema atual limita a dez arquivos, enquanto a resposta rápida só mede 25 MiB brutos. Unifique regras a partir dos limites reais do endpoint/provedor e da expansão MIME/base64, documentando o teto adotado. Validação deve existir no servidor: não confiar apenas no navegador nem aumentar indiscriminadamente o limite do gateway.

Encaminhamento deve oferecer e preservar os anexos ORIGINAIS quando escolhidos, além dos novos. Não mostrar cartões de anexos encaminhados sem incluí-los no payload. Uma falha de obtenção deve impedir o envio silenciosamente incompleto e permitir remover explicitamente aquele anexo.

## 10. Contexto lateral e dados de contato

Preserve o rail com a hierarquia visual da referência, porém sustentado por dados reais. Estrutura sugerida: identidade; ações úteis; Sobre/dados profissionais; participantes; arquivos; conversas relacionadas; marcadores; notas internas. Se os dados de uma seção não existirem, mostre ausência honesta e não um dashboard de “Sim/Não”.

O join de contato no hook examinado só fornece id, name, email e avatar_url. Empresa, cargo, departamento, site e redes exigem consulta autorizada do cadastro existente. Não conclua que essas colunas faltam em todo o sistema apenas porque o join atual não as seleciona. Não crie colunas duplicadas antes de mapear o catálogo.

As ações “Email” e “CRM” devem executar navegação/composição real. “Site” e “LinkedIn” só com URL armazenada, protocolo seguro, `noopener` e identificação do destino. O CRM deve ser acessado pelo mecanismo de navegação atual, com permissões, não por uma rota inventada.

Participantes derivam dos cabeçalhos visíveis; Bcc recebido não é dado recuperável a inventar. O conjunto deve ser deduplicado e a tela indicar quando representa apenas as mensagens carregadas. Conversas relacionadas são outra consulta, paginada e limitada à conta/permissão, por vínculo de contato ou endereço comprovado. Selecioná-las abre outra thread, preservando o rascunho anterior.

Reutilize `useContactNotes` para contatos vinculados e autorizados. Rotule claramente “Notas internas”; elas nunca entram no conteúdo enviado. Não crie `email_notes` só para reproduzir o desenho. Evite chamar a API com string vazia ou usar um endereço como UUID de contato. Uma futura nota específica de thread seria outro contrato, não a mesma informação disfarçada.

Marcadores Gmail e tags internas têm origens diferentes; não altere ambos em uma única ação ambígua. Onde não houver mutation já existente, implemente contrato autorizado e teste, ou remova a ação ativa dessa entrega com explicação. Não deixe “Gerenciar” como botão morto.

## 11. Ações de caixa, sincronização e autorização

Arquivar no cabeçalho significa agir na THREAD. A implementação atual remove INBOX só da última mensagem. Acrescente uma operação de thread compatível com a API do Gmail e reconcilie todas as mensagens/labels locais afetadas. Arquivar não é mover para a lixeira. Não use `status:'archived'` como único indicador de TRASH.

Favoritar/desfavoritar, marcar lida/não lida, arquivar, lixeira e restaurar devem ter alvo e unidade explícitos. Se houver “Desfazer”, implemente a operação inversa real e seu possível erro; um toast não é rollback. Aguarde aceite ou use otimismo com rollback correto; não saia da conversa escondendo falha.

Na operação mark-read, confira a resposta de CADA chamada antes de modificar o espelho local. Trate falhas parciais. Não anuncie “lido” se o provedor recusou a operação. Evite marcar como lida uma thread antiga devido a dados atrasados durante navegação.

Todas as consultas/updates feitos com service role devem validar a cadeia usuário → conta ativa → thread → mensagem → anexo. A validação da conta no início do handler não substitui a restrição de cada lookup local por ID externo. Não ampliar acesso de supervisor/admin a caixas que o produto não autorizou. RLS do metadata e autorização de download precisam ter uma política coerente, documentada, sem relaxamento automático.

A sincronização deve distinguir sucesso, parcial, falha e histórico incompleto. Não apagar `last_error` logo depois de o helper comunicar falhas parciais. Atualize também a query da conta quando mudar seu estado. Revise a rota incremental: no snapshot ela solicita vários tipos de evento, mas aplica apenas mensagens novas, por uma busca genérica limitada de inbox. Para afirmar sincronização de lidas, favoritos, lixeira e exclusões, processe os eventos e cursores correspondentes e teste-os. Preserve a autenticação dos jobs/webhooks; não os publique/desproteja para facilitar o teste.

Agregados de thread devem ser determinísticos: data/preview/remetente da última mensagem real por ordem estável, quantidade correta do universo definido, labels conforme semântica do provedor, unread a partir das mensagens apropriadas. Não deixar uma mensagem antiga sobrescrever o resumo enquanto o loop sincroniza várias da mesma thread.

O schema Gmail é `GmailSendActionSchema`, não o schema genérico de outro endpoint. Acrescente validação de endereços, limites e caracteres de cabeçalho onde necessário; respeite as diferenças de Zod da aplicação e das Edge Functions. Não altere contratos de IA ou serviços não relacionados ao mudar esse arquivo compartilhado.

## 12. Estados de interface, desempenho e acessibilidade

Diferencie carregamento inicial da conta, conta desconectada, acesso negado, falha de listagem, lista vazia, filtro vazio, atualização em andamento, offline, histórico parcial e erro de mensagem/anexo. Falha de rede não é “Nenhuma mensagem”. Um skeleton deve preservar a geometria final sem ficar infinito.

Exponha callbacks de erro e pending das queries/mutations. Preserve dados já visíveis durante refresh, com indicador discreto. Evite fazer a tela piscar ou voltar ao início após invalidar uma query. Use abort/cancelamento para buscas e descarte respostas superadas.

Não monte iframes pesados ou baixe binários para todas as mensagens de uma vez. Use carregamento sob demanda e paginação. A dependência de virtualização já existe; aplique onde medições/fixtures de volume mostrarem necessidade, preservando mensagens de altura variável, seleção de texto, acessibilidade e âncora de scroll.

Reavalie o VoiceCopilotFAB: hoje é fixed bottom/right z50, na mesma região do compositor. Crie uma estratégia de slot/offset por layout ou ação alternativa no header. Não simplesmente esconda uma funcionalidade global sem alternativa, nem aumente z-index até encobrir o botão Enviar.

Ações devem ter nome acessível, foco visível e disponibilidade por teclado. Respeite Tab/Shift+Tab, Esc e restauração de foco em dialogs. Considere a WCAG 2.2: 4,5:1 para texto normal, 3:1 para texto grande, requisitos pertinentes de foco/contraste não textual; alvos AA de 24×24 CSS px ou exceções aplicáveis. Adote 40–44 px nas ações principais/touch como decisão de usabilidade, sem confundir isso com a redação do critério AA.

Não use apenas azul, verde ou vermelho para transmitir estado. Mensagens novas e resultado de envio podem ser anunciados por live region sem reler toda a thread. Reduza animação conforme preferência e não faça cada refetch reanimar todo o histórico.

## 13. Plano de implementação em dez fases

Execute as fases em sequência com evidência. Não solicite confirmação repetitiva para correções de código/testes já dentro deste escopo; solicite apenas para ações de produção ou mudanças adicionais que realmente dependam de autorização.

### Fase 1 — Baseline e contratos

Revalidar snapshot, instruções, consumidores, schema e referências. Registrar testes preexistentes e estado do ambiente. Criar testes que reproduzam omissão de anexos, alvo histórico e risco de estado cruzado. Definir IDs, escopo de conta, payload e semântica de envio. Saída: matriz inicial, decisões e falhas reproduzíveis.

### Fase 2 — Correções de conteúdo e envio

Corrigir payload de attachments no compositor, tipos de reply, mensagem-alvo, Reply-To, To/Cc/Bcc e cabeçalhos. Proteger submissão concorrente e separar aceite remoto de persistência local. Saída: testes de destinatários, MIME/anexos e respostas remotas aprovados.

### Fase 3 — Estado e consultas

Isolar conta/seleção/rascunho; remover objeto de thread obsoleto como fonte definitiva; implementar queries/cursors/filtros/contadores honestos e hidratação necessária. Manter compatibilidade de `useGmail` para consumidores não migrados. Saída: trocar A↔B e conta não mistura nada.

### Fase 4 — Fundação visual NAVY

Construir o workspace, header, grade adaptativa e tokens locais. Renderizar a rota real com fixtures controladas. Comparar screenshot 1672×941 com a referência; corrigir composição ANTES de empilhar componentes. Saída: shell visual fiel, sem esconder regressões dos outros módulos.

### Fase 5 — Lista e cabeçalho de conversa

Entregar tabs/filtros/seleção/avatar/tempos/marcadores/paginação com ações reais; assunto único e metadados. Saída: navegação por mouse, teclado e mobile funcionando no layout final.

### Fase 6 — Timeline e anexos

Reformular balões, leitura HTML e arquivos; conectar metadata+get-attachment; manter segurança e scroll. Saída: texto longo, HTML, tabelas, imagens e múltiplos anexos utilizáveis, sem corte do conteúdo.

### Fase 7 — Compositor unificado e rascunhos

Integrar editor funcional, recipients chips, alvo explícito, nova mensagem ampla, guardas e persistência definida. Saída: compactar/expandir/navegar/recarregar nos limites prometidos, sem perda nem duplicação.

### Fase 8 — Contexto e ações de caixa

Conectar identidade, dados existentes, notas, relacionados e marcadores; corrigir operações thread-level e rollback. Saída: nenhuma ação de rail é decorativa; nenhum dado é inferido indevidamente.

### Fase 9 — Sincronização e estados extremos

Tratar falhas parciais, eventos incrementais, agregados, offline/permissões, volumes e acessibilidade. Saída: comportamento coerente com mudanças originadas fora do ZAPP no provedor controlado de testes.

### Fase 10 — Validação, documentação e entrega revisável

Executar matriz funcional e visual, revisar diff, documentar migrações e limitações. Entregar screenshots e relatório verificáveis; branch/PR somente conforme permissões do ambiente. Não fazer deploy ou merge de produção automaticamente.

Organização sugerida de novos componentes: `EmailWorkspaceHeader`, `EmailThreadToolbar`, `EmailThreadRow`, `EmailConversationHeader`, `EmailTimeline`, `EmailAttachmentCard`, `EmailComposerCore`, `EmailContextRail`. Esses nomes são PROPOSTOS; não afirme que já existem. Divida por responsabilidades, não por uma meta de quantidade de arquivos. Mantenha facades/props compatíveis quando componentes atuais forem compartilhados.

## 14. Testes e régua visual obrigatórios

Use `03_CRITERIOS_DE_ACEITE.md` como checklist executável. Existem nove arquivos em `src/components/email/__tests__` no snapshot, além de testes de schemas. Preserve a cobertura de sanitização e bypasses. Não conte quantidade de testes como prova de correção se os mocks eliminam o fluxo defeituoso.

O teste atual de `EmailChatThread` mocka os balões sem as ações e espera arquivamento de uma única mensagem. Ao mudar o contrato para thread, atualize expectativas com justificativa e adicione regressões reais. Não simplesmente reduza assertions para obter verde.

Acrescente projeto Playwright específico, por exemplo `chromium-email-visual`, e specs correspondentes se ainda não existirem. Esse nome é uma proposta. O `chromium` atual coleta somente auth.spec; rodar um spec Email sob ele pode executar zero testes. O catch-all authenticated depende de login real; evite herdá-lo acidentalmente nos testes de fixtures. Exclua specs de sessão falsa desse catch-all, como já feito para outros módulos, e confira o número de testes executados.

Reutilize o padrão de sessão falsa e backend interceptado existente em outros testes, com permissões mockadas coerentes, sem alterar os guards de produção. Todas as requisições mutáveis externas devem ser bloqueadas/interceptadas. `get-attachment` usa binários sintéticos, não arquivos de clientes. Testes em conta real de homologação só com autorização e destinatários controlados.

Capturas: referência nativa 1672×941; 1920×1080; 1440×900; 1366×768; 1024×768; 768×1024; 390×844; 320 px de largura e zoom 200%. Avalie Sidebar expandida/recolhida, contexto aberto/fechado, nova mensagem, resposta com múltiplos anexos, HTML, nenhum contato, loading e erro. A referência não exige replicar suas informações fictícias.

Há dois tipos de comparação diferentes: (1) referência artística para composição/cores/hierarquia; (2) screenshot de DOM aprovado para regressão determinística. Não use o limiar de pixel-diff de regressão para fingir comparação exata entre conteúdo real e uma imagem gerada. Documente diferenças funcionais justificadas; não aceite substituir o resultado por um inbox genérico apenas porque passou no teste.

Comandos de base do manifesto, depois de instalar com lockfile congelado e conferir a configuração atual:

```bash
bun run typecheck
bun run test -- src/components/email/__tests__
bun run test:contracts
bun run build
```

Execute também lint dos arquivos alterados e gates do repositório. Após criar e registrar o projeto/spec de Email, execute `bun run test:e2e -- --project=chromium-email-visual` ou o nome realmente configurado. Não declare esse comando disponível antes de adicioná-lo. A configuração auditada usa `PLAYWRIGHT_BASE_URL` e servidor isolado na porta 5173; preserve coerência entre browser e servidor.

Não altere snapshots/baselines automaticamente para mascarar uma regressão. Não edite catálogos ou registros de migration manualmente só para deixar guard verde. Caso um comando dependa de credencial/recurso indisponível, registre “não executado — motivo”, não “aprovado”. Falhas preexistentes de outros módulos devem ser documentadas, não corrigidas por uma refatoração ampla fora do escopo.

## 15. Entrega final esperada do Codex

Entregue o código integrado, não uma imagem nem HTML externo substituindo a rota. Inclua:

- Resumo objetivo das alterações, branch/SHA e arquivos principais.
- Matriz “reaproveitado / corrigido / novo / pendente”, com evidência por arquivo e teste.
- Comandos executados, quantidade real de testes, resultados e limitações.
- Screenshots da rota implementada nos estados e tamanhos acordados, sem dados reais expostos.
- Contratos novos/alterados, migrations eventualmente propostas, dependências e plano de rollback sem perda de dados.
- Pendências de produção separadas de pendências de código; nada de sinalizar como concluído o que permanece demonstrativo.

**Definição de pronto:** fidelidade substancial à referência NAVY e comportamento verdadeiro ponta a ponta no ambiente autorizado. Um layout bonito com anexos fictícios, botões sem ação, destinatário errado, perda de rascunho ou envio duplicado está reprovado. Um sistema funcional que ignore a referência e retorne ao primeiro design também está reprovado.

Comece pela revalidação da Fase 1 e prossiga até a entrega dentro do escopo autorizado.
