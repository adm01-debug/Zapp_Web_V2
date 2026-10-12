# Inventário de funcionalidades planejadas e não executadas — ZAPP Web V2

**Data:** 11/10/2026 · **Base verificada:** `main` @ `99aa53f` · **Natureza:** análise documental, somente leitura (nenhum
código, banco, deploy ou configuração foi alterado).

Este inventário responde a uma pergunta: **o que foi planejado para o sistema e ainda não está entregue**, seja só em
parte, seja sem ter começado. Ele atualiza a reconciliação de 03/10 (`docs/reconciliation/`, baseline `2e7cf81`)
com o código de hoje. Entre 04/10 e 11/10 entraram vários lotes que fecharam itens dados como abertos e abriram
outros.

O documento tem duas camadas:

- **Este README** é a visão consolidada: números, o que o usuário vê e não funciona, riscos, prioridades, decisões
  pendentes do dono e documentos que contradizem o código.
- **Os 8 anexos** trazem a verificação item a item: ID do plano, estado, evidência `arquivo:linha`, o que falta,
  impacto e prioridade.

| Anexo | Frente |
|---|---|
| [01](01-talkx-multiplix.md) | Talk X (campanhas em massa) + Multiplix |
| [02](02-ia-dashboard.md) | Inteligência artificial + Dashboard, relatórios e KPIs |
| [03](03-telefonia-teamchat.md) | Telefonia (VoIP, ligações WhatsApp, voz) + Team Chat |
| [04](04-contatos-crm-email.md) | Contatos, CRM 360, SalesView, Journey + E-mail (Gmail) |
| [05](05-tarefas-catalogo-mapa-go.md) | Tarefas/Quadro, Catálogo, Mapa/Busca, Etiquetas, Evolution GO multi-conexão, Filas, SLA e distribuição |
| [06](06-inbox-arquivos-design.md) | Inbox, Chat, Arquivos e mídia, Volume, Talk Me, Inbox 360, layout, skins, design system e tipografia |
| [07](07-infra-ci-banco-governanca.md) | Infraestrutura, CI, banco, segurança, LGPD, backup, observabilidade, performance e fábrica de agentes |
| [08](08-legado-e-codigo.md) | Documentos antigos de funcionalidades, issues abertas e varredura do código inteiro (TODO, "em breve", fachadas, órfãos) |

---

## 1. Resumo executivo

- **Fontes:** foram lidos mais de 60 planos, relatórios de status, handoffs e especificações, entre os 1.393
  arquivos de `docs/`. Cada pendência foi conferida no código: `src/`, as 82 Edge Functions, as migrations e o
  catálogo do banco versionado.
- **Volume:** as 8 frentes registraram cerca de **1.340 linhas de pendência**:

  | Estado | Linhas | Significado |
  |---|---:|---|
  | Parciais | 526 | Existe parte da entrega |
  | Não iniciadas | 590 | Nada no código entrega o item |
  | Bloqueadas | 223 | Dependem do dono, de credencial ou de terceiro |

  Há ainda **86 itens não verificáveis** a partir do repositório e **146 divergências** em que o documento diz uma
  coisa e o código mostra outra.

  O número é **ordem de grandeza, não soma de funcionalidades distintas**. Planos se sobrepõem: o registro de
  achados da IA repete o plano IA, e o Talk X tem etapas e cartões apontando para o mesmo item. Algumas frentes
  agrupam várias etapas numa linha.

O quadro geral tem quatro mensagens.

1. **Há funcionalidade que o usuário vê e que não faz nada.** Isso é mais grave do que o que falta construir.
   - Mensagem agendada não é enviada.
   - Chatbot, automações, follow-up e mensagem de ausência são salvos e nunca executados.
   - "Iniciar" da campanha clássica não envia nada.
   - "Iniciar agora" do Multiplix termina como "Concluído" com zero envios.
   - Relatório agendado por e-mail não tem quem o envie: nada no código nem no `pg_cron` de produção lê a configuração.
   - A pesquisa CSAT não é coletada.
   - Vários botões gravam em tabela ou função que não existe, ou mostram sucesso sem ter feito nada (§3).
   - Por enquanto o defeito é latente: em 12/10 as tabelas de mensagens agendadas, campanhas clássicas, relatórios
     agendados, automações e chatbot estavam vazias em produção. Isso mostra que não há uso hoje, não que nunca houve:
     o código permite apagar esses registros e nenhum histórico foi consultado. O próximo uso falha em silêncio.
2. **Os motores de envio em massa não têm prova de funcionamento em produção.**
   - Não há registro de envio real do Talk X: o ensaio interno (X035) está bloqueado. Um teste manual feito fora do
     repositório não estaria visível nesta varredura.
   - O teto diário por número não conta os envios do Multiplix, o que arrisca o bloqueio do chip da empresa.
   - O envio de produto pelo catálogo também nunca foi provado em produção.
