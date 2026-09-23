import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { DollarSign, Calendar, User, MoreHorizontal, Trophy, Edit, Trash2, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Deal {
  id: string;
  title: string;
  value: number;
  currency: string;
  stage_id: string | null;
  contact_id: string | null;
  assigned_to: string | null;
  priority: string;
  expected_close_date: string | null;
  notes: string | null;
  tags: string[];
  status: string;
  created_at: string;
  contact?: { name: string; phone: string } | null;
  assignee?: { name: string } | null;
}

const priorityColors: Record<string, string> = {
  high: 'bg-destructive/20 text-destructive border-destructive/30',
  medium: 'bg-warning/20 text-warning border-yellow-500/30',
  low: 'bg-success/20 text-success border-success/30',
};

interface DealCardProps {
  deal: Deal;
  isDragging: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  onEdit: (deal: Deal) => void;
  onMarkWon: (deal: Deal) => void;
  onMarkLost: (deal: Deal) => void;
  /** Ausente para quem nao pode excluir (RLS ja bloqueia; some do menu tambem). */
  onDelete?: (id: string) => void;
}

export function DealCard({ deal, isDragging, onDragStart, onDragEnd, onEdit, onMarkWon, onMarkLost, onDelete }: DealCardProps) {
  return (
    <motion.div
      layout initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.9 }}
      draggable onDragStart={onDragStart} onDragEnd={onDragEnd}
      className={cn("p-3 rounded-lg border bg-card/80 cursor-grab active:cursor-grabbing transition-all hover:border-secondary/30 hover:shadow-sm group", isDragging && "opacity-50 scale-95")}
    >
      <div className="flex items-start justify-between mb-2">
        <h4 className="text-sm font-medium text-foreground leading-tight">{deal.title}</h4>
        <DropdownMenu>
          <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-5 w-5 opacity-0 group-hover:opacity-100"><MoreHorizontal className="w-3.5 h-3.5" /></Button></DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => onEdit(deal)}><Edit className="w-3.5 h-3.5 mr-2" /> Editar</DropdownMenuItem>
            <DropdownMenuItem onClick={() => onMarkWon(deal)} className="text-success"><Trophy className="w-3.5 h-3.5 mr-2" /> Marcar como ganho</DropdownMenuItem>
            <DropdownMenuItem onClick={() => onMarkLost(deal)} className="text-destructive"><X className="w-3.5 h-3.5 mr-2" /> Marcar como perdido</DropdownMenuItem>
            {onDelete && (
              <DropdownMenuItem onClick={() => onDelete(deal.id)} className="text-destructive"><Trash2 className="w-3.5 h-3.5 mr-2" /> Excluir</DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {deal.value > 0 && (
        <div className="flex items-center gap-1 mb-2">
          <DollarSign className="w-3.5 h-3.5 text-success" />
          <span className="text-sm font-semibold text-success">R$ {deal.value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
        </div>
      )}
      <div className="flex items-center gap-2 flex-wrap">
        <Badge variant="outline" className={cn("text-[10px] h-4", priorityColors[deal.priority])}>
          {deal.priority === 'high' ? 'Alta' : deal.priority === 'medium' ? 'Média' : 'Baixa'}
        </Badge>
        {deal.contact && <div className="flex items-center gap-1 text-[10px] text-muted-foreground"><User className="w-3 h-3" /><span className="truncate max-w-[80px]">{deal.contact.name}</span></div>}
        {deal.expected_close_date && <div className="flex items-center gap-1 text-[10px] text-muted-foreground"><Calendar className="w-3 h-3" />{new Date(deal.expected_close_date).toLocaleDateString('pt-BR')}</div>}
      </div>
    </motion.div>
  );
}

export type { Deal };
