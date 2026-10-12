# Paridade V3 → V2: segunda passada do 01-frontend (12/10/2026)

Na primeira passada (Parte 6), as 47 telas sob demanda que têm **o mesmo nome** nas duas versões foram consideradas equivalentes sem comparar o comportamento, e a moldura do app não foi olhada. Esta passada fechou esses dois buracos.

## Método

1. Medi o tamanho do código de cada tela comum nas duas versões, para priorizar onde comparar primeiro. Exemplos de diferença: administração com cerca de 15 mil linhas na V3 contra 3,4 mil na V2; Conexões com 5,1 mil contra 1,3 mil.
2. Quatro frentes paralelas, só de leitura, compararam função por função lendo os dois lados:
   - administração, diagnóstico e monitor;
   - conexões, configurações, segurança e LGPD;
   - filas, relatórios e módulos;
   - moldura, contatos, chat de equipe e painel.
3. Conferi no código os achados críticos: a aprovação de redefinição de senha, a exclusão de conexão, a previsão com ruído, a busca da base sem uso, a falta de assinatura de e-mail, a exportação do diagnóstico, o follow-up sem executor e o acesso à tela de LGPD.
4. Cruzei as telas que só existem na V3 com a reconciliação. A de campanhas tinha escapado e foi conferida: na V2 ela é o Talk X.

## Achados críticos (cartões urgentes, prioridade 10)

- **PR0 e PR0b: tomada de conta.**
  - A função `approve-password-reset` aceita supervisor e devolve o link de recuperação no corpo da resposta. Um supervisor pode aprovar a redefinição da conta do admin e usar o link.
  - O e-mail nunca é enviado e a tela anuncia que foi.
- **CX0 e CX0b: exclusão de conexão sem confirmação.** "Excluir conexão" fica ativo sem confirmação e liberado a supervisor no menu, no banco e na Edge. Um clique apaga o número de produção.

## Demais lacunas (faixa O, 46 cartões)

**Filas e relatórios**
- SQ1-3: painel de SLA por fila, filtros e redistribuição em lote.
- SR1: resolução no SLA.
- KB1: base de conhecimento consultável na conversa.
- DF1-2: previsão de demanda real, sem amostra nem ruído.

**E-mail**
- EA1-2: assinaturas.
- EF1-2: SLA de primeira resposta.
- EC1: Cc/Cco manual e histórico citado recolhido.

**Follow-up**
- FU1-3: execução real e painel de pendentes. Hoje as sequências são gravadas e nada as executa.

**Conexões**
- RC1-3: reconexão automática, motivo de saúde e conexão "fantasma".
- PC1-2: conexão por código de emparelhamento.
- QH1-3: QR com validade e histórico.
- CA1: opção Cloud API escondida enquanto não houver envio.
- CA2: auditoria por conexão.
- CN1: busca, filtro, link direto para o QR e ações da conexão degradada.
- NX1: n8n sem sucesso falso.

**LGPD**
- LG1-2: fila de exclusão, tela aberta a todo usuário, política e histórico do titular.
- CS1-2: consentimento por contato, integrado à supressão do Talk X.

**Moldura**
- GL1-5: estado global das conexões, indicador fixo na barra lateral, avisos de conexão degradada e de servidor fora ou restaurado, notificação de queda em qualquer tela e avisos globais de falha.
- HS1: saúde do sistema no painel.

**Administração**
- SV1-2: fila priorizada do supervisor.
- SS1-2: sessões por usuário.
- IV1-2: convite por e-mail.
- RA1-2: alertas de limite de requisições.
- EX2: remover a exportação TXT/PDF do diagnóstico, que contraria a regra do dono.

## Descartes com motivo

- **Bots externos por instância, VirusTotal e exportar/importar tema:** contrariam a regra "nada sai do sistema".
- **IMAP/SMTP:** a V2 é só Gmail, por desenho.
- **Orçamento de marketing:** fora do escopo do Zapp.
- **Preferências de alerta de conexão:** já não tinham consumidor na V3.
- **Credencial da Evolution por instância:** a V2 usa uma credencial central.
- **Versões de perfil:** a auditoria já registra quem mudou.
- **Histórico imutável de erros de envio:** coberto por M1 e FQ1.
- **Infraestrutura e ferramentas de debug só da V3.**
- **Escopos personalizados da inbox e API pública:** decididos.
- **A/B da tela antiga de campanhas:** está no Talk X.

## Conferido e equivalente (resumo)

- **Usuários, matriz de permissões, auditoria, CRM360, playbooks, copilot, treinamento e sala de crise:** equivalentes.
- **Uso de IA:** equivalente; a V2 agrega no servidor.
- **Migração de mídia, Diagnóstico e Monitor Evolution:** equivalentes.
- **Conexões:** criar, QR, saúde, padrão, horário, filas, configurações e reputação são equivalentes.
- **Configurações:** a V2 é mais restrita por papel.
- **Segurança e auditoria:** equivalentes.
- **Filas, comparação e detalhes:** equivalentes.
- **Atendentes, grupos, base de conhecimento (CRUD), transcrições e relatórios (fora a previsão):** equivalentes.
- **CRM360, catálogo de funções, chatbots, fluxos do WhatsApp, NPS, e-mail (fora os itens acima), carteira e agenda:** equivalentes.
- **Moldura:** tour, auditoria de login, atalhos, paleta de comandos, busca global e controles rápidos são equivalentes. O "Mostrar texto de status" já está no SL3.
- **Contatos:** coberto pelo plano por jornada (CT-001 a 120).
- **Chat de equipe:** coberto pelo plano de finalização.
- **Painel e sentimento:** a V2 é superconjunto.

## Totais da frente

- 244 cartões.
- Reconciliação com 193 achados: 138 com cartão e 55 descartados com motivo, sem erros.
