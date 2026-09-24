/**
 * Tamanhos de fonte usados em gráficos (Recharts) — fonte de verdade única.
 *
 * F5 do PLANO_AUDITORIA_FONTES_100_ETAPAS_2026-09-24 (achado A9): antes disso
 * cada gráfico cravava `fontSize` 10/11/12 solto em `tick`, `contentStyle` e
 * `LabelList`, sem nenhuma auditoria — 86 ocorrências em 21 arquivos. Os
 * valores aqui são exatamente os que já estavam em produção; nada mudou
 * visualmente, só a fonte de verdade.
 *
 * Cores/raio/background de cada gráfico continuam no próprio componente —
 * variam de propósito (card × popover, raio 8 × 12) e centralizar isso
 * mudaria a aparência sem pedido para tal.
 */

/** Eixos (XAxis/YAxis) na maioria dos gráficos. */
export const CHART_TICK_FONT_SIZE = 10;

/** Eixos em gráficos mais compactos (SatisfactionMetrics, SentimentTrendChart). */
export const CHART_TICK_FONT_SIZE_SM = 11;

/** Eixos em gráficos de SLA/filas (SLACharts, queues/chartConfig, chartColors CHART_STYLES). */
export const CHART_TICK_FONT_SIZE_LG = 12;

/** Tooltip (`contentStyle`) — 12px em todo o repo, sem exceção. */
export const CHART_TOOLTIP_FONT_SIZE = 12;

/** `LabelList` sobre barras/pontos. */
export const CHART_LABEL_FONT_SIZE = 10;
