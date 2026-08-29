import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, isSameMonth, addMonths, subMonths, startOfWeek, endOfWeek } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  Clock,
  MessageSquare,
  User,
  X,
  Image,
  File,
  Mic,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useScheduledMessages, ScheduledMessage } from '@/hooks/chat/useScheduledMessages';
import { useAgents } from '@/hooks/crm/useAgents';

interface ScheduleCalendarViewProps {
  onSelectMessage?: (message: ScheduledMessage) => void;
}

export function ScheduleCalendarView({ onSelectMessage }: ScheduleCalendarViewProps) {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedAgent, setSelectedAgent] = useState<string>('all');
  const { messages, isLoading, cancelMessage } = useScheduledMessages();
  const { agents } = useAgents();

  const pendingMessages = useMemo(() => {
    let filtered = messages.filter(m => m.status === 'pending');
    if (selectedAgent !== 'all') {
      filtered = filtered.filter(m => m.created_by === selectedAgent);
    }
    return filtered;
  }, [messages, selectedAgent]);

  // Calculate calendar days
  const calendarDays = useMemo(() => {
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(currentMonth);
    const calendarStart = startOfWeek(monthStart, { locale: ptBR });
    const calendarEnd = endOfWeek(monthEnd, { locale: ptBR });
    return eachDayOfInterval({ start: calendarStart, end: calendarEnd });
  }, [currentMonth]);

  // Group messages by date
  const messagesByDate = useMemo(() => {
    const grouped: Record<string, ScheduledMessage[]> = {};
    pendingMessages.forEach(msg => {
      const dateKey = format(new Date(msg.scheduled_at), 'yyyy-MM-dd');
      if (!grouped[dateKey]) grouped[dateKey] = [];
      grouped[dateKey].push(msg);
    });
    return grouped;
  }, [pendingMessages]);

  const selectedDateMessages = useMemo(() => {
    if (!selectedDate) return [];
    const dateKey = format(selectedDate, 'yyyy-MM-dd');
    return messagesByDate[dateKey] || [];
  }, [selectedDate, messagesByDate]);

  const getMessageIcon = (type: string) => {
    switch (type) {
      case 'image': return <Image className="w-3 h-3" />;
      case 'audio': return <Mic className="w-3 h-3" />;
      case 'document': return <File className="w-3 h-3" />;
      default: return <MessageSquare className="w-3 h-3" />;
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-8 w-48" />
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-7 gap-1">
            {Array.from({ length: 35 }).map((_, i) => (
              <Skeleton key={i} className="h-20" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card className="overflow-hidden">
        <CardHeader className="border-b border-border/50">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Calendar className="w-5 h-5 text-primary" />
              <CardTitle>Calendário de Agendamentos</CardTitle>
              <Badge variant="secondary">{pendingMessages.length} pendentes</Badge>
            </div>
            
            <div className="flex items-center gap-2">
              {/* Agent filter */}
              <Select value={selectedAgent} onValueChange={setSelectedAgent}>
                <SelectTrigger className="w-[180px]">
                  <User className="w-4 h-4 mr-2" />
                  <SelectValue placeholder="Todos os agentes" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os agentes</SelectItem>
                  {agents?.map(agent => (
                    <SelectItem key={agent.id} value={agent.id}>
                      {agent.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Month navigation */}
              <div className="flex items-center gap-1">
                <Button 
                  variant="ghost" 
                  size="icon"
                  onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
                >
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <span className="text-sm font-medium w-32 text-center">
                  {format(currentMonth, 'MMMM yyyy', { locale: ptBR })}
                </span>
                <Button 
                  variant="ghost" 
                  size="icon"
                  onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
                >
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-4">
          {/* Weekday headers */}
          <div className="grid grid-cols-7 gap-1 mb-2">
            {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map(day => (
              <div 
                key={day} 
                className="h-8 flex items-center justify-center text-xs font-medium text-muted-foreground"
              >
                {day}
              </div>
            ))}
          </div>

          {/* Calendar grid */}
          <div className="grid grid-cols-7 gap-1">
            {calendarDays.map(day => {
              const dateKey = format(day, 'yyyy-MM-dd');
              const dayMessages = messagesByDate[dateKey] || [];
              const isCurrentMonth = isSameMonth(day, currentMonth);
              const isToday = isSameDay(day, new Date());
              const isSelected = selectedDate && isSameDay(day, selectedDate);

              return (
                <motion.button
                  key={dateKey}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => setSelectedDate(day)}
                  className={cn(
                    "h-20 p-1 rounded-lg border transition-all text-left flex flex-col",
                    isCurrentMonth ? "bg-card" : "bg-muted/30 opacity-50",
                    isToday && "border-primary/50",
                    isSelected && "ring-2 ring-primary border-primary",
                    dayMessages.length > 0 && "border-secondary/50 bg-secondary/5",
                    !isCurrentMonth && "pointer-events-none"
                  )}
                >
                  <span className={cn(
                    "text-xs font-medium",
                    isToday && "text-primary font-bold",
                    !isCurrentMonth && "text-muted-foreground"
                  )}>
                    {format(day, 'd')}
                  </span>
                  
                  {dayMessages.length > 0 && (
                    <div className="flex-1 flex flex-col gap-0.5 mt-1 overflow-hidden">
                      {dayMessages.slice(0, 3).map((msg, i) => (
                        <div 
                          key={msg.id}
                          className="flex items-center gap-1 text-[10px] text-secondary truncate"
                        >
                          <Clock className="w-2.5 h-2.5 shrink-0" />
                          <span>{format(new Date(msg.scheduled_at), 'HH:mm')}</span>
                        </div>
                      ))}
                      {dayMessages.length > 3 && (
                        <span className="text-[10px] text-muted-foreground">
                          +{dayMessages.length - 3} mais
                        </span>
                      )}
                    </div>
                  )}
                </motion.button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Selected date detail dialog */}
      <Dialog open={!!selectedDate && selectedDateMessages.length > 0} onOpenChange={() => setSelectedDate(null)}>
        <DialogContent aria-describedby={undefined} className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Calendar className="w-5 h-5 text-primary" />
              {selectedDate && format(selectedDate, "EEEE, d 'de' MMMM", { locale: ptBR })}
            </DialogTitle>
          </DialogHeader>

          <ScrollArea className="max-h-[400px]">
            <div className="space-y-3">
              <AnimatePresence>
                {selectedDateMessages.map((msg, index) => (
                  <motion.div
                    key={msg.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ delay: index * 0.05 }}
                    className="p-3 rounded-lg border bg-card hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <Clock className="w-4 h-4 text-primary" />
                          <span className="font-medium">
                            {format(new Date(msg.scheduled_at), 'HH:mm')}
                          </span>
                          <Badge variant="outline" className="gap-1 text-xs">
                            {getMessageIcon(msg.message_type)}
                            {msg.message_type}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground line-clamp-2">
                          {msg.content}
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="shrink-0 text-destructive hover:text-destructive"
                        onClick={() => cancelMessage(msg.id)}
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </>
  );
}
