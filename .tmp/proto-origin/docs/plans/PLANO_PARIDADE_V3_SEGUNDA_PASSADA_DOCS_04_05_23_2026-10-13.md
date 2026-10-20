# Plano: paridade V3 → V2 — segunda passada dos documentos 04, 05 e 23 (13/10/2026)

> Pedido do Joaquim: auditar `docs/estado/05-features-admin.md`, `04-features-auth.md` e `23-hooks-raiz-1.md` da V3 com o mesmo objetivo (o que existe na V3 e não foi criado ou implementado na V2), criar o plano e os cartões, delegar aos especialistas, acompanhar e validar no final. Esta é a **segunda passada**: cada documento já tinha uma primeira passada (PD, PE, PB). Os agentes leram o código da V3 por inteiro e compararam por comportamento com a branch viva da V2; cada achado P0/P1 foi conferido no código pelo Claude antes de virar cartão.

## 1. Veredito
A V2 está à frente da V3 na maior parte (autorização por ação, lockout no servidor, verificação criptográfica de passkey, paginação no servidor). Mesmo assim a segunda passada achou lacunas reais, várias de segurança e integridade:

| Prioridade | Achado (conferido no código) |
|---|---|
| P0 | `auto-close-conversations` fecha qualquer contato com `updated_at` antigo (sem filtro de status, exclusão ou limite), insere a mensagem direto em `messages` (o cliente não recebe) e desatribui — o PE-102 ia agendá-la a cada 10 min. Recusado; refazer PK-22, correção PK-01, reagendamento PK-02. |
| P1 | Login por Passkey nunca criava sessão (só mandava um link por e-mail) e fica fora das travas do `auth-login` (PH-01, PH-02, PI-07, PI-08). |
| P1 | Lockout perdeu a escalada numa migration (cada ciclo de 5 tentativas trava só 1 min) — PI-01. |
| P1 | Reautenticação substitui a sessão AAL2 por AAL1 e quebra troca de senha de quem tem 2º fator — PI-02, PI-03, PI-04. |
| P1 | Falha ao ler papéis vira "acesso negado" com auditoria falsa; auditoria de acesso negado perde a rota (NULL) — PI-05, PI-06. |
| P1 | Sala de Crise conta SLA do histórico inteiro; Copiloto do supervisor não responde as 5 perguntas rápidas e o snapshot subconta conversas sem linha de SLA — PF-01..03, PG-01, PG-01R, PG-02. |
| P1 | Ciclo CSAT não fecha; Chatbot IA e carteira de clientes prometem o que nada executa — PK-03..PK-11. |
| P1 | `reassign_*` move a carteira inteira, não as conversas abertas — PF-09. |

## 2. Decisões adotadas (valem se o Joaquim não vetar)
- Visão `supervisao` separada de `admin`, para o supervisor alcançar Copiloto, Fila e Sala de Crise (PG-03).
- Remover o botão que copia o segredo do 2FA (regra "nenhuma informação sai do sistema") e bloquear senha vazada (HIBP) na redefinição (PH-05, PH-08).
- Lockout com teto de 15 min e contador que só zera após 60 min sem tentativas (PI-01).
- Porteiro pós-login (`post-login-gate`) e ADR-007 para login social e código (PI-08, PI-09).
- Chatbot IA liga, mas desligado por padrão; carteira de clientes passa a atribuir; mensagem de ausência opt-in; motor de fluxos visuais NÃO (só aviso honesto) (PK-06..PK-12).
- Fora de escopo por decisão: `route_permissions` dinâmico, `service_channels`, Providers, Sicoob, STS, Retry config, API pública, `entity_versions` (PF-08 remove o hook), códigos de backup MFA, bypass dev, tags.

## 3. Cartões

### Documento 05 (admin) — segunda passada

PF-01..PF-13 e PG-01..PG-10, mais o refazer PG-01R. Os ids são do Kanban; a coluna Dono é o especialista planejado.

