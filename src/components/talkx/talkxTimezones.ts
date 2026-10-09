/**
 * X133 — fonte ÚNICA dos fusos horários do Talk X.
 *
 * Antes o passo Entrega (`TalkXWizardDelivery`) e a tela 10
 * (`TalkXCampaignScheduled`) mantinham CADA UM a sua própria lista, com nomes
 * IANA crus ("America/Sao Paulo") que o operador não reconhece. Aqui o rótulo é
 * o que aparece no seletor — "(UTC-03:00) Brasília (BRT)" — e os dois lugares
 * leem daqui, então incluir um fuso (ou corrigir um rótulo) é uma edição só.
 *
 * O valor gravado em `talkx_campaigns.schedule_timezone` continua sendo o IANA:
 * é ele que o motor (`deliveryWindowStatus`) e o banco validam.
 */
export interface TalkXTimezoneOption {
  /** Identificador IANA persistido em `schedule_timezone`. */
  value: string;
  /** Rótulo exibido: "(UTC-03:00) Brasília (BRT)". */
  label: string;
}

export const TALKX_TIMEZONES: TalkXTimezoneOption[] = [
  { value: 'America/Sao_Paulo', label: '(UTC-03:00) Brasília (BRT)' },
  { value: 'America/Manaus', label: '(UTC-04:00) Manaus (AMT)' },
  { value: 'America/Belem', label: '(UTC-03:00) Belém (BRT)' },
  { value: 'America/Fortaleza', label: '(UTC-03:00) Fortaleza (BRT)' },
  { value: 'America/Recife', label: '(UTC-03:00) Recife (BRT)' },
  { value: 'America/Cuiaba', label: '(UTC-04:00) Cuiabá (AMT)' },
  { value: 'America/Porto_Velho', label: '(UTC-04:00) Porto Velho (AMT)' },
  { value: 'America/Rio_Branco', label: '(UTC-05:00) Rio Branco (ACT)' },
  { value: 'America/New_York', label: '(UTC-05:00) Nova York (EST)' },
  { value: 'America/Chicago', label: '(UTC-06:00) Chicago (CST)' },
  { value: 'America/Los_Angeles', label: '(UTC-08:00) Los Angeles (PST)' },
  { value: 'America/Buenos_Aires', label: '(UTC-03:00) Buenos Aires (ART)' },
  { value: 'America/Santiago', label: '(UTC-03:00) Santiago (CLT)' },
  { value: 'America/Bogota', label: '(UTC-05:00) Bogotá (COT)' },
  { value: 'America/Lima', label: '(UTC-05:00) Lima (PET)' },
  { value: 'Europe/London', label: '(UTC+00:00) Londres (GMT)' },
  { value: 'Europe/Lisbon', label: '(UTC+00:00) Lisboa (WET)' },
  { value: 'UTC', label: '(UTC+00:00) UTC' },
];

/** Mesmo padrão da coluna (`schedule_timezone SET DEFAULT 'America/Sao_Paulo'`). */
export const DEFAULT_TALKX_TIMEZONE = 'America/Sao_Paulo';

/**
 * Rótulo amigável do fuso. Um valor que não está na lista volta como veio (nunca
 * inventa um rótulo para um fuso que o banco aceitou mas a tela ainda não lista).
 */
export function talkxTimezoneLabel(value: string): string {
  return TALKX_TIMEZONES.find((timezone) => timezone.value === value)?.label ?? value;
}
