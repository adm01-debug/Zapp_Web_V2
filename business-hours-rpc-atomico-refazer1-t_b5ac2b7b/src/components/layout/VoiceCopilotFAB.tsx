 import { Mic } from 'lucide-react';
 import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
 
 interface VoiceCopilotFABProps {
   onClick: () => void;
 }
 
 export function VoiceCopilotFAB({ onClick }: VoiceCopilotFABProps) {
   return (
     <Tooltip delayDuration={0}>
       <TooltipTrigger asChild>
         <button
           onClick={onClick}
           className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full bg-gradient-to-br from-primary to-secondary text-primary-foreground shadow-lg hover:shadow-xl hover:scale-105 transition-all flex items-center justify-center"
           aria-label="Assistente de voz"
         >
           <Mic className="w-6 h-6" />
         </button>
       </TooltipTrigger>
       <TooltipContent side="left" sideOffset={8}>
         Assistente de Voz IA
       </TooltipContent>
     </Tooltip>
   );
 }