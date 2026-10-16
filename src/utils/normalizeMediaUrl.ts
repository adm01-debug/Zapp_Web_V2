/**
 * normalizeMediaUrl — Normalizes media URLs from legacy DB artifacts.
 *
 * Known corruption patterns (from JSON serialization):
 *   `https://<host>.supabase.co\"/storage/...` → `https://<host>.supabase.co/storage/...`
 *   `https://<host>.atomicabr.com.br\"/storage/...` → `https://<host>.atomicabr.com.br/storage/...`
 *   `"https://<host>/...\"`                    → `https://<host>/...`
 *   `https://<host>///storage/...`             → `https://<host>/storage/...`
 *
 * Paridade V3 (2026-10-13, Hermes): guarda de tipo (valor que não é string não
 * pode lançar `url.trim is not a function`), o artefato auto-hospedado
 * `.atomicabr.com.br"/` e o colapso de barras duplicadas em toda a URL. A regex
 * de supabase.co é mantida para compatibilidade. Usa [/] na classe de
 * caracteres para evitar conflito com o delimitador do literal.
 */
export const normalizeMediaUrl = (url?: string | null): string => {
  if (!url || typeof url !== 'string') return '';

  return url
    .trim()
    .replace(/^"+|"+$/g, '')
    // Corrige escapar de aspas: dominio.com"/caminho → dominio.com/caminho
    .replace(/\.supabase\.co"[/]/, '.supabase.co/')
    .replace(/\.atomicabr\.com\.br"[/]/, '.atomicabr.com.br/')
    .replace(/([^:][/])[/]+/g, '$1');
};
