 import { Target, Minimize2 } from 'lucide-react';
 import { cn } from '@/lib/utils';
 import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
 
 interface ZenModeToggleProps {
   isZen: boolean;
   toggleZen: () => void;
 }
 
 export function ZenModeToggle({ isZen, toggleZen }: ZenModeToggleProps) {
   return (
     <Tooltip delayDuration={0}>
       <TooltipTrigger asChild>
         <button
           onClick={toggleZen}
           className={cn(
             'absolute top-3 right-3 z-30 h-8 rounded-full flex items-center gap-1.5 transition-all duration-200',
             'border backdrop-blur-sm shadow-sm',
             isZen
               ? 'px-3 bg-primary/15 border-primary/30 text-primary hover:bg-primary/25 hover:border-primary/50 shadow-primary/10'
               : 'px-2.5 bg-card/80 border-border/40 text-muted-foreground/60 hover:text-foreground hover:bg-muted/60 hover:border-border/70'
           )}
           aria-label={isZen ? 'Sair do modo zen' : 'Modo zen'}
         >
           {isZen ? <Minimize2 className="w-3.5 h-3.5" /> : <Target className="w-4 h-4" />}
           <span className="text-2xs font-medium tracking-wide">
             {isZen ? 'Sair' : 'Zen'}
           </span>
         </button>
       </TooltipTrigger>
       <TooltipContent side="left" sideOffset={8} className="text-xs">
         {isZen ? 'Sair do modo zen (Esc)' : 'Modo zen — foco total'}
       </TooltipContent>
     </Tooltip>
   );
 }