3. **Segurança e LGPD têm pendências P0/P1 concretas** (§4).
   - O CRM externo dá `EXECUTE` à chave pública em 5 funções. Se elas não tiverem checagem interna (não confirmado
     aqui), ficam expostos cerca de 57 mil empresas e 48 mil clientes.
   - 7 dos 12 achados P0/P1 de segurança de 07/10 seguem abertos.
   - Não há expurgo nem exportação de dados ao titular.
   - Não existe prova de que o backup restaura.
   - Não há monitoramento de produção.
4. **A documentação não é confiável como fotografia do sistema**, e erra nas duas direções (§7).
   - Exagera: `COMPLETE_SYSTEM_FEATURES.md` e `IMPROVEMENT_PLAN.md` dizem "100% implementado" com cerca de 15 telas
     que são fachada.
   - Subestima: vários planos dizem "nada executado" quando o código está quase todo pronto, e o placar do Talk X
     está congelado em 2/200.

## 2. Placar por módulo (planos vigentes)

"Concluído" = o artefato existe no código e está ligado a quem o usa. **Nada aqui é prova de funcionamento em
produção**: banco, deploy e telas logadas não foram exercitados.

"Não verificável" = depende de banco vivo, deploy, navegador logado, outro repositório ou aceite humano. "Outros" =
divergente, substituído, cancelado ou não aplicável. Em cada linha, as seis colunas somam o total.

| Módulo | Plano vigente | Total | Concluído | Parcial | Não iniciado | Bloqueado | Não verificável | Outros | Anexo |
|---|---|---:|---:|---:|---:|---:|---:|---:|---|
| Talk X | V4 `X001–X200` (01/10) | 200 | 37 | 114 | 42 | 7 | 0 | 0 | 01 |
| Talk X | 17 telas do mock | 17 | 0 | 15 | 2 (Relatório, Importação CRM) | 0 | 0 | 0 | 01 |
| Multiplix | Finalização `F01–F100` (29/09) | 100 | 54 | 27 | 11 | 7 | 1 | 0 | 01 |
| IA | Plano IA 200 etapas (29/09) | 200 | 50 | 88 | 53 | 9 | 0 | 0 | 02 |
| Dashboard | Plano Dashboard 100 (30/09) | 100 | 19 | 36 | 35 | 4 | 6 | 0 | 02 |
| Dashboard | Prompt Mestre WIDE 24" (08/10) | 11 | 0 | 0 | 11 | 0 | 0 | 0 | 02 |
| Telefonia | Finalização `T01–T100` | 100 | 78 | 7 | 8 | 6 | 1 | 0 | 03 |
| Telefonia | Ligações WhatsApp `meowcaller` E001–E100 | 100 | 0 | 6 | 4 | 90 | 0 | 0 | 03 |
| Team Chat | Plano F `F01–F100` (ledger de fato) | 100 | 22 | 32 | 41 | 3 | 2 | 0 | 03 |
| Contatos | Contatos 100 (29/09) | 100 | 97 | 1 | 0 | 1 | 0 | 1 (divergente) | 04 |
| Contatos | Contatos por jornada `CT-001–CT-130` (08/10) | 130 | 3 | 21 | 105 | 1 | 0 | 0 | 04 |
| Contatos | Sidebar do contato em 3 seções | 100 | 60 | 2 | 9 | 4 | 25 (repo Singu) | 0 | 04 |
| Journey | SalesView + Journey 50 | 50 | 42 | 7 | 0 | 0 | 1 | 0 | 04 |
| Journey | Histórico completo `S001–S100` + fase K | 111 | 28 | 8 | 75 | 0 | 0 | 0 | 04 |
| E-mail | Sidebar `ES-01–ES-50` / alertas `U01–U12` / link `E01–E14` | 76 | 49 | 6 | 11 | 2 | 8 | 0 | 04 |
| Tarefas | Finalização 100 / Fusão Quadro→Tarefas 50 | 150 | 128 | 1 | 4 | 2 | 15 (portões manuais) | 0 | 05 |
| Catálogo | Finalização `CT` 100 | 100 | 77 | 7 | 2 | 13 | 0 | 1 (divergente) | 05 |
| Mapa | Finalização 100 | 100 | 95 | 2 | 1 | 2 | 0 | 0 | 05 |
| Etiquetas | Remoção 100 | 100 | 54 | 2 | 1 | 7 | 32 (só evidência histórica) | 4 (substituídos/n.a.) | 05 |
| WhatsApp | Multi-conexão Evolution GO 50 | 50 | 19 | 10 | 7 | 7 | 7 | 0 | 05 |
| Atendimento | Distribuição (DOC-DIST-001) + escalonamento de SLA (DOC-CRON-001) | 13 | 0 | 2 | 11 | 0 | 0 | 0 | 05 |
| Arquivos | Redesign 50 / Cartão = mockup 60 | 110 | 54 | 33 (25 prontos sem consumidor) | 17 | 1 | 3 | 2 (cancelados) | 06 |
| Mídia | Controles de volume 50 / Volume de mídia 50 | 100 | 88 | 2 | 5 | 1 | 4 | 0 | 06 |
| Talk Me | Plano 100 / Refinamento 50 | 150 | 108 | 28 | 0 | 6 | 7 | 1 (substituído) | 06 |
| Visual | Skins Opera GX 100 | 100 | 64 | 8 | 0 | 20 (QA logado) | 6 | 2 (n.a.) | 06 |
| Visual | Auditoria de fontes 100 / Correção de layout 30 | 130 | 69 | 30 | 8 | 3 | 14 | 6 (n.a./substituídos) | 06 |
| CI | GitHub Actions 100 (01/10) | 100 | 67 | 9 | 9 | 12 | 3 | 0 | 07 |
| Banco | Banco Único 201 | 201 | 0 | 0 | 0 | 175 (plano se declara não executável) | 18 (entregas do Singu) | 8 (obsoletos) | 07 |
| Engenharia | Paridade V1/V3 100 | 100 | 2 | 71 | 21 | 6 | 0 | 0 | 07 |
| Segurança | Achados P0/P1 de 07/10 | 12 | 5 | 0 | 7 | 0 | 0 | 0 | 07 |
| LGPD / Backup | Checklists da política e da estratégia | 21 | 0 | 1 | 13 | 2 | 5 | 0 | 07 |
| Fábrica de agentes | Ferramentas `AT-001–018` + `GM-001–006` | 24 | 3 | 0 | 0 | 18 | 3 | 0 | 07 |
| Legado | `COMPLETE_SYSTEM_FEATURES`, `IMPROVEMENT_PLAN`, `FORGOTTEN_FEATURES`, README, POP etc. | — | ver anexo | 46 | 16 | 6 | — | 16 (divergentes) | 08 |

