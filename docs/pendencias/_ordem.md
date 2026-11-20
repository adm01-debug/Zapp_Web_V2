# Ordem de execução — pendências Zapp Web V2

Gerado a partir de `docs/audits/funcionalidades-pendentes-2026-10-11` (Fase 1 · backlog verificado byte a byte).

Ordem: **prioridade (P0→P3)** e depois **estado** (não iniciado → bloqueado). Dependências explícitas constam no rodapé de cada item.

1. [DASH-083](<cadeia-de-execua-a-o-dos-relata-rios-dash083.md>) — Cadeia de execução dos relatórios · **P0** · NAO_INICIADO
2. [WA-00](<fazer-atender-ligaa-a-o-whatsapp-com-a-udio-no-s-wa00.md>) — Fazer/atender ligação WhatsApp com áudio no sistema · **P0** · NAO_INICIADO
3. [WA-A](<caminho-a-a-meta-calling-api-recomendado-waa.md>) — Caminho A — Meta Calling API (recomendado) · **P0** · NAO_INICIADO
4. [E16](<proxy-evolution-api-resolve-o-token-pela-insta-n-e16.md>) — Proxy evolution-api resolve o token pela instância · **P0** · NAO_INICIADO
5. [E23](<qr-connect-status-logout-e-restart-com-o-token-c-e23.md>) — QR, connect, status, logout e restart com o token certo · **P0** · NAO_INICIADO · depende: E16
6. [SL-006](<e2e-logado-na-main-sl006.md>) — E2E logado na main · **P0** · NAO_INICIADO
7. [LGPD-1](<purge-anonimizaa-a-o-por-prazo-lgpd1.md>) — Purge/anonimização por prazo · **P0** · NAO_INICIADO
8. [X018](<limites-por-minuto-dia-conexa-o-x018.md>) — Limites por minuto/dia/conexão · **P0** · PARCIAL
9. [X019](<envio-pela-conexa-o-escolhida-com-ritmo-x019.md>) — Envio pela conexão escolhida com ritmo · **P0** · PARCIAL · depende: X018
10. [L-01](<envio-de-mensagem-agendada-l01.md>) — Envio de mensagem agendada · **P0** · PARCIAL
11. [F17](<ritmo-e-teto-por-conexa-o-f17.md>) — Ritmo e teto por conexão · **P0** · DIVERGENTE
12. [E09](<e2e-logado-verde-e09.md>) — E2E logado verde · **P0** · DIVERGENTE
13. [E83](<alerta-da-sua-te-logada-e83.md>) — Alerta da suíte logada · **P0** · DIVERGENTE · depende: E09
14. [X035](<ensaio-real-com-a-50-na-meros-da-equipe-e-queda--x035.md>) — Ensaio real com ≥ 50 números da equipe e queda proposital · **P0** · BLOQUEADO
15. [T96](<homologaa-a-o-de-a-udio-9-cena-rios-0-presas-em--t96.md>) — Homologação de áudio (9 cenários) + 0 presas em ringing · **P0** · BLOQUEADO
16. [T97](<homologaa-a-o-de-a-udio-9-cena-rios-0-presas-em--t97.md>) — Homologação de áudio (9 cenários) + 0 presas em ringing · **P0** · BLOQUEADO
17. [CRM-R4](<revogar-anon-das-5-rpcs-antigas-no-banco-do-crm--crmr4.md>) — Revogar anon das 5 RPCs antigas no banco do CRM, rotacionar anon key, remover VITE_CLIENTES_ · **P0** · BLOQUEADO
18. [CT-10](<primeiro-envio-real-de-produto-2-fotos-legenda-ct10.md>) — Primeiro envio real de produto (2 fotos + legenda) · **P0** · BLOQUEADO
19. [TL-099](<revogar-token-github-vazado-tl099.md>) — Revogar token GitHub vazado · **P0** · BLOQUEADO
20. [X037](<projea-a-o-talkx-contact-attributes-x037.md>) — Projeção talkx_contact_attributes · **P1** · NAO_INICIADO · depende: X036
21. [X038](<atualizar-projea-a-o-pelo-crm-360-em-lotes-x038.md>) — Atualizar projeção pelo CRM 360 em lotes · **P1** · NAO_INICIADO · depende: X037
22. [X061](<bucket-privado-talkx-media-x061.md>) — Bucket privado talkx-media · **P1** · NAO_INICIADO
23. [X118](<gerenciador-de-links-rastrea-veis-no-editor-x118.md>) — Gerenciador de links rastreáveis no editor · **P1** · NAO_INICIADO
24. [X120](<checagens-de-lana-amento-no-servidor-x120.md>) — Checagens de lançamento no servidor · **P1** · NAO_INICIADO · depende: X119
25. [X129](<anexar-ma-dia-por-upload-x129.md>) — Anexar mídia por upload · **P1** · NAO_INICIADO · depende: X061
26. [X140](<rpc-talkx-monitor-panel-x140.md>) — RPC talkx_monitor_panel · **P1** · NAO_INICIADO
27. [F72](<tela-de-3-regia-es-pa-blico-composia-a-o-pra-via-f72.md>) — Tela de 3 regiões (Público / Composição / Prévia) · **P1** · NAO_INICIADO
28. [F76](<bloco-de-texto-com-contador-validaa-a-o-f76.md>) — Bloco de texto com contador/validação · **P1** · NAO_INICIADO
29. [F79](<painel-03-pra-via-aptida-o-revisa-o-f79.md>) — Painel 03: prévia, aptidão, revisão · **P1** · NAO_INICIADO · depende: F72
30. [IA-062](<buscar-hista-rico-do-pera-odo-no-servidor-ia062.md>) — Buscar histórico do período no servidor · **P1** · NAO_INICIADO
31. [IA-066](<ma-tricas-de-tempo-calculadas-por-ca-digo-ia066.md>) — Métricas de tempo calculadas por código · **P1** · NAO_INICIADO
32. [IA-073](<proteger-na-meros-condia-a-es-ia073.md>) — Proteger números/condições · **P1** · NAO_INICIADO
33. [IA-074](<conferir-promessas-antes-de-sugerir-ia074.md>) — Conferir promessas antes de sugerir · **P1** · NAO_INICIADO · depende: IA-081
34. [IA-075](<conhecimento-relevante-nas-sugesta-es-ia075.md>) — Conhecimento relevante nas sugestões · **P1** · NAO_INICIADO
35. [IA-100](<passagem-de-atendimento-com-evida-ncias-ia100.md>) — Passagem de atendimento com evidências · **P1** · NAO_INICIADO · depende: IA-093
36. [IA-108](<disputa-bot-a-atendente-ia108.md>) — Disputa bot × atendente · **P1** · NAO_INICIADO
37. [IA-184](<testes-de-injea-a-o-de-prompt-ia184.md>) — Testes de injeção de prompt · **P1** · NAO_INICIADO
38. [B4](<allowlist-de-vozes-modelos-tts-b4.md>) — Allowlist de vozes/modelos TTS · **P1** · NAO_INICIADO
39. [DASH-006](<diciona-rio-de-indicadores-dash006.md>) — Dicionário de indicadores · **P1** · NAO_INICIADO
40. [DASH-022](<autoria-e-fila-do-momento-do-fato-dash022.md>) — Autoria e fila do momento do fato · **P1** · NAO_INICIADO
41. [DASH-024](<estoque-a-fluxo-dash024.md>) — Estoque × fluxo · **P1** · NAO_INICIADO
42. [DASH-032](<metas-agregadas-no-servidor-dash032.md>) — Metas agregadas no servidor · **P1** · NAO_INICIADO
43. [DASH-034](<nps-sem-teto-de-500-dash034.md>) — NPS sem teto de 500 · **P1** · NAO_INICIADO
44. [DASH-035](<heatmaps-agregados-no-banco-dash035.md>) — Heatmaps agregados no banco · **P1** · NAO_INICIADO
45. [DASH-053](<resolua-a-o-por-fatos-operacionais-dash053.md>) — Resolução por fatos operacionais · **P1** · NAO_INICIADO
46. [DASH-054](<contatos-atendidos-reais-dash054.md>) — Contatos atendidos reais · **P1** · NAO_INICIADO
47. [DASH-068](<total-de-alertas-a-lista-recente-dash068.md>) — Total de alertas ≠ lista recente · **P1** · NAO_INICIADO
48. [DASH-075](<previsa-o-sem-95-de-confiana-a-dash075.md>) — Previsão sem "95% de confiança" · **P1** · NAO_INICIADO
49. [DASH-084](<execua-a-o-idempotente-dash084.md>) — Execução idempotente · **P1** · NAO_INICIADO · depende: DASH-083
50. [DASH-CONTROLS-001](<previsa-o-heura-stica-95-35-dashcontrols001.md>) — Previsão heurística (95%, 35) · **P1** · NAO_INICIADO
51. [A11Y-02](<combobox-de-filtros-sem-nome-acessa-vel-a11y02.md>) — Combobox de filtros sem nome acessível · **P1** · NAO_INICIADO
52. [A11Y-04](<bota-es-sa-a-cone-sem-nome-a11y04.md>) — Botões só ícone sem nome · **P1** · NAO_INICIADO
53. [IA-127](<lista-fechada-de-vozes-modelos-tts-ia127.md>) — Lista fechada de vozes/modelos TTS · **P1** · NAO_INICIADO
54. [F06](<anexos-ler-e-apagar-os-pra-prios-arquivos-storag-f06.md>) — Anexos: ler e apagar os próprios arquivos (storage) · **P1** · NAO_INICIADO
55. [TC-12](<anexos-ler-e-apagar-os-pra-prios-arquivos-storag-tc12.md>) — Anexos: ler e apagar os próprios arquivos (storage) · **P1** · NAO_INICIADO
56. [R1](<anexos-ler-e-apagar-os-pra-prios-arquivos-storag-r1.md>) — Anexos: ler e apagar os próprios arquivos (storage) · **P1** · NAO_INICIADO
57. [SL-016](<camada-de-dados-sobre-as-rpcs-novas-sl016.md>) — Camada de dados sobre as RPCs novas · **P1** · NAO_INICIADO
58. [TC-005](<gesta-o-de-departamento-membros-convites-whatsap-tc005.md>) — Gestão de departamento (membros, convites, WhatsApp, auditoria, "Entrar via código", admin abre canal) · **P1** · NAO_INICIADO · depende: F17, F47
59. [F66](<cabea-alho-fixar-arquivar-renomear-sair-transfer-f66.md>) — Cabeçalho: fixar, arquivar, renomear, sair, transferir, estatísticas · **P1** · NAO_INICIADO
60. [TC-59](<cabea-alho-fixar-arquivar-renomear-sair-transfer-tc59.md>) — Cabeçalho: fixar, arquivar, renomear, sair, transferir, estatísticas · **P1** · NAO_INICIADO
61. [CT-021](<rls-vendedor-va-sa-os-pra-prios-contatos-ct021.md>) — RLS: vendedor vê só os próprios contatos · **P1** · NAO_INICIADO
62. [CT-111](<documentos-pedido-ao-singu-dados-filtros-a-rea-p-ct111.md>) — Documentos "Pedido ao Singu" (dados/filtros; área provisória) · **P1** · NAO_INICIADO
63. [CT-112](<documentos-pedido-ao-singu-dados-filtros-a-rea-p-ct112.md>) — Documentos "Pedido ao Singu" (dados/filtros; área provisória) · **P1** · NAO_INICIADO
64. [U03](<chip-e-mail-n-na-barra-de-abas-do-chat-u03.md>) — Chip "E-mail (n)" na barra de abas do chat · **P1** · NAO_INICIADO
65. [U04](<selo-no-a-cone-de-e-mail-do-painel-u04.md>) — Selo no ícone de e-mail do painel · **P1** · NAO_INICIADO
66. [A11Y-CRM-02](<abas-da-conversa-sem-nome-1536-px-a11ycrm02.md>) — Abas da conversa sem nome < 1536 px · **P1** · NAO_INICIADO
67. [A11Y-CRM-03](<selects-sem-nome-nos-filtros-e-no-crm-360a-a11ycrm03.md>) — Selects sem nome nos filtros e no CRM 360° · **P1** · NAO_INICIADO
68. [A11Y-CRM-04](<bota-es-de-a-cone-do-crm-360a-a11ycrm04.md>) — Botões de ícone do CRM 360° · **P1** · NAO_INICIADO
69. [SEC-01](<mensagem-de-entrada-forja-vel-insert-update-de-m-sec01.md>) — Mensagem de entrada forjável (INSERT/UPDATE de messages sem fixar origem) · **P1** · NAO_INICIADO
70. [SEC-02](<ora-culo-de-uuid-em-require-contact-edit-permiss-sec02.md>) — Oráculo de UUID em require_contact_edit_permission e can_delete_contacts · **P1** · NAO_INICIADO
71. [SEC-03](<ora-culo-de-uuid-em-require-contact-edit-permiss-sec03.md>) — Oráculo de UUID em require_contact_edit_permission e can_delete_contacts · **P1** · NAO_INICIADO
72. [RES-3](<segurana-a-insert-de-tarefa-com-contact-id-de-qu-res3.md>) — Segurança: INSERT de tarefa com contact_id de qualquer contato · **P1** · NAO_INICIADO
73. [Y16-01](<bota-es-lista-quadro-agenda-sem-nome-no-celular-y1601.md>) — Botões Lista/Quadro/Agenda sem nome no celular · **P1** · NAO_INICIADO
74. [PAR-078](<rebalanceamento-de-filas-e-escalonamento-de-sla-par078.md>) — Rebalanceamento de filas e escalonamento de SLA · **P1** · NAO_INICIADO
75. [SLA-ESC](<escalonamento-automa-tico-de-sla-doc-cron-001-slaesc.md>) — Escalonamento automático de SLA (DOC-CRON-001) · **P1** · NAO_INICIADO
76. [Y17-01](<bota-es-sa-de-a-cone-sem-nome-142-na-s-y1701.md>) — Botões só de ícone sem nome (142 nós) · **P1** · NAO_INICIADO
77. [Y17-02](<barras-de-progresso-sem-nome-38-na-s-y1702.md>) — Barras de progresso sem nome (38 nós) · **P1** · NAO_INICIADO
78. [Y17-03](<rolagem-horizontal-no-celular-em-queues-comparis-y1703.md>) — Rolagem horizontal no celular em /queues/comparison · **P1** · NAO_INICIADO
79. [Y17-04](<contraste-de-selos-60-na-s-y1704.md>) — Contraste de selos (60 nós) · **P1** · NAO_INICIADO
80. [E24](<service-role-fora-do-repo-e24.md>) — Service role fora do repo · **P1** · NAO_INICIADO
81. [031](<sentry-front-edges-031.md>) — Sentry front + edges · **P1** · NAO_INICIADO
82. [032](<sentry-front-edges-032.md>) — Sentry front + edges · **P1** · NAO_INICIADO
83. [SL-056](<sentry-front-edges-sl056.md>) — Sentry front + edges · **P1** · NAO_INICIADO
84. [SL-037](<sentry-front-edges-sl037.md>) — Sentry front + edges · **P1** · NAO_INICIADO
85. [SL-003](<monitor-de-uptime-externo-slo-sl003.md>) — Monitor de uptime externo + SLO · **P1** · NAO_INICIADO
86. [SL-102](<monitor-de-uptime-externo-slo-sl102.md>) — Monitor de uptime externo + SLO · **P1** · NAO_INICIADO
87. [SL-159](<notificar-falha-da-main-por-whatsapp-sl159.md>) — Notificar falha da main por WhatsApp · **P1** · NAO_INICIADO
88. [LGPD-2](<exportaa-a-o-portabilidade-e-exclusa-o-a-pedido--lgpd2.md>) — Exportação/portabilidade e exclusão a pedido do titular · **P1** · NAO_INICIADO
89. [LGPD-3](<dpo-ripd-registro-de-atividades-lgpd3.md>) — DPO, RIPD, registro de atividades · **P1** · NAO_INICIADO
90. [OBS-3](<notificaa-a-o-de-deploy-automa-tico-com-falha-obs3.md>) — Notificação de deploy automático com falha · **P1** · NAO_INICIADO
91. [L-40](<anonimizaa-a-o-de-cpf-carta-o-nos-prompts-logs-d-l40.md>) — Anonimização de CPF/cartão nos prompts/logs de IA · **P1** · NAO_INICIADO
92. [BKP-1](<pitr-backup-semanal-drill-widget-bkp1.md>) — PITR, backup semanal, drill, widget · **P1** · NAO_VERIFICAVEL
93. [X023](<prova-de-paridade-de-deploy-das-5-edges-x023.md>) — Prova de paridade de deploy das 5 edges · **P1** · PARCIAL
94. [X036](<va-nculo-em-lote-zappa-crm-360-com-trilha-x036.md>) — Vínculo em lote ZAPP↔CRM 360 com trilha · **P1** · PARCIAL
95. [X041](<nega-cio-ganho-vira-conversa-o-receita-e-roi-x041.md>) — Negócio ganho vira conversão; receita e ROI · **P1** · PARCIAL · depende: X039
96. [X056](<cidade-uf-origem-preenchidas-em-contacts-x056.md>) — Cidade/UF/origem preenchidas em contacts · **P1** · PARCIAL · depende: X037, X040
97. [X057](<va-rios-segmentos-por-campanha-x057.md>) — Vários segmentos por campanha · **P1** · PARCIAL
98. [X062](<assinar-ma-dia-do-bucket-no-envio-x062.md>) — Assinar mídia do bucket no envio · **P1** · PARCIAL · depende: X061
99. [X095](<envio-de-arquivo-no-lugar-da-url-x095.md>) — Envio de arquivo no lugar da URL · **P1** · PARCIAL · depende: X061
100. [X100](<compilador-de-regras-v2-no-servidor-x100.md>) — Compilador de regras v2 no servidor · **P1** · PARCIAL · depende: X037, X040
101. [X119](<rascunho-com-segmentos-ma-dia-bota-es-dias-x119.md>) — Rascunho com segmentos, mídia, botões, dias · **P1** · PARCIAL · depende: X057, X061, X063
102. [X125](<origem-zapp-crm-360-resolvida-no-servidor-x125.md>) — Origem ZAPP / CRM 360 resolvida no servidor · **P1** · PARCIAL · depende: X036, X038
103. [X126](<7-filtros-de-audia-ncia-x126.md>) — 7 filtros de audiência · **P1** · PARCIAL · depende: X037, X040
104. [X127](<va-rios-segmentos-no-wizard-x127.md>) — Vários segmentos no wizard · **P1** · PARCIAL · depende: X057
105. [X141](<rpcs-paginadas-de-destinata-rios-e-linha-do-temp-x141.md>) — RPCs paginadas de destinatários e linha do tempo · **P1** · PARCIAL
106. [X143](<rota-por-situaa-a-o-url-x143.md>) — Rota por situação + URL · **P1** · PARCIAL
107. [X151](<aa-a-es-por-linha-conversa-reenviar-bloquear-x151.md>) — Ações por linha: conversa, reenviar, bloquear · **P1** · PARCIAL
108. [X156](<tela-13-campanha-pausada-x156.md>) — Tela 13 "Campanha pausada" · **P1** · PARCIAL · depende: X143
109. [F89](<integraa-a-o-da-fila-contra-banco-f89.md>) — Integração da fila contra banco · **P1** · PARCIAL
110. [IA-009](<kill-switch-desligar-ia-no-servidor-ia009.md>) — Kill switch (desligar IA no servidor) · **P1** · PARCIAL
111. [IA-019](<minimizar-dados-enviados-ao-modelo-ia019.md>) — Minimizar dados enviados ao modelo · **P1** · PARCIAL
112. [IA-049](<registro-de-consumo-nunca-perdido-ia049.md>) — Registro de consumo nunca perdido · **P1** · PARCIAL
113. [IA-054](<quota-por-aa-a-o-na-o-por-linha-de-log-ia054.md>) — Quota por ação (não por linha de log) · **P1** · PARCIAL
114. [IA-058](<alerta-de-consumo-ana-malo-ia058.md>) — Alerta de consumo anômalo · **P1** · PARCIAL
115. [IA-059](<retirar-dado-sensa-vel-dos-logs-ia059.md>) — Retirar dado sensível dos logs · **P1** · PARCIAL
116. [IA-083](<ingesta-o-rastrea-vel-ia083.md>) — Ingestão rastreável · **P1** · PARCIAL
117. [IA-089](<abster-se-sem-fundamento-ia089.md>) — Abster-se sem fundamento · **P1** · PARCIAL
118. [IA-093](<registro-de-compromissos-ia093.md>) — Registro de compromissos · **P1** · PARCIAL
119. [IA-107](<transfera-ncia-real-para-humano-ia107.md>) — Transferência real para humano · **P1** · PARCIAL
120. [IA-117](<supervisor-com-ma-tricas-reais-ia117.md>) — Supervisor com métricas reais · **P1** · PARCIAL
121. [IA-127](<governana-a-de-vozes-ia127.md>) — Governança de vozes · **P1** · PARCIAL
122. [A5](<fontes-gerenciais-do-supervisor-a5.md>) — Fontes gerenciais do supervisor · **P1** · PARCIAL
123. [B8](<kill-switch-no-servidor-b8.md>) — Kill switch no servidor · **P1** · PARCIAL
124. [DASH-013](<escopo-de-fila-do-agente-dash013.md>) — Escopo de fila do agente · **P1** · PARCIAL
125. [DASH-085](<controle-de-entrega-acesso-dash085.md>) — Controle de entrega/acesso · **P1** · PARCIAL · depende: DASH-083
126. [F83](<badge-teams-na-barra-lateral-f83.md>) — Badge "Teams" na barra lateral · **P1** · PARCIAL
127. [TC-76](<badge-teams-na-barra-lateral-tc76.md>) — Badge "Teams" na barra lateral · **P1** · PARCIAL
128. [SL-043](<badge-teams-na-barra-lateral-sl043.md>) — Badge "Teams" na barra lateral · **P1** · PARCIAL
129. [S019](<fontes-ligaa-a-o-e-e-mail-s019.md>) — Fontes ligação e e-mail · **P1** · PARCIAL
130. [S026](<fontes-ligaa-a-o-e-e-mail-s026.md>) — Fontes ligação e e-mail · **P1** · PARCIAL
131. [S066](<defeitos-de-maia-sculo-e-json-cru-de-localizaa-a-s066.md>) — Defeitos "De" maiúsculo e JSON cru de localização · **P1** · PARCIAL
132. [S067](<defeitos-de-maia-sculo-e-json-cru-de-localizaa-a-s067.md>) — Defeitos "De" maiúsculo e JSON cru de localização · **P1** · PARCIAL
133. [S070](<defeitos-de-maia-sculo-e-json-cru-de-localizaa-a-s070.md>) — Defeitos "De" maiúsculo e JSON cru de localização · **P1** · PARCIAL
134. [CRM-R2](<worker-de-sincronizaa-a-o-outbox-a-crm-crmr2.md>) — Worker de sincronização (outbox → CRM) · **P1** · PARCIAL
135. [A11Y-CRM-01](<nome-acessa-vel-nos-bota-es-sa-de-a-cone-a11ycrm01.md>) — Nome acessível nos botões só de ícone · **P1** · PARCIAL
136. [SLA-MON](<monitor-de-violaa-a-o-de-sla-no-servidor-slamon.md>) — Monitor de violação de SLA no servidor · **P1** · PARCIAL
137. [E02](<banner-whatsapp-indispona-vel-e-bloqueio-honesto-e02.md>) — Banner "WhatsApp indisponível" e bloqueio honesto no compositor · **P1** · PARCIAL
138. [E37](<departamento-a-conexa-o-e37.md>) — Departamento → conexão · **P1** · PARCIAL
139. [E43](<remover-aa-a-es-que-a-go-na-o-tem-e43.md>) — Remover ações que a GO não tem · **P1** · PARCIAL
140. [GO-01](<integraa-a-es-por-insta-ncia-typebot-openai-dify-go01.md>) — Integrações por instância (Typebot, OpenAI, Dify, Flowise, Chatwoot, EvolutionBot) · **P1** · PARCIAL
141. [GO-02](<configuraa-a-es-da-insta-ncia-rejeitar-chamadas--go02.md>) — Configurações da instância (rejeitar chamadas, sempre online, ler mensagens, ignorar grupos, sincronizar histórico completo) · **P1** · PARCIAL
142. [ARQ-19](<encaminhar-por-item-carta-o-lista-tabela-detalhe-arq19.md>) — Encaminhar por item (cartão, lista, tabela, detalhes) · **P1** · PARCIAL
143. [ARQ-39](<prova-autenticada-da-ca-pia-na-storage-leitura-d-arq39.md>) — Prova autenticada da cópia na Storage + leitura de mídia recebida · **P1** · PARCIAL
144. [C-E35](<alertas-operacionais-conexa-es-disco-backup-erro-ce35.md>) — Alertas operacionais (conexões, disco, backup, erro de edge) · **P1** · PARCIAL
145. [058](<jobs-lgpd-058.md>) — Jobs LGPD · **P1** · PARCIAL
146. [SL-062](<departments-whatsapp-api-key-a-vault-sl062.md>) — departments.whatsapp_api_key → Vault · **P1** · PARCIAL
147. [L-04](<chatbot-fluxos-e-chatbot-l1-l04.md>) — Chatbot / fluxos e Chatbot L1 · **P1** · PARCIAL
148. [L-05](<automaa-a-es-gena-ricas-regras-gatilhoa-aa-a-o-l05.md>) — Automações genéricas (regras gatilho→ação) · **P1** · PARCIAL
149. [L-06](<sequa-ncias-de-follow-up-l06.md>) — Sequências de follow-up · **P1** · PARCIAL
150. [L-07](<mensagem-de-ausa-ncia-hora-rio-de-atendimento-l07.md>) — Mensagem de ausência / horário de atendimento · **P1** · PARCIAL
151. [L-09](<auto-fechamento-de-conversas-inativas-l09.md>) — Auto-fechamento de conversas inativas · **P1** · PARCIAL
152. [L-11](<campanhas-cla-ssicas-envio-em-massa-l11.md>) — Campanhas Clássicas (envio em massa) · **P1** · PARCIAL
153. [E13](<settings-guard-e13.md>) — Settings guard · **P1** · DIVERGENTE · depende: E36
154. [L-02](<mensagens-interativas-bota-es-listas-l02.md>) — Mensagens interativas (botões/listas) · **P1** · DIVERGENTE
155. [L-12](<pesquisa-csat-ao-cliente-l12.md>) — Pesquisa CSAT ao cliente · **P1** · DIVERGENTE
156. [X039](<nega-cios-ganhos-do-bitrix24-a-contact-purchases-x039.md>) — Negócios ganhos do Bitrix24 → contact_purchases · **P1** · BLOQUEADO
157. [X198](<aceite-visual-17-17-com-o-dono-x198.md>) — Aceite visual 17/17 com o dono · **P1** · BLOQUEADO
158. [X199](<1a-campanha-para-clientes-7-dias-x199.md>) — 1ª campanha para clientes + 7 dias · **P1** · BLOQUEADO · depende: X035, X198
159. [F97](<gate-c-rpcs-antigas-do-singu-com-anon-f97.md>) — GATE C (RPCs antigas do Singu com anon) · **P1** · BLOQUEADO
160. [TL-099](<revogar-token-github-e08-tl099.md>) — Revogar token GitHub (E08) · **P1** · BLOQUEADO
161. [IA-110](<homologar-bot-sem-envio-ia110.md>) — Homologar bot sem envio · **P1** · BLOQUEADO · depende: IA-010
162. [T11](<persista-ncia-real-da-chamada-sip-t11.md>) — Persistência real da chamada SIP · **P1** · BLOQUEADO
163. [T94](<deploy-das-edges-e-verificaa-a-o-em-produa-a-o-t94.md>) — Deploy das Edges e verificação em produção · **P1** · BLOQUEADO
164. [T95](<deploy-das-edges-e-verificaa-a-o-em-produa-a-o-t95.md>) — Deploy das Edges e verificação em produção · **P1** · BLOQUEADO
165. [SB-91](<ligar-crm-integration-e-verificar-com-contatos-r-sb91.md>) — Ligar crm.integration e verificar com contatos reais · **P1** · BLOQUEADO · depende: SB-91
166. [CRM-R3](<ativar-front-vite-crm-integration-enabled-crmr3.md>) — Ativar front (VITE_CRM_INTEGRATION_ENABLED) · **P1** · BLOQUEADO
167. [CT-11](<envio-com-falha-induzida-a-partial-ct11.md>) — Envio com falha induzida → partial · **P1** · BLOQUEADO · depende: CT-10
168. [CT-18](<envio-real-pelo-chat-ct18.md>) — Envio real pelo chat · **P1** · BLOQUEADO · depende: CT-10
169. [E35](<conexa-o-padra-o-a-nica-e-ata-mica-e35.md>) — Conexão padrão única e atômica · **P1** · BLOQUEADO
170. [E49](<documentaa-a-o-final-aceite-com-2-insta-ncias-re-e49.md>) — Documentação final + aceite com 2 instâncias reais · **P1** · BLOQUEADO · depende: E16, E18, E23
171. [E50](<documentaa-a-o-final-aceite-com-2-insta-ncias-re-e50.md>) — Documentação final + aceite com 2 instâncias reais · **P1** · BLOQUEADO · depende: E16, E18, E23
172. [MIG-97](<rotaa-a-o-das-credenciais-expostas-na-migraa-a-o-mig97.md>) — Rotação das credenciais expostas na migração · **P1** · BLOQUEADO
173. [E25](<rpc-de-limpeza-e2e-e25.md>) — RPC de limpeza E2E · **P1** · BLOQUEADO
174. [E90](<notificar-falha-da-main-por-whatsapp-e90.md>) — Notificar falha da main por WhatsApp · **P1** · BLOQUEADO
175. [M-E21](<pitr-teste-de-restore-me21.md>) — PITR + teste de restore · **P1** · BLOQUEADO
176. [C-E33](<pitr-teste-de-restore-ce33.md>) — PITR + teste de restore · **P1** · BLOQUEADO
177. [SL-029](<pitr-teste-de-restore-sl029.md>) — PITR + teste de restore · **P1** · BLOQUEADO
178. [M-E29](<rotaa-a-o-de-secrets-90-d-me29.md>) — Rotação de secrets >90 d · **P1** · BLOQUEADO
179. [SEC-ROT](<rotaa-a-o-de-credenciais-evolution-service-role--secrot.md>) — Rotação de credenciais (Evolution, service_role, senha DB, Lovable Bearer, MCP) · **P1** · BLOQUEADO
180. [SL-136](<aposentar-dispatcher-n8n-sl136.md>) — Aposentar dispatcher N8N · **P1** · CONCLUIDO
181. [X058](<fila-por-segmento-e-lista-paginada-x058.md>) — Fila por segmento e lista paginada · **P2** · NAO_INICIADO · depende: X057
182. [X059](<campanha-recorrente-x059.md>) — Campanha recorrente · **P2** · NAO_INICIADO
183. [X063](<modelo-de-mensagem-interativa-x063.md>) — Modelo de mensagem interativa · **P2** · NAO_INICIADO
184. [X064](<envio-interativo-com-fallback-x064.md>) — Envio interativo com fallback · **P2** · NAO_INICIADO · depende: X063
185. [X068](<previsa-es-no-servidor-eta-risco-sobreposia-a-o-x068.md>) — Previsões no servidor (ETA, risco, sobreposição) · **P2** · NAO_INICIADO
186. [X070](<tabela-de-motivos-de-supressa-o-x070.md>) — Tabela de motivos de supressão · **P2** · NAO_INICIADO
187. [X074](<mapa-de-calor-top-segmentos-ranking-x074.md>) — Mapa de calor, top segmentos, ranking · **P2** · NAO_INICIADO · depende: X057
188. [X086](<ma-tricas-de-template-x086.md>) — Métricas de template · **P2** · NAO_INICIADO · depende: X041
189. [X109](<sub-abas-pra-via-e-contatos-e-sobreposia-a-o-x109.md>) — Sub-abas "Prévia e Contatos" e "Sobreposição" · **P2** · NAO_INICIADO · depende: X068
190. [X110](<salvar-a-publicar-autosave-versa-es-x110.md>) — Salvar × Publicar, autosave, versões · **P2** · NAO_INICIADO · depende: X101
191. [X130](<bota-es-na-campanha-x130.md>) — Botões na campanha · **P2** · NAO_INICIADO · depende: X063, X064
192. [X149](<card-fila-por-segmento-x149.md>) — Card "Fila por segmento" · **P2** · NAO_INICIADO · depende: X058
193. [X177](<importar-exportar-em-lote-rpc-x177.md>) — Importar/exportar em lote (RPC) · **P2** · NAO_INICIADO · depende: X176
194. [X183](<importar-csv-xlsx-txt-e-exportar-x183.md>) — Importar CSV/XLSX/TXT e exportar · **P2** · NAO_INICIADO · depende: X177
195. [F65](<edge-multiplix-prepare-voice-f65.md>) — Edge multiplix-prepare-voice · **P2** · NAO_INICIADO
196. [F77](<blocos-de-voz-ia-gravaa-a-o-arquivo-f77.md>) — Blocos de voz IA / gravação / arquivo · **P2** · NAO_INICIADO · depende: F65
197. [F85](<registrar-envio-como-interaa-a-o-no-singu-f85.md>) — Registrar envio como interação no Singu · **P2** · NAO_INICIADO
198. [EVO-2](<pressa-o-de-contato-evo2.md>) — Pressão de contato · **P2** · NAO_INICIADO · depende: F85
199. [IA-060](<medir-utilidade-da-ia-ia060.md>) — Medir utilidade da IA · **P2** · NAO_INICIADO
200. [IA-082](<documentos-com-versa-o-e-validade-ia082.md>) — Documentos com versão e validade · **P2** · NAO_INICIADO
201. [IA-084](<melhorar-busca-textual-ia084.md>) — Melhorar busca textual · **P2** · NAO_INICIADO
202. [IA-087](<validar-citaa-a-es-ia087.md>) — Validar citações · **P2** · NAO_INICIADO · depende: IA-082
203. [IA-092](<extrair-fatos-como-propostas-ia092.md>) — Extrair fatos como propostas · **P2** · NAO_INICIADO
204. [IA-094](<compromisso-aprovado-a-tarefa-ia094.md>) — Compromisso aprovado → tarefa · **P2** · NAO_INICIADO · depende: IA-093
205. [IA-096](<mema-ria-por-atendimento-assunto-ia096.md>) — Memória por atendimento/assunto · **P2** · NAO_INICIADO
206. [IA-103](<escalonamento-e-retorno-ia103.md>) — Escalonamento e retorno · **P2** · NAO_INICIADO
207. [IA-113](<score-a-probabilidade-ia113.md>) — Score × probabilidade · **P2** · NAO_INICIADO
208. [IA-151](<conversa-a-briefing-comercial-ia151.md>) — Conversa → briefing comercial · **P2** · NAO_INICIADO
209. [IA-186](<e2e-do-percurso-de-ia-ia186.md>) — E2E do percurso de IA · **P2** · NAO_INICIADO · depende: IA-010
210. [IA-190](<decisa-o-ta-cnica-de-liberaa-a-o-ia190.md>) — Decisão técnica de liberação · **P2** · NAO_INICIADO
211. [B15](<rls-de-messages-a-ciclo-de-vida-bucket-audio-mem-b15.md>) — RLS de messages × ciclo de vida; bucket audio-memes público · **P2** · NAO_INICIADO
212. [L9](<haspermission-no-servidor-l9.md>) — hasPermission no servidor · **P2** · NAO_INICIADO
213. [L11](<departments-whatsapp-api-key-em-texto-puro-l11.md>) — departments.whatsapp_api_key em texto puro · **P2** · NAO_INICIADO
214. [T1](<painel-inteliga-ncia-comercial-briefing-disc-gat-t1.md>) — Painel "Inteligência Comercial" (briefing, DISC, gatilhos, rapport, horários, churn) · **P2** · NAO_INICIADO
215. [DASH-014](<hista-rico-por-autoria-a-rls-dash014.md>) — Histórico por autoria × RLS · **P2** · NAO_INICIADO · depende: DASH-022
216. [DASH-021](<ciclo-de-atendimento-e-recomposia-a-o-hista-rica-dash021.md>) — Ciclo de atendimento e recomposição histórica · **P2** · NAO_INICIADO
217. [023](<ciclo-de-atendimento-e-recomposia-a-o-hista-rica-023.md>) — Ciclo de atendimento e recomposição histórica · **P2** · NAO_INICIADO
218. [DASH-060](<presena-a-real-no-ranking-dash060.md>) — Presença real no ranking · **P2** · NAO_INICIADO
219. [DASH-063](<sa-rie-nps-no-gra-fico-dash063.md>) — Série NPS no gráfico · **P2** · NAO_INICIADO
220. [DASH-067](<ponderar-por-amostra-dash067.md>) — Ponderar por amostra · **P2** · NAO_INICIADO
221. [DASH-069](<comparaa-a-o-temporal-equivalente-dash069.md>) — Comparação temporal equivalente · **P2** · NAO_INICIADO
222. [DASH-073](<alertas-de-ia-por-interface-restrita-dash073.md>) — Alertas de IA por interface restrita · **P2** · NAO_INICIADO
223. [DASH-076](<observado-a-estimado-metodologia-dash076.md>) — Observado × estimado; metodologia · **P2** · NAO_INICIADO
224. [077](<observado-a-estimado-metodologia-077.md>) — Observado × estimado; metodologia · **P2** · NAO_INICIADO
225. [DASH-078](<capacidade-configurada-dash078.md>) — Capacidade configurada · **P2** · NAO_INICIADO
226. [DASH-079](<entradas-vazias-nan-na-previsa-o-dash079.md>) — Entradas vazias/NaN na previsão · **P2** · NAO_INICIADO
227. [DASH-086](<relata-rio-dashboard-dash086.md>) — Relatório = Dashboard · **P2** · NAO_INICIADO · depende: DASH-083
228. [DASH-094](<e2e-das-9-abas-dash094.md>) — E2E das 9 abas · **P2** · NAO_INICIADO
229. [E46](<smoke-e2e-do-dashboard-e46.md>) — Smoke E2E do Dashboard · **P2** · NAO_INICIADO
230. [A11Y-06](<barras-de-progresso-sem-nome-a11y06.md>) — Barras de progresso sem nome · **P2** · NAO_INICIADO
231. [A11Y-09](<aria-expanded-em-div-a11y09.md>) — aria-expanded em div · **P2** · NAO_INICIADO
232. [T77](<responsivo-1280-sheet-390-px-t77.md>) — Responsivo (<1280 Sheet, 390 px) · **P2** · NAO_INICIADO
233. [SL-018](<espera-transfera-ncia-confera-ncia-sl018.md>) — Espera, transferência, conferência · **P2** · NAO_INICIADO
234. [IA-123](<transcria-a-o-revisa-vel-original-correa-a-o-ia123.md>) — Transcrição revisável (original + correção) · **P2** · NAO_INICIADO
235. [IA-121](<contrato-stt-limites-de-arquivo-transcria-a-o-au-ia121.md>) — Contrato STT, limites de arquivo, transcrição automática sem duplicar, diálogos/STS/efeitos · **P2** · NAO_INICIADO
236. [122](<contrato-stt-limites-de-arquivo-transcria-a-o-au-122.md>) — Contrato STT, limites de arquivo, transcrição automática sem duplicar, diálogos/STS/efeitos · **P2** · NAO_INICIADO
237. [124](<contrato-stt-limites-de-arquivo-transcria-a-o-au-124.md>) — Contrato STT, limites de arquivo, transcrição automática sem duplicar, diálogos/STS/efeitos · **P2** · NAO_INICIADO
238. [128](<contrato-stt-limites-de-arquivo-transcria-a-o-au-128.md>) — Contrato STT, limites de arquivo, transcrição automática sem duplicar, diálogos/STS/efeitos · **P2** · NAO_INICIADO
239. [F35](<fechar-escrita-em-department-invites-f35.md>) — Fechar escrita em department_invites · **P2** · NAO_INICIADO · depende: F62
240. [F47](<set-profile-department-request-department-access-f47.md>) — set_profile_department, request_department_access, notify_team_mentions · **P2** · NAO_INICIADO
241. [F73](<presena-a-real-f73.md>) — Presença real · **P2** · NAO_INICIADO
242. [TC-66](<presena-a-real-tc66.md>) — Presença real · **P2** · NAO_INICIADO
243. [F94](<e2e-team-chat-f94.md>) — E2E Team Chat · **P2** · NAO_INICIADO
244. [TC-88](<e2e-team-chat-tc88.md>) — E2E Team Chat · **P2** · NAO_INICIADO
245. [CT-001](<media-a-o-inicial-cliques-segundos-ct001.md>) — Medição inicial cliques/segundos · **P2** · NAO_INICIADO
246. [CT-003](<150-contatos-de-teste-no-banco-local-ct003.md>) — 150+ contatos de teste no banco local · **P2** · NAO_INICIADO
247. [CT-088](<retirar-edia-a-o-em-massa-selea-a-o-limitada-a-3-ct088.md>) — Retirar edição em massa; seleção limitada a 3 · **P2** · NAO_INICIADO
248. [CT-089](<retirar-edia-a-o-em-massa-selea-a-o-limitada-a-3-ct089.md>) — Retirar edição em massa; seleção limitada a 3 · **P2** · NAO_INICIADO
249. [SB-93](<impacto-de-ligar-a-flag-sb93.md>) — Impacto de ligar a flag · **P2** · NAO_INICIADO
250. [RES-1](<delegar-tarefa-a-outra-pessoa-assigned-to-res1.md>) — Delegar tarefa a outra pessoa (assigned_to) · **P2** · NAO_INICIADO
251. [CT-49](<rail-envios-hoje-7-dias-ct49.md>) — Rail "Envios hoje / 7 dias" · **P2** · NAO_INICIADO
252. [CT-93](<breadcrumbs-catalog-alerta-no-sentry-ct93.md>) — Breadcrumbs catalog. + alerta no Sentry · **P2** · NAO_INICIADO
253. [DIST-6](<painel-de-monitoramento-da-distribuia-a-o-e-aler-dist6.md>) — Painel de monitoramento da distribuição e alertas de fallback · **P2** · NAO_INICIADO
254. [E13](<sinalizar-conexa-o-sem-credencial-e13.md>) — Sinalizar conexão sem credencial · **P2** · NAO_INICIADO
255. [E14](<rotaa-a-o-do-token-de-insta-ncia-e14.md>) — Rotação do token de instância · **P2** · NAO_INICIADO
256. [E33](<rate-limit-do-webhook-por-insta-ncia-e33.md>) — Rate limit do webhook por instância · **P2** · NAO_INICIADO
257. [GO-05](<votos-e-resultado-de-enquete-go05.md>) — Votos e resultado de enquete · **P2** · NAO_INICIADO
258. [ARQ-50](<homologaa-a-o-visual-relata-rio-final-arq50.md>) — Homologação visual + relatório final · **P2** · NAO_INICIADO
259. [ARQ-NP3](<pola-tica-d2-sa-dentro-do-zapp-nas-bolhas-do-cha-arqnp3.md>) — Política D2 ("só dentro do ZAPP") nas bolhas do chat · **P2** · NAO_INICIADO
260. [ARQ-NP4](<encaminhar-para-grupos-arqnp4.md>) — Encaminhar para grupos · **P2** · NAO_INICIADO
261. [A06B](<nome-acessa-vel-do-play-com-nome-do-arquivo-a06b.md>) — Nome acessível do play com nome do arquivo · **P2** · NAO_INICIADO
262. [SL-074](<prova-de-som-real-audio-volume-em-5-players-sl074.md>) — Prova de som real (audio.volume em 5 players) · **P2** · NAO_INICIADO
263. [E45](<prova-de-som-real-audio-volume-em-5-players-e45.md>) — Prova de som real (audio.volume em 5 players) · **P2** · NAO_INICIADO
264. [R2-INB-060](<detalhes-do-arquivo-apa-s-trocar-de-item-r2inb060.md>) — Detalhes do arquivo após trocar de item · **P2** · NAO_INICIADO
265. [R2-INB-021](<favoritar-fixar-mensagem-responder-depois-report-r2inb021.md>) — Favoritar/Fixar mensagem, Responder depois, Reportar, "Adicionar tag" no header, /note e /tag · **P2** · NAO_INICIADO
266. [R2-INB-003](<mensagens-interativas-bota-es-listas-r2inb003.md>) — Mensagens interativas (botões/listas) · **P2** · NAO_INICIADO
267. [SL-070](<fila-offline-indexeddb-e-throttle-com-dedupe-ent-sl070.md>) — Fila offline (IndexedDB) e throttle com dedupe entre abas · **P2** · NAO_INICIADO
268. [SL-071](<remover-derivaa-a-o-por-messages-length-status-r-sl071.md>) — Remover derivação por messages.length (status "Resolvidas") · **P2** · NAO_INICIADO
269. [008](<pr-size-gate-notify-ci-failure-008.md>) — PR Size Gate + Notify CI Failure · **P2** · NAO_INICIADO · depende: E90
270. [SL-121](<pr-size-gate-notify-ci-failure-sl121.md>) — PR Size Gate + Notify CI Failure · **P2** · NAO_INICIADO · depende: E90
271. [SL-058](<perfil-somente-leitura-sl058.md>) — Perfil somente-leitura · **P2** · NAO_INICIADO
272. [SL-103](<initial-js-a-300-kb-sl103.md>) — Initial JS ≤ 300 KB · **P2** · NAO_INICIADO
273. [SL-104](<update-marcar-como-lido-551-ms-sl104.md>) — UPDATE "marcar como lido" 551 ms · **P2** · NAO_INICIADO
274. [SL-050](<zod-no-corpo-do-evolution-api-sl050.md>) — Zod no corpo do evolution-api · **P2** · NAO_INICIADO
275. [SEC-FRONTEND-02](<href-sem-validaa-a-o-xss-no-clique-secfrontend02.md>) — href sem validação (XSS no clique) · **P2** · NAO_INICIADO
276. [L-08](<mensagens-automa-ticas-de-boas-vindas-e-encerram-l08.md>) — Mensagens automáticas de boas-vindas e encerramento · **P2** · NAO_INICIADO
277. [L-13](<nps-peria-dico-l13.md>) — NPS periódico · **P2** · NAO_INICIADO
278. [L-30](<sentry-monitoramento-de-erros-l30.md>) — Sentry (monitoramento de erros) · **P2** · NAO_INICIADO
279. [L-32](<provedor-whatsapp-cloud-api-oficial-l32.md>) — Provedor WhatsApp Cloud API oficial · **P2** · NAO_INICIADO
280. [E-05](<game-day-exerca-cio-de-dr-restore-provado-e05.md>) — Game day / exercício de DR / restore provado · **P2** · NAO_INICIADO
281. [ADV-1](<advisors-de-segurana-a-performance-do-backend-de-adv1.md>) — Advisors de segurança/performance do backend de e-mail · **P2** · NAO_VERIFICAVEL
282. [SL-188](<registry-de-provedores-provider-fake-cloud-api-s-sl188.md>) — Registry de provedores, provider fake, Cloud API, switchover · **P2** · NAO_VERIFICAVEL
283. [X003](<base-de-demonstraa-a-o-das-17-telas-x003.md>) — Base de demonstração das 17 telas · **P2** · PARCIAL
284. [X004](<ra-gua-visual-print-ao-lado-do-mock-x004.md>) — Régua visual (print ao lado do mock) · **P2** · PARCIAL · depende: X003
285. [X040](<rfm-calculado-localmente-x040.md>) — RFM calculado localmente · **P2** · PARCIAL · depende: X037, X039
286. [X048](<estados-whatsapp-desconectado-crm-indispona-vel--x048.md>) — Estados WhatsApp desconectado / CRM indisponível / sem permissão · **P2** · PARCIAL
287. [X051](<fluxo-a-nico-pausar-retomar-cancelar-nas-5-telas-x051.md>) — Fluxo único pausar/retomar/cancelar nas 5 telas · **P2** · PARCIAL
288. [X052](<aba-e-campanha-na-url-x052.md>) — Aba e campanha na URL · **P2** · PARCIAL
289. [X060](<dias-da-semana-e-na-o-perturbe-x060.md>) — Dias da semana e "não perturbe" · **P2** · PARCIAL · depende: X018
290. [X065](<a-b-completo-com-vencedor-x065.md>) — A/B completo com vencedor · **P2** · PARCIAL
291. [X066](<aprovaa-a-o-interna-de-template-x066.md>) — Aprovação interna de template · **P2** · PARCIAL · depende: X063
292. [X067](<envio-de-teste-com-trilha-e-limite-x067.md>) — Envio de teste com trilha e limite · **P2** · PARCIAL · depende: X019
293. [X069](<escala-realtime-eco-no-chat-auditoria-x069.md>) — Escala, realtime, eco no Chat, auditoria · **P2** · PARCIAL
294. [X071](<trilha-da-supressa-o-e-fim-do-delete-fa-sico-x071.md>) — Trilha da supressão e fim do DELETE físico · **P2** · PARCIAL · depende: X070
295. [X073](<lidas-conversa-es-receita-no-talkx-overview-stat-x073.md>) — Lidas/conversões/receita no talkx_overview_stats · **P2** · PARCIAL · depende: X041
296. [X075](<benchmarks-e-insights-no-servidor-x075.md>) — Benchmarks e insights no servidor · **P2** · PARCIAL · depende: X074
297. [X077](<kpis-da-visa-o-geral-vindos-da-rpc-x077.md>) — KPIs da Visão geral vindos da RPC · **P2** · PARCIAL
298. [X078](<listagem-paginada-no-servidor-x078.md>) — Listagem paginada no servidor · **P2** · PARCIAL
299. [X080](<aa-a-es-de-linha-persistidas-x080.md>) — Ações de linha persistidas · **P2** · PARCIAL · depende: X051
300. [X083](<colunas-canal-a-cone-ma-dia-interativo-arquivo-x083.md>) — Colunas canal/ícone/mídia/interativo/arquivo · **P2** · PARCIAL · depende: X061, X063
301. [X084](<rpc-save-talkx-template-versa-o-nota-restauraa-a-x084.md>) — RPC save_talkx_template (versão, nota, restauração) · **P2** · PARCIAL · depende: X083
302. [X085](<variantes-em-conjunto-arquivar-guarda-importaa-a-x085.md>) — Variantes em conjunto, arquivar, guarda, importação · **P2** · PARCIAL · depende: X084
303. [X090](<aa-a-es-unificadas-aprovaa-a-o-x090.md>) — Ações unificadas + aprovação · **P2** · PARCIAL · depende: X066
304. [X091](<kpis-e-desempenho-deste-template-pelas-rpcs-x091.md>) — KPIs e "Desempenho deste template" pelas RPCs · **P2** · PARCIAL · depende: X086
305. [X096](<bota-es-enquete-no-template-x096.md>) — Botões/enquete no template · **P2** · PARCIAL · depende: X063
306. [X101](<ciclo-de-vida-do-segmento-rascunho-versa-es-tags-x101.md>) — Ciclo de vida do segmento (rascunho, versões, tags) · **P2** · PARCIAL · depende: X100
307. [X104](<modelo-v2-no-front-x104.md>) — Modelo v2 no front · **P2** · PARCIAL · depende: X100
308. [X107](<cata-logo-filtros-dispona-veis-x107.md>) — Catálogo "Filtros disponíveis" · **P2** · PARCIAL · depende: X100
309. [X121](<3-confirmaa-a-es-gravadas-quem-lana-ou-x121.md>) — 3 confirmações gravadas + quem lançou · **P2** · PARCIAL · depende: X120
310. [X123](<restaurar-rascunho-inteiro-x123.md>) — Restaurar rascunho inteiro · **P2** · PARCIAL · depende: X119
311. [X131](<resumo-da-campanha-calculado-no-servidor-x131.md>) — Resumo da campanha calculado no servidor · **P2** · PARCIAL · depende: X068
312. [X133](<passo-entrega-completo-x133.md>) — Passo Entrega completo · **P2** · PARCIAL · depende: X060
313. [X136](<modal-confirmar-disparo-com-3-confirmaa-a-es-x136.md>) — Modal "Confirmar disparo" com 3 confirmações · **P2** · PARCIAL · depende: X121
314. [X142](<progresso-por-segmento-e-pra-checagem-de-retomad-x142.md>) — Progresso por segmento e pré-checagem de retomada · **P2** · PARCIAL · depende: X057
315. [X144](<hooks-das-rpcs-com-realtime-degradado-x144.md>) — Hooks das RPCs com realtime/degradado · **P2** · PARCIAL · depende: X140, X142
316. [X146](<kpis-ao-vivo-com-comparativos-x146.md>) — KPIs ao vivo com comparativos · **P2** · PARCIAL · depende: X140
317. [X147](<ritmo-previsto-e-ta-rmino-x147.md>) — Ritmo, previsto e término · **P2** · PARCIAL · depende: X068
318. [X148](<saa-de-da-campanha-x148.md>) — "Saúde da campanha" · **P2** · PARCIAL
319. [X150](<tabela-unificada-de-destinata-rios-x150.md>) — Tabela unificada de destinatários · **P2** · PARCIAL · depende: X141
320. [X159](<checklist-para-retomar-x159.md>) — "Checklist para retomar" · **P2** · PARCIAL · depende: X156
321. [X168](<exportar-pdf-csv-x168.md>) — Exportar PDF/CSV · **P2** · PARCIAL
322. [X176](<rpcs-de-leitura-da-supressa-o-x176.md>) — RPCs de leitura da supressão · **P2** · PARCIAL · depende: X070
323. [X196](<banco-limpo-replay-ledger-permissa-es-x196.md>) — Banco limpo (replay, ledger, permissões) · **P2** · PARCIAL
324. [F59](<recalcular-pa-blico-agendado-f59.md>) — Recalcular público agendado · **P2** · PARCIAL
325. [F60](<capacidades-da-conexa-o-f60.md>) — Capacidades da conexão · **P2** · PARCIAL
326. [F64](<ativos-e-permissa-es-de-voz-f64.md>) — Ativos e permissões de voz · **P2** · PARCIAL · depende: F65
327. [F73](<painel-01-completo-f73.md>) — Painel 01 completo · **P2** · PARCIAL
328. [F75](<exclusa-es-e-pa-blicos-salvos-f75.md>) — Exclusões e públicos salvos · **P2** · PARCIAL
329. [F78](<n-a-m-sempre-visa-vel-autosave-f78.md>) — N × M sempre visível + autosave · **P2** · PARCIAL
330. [F80](<monitor-com-erro-lega-vel-e-paginaa-a-o-f80.md>) — Monitor com erro legível e paginação · **P2** · PARCIAL
331. [F84](<sala-de-retornos-f84.md>) — Sala de retornos · **P2** · PARCIAL
332. [F90](<e2e-no-e2e-logado-yml-f90.md>) — E2E no e2e-logado.yml · **P2** · PARCIAL
333. [TL-001](<e2e-wizard-advances-to-step-2-vermelho-tl001.md>) — E2E "wizard advances to step 2" vermelho · **P2** · PARCIAL
334. [TL-180](<e95-va-nculo-pendentes-sugesta-es-de-conversa-o-tl180.md>) — E95 vínculo/pendentes/sugestões de conversão · **P2** · PARCIAL · depende: X036
335. [IA-006](<natureza-do-indicador-visa-vel-na-tela-ia006.md>) — Natureza do indicador visível na tela · **P2** · PARCIAL
336. [IA-012](<identidades-de-servia-o-pra-prias-ia012.md>) — Identidades de serviço próprias · **P2** · PARCIAL
337. [IA-016](<restringir-destinos-de-rede-ia016.md>) — Restringir destinos de rede · **P2** · PARCIAL
338. [IA-017](<allowlist-de-segredos-por-provedor-ia017.md>) — Allowlist de segredos por provedor · **P2** · PARCIAL
339. [IA-020](<invalidar-caches-acesso-ia020.md>) — Invalidar caches/acesso · **P2** · PARCIAL
340. [IA-021](<sentimento-com-o-mesmo-significado-em-todo-lugar-ia021.md>) — Sentimento com o mesmo significado em todo lugar · **P2** · PARCIAL
341. [IA-025](<validar-toda-saa-da-de-modelo-ia025.md>) — Validar toda saída de modelo · **P2** · PARCIAL
342. [IA-045](<operaa-a-es-longas-em-fila-dura-vel-ia045.md>) — Operações longas em fila durável · **P2** · PARCIAL
343. [IA-053](<contabilizar-streaming-e-cancelamentos-ia053.md>) — Contabilizar streaming e cancelamentos · **P2** · PARCIAL
344. [IA-055](<tarifas-versionadas-e-custo-conciliado-ia055.md>) — Tarifas versionadas e custo conciliado · **P2** · PARCIAL
345. [IA-063](<conversas-200-mensagens-ia063.md>) — Conversas > 200 mensagens · **P2** · PARCIAL · depende: IA-062
346. [IA-065](<delimitar-contexto-profissional-ia065.md>) — Delimitar contexto profissional · **P2** · PARCIAL
347. [IA-067](<conclusa-es-ligadas-a-s-mensagens-ia067.md>) — Conclusões ligadas às mensagens · **P2** · PARCIAL
348. [IA-068](<estimativa-a-medida-ia068.md>) — Estimativa × medida · **P2** · PARCIAL
349. [IA-070](<detectar-ana-lise-desatualizada-ia070.md>) — Detectar análise desatualizada · **P2** · PARCIAL
350. [IA-072](<comparar-original-a-reescrita-ia072.md>) — Comparar original × reescrita · **P2** · PARCIAL
351. [IA-077](<objea-a-es-no-dia-logo-completo-ia077.md>) — Objeções no diálogo completo · **P2** · PARCIAL · depende: IA-062
352. [IA-079](<erros-silenciosos-das-ferramentas-ia079.md>) — Erros silenciosos das ferramentas · **P2** · PARCIAL
353. [IA-080](<gerar-a-usar-a-aprovar-a-enviar-ia080.md>) — Gerar → usar → aprovar → enviar · **P2** · PARCIAL
354. [IA-081](<recuperaa-a-o-de-conhecimento-compartilhada-ia081.md>) — Recuperação de conhecimento compartilhada · **P2** · PARCIAL
355. [IA-090](<revogar-fontes-em-todas-as-camadas-ia090.md>) — Revogar fontes em todas as camadas · **P2** · PARCIAL
356. [IA-091](<mema-ria-humana-preservada-com-origem-ia091.md>) — Memória humana preservada com origem · **P2** · PARCIAL
357. [IA-098](<resolver-identidades-com-cautela-ia098.md>) — Resolver identidades com cautela · **P2** · PARCIAL
358. [IA-101](<governar-etiquetas-ia101.md>) — Governar etiquetas · **P2** · PARCIAL
359. [IA-102](<roteamento-determina-stico-ia102.md>) — Roteamento determinístico · **P2** · PARCIAL
360. [IA-109](<evitar-loops-ia109.md>) — Evitar loops · **P2** · PARCIAL
361. [IA-111](<inatividade-real-ia111.md>) — Inatividade real · **P2** · PARCIAL
362. [IA-118](<pera-odos-gerenciais-uniformes-ia118.md>) — Períodos gerenciais uniformes · **P2** · PARCIAL
363. [IA-122](<limites-de-a-udio-ia122.md>) — Limites de áudio · **P2** · PARCIAL
364. [IA-124](<transcria-a-o-automa-tica-controlada-ia124.md>) — Transcrição automática controlada · **P2** · PARCIAL
365. [IA-126](<confirmaa-a-o-de-a-udio-enviado-ia126.md>) — Confirmação de áudio enviado · **P2** · PARCIAL
366. [IA-133](<ingesta-o-segura-de-anexos-ia133.md>) — Ingestão segura de anexos · **P2** · PARCIAL
367. [IA-139](<anexos-no-contexto-da-ana-lise-ia139.md>) — Anexos no contexto da análise · **P2** · PARCIAL
368. [IA-142](<origem-de-cada-informaa-a-o-ia142.md>) — Origem de cada informação · **P2** · PARCIAL
369. [IA-144](<painel-a-modal-teclado-estados-visuais-legibilid-ia144.md>) — Painel × modal, teclado, estados visuais, legibilidade · **P2** · PARCIAL
370. [145](<painel-a-modal-teclado-estados-visuais-legibilid-145.md>) — Painel × modal, teclado, estados visuais, legibilidade · **P2** · PARCIAL
371. [146](<painel-a-modal-teclado-estados-visuais-legibilid-146.md>) — Painel × modal, teclado, estados visuais, legibilidade · **P2** · PARCIAL
372. [147](<painel-a-modal-teclado-estados-visuais-legibilid-147.md>) — Painel × modal, teclado, estados visuais, legibilidade · **P2** · PARCIAL
373. [IA-149](<separar-administraa-a-o-e-operaa-a-o-ia149.md>) — Separar administração e operação · **P2** · PARCIAL
374. [IA-152](<recomendar-produtos-com-restria-a-es-reais-ia152.md>) — Recomendar produtos com restrições reais · **P2** · PARCIAL
375. [IA-181](<testes-reais-contratos-de-provedor-isolamento-co-ia181.md>) — Testes reais, contratos de provedor, isolamento, concorrência · **P2** · PARCIAL
376. [182](<testes-reais-contratos-de-provedor-isolamento-co-182.md>) — Testes reais, contratos de provedor, isolamento, concorrência · **P2** · PARCIAL
377. [183](<testes-reais-contratos-de-provedor-isolamento-co-183.md>) — Testes reais, contratos de provedor, isolamento, concorrência · **P2** · PARCIAL
378. [185](<testes-reais-contratos-de-provedor-isolamento-co-185.md>) — Testes reais, contratos de provedor, isolamento, concorrência · **P2** · PARCIAL
379. [IA-188](<conjunto-de-avaliaa-a-o-pt-br-200-casos-ia188.md>) — Conjunto de avaliação PT-BR (200 casos) · **P2** · PARCIAL
380. [IA-189](<ensaio-de-carga-e-ora-amento-ia189.md>) — Ensaio de carga e orçamento · **P2** · PARCIAL
381. [A2](<normalizaa-a-o-de-sentimento-a2.md>) — Normalização de sentimento · **P2** · PARCIAL
382. [B6](<toda-chamada-paga-no-ledger-b6.md>) — Toda chamada paga no ledger · **P2** · PARCIAL
383. [B14](<cota-realmente-ata-mica-e-fechada-b14.md>) — Cota realmente atômica e fechada · **P2** · PARCIAL
384. [DASH-007](<matriz-de-acesso-aprovada-dash007.md>) — Matriz de acesso aprovada · **P2** · PARCIAL
385. [DASH-008](<pera-odos-padronizados-sa-o-paulo-dash008.md>) — Períodos padronizados (São Paulo) · **P2** · PARCIAL
386. [DASH-010](<conjunto-de-aceitaa-a-o-dash010.md>) — Conjunto de aceitação · **P2** · PARCIAL
387. [DASH-012](<controle-no-servidor-das-abas-gerenciais-dash012.md>) — Controle no servidor das abas gerenciais · **P2** · PARCIAL
388. [DASH-020](<minimizar-dados-sensa-veis-dash020.md>) — Minimizar dados sensíveis · **P2** · PARCIAL
389. [DASH-025](<estados-contados-unificados-dash025.md>) — Estados contados unificados · **P2** · PARCIAL
390. [DASH-027](<instante-de-refera-ncia-filtros-previsa-veis-ma--dash027.md>) — Instante de referência, filtros previsíveis, média×mediana · **P2** · PARCIAL
391. [028](<instante-de-refera-ncia-filtros-previsa-veis-ma--028.md>) — Instante de referência, filtros previsíveis, média×mediana · **P2** · PARCIAL
392. [029](<instante-de-refera-ncia-filtros-previsa-veis-ma--029.md>) — Instante de referência, filtros previsíveis, média×mediana · **P2** · PARCIAL
393. [DASH-031](<sla-agregado-no-servidor-dash031.md>) — SLA agregado no servidor · **P2** · PARCIAL
394. [DASH-033](<ana-lises-sentimento-agregados-dash033.md>) — Análises/sentimento agregados · **P2** · PARCIAL
395. [DASH-051](<elegibilidade-a-nica-de-sla-dash051.md>) — Elegibilidade única de SLA · **P2** · PARCIAL
396. [DASH-082](<frequa-ncia-apresentada-dash082.md>) — Frequência apresentada · **P2** · PARCIAL · depende: DASH-083
397. [DASH-088](<estados-de-widget-padronizados-dash088.md>) — Estados de widget padronizados · **P2** · PARCIAL
398. [DASH-089](<acessibilidade-das-9-abas-dash089.md>) — Acessibilidade das 9 abas · **P2** · PARCIAL
399. [DASH-093](<fixtures-de-escala-dash093.md>) — Fixtures de escala · **P2** · PARCIAL
400. [FASE7](<relata-rios-personalizada-fase7.md>) — Relatórios: "Personalizada" · **P2** · PARCIAL · depende: DASH-083
401. [RES-PERSONALIZADA](<tile-personalizada-respersonalizada.md>) — Tile "Personalizada" · **P2** · PARCIAL
402. [T76](<acessibilidade-axe-0-serious-critical-t76.md>) — Acessibilidade (axe 0 serious/critical) · **P2** · PARCIAL
403. [T84](<acessibilidade-axe-0-serious-critical-t84.md>) — Acessibilidade (axe 0 serious/critical) · **P2** · PARCIAL
404. [T86](<e2e-telefonia-no-ci-t86.md>) — E2E Telefonia no CI · **P2** · PARCIAL
405. [E051](<webhook-call-completo-mapa-de-motivos-e051.md>) — Webhook CALL completo + mapa de motivos · **P2** · PARCIAL
406. [E052](<webhook-call-completo-mapa-de-motivos-e052.md>) — Webhook CALL completo + mapa de motivos · **P2** · PARCIAL
407. [IA-125](<reprodua-a-o-streaming-e-confirmaa-a-o-de-a-udio-ia125.md>) — Reprodução/streaming e confirmação de áudio enviado · **P2** · PARCIAL
408. [126](<reprodua-a-o-streaming-e-confirmaa-a-o-de-a-udio-126.md>) — Reprodução/streaming e confirmação de áudio enviado · **P2** · PARCIAL
409. [IA-129](<comandos-de-voz-autenticados-e-por-papel-ia129.md>) — Comandos de voz autenticados e por papel · **P2** · PARCIAL
410. [F12](<autorizaa-a-o-por-is-admin-or-supervisor-f12.md>) — Autorização por is_admin_or_supervisor · **P2** · PARCIAL
411. [R9](<autorizaa-a-o-por-is-admin-or-supervisor-r9.md>) — Autorização por is_admin_or_supervisor · **P2** · PARCIAL
412. [F29](<conversa-direta-sem-duplicar-f29.md>) — Conversa direta sem duplicar · **P2** · PARCIAL
413. [TC-002](<conversa-direta-sem-duplicar-tc002.md>) — Conversa direta sem duplicar · **P2** · PARCIAL
414. [F46](<sair-remover-membro-com-promoa-a-o-de-dono-f46.md>) — Sair/remover membro com promoção de dono · **P2** · PARCIAL
415. [TC-38](<sair-remover-membro-com-promoa-a-o-de-dono-tc38.md>) — Sair/remover membro com promoção de dono · **P2** · PARCIAL
416. [TC-004](<sair-remover-membro-com-promoa-a-o-de-dono-tc004.md>) — Sair/remover membro com promoção de dono · **P2** · PARCIAL
417. [F69](<busca-no-servidor-f69.md>) — Busca no servidor · **P2** · PARCIAL
418. [TC-62](<busca-no-servidor-tc62.md>) — Busca no servidor · **P2** · PARCIAL
419. [F86](<mena-a-es-com-notificaa-a-o-f86.md>) — Menções com notificação · **P2** · PARCIAL · depende: F47
420. [TC-79](<mena-a-es-com-notificaa-a-o-tc79.md>) — Menções com notificação · **P2** · PARCIAL · depende: F47
421. [A2](<quem-pode-inscrever-terceiros-em-grupo-a2.md>) — Quem pode inscrever terceiros em grupo · **P2** · PARCIAL
422. [CT-019](<ordenaa-a-o-por-a-ltimo-pedido-tempo-sem-comprar-ct019.md>) — Ordenação por último pedido/tempo sem comprar/RFM · **P2** · PARCIAL · depende: CT-023
423. [CT-023](<lote-singu-com-campos-novos-ct023.md>) — Lote Singu com campos novos · **P2** · PARCIAL · depende: CT-111
424. [CT-024](<lote-singu-com-campos-novos-ct024.md>) — Lote Singu com campos novos · **P2** · PARCIAL · depende: CT-111
425. [CT-082](<trocar-responsa-vel-1-a-1-com-hista-rico-ct082.md>) — Trocar responsável 1 a 1 com histórico · **P2** · PARCIAL
426. [CT-086](<lixeira-30-dias-telas-de-lixeira-higiene-de-lega-ct086.md>) — Lixeira 30 dias + telas de lixeira/higiene de legados · **P2** · PARCIAL
427. [CT-087](<lixeira-30-dias-telas-de-lixeira-higiene-de-lega-ct087.md>) — Lixeira 30 dias + telas de lixeira/higiene de legados · **P2** · PARCIAL
428. [SB-92](<deploy-smoke-da-edge-sb92.md>) — Deploy/smoke da edge · **P2** · PARCIAL
429. [S084](<journeystatshero-s084.md>) — JourneyStatsHero · **P2** · PARCIAL
430. [EN-025](<lista-sa-por-pa-gina-no-servidor-en025.md>) — Lista só por página no servidor · **P2** · PARCIAL
431. [OTH-005](<lista-sa-por-pa-gina-no-servidor-oth005.md>) — Lista só por página no servidor · **P2** · PARCIAL
432. [ES-04](<matriz-de-permissa-es-com-atendente-real-es04.md>) — Matriz de permissões com atendente real · **P2** · PARCIAL
433. [W4-1](<inlinar-predicado-de-visibilidade-no-search-cont-w41.md>) — Inlinar predicado de visibilidade no search_contacts · **P2** · PARCIAL
434. [CT-69](<contraste-dos-badges-novo-top-promo-a-4-5-1-ct69.md>) — Contraste dos badges Novo/Top/Promo ≥ 4,5:1 · **P2** · PARCIAL
435. [CT-73](<payload-de-list-products-30-kb-por-pa-gina-ct73.md>) — Payload de list_products < 30 KB por página · **P2** · PARCIAL
436. [CT-74](<lighthouse-a-90-e-cls-0-05-ct74.md>) — Lighthouse ≥ 90 e CLS < 0,05 · **P2** · PARCIAL
437. [PAR-077](<roteador-sticky-round-robin-skills-par077.md>) — Roteador sticky + round-robin + skills · **P2** · PARCIAL
438. [SLA-RES](<sla-de-resolua-a-o-slares.md>) — SLA de resolução · **P2** · PARCIAL
439. [FILA-AL](<alertas-de-fila-tempo-de-espera-e-mensagens-pend-filaal.md>) — Alertas de fila "tempo de espera" e "mensagens pendentes" · **P2** · PARCIAL
440. [E98-B](<contraste-no-inbox-7-achados-serious-e98b.md>) — Contraste no inbox (7 achados SERIOUS) · **P2** · PARCIAL
441. [E20](<remover-principal-fixo-dos-fluxos-e20.md>) — Remover 'PRINCIPAL' fixo dos fluxos · **P2** · PARCIAL · depende: E16
442. [E28](<ui-de-criaa-a-o-por-chamada-a-nica-e-monitoring--e28.md>) — UI de criação por chamada única e monitoring por instância · **P2** · PARCIAL · depende: E13
443. [E41](<nova-conversa-sempre-com-conexa-o-e41.md>) — Nova conversa sempre com conexão · **P2** · PARCIAL
444. [GO-03](<marcar-mensagem-como-na-o-lida-go03.md>) — Marcar mensagem como não lida · **P2** · PARCIAL
445. [MIG-71](<csp-aplicada-mig71.md>) — CSP aplicada · **P2** · PARCIAL
446. [MIG-16](<hardening-de-ssh-e-firewall-da-vps-hostinger-fec-mig16.md>) — Hardening de SSH e firewall da VPS Hostinger (fechar 32771/48592) · **P2** · PARCIAL
447. [ARQ-49](<e2e-logado-da-aba-arquivos-no-ci-arq49.md>) — E2E logado da aba Arquivos no CI · **P2** · PARCIAL
448. [046](<ler-hista-rico-antes-de-aceitar-046.md>) — Ler histórico antes de aceitar · **P2** · PARCIAL
449. [074](<ler-hista-rico-antes-de-aceitar-074.md>) — Ler histórico antes de aceitar · **P2** · PARCIAL
450. [037](<ler-hista-rico-antes-de-aceitar-037.md>) — Ler histórico antes de aceitar · **P2** · PARCIAL
451. [360-54](<18-22-checks-funcionais-por-clique-36054.md>) — 18/22 checks funcionais por clique · **P2** · PARCIAL
452. [FID-53](<18-22-checks-funcionais-por-clique-fid53.md>) — 18/22 checks funcionais por clique · **P2** · PARCIAL
453. [SL-077](<18-22-checks-funcionais-por-clique-sl077.md>) — 18/22 checks funcionais por clique · **P2** · PARCIAL
454. [SL-017](<banner-honesto-da-janela-de-bloqueio-da-meta-sl017.md>) — Banner honesto da janela de bloqueio da Meta · **P2** · PARCIAL
455. [E05](<zero-issues-de-alerta-e05.md>) — Zero issues de alerta · **P2** · PARCIAL
456. [E22](<auto-merge-do-pr-de-sync-e22.md>) — Auto-merge do PR de sync · **P2** · PARCIAL · depende: E15
457. [E87](<quarentena-e2e-formal-e87.md>) — Quarentena E2E formal · **P2** · PARCIAL
458. [M-E24](<replay-integral-verde-me24.md>) — Replay integral verde · **P2** · PARCIAL
459. [C-E20](<replay-integral-verde-ce20.md>) — Replay integral verde · **P2** · PARCIAL
460. [M-E30](<rate-limit-nas-edges-expostas-me30.md>) — Rate limit nas edges expostas · **P2** · PARCIAL
461. [F3](<react-hooks-f3.md>) — react-hooks/ · **P2** · PARCIAL
462. [016](<cobertura-com-ratchet-por-pasta-arquivo-016.md>) — Cobertura com ratchet por pasta/arquivo · **P2** · PARCIAL
463. [SL-123](<cobertura-com-ratchet-por-pasta-arquivo-sl123.md>) — Cobertura com ratchet por pasta/arquivo · **P2** · PARCIAL
464. [034](<correlation-id-ponta-a-ponta-034.md>) — Correlation ID ponta a ponta · **P2** · PARCIAL
465. [035](<edges-health-status-metrics-035.md>) — Edges health/status/metrics · **P2** · PARCIAL · depende: SL-003
466. [SL-051](<edges-health-status-metrics-sl051.md>) — Edges health/status/metrics · **P2** · PARCIAL · depende: SL-003
467. [060](<csp-enforce-headers-060.md>) — CSP enforce + headers · **P2** · PARCIAL
468. [091](<csp-enforce-headers-091.md>) — CSP enforce + headers · **P2** · PARCIAL
469. [SL-025](<auto-merge-do-sync-sl025.md>) — Auto-merge do sync · **P2** · PARCIAL
470. [SL-149](<e2e-fluxo-de-mensagens-runbook-sl149.md>) — E2E fluxo de mensagens + runbook · **P2** · PARCIAL · depende: E09
471. [OBS-1](<alerta-de-desconexa-o-do-whatsapp-obs1.md>) — Alerta de desconexão do WhatsApp · **P2** · PARCIAL
472. [Y09](<e2e-navegaa-a-o-tarefas-quadro-busca-global-y09.md>) — E2E navegação, tarefas/quadro, busca global · **P2** · PARCIAL · depende: E09
473. [Y10](<e2e-navegaa-a-o-tarefas-quadro-busca-global-y10.md>) — E2E navegação, tarefas/quadro, busca global · **P2** · PARCIAL · depende: E09
474. [Y12](<e2e-navegaa-a-o-tarefas-quadro-busca-global-y12.md>) — E2E navegação, tarefas/quadro, busca global · **P2** · PARCIAL · depende: E09
475. [Y11](<e2e-telefonia-y11.md>) — E2E telefonia · **P2** · PARCIAL
476. [L-14](<ma-tricas-de-satisfaa-a-o-l14.md>) — Métricas de satisfação · **P2** · PARCIAL · depende: L-12
477. [L-19](<relata-rios-agendados-por-e-mail-l19.md>) — Relatórios agendados por e-mail · **P2** · PARCIAL
478. [L-24](<campos-customiza-veis-de-contato-l24.md>) — Campos customizáveis de contato · **P2** · PARCIAL
479. [L-25](<integraa-a-o-bitrix24-configuraa-a-o-pela-tela-l25.md>) — Integração Bitrix24 (configuração pela tela) · **P2** · PARCIAL
480. [L-26](<links-de-pagamento-l26.md>) — Links de pagamento · **P2** · PARCIAL
481. [L-34](<canais-instagram-telegram-messenger-webchat-l34.md>) — Canais Instagram/Telegram/Messenger/Webchat · **P2** · PARCIAL
482. [L-37](<lgpd-a-portabilidade-e-eliminaa-a-o-l37.md>) — LGPD — portabilidade e eliminação · **P2** · PARCIAL
483. [L-38](<whitelist-de-ip-ip-bloqueado-bloqueio-por-paa-s-l38.md>) — Whitelist de IP, IP bloqueado, bloqueio por país · **P2** · PARCIAL
484. [L-39](<ca-digos-de-backup-do-2fa-l39.md>) — Códigos de backup do 2FA · **P2** · PARCIAL
485. [L-42](<rotaa-a-o-de-credenciais-evolution-go-runbook-l42.md>) — Rotação de credenciais Evolution GO + runbook · **P2** · PARCIAL
486. [E-04](<slo-sli-e-alertas-aciona-veis-e04.md>) — SLO/SLI e alertas acionáveis · **P2** · PARCIAL
487. [C-01](<team-chat-sair-renomear-grupo-e-transferir-depar-c01.md>) — Team Chat: sair/renomear grupo e transferir departamento · **P2** · PARCIAL
488. [C-03](<convite-de-departamento-aceite-c03.md>) — Convite de departamento (aceite) · **P2** · PARCIAL
489. [C-07](<hista-rico-journey-ligaa-a-es-e-e-mails-c07.md>) — Histórico (Journey): ligações e e-mails · **P2** · PARCIAL
490. [C-11](<talk-x-pea-as-prontas-na-o-ligadas-c11.md>) — Talk X: peças prontas não ligadas · **P2** · PARCIAL
491. [C-12](<multiplix-vozes-retornos-e-fila-de-falhas-c12.md>) — Multiplix: vozes, retornos e fila de falhas · **P2** · PARCIAL
492. [X002](<placar-automa-tico-do-v4-x002.md>) — Placar automático do V4 · **P2** · DIVERGENTE
493. [E15](<gutter-interno-de-lista-e-agenda-e15.md>) — Gutter interno de Lista e Agenda · **P2** · DIVERGENTE
494. [DIST-CFG](<prefera-ncia-ma-todo-de-distribuia-a-o-do-usua-r-distcfg.md>) — Preferência "método de distribuição" do usuário · **P2** · DIVERGENTE
495. [GO-04](<sincronizar-hista-rico-da-conexa-o-go04.md>) — Sincronizar histórico da conexão · **P2** · DIVERGENTE
496. [E33](<fechar-alerta-codeql-13-e33.md>) — Fechar alerta CodeQL #13 · **P2** · DIVERGENTE
497. [L-15](<pwa-completo-web-push-l15.md>) — PWA completo + Web Push · **P2** · DIVERGENTE
498. [L-03](<exportar-relata-rios-wizard-pdf-excel-csv-bota-o-l03.md>) — Exportar relatórios (wizard, PDF, Excel, CSV, botão rápido) · **P2** · DIVERGENTE
499. [L-20](<pipeline-de-vendas-kanban-de-nega-cios-l20.md>) — Pipeline de Vendas (Kanban de negócios) · **P2** · DIVERGENTE
500. [C-17](<documentaa-a-o-dentro-do-app-c17.md>) — Documentação dentro do app · **P2** · DIVERGENTE
501. [X195](<ra-gua-visual-como-trava-x195.md>) — Régua visual como trava · **P2** · BLOQUEADO · depende: X003
502. [F63](<teste-real-de-ptt-f63.md>) — Teste real de PTT · **P2** · BLOQUEADO
503. [F66](<estimativa-de-consumo-de-voz-e-teto-f66.md>) — Estimativa de consumo de voz e teto · **P2** · BLOQUEADO
504. [F98](<go-live-72-h-f98.md>) — Go-live + 72 h · **P2** · BLOQUEADO · depende: F96
505. [IA-010](<ambiente-de-ensaio-com-dados-sinta-ticos-ia010.md>) — Ambiente de ensaio com dados sintéticos · **P2** · BLOQUEADO
506. [IA-015](<separar-leitura-de-alteraa-a-o-perfil-sa-leitura-ia015.md>) — Separar leitura de alteração (perfil só leitura) · **P2** · BLOQUEADO
507. [IA-018](<limite-do-crm-externo-ia018.md>) — Limite do CRM externo · **P2** · BLOQUEADO
508. [IA-161](<rascunho-de-campanha-por-ia-ia161.md>) — Rascunho de campanha por IA · **P2** · BLOQUEADO
509. [IA-191](<topologia-real-confirmada-ia191.md>) — Topologia real confirmada · **P2** · BLOQUEADO
510. [IA-193](<integraa-a-es-reais-com-escopo-ma-nimo-ia193.md>) — Integrações reais com escopo mínimo · **P2** · BLOQUEADO
511. [B10](<perfil-somente-leitura-b10.md>) — Perfil somente-leitura · **P2** · BLOQUEADO
512. [L6](<webhook-evolution-sem-assinatura-l6.md>) — Webhook Evolution sem assinatura · **P2** · BLOQUEADO
513. [DASH-004](<comparar-reposita-rio-a-banco-dash004.md>) — Comparar repositório × banco · **P2** · BLOQUEADO
514. [DASH-061](<conceito-a-nico-de-csat-dash061.md>) — Conceito único de CSAT · **P2** · BLOQUEADO
515. [DASH-099](<revisa-o-independente-dash099.md>) — Revisão independente · **P2** · BLOQUEADO
516. [DASH-100](<liberaa-a-o-autorizada-dash100.md>) — Liberação autorizada · **P2** · BLOQUEADO
517. [C100-11](<desligar-sicoob-bridge-d2-c10011.md>) — Desligar Sicoob Bridge (D2) · **P2** · BLOQUEADO
518. [CT-114](<validaa-a-o-com-dados-reais-do-singu-ct114.md>) — Validação com dados reais do Singu · **P2** · BLOQUEADO
519. [ES-03](<diciona-rio-empresarial-do-singu-vivo-es03.md>) — Dicionário empresarial do Singu vivo · **P2** · BLOQUEADO
520. [ES-49](<publicaa-a-o-smoke-autenticado-es49.md>) — Publicação + smoke autenticado · **P2** · BLOQUEADO
521. [CT-12](<fechamento-do-bloco-a-ct12.md>) — Fechamento do bloco A · **P2** · BLOQUEADO · depende: CT-03, CT-10
522. [CT-03](<revoke-de-zapp-catalog-stats-para-authenticated--ct03.md>) — REVOKE de zapp_catalog_stats() para authenticated no PromoGifts · **P2** · BLOQUEADO
523. [CT-82](<e2e-catalog-spec-ts-verde-nos-3-browsers-ct82.md>) — e2e/catalog.spec.ts verde nos 3 browsers · **P2** · BLOQUEADO
524. [CT-91](<rls-testada-com-2-usua-rios-reais-ct91.md>) — RLS testada com 2 usuários reais · **P2** · BLOQUEADO
525. [Y22-6](<downloads-do-cata-logo-csv-e-fotos-ignoram-can-d-y226.md>) — Downloads do catálogo (CSV e fotos) ignoram can_download · **P2** · BLOQUEADO
526. [E90](<restringir-o-token-pa-blico-da-mapbox-aos-doma-n-e90.md>) — Restringir o token público da Mapbox aos domínios da Vercel · **P2** · BLOQUEADO
527. [E94](<envio-real-de-localizaa-a-o-confirmado-no-whatsa-e94.md>) — Envio real de localização confirmado no WhatsApp · **P2** · BLOQUEADO
528. [E21](<aposentar-evolution-instance-token-name-e21.md>) — Aposentar EVOLUTION_INSTANCE_TOKEN/NAME · **P2** · BLOQUEADO · depende: E16, E18, E23
529. [E04](<na-mero-reserva-swap-e04.md>) — Número reserva (swap) · **P2** · BLOQUEADO
530. [E18](<contraste-a-4-5-1-do-player-slider-e18.md>) — Contraste ≥4,5:1 do player/slider · **P2** · BLOQUEADO
531. [SL-020](<contraste-a-4-5-1-do-player-slider-sl020.md>) — Contraste ≥4,5:1 do player/slider · **P2** · BLOQUEADO
532. [030](<homologaa-a-o-humana-piloto-ampliaa-a-o-030.md>) — Homologação humana, piloto, ampliação · **P2** · BLOQUEADO
533. [090](<homologaa-a-o-humana-piloto-ampliaa-a-o-090.md>) — Homologação humana, piloto, ampliação · **P2** · BLOQUEADO
534. [096](<homologaa-a-o-humana-piloto-ampliaa-a-o-096.md>) — Homologação humana, piloto, ampliação · **P2** · BLOQUEADO
535. [099](<homologaa-a-o-humana-piloto-ampliaa-a-o-099.md>) — Homologação humana, piloto, ampliação · **P2** · BLOQUEADO
536. [E10](<sonarcloud-e10.md>) — SonarCloud · **P2** · BLOQUEADO
537. [E26](<role-ci-readonly-e26.md>) — Role ci_readonly · **P2** · BLOQUEADO
538. [E34](<revisa-o-real-conta-de-agentes-e34.md>) — Revisão real / conta de agentes · **P2** · BLOQUEADO
539. [E36](<revisa-o-real-conta-de-agentes-e36.md>) — Revisão real / conta de agentes · **P2** · BLOQUEADO
540. [E61](<rollback-automa-tico-de-edge-e61.md>) — Rollback automático de edge · **P2** · BLOQUEADO
541. [E86](<supabase-local-p-sua-te-logada-e86.md>) — Supabase local p/ suíte logada · **P2** · BLOQUEADO
542. [M-E15](<a-ndices-sem-uso-472-675-me15.md>) — Índices sem uso (472/675) · **P2** · BLOQUEADO
543. [C-E23](<a-ndices-sem-uso-472-675-ce23.md>) — Índices sem uso (472/675) · **P2** · BLOQUEADO
544. [057](<scanner-de-arquivos-virustotal-057.md>) — Scanner de arquivos (VirusTotal) · **P2** · BLOQUEADO
545. [AG-08](<rotacionar-bearer-lovable-command-allowlist-e-fa-ag08.md>) — Rotacionar Bearer Lovable; command_allowlist e fail_closed dos hooks secundários · **P2** · BLOQUEADO
546. [L-35](<api-pa-blica-l35.md>) — API pública · **P2** · BLOQUEADO
547. [L-43](<gravaa-a-o-e-reconciliaa-a-o-de-chamadas-l43.md>) — Gravação e reconciliação de chamadas · **P2** · BLOQUEADO
548. [C-20](<sincronizaa-a-o-com-crm-outbox-a-singu-c20.md>) — Sincronização com CRM (outbox → Singu) · **P2** · BLOQUEADO
549. [SEC-GMAIL](<oidc-gmail-bloqueante-secgmail.md>) — OIDC Gmail bloqueante · **P2** · CONCLUIDO
550. [X055](<prancha-talkxkit-e-matriz-telaa-estado-x055.md>) — Prancha TalkXKit e matriz tela×estado · **P3** · NAO_INICIADO
551. [X093](<importar-exportar-templates-x093.md>) — Importar/exportar templates · **P3** · NAO_INICIADO · depende: X085
552. [X102](<saa-de-do-segmento-x102.md>) — Saúde do segmento · **P3** · NAO_INICIADO · depende: X100
553. [X113](<abas-regras-avana-adas-audia-ncias-modelos-x113.md>) — Abas Regras Avançadas, Audiências, Modelos · **P3** · NAO_INICIADO · depende: X110
554. [X117](<insights-com-ia-nos-segmentos-x117.md>) — Insights com IA nos segmentos · **P3** · NAO_INICIADO · depende: X076, X102
555. [X169](<compartilhar-por-link-e-mail-x169.md>) — Compartilhar por link/e-mail · **P3** · NAO_INICIADO
556. [X197](<documentaa-a-o-refeita-por-evida-ncia-x197.md>) — Documentação refeita por evidência · **P3** · NAO_INICIADO · depende: X002
557. [F68](<gravaa-a-o-no-compositor-f68.md>) — Gravação no compositor · **P3** · NAO_INICIADO
558. [F69](<falha-de-tts-a-media-pending-f69.md>) — Falha de TTS → media_pending · **P3** · NAO_INICIADO · depende: F65
559. [F82](<repetir-com-inteliga-ncia-f82.md>) — "Repetir com inteligência" · **P3** · NAO_INICIADO
560. [F83](<exportaa-a-o-csv-json-pela-edge-f83.md>) — Exportação CSV/JSON pela edge · **P3** · NAO_INICIADO
561. [F92](<flag-por-departamento-f92.md>) — Flag por departamento · **P3** · NAO_INICIADO
562. [EVO-1](<pa-blico-por-linguagem-natural-evo1.md>) — Público por linguagem natural · **P3** · NAO_INICIADO
563. [EVO-3](<resposta-vira-tarefa-evo3.md>) — Resposta vira tarefa · **P3** · NAO_INICIADO · depende: F84
564. [TL-002](<hook-morto-com-delete-fa-sico-tl002.md>) — Hook morto com DELETE físico · **P3** · NAO_INICIADO
565. [IA-078](<evida-ncia-da-objea-a-o-ia078.md>) — Evidência da objeção · **P3** · NAO_INICIADO
566. [IA-085](<avaliar-busca-vetorial-ia085.md>) — Avaliar busca vetorial · **P3** · NAO_INICIADO
567. [IA-086](<recuperaa-a-o-ha-brida-reordenaa-a-o-ia086.md>) — Recuperação híbrida + reordenação · **P3** · NAO_INICIADO · depende: IA-085
568. [IA-088](<pola-ticas-conflitantes-ia088.md>) — Políticas conflitantes · **P3** · NAO_INICIADO · depende: IA-082
569. [IA-095](<detectar-contradia-a-es-ia095.md>) — Detectar contradições · **P3** · NAO_INICIADO
570. [IA-097](<validade-temporal-da-mema-ria-ia097.md>) — Validade temporal da memória · **P3** · NAO_INICIADO
571. [IA-099](<prefera-ncias-autorizadas-ia099.md>) — Preferências autorizadas · **P3** · NAO_INICIADO
572. [IA-120](<simulador-de-capacidade-ia120.md>) — Simulador de capacidade · **P3** · NAO_INICIADO
573. [IA-123](<transcria-a-o-revisa-vel-ia123.md>) — Transcrição revisável · **P3** · NAO_INICIADO
574. [IA-140](<busca-sema-ntica-de-ma-dias-ia140.md>) — Busca semântica de mídias · **P3** · NAO_INICIADO
575. [IA-143](<abrir-evida-ncia-sem-perder-a-conversa-ia143.md>) — Abrir evidência sem perder a conversa · **P3** · NAO_INICIADO · depende: IA-067
576. [IA-150](<prefera-ncias-de-formato-por-usua-rio-ia150.md>) — Preferências de formato por usuário · **P3** · NAO_INICIADO
577. [B13](<ai-auto-tag-auth-test-ts-no-ci-b13.md>) — ai-auto-tag/auth_test.ts no CI · **P3** · NAO_INICIADO
578. [T4](<sentimento-na-lista-de-conversas-header-em-tempo-t4.md>) — Sentimento na lista de conversas/header em tempo real · **P3** · NAO_INICIADO
579. [DASH-036](<ativas-com-distinct-no-servidor-dash036.md>) — Ativas com DISTINCT no servidor · **P3** · NAO_INICIADO
580. [DASH-040](<ora-amento-de-desempenho-dash040.md>) — Orçamento de desempenho · **P3** · NAO_INICIADO
581. [DASH-049](<respostas-fora-de-ordem-dash049.md>) — Respostas fora de ordem · **P3** · NAO_INICIADO
582. [DASH-056](<metas-versionadas-dash056.md>) — Metas versionadas · **P3** · NAO_INICIADO
583. [DASH-074](<tenda-ncias-de-ia-corretas-dash074.md>) — Tendências de IA corretas · **P3** · NAO_INICIADO
584. [DASH-080](<sema-ntica-dos-heatmaps-dash080.md>) — Semântica dos heatmaps · **P3** · NAO_INICIADO
585. [DASH-090](<instrumentar-confiabilidade-dash090.md>) — Instrumentar confiabilidade · **P3** · NAO_INICIADO
586. [DASH-097](<backfill-e-carga-dash097.md>) — Backfill e carga · **P3** · NAO_INICIADO
587. [098](<backfill-e-carga-098.md>) — Backfill e carga · **P3** · NAO_INICIADO
588. [WIDE-10](<qa-global-do-ma-dulo-wide10.md>) — QA global do módulo · **P3** · NAO_INICIADO
589. [RES-CAPACIDADE](<capacidade-ma-xima-e-deltas-da-visa-o-geral-rescapacidade.md>) — Capacidade máxima e deltas da Visão Geral · **P3** · NAO_INICIADO
590. [A11Y-14](<gra-ficos-sem-alternativa-textual-a11y14.md>) — Gráficos sem alternativa textual · **P3** · NAO_INICIADO
591. [T78](<contraste-wcag-3-temas-t78.md>) — Contraste WCAG 3 temas · **P3** · NAO_INICIADO
592. [T80](<fechamentos-das-fases-8-e-9-t80.md>) — Fechamentos das fases 8 e 9 · **P3** · NAO_INICIADO · depende: T75
593. [T88](<fechamentos-das-fases-8-e-9-t88.md>) — Fechamentos das fases 8 e 9 · **P3** · NAO_INICIADO · depende: T75
594. [T89](<gates-completos-bundle-do-chunk-calls-t89.md>) — Gates completos + bundle do chunk calls · **P3** · NAO_INICIADO
595. [T99](<sea-a-o-telefonia-no-claude-md-t99.md>) — Seção "Telefonia" no CLAUDE.md · **P3** · NAO_INICIADO
596. [SL-246](<escolha-de-saa-da-de-a-udio-alto-falante-sl246.md>) — Escolha de saída de áudio / alto-falante · **P3** · NAO_INICIADO
597. [ACH-2](<escolha-de-saa-da-de-a-udio-alto-falante-ach2.md>) — Escolha de saída de áudio / alto-falante · **P3** · NAO_INICIADO
598. [TEL-047](<itens-da-auditoria-de-60-sem-etapa-no-plano-vivo-tel047.md>) — Itens da auditoria de 60 sem etapa no plano vivo · **P3** · NAO_INICIADO
599. [048](<itens-da-auditoria-de-60-sem-etapa-no-plano-vivo-048.md>) — Itens da auditoria de 60 sem etapa no plano vivo · **P3** · NAO_INICIADO
600. [049](<itens-da-auditoria-de-60-sem-etapa-no-plano-vivo-049.md>) — Itens da auditoria de 60 sem etapa no plano vivo · **P3** · NAO_INICIADO
601. [050](<itens-da-auditoria-de-60-sem-etapa-no-plano-vivo-050.md>) — Itens da auditoria de 60 sem etapa no plano vivo · **P3** · NAO_INICIADO
602. [051](<itens-da-auditoria-de-60-sem-etapa-no-plano-vivo-051.md>) — Itens da auditoria de 60 sem etapa no plano vivo · **P3** · NAO_INICIADO
603. [058](<itens-da-auditoria-de-60-sem-etapa-no-plano-vivo-058.md>) — Itens da auditoria de 60 sem etapa no plano vivo · **P3** · NAO_INICIADO
604. [SL-081](<readme-de-canais-tipos-derivados-fa-brica-de-que-sl081.md>) — README de canais, tipos derivados, fábrica de queryKeys · **P3** · NAO_INICIADO
605. [F67](<tokens-e-contraste-do-ma-dulo-f67.md>) — Tokens e contraste do módulo · **P3** · NAO_INICIADO
606. [TC-60](<tokens-e-contraste-do-ma-dulo-tc60.md>) — Tokens e contraste do módulo · **P3** · NAO_INICIADO
607. [F70](<lista-de-conversas-f70.md>) — Lista de conversas · **P3** · NAO_INICIADO
608. [TC-63](<lista-de-conversas-tc63.md>) — Lista de conversas · **P3** · NAO_INICIADO
609. [F74](<voz-do-tts-persiste-f74.md>) — Voz do TTS persiste · **P3** · NAO_INICIADO
610. [F92](<faxina-de-a-rfa-os-f92.md>) — Faxina de órfãos · **P3** · NAO_INICIADO
611. [TC-86](<faxina-de-a-rfa-os-tc86.md>) — Faxina de órfãos · **P3** · NAO_INICIADO
612. [F96](<remover-rpcs-deprecated-f96.md>) — Remover RPCs deprecated · **P3** · NAO_INICIADO
613. [TC-90](<remover-rpcs-deprecated-tc90.md>) — Remover RPCs deprecated · **P3** · NAO_INICIADO
614. [B8](<dm-sem-consentimento-do-alvo-b8.md>) — DM sem consentimento do alvo · **P3** · NAO_INICIADO
615. [CT-037](<resumo-de-interaa-a-es-briefing-ct037.md>) — Resumo de interações + briefing · **P3** · NAO_INICIADO
616. [CT-038](<resumo-de-interaa-a-es-briefing-ct038.md>) — Resumo de interações + briefing · **P3** · NAO_INICIADO
617. [CT-051](<kpis-do-topo-filtram-ao-clicar-ct051.md>) — KPIs do topo filtram ao clicar · **P3** · NAO_INICIADO
618. [CT-060](<revisa-o-visual-j2-ct060.md>) — Revisão visual J2 · **P3** · NAO_INICIADO
619. [CT-090](<e2e-j4-ct090.md>) — E2E J4 · **P3** · NAO_INICIADO
620. [CT-113](<testes-de-contrato-singu-ct113.md>) — Testes de contrato Singu · **P3** · NAO_INICIADO · depende: CT-111
621. [SB-01](<capturas-antes-depois-e-mobile-sb01.md>) — Capturas antes/depois e mobile · **P3** · NAO_INICIADO
622. [SB-85](<capturas-antes-depois-e-mobile-sb85.md>) — Capturas antes/depois e mobile · **P3** · NAO_INICIADO
623. [SB-87](<capturas-antes-depois-e-mobile-sb87.md>) — Capturas antes/depois e mobile · **P3** · NAO_INICIADO
624. [SB-03](<script-de-cobertura-singu-sb03.md>) — Script de cobertura Singu · **P3** · NAO_INICIADO
625. [SB-07](<registrar-decisa-es-d1a-d7-sb07.md>) — Registrar decisões D1–D7 · **P3** · NAO_INICIADO
626. [SB-97](<atualizar-crm360-technical-docs-painel-status-sb97.md>) — Atualizar CRM360_TECHNICAL_DOCS / PAINEL_STATUS · **P3** · NAO_INICIADO
627. [SB-99](<atualizar-crm360-technical-docs-painel-status-sb99.md>) — Atualizar CRM360_TECHNICAL_DOCS / PAINEL_STATUS · **P3** · NAO_INICIADO
628. [SB-100](<relata-rio-final-a-9-sb100.md>) — Relatório final §9 · **P3** · NAO_INICIADO
629. [S095](<teste-nada-sai-do-sistema-na-aba-s095.md>) — Teste "nada sai do sistema" na aba · **P3** · NAO_INICIADO
630. [LOV-T3](<busca-crm-no-globalsearch-commandpalette-lovt3.md>) — Busca CRM no GlobalSearch/CommandPalette · **P3** · NAO_INICIADO
631. [LOV-T6](<indicador-crm-na-lista-de-conversas-lovt6.md>) — Indicador CRM na lista de conversas · **P3** · NAO_INICIADO
632. [DIF-2](<ver-no-crm-no-resumo-comercial-dif2.md>) — "Ver no CRM" no Resumo Comercial · **P3** · NAO_INICIADO
633. [PAR-074](<crm-pluga-vel-crm-sync-config-par074.md>) — CRM plugável (crm_sync_config) · **P3** · NAO_INICIADO
634. [ES-40](<medir-custo-das-consultas-do-painel-es40.md>) — Medir custo das consultas do painel · **P3** · NAO_INICIADO
635. [ES-50](<fechamento-do-checklist-es50.md>) — Fechamento do checklist · **P3** · NAO_INICIADO
636. [U05](<testes-a11y-tempo-real-documentaa-a-o-u05.md>) — Testes a11y/tempo real; documentação · **P3** · NAO_INICIADO
637. [U06](<testes-a11y-tempo-real-documentaa-a-o-u06.md>) — Testes a11y/tempo real; documentação · **P3** · NAO_INICIADO
638. [U08](<verificaa-a-es-finais-e-fechamento-u08.md>) — Verificações finais e fechamento · **P3** · NAO_INICIADO
639. [U09](<verificaa-a-es-finais-e-fechamento-u09.md>) — Verificações finais e fechamento · **P3** · NAO_INICIADO
640. [U12](<verificaa-a-es-finais-e-fechamento-u12.md>) — Verificações finais e fechamento · **P3** · NAO_INICIADO
641. [W4-4](<contagem-exata-count-over-em-100k-w44.md>) — Contagem exata COUNT() OVER em 100k · **P3** · NAO_INICIADO
642. [W4-6](<cronometrar-limiares-10ka-100k-w46.md>) — Cronometrar limiares 10k–100k · **P3** · NAO_INICIADO
643. [PAR-081](<outlook-graph-tracking-pixel-resend-imap-templat-par081.md>) — Outlook/Graph; tracking pixel; Resend+IMAP, templates e assinaturas de e-mail · **P3** · NAO_INICIADO
644. [082](<outlook-graph-tracking-pixel-resend-imap-templat-082.md>) — Outlook/Graph; tracking pixel; Resend+IMAP, templates e assinaturas de e-mail · **P3** · NAO_INICIADO
645. [083](<outlook-graph-tracking-pixel-resend-imap-templat-083.md>) — Outlook/Graph; tracking pixel; Resend+IMAP, templates e assinaturas de e-mail · **P3** · NAO_INICIADO
646. [RES-2](<recorra-ncia-subtarefas-colunas-personaliza-veis-res2.md>) — Recorrência, subtarefas, colunas personalizáveis, anexos, comentários, arrastar na Agenda, parser de linguagem natural, virtualização, push do navegador · **P3** · NAO_INICIADO
647. [E12](<preset-a-rfa-o-pipeline-vazio-criar-deal-e-place-e12.md>) — Preset órfão "Pipeline vazio/Criar Deal" e placeholder da paleta · **P3** · NAO_INICIADO
648. [E45](<evida-ncias-em-docs-evidencias-plano-quadro-tare-e45.md>) — Evidências em docs/evidencias/plano-quadro-tarefas/ · **P3** · NAO_INICIADO
649. [E46](<a-7-estado-de-execua-a-o-do-plano-e46.md>) — §7 "Estado de execução" do plano · **P3** · NAO_INICIADO
650. [E53](<card-sessa-es-search-box-500-no-dashboard-admin-e53.md>) — Card "Sessões Search Box / 500" no dashboard admin · **P3** · NAO_INICIADO
651. [E18](<teste-dedicado-do-helper-de-etiquetas-e18.md>) — Teste dedicado do helper de etiquetas · **P3** · NAO_INICIADO
652. [E32](<insta-ncia-desconhecida-no-webhook-a-202-e32.md>) — Instância desconhecida no webhook → 202 · **P3** · NAO_INICIADO
653. [GO-07](<chamada-de-voz-va-deo-do-whatsapp-iniciar-go07.md>) — Chamada de voz/vídeo do WhatsApp (iniciar) · **P3** · NAO_INICIADO
654. [GO-08](<templates-oficiais-da-meta-enviar-criar-listar-a-go08.md>) — Templates oficiais da Meta (enviar, criar, listar, apagar) · **P3** · NAO_INICIADO
655. [GO-09](<grupos-info-do-convite-e-mensagens-tempora-rias-go09.md>) — Grupos: info do convite e mensagens temporárias · **P3** · NAO_INICIADO
656. [GO-11](<fila-rabbitmq-sqs-kafka-nats-pusher-evoai-n8n-pr-go11.md>) — Fila RabbitMQ/SQS/Kafka/NATS/Pusher, EvoAI, n8n, proxy, catálogo business, presença da instância, leitura de webhook, find-chats · **P3** · NAO_INICIADO
657. [ARQ-NP2](<unificar-seletor-layout-de-contatos-e-arquivos-arqnp2.md>) — Unificar seletor "Layout" de Contatos e Arquivos · **P3** · NAO_INICIADO
658. [M07](<documentaa-a-o-da-aba-arquivos-m07.md>) — Documentação da aba Arquivos · **P3** · NAO_INICIADO
659. [F10](<documentaa-a-o-do-filtro-de-data-f10.md>) — Documentação do filtro de data · **P3** · NAO_INICIADO
660. [Z01](<fonte-a-nica-do-ca-lculo-de-pera-odo-z01.md>) — Fonte única do cálculo de período · **P3** · NAO_INICIADO
661. [Z02](<a-cones-de-categoria-nas-abas-tarefas-notas-crm--z02.md>) — Ícones de categoria nas abas Tarefas/Notas/CRM 360° · **P3** · NAO_INICIADO
662. [S50](<documentaa-a-o-s50.md>) — Documentação · **P3** · NAO_INICIADO
663. [Q07](<documentaa-a-o-q07.md>) — Documentação · **P3** · NAO_INICIADO
664. [FID-45](<card-de-produto-dentro-da-mensagem-fid45.md>) — Card de produto dentro da mensagem · **P3** · NAO_INICIADO
665. [SL-200](<card-de-produto-dentro-da-mensagem-sl200.md>) — Card de produto dentro da mensagem · **P3** · NAO_INICIADO
666. [FID-13](<presena-a-online-por-contato-na-lista-fid13.md>) — Presença "Online" por contato na lista · **P3** · NAO_INICIADO
667. [SL-199](<presena-a-online-por-contato-na-lista-sl199.md>) — Presença "Online" por contato na lista · **P3** · NAO_INICIADO
668. [COLUNA-2](<bota-o-va-deo-coluna2.md>) — Botão Vídeo · **P3** · NAO_INICIADO
669. [VIDEOCHAMADA](<bota-o-va-deo-videochamada.md>) — Botão Vídeo · **P3** · NAO_INICIADO
670. [L17](<sidebar-h-full-l17.md>) — Sidebar h-full · **P3** · NAO_INICIADO
671. [SL-174](<guard-de-layout-no-ci-trava-do-shell-sl174.md>) — Guard de layout no CI (trava do shell) · **P3** · NAO_INICIADO
672. [L-CI](<guard-de-layout-no-ci-trava-do-shell-lci.md>) — Guard de layout no CI (trava do shell) · **P3** · NAO_INICIADO
673. [T35](<media-a-o-renderizada-antes-depois-t35.md>) — Medição renderizada antes/depois · **P3** · NAO_INICIADO
674. [T90](<trava-para-text-npx-12px-t90.md>) — Trava para text-[Npx] < 12px · **P3** · NAO_INICIADO · depende: E37
675. [T100](<regra-de-tipografia-no-claude-md-t100.md>) — Regra de tipografia no CLAUDE.md · **P3** · NAO_INICIADO
676. [CP2](<appheader-global-sea-a-o-atual-busca-a-k-pa-lula-cp2.md>) — AppHeader global (seção atual, busca ⌘K, pílula do usuário) · **P3** · NAO_INICIADO
677. [CP3](<breadcrumbbar-teletransporte-cp3.md>) — BreadcrumbBar + "Teletransporte" · **P3** · NAO_INICIADO
678. [SL-171](<breadcrumbbar-teletransporte-sl171.md>) — BreadcrumbBar + "Teletransporte" · **P3** · NAO_INICIADO
679. [CP6](<starbackground-cp6.md>) — StarBackground · **P3** · NAO_INICIADO
680. [SL-172](<starbackground-sl172.md>) — StarBackground · **P3** · NAO_INICIADO
681. [SL-197](<tentativas-por-mensagem-message-attempts-sl197.md>) — Tentativas por mensagem (message_attempts) · **P3** · NAO_INICIADO
682. [SL-201](<recursos-exclusivos-da-go-mute-pin-de-chat-carro-sl201.md>) — Recursos exclusivos da GO (mute/pin de chat, carrossel, link, enquetes, comunidades, newsletter) · **P3** · NAO_INICIADO
683. [SL-206](<presets-de-filtros-e-deep-link-contact-message-n-sl206.md>) — Presets de filtros e deep link ?contact=/?message= na Inbox · **P3** · NAO_INICIADO
684. [E53](<resumo-de-drift-em-1-linha-e53.md>) — Resumo de drift em 1 linha · **P3** · NAO_INICIADO
685. [E67](<cache-do-bun-e67.md>) — Cache do Bun · **P3** · NAO_INICIADO
686. [E69](<paralelizar-ci-yml-e69.md>) — Paralelizar ci.yml · **P3** · NAO_INICIADO
687. [E70](<job-y-edge-contracts-e70.md>) — Job "🦕 Edge contracts" · **P3** · NAO_INICIADO
688. [E71](<pular-jobs-pesados-em-draft-e71.md>) — Pular jobs pesados em draft · **P3** · NAO_INICIADO
689. [E77](<bump-semanal-de-toolchain-e77.md>) — Bump semanal de toolchain · **P3** · NAO_INICIADO · depende: E75
690. [E81](<ajuste-playwright-e81.md>) — Ajuste Playwright · **P3** · NAO_INICIADO
691. [E88](<e2e-de-pr-sa-chromium-e88.md>) — E2E de PR só Chromium · **P3** · NAO_INICIADO
692. [M-E04](<remotos-a-25-me04.md>) — Remotos ≤ 25 · **P3** · NAO_INICIADO
693. [C-E11](<remotos-a-25-ce11.md>) — Remotos ≤ 25 · **P3** · NAO_INICIADO
694. [SL-135](<remotos-a-25-sl135.md>) — Remotos ≤ 25 · **P3** · NAO_INICIADO
695. [009](<estado-md-feature-registry-md-testing-convention-009.md>) — ESTADO.md, FEATURE_REGISTRY.md, TESTING_CONVENTION.md · **P3** · NAO_INICIADO
696. [010](<estado-md-feature-registry-md-testing-convention-010.md>) — ESTADO.md, FEATURE_REGISTRY.md, TESTING_CONVENTION.md · **P3** · NAO_INICIADO
697. [SL-122](<estado-md-feature-registry-md-testing-convention-sl122.md>) — ESTADO.md, FEATURE_REGISTRY.md, TESTING_CONVENTION.md · **P3** · NAO_INICIADO
698. [017](<flaky-detector-regression-gate-017.md>) — Flaky detector + regression gate · **P3** · NAO_INICIADO
699. [019](<fuzz-stress-de-edges-019.md>) — Fuzz/stress de edges · **P3** · NAO_INICIADO
700. [036](<db-health-monitor-snapshots-036.md>) — db-health-monitor + snapshots · **P3** · NAO_INICIADO
701. [051](<convite-com-token-ttl-051.md>) — Convite com token TTL · **P3** · NAO_INICIADO
702. [079](<cron-administra-vel-079.md>) — Cron administrável · **P3** · NAO_INICIADO
703. [099](<mcp-server-real-read-only-099.md>) — MCP server real read-only · **P3** · NAO_INICIADO
704. [SL-221](<mcp-server-real-read-only-sl221.md>) — MCP server real read-only · **P3** · NAO_INICIADO
705. [SL-148](<tags-v2-0-0-hostinger-catalog-v1-0-0-release-not-sl148.md>) — Tags v2.0.0-hostinger, catalog-v1.0.0 + release notes · **P3** · NAO_INICIADO
706. [SL-158](<tags-v2-0-0-hostinger-catalog-v1-0-0-release-not-sl158.md>) — Tags v2.0.0-hostinger, catalog-v1.0.0 + release notes · **P3** · NAO_INICIADO
707. [SL-031](<ajuste-playwright-sl031.md>) — Ajuste Playwright · **P3** · NAO_INICIADO
708. [SL-095](<cache-bun-paralelizar-drafts-sl095.md>) — Cache Bun, paralelizar, drafts · **P3** · NAO_INICIADO
709. [097](<cache-bun-paralelizar-drafts-097.md>) — Cache Bun, paralelizar, drafts · **P3** · NAO_INICIADO
710. [098](<cache-bun-paralelizar-drafts-098.md>) — Cache Bun, paralelizar, drafts · **P3** · NAO_INICIADO
711. [SL-105](<fcp-1-5-s-tti-3-s-lighthouse-90-sl105.md>) — FCP<1,5 s, TTI<3 s, Lighthouse>90 · **P3** · NAO_INICIADO
712. [SL-115](<concorra-ncia-30k-100k-sort-sl115.md>) — Concorrência 30k/100k, sort · **P3** · NAO_INICIADO
713. [SL-117](<bump-toolchain-e2e-auth-no-logado-sentinel-docs--sl117.md>) — Bump toolchain, E2E auth no logado, sentinel, docs canônicos, perFile · **P3** · NAO_INICIADO
714. [119](<bump-toolchain-e2e-auth-no-logado-sentinel-docs--119.md>) — Bump toolchain, E2E auth no logado, sentinel, docs canônicos, perFile · **P3** · NAO_INICIADO
715. [121](<bump-toolchain-e2e-auth-no-logado-sentinel-docs--121.md>) — Bump toolchain, E2E auth no logado, sentinel, docs canônicos, perFile · **P3** · NAO_INICIADO
716. [122](<bump-toolchain-e2e-auth-no-logado-sentinel-docs--122.md>) — Bump toolchain, E2E auth no logado, sentinel, docs canônicos, perFile · **P3** · NAO_INICIADO
717. [123](<bump-toolchain-e2e-auth-no-logado-sentinel-docs--123.md>) — Bump toolchain, E2E auth no logado, sentinel, docs canônicos, perFile · **P3** · NAO_INICIADO
718. [SL-184](<docs-db-inventory-md-sl184.md>) — docs/DB-INVENTORY.md · **P3** · NAO_INICIADO
719. [SL-212](<public-version-json-com-evolution-antiga-sl212.md>) — public/version.json com Evolution antiga · **P3** · NAO_INICIADO
720. [SL-220](<rpc-app-bootstrap-mcp-server-real-sl220.md>) — rpc_app_bootstrap, MCP server real · **P3** · NAO_INICIADO
721. [221](<rpc-app-bootstrap-mcp-server-real-221.md>) — rpc_app_bootstrap, MCP server real · **P3** · NAO_INICIADO
722. [OBS-2](<view-slo-inbound-latency-daily-obs2.md>) — View slo_inbound_latency_daily · **P3** · NAO_INICIADO
723. [SEC-EDGE-04](<listusers-sem-paginaa-a-o-cors-html-sem-escape-e-secedge04.md>) — listUsers sem paginação, CORS , HTML sem escape, erro do provedor no 502 · **P3** · NAO_INICIADO
724. [L-28](<google-calendar-l28.md>) — Google Calendar · **P3** · NAO_INICIADO
725. [L-36](<stripe-e-google-sheets-no-hub-l36.md>) — Stripe e Google Sheets no hub · **P3** · NAO_INICIADO
726. [L-44](<eventos-evolution-status-instance-logout-instanc-l44.md>) — Eventos Evolution STATUS_INSTANCE, LOGOUT_INSTANCE, SEND_MESSAGE_UPDATE · **P3** · NAO_INICIADO
727. [L-45](<etiqueta-do-whatsapp-a-esta-gio-do-pipeline-l45.md>) — Etiqueta do WhatsApp → estágio do pipeline · **P3** · NAO_INICIADO · depende: L-20
728. [E-03](<gate-lighthouse-matriz-responsiva-e03.md>) — Gate Lighthouse + matriz responsiva · **P3** · NAO_INICIADO
729. [E-06](<release-candidata-sign-off-canary-e06.md>) — Release candidata, sign-off, canary · **P3** · NAO_INICIADO
730. [E-13](<e2e-dos-fluxos-de-automaa-a-o-chatbot-e13.md>) — E2E dos fluxos de automação/chatbot · **P3** · NAO_INICIADO · depende: L-04
731. [C-05](<encaminhar-arquivo-aba-arquivos-c05.md>) — Encaminhar arquivo (aba Arquivos) · **P3** · NAO_INICIADO
732. [C-06](<videochamada-c06.md>) — Videochamada · **P3** · NAO_INICIADO
733. [C-14](<agente-de-voz-conversacional-elevenlabs-convai-c14.md>) — Agente de voz conversacional (ElevenLabs ConvAI) · **P3** · NAO_INICIADO
734. [DASH-019](<validar-para-metros-no-backend-dash019.md>) — Validar parâmetros no backend · **P3** · NAO_VERIFICAVEL
735. [DASH-026](<limites-de-dashboard-kpi-integridade-temporal-dash026.md>) — Limites de dashboard_kpi; integridade temporal · **P3** · NAO_VERIFICAVEL
736. [030](<limites-de-dashboard-kpi-integridade-temporal-030.md>) — Limites de dashboard_kpi; integridade temporal · **P3** · NAO_VERIFICAVEL
737. [DASH-038](<a-ndices-e-restria-a-es-com-evida-ncia-dash038.md>) — Índices e restrições com evidência · **P3** · NAO_VERIFICAVEL
738. [039](<a-ndices-e-restria-a-es-com-evida-ncia-039.md>) — Índices e restrições com evidência · **P3** · NAO_VERIFICAVEL
739. [DASH-064](<janelas-das-avaliaa-a-es-dash064.md>) — Janelas das avaliações · **P3** · NAO_VERIFICAVEL
740. [100](<verificaa-a-o-em-produa-a-o-100.md>) — Verificação em produção · **P3** · NAO_VERIFICAVEL
741. [RES-SLA](<ra-tulo-sla-violado-barra-equipe-ressla.md>) — Rótulo SLA violado / barra Equipe · **P3** · NAO_VERIFICAVEL
742. [E30](<allowed-actions-validity-checks-limpeza-de-artif-e30.md>) — allowed_actions / validity checks / limpeza de artifacts · **P3** · NAO_VERIFICAVEL
743. [E37](<allowed-actions-validity-checks-limpeza-de-artif-e37.md>) — allowed_actions / validity checks / limpeza de artifacts · **P3** · NAO_VERIFICAVEL
744. [E73](<allowed-actions-validity-checks-limpeza-de-artif-e73.md>) — allowed_actions / validity checks / limpeza de artifacts · **P3** · NAO_VERIFICAVEL
745. [C-E01](<bundle-stashes-branches-locais-worktrees-mcp-ren-ce01.md>) — Bundle, stashes, branches locais, worktrees, MCP renomeado · **P3** · NAO_VERIFICAVEL
746. [E02](<bundle-stashes-branches-locais-worktrees-mcp-ren-e02.md>) — Bundle, stashes, branches locais, worktrees, MCP renomeado · **P3** · NAO_VERIFICAVEL
747. [E04](<bundle-stashes-branches-locais-worktrees-mcp-ren-e04.md>) — Bundle, stashes, branches locais, worktrees, MCP renomeado · **P3** · NAO_VERIFICAVEL
748. [E06](<bundle-stashes-branches-locais-worktrees-mcp-ren-e06.md>) — Bundle, stashes, branches locais, worktrees, MCP renomeado · **P3** · NAO_VERIFICAVEL
749. [E41](<bundle-stashes-branches-locais-worktrees-mcp-ren-e41.md>) — Bundle, stashes, branches locais, worktrees, MCP renomeado · **P3** · NAO_VERIFICAVEL
750. [E49](<bundle-stashes-branches-locais-worktrees-mcp-ren-e49.md>) — Bundle, stashes, branches locais, worktrees, MCP renomeado · **P3** · NAO_VERIFICAVEL
751. [SL-130](<update-baseline-pra-prio-nvmrc-20-19-0-sl130.md>) — --update-baseline próprio / .nvmrc 20.19.0 · **P3** · NAO_VERIFICAVEL
752. [SL-147](<update-baseline-pra-prio-nvmrc-20-19-0-sl147.md>) — --update-baseline próprio / .nvmrc 20.19.0 · **P3** · NAO_VERIFICAVEL
753. [SL-026](<edge-contracts-sl026.md>) — Edge contracts · **P3** · NAO_VERIFICAVEL
754. [120](<edge-contracts-120.md>) — Edge contracts · **P3** · NAO_VERIFICAVEL
755. [PLANO](<total-plano-01.md>) — Total · **P3** · PARCIAL
756. [X049](<modal-a-nico-do-kit-com-presets-x049.md>) — Modal único do kit com presets · **P3** · PARCIAL
757. [X050](<trocar-window-confirm-x050.md>) — Trocar window.confirm · **P3** · PARCIAL · depende: X049
758. [X053](<cabea-alho-com-trilha-e-indicador-x053.md>) — Cabeçalho com trilha e indicador · **P3** · PARCIAL · depende: X052
759. [X054](<busca-a-k-do-ma-dulo-x054.md>) — Busca ⌘K do módulo · **P3** · PARCIAL · depende: X052
760. [X076](<infra-de-ia-talkx-ai-x076.md>) — Infra de IA (talkx-ai) · **P3** · PARCIAL
761. [X079](<tabela-nas-colunas-do-mock-x079.md>) — Tabela nas colunas do mock · **P3** · PARCIAL · depende: X078
762. [X081](<filtros-grade-e-massa-x081.md>) — Filtros, grade e massa · **P3** · PARCIAL · depende: X078
763. [X082](<painel-lateral-3-na-meros-dica-do-dia-x082.md>) — Painel lateral (3 números, dica do dia) · **P3** · PARCIAL · depende: X075
764. [X087](<editor-a-nico-de-mensagem-x087.md>) — Editor único de mensagem · **P3** · PARCIAL
765. [X088](<pra-via-fiel-ao-whatsapp-x088.md>) — Prévia fiel ao WhatsApp · **P3** · PARCIAL · depende: X083
766. [X089](<galeria-do-mock-04-x089.md>) — Galeria do mock 04 · **P3** · PARCIAL · depende: X088
767. [X092](<rail-mais-convertidos-sugesta-es-x092.md>) — Rail: mais convertidos, sugestões · **P3** · PARCIAL · depende: X086
768. [X094](<tela-05-no-shell-rota-sub-abas-x094.md>) — Tela 05 no shell (rota, sub-abas) · **P3** · PARCIAL
769. [X097](<aba-variaa-a-es-a-b-x097.md>) — Aba Variações A/B · **P3** · PARCIAL · depende: X065
770. [X098](<nota-da-versa-o-atalhos-hista-rico-x098.md>) — Nota da versão, atalhos, histórico · **P3** · PARCIAL · depende: X084
771. [X103](<rpc-da-biblioteca-hista-rico-dia-rio-x103.md>) — RPC da biblioteca + histórico diário · **P3** · PARCIAL · depende: X101
772. [X105](<grupos-e-ou-como-no-mock-x105.md>) — Grupos E/OU como no mock · **P3** · PARCIAL · depende: X104
773. [X106](<campos-de-valor-por-tipo-x106.md>) — Campos de valor por tipo · **P3** · PARCIAL · depende: X104
774. [X108](<resumo-do-segmento-com-na-meros-do-servidor-x108.md>) — Resumo do segmento com números do servidor · **P3** · PARCIAL · depende: X103
775. [X111](<tela-03-com-rota-e-breadcrumb-x111.md>) — Tela 03 com rota e breadcrumb · **P3** · PARCIAL
776. [X112](<lista-lateral-meus-segmentos-x112.md>) — Lista lateral "Meus segmentos" · **P3** · PARCIAL · depende: X110
777. [X122](<wizard-no-shell-teclado-saa-da-com-penda-ncia-x122.md>) — Wizard no shell (teclado, saída com pendência) · **P3** · PARCIAL
778. [X124](<passo-1-nome-objetivo-com-a-cone-responsa-vel-x124.md>) — Passo 1: nome, objetivo com ícone, responsável · **P3** · PARCIAL
779. [X128](<editor-a-nico-no-wizard-abas-4096-x128.md>) — Editor único no wizard (abas, 4096) · **P3** · PARCIAL · depende: X087
780. [X132](<pra-via-em-moldura-de-celular-com-contato-real-x132.md>) — Prévia em moldura de celular com contato real · **P3** · PARCIAL
781. [X145](<aba-monitor-no-ma-dulo-x145.md>) — Aba "Monitor" no módulo · **P3** · PARCIAL · depende: X143
782. [X152](<linha-do-tempo-operacional-do-servidor-x152.md>) — Linha do tempo operacional do servidor · **P3** · PARCIAL · depende: X141
783. [X178](<hook-a-nico-paginaa-a-o-servidor-x178.md>) — Hook único + paginação servidor · **P3** · PARCIAL · depende: X176
784. [X184](<atividade-recente-x184.md>) — Atividade recente · **P3** · PARCIAL · depende: X071
785. [X190](<8-ta-picos-e-5-guias-x190.md>) — 8 tópicos e 5 guias · **P3** · PARCIAL
786. [F18](<drift-20260926180000-f18.md>) — Drift 20260926180000 · **P3** · PARCIAL
787. [F27](<resolver-em-lotes-de-1-000-f27.md>) — Resolver em lotes de 1.000 · **P3** · PARCIAL
788. [F62](<leitura-reprodua-a-o-e-respostas-f62.md>) — Leitura/reprodução e respostas · **P3** · PARCIAL · depende: F65
789. [F67](<modos-same-audio-personalized-f67.md>) — Modos same_audio / personalized · **P3** · PARCIAL · depende: F77
790. [F70](<fundaa-a-o-visual-tokens-f70.md>) — Fundação visual (tokens) · **P3** · PARCIAL
791. [F71](<nav-rota-multiplix-f71.md>) — Nav + rota /multiplix · **P3** · PARCIAL
792. [F81](<detalhe-por-bloco-hista-rico-com-filtros-f81.md>) — Detalhe por bloco + histórico com filtros · **P3** · PARCIAL
793. [F88](<testes-unita-rios-no-ci-yml-f88.md>) — Testes unitários no ci.yml · **P3** · PARCIAL
794. [F91](<correlation-id-em-envio-real-f91.md>) — correlation_id em envio real · **P3** · PARCIAL
795. [F93](<guards-do-banco-regenerados-f93.md>) — Guards do banco regenerados · **P3** · PARCIAL
796. [F99](<grafo-changelog-do-ma-dulo-f99.md>) — Grafo + CHANGELOG do módulo · **P3** · PARCIAL
797. [TL-179](<afirmaa-a-es-falsas-nos-docs-tl179.md>) — Afirmações falsas nos docs · **P3** · PARCIAL
798. [PLANO](<total-plano-02.md>) — Total · **P3** · PARCIAL
799. [IA-002](<mapa-completo-dos-fluxos-de-ia-ia002.md>) — Mapa completo dos fluxos de IA · **P3** · PARCIAL
800. [IA-057](<indicadores-de-saa-de-dos-provedores-ia057.md>) — Indicadores de saúde dos provedores · **P3** · PARCIAL
801. [IA-061](<resumo-a-ana-lise-aprofundada-unificados-ia061.md>) — Resumo × análise aprofundada unificados · **P3** · PARCIAL
802. [IA-064](<datas-e-sessa-es-padronizadas-ia064.md>) — Datas e sessões padronizadas · **P3** · PARCIAL
803. [IA-069](<hista-rico-sem-nova-geraa-a-o-ia069.md>) — Histórico sem nova geração · **P3** · PARCIAL
804. [IA-071](<modos-de-tom-harmonizados-ia071.md>) — Modos de tom harmonizados · **P3** · PARCIAL
805. [IA-076](<selea-a-o-de-contexto-transparente-ia076.md>) — Seleção de contexto transparente · **P3** · PARCIAL
806. [IA-106](<contexto-correto-para-o-bot-ia106.md>) — Contexto correto para o bot · **P3** · PARCIAL
807. [IA-119](<inteliga-ncia-importada-do-crm-rotulada-ia119.md>) — Inteligência importada do CRM rotulada · **P3** · PARCIAL
808. [IA-121](<contrato-a-nico-de-transcria-a-o-ia121.md>) — Contrato único de transcrição · **P3** · PARCIAL
809. [IA-125](<reprodua-a-o-streaming-de-a-udio-ia125.md>) — Reprodução/streaming de áudio · **P3** · PARCIAL
810. [IA-128](<dia-logos-sts-efeitos-ma-sica-ia128.md>) — Diálogos/STS/efeitos/música · **P3** · PARCIAL
811. [IA-132](<categoria-a-falha-ta-cnica-ia132.md>) — Categoria × falha técnica · **P3** · PARCIAL
812. [IA-141](<experia-ncia-de-ia-unificada-ia141.md>) — Experiência de IA unificada · **P3** · PARCIAL
813. [IA-163](<personalizaa-a-o-por-destinata-rio-ia163.md>) — Personalização por destinatário · **P3** · PARCIAL
814. [IA-165](<elegibilidade-e-estimativa-de-lote-ia165.md>) — Elegibilidade e estimativa de lote · **P3** · PARCIAL
815. [166](<elegibilidade-e-estimativa-de-lote-166.md>) — Elegibilidade e estimativa de lote · **P3** · PARCIAL
816. [IA-167](<recomendaa-a-o-de-hora-rio-sustentada-ia167.md>) — Recomendação de horário sustentada · **P3** · PARCIAL
817. [IA-169](<a-b-controlado-e-explicaa-a-o-pa-s-campanha-ia169.md>) — A/B controlado e explicação pós-campanha · **P3** · PARCIAL
818. [170](<a-b-controlado-e-explicaa-a-o-pa-s-campanha-170.md>) — A/B controlado e explicação pós-campanha · **P3** · PARCIAL
819. [IA-187](<avaliar-voz-multimodal-ia187.md>) — Avaliar voz/multimodal · **P3** · PARCIAL
820. [B9](<ca-lculo-local-na-o-consome-cota-de-ia-b9.md>) — Cálculo local não consome cota de IA · **P3** · PARCIAL
821. [T3](<bota-o-sync-crm-com-a-ltimo-sync-sem-crm-t3.md>) — Botão Sync CRM com "último sync"/"Sem CRM" · **P3** · PARCIAL
822. [DASH-001](<versa-o-publicada-identificada-dash001.md>) — Versão publicada identificada · **P3** · PARCIAL
823. [DASH-002](<mapa-de-dependa-ncias-atual-dash002.md>) — Mapa de dependências atual · **P3** · PARCIAL
824. [DASH-005](<identidades-documentadas-dash005.md>) — Identidades documentadas · **P3** · PARCIAL
825. [DASH-009](<contrato-anala-tico-versionado-dash009.md>) — Contrato analítico versionado · **P3** · PARCIAL
826. [DASH-016](<revalidar-aba-ao-perder-papel-dash016.md>) — Revalidar aba ao perder papel · **P3** · PARCIAL
827. [DASH-017](<isolar-caches-dash017.md>) — Isolar caches · **P3** · PARCIAL
828. [DASH-018](<security-invoker-definer-intencional-dash018.md>) — SECURITY INVOKER/DEFINER intencional · **P3** · PARCIAL
829. [DASH-043](<deltas-imuta-veis-dash043.md>) — Deltas imutáveis · **P3** · PARCIAL
830. [DASH-047](<invalidar-todos-os-indicadores-dash047.md>) — Invalidar todos os indicadores · **P3** · PARCIAL
831. [DASH-055](<metas-sem-configuraa-a-o-zero-dash055.md>) — Metas sem configuração/zero · **P3** · PARCIAL
832. [DASH-057](<pera-odo-das-metas-na-interface-dash057.md>) — Período das metas na interface · **P3** · PARCIAL
833. [DASH-058](<ledger-de-xp-idempotente-dash058.md>) — Ledger de XP idempotente · **P3** · PARCIAL
834. [DASH-059](<ranking-com-variaa-a-o-real-dash059.md>) — Ranking com variação real · **P3** · PARCIAL
835. [DASH-062](<cache-derivado-de-csat-dash062.md>) — Cache derivado de CSAT · **P3** · PARCIAL
836. [DASH-070](<fontes-de-sentimento-consolidadas-dash070.md>) — Fontes de sentimento consolidadas · **P3** · PARCIAL
837. [DASH-081](<validar-configuraa-a-o-de-relata-rio-dash081.md>) — Validar configuração de relatório · **P3** · PARCIAL
838. [DASH-087](<endurecer-alteraa-a-es-dash087.md>) — Endurecer alterações · **P3** · PARCIAL
839. [DASH-095](<testes-de-concorra-ncia-realtime-dash095.md>) — Testes de concorrência/realtime · **P3** · PARCIAL
840. [FASE1](<metas-delta-progresso-geral-sparklines-kebab-aa--fase1.md>) — Metas: delta "Progresso Geral", sparklines, kebab "Ações" · **P3** · PARCIAL
841. [FASE3](<sla-deltas-no-prazo-total-fase3.md>) — SLA: deltas "No Prazo"/"Total" · **P3** · PARCIAL
842. [RES-LIMPEZA](<componentes-sem-uso-reslimpeza.md>) — Componentes sem uso · **P3** · PARCIAL
843. [E47](<web-vitals-reais-e47.md>) — Web Vitals reais · **P3** · PARCIAL
844. [PLANO](<total-plano-03.md>) — Total · **P3** · PARCIAL
845. [T06](<screenshot-antes-erros-de-console-t06.md>) — Screenshot "antes" + erros de console · **P3** · PARCIAL
846. [T75](<motion-sob-reduced-motion-t75.md>) — Motion sob reduced-motion · **P3** · PARCIAL
847. [T85](<cobertura-do-motor-sip-t85.md>) — Cobertura do motor SIP · **P3** · PARCIAL
848. [T92](<capacidades-contrato-revisados-t92.md>) — CAPACIDADES/CONTRATO revisados · **P3** · PARCIAL
849. [IA-130](<comandos-realmente-executados-ia130.md>) — Comandos realmente executados · **P3** · PARCIAL
850. [TC](<funcionalidade-tc.md>) — Funcionalidade · **P3** · PARCIAL
851. [F09](<vocabula-rio-a-nico-de-auditoria-de-departamento-f09.md>) — Vocabulário único de auditoria de departamento · **P3** · PARCIAL
852. [TC-18](<vocabula-rio-a-nico-de-auditoria-de-departamento-tc18.md>) — Vocabulário único de auditoria de departamento · **P3** · PARCIAL
853. [R5](<vocabula-rio-a-nico-de-auditoria-de-departamento-r5.md>) — Vocabulário único de auditoria de departamento · **P3** · PARCIAL
854. [TC-009](<recibos-e-reaa-a-es-com-conversation-id-fora-ado-tc009.md>) — Recibos e reações com conversation_id forçado · **P3** · PARCIAL
855. [A7C](<recibos-e-reaa-a-es-com-conversation-id-fora-ado-a7c.md>) — Recibos e reações com conversation_id forçado · **P3** · PARCIAL
856. [A7A](<a-ndice-keyset-pa-gina-por-cursor-leitura-em-lot-a7a.md>) — Índice keyset, página por cursor, leitura em lote, view de leitura, busca com trecho · **P3** · PARCIAL
857. [B](<a-ndice-keyset-pa-gina-por-cursor-leitura-em-lot-b.md>) — Índice keyset, página por cursor, leitura em lote, view de leitura, busca com trecho · **P3** · PARCIAL
858. [F43](<contrato-de-reaa-a-o-f43.md>) — Contrato de reação · **P3** · PARCIAL
859. [TC-37](<contrato-de-reaa-a-o-tc37.md>) — Contrato de reação · **P3** · PARCIAL
860. [F58](<mutaa-a-es-f58.md>) — Mutações · **P3** · PARCIAL
861. [TC-52](<mutaa-a-es-tc52.md>) — Mutações · **P3** · PARCIAL
862. [F61](<rascunho-com-colar-imagem-f61.md>) — Rascunho com colar imagem · **P3** · PARCIAL
863. [F85](<digitandoa-f85.md>) — "Digitando…" · **P3** · PARCIAL
864. [TC-78](<digitandoa-tc78.md>) — "Digitando…" · **P3** · PARCIAL
865. [F88](<realtime-robusto-f88.md>) — Realtime robusto · **P3** · PARCIAL
866. [TC-81](<realtime-robusto-tc81.md>) — Realtime robusto · **P3** · PARCIAL
867. [SL-084](<testes-do-ma-dulo-sl084.md>) — Testes do módulo · **P3** · PARCIAL
868. [PLANO](<total-plano-04.md>) — Total · **P3** · PARCIAL
869. [C100-94](<sea-a-o-contatos-no-claude-md-c10094.md>) — Seção "Contatos" no CLAUDE.md · **P3** · PARCIAL
870. [CT-004](<fixtures-singu-cana-nicas-ct004.md>) — Fixtures Singu canônicas · **P3** · PARCIAL
871. [CT-011](<busca-na-1a-letra-com-destaque-ct011.md>) — Busca na 1ª letra com destaque · **P3** · PARCIAL
872. [CT-018](<filtros-salvos-renomear-atualizar-padra-o-ct018.md>) — Filtros salvos (renomear/atualizar/padrão) · **P3** · PARCIAL
873. [CT-020](<abas-por-tipo-lega-veis-no-celular-ct020.md>) — Abas por tipo legíveis no celular · **P3** · PARCIAL
874. [CT-025](<contagem-exata-ana-ncio-por-leitor-de-tela-ct025.md>) — Contagem exata + anúncio por leitor de tela · **P3** · PARCIAL
875. [CT-034](<perfil-singu-na-ficha-ct034.md>) — Perfil Singu na ficha · **P3** · PARCIAL
876. [CT-036](<ficha-completa-singu-360-ct036.md>) — Ficha completa Singu (360) · **P3** · PARCIAL
877. [CT-039](<aniversa-rio-e-redes-ct039.md>) — Aniversário e redes · **P3** · PARCIAL
878. [CT-040](<contato-sem-va-nculo-singu-ct040.md>) — Contato sem vínculo Singu · **P3** · PARCIAL
879. [CT-052](<avatar-foto-iniciais-esta-veis-ct052.md>) — Avatar foto/iniciais estáveis · **P3** · PARCIAL
880. [CT-057](<mapa-analytics-sob-controle-ct057.md>) — Mapa/analytics sob controle · **P3** · PARCIAL
881. [CT-061](<conversar-com-um-toque-ct061.md>) — Conversar com um toque · **P3** · PARCIAL
882. [CT-081](<tags-filtro-e-ou-sem-ct081.md>) — Tags + filtro e/ou/sem · **P3** · PARCIAL
883. [CT-083](<detectar-duplicados-ct083.md>) — Detectar duplicados · **P3** · PARCIAL
884. [CT-084](<comparar-mesclar-2a-3-com-pra-via-ct084.md>) — Comparar/mesclar 2–3 com prévia · **P3** · PARCIAL
885. [CT-085](<comparar-mesclar-2a-3-com-pra-via-ct085.md>) — Comparar/mesclar 2–3 com prévia · **P3** · PARCIAL
886. [SB-98](<limpeza-de-a-rfa-os-sb98.md>) — Limpeza de órfãos · **P3** · PARCIAL
887. [S14](<ra-tulo-compras-conclua-das-s14.md>) — Rótulo "Compras concluídas" · **P3** · PARCIAL
888. [SV-001](<ra-tulo-compras-conclua-das-sv001.md>) — Rótulo "Compras concluídas" · **P3** · PARCIAL
889. [S15](<teste-negativo-de-erro-de-insert-s15.md>) — Teste negativo de erro de insert · **P3** · PARCIAL
890. [S18](<teste-com-compra-pending-fora-da-contagem-s18.md>) — Teste com compra pending fora da contagem · **P3** · PARCIAL
891. [S41](<0-erros-de-console-no-fluxo-s41.md>) — 0 erros de console no fluxo · **P3** · PARCIAL
892. [S42](<matriz-de-prints-s42.md>) — Matriz de prints · **P3** · PARCIAL
893. [S43](<contraste-por-elemento-no-alto-contraste-s43.md>) — Contraste por elemento no alto-contraste · **P3** · PARCIAL
894. [S46](<lia-a-o-no-claude-md-s46.md>) — Lição no CLAUDE.md · **P3** · PARCIAL
895. [S096](<paginaa-a-o-por-rolagem-sem-teto-s096.md>) — Paginação por rolagem sem teto · **P3** · PARCIAL
896. [PAR-073](<segmentos-dina-micos-de-contatos-par073.md>) — Segmentos dinâmicos de contatos · **P3** · PARCIAL
897. [EN-088](<media-a-o-de-mema-ria-gpu-em-browser-real-en088.md>) — Medição de memória/GPU em browser real · **P3** · PARCIAL
898. [OTH-014](<media-a-o-de-mema-ria-gpu-em-browser-real-oth014.md>) — Medição de memória/GPU em browser real · **P3** · PARCIAL
899. [ES-27](<transportadora-isolada-es27.md>) — Transportadora isolada · **P3** · PARCIAL
900. [ES-30](<abrir-no-crm-es30.md>) — "Abrir no CRM" · **P3** · PARCIAL
901. [ES-45](<homologaa-a-o-visual-com-dados-reais-es45.md>) — Homologação visual com dados reais · **P3** · PARCIAL
902. [RES-4](<resa-duos-ta-cnicos-res4.md>) — Resíduos técnicos · **P3** · PARCIAL
903. [E31](<varredura-final-sem-pipeline-como-id-e31.md>) — Varredura final sem "pipeline" como id · **P3** · PARCIAL · depende: E12
904. [CT-22](<mais-pedidos-volta-sozinho-quando-houver-dado-ct22.md>) — "Mais pedidos" volta sozinho quando houver dado · **P3** · PARCIAL
905. [CT-60](<select-de-fornecedor-com-contagem-ct60.md>) — Select de fornecedor com contagem · **P3** · PARCIAL
906. [CT-64](<filtro-novidades-com-contagem-vinda-da-edge-ct64.md>) — Filtro "Novidades" com contagem vinda da edge · **P3** · PARCIAL
907. [CT-99](<checkboxes-do-plano-de-11-09-ct99.md>) — Checkboxes do plano de 11/09 · **P3** · PARCIAL
908. [Y22-8](<ajuda-do-cata-logo-com-prints-reais-y228.md>) — Ajuda do catálogo com prints reais · **P3** · PARCIAL
909. [FILA-PER](<alertas-de-fila-persistidos-filaper.md>) — Alertas de fila persistidos · **P3** · PARCIAL
910. [E91](<alerta-de-custo-por-e-mail-e91.md>) — Alerta de custo por e-mail · **P3** · PARCIAL
911. [E27](<cor-da-etiqueta-derivada-hash-e27.md>) — Cor da etiqueta derivada (hash) · **P3** · PARCIAL
912. [E48](<observabilidade-por-insta-ncia-e48.md>) — Observabilidade por instância · **P3** · PARCIAL
913. [GO-06](<ver-status-stories-dos-contatos-go06.md>) — Ver status/stories dos contatos · **P3** · PARCIAL
914. [GO-10](<fixar-silenciar-favoritar-limpar-chat-e-mensagen-go10.md>) — Fixar, silenciar, favoritar, limpar chat e mensagens temporárias · **P3** · PARCIAL
915. [GO-12](<exclusivos-da-go-na-o-aproveitados-ca-digo-de-pa-go12.md>) — Exclusivos da GO não aproveitados: código de pareamento (login sem QR), criar/editar etiqueta, lista de bloqueados, carrossel/link, comunidades/canais, "reproduzido", logs/forcereconnect · **P3** · PARCIAL
916. [PLANO](<total-plano-06.md>) — Total · **P3** · PARCIAL
917. [ARQ-47](<checklist-de-teclado-executado-e-gravado-arq47.md>) — Checklist de teclado executado e gravado · **P3** · PARCIAL
918. [F08](<verificaa-a-es-visuais-do-claude-f08.md>) — Verificações visuais do Claude · **P3** · PARCIAL
919. [V02](<verificaa-a-es-visuais-do-claude-v02.md>) — Verificações visuais do Claude · **P3** · PARCIAL
920. [A07B](<verificaa-a-es-visuais-do-claude-a07b.md>) — Verificações visuais do Claude · **P3** · PARCIAL
921. [Z03](<dicas-uniformes-legenda-do-ponto-azul-nos-6-cont-z03.md>) — Dicas uniformes + legenda do ponto azul nos 6 controles · **P3** · PARCIAL
922. [S46](<e2e-quick-controls-volume-spec-ts-b1a-b5-s46.md>) — E2E quick-controls-volume.spec.ts (B1–B5) · **P3** · PARCIAL
923. [Q05](<e2e-quick-controls-volume-spec-ts-b1a-b5-q05.md>) — E2E quick-controls-volume.spec.ts (B1–B5) · **P3** · PARCIAL
924. [E49](<prova-audiovisual-pa-s-deploy-e49.md>) — Prova audiovisual pós-deploy · **P3** · PARCIAL
925. [049](<p95-de-leitura-claim-desempenho-049.md>) — p95 de leitura/claim, desempenho · **P3** · PARCIAL
926. [088](<p95-de-leitura-claim-desempenho-088.md>) — p95 de leitura/claim, desempenho · **P3** · PARCIAL
927. [068](<economia-em-aba-oculta-preservar-rascunho-ensaio-068.md>) — Economia em aba oculta, preservar rascunho, ensaio de reversão, rastreabilidade, revisão autenticada online · **P3** · PARCIAL
928. [098](<economia-em-aba-oculta-preservar-rascunho-ensaio-098.md>) — Economia em aba oculta, preservar rascunho, ensaio de reversão, rastreabilidade, revisão autenticada online · **P3** · PARCIAL
929. [005](<economia-em-aba-oculta-preservar-rascunho-ensaio-005.md>) — Economia em aba oculta, preservar rascunho, ensaio de reversão, rastreabilidade, revisão autenticada online · **P3** · PARCIAL
930. [009](<economia-em-aba-oculta-preservar-rascunho-ensaio-009.md>) — Economia em aba oculta, preservar rascunho, ensaio de reversão, rastreabilidade, revisão autenticada online · **P3** · PARCIAL
931. [035](<economia-em-aba-oculta-preservar-rascunho-ensaio-035.md>) — Economia em aba oculta, preservar rascunho, ensaio de reversão, rastreabilidade, revisão autenticada online · **P3** · PARCIAL
932. [041](<economia-em-aba-oculta-preservar-rascunho-ensaio-041.md>) — Economia em aba oculta, preservar rascunho, ensaio de reversão, rastreabilidade, revisão autenticada online · **P3** · PARCIAL
933. [044](<economia-em-aba-oculta-preservar-rascunho-ensaio-044.md>) — Economia em aba oculta, preservar rascunho, ensaio de reversão, rastreabilidade, revisão autenticada online · **P3** · PARCIAL
934. [050](<economia-em-aba-oculta-preservar-rascunho-ensaio-050.md>) — Economia em aba oculta, preservar rascunho, ensaio de reversão, rastreabilidade, revisão autenticada online · **P3** · PARCIAL
935. [FID-54](<mobile-390-e-light-com-print-fid54.md>) — Mobile 390 e light com print · **P3** · PARCIAL
936. [L27](<layout-guard-verde-l27.md>) — layout-guard verde · **P3** · PARCIAL
937. [L6](<views-sem-w-full-scroll-padding-duplo-talkx-mult-l6.md>) — Views sem w-full, scroll/padding duplo (TalkX/Multiplix), header sticky, guard de outline, fechamento visual · **P3** · PARCIAL
938. [L7](<views-sem-w-full-scroll-padding-duplo-talkx-mult-l7.md>) — Views sem w-full, scroll/padding duplo (TalkX/Multiplix), header sticky, guard de outline, fechamento visual · **P3** · PARCIAL
939. [L9](<views-sem-w-full-scroll-padding-duplo-talkx-mult-l9.md>) — Views sem w-full, scroll/padding duplo (TalkX/Multiplix), header sticky, guard de outline, fechamento visual · **P3** · PARCIAL
940. [L11](<views-sem-w-full-scroll-padding-duplo-talkx-mult-l11.md>) — Views sem w-full, scroll/padding duplo (TalkX/Multiplix), header sticky, guard de outline, fechamento visual · **P3** · PARCIAL
941. [L20](<views-sem-w-full-scroll-padding-duplo-talkx-mult-l20.md>) — Views sem w-full, scroll/padding duplo (TalkX/Multiplix), header sticky, guard de outline, fechamento visual · **P3** · PARCIAL
942. [L25](<views-sem-w-full-scroll-padding-duplo-talkx-mult-l25.md>) — Views sem w-full, scroll/padding duplo (TalkX/Multiplix), header sticky, guard de outline, fechamento visual · **P3** · PARCIAL
943. [L30](<views-sem-w-full-scroll-padding-duplo-talkx-mult-l30.md>) — Views sem w-full, scroll/padding duplo (TalkX/Multiplix), header sticky, guard de outline, fechamento visual · **P3** · PARCIAL
944. [T33](<13-15px-9px-baseline-24-09-guard-de-fama-lia-pes-t33.md>) — 13/15px, 9px, baseline 24/09, guard de família/peso · **P3** · PARCIAL
945. [T34](<13-15px-9px-baseline-24-09-guard-de-fama-lia-pes-t34.md>) — 13/15px, 9px, baseline 24/09, guard de família/peso · **P3** · PARCIAL
946. [T39](<13-15px-9px-baseline-24-09-guard-de-fama-lia-pes-t39.md>) — 13/15px, 9px, baseline 24/09, guard de família/peso · **P3** · PARCIAL
947. [T2](<13-15px-9px-baseline-24-09-guard-de-fama-lia-pes-t2.md>) — 13/15px, 9px, baseline 24/09, guard de família/peso · **P3** · PARCIAL
948. [T3](<13-15px-9px-baseline-24-09-guard-de-fama-lia-pes-t3.md>) — 13/15px, 9px, baseline 24/09, guard de família/peso · **P3** · PARCIAL
949. [T88](<13-15px-9px-baseline-24-09-guard-de-fama-lia-pes-t88.md>) — 13/15px, 9px, baseline 24/09, guard de família/peso · **P3** · PARCIAL
950. [CP11](<qa-de-fidelidade-completo-cp11.md>) — QA de fidelidade completo · **P3** · PARCIAL
951. [SL-198](<timeline-de-envio-por-mensagem-sl198.md>) — Timeline de envio por mensagem · **P3** · PARCIAL
952. [PLANO](<total-plano-07.md>) — Total · **P3** · PARCIAL
953. [E62](<db-migrate-enxuto-e62.md>) — db-migrate enxuto · **P3** · PARCIAL
954. [E75](<fonte-a-nica-de-toolchain-e75.md>) — Fonte única de toolchain · **P3** · PARCIAL
955. [M-E13](<concurrency-em-todos-os-workflows-me13.md>) — Concurrency em todos os workflows · **P3** · PARCIAL
956. [M-E36](<web-vitals-reais-a-alvos-me36.md>) — Web Vitals reais × alvos · **P3** · PARCIAL
957. [SL-229](<web-vitals-reais-a-alvos-sl229.md>) — Web Vitals reais × alvos · **P3** · PARCIAL
958. [F1](<meca-nicas-seguras-f1.md>) — Mecânicas seguras · **P3** · PARCIAL
959. [F2](<only-export-components-f2.md>) — only-export-components · **P3** · PARCIAL
960. [F4](<no-explicit-any-f4.md>) — no-explicit-any · **P3** · PARCIAL
961. [F5](<no-restricted-imports-f5.md>) — no-restricted-imports · **P3** · PARCIAL
962. [001](<hooks-de-commit-001.md>) — Hooks de commit · **P3** · PARCIAL
963. [SL-035](<hooks-de-commit-sl035.md>) — Hooks de commit · **P3** · PARCIAL
964. [018](<nightly-e2e-completo-regressa-o-visual-018.md>) — Nightly E2E completo + regressão visual · **P3** · PARCIAL · depende: E09
965. [033](<web-vitals-a-edge-client-observability-033.md>) — Web Vitals → edge client-observability · **P3** · PARCIAL
966. [SL-230](<web-vitals-a-edge-client-observability-sl230.md>) — Web Vitals → edge client-observability · **P3** · PARCIAL
967. [231](<web-vitals-a-edge-client-observability-231.md>) — Web Vitals → edge client-observability · **P3** · PARCIAL
968. [039](<self-test-hmac-de-webhooks-039.md>) — Self-test HMAC de webhooks · **P3** · PARCIAL
969. [SL-057](<contract-kit-422-versionamento-invokeedge-parida-sl057.md>) — contract-kit 422, versionamento, invokeEdge, paridade FE↔edge · **P3** · PARCIAL
970. [052](<revogar-sessa-o-por-dispositivo-052.md>) — Revogar sessão por dispositivo · **P3** · PARCIAL
971. [055](<logs-de-segurana-a-alertas-de-acl-055.md>) — Logs de segurança/alertas de ACL · **P3** · PARCIAL
972. [092](<bundle-secret-guard-pa-s-deploy-092.md>) — bundle-secret-guard pós-deploy · **P3** · PARCIAL
973. [095](<ratchets-ts-ts-nocheck-dead-code-095.md>) — Ratchets TS/@ts-nocheck/dead-code · **P3** · PARCIAL
974. [SL-232](<ratchets-ts-ts-nocheck-dead-code-sl232.md>) — Ratchets TS/@ts-nocheck/dead-code · **P3** · PARCIAL
975. [SL-161](<da-vida-eslint-por-ma-dulo-budget-e-ratchets-sl161.md>) — Dívida ESLint por módulo / budget e ratchets · **P3** · PARCIAL
976. [SL-179](<da-vida-eslint-por-ma-dulo-budget-e-ratchets-sl179.md>) — Dívida ESLint por módulo / budget e ratchets · **P3** · PARCIAL
977. [SL-032](<approvals-audit-prod-bloqueante-husky-node-24-sl032.md>) — approvals, audit prod bloqueante, husky, Node 24 · **P3** · PARCIAL
978. [SL-125](<baseline-eslint-sl125.md>) — Baseline ESLint · **P3** · PARCIAL
979. [SL-137](<prettier-eslint-tailwind-sl137.md>) — Prettier + ESLint Tailwind · **P3** · PARCIAL
980. [SL-225](<camada-de-servia-os-sl225.md>) — Camada de serviços · **P3** · PARCIAL
981. [L-17](<atalhos-do-app-instalado-widget-home-screen-l17.md>) — Atalhos do app instalado / widget home screen · **P3** · PARCIAL · depende: L-15
982. [L-27](<meta-conversions-api-l27.md>) — Meta Conversions API · **P3** · PARCIAL
983. [L-29](<n8n-hub-de-integraa-a-es-l29.md>) — n8n (hub de integrações) · **P3** · PARCIAL
984. [L-31](<whatsapp-flows-formula-rios-l31.md>) — WhatsApp Flows (formulários) · **P3** · PARCIAL · depende: L-32
985. [L-33](<templates-whatsapp-com-aprovaa-a-o-oficial-l33.md>) — Templates WhatsApp com aprovação oficial · **P3** · PARCIAL · depende: L-32
986. [L-41](<busca-sema-ntica-embeddings-da-base-de-conhecime-l41.md>) — Busca semântica / embeddings da Base de Conhecimento · **P3** · PARCIAL
987. [E-02](<web-vitals-oficial-coletor-rum-e02.md>) — Web Vitals oficial + coletor (RUM) · **P3** · PARCIAL
988. [E-07](<cobertura-ala-m-de-src-lib-e-src-services-e07.md>) — Cobertura além de src/lib e src/services · **P3** · PARCIAL
989. [E-08](<remover-any-expla-cito-e08.md>) — Remover any explícito · **P3** · PARCIAL
990. [E-09](<consolidar-emptystate-em-1-componente-e09.md>) — Consolidar EmptyState em 1 componente · **P3** · PARCIAL
991. [E-10](<eliminar-componentes-duplicados-e10.md>) — Eliminar componentes duplicados · **P3** · PARCIAL
992. [E-11](<camada-de-servia-os-completa-e11.md>) — Camada de serviços completa · **P3** · PARCIAL
993. [E-12](<ora-amento-alerta-de-custo-multiplataforma-e12.md>) — Orçamento/alerta de custo multiplataforma · **P3** · PARCIAL
994. [I-375](<quebrar-god-files-do-talk-x-i375.md>) — Quebrar god-files do Talk X · **P3** · PARCIAL
995. [C-02](<team-chat-painel-de-performance-c02.md>) — Team Chat: painel de performance · **P3** · PARCIAL
996. [C-04](<team-chat-rpcs-e37a-e49-sem-consumidor-c04.md>) — Team Chat: RPCs E37–E49 sem consumidor · **P3** · PARCIAL
997. [C-08](<contagem-de-e-mails-na-o-lidos-por-contato-c08.md>) — Contagem de e-mails não lidos por contato · **P3** · PARCIAL
998. [C-09](<hista-rico-de-envio-de-mensagem-c09.md>) — "Histórico de envio" de mensagem · **P3** · PARCIAL
999. [C-10](<paina-is-crm-no-detalhe-do-contato-c10.md>) — Painéis CRM no detalhe do contato · **P3** · PARCIAL
1000. [C-13](<multiplix-7-rpcs-recipient-legadas-c13.md>) — Multiplix: 7 RPCs _recipient legadas · **P3** · PARCIAL
1001. [C-15](<external-db-bridge-c15.md>) — external-db-bridge · **P3** · PARCIAL
1002. [C-16](<ca-digo-morto-de-ui-c16.md>) — Código morto de UI · **P3** · PARCIAL
1003. [C-18](<configuraa-a-o-whatsapp-por-departamento-c18.md>) — Configuração WhatsApp por departamento · **P3** · PARCIAL
1004. [C100-95](<runbook-exclusa-o-legados-c10095.md>) — Runbook exclusão/legados · **P3** · DIVERGENTE
1005. [CT-52](<bota-o-enviar-produto-no-perfil-do-contato-ct52.md>) — Botão "Enviar produto" no perfil do contato · **P3** · DIVERGENTE · depende: CT-10
1006. [HAND-GO](<gaps-go-sem-ux-ativa-com-501-expla-cito-handgo.md>) — "Gaps GO sem UX ativa, com 501 explícito" · **P3** · DIVERGENTE
1007. [M-E07](<pola-tica-de-merge-enforce-admins-me07.md>) — Política de merge / enforce_admins · **P3** · DIVERGENTE
1008. [E08](<pola-tica-de-merge-enforce-admins-e08.md>) — Política de merge / enforce_admins · **P3** · DIVERGENTE
1009. [L-10](<distribuia-a-o-automa-tica-por-user-settings-rou-l10.md>) — Distribuição automática por user_settings (round-robin/aleatório/menor carga, timeout) · **P3** · DIVERGENTE
1010. [L-16](<internacionalizaa-a-o-pt-en-es-l16.md>) — Internacionalização PT/EN/ES · **P3** · DIVERGENTE
1011. [L-21](<carrinho-de-compras-e-mensagem-de-pagamento-pix--l21.md>) — Carrinho de compras e mensagem de pagamento PIX no chat · **P3** · DIVERGENTE
1012. [L-22](<avatar-gerado-por-ia-l22.md>) — Avatar gerado por IA · **P3** · DIVERGENTE
1013. [L-23](<versionamento-de-registros-hista-rico-de-versa-e-l23.md>) — Versionamento de registros (histórico de versões) · **P3** · DIVERGENTE
1014. [I-1265](<reaa-a-o-cross-team-no-team-chat-i1265.md>) — Reação cross-team no Team Chat · **P3** · DIVERGENTE
1015. [I-1266](<get-team-messages-page-quebrada-recursa-o-tcm-se-i1266.md>) — get_team_messages_page quebrada / recursão tcm_select_own · **P3** · DIVERGENTE
1016. [I-1267](<guards-multiplix-fail-open-i1267.md>) — Guards Multiplix fail-open · **P3** · DIVERGENTE
1017. [I-382](<status-por-fase-do-plano-talk-x-100-i382.md>) — Status por fase do plano Talk X 100 · **P3** · DIVERGENTE
1018. [I-378](<auto-delete-de-branch-pa-s-merge-i378.md>) — Auto-delete de branch pós-merge · **P3** · DIVERGENTE
1019. [X191](<checklist-suporte-especialista-va-deos-x191.md>) — Checklist, suporte, especialista, vídeos · **P3** · BLOQUEADO
1020. [X200](<release-e-encerramento-x200.md>) — Release e encerramento · **P3** · BLOQUEADO · depende: X198, X199
1021. [F100](<handoff-aceite-f100.md>) — Handoff + aceite · **P3** · BLOQUEADO
1022. [TL-096](<n04-n36-n40-tl096.md>) — N04, N36, N40 · **P3** · BLOQUEADO
1023. [097](<n04-n36-n40-097.md>) — N04, N36, N40 · **P3** · BLOQUEADO
1024. [098](<n04-n36-n40-098.md>) — N04, N36, N40 · **P3** · BLOQUEADO
1025. [IA-162](<pa-blico-em-linguagem-natural-a-filtro-ia162.md>) — Público em linguagem natural → filtro · **P3** · BLOQUEADO
1026. [IA-164](<variaa-a-es-controladas-ia164.md>) — Variações controladas · **P3** · BLOQUEADO
1027. [RES-GEOM](<geometria-card-search-box-resgeom.md>) — Geometria; card Search Box · **P3** · BLOQUEADO
1028. [E53](<geometria-card-search-box-e53.md>) — Geometria; card Search Box · **P3** · BLOQUEADO
1029. [T93](<snapshot-final-do-banco-t93.md>) — Snapshot final do banco · **P3** · BLOQUEADO
1030. [F87](<push-a-abre-conversa-cid-na-url-f87.md>) — Push → abre conversa / ?cid= na URL · **P3** · BLOQUEADO
1031. [AC-002](<certificaa-a-o-visual-contra-refera-ncia-ac002.md>) — Certificação visual contra referência · **P3** · BLOQUEADO
1032. [AC-010](<certificaa-a-o-visual-contra-refera-ncia-ac010.md>) — Certificação visual contra referência · **P3** · BLOQUEADO
1033. [100](<verificaa-a-o-final-em-produa-a-o-100.md>) — Verificação final em produção · **P3** · BLOQUEADO
1034. [CT-94](<print-da-ui-reagindo-ao-429-ct94.md>) — Print da UI reagindo ao 429 · **P3** · BLOQUEADO
1035. [CT-97](<manifesto-de-edges-versa-o-deployada-ct97.md>) — Manifesto de edges = versão deployada · **P3** · BLOQUEADO
1036. [CT-100](<release-v1-tag-catalog-v1-0-0-sea-a-o-no-claude--ct100.md>) — Release v1 (tag catalog-v1.0.0 + seção no CLAUDE.md) · **P3** · BLOQUEADO
1037. [DEC-1](<gate-de-cobertura-do-ma-dulo-dec1.md>) — Gate de cobertura do módulo · **P3** · BLOQUEADO
1038. [E65](<4a-print-teclado-virtual-aberto-e65.md>) — 4º print (teclado virtual aberto) · **P3** · BLOQUEADO
1039. [E17](<compatibilidade-de-urls-antigas-de-filtro-por-uu-e17.md>) — Compatibilidade de URLs antigas de filtro por UUID → nome · **P3** · BLOQUEADO
1040. [E38](<filas-por-conexa-o-e-mesmo-contato-em-2-na-meros-e38.md>) — Filas por conexão e mesmo contato em 2 números · **P3** · BLOQUEADO
1041. [E39](<filas-por-conexa-o-e-mesmo-contato-em-2-na-meros-e39.md>) — Filas por conexão e mesmo contato em 2 números · **P3** · BLOQUEADO
1042. [ARQ-01](<diagna-stico-ao-vivo-g1a-g5-arq01.md>) — Diagnóstico ao vivo G1–G5 · **P3** · BLOQUEADO
1043. [100](<deploy-e-verificaa-a-o-em-produa-a-o-100.md>) — Deploy e verificação em produção · **P3** · BLOQUEADO
1044. [360-51](<prints-das-8-abas-e-medidas-playwright-36051.md>) — Prints das 8 abas e medidas Playwright · **P3** · BLOQUEADO
1045. [FID-52](<prints-das-8-abas-e-medidas-playwright-fid52.md>) — Prints das 8 abas e medidas Playwright · **P3** · BLOQUEADO
1046. [SL-208](<prints-das-8-abas-e-medidas-playwright-sl208.md>) — Prints das 8 abas e medidas Playwright · **P3** · BLOQUEADO
1047. [SL-207](<composer-nas-outras-abas-sl207.md>) — Composer nas outras abas · **P3** · BLOQUEADO
1048. [T43](<tokens-fluidos-e-piso-de-11px-t43.md>) — Tokens fluidos e piso de 11px · **P3** · BLOQUEADO
1049. [T44](<tokens-fluidos-e-piso-de-11px-t44.md>) — Tokens fluidos e piso de 11px · **P3** · BLOQUEADO
1050. [T76](<tokens-fluidos-e-piso-de-11px-t76.md>) — Tokens fluidos e piso de 11px · **P3** · BLOQUEADO
1051. [SL-173](<ver-3-7-3-9-3-8-3-5-sl173.md>) — ver 3.7/3.9/3.8/3.5 · **P3** · BLOQUEADO
1052. [177](<ver-3-7-3-9-3-8-3-5-177.md>) — ver 3.7/3.9/3.8/3.5 · **P3** · BLOQUEADO
1053. [207](<ver-3-7-3-9-3-8-3-5-207.md>) — ver 3.7/3.9/3.8/3.5 · **P3** · BLOQUEADO
1054. [208](<ver-3-7-3-9-3-8-3-5-208.md>) — ver 3.7/3.9/3.8/3.5 · **P3** · BLOQUEADO
1055. [020](<ver-3-7-3-9-3-8-3-5-020.md>) — ver 3.7/3.9/3.8/3.5 · **P3** · BLOQUEADO
1056. [E80](<concurrency-por-sha-na-main-e80.md>) — Concurrency por SHA na main · **P3** · BLOQUEADO
1057. [E89](<podar-github-apps-e89.md>) — Podar GitHub Apps · **P3** · BLOQUEADO
1058. [E94](<apagar-environments-a-rfa-os-e94.md>) — Apagar environments órfãos · **P3** · BLOQUEADO
1059. [E100](<edge-contracts-obrigata-rio-e100.md>) — "Edge contracts" obrigatório · **P3** · BLOQUEADO · depende: E70
1060. [M-E44](<mcps-quebrados-me44.md>) — MCPs quebrados · **P3** · BLOQUEADO
1061. [C-E40](<mcps-quebrados-ce40.md>) — MCPs quebrados · **P3** · BLOQUEADO
1062. [SL-213](<mcps-quebrados-sl213.md>) — MCPs quebrados · **P3** · BLOQUEADO
1063. [C-E31](<a-ndices-faltantes-com-carga-ce31.md>) — Índices faltantes com carga · **P3** · BLOQUEADO
1064. [004](<codeowners-por-a-rea-ownership-gate-004.md>) — CODEOWNERS por área + ownership-gate · **P3** · BLOQUEADO
1065. [SL-146](<codeowners-por-a-rea-ownership-gate-sl146.md>) — CODEOWNERS por área + ownership-gate · **P3** · BLOQUEADO
1066. [093](<pwa-service-worker-093.md>) — PWA/Service Worker · **P3** · BLOQUEADO
1067. [SL-226](<pwa-service-worker-sl226.md>) — PWA/Service Worker · **P3** · BLOQUEADO
1068. [SL-120](<edge-contracts-db-live-guard-obrigata-rios-sl120.md>) — Edge contracts / DB Live Guard obrigatórios · **P3** · BLOQUEADO
1069. [SL-124](<edge-contracts-db-live-guard-obrigata-rios-sl124.md>) — Edge contracts / DB Live Guard obrigatórios · **P3** · BLOQUEADO
1070. [SL-129](<apps-approvals-1-codeowners-sl129.md>) — Apps, approvals=1, CODEOWNERS · **P3** · BLOQUEADO
1071. [SL-142](<apps-approvals-1-codeowners-sl142.md>) — Apps, approvals=1, CODEOWNERS · **P3** · BLOQUEADO
1072. [233](<service-worker-chunks-500-kb-233.md>) — Service Worker / chunks >500 kB · **P3** · BLOQUEADO
1073. [L-18](<exportaa-a-o-automa-tica-l18.md>) — Exportação automática · **P3** · BLOQUEADO
1074. [C-19](<pra-via-de-links-no-chat-proxy-de-saa-da-c19.md>) — Prévia de links no chat (proxy de saída) · **P3** · BLOQUEADO
1075. [F6](<constant-condition-ban-ts-comment-f6.md>) — constant-condition + ban-ts-comment · **P3** · CONCLUIDO
1076. [BU-E02](<backup-do-self-hosted-congelamento-graphify-anti-bue02.md>) — Backup do self-hosted, congelamento, graphify antigo · **P3** · CONCLUIDO
1077. [E03](<backup-do-self-hosted-congelamento-graphify-anti-e03.md>) — Backup do self-hosted, congelamento, graphify antigo · **P3** · CONCLUIDO
1078. [SL-001](<merge-do-pr-1343-sl001.md>) — Merge do PR #1343 · **P3** · CONCLUIDO
1079. [SL-145](<tabela-cana-nica-do-pera-metro-sl145.md>) — Tabela canônica do perímetro · **P3** · CONCLUIDO
1080. [SL-023](<dedupe-de-falha-do-types-sync-filtro-head-branch-sl023.md>) — Dedupe de falha do types-sync / filtro head_branch · **P3** · CONCLUIDO
1081. [024](<dedupe-de-falha-do-types-sync-filtro-head-branch-024.md>) — Dedupe de falha do types-sync / filtro head_branch · **P3** · CONCLUIDO
1082. [SL-027](<pola-tica-deno-lock-sl027.md>) — Política Deno/lock · **P3** · CONCLUIDO
1083. [SL-096](<cache-playwright-artifacts-sl096.md>) — Cache Playwright / artifacts · **P3** · CONCLUIDO
1084. [100](<cache-playwright-artifacts-100.md>) — Cache Playwright / artifacts · **P3** · CONCLUIDO
1085. [SL-061](<evolution-webhook-sem-assinatura-sl061.md>) — Evolution webhook sem assinatura · **P3** · CONCLUIDO
1086. [SL-090](<noimplicitany-sl090.md>) — noImplicitAny · **P3** · CONCLUIDO
1087. [SL-222](<duplicata-usedebounce-test-sl222.md>) — Duplicata useDebounce.test · **P3** · CONCLUIDO
1088. [SEC-ELEVEN](<replay-insert-no-webhook-elevenlabs-ia-webhook-0-seceleven.md>) — Replay/insert no webhook ElevenLabs (IA-WEBHOOK-001) · **P3** · CONCLUIDO
1089. [SEC-SAIDAS-03](<figurinha-p-bucket-pa-blico-jwt-para-host-na-o-v-secsaidas03.md>) — Figurinha p/ bucket público; JWT para host não validado · **P3** · CONCLUIDO
1090. [SEC-FRONTEND-01](<figurinha-p-bucket-pa-blico-jwt-para-host-na-o-v-secfrontend01.md>) — Figurinha p/ bucket público; JWT para host não validado · **P3** · CONCLUIDO