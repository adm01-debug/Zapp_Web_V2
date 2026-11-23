import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  MessageSquare,
  GripVertical,
  KanbanSquare,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { invalidateContactsAggregates } from '@/hooks/crm/contactsAggregates';
import { toast } from 'sonner';
import { ORDERED_CONTACT_TYPE_CONFIGS } from './contactTypeOrder';
import { ContactPortrait } from './ContactPortrait';
import type { Contact } from './types';

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

const KANBAN_COLUMNS = ORDERED_CONTACT_TYPE_CONFIGS.map(c => ({
  type: c.type, label: c.pluralLabel, color: c.color, icon: c.Icon,
}));

export function ContactKanbanView({ contacts, onContactClick }: ContactKanbanViewProps) {
  const queryClient = useQueryClient();
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
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => { isMountedRef.current = false; };
  }, []);

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
        // Drag em voo mantem o otimista; confirmacao pendente mantem o valor
        // que o servidor ja aceitou — este snapshot foi capturado antes do
        // write e mostraria a coluna antiga.
        if (inFlightDrags.current.has(server.id)) {
          return { ...server, contact_type: local.contact_type };
        }
        const known = confirmedTypes.current.get(server.id);
        if (known?.pending) {
          return { ...server, contact_type: known.type };
        }
        return server;
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

    // Todo update que o banco aceitou muda o tipo, mesmo se superado por um drag
    // posterior (que pode falhar e deixar este como o valor final): KPIs,
    // contadores por tipo e a lista (contacts-search) precisam refletir, entao
    // invalida antes do token.
    if (!error) {
      invalidateContactsAggregates(queryClient);
      queryClient.invalidateQueries({ queryKey: ['contacts-search'] });
    }

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
      if (isMountedRef.current) {
        setLocalContacts(prev =>
          prev.map(c => c.id === draggableId ? { ...c, contact_type: serverType } : c)
        );
      }
      toast.error('Erro ao mover contato');
    } else {
      confirmedTypes.current.set(draggableId, { type: newType, pending: true });
      const col = KANBAN_COLUMNS.find(c => c.type === newType);
      toast.success(`Movido para ${col?.label || newType}`);
    }
  }, [localContacts, queryClient]);

  const isEmpty = localContacts.length === 0;

  // ZD-090 — mesma casca das outras visões extras do design: `.zc-alt-view`
  // (cartão de 22px com título Outfit 22px e legenda) e `.zc-pipeline` em três
  // colunas que caem para duas e uma nos breakpoints. O arrastar-e-soltar e o
  // ScrollArea de cada lane continuam os mesmos.
  return (
    <DragDropContext onDragEnd={handleDragEnd}>
      <div
        data-testid="contact-kanban-view"
        className="min-h-[430px] rounded-[12px] border border-[hsl(var(--contacts-line))] bg-[hsl(var(--contacts-panel))] p-[22px] max-[659px]:p-4"
      >
        <header className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <KanbanSquare className="h-[18px] w-[18px] text-[hsl(var(--contacts-blue))]" aria-hidden="true" />
          <h3 className="m-0 font-display text-[22px] font-medium leading-[1.2] tracking-[-.3px] text-[hsl(var(--contacts-ink))] max-[899px]:text-[19px]">
            Pipeline
          </h3>
        </header>
        <p className="mb-[23px] mt-[7px] text-xs text-[hsl(var(--contacts-quiet))]">
          Contatos agrupados por tipo; arraste o card para mudar a etapa comercial.
        </p>

        {isEmpty ? (
          <div
            data-testid="contact-kanban-empty"
            className="flex min-h-[300px] flex-col items-center justify-center gap-[10px] rounded-[12px] border border-[hsl(var(--contacts-line))] bg-[hsl(var(--contacts-raised))] px-5 py-[35px] text-center text-xs text-[hsl(var(--contacts-muted))]"
          >
            <KanbanSquare className="h-6 w-6 text-[hsl(var(--contacts-quiet))]" aria-hidden="true" />
            <p className="m-0 font-display text-base font-medium text-[hsl(var(--contacts-ink))]">
              Sem etapa comercial
            </p>
            <p className="m-0 max-w-xs text-xs">Nenhum contato para distribuir nas etapas nesta página.</p>
          </div>
        ) : (
          <div className="grid grid-cols-3 items-start gap-[13px] max-[899px]:grid-cols-2 max-[659px]:grid-cols-1">
            {columns.map((column) => {
              const Icon = column.icon;
              return (
                <section
                  key={column.type}
                  className="rounded-[10px] border border-[hsl(var(--contacts-line))] bg-[hsl(var(--contacts-raised))] p-3"
                >
                  <h4 className="m-0 mb-[14px] flex items-center gap-[7px] text-xs font-medium text-[hsl(var(--contacts-ink))]">
                    <Icon className="h-[13px] w-[13px]" style={{ color: column.color }} aria-hidden="true" />
                    <span className="min-w-0 truncate">{column.label}</span>
                    <span className="ml-auto shrink-0 tabular-nums text-2xs text-[hsl(var(--contacts-quiet))]">
                      · {column.contacts.length}
                    </span>
                  </h4>
                  <Droppable droppableId={column.type}>
                    {(provided, snapshot) => (
                      <div
                        ref={provided.innerRef}
                        {...provided.droppableProps}
                        className={cn(
                          'min-h-[100px] rounded-[8px] transition-colors',
                          snapshot.isDraggingOver && 'bg-[hsl(var(--contacts-blue)/0.08)]',
                        )}
                      >
                        <ScrollArea className="max-h-[60vh]">
                          <div className="space-y-2">
                            {column.contacts.map((contact, i) => (
                              <Draggable key={contact.id} draggableId={contact.id} index={i}>
                                {(dragProvided, dragSnapshot) => (
                                  <div
                                    ref={dragProvided.innerRef}
                                    {...dragProvided.draggableProps}
                                    className={cn(
                                      'group mb-2 flex w-full cursor-pointer items-center gap-[10px] rounded-[8px] border text-left text-xs',
                                      'border-[hsl(var(--contacts-line))] bg-[hsl(var(--contacts-panel))] p-[9px]',
                                      'text-[hsl(var(--contacts-ink))] transition-colors hover:border-[hsl(221_83%_53%/0.45)]',
                                      dragSnapshot.isDragging && 'rotate-1 shadow-lg',
                                    )}
                                    onClick={() => !dragSnapshot.isDragging && onContactClick(contact.id)}
                                  >
                                    <div
                                      {...dragProvided.dragHandleProps}
                                      className="shrink-0 cursor-grab text-[hsl(var(--contacts-quiet))] opacity-0 transition-opacity group-hover:opacity-70 active:cursor-grabbing"
                                    >
                                      <GripVertical className="h-[13px] w-[13px]" aria-hidden="true" />
                                    </div>
                                    <ContactPortrait contact={contact as unknown as Contact} className="h-[41px] w-[35px] shrink-0 rounded-[5px]" />
                                    <span className="grid min-w-0 flex-1 gap-[2px]">
                                      <span className="truncate font-medium">
                                        {contact.name} {contact.surname || ''}
                                      </span>
                                      <small className="truncate text-2xs text-[hsl(var(--contacts-muted))]">
                                        {contact.company || 'Empresa não informada'}
                                      </small>
                                    </span>
                                    <MessageSquare
                                      className="h-[13px] w-[13px] shrink-0 text-[hsl(var(--contacts-quiet))] opacity-0 transition-opacity group-hover:opacity-100"
                                      aria-hidden="true"
                                    />
                                  </div>
                                )}
                              </Draggable>
                            ))}
                            {provided.placeholder}
                          </div>
                        </ScrollArea>
                      </div>
                    )}
                  </Droppable>
                </section>
              );
            })}
          </div>
        )}
      </div>
    </DragDropContext>
  );
}