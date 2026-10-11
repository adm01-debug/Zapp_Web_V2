# Plano — redesign exaustivo do módulo Campanhas (Talk X), 10/10/2026

> Pedido do Joaquim: módulo Campanhas igual aos 6 mockups de referência (pasta "Zapp Web
> V2 - Redesign/Campanhas - Talk X"), cores só do sistema, gráficos em React, visual
> moderno. Base: 6 agentes validaram CADA elemento dos 6 mockups contra o código real
> (telas: Relatório, Pausada, Em Andamento, Monitor ao Vivo, Agendada, Revisão Final).

## 1. O achado mais importante — "gráficos em React" já é arquitetura padrão

`recharts` já é a biblioteca usada em todo o Talk X (`TalkXLiveMonitor`, e os componentes
órfãos abaixo). Não precisa trocar nada de tecnologia — precisa LIGAR o que já foi escrito.

## 2. Achado estrutural #1 — telas inteiras já construídas, nunca roteadas

- **`TalkXCampaignPaused.tsx`** (tela "Campanha Pausada" completa, quase idêntica ao
  mockup) + **`TalkXSentSummaryChart.tsx`** ("Resumo de Enviados", gráfico real com
  seletor de período) + **`TalkXKeyMetricsCard.tsx`** ("Principais Métricas" com
  vs.média) — todos prontos e testados, **zero import fora da própria pasta/teste**.
  `TalkXView.tsx` manda status `paused` pra `TalkXCampaignRunning.tsx` (tela genérica)
  em vez desses três. Os docs internos (`TALKX_MULTIPLIX.md`, X156) marcam como
  NOT_IMPLEMENTED — mas o código existe.
- **`TalkXReportPerformance.tsx`** (gráfico 4 séries) + **`TalkXReportFunnel.tsx`**
  (funil com filtro de segmento) + **`TalkXReportHeatmap.tsx`** (mapa de calor) — mesmo
  caso: prontos, testados, zero uso fora de `report/`. "Ver relatório" hoje abre
  `TalkXLiveMonitor` (só 3 abas), não uma tela de relatório dedicada.

**Isso é a prioridade #1 do plano** — maior ganho visual pelo menor esforço: é roteamento,
não construção do zero.

## 3. Achado estrutural #2 — violação de regra já confirmada como NÃO ativa

O botão "Exportar relatório" (PDF) do mockup **não existe em código nenhum** — nem
arquivo, nem botão (confirmado via `git log -S`, os arquivos citados no inventário interno
nunca existiram no histórico). Nenhuma violação da regra "nenhuma informação sai do
sistema" está ativa. **Este cartão NÃO deve reintroduzir esse botão** — é intencional.

## 4. Gaps reais por tela (o que precisa de trabalho novo, não só roteamento)

| Tela | Falta | Tamanho |
|---|---|---|
| Monitor ao Vivo | "Fila por Segmento" (não existe), série "Previsto" no gráfico, Taxa de envio + Término estimado no painel Saúde | médio |
| Em Andamento | coluna Segmento + filtro/busca nas tabelas, card "Pico de Respostas" | pequeno-médio |
| Agendada | Repetição (Diária/Semanal/Personalizado) — **feature nova de verdade**, não só UI (precisa reexecutar a campanha por ocorrência, não reenviar pra quem já recebeu) | grande |
| Revisão Final | CTA na prévia do WhatsApp (prop `interactive` existe, só não é passada), "Recomendações da IA" reaproveitando o motor heurístico real (`useTalkXInsights`) que já existe mas só roda no Analytics global | médio |
| Relatório | 8 abas do mockup → decidir quais fazem sentido de verdade com dado real disponível | médio |

## 5. Decisão do Joaquim antes de codar — métricas que NÃO têm fonte de dado hoje

Nenhum destes tem cálculo, modelo ou campo no banco — inventar um número seria mentir pro
usuário:
1. **"Risco de opt-out estimado"** (Revisão Final) — zero lógica equivalente no sistema.
2. **"Taxa de resposta projetada"** (Revisão Final) — campo existe, valor é sempre `null`
   ("sem histórico"); não há modelo.
3. **Investimento / Receita gerada / ROI** (Relatório) — conceito de custo/receita por
   campanha não existe em NENHUM lugar do Talk X hoje (de onde viria o "investimento"? É
   custo por mensagem? Manual?).
4. **"+38% mais qualificado que a média"** (segmentação, Revisão Final) — sem lógica
   equivalente pronta (diferente de "horário ideal" e "template campeão", que o motor
   heurístico real já calcula).

## 6. Ondas

**Onda 1 — ligar o que já existe (maior ganho, menor risco):**
1. Rotear `TalkXCampaignPaused.tsx` + satélites pra status `paused`.
2. Construir a tela de Relatório dedicada com os 3 componentes órfãos de `report/`.

**Onda 2 — completar gaps reais, sem inventar dado:**
3. Monitor ao Vivo: Fila por Segmento + Taxa de envio/Término estimado.
4. Em Andamento: coluna Segmento + filtro/busca + Pico de Respostas (heurística simples:
   variação da taxa dos últimos 10 min vs. anterior — mesmo princípio do heurístico já
   existente, nunca "IA" de verdade).
5. Revisão Final: CTA na prévia + Recomendações reaproveitando `useTalkXInsights`.

**Onda 3 — feature nova (maior, decisão própria):**
6. Agendada: recorrência de campanha (Diária/Semanal/Personalizado).

**Onda 4 — visual (depende de `t_f3f17002`, cores novas):**
7. Aplicar violeta/teal/rosa onde ajudar a diferenciar categoria (segmentos do donut,
   tipos de evento na timeline) + modernizar estilo dos cards (gradiente no banner,
   como o "Black Friday VIP" do mockup) — sempre com tokens do sistema, nunca hex cru.

## Referências

- Os 6 relatórios de validação completos estão no scratchpad desta sessão
  (`talkx-mockup-*.md`) — cada um lista, elemento por elemento, o que é real/parcial/
  inexistente com arquivo:linha.
- `t_f3f17002` (paleta de cores nova) — pré-requisito da Onda 4.
