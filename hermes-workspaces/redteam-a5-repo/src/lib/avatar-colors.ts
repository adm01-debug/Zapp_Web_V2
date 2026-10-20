/**
 * Deterministic avatar color palette based on name.
 * Returns HSL-based Tailwind-compatible classes for consistent, unique avatar colors.
 */

const AVATAR_PALETTES = [
  { bg: 'bg-primary/15', text: 'text-primary' },
  { bg: 'bg-[hsl(200_80%_92%)]', text: 'text-[hsl(200_80%_35%)]' },
  { bg: 'bg-[hsl(340_70%_92%)]', text: 'text-[hsl(340_70%_40%)]' },
  { bg: 'bg-[hsl(160_60%_90%)]', text: 'text-[hsl(160_60%_30%)]' },
  { bg: 'bg-[hsl(30_80%_90%)]', text: 'text-[hsl(30_80%_35%)]' },
  { bg: 'bg-[hsl(280_60%_92%)]', text: 'text-[hsl(280_60%_40%)]' },
  { bg: 'bg-[hsl(10_70%_92%)]', text: 'text-[hsl(10_70%_40%)]' },
  { bg: 'bg-[hsl(180_50%_90%)]', text: 'text-[hsl(180_50%_30%)]' },
] as const;

function hashName(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = ((hash << 5) - hash + name.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

export function getAvatarColor(name: string): { bg: string; text: string } {
  const idx = hashName(name) % AVATAR_PALETTES.length;
  return AVATAR_PALETTES[idx];
}

export function getInitials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
}
