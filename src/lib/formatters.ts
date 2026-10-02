/**
 * Centralized formatting utilities
 * Eliminates duplication of date/phone/currency formatting across components.
 */
import { formatDistanceToNow, format, isToday, isYesterday } from 'date-fns';
import { ptBR } from 'date-fns/locale';

// ─── Date Formatting ────────────────────────────────────────────────

/**
 * Format a date as relative time in Portuguese (e.g., "há 5 minutos")
 */
export function formatRelativeTime(date: Date | string | number): string {
  const d = date instanceof Date ? date : new Date(date);
  return formatDistanceToNow(d, { addSuffix: true, locale: ptBR });
}

/**
 * Format a date as a smart label: "Hoje", "Ontem", or full date
 */
export function formatSmartDate(date: Date | string): string {
  const d = date instanceof Date ? date : new Date(date);
  if (isToday(d)) return `Hoje, ${format(d, 'HH:mm', { locale: ptBR })}`;
  if (isYesterday(d)) return `Ontem, ${format(d, 'HH:mm', { locale: ptBR })}`;
  return format(d, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });
}

/**
 * Format a date as short date (dd/MM/yyyy)
 */
export function formatShortDate(date: Date | string): string {
  const d = date instanceof Date ? date : new Date(date);
  return format(d, 'dd/MM/yyyy', { locale: ptBR });
}

/**
 * Format a date as full datetime
 */
export function formatFullDateTime(date: Date | string): string {
  const d = date instanceof Date ? date : new Date(date);
  return format(d, "dd/MM/yyyy 'às' HH:mm:ss", { locale: ptBR });
}

// ─── Phone Formatting ───────────────────────────────────────────────

/**
 * Clean phone number to digits only (removes +, spaces, dashes, parens)
 */
export function cleanPhone(phone: string): string {
  return phone.replace(/\D/g, '');
}

/**
 * Format a Brazilian phone number: (11) 99999-9999
 */
export function formatBrazilianPhone(phone: string): string {
  const digits = cleanPhone(phone);
  // Remove country code 55 if present
  const local = digits.startsWith('55') && digits.length > 11 ? digits.slice(2) : digits;
  if (local.length === 11) {
    return `(${local.slice(0, 2)}) ${local.slice(2, 7)}-${local.slice(7)}`;
  }
  if (local.length === 10) {
    return `(${local.slice(0, 2)}) ${local.slice(2, 6)}-${local.slice(6)}`;
  }
  return phone; // Return original if format unknown
}

// ─── Currency Formatting ────────────────────────────────────────────

/**
 * Format a number as Brazilian Real (R$ 1.234,56)
 */
export function formatBRL(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value);
}

// ─── Text Formatting ────────────────────────────────────────────────

/**
 * Truncate text with ellipsis
 */
export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength).trimEnd() + '…';
}

/**
 * Get initials from a name (e.g., "João Silva" → "JS")
 */
export function getInitials(name: string, maxChars = 2): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, maxChars)
    .map((word) => word[0].toUpperCase())
    .join('');
}

// ─── Number Formatting ──────────────────────────────────────────────

/**
 * Format large numbers with K/M suffix (e.g., 1500 → "1.5K")
 */
export function formatCompactNumber(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value);
}

/**
 * Format a duration in seconds to human-readable (e.g., 125 → "2min 5s")
 */
export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  if (mins < 60) return secs > 0 ? `${mins}min ${secs}s` : `${mins}min`;
  const hours = Math.floor(mins / 60);
  const remainMins = mins % 60;
  return remainMins > 0 ? `${hours}h ${remainMins}min` : `${hours}h`;
}

/**
 * Format percentage (e.g., 0.856 → "85.6%")
 */
export function formatPercentage(value: number, decimals = 1): string {
  return `${(value * 100).toFixed(decimals)}%`;
}

/**
 * Data de nascimento para o sidebar: `{ label: 'dd/MM/yyyy', age }`.
 * Idade em anos completos; `null` para data inválida ou futura (nunca
 * inventa — a UI mostra "—").
 */
export function formatBirthday(iso: string | null | undefined, now: Date = new Date()): { label: string | null; age: number | null } {
  if (!iso) return { label: null, age: null };
  // 'YYYY-MM-DD' precisa ser lido como data local (new Date(iso) interpreta
  // como UTC e o dd/MM viraria o dia anterior em GMT-3).
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  const date = dateOnly
    ? new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]))
    : new Date(iso);
  if (Number.isNaN(date.getTime())) return { label: null, age: null };
  if (date.getTime() > now.getTime()) return { label: format(date, 'dd/MM/yyyy', { locale: ptBR }), age: null };
  let age = now.getFullYear() - date.getFullYear();
  const birthdayThisYear = new Date(now.getFullYear(), date.getMonth(), date.getDate());
  if (birthdayThisYear.getTime() > now.getTime()) age -= 1;
  return { label: format(date, 'dd/MM/yyyy', { locale: ptBR }), age };
}
