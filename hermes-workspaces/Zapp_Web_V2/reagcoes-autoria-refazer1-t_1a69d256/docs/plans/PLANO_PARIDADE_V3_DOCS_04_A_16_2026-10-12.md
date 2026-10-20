# Plano: paridade V3 → V2 dos documentos 04 a 16 (auth, admin, inbox hooks/serviços, settings, contacts, connections/dashboard)

> 12/10/2026. Fonte: `Zapp_Web_V3/docs/estado/04` (auth), `05` (admin), `06`+`07` (inbox hooks e serviços), `14` (settings), `15` (contacts), `16` (connections + dashboard). V3 lida em `origin/main`; V2 na branch viva `.integrador`; achados centrais conferidos no código e no banco real (somente leitura). Os documentos 08–12 (componentes do inbox) estão com outra sessão; 13, 02 e 03 já foram auditados (cartões PB-01..55). Tags/etiquetas fora, por ordem do Joaquim. Cartões: PD-01 a PD-95 (95).

## 1. Veredito
A V2 está à frente da V3 em autenticação (login decidido no servidor, lockout sem DoS), envio (fila idempotente), RLS de notas e mensagens e acessibilidade. O que a auditoria achou de grave é, em boa parte, **falha da própria V2** (a V3 também tinha ou nem tinha o recurso):

| Prioridade | Achado (conferido) | Cartões |
|---|---|---|
| **P0** | Cadastro público do Auth aberto (`disable_signup=false`) + 27 tabelas legíveis por qualquer `authenticated` (sem papel) | PD-01 (+ ação do Joaquim no painel do Supabase) |
| **P0** | Usuário desativado ainda entra (nada lê `is_active` no login) | PD-02, PD-03 |
| **P0** | `create-user` pode deixar conta sem papel; `revoke-auth-sessions` deixa supervisor derrubar admin; `ip_whitelist`/`geo_blocking` graváveis por supervisor | PD-07, PD-08, PD-09 |
| **P0** | Mensagem recebida perdida em silêncio; envio sem token da instância; fila offline do usuário anterior; `messages` com INSERT/UPDATE direto; reações personificáveis; fotos de cliente com caminho adivinhável; canais Realtime públicos | PD-61 a PD-70 |
| **P0** | Mesclar contatos perde dados do secundário | PD-48, PD-49, PD-50 |
| P1 | 153 mensagens presas em `sending` sem varredor; conversa encerrada não reabre; lista pisca/sem paginação; recuperação de senha não cria o pedido (anon sem INSERT); CSAT automático sem executor; War Room/relatórios/heatmaps com dado falso; 542 contatos excluídos ainda alcançáveis; telefone sem DDI | demais PD-xx |

## 2. Decisões adotadas (valem se o Joaquim não vetar)
- **DD1** Contato excluído sai da Inbox; mensagem nova de contato excluído o **reativa** com auditoria (PD-51).
- **DD2** Ações em lote sobre **conversas** continuam permitidas (a proibição é sobre edição em massa de contatos) (PD-84).
- **DD3** Convite de usuário fica só para admin (Admin é `ADMIN_ONLY`).
- **DD4** Push do navegador vira "alertas com o navegador aberto" (sem VAPID de exemplo, sem log de assinatura) (PD-37).
- **DD5** Relatório agendado só envia para destinatários do domínio da empresa (PD-23).
- **DD6** Códigos de backup MFA, bypass `dev`, `route_permissions` dinâmico, exportação, SLA de Resolução, IMAP, contas de canal (`service_channels`) e API pública: **não portar**.
- **AÇÃO DO JOAQUIM:** desligar "Allow new users to sign up" (Authentication > Sign In / Providers) e conferir `mailer_autoconfirm` (hoje exigindo confirmação, correto).

## 3. Ordem
P0 em paralelo por área (banco, Edge, front); filhos esperam o pai e partem do commit dele; P1 funcionais; P2 e testes por último. Cartões com dependência de integração (PW1, PR0, SG1, SH1, IP1, RC1, QH1, DF1, N-068, N-163, ED1, TR1) receberam comentário e **não** foram duplicados.

## 4. Validação final (Claude)
Provas no banco local com papel `anon`/sem papel/agent/supervisor/admin (não só o relato); testes Deno das Edges; capturas reais das telas alteradas (Auth, Admin, Inbox, Configurações, Contatos, Conexões, Dashboard); conferir que o que a V2 faz melhor continua intacto e que o dado de produção citado (153 `sending`, 542 excluídos, 5 telefones sem DDI) foi tratado, não apagado.
