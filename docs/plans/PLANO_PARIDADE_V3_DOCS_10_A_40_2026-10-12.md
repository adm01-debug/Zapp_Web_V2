# Plano: paridade V3 → V2 dos documentos 10 a 12 e 17 a 40

> 12/10/2026. Fonte: `Zapp_Web_V3/docs/estado/` 10, 11, 12 (componentes do inbox), 17 (chat interno e monitoramento), 18 (segurança, filas, celular), 19 (layout, gamificação, Talk X, catálogo, relatórios, notificações), 20 (e-mail, voz, CRM360, onboarding, chamadas, IA), 21–22 (diretórios médios e compartilhados), 23–27 (hooks), 28–29 e 39–40 (testes e e2e), 30–32 (integrações e serviços), 33–35 (lib), 36 (Edge Functions), 37–38 (banco e infraestrutura). V3 lida em `origin/main`; V2 na branch viva `.integrador`; achados centrais conferidos no código e no banco real (somente leitura). Tags/etiquetas fora. Cartões: PE-01 a PE-118 (118). Junto com PB-01..55 (docs 02, 03, 13), PD-01..95 (docs 04–07, 14–16) e TG-A..I (remoção de tags), **toda a pasta `docs/estado` está auditada, e cada achado tem cartão ou decisão registrada**.

## 1. Veredito
A V2 está à frente da V3 na maior parte (envio idempotente, autorização por ação, CI e governança de banco, Talk X, catálogo, telefonia). Os achados de maior risco são falhas da própria V2:

| Prioridade | Achado (conferido) | Cartões |
|---|---|---|
| P1 | Sessões fantasmas: 13 de 13 linhas ativas de `user_sessions` não existem em `auth.sessions`; painel de sessões mente | PE-81, PE-82 |
| P1 | Transcrição de áudio gravada pelo navegador (qualquer atendente grava texto em qualquer áudio) | PE-55, PE-56 |
| P1 | Trilha de auditoria aceita qualquer ação de qualquer usuário; apagar mensagem sobrescreve o texto original | PE-19, PE-20, PE-21 |
| P1 | Nenhum agendador para relatórios, fechamento automático, limpezas; log do cron com 133 mil linhas / 49 MB sem purga | PE-102, PE-103 |
| P1 | Única conta Gmail em `sync_status='error'` sem aviso ao atendente; busca promete anexo e não acha | PE-06..11 |
| P1 | "Dias seguidos" mostra a contagem de mensagens (streak = mensagens nos 9 agentes); selo de não lidas fixo em 0 | PE-30..34 |
| P1 | Monitor de silêncio do inbound e de regressão de ACL inexistentes; guardas de CI sem execução | PE-87..91, PE-113..116 |
| P1 | Sem tempo limite nas requisições, mídia sem URL em branco, áudio sem limite, safe-area do iPhone sem CSS, app não instalável | PE-14, PE-53, PE-24, PE-79, PE-80 |

## 2. Decisões adotadas (valem se o Joaquim não vetar)
- **DE1** NPS automático não será construído agora; o painel diz a verdade (PE-51). CSAT automático é o PD-34.
- **DE2** Remover código morto de celular e a Edge `voice-changer` (PE-86, PE-66).
- **DE3** `send-status` (Status/Story) só admin/supervisor, com campos permitidos e trilha (PE-57/58).
- **DE4** Credencial de telefonia por atendente fica P2 até confirmar uso simultâneo (PE-104..106).
- **DE5** Não portar: VirusTotal/antivírus de upload, rastreio de abertura de e-mail, canais externos de notificação, API oficial da Meta, SLA de Resolução, importar/exportar, NPS, flags avançadas, `service_channels`.
- **DE6** Campos de fila `max_queue_size`/departamento: estender QA1/QA2 só se o dono quiser (comentário no QA1).

## 3. Validação final (Claude)
Provas no banco local com os papéis reais; testes Deno das Edges; capturas das telas; conferir que o dado de produção citado (13 sessões fantasmas, 153 `sending`, 133 mil linhas do cron, 27 mil `login`) foi tratado sem apagar o que não deve; e que o V2-melhor ficou intacto.
