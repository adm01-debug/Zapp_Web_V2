/**
 * Paleta do seletor de cor de fila — tokens do `tokens.css`, nunca hex solto.
 *
 * O valor é guardado como CSS em `queues.color` e usado direto em `style`
 * (`hsl(var(--token))` resolve por tema, então troca junto com o tema claro/escuro).
 * Vive num módulo próprio para `CreateQueueDialog` e `EditQueueDialog` usarem a
 * MESMA lista — telas de teste mockam o diálogo inteiro, e a paleta não pode
 * depender dele.
 *
 * Violeta/rosa/lima ainda não têm token semântico: usam o par `--dash-*` até o
 * `t_f3f17002` publicar `--violet`/`--teal`/`--rosa`; trocar então.
 */
export const QUEUE_COLORS = [
  'hsl(var(--primary))',      // azul
  'hsl(var(--success))',      // verde
  'hsl(var(--warning))',      // âmbar
  'hsl(var(--destructive))',  // vermelho
  'hsl(var(--dash-violet))',  // violeta
  'hsl(var(--dash-red))',     // rosa
  'hsl(var(--info))',         // ciano
  'hsl(var(--dash-green))',   // lima
];
