export const normalizeMediaUrl = (url?: string | null): string => {
  if (!url) return '';

  return url
    .trim()
    .replace(/^"+|"+$/g, '')
    .replace(/\.supabase\.co"\//, '.supabase.co/')
    .replace(/([^:]\/)\/+?/g, '$1');
};
