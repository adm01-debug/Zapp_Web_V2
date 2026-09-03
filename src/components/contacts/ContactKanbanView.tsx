import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  MessageSquare, Users, UserCheck, Truck, Wrench,
  Star, Handshake, GripVertical,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { getAvatarColor, getInitials } from '@/lib/avatar-colors';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface KanbanContact {
  id: string;
  name: string;
  surname?: string | null;
  phone: string;
  email?: string | null;
  company?: string | null;
  avatar_url?: string | null;
  contact_type?: string | null;
  tags?: string[] | null;
}

interface ContactKanbanViewProps {
  contacts: KanbanContact[];
  onContactClick: (id: string) => void;
}

const KANBAN_COLUMNS = [
  { type: 'lead', label: 'Leads', color: 'hsl(38, 92%, 50%)', icon: Star },
  { type: 'cliente', label: 'Clientes', color: 'hsl(217, 91%, 60%)', icon: Users },
  { type: 'fornecedor', label: 'Fornecedores', color: 'hsl(270, 60%, 60%)', icon: Truck },
  { type: 'parceiro', label: 'Parceiros', color: 'hsl(142, 71%, 45%)', icon: Handshake },
  { type: 'colaborador', label: 'Colaboradores', color: 'hsl(190, 70%, 50%)', icon: UserCheck },
  { type: 'prestador_servico', label: 'Prestadores', color: 'hsl(340, 65%, 55%)', icon: Wrench },
];

