import { NavigationService } from '@/services/navigation.service';

export function HeaderSectionAnchor({ currentView }: { currentView: string }) {
  const label = NavigationService.getViewLabel(currentView);
  return (
    <div className="flex flex-col leading-tight min-w-0">
      <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/70">Seção atual</span>
      <span className="text-sm font-semibold text-foreground truncate">{label}</span>
    </div>
  );
}
