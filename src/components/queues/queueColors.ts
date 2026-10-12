/**
 * Paleta do seletor de cor de fila — tokens do `tokens.css`, nunca hex solto.
 *
 * O valor é guardado como CSS em `queues.color` e usado direto em `style`
 * (`hsl(var(--token))` resolve por tema, então troca junto com o tema claro/escuro).
 * Vive num módulo próprio para `CreateQueueDialog` e `EditQueueDialog` usarem a
 * MESMA lista — telas de teste mockam o diálogo inteiro, e a paleta não pode
 * depender dele.
 *
 * O violeta já usa o token de categoria `--violeta` (t_f3f17002/t_290f3cdc); rosa/lima
 * ainda não têm token semântico e seguem no par `--dash-*`.
 */
export const QUEUE_COLORS = [
  'hsl(var(--primary))',      // azul
  'hsl(var(--success))',      // verde
  'hsl(var(--warning))',      // âmbar
  'hsl(var(--destructive))',  // vermelho
  'hsl(var(--violeta))',      // violeta
  'hsl(var(--dash-red))',     // rosa
  'hsl(var(--info))',         // ciano
  'hsl(var(--dash-green))',   // lima
];