export function ContactKanbanView({ contacts, onContactClick }: ContactKanbanViewProps) {
  const [localContacts, setLocalContacts] = useState<KanbanContact[]>(contacts);
  // id do contato -> token do drag mais recente. Set nao distinguia dois drags
  // do mesmo contato: o primeiro a responder limpava a flag e um update antigo
  // podia sobrescrever o novo (ou reverter para um valor ja superado).
  const inFlightDrags = useRef<Map<string, number>>(new Map());
  const dragSeq = useRef(0);
  // Ultimo contact_type confirmado, por contato. 'pending' marca uma confirmacao
  // vinda do nosso proprio write: ate o refetch devolver esse valor, qualquer
  // snapshot da prop foi capturado antes dele e nao pode sobrescreve-lo — senao
  // um rollback posterior voltaria para uma coluna ja superada.
  const confirmedTypes = useRef<Map<string, { type: KanbanContact['contact_type']; pending: boolean }>>(new Map());

  // Merge server data into local state, preserving contact_type for in-flight drags
  useEffect(() => {
    for (const server of contacts) {
      const known = confirmedTypes.current.get(server.id);
      // Snapshot mais antigo que a confirmacao local: ignora ate ele ecoar o
      // valor que gravamos, momento em que o refetch alcancou o write.
      if (known?.pending && known.type !== server.contact_type) continue;
      confirmedTypes.current.set(server.id, { type: server.contact_type, pending: false });
    }
    setLocalContacts(prev => {
      const prevMap = new Map(prev.map(c => [c.id, c]));
      return contacts.map(server => {
        const local = prevMap.get(server.id);
        if (!local) return server;
        return inFlightDrags.current.has(server.id)
          ? { ...server, contact_type: local.contact_type }
          : server;
      });
    });
  }, [contacts]);

  const columns = useMemo(() => {
    const grouped: Record<string, KanbanContact[]> = {};
    KANBAN_COLUMNS.forEach(col => { grouped[col.type] = []; });

    localContacts.forEach(c => {
      const type = c.contact_type || 'cliente';
      if (grouped[type]) grouped[type].push(c);
      else if (grouped['cliente']) grouped['cliente'].push(c);
    });

    return KANBAN_COLUMNS.map(col => ({
      ...col,
      contacts: grouped[col.type] || [],
    }));
  }, [localContacts]);

  const handleDragEnd = useCallback(async (result: DropResult) => {
    const { draggableId, destination } = result;
    if (!destination) return;

    const newType = destination.droppableId;
    const contact = localContacts.find(c => c.id === draggableId);
    if (!contact || contact.contact_type === newType) return;

    const token = ++dragSeq.current;
    inFlightDrags.current.set(draggableId, token);

    // Optimistic update
    setLocalContacts(prev =>
      prev.map(c => c.id === draggableId ? { ...c, contact_type: newType } : c)
    );

    const { error } = await supabase
      .from('contacts')
      .update({ contact_type: newType })
      .eq('id', draggableId);

    // Se outro drag do mesmo contato comecou depois deste, ele e a verdade:
    // ignora resultado e rollback desta operacao ja superada.
    if (inFlightDrags.current.get(draggableId) !== token) return;
    inFlightDrags.current.delete(draggableId);

    if (error) {
      // Rollback para o valor do servidor (prop 'contacts'), nao para o que este
      // drag capturou de localContacts: se um drag anterior do mesmo contato
      // tambem falhou, o capturado ja e o otimista dele e restaura-lo mostraria
      // uma coluna que o banco nunca teve.
      // Checa a entrada e nao '??': contact_type null e valor legitimo e nao
      // pode cair no capturado, que pode ser otimista.
      const known = confirmedTypes.current.get(draggableId);
      const serverType = known ? known.type : contact.contact_type;
      setLocalContacts(prev =>
        prev.map(c => c.id === draggableId ? { ...c, contact_type: serverType } : c)
      );
      toast.error('Erro ao mover contato');
    } else {
      confirmedTypes.current.set(draggableId, { type: newType, pending: true });
      const col = KANBAN_COLUMNS.find(c => c.type === newType);
      toast.success(`Movido para ${col?.label || newType}`);
    }
  }, [localContacts]);

  return (
    <DragDropContext onDragEnd={handleDragEnd}>
      <div className="flex gap-4 overflow-x-auto pb-4 min-h-[500px]">
        {columns.map((column, colIndex) => {
          const Icon = column.icon;
          return (
            <motion.div
              key={column.type}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: colIndex * 0.08 }}
              className="flex-shrink-0 w-[280px]"
            >
              <Card className="border-border/40 h-full">
                <CardHeader className="pb-3 pt-4 px-4">
                  <CardTitle className="text-sm font-semibold flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div
                        className="w-7 h-7 rounded-lg flex items-center justify-center"
                        style={{ backgroundColor: `${column.color}20` }}
                      >
                        <Icon className="w-3.5 h-3.5" style={{ color: column.color }} />
                      </div>
                      {column.label}
                    </div>
                    <Badge variant="secondary" className="text-[10px] h-5">
                      {column.contacts.length}
                    </Badge>
                  </CardTitle>
                  <div className="h-0.5 rounded-full mt-2" style={{ backgroundColor: column.color, opacity: 0.4 }} />
                </CardHeader>
                <Droppable droppableId={column.type}>
                  {(provided, snapshot) => (
                    <CardContent
                      ref={provided.innerRef}
                      {...provided.droppableProps}
                      className={cn(
                        "px-3 pb-3 min-h-[100px] transition-colors duration-200 rounded-b-lg",
                        snapshot.isDraggingOver && "bg-primary/5"
                      )}
                    >
                      <ScrollArea className="max-h-[60vh]">
                        <div className="space-y-2">
                          {column.contacts.map((contact, i) => {
                            const colors = getAvatarColor(contact.name);
                            return (
                              <Draggable key={contact.id} draggableId={contact.id} index={i}>
                                {(dragProvided, dragSnapshot) => (
                                  <div
                                    ref={dragProvided.innerRef}
                                    {...dragProvided.draggableProps}
                                    className={cn(
                                      "w-full text-left p-3 rounded-lg border border-border/30",
                                      "bg-card hover:bg-muted/40 hover:border-primary/20",
                                      "transition-all duration-150 cursor-pointer group",
                                      dragSnapshot.isDragging && "shadow-lg ring-2 ring-primary/30 rotate-1"
                                    )}
                                    onClick={() => !dragSnapshot.isDragging && onContactClick(contact.id)}
                                  >
                                    <div className="flex items-center gap-2.5">
                                      <div
                                        {...dragProvided.dragHandleProps}
                                        className="opacity-0 group-hover:opacity-50 hover:!opacity-100 transition-opacity cursor-grab active:cursor-grabbing"
                                      >
                                        <GripVertical className="w-3.5 h-3.5 text-muted-foreground" />
                                      </div>
                                      <Avatar className="w-8 h-8">
                                        <AvatarImage src={contact.avatar_url || undefined} />
                                        <AvatarFallback className={cn(colors.bg, colors.text, 'text-[10px] font-bold')}>
                                          {getInitials(contact.name)}
                                        </AvatarFallback>
                                      </Avatar>
                                      <div className="min-w-0 flex-1">
                                        <p className="text-xs font-semibold truncate text-foreground">
                                          {contact.name} {contact.surname || ''}
                                        </p>
                                        {contact.company && (
                                          <p className="text-[10px] text-muted-foreground truncate">
                                            {contact.company}
                                          </p>
                                        )}
                                      </div>
                                      <MessageSquare className="w-3.5 h-3.5 text-muted-foreground/40 opacity-0 group-hover:opacity-100 transition-opacity" />
                                    </div>
                                    {contact.tags && contact.tags.length > 0 && (
                                      <div className="flex flex-wrap gap-1 mt-2 ml-6">
                                        {contact.tags.slice(0, 2).map(tag => (
                                          <Badge key={tag} variant="secondary" className="text-[9px] h-4 px-1">
                                            {tag}
                                          </Badge>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                )}
                              </Draggable>
                            );
                          })}
                          {provided.placeholder}
                        </div>
                      </ScrollArea>
                    </CardContent>
                  )}
                </Droppable>
              </Card>
            </motion.div>
          );
        })}
      </div>
    </DragDropContext>
  );
}
