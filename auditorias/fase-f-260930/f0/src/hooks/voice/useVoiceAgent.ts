 import { useCallback } from 'react';
 import { toast } from 'sonner';
 import type { VoiceAgentAction } from './types';
 
 export function useVoiceAgent(onViewChange: (viewId: string) => void) {
   const handleVoiceAction = useCallback((action: VoiceAgentAction) => {
     switch (action.action) {
       case 'navigate':
         if (action.data?.route) {
           onViewChange(action.data.route);
           toast.success(`Navegando para ${action.data.route}`);
         }
         break;
       case 'search':
         if (action.data?.query) {
           onViewChange('contacts');
           toast.info(`Buscando: "${action.data.query}"`);
         }
         break;
       case 'filter':
         if (action.data?.filters) {
           onViewChange('inbox');
           toast.info('Filtros aplicados por comando de voz');
         }
         break;
       case 'sort':
         if (action.data?.sortBy) {
           toast.info(`Ordenação alterada: ${action.data.sortBy}`);
         }
         break;
       case 'clear':
         toast.info('Filtros limpos');
         break;
       case 'answer':
         // Verbal response already given via TTS
         break;
     }
   }, [onViewChange]);
 
   return { handleVoiceAction };
 }