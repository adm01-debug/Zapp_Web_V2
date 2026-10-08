/**
 * Conversão data/hora do módulo de Tarefas (prazo e alarme).
 *
 * A tela trabalha com `yyyy-MM-dd` + `HH:mm` locais, mas `due_date`/`remind_at`
 * são `timestamptz` no banco. Compor a string sem offset deixava o Postgres
 * (sessão em UTC) ler o horário local como UTC — 3 h de deslocamento em
 * America/Sao_Paulo (R2-MOD-050). Criação (QuickAdd) e edição (WorkItemSheet)
 * passam por aqui, então as duas pontas têm o mesmo contrato.
 */

/** `yyyy-MM-dd` locais de um ISO. */
export function diaLocal(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** `HH:mm` locais de um ISO. */
export function horaLocal(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/**
 * `dia` + `hora` locais → ISO com offset explícito; sem hora escolhida, o prazo
 * vale o dia inteiro (23:59 local), a convenção do módulo.
 */
export function comporLocal(dia: string, hora: string): string {
  const [y, m, d] = dia.split('-').map(Number);
  const [h, min] = (hora || '23:59').split(':').map(Number);
  return new Date(y, m - 1, d, h, min, 0, 0).toISOString();
}

/**
 * Mesmo instante? Compara epoch, não o texto: o banco devolve
 * "2026-10-20T12:00:00+00:00" e o `toISOString()` do navegador devolve
 * "2026-10-20T12:00:00.000Z" — textos diferentes, mesmo instante.
 */
export function mesmoInstante(a: string | null, b: string | null): boolean {
  if (a === null || b === null) return a === b;
  return new Date(a).getTime() === new Date(b).getTime();
}
