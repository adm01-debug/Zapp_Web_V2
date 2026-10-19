import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence, MotionConfig } from 'framer-motion';
import { useSchedule } from '@/hooks/schedule/useSchedule';
import { ScheduleEventCard } from '@/components/schedule/ScheduleEventCard';
import { CreateEventDialog } from '@/components/schedule/CreateEventDialog';
import { Button } from '@/shadcn/ui/button';
import { Plus, Calendar, ChevronLeft, ChevronRight } from 'lucide-react';
import type { ScheduleEvent } from '@/types/schedule';

export function ScheduleCalendarView() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<ScheduleEvent | null>(null);
  const { events, loading, refresh } = useSchedule(currentDate);

  const goPrevMonth = useCallback(() => {
    setCurrentDate(d => new Date(d.getFullYear(), d.getMonth() - 1, 1));
  }, []);

  const goNextMonth = useCallback(() => {
    setCurrentDate(d => new Date(d.getFullYear(), d.getMonth() + 1, 1));
  }, []);

  const handleCreateEvent = useCallback(() => {
    setSelectedEvent(null);
    setShowCreateDialog(true);
  }, []);

  const handleEditEvent = useCallback((event: ScheduleEvent) => {
    setSelectedEvent(event);
    setShowCreateDialog(true);
  }, []);

  const handleDialogClose = useCallback(() => {
    setShowCreateDialog(false);
    setSelectedEvent(null);
    refresh();
  }, [refresh]);

  const monthLabel = currentDate.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });

  return (
    <MotionConfig reducedMotion="user">
      <div className="p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <Calendar className="h-5 w-5 text-primary" />
            <h1 className="text-2xl font-bold capitalize">{monthLabel}</h1>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" onClick={goPrevMonth}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="icon" onClick={goNextMonth}>
              <ChevronRight className="h-m' ´ÐÜ´Ðˆ€¼ø(€€€€€€€€€€€€ð½	ÕÑÑ½¸ø(€€€€€€€€€€€€ñ	ÕÑÑ½¸½¹±¥¬õí¡…¹‘±•É•…Ñ•Ù•¹Ñôø(€€€€€€€€€€€€€€ñA±ÕÌ±…ÍÍ9…µ”ô‰ ´ÐÜ´ÐµÈ´Èˆ€¼ø(€€€€€€€€€€€€€9½Ù¼•Ù•¹Ñ¼(€€€€€€€€€€€€ð½	ÕÑÑ½¸ø(€€€€€€€€€€ð½‘¥Øø(€€€€€€€€ð½‘¥Øø(€€€€€€€í±½…‘¥¹œ€ü€ (€€€€€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰™±•à¥Ñ•µÌµ•¹Ñ•È©ÕÍÑ¥™äµ•¹Ñ•ÈÁä´ÄÈˆø(€€€€€€€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰…¹¥µ…Ñ”µÍÁ¥¸É½Õ¹‘•µ™Õ±° ´àÜ´à‰½É‘•Èµˆ´È‰½É‘•ÈµÁÉ¥µ…Éäˆ€¼ø(€€€€€€€€€€ð½‘¥Øø(€€€€€€€€¤€è€ (€€€€€€€€€€ñ¹¥µ…Ñ•AÉ•Í•¹”µ½‘”ô‰Á½ÁÕ±…Ñ”ˆø(€€€€€€€€€€€í•Ù•¹ÑÌ¹±•¹Ñ €ôôô€À€ü€ (€€€€€€€€€€€€€€ñµ½Ñ¥½¸¹‘¥Ø(€€€€€€€€€€€€€€€­•äô‰•µÁÑäˆ(€€€€€€€€€€€€€€€¥¹¥Ñ¥…°õíì½Á…¥Ñäè€Àõô(€€€€€€€€€€€€€€€…¹¥µ…Ñ”õíì½Á…¥Ñäè€Äõô(€€€€€€€€€€€€€€€±…ÍÍ9…µ”ô‰Ñ•áÐµ•¹Ñ•ÈÁä´ÄÈÑ•áÐµµÕÑ•µ™½É•É½Õ¹ˆ(€€€€€€€€€€€€€€ø(€€€€€€€€€€€€€€€9•¹¡Õ´•Ù•¹Ñ¼¹•ÍÑ”·©Ì(€€€€€€€€€€€€€€ð½µ½Ñ¥½¸¹‘¥Øø(€€€€€€€€€€€€¤€è€ (€€€€€€€€€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰É¥É¥µ½±Ì´ÄµéÉ¥µ½±Ì´È±œéÉ¥µ½±Ì´Ì…À´Ðˆø(€€€€€€€€€€€€€€€í•Ù•¹ÑÌ¹µ…À ¡•Ù•¹Ð¤€ôø€ (€€€€€€€€€€€€€€€€€€ñµ½Ñ¥½¸¹‘¥Ø(€€€€€€€€€€€€€€€€€€€­•äõí•Ù•¹Ð¹¥‘ô(€€€€€€€€€€€€€€€€€€€¥¹¥Ñ¥…°õíì½Á…¥Ñäè€À°äè€ÈÀõô(€€€€€€€€€€€€€€€€€€€…¹¥µ…Ñ”õíì½Á…¥Ñäè€Ä°äè€Àõô(€€€€€€€€€€€€€€€€€€ø(€€€€€€€€€€€€€€€€€€€€ñM¡•‘Õ±•Ù•¹Ñ…É(€€€€€€€€€€€€€€€€€€€€€•Ù•¹Ðõí•Ù•¹Ñô(€€€€€€€€€€€€€€€€€€€€€½¹‘¥Ðõì ¤€ôø¡…¹‘±•‘¥ÑÙ•¹Ð¡•Ù•¹Ð¥ô(€€€€€€€€€€€€€€€€€€€€¼ø(€€€€€€€€€€€€€€€€€€ð½µ½Ñ¥½¸¹‘¥Øø(€€€€€€€€€€€€€€€€¤¥ô(€€€€€€€€€€€€€€ð½‘¥Øø(€€€€€€€€€€€€¤ô(€€€€€€€€€€ð½¹¥µ…Ñ•AÉ•Í•¹”ø(€€€€€€€€¥ô(€€€€€€ð½‘¥Øø(€€€€€€ñÉ•…Ñ•Ù•¹Ñ¥…±½œ(€€€€€€€½Á•¸õíÍ¡½ÝÉ•…Ñ•¥…±½ô(€€€€€€€½¹±½Í”õí¡…¹‘±•¥…±½±½Í•ô(€€€€€€€•Ù•¹ÐõíÍ•±•Ñ•‘Ù•¹Ñô(€€€€€€¼ø(€€€€ð½5½Ñ¥½¹½¹™¥œø(€€¤ì)ô(