Leituras rápidas do placar:

Percentual = concluído ÷ total de cada plano. As linhas que somam dois planos no placar aparecem aqui separadas.

- **Quase prontos (≥ 90%):** Tarefas — finalização (98%), Contatos 100 (97%), Dashboard Navy (97%), Mapa (95%),
  Volume de mídia (94%) e redesign de Contatos (100%).
- **No meio do caminho:** Arquivos — redesign (88%), Controles de volume (82%), Talk Me — refinamento (78%), Telefonia
  (78%), Catálogo (77%), Talk Me 100 (69%), Skins (64%), Fusão Quadro→Tarefas (60%), Multiplix (54%) e Etiquetas
  (54%).
- **Muito atrás:** IA (25%), Talk X (18,5%), Dashboard 100 (19%), Cartão de arquivo (17%; 25 etapas prontas sem tela
  que as use), Team Chat (22%), Multi-conexão GO (38%), Contatos por jornada (2%) e Journey histórico (28%, só camada
  interna, nada visível ainda).
- **Parados por decisão:** Ligações WhatsApp `meowcaller` (90 bloqueados nos gates G0/G1) e Banco Único (175
  dependem do dono).

## 3. O que o usuário vê e não funciona

São botões, telas e promessas que existem na interface (ou na documentação entregue ao usuário) e não entregam o
que mostram. **É a lista que mais afeta a confiança de quem usa o sistema.**

Os itens 1 a 7 foram conferidos também no banco de produção em 12/10, só com leitura (`SELECT`). Nenhum dos 13 jobs
agendados do `pg_cron` cuida deles, e nenhuma função do banco lê `scheduled_messages`. As tabelas
`scheduled_messages`, `campaigns`, `scheduled_report_configs`, `automations` e `chatbot_flows` estavam vazias. Isso
mostra que não há uso hoje; como o código permite apagar esses registros e nenhum histórico foi consultado, não dá para
afirmar que nunca foram usados. Nos 245 workflows do N8N, nenhum nome ou descrição trata desses recursos. O conteúdo dos nós não foi aberto um a um, e
outros chamadores externos não foram conferidos.

