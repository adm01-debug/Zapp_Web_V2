# Plano: paridade V3 → V2 dos documentos 02-features-batch1 e 03-features-batch2

> 12/10/2026. Fonte: `Zapp_Web_V3/docs/estado/02-features-batch1.md` (business-logic, dashboard, email, emojis, integrations, queues) e `03-features-batch2.md` (contacts, connections, sla). A V3 foi lida em `origin/main` (o documento dela é de 09/08 e está defasado). A V2 foi lida na branch viva `.integrador` e conferida no **banco real** (somente leitura). Tags/etiquetas estão fora, por ordem do Joaquim.

## 1. Veredito

A V2 está **à frente** da V3 na maior parte dos dois documentos (criação de conexão com compensação, autorização por ação, KPIs e ranking por RPC, notas com RLS e trigger de identidade, envio de catálogo, A/B do Talk X). A V3 tem bugs próprios que a V2 não herdou (meta lida de coluna inexistente, ranking sem período, exclusão de conexão que nunca funcionou, roteamento de fila que nunca executou). Mesmo assim a auditoria achou **lacunas reais**, e várias são de **segurança e integridade** que a V3 também tinha ou que são só da V2:

| Prioridade | Achado (conferido no código e no banco real) |
|---|---|
| **P0** | A Edge `evolution-api` deixa qualquer agente ler a agenda e as conversas do número (`find-contacts`, `find-chats`, `get-media-base64`) e pode devolver o token da instância em `instance-info`/`list-instances`. |
| **P0** | Conversa **nunca respondida não existe** em `conversation_sla` (1.830 linhas, 0 sem resposta; 465 de 3.108 contatos). O estouro só aparece depois que alguém responde tarde; não há alerta no prazo e nenhum job de SLA está agendado. |
| P1 | War Room mostra números falsos por agente (resposta 0s, satisfação 0.0/5, "resolvidos hoje" vitalício). |
| P1 | Qualquer agente pode inflar o próprio XP/nível (4 funções de gamificação executáveis por `authenticated`). |
| P1 | "Avançar etapa" do CRM360 perde o log em silêncio para agente comum (RLS exige `performed_by`). |
| P1 | Atendente comum não consegue enviar emoji personalizado (upload na raiz do bucket; a política exige a pasta do usuário). |
| P1 | `anon`/`authenticated` com TRUNCATE/TRIGGER/REFERENCES em 116/134 tabelas de `public`. |
| P1 | Notificação de meta duplica a cada recarga; aba Metas sem seletor de período; notas sem editar/fixar; campos personalizados com RLS restrita demais; painéis de SLA mostram 100% em erro; relatório agendado de SLA conta pendente como no prazo. |

## 2. Escopo

**Entra:** o que está nas tabelas de achados abaixo (cartões PB-01 a PB-47).
**Fica de fora, por decisão já tomada:** tags/etiquetas; exportar/importar/edição em massa (só o Singu); ciclo de vida de negócios (G-2 desligou a UI, `sales_deals` tem 0 linhas); SLA de Resolução (removido em 03/09); webhook externo de alerta de SLA (nada sai do sistema); CRUD de credenciais Evolution por instância (a V2 usa secrets + Vault); widgets personalizáveis (nunca expostos na V3); aviso global de meta de fila (`queue_goals` tem 0 linhas); persistir o QR no navegador (o QR é credencial).
**Já coberto por cartões existentes (não duplicar):** CX0/CX0b, PC1/PC2, QH1–QH3, CA2, GL1–GL4, LG1/LG2, CS1/CS2, CF1, LS2, SA1–SA4, SD1–SD4, ET1–ET3, RR1/RR2, HS1, WR1/WR2, TV1, #174. Os que partem de premissa errada receberam **comentário de correção** (RR1, RR2, ET2, ET3, QH1–QH3, CA2, LS2, CF1, SA2, DP2).

## 3. Decisões adotadas (valem se o Joaquim não vetar)
- **D1** Prazo de 1ª resposta: o servidor passa a respeitar `sla_configurations` (padrão 5 min); como não há regra personalizada, o comportamento atual não muda.
- **D2** SLA de Resolução continua removido: SR1/NB1 não devem ser integrados até o Joaquim confirmar.
- **D3** Nada vai para produção por agente: migrations só entram no repositório com `Rollback:`; o Joaquim aplica.
- **D4** Funções de gamificação saem do alcance de `authenticated` (ficam `service_role` + gatilhos).
- **D5** Contador de uso de emoji sobe por RPC `SECURITY DEFINER` (atendente comum incrementa emoji alheio).

## 4. Ordem
1. **P0 em paralelo:** PB-05 (Edge `evolution-api`), PB-39 → PB-40 (SLA no servidor).
2. **P1 de segurança/dados:** PB-18 → PB-19 (XP), PB-24 (grants), PB-26 (RLS de campos), PB-01 (deal), PB-02 (id da mensagem), PB-14 → PB-15 (meta).
3. **P1 funcionais:** War Room (PB-11 → 13), Metas (PB-16 → 17), Notas (PB-25 → 27 → 28), Conexões (PB-06 → 07 → 08, 09, 10), Emojis (PB-35 → 36), SLA (PB-41–44), contatos (PB-29–31).
4. **P2:** KPIs diários, acabamento, testes e documentação.
Cada cartão compila e passa sozinho; filhos partem do commit do pai pela base do JSON da fila.

## 5. Validação final (Claude)
Busca por resquícios, `tsc`/testes, **provas no banco local** com papel `agent`/`anon` (não só o relato), capturas reais das telas alteradas (War Room, Metas, Notas, Conexões, Emojis), e checagem de que o que fica (V2 melhor) continua intacto.