| Chave | Cartão | Prio | Dono | Título |
|---|---|---|---|---|
| PF-01 | t_7d403167 | P1 | workersql | feat(db): snapshot da Sala de Crise agregado no banco, com SLA estourado do ciclo atual |
| PF-02 | t_ac0acb5c | P1 | hugo | feat(admin): hook da Sala de Crise com atualização periódica e erro explícito |
| PF-03 | t_9d56e788 | P1 | iris | fix(admin): Sala de Crise mostra erro, atualização real e alerta acessível |
| PF-04 | t_cd3c8b81 | P1 | iris | fix(admin): painel de CRM — Explorer abre a tela certa, Top 5 mostra o cliente e falha não vira zero |
| PF-05 | t_48d3f0f5 | P2 | hugo | fix(admin): hook de uso de IA expõe carregando e erro |
| PF-06 | t_94f60c1a | P2 | iris | fix(admin): painel de uso de IA com carregando, erro e tabelas acessíveis |
| PF-07 | t_f1f716dd | P2 | iris | fix(admin): abas do painel acessíveis, busca só onde vale, sem vazamento e sem NaN no limite de chats |
| PF-08 | t_e9a1cfe7 | P2 | hugo | chore(hooks): remover o hook de versões de entidade sem uso |
| PF-09 | t_9ba1d0c7 | P1 | workersql | fix(db): reatribuição por ausência e sobrecarga só mexe em conversas abertas, com simulação |
| PF-10 | t_97ca8f79 | P1 | hugo | fix(admin): diagnóstico mede a latência do banco com sonda leve e para de contar tabelas inteiras |
| PF-11 | t_5b0e4fd4 | P2 | hugo | fix(admin): criar usuário pela camada de Edge padrão, com refresh de sessão e erro por campo |
| PF-12 | t_f057f5ee | P2 | hugo | fix(admin): validar papel e limite de chats, invalidar cache após reatribuir e proteger o banco |
| PF-13 | t_4c617c4b | P2 | iris | feat(admin): fila de mensagens com falha atualiza sozinha e mostra o histórico de ações |
| PG-01 | t_77cf8f93 | P1 | workersql | feat(db): snapshot gerencial do Copiloto do supervisor (filas, espera, SLA, motivos de encerramento) |
| PG-02 | t_9b19d420 | P1 | iris | feat(admin): Copiloto do supervisor responde com dados medidos e fica robusto e acessível |
| PG-03 | t_26b35c6f | P1 | iris | feat(nav): ferramentas do supervisor acessíveis ao supervisor (nova visão Supervisão) |
| PG-04 | t_40ca3ce6 | P1 | iris | feat(automacoes): editor configura gatilho e ação de verdade (palavras-chave, inatividade, agente, mensagem) |
| PG-05 | t_23deb8a0 | P1 | iris | chore(tags): automações deixam de oferecer gatilho e ação de tag |
| PG-06 | t_4d66a644 | P1 | workersql | feat(db): resumo da auditoria de segurança agregado por período (só admin) |
| PG-07 | t_2171f991 | P1 | iris | fix(seguranca): aba de Auditoria mostra totais reais, ator, filtro de data e erro visível |
| PG-08 | t_0dfa695e | P2 | iris | fix(admin): Playbooks com ordem correta, confirmação ao excluir, erro visível e teclado |
| PG-09 | t_877fb16a | P2 | iris | fix(admin): Modo Treinamento — erro ao iniciar, sessão abandonada, perfil ausente e acessibilidade |
| PG-10 | t_f835bb75 | P2 | iris | fix(admin): grants de visibilidade e remoção de papel com erro visível, confirmação e nome acessível |
| PG-01R | t_66e9e2ac | P1 | senior | [refazer 1] feat(db): snapshot do Copiloto conta conversa sem resposta mesmo sem linha em conversation_sla |

### Documento 04 (autenticação) — telas, MFA e e2e

PH-01..PH-12. Os ids são do Kanban; a coluna Dono é o especialista planejado.