| # | O que o usuário vê | O que acontece de fato | Evidência | Anexo |
|---|---|---|---|---|
| 1 | Agendar mensagem pelo chat ou calendário | Grava como `pending` e nada processa: não há Edge Function, cron ou trigger no repositório, nem job no `pg_cron` de produção, que consuma `scheduled_messages`. Nenhum workflow do N8N tem nome ou descrição ligados ao tema (conteúdo não aberto um a um). A tabela estava vazia em 12/10, então o envio real não foi testado; pelo que existe no código e no banco, o próximo agendamento não sairá | `src/hooks/chat/useScheduledMessages.ts` (só a tela lê e grava) | 08 (L-01) |
| 2 | Chatbot e Chatbot L1 configurados | Mensagem recebida não aciona fluxo; `chatbot-l1` só é chamado pelo botão "testar conexão" | `src/components/settings/ChatbotL1Config.tsx:234` | 08 (L-04), 02 |
| 3 | Automações, sequências de follow-up, mensagem de ausência, boas-vindas e encerramento | Regras são salvas e nenhum executor versionado roda; a própria tela admite | `src/components/settings/MessagesSettings.tsx:41` | 08 (L-05 a L-08) |
| 4 | "Iniciar" em Campanhas Clássicas | Só muda o status para "enviando", que fica assim para sempre | `src/components/campaigns/CampaignsView.tsx:175` | 08 (L-11) |
| 5 | "Iniciar agora" no Multiplix | Termina "Concluído" **com zero envios**; o "Iniciar" do monitor falha por falta de bloco e conexão | `useMultiplixDispatches.ts:408-417` | 01 (MX01) |
| 6 | Relatórios automáticos por e-mail (aba Relatórios) | Nada lê `scheduled_report_configs`; a função de envio lê outra tabela e não tem agendamento | `src/components/dashboard/ScheduledReportsManager.tsx:94` | 02 |
| 7 | CSAT e indicadores de satisfação | A pesquisa foi removida e `submitSurvey` não tem chamador; os KPIs ficam sem dado real | `src/hooks/business/useCSAT.ts:87` | 08 (L-12) |
| 8 | Encaminhar um arquivo na aba Arquivos | Botão "Disponível em breve" no cartão, na lista, na tabela e nos detalhes, embora o envio já funcione pela seleção em lote | `src/components/inbox/tabs/FileCard.tsx:112-120` | 06 |
| 9 | Encaminhar mensagem para grupo | A opção aparece e sempre falha: não há transporte para grupos | `useChatPanelHandlers.ts:254` | 06 |
| 10 | Mensagens interativas (botões e listas) | O construtor abre, mas o envio é recusado no chat | `useChatPanelHandlers.ts:421` | 06, 08 (L-02) |
| 11 | "Definir conexão padrão" | Chama a função `set_default_whatsapp_connection`, cuja migration não está no repositório | `useConnectionsManager.ts:306` | 05 |
| 12 | "Salvar WhatsApp do departamento" | Grava na tabela `department_whatsapp_configs`, que não existe: falha sempre | `useDepartmentManagement.ts:245` | 05, 03 |
| 13 | "Sincronizar histórico" da conexão | Mostra "Sincronização concluída! 0 mensagens" sem ter feito nada (Evolution GO) | `ConnectionsView.tsx:75` | 05 |
| 14 | Menu Integrações (6 abas), Configurações da instância, "Marcar como não lida" | Endpoints sem equivalente na Evolution GO; quebram | `IntegrationsPanel.tsx:220-228`, `InstanceSettingsDialog.tsx:53` | 05 |
| 15 | Atalhos "Alertas de Sentimento", "Tendências de Sentimento" e "Ver todas" no Dashboard | Abrem página 404 | — | 02 |
| 16 | "Pendentes da fila" no Dashboard do agente comum | Sempre 0: a função filtra pelo agente e depois conta só conversa sem responsável | — | 02 |
| 17 | Campanha pausada no Talk X | Abre a tela "Em andamento"; a tela própria existe pronta e não está ligada | `TalkXCampaignPaused.tsx` sem import | 01 (X156) |
| 18 | Campanha concluída no Talk X | Não há relatório; abre o monitor | `TalkXView.tsx:216` | 01 (X161–X169) |
| 19 | Mídia em template ou campanha do Talk X | Só por URL pública: nenhuma migration cria o bucket `talkx-media`, e o upload pronto não está montado | `TalkXMediaDropzone.tsx:25-27` | 01 (X061, X095) |
| 20 | Team Chat: gestão de departamento, fixar, arquivar, "Performance", sair, renomear, transferir, aceitar convite | Gestão inacessível (permissão nunca passada); ações desabilitadas, "em breve" ou componentes sem fiação | — | 03, 08 |
| 21 | Team Chat: confirmação "lido" e busca | O tick "lido" nunca aparece; a busca só acha mensagens já carregadas | — | 03 |
| 22 | Journey (histórico do cliente) | Sem e-mails e ligações; "De" maiúsculo nas datas; localização exibida como JSON. A correção existe em `src/lib/journey` e não está ligada à aba | `JourneyTab.tsx` | 04 |
| 23 | Painel do contato em 3 seções, contexto de empresa no E-mail, botão CRM 360° | Prontos no código e **invisíveis em produção**. A tela só os mostra com duas chaves ligadas: a do build e a do banco. Em 12/10 a do banco (`crm.integration`) estava ligada, mas o código publicado em produção foi gerado com `VITE_CRM_INTEGRATION_ENABLED` = `"false"` (conferido no bundle em 12/10) | `src/hooks/system/useCRMIntegrationEnabled.ts:6-7` | 04 |
| 24 | Download na aba Arquivos | Sempre bloqueado, ignorando a permissão do perfil (o chat respeita), contra a decisão D06 | `FileDetailPanel.tsx:79-81` | 06 |
| 25 | "Ouvir gravação" de ligação | Não aparece: nenhuma das 22 ligações registradas em produção tem gravação (`recording_url` vazio em 12/10) e nenhum job do `pg_cron` sincroniza ligações. A falta do segredo `BITRIX_WEBHOOK_URL` vem de `docs/CAPACIDADES.md` e não foi conferida no painel | — | 03 |
| 26 | Telas apresentadas como ativas: pagamentos, Meta CAPI, Google Calendar, n8n, Sentry, WhatsApp Flows, Instagram/Telegram, templates "aprovado local", PWA/push e idiomas | Fachadas sem backend real, descritas como prontas na documentação e na página "Documentação" do app | `SERVICE_WORKER_ENABLED = false` (`src/config/service_worker.ts:7`) | 08 |
| 27 | Ligação WhatsApp com áudio dentro do sistema | Não existe; o plano `meowcaller` está em 0/100, parado no gate G0 | — | 03 |

