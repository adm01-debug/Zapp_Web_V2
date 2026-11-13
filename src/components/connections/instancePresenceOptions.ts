export const PRESENCE_OPTIONS = [
  { value: 'available', label: 'Disponível (online)' },
  { value: 'unavailable', label: 'Indisponível (offline)' },
] as const;

export type Presenca = (typeof PRESENCE_OPTIONS)[number]['value'];
