# Paridade V3 → V2: documento 01-frontend (shell, rotas, autenticação e administração), 11/10/2026

Documento auditado: `Zapp_Web_V3/docs/estado/01-frontend.md` (origin/main 3af583f0e), com 888 linhas. Cobre:
- o shell da aplicação;
- 55 rotas e seus guardas;
- 22 páginas detalhadas;
- cerca de 128 arquivos "órfãos", que na V3 abrem pelo `ViewRouter`;
- cerca de 75 telas sob demanda.

Código V2 comparado: branch viva `.integrador`.

## Método

Quatro frentes paralelas, só de leitura, compararam **por função** e não por nome de arquivo. A V2 concentra as telas em `?view=` e nas abas de configuração:
- A: shell e rotas;
- B: autenticação e páginas públicas;
- C: as 28 páginas de administração;
- D: páginas órfãs e telas sob demanda.

Cada achado relevante foi conferido no código antes de virar cartão, entre eles: esqueci a senha, automações sem executor, departamentos, `global_settings`, `ProtectedRoute`, `AppProviders`, handlers globais, exportação e `log_security_event`.

## Achados com cartão (faixa M: 48 cartões, já criados e delegados)

| Grupo | Cartões | Lacuna |
|---|---|---|
| Acesso negado | SH1, SH2, SH7 | Sem página de acesso negado nem registro; destino perdido depois do login e do 2FA; rotas `/sla`, `/sla/history`, `/queues/comparison` e `/queue/:id` abertas a agente (as views equivalentes são só staff); `/install` pública; links antigos dão 404 |
| Recuperação de erro | SH3, SH4, SH5, SH6 | Erro de chunk reconhecido só em parte e sem orçamento; contador de auto-recuperação nunca zera (o 4º erro derruba o app); boundary de rotas sem botão; tela branca se o provider falha; handlers globais duplicados e sem filtro de ruído; React Query repete erro permanente |
| Esqueci a senha (alta) | PW1, PW2 | O visitante não lê `profiles` e não grava a solicitação: a tela confirma, mas nada é criado |
| Autenticação | SG1, AU2, QD1 | Cadastro público aberto num sistema interno; polimento de redefinir senha, SSO e PWA; detalhes da fila com N+1 e sem estado de erro |
| SLA | SA1, SA2, SA3, SA4 | Sem histórico de alertas, sem "resolver", sem preferências por usuário e sem a aba "Entregas & Leituras" |
| Mensagens com falha (alta) | FQ1, FQ2, FQ3 | Não há como ver, reenviar ou abandonar falhas, nem causa raiz e código, um a um ou em lote |
| Sala de crise | WR1, WR2, TV1 | Alertas sem resolver e sem histórico; nenhuma visão de transferências em risco |
| Pausa de instância | IP1, IP2, IP3 | Não dá para pausar uma instância, e a entrega não respeita pausa |
| Observabilidade | OB1, OB2, OB3, HM1, HM2, TE1 | Sem registro de chamadas à Evolution nem de eventos do webhook; sem autoteste HMAC; sem a aba de erros do navegador |
| Automações (alta) | AT1, AT2, AT3 | A tela grava regras e **nenhuma função as executa** |
| Departamentos (alta) | DP1, DP2 | Sem tela de gestão; o diálogo de membros, convites e modo WhatsApp nunca abre |
| Segurança e administração | LA1, LA2, GS1, GS2, EH1, EH2, QA1, QA2, CR1, CR2, AO1 | Tentativas de login invisíveis; chave de integração visível a supervisor; saúde das contas de e-mail só das próprias; filas sem algoritmo, transbordo, limite, fixação e pausa; cron invisível; pendências por atendente |
| Regra do dono | EX1 | A tela "Export Auto" ainda existe e contraria "nenhuma informação sai do sistema" |

Já cobertos antes:
- **Bloqueio de login por IP e país:** `t_9dcf4766`, `t_11d70e5e` e `t_20077c25`.
- **Remoção de Pagamentos:** `t_c789fa62`.

## Descartes com motivo

- **Debug e desenvolvimento:** BackendDiagnostics, RealtimeFanoutDebug, SendStatusBusDebug, DesignSystem, ZappWebbDemo, DevDiagnostics e AuditEvidence. Ferramentas de desenvolvimento que não fazem falta para operar.
- **OAuthConsent:** específico do Lovable.
- **Infraestrutura só da V3:** SelfHostedHealth, EvoApiHealth/DR, Providers (multi-provedor), InboxSyncStatus (ponte `evo`) e a ponte de sessão.
- **RoutePermissions:** a V2 usa papéis fixos e permissões, por desenho.
- **NotificationChannels:** já não tinha executor na V3.
- **Sentry:** a regra "nada sai do sistema" vale; a V2 manda os erros para `audit_logs`.
- **Telas sem motor ou de baixo valor:** ValidationProvider, AuthDiagnosticsPanel, SearchInsights e Sicoob (sem motor na V2).
- **Pipeline de vendas:** decisão da fusão Quadro → Tarefas; os negócios são trabalhados no CRM360 do contato.
- **TagsView:** decisão de remover o módulo Etiquetas.
- **Correlação de chamadas:** a Telefonia usa os registros de chamada.
- **Jobs de revalidação de e-mail:** baixo valor.
- **Métricas de operação e logs de segurança e ACL:** equivalentes parciais suficientes (Dashboard, `/sla`, AuditLog e SecurityOverview).