## 4. Riscos críticos (segurança, LGPD, dados e operação)

| Risco | Situação | Prioridade | Quem destrava | Anexo |
|---|---|---|---|---|
| **CRM externo aberto à chave pública (GATE C) — exposição não confirmada** | 5 funções do banco de CRM `pgxfvjmuubtbowutlide` têm `EXECUTE` para `anon`. Segundo `docs/crm-external-grants.md:23-31`, sem checagem interna (`auth.jwt()`/`auth.role()`) quem tem a chave pública lê ~57 mil empresas e ~48 mil clientes. O corpo das funções está no banco do CRM, fora deste repositório, e não foi lido: o primeiro passo é conferir essas checagens | P0 até a conferência | Administrador do CRM | 04 |
| **7 de 12 achados P0/P1 de segurança de 07/10 abertos** | Histórico gravado em negócio ou contato fora do alcance (`SEC-RLS_TAREFAS-01`); download e CSV com dado pessoal sem checagem de permissão (`SEC-SAIDAS-01/02`); mensagem "do cliente" forjável e descoberta de IDs de contatos alheios (`SEC-RLS_CONTATOS-01/02/03`); mídia privada legível via `media_url` (`SEC-DEFINER-01`) | P0/P1 | Equipe (migrations + front) | 07, 04 |
| **Visibilidade de contatos** | A regra "cada vendedor vê só os seus" (CT-021) foi decidida e não aplicada: um vendedor vê 3.098 de 3.106 contatos. Máscara, registro de quem revelou e limite por hora (CT-091 a CT-110) não começaram | P1 | Equipe | 04 |
| **LGPD só no papel** | Sem expurgo nem anonimização por prazo (só o Talk X tem), sem exportação ao titular, sem DPO definido; checklist 0/14 com o documento marcado "Aprovado". Notas internas e dados pessoais vão ao provedor de IA sem mascarar CPF | P1 | Dono (DPO) + equipe | 07, 02, 08 |
| **Backup sem prova** | PITR não confirmado e nenhum teste de restauração feito (checklist 0/7) | P1 | Dono (painel) + equipe | 07 |
| **Sem observabilidade de produção** | Sem Sentry e sem monitor externo de disponibilidade. O deploy de Edge Functions ficou **automático** no push desde 07/10, sem alerta de falha. O `settings-guard` dá falso alarme a cada 6 h | P1 | Equipe | 07 |
| **Testes com login real mortos** | Os últimos 60 runs do `e2e-logado` foram cancelados por timeout de 15 min; o alerta usa `if: failure()` e não dispara em cancelamento (`.github/workflows/e2e-logado.yml:49,221`) | P0 | Equipe | 07 |
| **Teto diário por número subconta o Multiplix** | O limite lê `multiplix_recipients`, mas o worker novo grava em `multiplix_delivery_items`. Talk X e Multiplix no mesmo chip podem passar do teto (MX04) | P0 | Equipe | 01 |
| **Motor de campanhas sem ensaio registrado** | O ensaio X035 com números da equipe está bloqueado e não há registro de envio real no repositório; se nada foi testado fora dele, o primeiro envio real seria para cliente | P0 | Dono (números e chip — N04) | 01 |
| **Custo de IA pode sumir** | A fila "durável" grava em `ai_usage_outbox`/`outbox_events`, que não existem em nenhuma migration. O alerta de consumo anômalo é só projeto. A cota libera o gasto quando o banco falha | P1 | Equipe | 02 |
| **Credenciais pendentes de rotação** | Evolution, service_role, Bearer Lovable, token do TL-099; uma credencial de infraestrutura guardada sem cofre num workflow N8N inativo; `departments.whatsapp_api_key` em texto puro fora do Vault | P1 | Dono | 07 |
| **Code Scanning** | 8 alertas abertos, inclusive XSS de severidade alta no Talk X | P1 | Equipe | 07 |
| **Domínio oficial fora do CORS** | `zappweb.app.br` não está na lista de origens das Edge Functions (`supabase/functions/_shared/validation.ts`). A correção é a PR [#1899](https://github.com/adm01-debug/Zapp_Web_V2/pull/1899), ainda aberta | P1 (antes de trocar o DNS) | Merge + deploy | 08 |

## 5. Prioridades consolidadas

A ordem cruza impacto no negócio, risco e esforço. "Destravar" indica quando o item depende de alguém além da equipe.

| # | Lacuna | Prio | Destravar | Anexo |
|---|---|---|---|---|
| 1 | Multiplix não envia pela tela (MX01) | P0 | — | 01 |
| 2 | Teto diário por número ignora o Multiplix (MX04): risco de bloqueio do WhatsApp | P0 | — | 01 |
| 3 | Mensagens agendadas sem processador de envio (latente: tabela vazia hoje; o próximo agendamento falha em silêncio) | P0 antes de divulgar o recurso | — | 08 |
| 4 | CRM externo com `EXECUTE` para a chave pública (GATE C): conferir as checagens internas das 5 funções e revogar `anon` | P0 até a conferência | Admin do CRM | 04 |
| 5 | 7 achados P0/P1 de segurança de 07/10 + 3 P1 de RLS de contatos (Y24) | P0/P1 | — | 07, 04 |
| 6 | E2E com login real cancelado há mais de uma semana, sem alerta | P0 | — | 07 |
| 7 | Talk X sem ensaio real antes do primeiro cliente (X035) | P0 | Dono (N04) | 01 |
| 8 | Chatbot, automações, follow-up, ausência e auto-fechamento sem executor | P1 | — | 08, 02 |
| 9 | Campanhas Clássicas fingem enviar: ligar ao Talk X ou retirar a tela | P1 | Decisão de produto | 08 |
| 10 | Relatórios agendados por e-mail sem envio | P1 | Política de e-mail externo | 02 |
| 11 | LGPD: expurgo, exportação ao titular, DPO, máscara de PII antes da IA | P1 | Dono (DPO) | 07, 02 |
| 12 | Backup: confirmar PITR e fazer um restore de teste | P1 | Dono (painel) | 07 |
| 13 | Observabilidade: Sentry, monitor de uptime, alerta do deploy automático de Edge | P1 | Contratação/conta | 07 |
| 14 | Visibilidade de contatos por vendedor (CT-021) e proteção de dados (CT-091 a CT-110) | P1 | — | 04 |
| 15 | Integração CRM desligada e sincronização parada (`crm-sync-worker`) | P1 | Dono (ligar flags) | 04 |
| 16 | "Definir conexão padrão" e "Salvar WhatsApp do departamento" gravando em objetos inexistentes | P1 | — | 05, 03 |
| 17 | Botões que quebram com a Evolution GO + "Sincronizar histórico" com falso sucesso | P1 | — | 05 |
| 18 | Segundo número de WhatsApp não opera (token global no proxy, QR, status e entrega) | P1 | Antes de ligar a flag | 05 |
| 19 | Team Chat: gestão de departamento, contrato novo do banco, "lido", busca, ações mortas | P1 | Ratificar plano F × TC | 03 |
| 20 | VoIP sem prova de funcionamento (nenhuma das 22 ligações em produção foi atendida; última tentativa em 26/09, com falha) e gravação sem fonte (0 de 22 com gravação); segredos não conferidos no painel | P1 | Dono (secrets) | 03 |
| 21 | Custo de IA: fila para tabela inexistente, sem alerta de consumo | P1 | — | 02 |
| 22 | Talk X: relatório da campanha, bucket de mídia, tela de pausada, vários segmentos, checagem de lançamento | P1 | — | 01 |
| 23 | Talk X: dados comerciais, RFM, receita e ROI (X036–X041) | P1 | Dono (funil do Bitrix24 — N36) | 01 |
| 24 | SLA sem escalonamento automático e distribuição ingênua (ignora online e limite; "round-robin" sem efeito) | P1 | — | 05 |
| 25 | CSAT e NPS sem coleta automática | P1 | — | 08 |
| 26 | Domínio oficial no CORS (PR #1899) | P1 | Merge | 08 |
| 27 | Arquivos: encaminhar individual, remetente com foto e nome, download por permissão | P2 | — | 06 |
| 28 | Encaminhar para grupo e mensagens interativas | P2 | — | 06, 08 |
| 29 | Dashboard: KPIs truncados em 1.000/500 linhas, "intervalo de 95%" falso, metas e ranking medindo a coisa errada, atalhos 404 | P2 | — | 02 |
| 30 | Journey sem e-mail e ligações, e Contatos v2 (situação comercial nos cartões) | P2 | — | 04 |

## 6. Decisões e ações que dependem do dono

Itens que nenhum agente consegue fechar sozinho. Cada um destrava um bloco de pendências.

| Decisão ou ação | O que destrava | Anexo |
|---|---|---|
| Informar números e chip do ensaio do Talk X (N04) | X035 → primeira campanha real (X199) e aceite visual (X198) | 01 |
| Definir o funil de "venda ganha" no Bitrix24 (N36) | Receita e ROI por campanha (X039–X041) | 01 |
| Canal de suporte/especialista da Ajuda do Talk X (N40) | X191 | 01 |
| Ratificar o plano do Team Chat (F ou TC). Os dois se dizem vigentes e todo o trabalho real segue o F | Ordem e contagem do Team Chat | 03 |
| Gates G0/G1 das ligações WhatsApp: número reserva, aceite de risco, parecer jurídico. Ou decidir pela API oficial da Meta | 90 etapas do `meowcaller` | 03 |
| Cadastrar `SIP_PASSWORD`, `BITRIX_WEBHOOK_URL` e o agendamento das gravações | VoIP e gravações | 03 |
| Pedir ao admin do CRM que confira as checagens internas das 5 funções e revogue `anon` (GATE C) | Confirma ou descarta a exposição de dados do CRM e a fecha | 04 |
| Ligar `VITE_CRM_INTEGRATION_ENABLED` no build da Vercel (a chave `crm.integration` do banco já estava ligada em 12/10) e `CRM_SYNC_WORKER_ENABLED` | Painel do contato, contexto de empresa, CRM 360° e sincronização | 04 |
| Política de envio de relatório para e-mail externo (conflito com "nenhuma informação sai do sistema") | Relatórios agendados | 02 |
| Nomear o DPO e aprovar os prazos de retenção | Trilha LGPD | 07 |
| Confirmar o PITR no painel do Supabase e autorizar um restore de teste | Backup | 07 |
| Contratar ou autorizar Sentry e monitor de uptime | Observabilidade | 07 |
| Rotacionar credenciais (Evolution, service_role, Bearer Lovable, token do TL-099, credencial no N8N) | Fecha SEC-ROT e a issue #380 | 07 |
| Decidir as 175 etapas do Banco Único | Plano inteiro | 07 |
| Homologar com conexão ativa: envio de produto do catálogo, Talk Me, áudio e QA visual logado de Skins e Inbox | Itens "BLOQUEADO (aceite humano)" em 05 e 06 | 05, 06 |
| Initial JS de 300 KB: aceitar o teto atual (~343 KB) ou autorizar a divisão do código | SL-103 | 07 |

## 7. Documentos que contradizem o código

Corrigir ou arquivar esses documentos evita que a próxima sessão (humana ou agente) trabalhe em cima de premissa
errada. Lista completa: seção 4 de cada anexo (146 divergências).

**Dizem "feito/100%", e o código não entrega:**
- `docs/COMPLETE_SYSTEM_FEATURES.md` ("✅ 100% IMPLEMENTADO"):
  - promete fachadas como prontas;
  - 49 dos 264 caminhos citados não existem;
  - diz "28+ tabelas/24 Edge Functions" contra 168 tabelas e 82 funções reais.
- `docs/IMPROVEMENT_PLAN.md` ("PROJETO 100% COMPLETO") lista como prontos:
  - exportação (removida);
  - PWA (desligado);
  - mensagens interativas (bloqueadas);
  - i18n (sem consumidor).

  Os itens DB-1..8 desse plano são de **outro banco**.
- `README.md`: "CSAT (pesquisa de satisfação)", "Geo-blocking" e "campos customizáveis".
- A página "Documentação" do app e o POP de atendimento: atalhos e KPI "CSAT > 90%" sem dado.
- `docs/PROMPT_LOVABLE_INTELLIGENCE_PANEL.md` e `docs/CRM360_TECHNICAL_DOCS.md`: painéis "integrados" que não têm
  nenhum consumidor.
- `docs/design/DESIGN_SYSTEM_PROMO_GIFTS_STATUS.md`: dá como existentes AppHeader, BreadcrumbBar e StarBackground,
  que não existem.
- `docs/design/TAREFAS_QUADRO_STATUS.md`: dá a fusão E15 (margem lateral) como feita, mas não está.

**Dizem "pendente/nada executado", e o código já entregou:**
- Planos que dizem "nada executado" com o código quase todo pronto:
  - `PLANO_SIDEBAR_CONTATO_3_SECOES` (~60 etapas no código);
  - `PLANO_EMAIL_SIDEBAR_CONTATO` (~42);
  - `PLANO_EMAIL_NAVY` (78/80 critérios);
  - `PLANO_REDESIGN_ARQUIVOS_CHAT_PANEL` (44/50).
- Planos de 07/10 de Arquivos e Volume ainda com "Estado de execução: _A preencher_".
- `docs/talkx/v4/STATUS.md`: placar congelado em 2/200 e 217/1.135. O gerador só conta o ledger de 03/10; X028,
  X030–X034, X047, X099 e X189 foram entregues depois.
- `docs/plans/PLANO_TELEFONIA_FINALIZACAO_100_ETAPAS_2026-09-29.md`: cópia órfã que diz "nada executado", contra o
  ledger vivo em `docs/design/` (78/100).
- `docs/WEBHOOK_EVENTS.md`: marca como "não implementado" 5 eventos que o webhook já trata, e também a autenticação.
- Reconciliação de 03/10 (`docs/reconciliation/reports/modules/*`): dezenas de itens já corrigidos ainda constam
  como abertos. Exemplos: MX02, MX03 e MX05–MX09 do Multiplix; E07, E12, E24 e E25 da multi-conexão; OTH-003 e
  OTH-006 do Gmail; SK01/SK02, VOL-01/02 e TM-02.

**`CLAUDE.md` (fonte de verdade para agentes) com afirmações vencidas:**
- Diz que "merge em `main` NÃO deploya edge function". Desde 07/10 o `deploy-functions.yml` dispara no push em
  `supabase/functions/**` (decisão do dono registrada no próprio workflow).
- Diz que o dispatcher N8N do grafo "existe e está ativo". Está inativo.
- A regra "issue de alerta com mais de 20 comentários: fechar e reabrir" não foi aplicada às issues de
  `types-sync` (62 comentários) e `settings-guard` (27).
- `docs/runbooks/deploy.md` fala em 3 checks obrigatórios; são 6.

**Planos de outro repositório ou de outro banco, misturados aos deste:**
- `docs/plans/PLANO_100_ETAPAS_WORKFLOWS_2026-09-27.md` e `docs/audits/auditoria-zapp-v3/PLANO_100.md` são do
  ZAPP Web **V3**.
- `IMPROVEMENT_PLAN` DB-1..8 e parte do `REFACTORING_REPORT_2026-06-12.md` referem migrations que estão em
  `supabase/migrations/_foreign/`.

**Planos em conflito entre si:**
- Team Chat F × TC.
- Arquivos: a etapa 14 (remover o subtítulo) contra o mockup D08 (recolocar).
- Cartão SL-124 ("DB Live Guard obrigatório") contra o desenho do `CLAUDE.md`.
- SL-147 (`.nvmrc` 20.19.0) contra o toolchain em Node 24.

**Issues abertas já resolvidas no código:** #1265, #1266, #1267, #378 e #382.

## 8. Método e limites

- **Divisão do trabalho:** 8 frentes paralelas, cada uma com lista mínima de fontes. A ordem foi ler plano, status
  e reconciliação e, depois, procurar no código o artefato de cada etapa (componente, hook, rota, Edge Function,
  migration, teste). O estado vale a partir do código, não do checkbox do plano.
- **Critério de "concluído":** artefato presente e ligado a quem o usa. Componente pronto sem tela que o monte
  conta como **parcial**.
- **O que não foi feito:** nenhum deploy, nenhum navegador logado e nenhuma escrita em banco. Por isso "aplicado em
  produção", "funciona com login" e aceite humano aparecem como **bloqueado** ou **não verificável**.
- **Leitura em produção (12/10, depois da primeira versão):** consultas só `SELECT` no banco oficial, para responder à
  revisão da PR. Foram lidos os jobs do `pg_cron` (só nome, horário e a quais recursos se referem; o comando não foi
  exibido), as funções e gatilhos ligados a `scheduled_messages`, a contagem de linhas de cinco tabelas, a chave
  `crm.integration` e o estado de gravação das ligações (`calls`). Também foi lido o JavaScript público do site em
  produção, para ver com que valor o build recebeu `VITE_CRM_INTEGRATION_ENABLED`. Do N8N foram lidos só os nomes e
  descrições dos 245 workflows. Segredos das Edge Functions, o conteúdo dos workflows e outros chamadores externos
  continuam sem conferência.
- **Leituras externas:** a frente 07 fez só leituras GET na API do GitHub (runs, checks, issues, alertas) e uma
  leitura do workflow N8N do dispatcher. A frente 08 listou as issues abertas.
- **Histórico:** o clone tem 50 commits (desde 03/10). O que veio antes foi confrontado com os ledgers de
  `docs/reconciliation/`.
- **Contagens:** cada frente conta na unidade natural do plano (etapa, cartão, critério de aceite ou grupo de
  linhas). Por isso os totais do §1 são ordem de grandeza.
- **Conferência:** antes de publicar, as afirmações de maior impacto foram reconferidas diretamente no código.
  - Não há consumidor de `scheduled_messages`, `campaign_contacts` ou `scheduled_report_configs` em Edge Function.
  - `chatbot-l1` só é chamado pelo botão de teste, e `submitSurvey` não tem chamador.
  - O bucket `talkx-media` não é criado em nenhuma migration, e `TalkXCampaignPaused` só aparece no próprio teste.
  - `department_whatsapp_configs` e `set_default_whatsapp_connection` não existem em migration.
  - `ai_usage_outbox` não existe em migration.
  - O `e2e-logado` tem `timeout-minutes: 15` e alerta só em `failure()`.
  - `zappweb.app.br` está fora do CORS, e o deploy de Edge dispara no push.
  - `docs/crm-external-grants.md:25` registra o `anon` no CRM.
- **Sigilo:** nenhum segredo foi reproduzido. A credencial de infraestrutura citada no §4 aparece só de forma
  genérica, porque este repositório é público.
