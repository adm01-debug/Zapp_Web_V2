import { Crown } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Phone } from 'lucide-react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';

interface CompactContactHeaderProps {
  contact: { name: string; phone: string; avatar?: string };
  isVip: boolean;
  companyName?: string;
  firstName: string;
}

export function CompactContactHeader({ contact, isVip, companyName, firstName }: CompactContactHeaderProps) {
  return (
    <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
      className="flex items-center gap-3 px-4 py-2.5 border-b border-border bg-card">
      <div className="relative">
        <Avatar className="w-9 h-9 ring-1 ring-border/20">
          <AvatarImage src={contact.avatar} alt={contact.name || 'Avatar'} />
          <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
            {contact.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
          </AvatarFallback>
        </Avatar>
        {isVip && <Crown className="w-3 h-3 text-warning absolute -top-0.5 -right-0.5" />}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-semibold text-foreground truncate">{firstName}</span>
          {companyName && (
            <>
              <span className="text-muted-foreground text-xs">•</span>
              <span className="text-xs text-muted-foreground truncate">{companyName}</span>
            </>
          )}
        </div>
      </div>
      <div className="flex items-center gap-1">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="w-7 h-7 hover:bg-primary/10"
                onClick={() => { navigator.clipboard.writeText(contact.phone); toast.success('Telefone copiado!'); }}>
                <Phone className="w-3.5 h-3.5 text-primary" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Copiar telefone</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
    </motion.div>
  );
}
