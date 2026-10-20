# ADR-008 — Motor de chamadas de voz pelo WhatsApp no Zapp

**Status:** Proposto — recomendação registrada (E004). A decisão final só vale depois do **G0** (E010) e do **aceite de risco por escrito** (E002); até lá nenhum caminho é executado. Este ADR é só registro: nenhuma linha de código de produto foi alterada.
**Data:** 2026-10-10
**Contexto:** Plano `docs/plans/PLANO_LIGACOES_WHATSAPP_MEOWCALLER_100_ETAPAS_2026-10-07.md` (Fase 0, etapas E004/E007/E008). Pesquisa dos caminhos em `docs/design/ANALISE_LIGACOES_WHATSAPP_2026-10-07.md`. Telefonia atual em `docs/design/TELEFONIA_STATUS.md`.

## Problema

O dono pediu fazer e receber ligações de voz pelo WhatsApp dentro do sistema. Hoje o canal WhatsApp é **só eventos, sem áudio**, por decisão registrada (T24, `src/lib/calls/WhatsAppCallAdapter.ts`: `dial` = NotSupported; atender = "atenda no aparelho"), e o `CallSessionProvider.dial()` **disca sempre por VoIP**, ignorando o canal escolhido. É preciso escolher **por qual motor** as chamadas de voz vão existir, sabendo que as opções não oficiais (protocolo do aparelho vinculado) **podem banir o número e violam os termos do WhatsApp** — o repositório já registra um bloqueio da Meta em 25/09/2026. Esta é a decisão É004 do plano.

## Alternativas avaliadas

| Caminho | O que é | Risco | Situação |
|---|---|---|---|
| **A — API oficial da Meta** (WhatsApp Business Calling API / Cloud API) | VoIP de entrada e saída pela Graph API + webhooks; mídia por **WebRTC** (áudio OPUS/PCMA/PCMU); recebidas são gratuitas; saída exige permissão por par empresa×usuário, **100 chamadas/dia por par** e número na Cloud API (não no app), com teto de mensagens ≥ 2.000 destinatários únicos. | **Aceitável** — caminho suportado, sem violar termos | Requer migrar/registrar número na Cloud API e confirmar tarifa em BRL (a partir de 01/07/2026) no Business Manager |
| **B — `meowcaller` + Evolution GO PR #141** | Protocolo **não oficial** (aparelho vinculado); áudio PCM16LE por WebSocket, `NewClient(wa)` antes de `wa.Connect()`. PR #141 **aberto desde 29/07/2026, não mesclado** (19 arquivos, +5.239/−791); última versão publicada 0.7.2 (03/07/2026) não tem isso. `meowcaller` é Go/MIT de pesquisa, **sem versão publicada**, 21 issues abertas. | **Alto** — viola termos; pode banir o número | Esforço alto: compilar e manter fork próprio; front precisa de AudioWorklet |
| **B' — Wavoip** | Serviço pronto, mesma classe de risco (QR / aparelho vinculado); SDK WebSocket, webphone, SIP, gravação; ponte "Externo" compartilha a sessão da nossa API. Preço em BRL não publicado. | **Alto** — mesmo risco de banimento; coloca terceiro no caminho do áudio/sessão | Laboratório mais rápido que B (teste gratuito, SDK pronto) |
| **C — manter como está** | Só eventos; "atenda no aparelho". | Nenhum | Já existe; **não liga pelo WhatsApp**, não atende o pedido |

## Decisão recomendada

1. **Produção = caminho A (API oficial da Meta).** É o único caminho que não viola os termos do WhatsApp nem arrisca o número. Recebidas são gratuitas; a saída exige permissão explícita do cliente por par empresa×usuário.
2. **B e B' só como laboratório, num número reserva (E001), nunca no número principal.** O laboratório serve para medir áudio, atraso e estabilidade antes de qualquer uso real, e começa pela **Wavoip (B')** por ser o teste mais rápido (gratuito, SDK pronto); o `meowcaller` (B) fica como referência aberta.
3. **Escolha do motor não muda o resto:** o contrato de transporte (E005 — interfaces `WhatsAppCallEngine` e `MediaTransport`) é escrito **antes** de qualquer implementação, e a hospedagem do gateway (E033) é decidida à parte das Edge Functions. Quando a API oficial estiver viável, **só o motor e o transporte de mídia mudam** — estado, histórico e interface são reaproveitados (fases 5 a 9 do plano).
4. **Antes de construir o caminho A**, o dono confirma no Business Manager: (a) o teto de mensagens do número (precisa ser ≥ 2.000 destinatários únicos/dia); (b) se o número pode ir para a Cloud API mantendo histórico ou se vale registrar um número novo só para ligações; (c) a tarifa de saída em BRL.

