import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { log } from '@/lib/logger';
import { CheckCircle2, Sparkles, ChevronDown, ChevronUp, ArrowRight, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/auth/useAuth';
import { CHECKLIST_STEPS } from './checklistSteps';
import type { ChecklistStep } from './checklistSteps';

interface OnboardingChecklistProps {
  onNavigate?: (view: string) => void;
  onDismiss?: () => void;
  compact?: boolean;
}

export function OnboardingChecklist({ onNavigate, onDismiss, compact = false }: OnboardingChecklistProps) {
  const { user } = useAuth();
  const [completedSteps, setCompletedSteps] = useState<string[]>([]);
  const [isExpanded, setIsExpanded] = useState(true);

  useEffect(() => {
    if (!isExpanded) return;
    const timer = setTimeout(() => setIsExpanded(false), 8000);
    return () => clearTimeout(timer);
  }, [isExpanded]);

  const [isLoading, setIsLoading] = useState(true);
  const [isDismissed, setIsDismissed] = useState(false);

  useEffect(() => {
    if (!user) return;
    const checkAllSteps = async () => {
      setIsLoading(true);
      const completed: string[] = [];
      for (const step of CHECKLIST_STEPS) {
        try { if (await step.checkCondition()) completed.push(step.id); }
        catch (error) { log.error(`Error checking step ${step.id}:`, error); }
      }
      setCompletedSteps(completed);
      setIsLoading(false);
    };
    try { if (localStorage.getItem(`checklist_dismissed_${user.id}`) === 'true') setIsDismissed(true); } catch (e) { log.warn('localStorage unavailable for checklist:', e); }
    checkAllSteps();
  }, [user]);

  const handleDismiss = () => {
    if (user) { try { localStorage.setItem(`checklist_dismissed_${user.id}`, 'true'); } catch { /* storage unavailable */ } }
    setIsDismissed(true);
    onDismiss?.();
  };

  const handleStepAction = (step: ChecklistStep) => {
    if (step.actionRoute && onNavigate) onNavigate(step.actionRoute);
  };

  const progress = (completedSteps.length / CHECKLIST_STEPS.length) * 100;
  const allComplete = completedSteps.length === CHECKLIST_STEPS.length;

  if (isDismissed || allComplete || isLoading) return null;

  if (compact) {
    return (
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
        className="bg-gradient-to-r from-primary/10 to-secondary/10 border border-primary/20 rounded-xl p-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center"><Sparkles className="w-5 h-5 text-primary" /></div>
            <div><p className="font-medium text-sm">Configure sua conta</p><p className="text-xs text-muted-foreground">{completedSteps.length}/{CHECKLIST_STEPS.length} passos concluídos</p></div>
          </div>
          <div className="flex items-center gap-2">
            <Progress value={progress} className="w-24 h-2" />
            <Button size="sm" variant="ghost" onClick={handleDismiss}><X className="w-4 h-4" /></Button>
          </div>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="relative">
      <Card className="border-primary/20 bg-gradient-to-br from-card to-primary/5 overflow-hidden">
        <div className="absolute top-0 right-0 w-32 h-32 bg-primary/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
        <div className="absolute bottom-0 left-0 w-24 h-24 bg-secondary/10 rounded-full blur-2xl translate-y-1/2 -translate-x-1/2" />
        <CardHeader className="relative z-10 pb-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <motion.div animate={{ rotate: [0, 10, -10, 0] }} transition={{ duration: 2, repeat: Infinity }}
                className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-secondary flex items-center justify-center shadow-lg">
                <Sparkles className="w-5 h-5 text-primary-foreground" />
              </motion.div>
              <div><CardTitle className="text-lg">Configure sua conta</CardTitle><p className="text-sm text-muted-foreground">{completedSteps.length} de {CHECKLIST_STEPS.length} passos concluídos</p></div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="icon" onClick={() => setIsExpanded(!isExpanded)} className="h-8 w-8">{isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}</Button>
              <Button variant="ghost" size="icon" onClick={handleDismiss} className="h-8 w-8"><X className="w-4 h-4" /></Button>
            </div>
          </div>
          <div className="mt-4"><Progress value={progress} className="h-2" /></div>
        </CardHeader>
        <AnimatePresence>
          {isExpanded && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }}>
              <CardContent className="relative z-10 pt-2">
                <div className="space-y-2">
                  {CHECKLIST_STEPS.map((step, index) => {
                    const isComplete = completedSteps.includes(step.id);
                    const Icon = step.icon;
                    return (
                      <motion.div key={step.id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: index * 0.05 }}
                        className={cn("flex items-center gap-3 p-3 rounded-xl transition-all", isComplete ? "bg-success/10 border border-success/20" : "bg-muted/30 border border-transparent hover:border-primary/20 hover:bg-muted/50")}>
                        <div className={cn("w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0", isComplete ? "bg-success/20" : "bg-primary/10")}>
                          {isComplete ? <CheckCircle2 className="w-5 h-5 text-success" /> : <Icon className="w-4 h-4 text-primary" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className={cn("font-medium text-sm", isComplete && "line-through text-muted-foreground")}>{step.title}</p>
                          <p className="text-xs text-muted-foreground truncate">{step.description}</p>
                        </div>
                        {!isComplete && (
                          <Button size="sm" variant="ghost" className="flex-shrink-0 gap-1 text-primary hover:text-primary hover:bg-primary/10" onClick={() => handleStepAction(step)}>
                            {step.action}<ArrowRight className="w-3 h-3" />
                          </Button>
                        )}
                      </motion.div>
                    );
                  })}
                </div>
              </CardContent>
            </motion.div>
          )}
        </AnimatePresence>
      </Card>
    </motion.div>
  );
}
