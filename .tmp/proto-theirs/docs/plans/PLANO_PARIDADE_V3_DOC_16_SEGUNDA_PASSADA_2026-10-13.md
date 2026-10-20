# Plano de paridade V3 → V2 — doc 16 (components/connections e components/dashboard), segunda passada

Data: 13/10/2026. Pedido do Joaquim: auditar `docs/estado/16-components-connections-dashboard.md` da V3 e achar o que existe lá e falta (ou é pior) na V2.

## 1. Método
- O doc 16 só tinha a 1ª passada (PD-20..29). Esta: 5 leitores em paralelo, somente leitura, sobre o CÓDIGO real da V3 (o doc é de agosto e tem erros): conexões (cartão/QR/saúde), conexões (config/integrações/operação), dashboard (visão geral/metas), dashboard (SLA/sentimento/War Room) e inventário/testes/achados A1..A16. Relatórios: `docs/audits/AUDITORIA_PARIDADE_V3_DOC_16_2026-10-13_PARTE1..5_*.md`.
- Só viraram cartão as lacunas sem cartão. Eu conferi no código da V2 e nas migrations os achados mais pesados (segredos de integração, health-check, dado inventado nos desafios, escala do CSAT). Um achado foi CORTADO depois da conferência: `warroom_alerts` está na publicação Realtime (a migration `20260828190000` a re-adiciona).
- Correções ao doc 16: `AddConnectionDialog` NÃO é órfão na V3 (A2 falsa); `ConnectionsStats` e `QrCodeDialog` são órfãos de verdade; A11 (sleep 4 s) não existe na V2; A12 (dois toasts) existe na V2.
- Banco real não consultado.

## 2. Cartões (PL-00..PL-27)
P0: PL-01 (edgar) `evolution-api` não devolve segredos de integração (latente enquanto o flavor for GO).
P1: PL-02 (edgar) configurações da instância pela rota da GO · PL-03 (iris) diálogo da instância com erro, sem aba Etiquetas · PL-04 (workersql) decisão da mensagem de ausência · PL-05 (edgar) envio da ausência pela fila · PL-06 (iris) tela de horário honesta e janela noturna · PL-08 (hugo) Taxa de Resolução real · PL-09 (hugo) aba Equipe e escala do CSAT · PL-10 (iris) desafios sem número inventado · PL-14 (edgar) health-check por instância · PL-15 (edgar) `evolution-sync` validado · PL-19/20 (hugo) Sentimento · PL-21 (hugo) alertas de crise em qualquer tela.
P2: PL-07, PL-13, PL-26 testes · PL-11 fuso único · PL-12 filtros/acessibilidade dos mapas · PL-16 nova conexão · PL-17 cooldown do QR · PL-18 auditoria do health-check · PL-22 War Room acessível · PL-23 CSAT/IA/reatribuição · PL-24 reduzir movimento · PL-25 botões mortos e toast · PL-27 runbooks · PL-00 documentação.

## 3. Já cobertos por cartões existentes (não duplicados)
PD-20..29, PB-11..23, PB-44/45, PE-36/37/51/103, PF-01..03/06/09/12, PJ-17/28/36/40, RC1..RC3, CN1, QH1..QH3, PC1/PC2, CA1/CA2, CX0b, AT1/AT2, UI-07.

## 4. Decisões adotadas (vetáveis)
1. Mensagem de ausência: implementar com trava (desligada por padrão por conexão, 1 por contato a cada 24 h, nunca com atendente online).
2. Remover a aba Etiquetas do diálogo da instância (tags excluídas do sistema).
3. Remover os botões de exportação mortos (regra do dono).
4. Alertas de crise globais só para admin/supervisor.
Sem cartão por serem decisão de produto: tela de integrações (removida de propósito, E43), API oficial/Cloud API (CA1), aba da ponte Supabase, saúde dos números (nada alimenta `number_reputation`).

## 5. Dependências
PL-05 depois de PL-04; PL-20 depois de PL-19; PL-14 antes de RC3 e CN1; PL-17 depois de QH3.

## 6. Validação final
Relato com a linha de resultado dos testes, `zapp-verify . --rapido` verde, prova no banco local com papéis reais nos cartões de migration (PL-04) e testes Deno nas Edges (PL-01/02/05/14/15/18). Integrador hoje parado por base vermelha (carga): ver `fabrica-sobrecarga-13-10`.
