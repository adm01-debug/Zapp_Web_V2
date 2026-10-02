/**
 * Config das 3 seções do novo sidebar "Detalhes do Contato" (plano
 * PLANO_SIDEBAR_CONTATO_3_SECOES_100_ETAPAS_2026-10-02.md, etapa 44).
 *
 * O estado do accordion migra da chave antiga `contact-details-accordion-state`
 * (seções antigas: info, tags, timeline...) para a chave nova
 * `contact-sidebar-accordion-state@v2`: só os valores que existem nas 3
 * seções novas sobrevivem; sobra vazia → default (as 3 abertas).
 */
export const SIDEBAR_SECTIONS = ['professional', 'personal', 'singu'] as const;
export type SidebarSectionValue = (typeof SIDEBAR_SECTIONS)[number];

export const DEFAULT_OPEN_SECTIONS: SidebarSectionValue[] = ['professional', 'personal', 'singu'];

const STORAGE_KEY = 'contact-sidebar-accordion-state@v2';
const LEGACY_STORAGE_KEY = 'contact-details-accordion-state';

const KNOWN = new Set<string>(SIDEBAR_SECTIONS);

function validValues(parsed: unknown): string[] {
  if (!Array.isArray(parsed)) return [];
  return parsed.filter((v): v is string => typeof v === 'string' && KNOWN.has(v));
}

export function getStoredSidebarState(): string[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const valid = validValues(JSON.parse(stored));
      if (valid.length > 0) return valid;
    }
  } catch { /* storage indisponível */ }

  try {
    const legacy = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (legacy) {
      const valid = validValues(JSON.parse(legacy));
      if (valid.length > 0) {
        saveSidebarState(valid);
        return valid;
      }
    }
  } catch { /* storage indisponível */ }

  return [...DEFAULT_OPEN_SECTIONS];
}

export function saveSidebarState(value: string[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch { /* storage indisponível */ }
}

/** Animação de entrada das 3 seções (stagger 0,08s) — reaproveita o padrão do accordion antigo. */
export const sidebarSectionVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: (i: number) => ({
    opacity: 1, y: 0,
    transition: { delay: 0.08 * i, duration: 0.3, ease: 'easeOut' as const },
  }),
};