| Chave | Cartão | Prio | Dono | Título |
|---|---|---|---|---|
| PH-01 | t_0fefc2f9 | P1 | edgar | fix(seguranca): login por Passkey cria sessão de verdade, com as mesmas travas do login normal |
| PH-02 | t_d91a31ba | P1 | hugo | fix(auth): entrar com Passkey conclui a sessão com o token da Edge |
| PH-03 | t_e4f28cd1 | P2 | hugo | fix(auth): reautenticação devolve o motivo da falha em vez de 'senha incorreta' para tudo |
| PH-04 | t_13fb1233 | P2 | iris | fix(auth): diálogo de reautenticação limpa a senha ao fechar e mostra o motivo certo |
| PH-05 | t_148b3c50 | P2 | iris | fix(auth): redefinir senha acessível, sem 'Link inválido' piscando e sem aceitar senha vazada |
| PH-06 | t_f7e0f50f | P2 | iris | fix(auth): retorno do login social em português, acessível e sem navegação duplicada |
| PH-07 | t_9b147a2f | P2 | hugo | fix(auth): mensagens de MFA em português, uma só por erro, e fator pendente limpo |
| PH-08 | t_ee1eef8e | P2 | iris | fix(auth): tela de 2º fator sai de verdade, tenta de novo e devolve o foco; cadastro e lista de MFA acessíveis |
| PH-09 | t_20bab5c9 | P2 | iris | fix(auth): tela 'Verificando acesso' só oferece saída depois de alguns segundos e anuncia a etapa |
| PH-10 | t_48ac4716 | P2 | hugo | fix(auth): login distingue 'muitas tentativas' de 'serviço indisponível' |
| PH-11 | t_94a9f1cf | P2 | iris | fix(auth): avisos de bloqueio e de tentativas restantes anunciados a leitores de tela |
| PH-12 | t_041b173c | P2 | workertestes | test(e2e): acessibilidade, teclado e sessão das telas de autenticação |

### Documento 04 (autenticação) — lógica, Edges e banco

PI-01..PI-15. Os ids são do Kanban; a coluna Dono é o especialista planejado.