## Critério de troca (switch)

**Trocar do laboratório não oficial para o caminho A** quando, cumulativamente: (a) o número estiver na Cloud API e o app assinado no campo `calls`; (b) o teto de mensagens confirmado ≥ 2.000/dia; (c) a permissão por par empresa×usuário entendida e aceita pelo dono; (d) a tarifa em BRL confirmada.

**Abandonar um caminho não oficial** (B ou B') — e não seguir com ele em produção — se ocorrer **qualquer** um destes: (a) aviso, restrição ou bloqueio da Meta no número (o bloqueio de 25/09/2026 é o precedente); (b) o WhatsApp mudar o protocolo e quebrar a chamada; (c) o laboratório não atingir as métricas de G1 (abaixo); (d) custo de manter o serviço/fork superar o do caminho A.

**Se G1 falhar, o plano para** e a recomendação passa a ser só o caminho A (regra da seção 3 do plano).

**Trocar de motor a qualquer momento** é barato por desenho: o contrato E005 garante que a troca de motor (oficial ↔ não oficial) não exige refazer estado de chamada, histórico nem interface.

## Métricas de sucesso (E007)

Definição, não implementação de painel. As quatro métricas alimentam o critério da **Porta G1** (seção 3 do plano). Medição nas etapas E016–E021 (15 chamadas de entrada + 15 de saída, em horários diferentes).

| Métrica | O que conta | Como medir | Critério de passagem (G1) |
|---|---|---|---|
| **Áudio bidirecional** | % de chamadas em que o áudio é recebido **e** enviado por pelo menos alguns segundos úteis | Gravação dos dois lados + estatísticas de quadros do motor/gateway | **≥ 90%** das 30 chamadas (15 entrada + 15 saída) com áudio nos dois sentidos |
| **Atraso boca-a-ouvido** | Tempo entre falar e ser ouvido do outro lado | Tom de teste + gravação dos dois lados (E018); publicar mediana e p95 | **≤ 600 ms** no p95 (a mediana é registrada para diagnóstico) |
| **Falhas por 100 chamadas** | Chamadas que terminam sem áudio nos dois sentidos, com erro de setup, queda de WebSocket ou não atendida — classificadas por `end_reason` | Contagem por motivo, sobre o universo das 30 do laboratório e, depois, do piloto | Sem teto próprio no G1 além do ≥ 90% de sucesso; serve de linha de base para o piloto (E097/E098) |
| **Restrições do número** | Qualquer aviso, restrição, queda de qualidade ou bloqueio na conta do número reserva | Observação do número por **7 dias** após o laboratório (E021) | Número **sem restrição** após os 7 dias |

Regra de leitura: se **qualquer** métrica de G1 falhar, **G1 falha** e o plano para (seção 3). As mesmas quatro métricas são recalculadas no piloto de 14 dias (E097) com a política de limites ligada.

## Consequências

- A Fase 0 segue bloqueada em G0 até E001/E002/E003/E006/E009 (número reserva, risco por escrito, jurídico, acesso à Evolution GO, papéis) — este ADR **não** autoriza nenhum uso de número.
- A Fase 1 (laboratório) só começa depois de G0 e **só no número reserva**; F2–F9 só depois de G1 aprovado.
- O contrato E005 e o ADR de hospedagem do gateway (E033) ficam sendo pré-requisitos de qualquer implementação.
- O risco de banimento e a violação de termos continuam **aceitos deliberadamente** enquanto os caminhos B/B' existirem como laboratório — o registro de riscos é a **seção 7** do plano.

## Alternativas rejeitadas

- **Ir direto ao caminho B/B' em produção** — repete o risco do bloqueio de 25/09/2026 no número principal; rejeitado pela regra do número reserva e pelo G0/G1.
- **Descartar o laboratório e esperar só o caminho A** — perde a medição barata de áudio/atraso e a chance de fechar G1 com dados; rejeitado em favor do laboratório em número reserva.
- **Manter só eventos (caminho C)** — não atende o pedido do dono.

## Referências

- `docs/plans/PLANO_LIGACOES_WHATSAPP_MEOWCALLER_100_ETAPAS_2026-10-07.md` (seções 0, 2, 3 e 7).
- `docs/design/ANALISE_LIGACOES_WHATSAPP_2026-10-07.md` (fontes dos três caminhos).
- Meta, Calling API: https://developers.facebook.com/documentation/business-messaging/whatsapp/calling
- Evolution GO, PR #141: https://github.com/evolution-foundation/evolution-go/pull/141 · `meowcaller`: https://github.com/purpshell/meowcaller
- Wavoip: https://www.wavoip.com/ · https://wavoip.gitbook.io/api
