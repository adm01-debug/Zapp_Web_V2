import { MediaVolumeControl } from '@/components/inbox/MediaVolumeControl';
import { cn } from '@/lib/utils';

/**
 * E27 — controle rápido do volume das mídias de conversa na sidebar ("Controles
 * rápidos"). Ícone de fone, não de alto-falante: ao lado do `SoundMuteToggle` (que
 * silencia os **alertas**) o usuário não pode confundir os dois (D6).
 */
export function MediaVolumeToggle({ className }: { className?: string }) {
  return <MediaVolumeControl variant="sidebar" className={cn('w-[36px] h-[36px]', className)} />;
}