| Chave | Cartão | Prio | Dono | Título |
|---|---|---|---|---|
| PI-01 | t_4fa0b970 | P1 | workersql | fix(seguranca): bloqueio por tentativas volta a escalar (regressão de migration) e não zera ao vencer |
| PI-02 | t_0d01417f | P1 | edgar | fix(seguranca): login ganha modo 'verify' para reautenticar sem trocar a sessão |
| PI-03 | t_5dcccf78 | P1 | hugo | fix(auth): reautenticação mantém o nível AAL2 de quem tem 2º fator |
| PI-04 | t_c3262e42 | P1 | iris | fix(auth): redefinir senha funciona para quem tem 2º fator e encerra as outras sessões |
| PI-05 | t_4fdf8a70 | P1 | hugo | fix(auth): falha ao ler os papéis deixa de virar 'acesso negado' falso com auditoria falsa |
| PI-06 | t_43fe7809 | P1 | hugo | fix(seguranca): auditoria de acesso negado grava a rota tentada (hoje vira NULL) |
| PI-07 | t_b0415cc5 | P1 | edgar | fix(seguranca): Passkey sem e-mail digitado, sem enumeração e com limite de tentativas |
| PI-08 | t_5f904bf8 | P1 | edgar | fix(seguranca): política de rede e conta ativa também valem para quem entra por Google ou código (porteiro pós |
| PI-09 | t_a86bc967 | P1 | iris | fix(seguranca): login social chama o porteiro antes de entrar no app |
| PI-10 | t_f5aa3698 | P1 | hugo | fix(seguranca): aviso de dispositivo novo roda no login, não só ao abrir a tela de segurança |
| PI-11 | t_656037fe | P2 | workersql | fix(db): dispositivo único por usuário e impressão digital (duas abas não criam duas linhas) |
| PI-12 | t_f3c70040 | P2 | edgar | fix(seguranca): limite de tentativas persistente nas Edges administrativas e guarda de estado no reset de senh |
| PI-13 | t_f30a205e | P2 | edgar | fix(seguranca): criação de usuário exige a mesma política de senha do app |
| PI-14 | t_1da5e280 | P2 | hugo | fix(auth): erro de senha mostra quantas tentativas restam |
| PI-15 | t_98d68615 | P2 | workersql | fix(db): perfil próprio não altera o e-mail sem validação |

### Documento 23 (hooks da raiz, parte 1) — segunda passada

PK-01..PK-22. Os ids são do Kanban; a coluna Dono é o especialista planejado.

| Chave | Cartão | Prio | Dono | Título |
|---|---|---|---|---|
| PK-01 | t_ec25181f | P0 | edgar | fix(dados): auto-fechamento de conversas só fecha o que está parado de verdade, em lotes, e entrega a mensagem |
| PK-02 | t_cb83cf1c | P1 | workersql | feat(db): agendar o auto-fechamento depois que a Edge estiver corrigida |
| PK-03 | t_69726cda | P1 | workersql | feat(db): ciclo da pesquisa de satisfação (convite agendado, resposta 1 a 5, nota) |
| PK-04 | t_a3d49435 | P1 | edgar | feat(csat): envio automático grava o convite com atraso e o despachador envia pelo pipeline oficial |
| PK-05 | t_9fc5dc27 | P1 | hugo | fix(csat): leituras de satisfação ignoram convites sem nota |
| PK-06 | t_a7e099e7 | P1 | workersql | fix(db): fluxo de chatbot de IA (L1) aceito pelo banco e único por conexão |
| PK-07 | t_d83fb26b | P1 | iris | fix(chatbot): configuração do Chatbot IA escolhe a conexão e o teste faz simulação de verdade |
| PK-08 | t_db046190 | P1 | edgar | feat(chatbot): mensagens recebidas disparam o Chatbot IA (assinado, idempotente, só sem atendente) |
| PK-09 | t_d155d152 | P1 | workersql | feat(db): carteira de clientes passa a atribuir o contato novo por regra |
| PK-10 | t_b097c579 | P1 | edgar | feat(carteira): contato novo chama a atribuição por carteira no pipeline de entrada |
| PK-11 | t_7b9a2cfb | P2 | iris | fix(admin): telas de carteira e de fluxos de chatbot dizem a verdade sobre o que executa |
| PK-12 | t_56355b2c | P2 | edgar | feat(atendimento): mensagem de ausência enviada fora do horário comercial (uma vez por conversa) |
| PK-13 | t_57b49f87 | P2 | hugo | fix(crm): salvar campo personalizado existente não falha e remover confere linhas afetadas |
| PK-14 | t_f8b86210 | P2 | iris | feat(config): tela de preferências de alerta de conexão (push, e-mail, degradada, desconectada) |
| PK-15 | t_2fe8ac65 | P1 | edgar | feat(conexoes): alerta de conexão respeita preferências e avisa quando a caixa de entrada fica muda |
| PK-16 | t_08ddffae | P1 | workersql | fix(db): upload de memes de áudio e do trocador de voz permitido ao atendente, com expurgo e realtime |
| PK-17 | t_9d9c1504 | P1 | hugo | fix(audio): uploads de memes, IA e trocador de voz usam a pasta do usuário |
| PK-18 | t_93e47d30 | P2 | hugo | feat(audio): catálogo e favoritos de memes atualizam ao vivo |
| PK-19 | t_2b931517 | P2 | workersql | feat(db): bootstrap do app em uma chamada (perfil, papéis, permissões, configurações, departamentos, não lidas |
| PK-20 | t_ddfcb3da | P2 | hugo | perf(boot): hook de bootstrap alimenta o cache dos hooks existentes |
| PK-21 | t_9a1b3844 | P2 | hugo | fix(audio): gravador escolhe o formato suportado e diz o motivo certo da falha |
| PK-22 | t_d017ecde | P0 | senior | [refazer 1] feat(db): agendadores e purga do cron sem o auto-fechamento e com a autorização das Edges |

### Itens restantes das segundas passadas

PJ-01..PJ-10 (PJ-01 arquivado como duplicata). Os ids são do Kanban; a coluna Dono é o especialista planejado.

| Chave | Cartão | Prio | Dono | Título |
|---|---|---|---|---|
| PJ-01 | t_41d6cd8e | P2 | workersql | feat(db): trilha de cada crédito de XP (ledger) para auditar gamificação |
| PJ-02 | t_f17bfb86 | P2 | hugo | feat(admin): histórico paginado de transferências com status, prioridade e período |
| PJ-03 | t_b17d6650 | P2 | workersql | feat(db): automações com prioridade, cooldown por regra e escopo por departamento |
| PJ-04 | t_05f26d0a | P2 | iris | feat(automacoes): editor de regras com prioridade, cooldown e departamento |
| PJ-05 | t_882d0c45 | P2 | iris | feat(admin): histórico global filtrável de erros de envio (paridade com a página de erros de despacho da V3) |
| PJ-06 | t_a8ee1cc0 | P2 | iris | feat(admin): monitor de realtime (paridade com AdminRealtimeMonitorPage da V3) |
| PJ-07 | t_a9c81c8a | P2 | iris | feat(admin): auditoria de e-mail (paridade com AdminEmailAuditPage da V3) |
| PJ-08 | t_c91c5959 | P2 | iris | feat(admin): painel de deduplicação entre abas (paridade com CrossTabDedupePanel da V3) |
| PJ-09 | t_f035b06f | P2 | worker | feat(admin): decisão registrada sobre route_permissions e special_agent (paridade com RoutePermissionsPage) |
| PJ-10 | t_f8d9bb43 | P0 | workertestes | fix(testes): teste da Caixa de entrada abre um WebSocket real e derruba a verificação da base com erro não tra |

## 4. Ordem e dependências
1. **Destrave da base** (testes): conserto do `RuleValueInput` (cartão t_929fd1a5) e do WebSocket em `RealtimeInboxView.selectedMessagesError` (PJ-10); sem eles a verificação completa da base reprova de forma intermitente.
2. **P0/P1 de segurança:** PK-01 → PK-02; PK-22 antes do PK-02; PD-03 antes do PH-01; PH-01 → PH-02, PI-07; PI-02 → PI-03; PI-08 → PI-09; PG-01R → PG-02; PI-01 e PI-05/06 em paralelo.
3. **Funcional:** PF-*, PG-03..10, PH-03..12, PK-03..21.
4. Cada cartão compila e passa sozinho; filhos partem do commit do pai pela base do JSON da fila.

## 5. Sobreposição com outras sessões
Dez frentes paralelas (`paridade-06/07/11/16/admin3/doc10/hooks06/hooks24/hooks26/ui2`, 363 cartões) criaram cartões nas mesmas áreas. As chaves repetem entre sessões (PJ-, PH-): **use sempre o id `t_…`**. Sobreposições comentadas nos cartões: HZ-07 × PG-06/PG-07 (auditoria), PJ-34 × PG-09 (Treinamento), PJ-32 × PG-08 (Playbooks), PL-01 × refazer do PB-05 (evolution-api), PM-02 × PB-48 (métricas de fila). O PJ-01 (ledger de XP) foi arquivado em favor do PJ-40 da outra sessão.

## 6. Validação final (Claude)
Para cada P0/P1: ler o diff e o relato, conferir no código e no banco local com papel real (anon, agente, supervisor, admin) e não só o relato; recusar pelo mesmo caminho do revisor (item da fila `rejeitado` + `devolvido`) e abrir refazer quando houver falha. Já revisados: PD-01, PD-02, PD-64 (aprovados), PH-01 (aprovado com ressalva), PG-01 e PE-102 (recusados), PB-05 (recusado). Pendentes de parecer: ver o relatório de auditoria de 13/10.

## 7. Ações do Joaquim
1. Desligar "Allow new users to sign up" no Supabase (Authentication → Sign In / Providers).
2. Aplicar as migrations na promoção (`-- Rollback:` em todas) e, quando o PK-22 integrar: definir `app.settings.supabase_url` ou o segredo `zapp_project_url` no Vault; conceder DELETE em `cron.job_run_details`; conferir `auto_close_config` antes de ligar o auto-fechamento.
3. Vetar ou aprovar as decisões da seção 2.
