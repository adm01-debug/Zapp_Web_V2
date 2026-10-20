import React, { createContext, useContext, useState, useCallback, ReactNode, useEffect } from 'react';
import { AchievementToast, AchievementType } from './AchievementToast';
import { useAgentGamification, ACHIEVEMENT_TYPES, calculateLevel } from '@/hooks/gamification/useAgentGamification';
import { log } from '@/lib/logger';

interface Achievement {
  type: AchievementType;
  message: string;
  xpReward?: number;
}

interface GamificationContextType {
  showAchievement: (type: AchievementType, message: string, xpReward?: number) => void;
  triggerFastResponse: (seconds: number) => Promise<void>;
  triggerStreak: (count: number) => Promise<void>;
  triggerResolution: () => Promise<void>;
  triggerPerfectRating: () => Promise<void>;
  triggerLevelUp: (level: number) => Promise<void>;
  triggerDailyGoal: (goal: string) => Promise<void>;
  triggerMessageSent: () => Promise<void>;
  triggerMessageReceived: () => Promise<void>;
  stats: {
    xp: number;
    level: number;
    streak: number;
    messagesHandled: number;
    resolutions: number;
    achievementsCount: number;
  } | null;
  isLoading: boolean;
}

const noopAsync = async () => {};

/** Lightweight stub returned when no provider is mounted */
const NOOP_CONTEXT: GamificationContextType = {
  showAchievement: () => {},
  triggerFastResponse: noopAsync,
  triggerStreak: noopAsync,
  triggerResolution: noopAsync,
  triggerPerfectRating: noopAsync,
  triggerLevelUp: noopAsync,
  triggerDailyGoal: noopAsync,
  triggerMessageSent: noopAsync,
  triggerMessageReceived: noopAsync,
  stats: null,
  isLoading: false,
};

const GamificationContext = createContext<GamificationContextType>(NOOP_CONTEXT);

export function GamificationProvider({ children }: { children: ReactNode }) {
  const [currentAchievement, setCurrentAchievement] = useState<Achievement | null>(null);
  const [queue, setQueue] = useState<Achievement[]>([]);
  
  const {
    stats: dbStats,
    isLoading,
    grantAchievement,
    updateStreak,
    incrementMessages,
    incrementResolutions,
    addXp,
  } = useAgentGamification();

  const stats = dbStats ? {
    xp: dbStats.xp,
    level: dbStats.level,
    streak: dbStats.current_streak,
    messagesHandled: dbStats.messages_sent + dbStats.messages_received,
    resolutions: dbStats.conversations_resolved,
    achievementsCount: dbStats.achievements_count,
  } : null;

  const processQueue = useCallback(() => {
    if (queue.length > 0 && !currentAchievement) {
      const [next, ...rest] = queue;
      setCurrentAchievement(next);
      setQueue(rest);
    }
  }, [queue, currentAchievement]);

  const showAchievement = useCallback((type: AchievementType, message: string, xpReward?: number) => {
    const achievement = { type, message, xpReward };
    if (!currentAchievement) {
      setCurrentAchievement(achievement);
    } else {
      setQueue(prev => [...prev, achievement]);
    }
  }, [currentAchievement]);

  const handleClose = useCallback(() => {
    setCurrentAchievement(null);
    setTimeout(processQueue, 300);
  }, [processQueue]);

  const triggerFastResponse = useCallback(async (seconds: number) => {
    try {
      let xpReward = 0;
      let dbType: string = ACHIEVEMENT_TYPES.FAST_RESPONSE;
      let toastType: AchievementType = 'fast_response';
      let message = '';
      let name = '';

      if (seconds <= 30) {
        xpReward = 50; dbType = ACHIEVEMENT_TYPES.SPEED_DEMON; toastType = 'speed_demon';
        message = `Incrível! Respondeu em ${seconds}s!`; name = 'Speed Demon';
      } else if (seconds <= 60) {
        xpReward = 30; toastType = 'fast_response';
        message = `Excelente! Respondeu em menos de 1 minuto!`; name = 'Resposta Rápida';
      } else if (seconds <= 120) {
        xpReward = 20; toastType = 'fast_response';
        message = `Parabéns! Respondeu em menos de 2 minutos!`; name = 'Resposta Rápida';
      } else { return; }

      await grantAchievement({ type: dbType, name, description: message, xpReward });
      showAchievement(toastType, message, xpReward);
    } catch (error) {
      log.error('Error triggering fast response achievement:', error);
      if (seconds <= 30) showAchievement('speed_demon', `Incrível! Respondeu em ${seconds}s!`, 50);
      else if (seconds <= 60) showAchievement('fast_response', `Excelente! Respondeu em menos de 1 minuto!`, 30);
    }
  }, [grantAchievement, showAchievement]);

  const triggerStreak = useCallback(async (count: number) => {
    try {
      let xpReward = 0, message = '', name = '';
      if (count >= 10) { xpReward = 100; message = `Streak de ${count}! Você está on fire! 🔥`; name = 'Streak Master'; }
      else if (count >= 5) { xpReward = 50; message = `${count} respostas seguidas! Continue assim!`; name = 'Streak'; }
      else if (count >= 3) { xpReward = 25; message = `Streak de ${count}! Mandando bem!`; name = 'Mini Streak'; }
      else return;
      await grantAchievement({ type: count >= 10 ? ACHIEVEMENT_TYPES.STREAK_MASTER : ACHIEVEMENT_TYPES.STREAK, name, description: message, xpReward });
      showAchievement('streak', message, xpReward);
    } catch (error) { log.error('Error triggering streak achievement:', error); }
  }, [grantAchievement, showAchievement]);

  const triggerResolution = useCallback(async () => {
    try {
      await incrementResolutions();
      await grantAchievement({ type: ACHIEVEMENT_TYPES.RESOLUTION, name: 'Problema Resolvido', description: 'Cliente satisfeito! Problema resolvido!', xpReward: 40 });
      showAchievement('resolution', 'Cliente satisfeito! Problema resolvido!', 40);
    } catch (error) { log.error('Error triggering resolution achievement:', error); }
  }, [incrementResolutions, grantAchievement, showAchievement]);

  const triggerPerfectRating = useCallback(async () => {
    try {
      await grantAchievement({ type: ACHIEVEMENT_TYPES.PERFECT_RATING, name: 'Avaliação Perfeita', description: 'O cliente deu nota máxima! ⭐⭐⭐⭐⭐', xpReward: 75 });
      showAchievement('perfect_rating', 'O cliente deu nota máxima! ⭐⭐⭐⭐⭐', 75);
    } catch (error) { log.error('Error triggering perfect rating achievement:', error); }
  }, [grantAchievement, showAchievement]);

  const triggerLevelUp = useCallback(async (level: number) => {
    try {
      await grantAchievement({ type: ACHIEVEMENT_TYPES.LEVEL_UP, name: `Nível ${level}`, description: `Você alcançou o Nível ${level}!`, xpReward: 100 });
      showAchievement('level_up', `Você alcançou o Nível ${level}!`, 100);
    } catch (error) { log.error('Error triggering level up achievement:', error); }
  }, [grantAchievement, showAchievement]);

  const triggerDailyGoal = useCallback(async (goal: string) => {
    try {
      await grantAchievement({ type: ACHIEVEMENT_TYPES.DAILY_GOAL, name: 'Meta Diária', description: `Meta "${goal}" concluída!`, xpReward: 60 });
      showAchievement('daily_goal', `Meta "${goal}" concluída!`, 60);
    } catch (error) { log.error('Error triggering daily goal achievement:', error); }
  }, [grantAchievement, showAchievement]);

  const triggerMessageSent = useCallback(async () => {
    try {
      const result = await incrementMessages('sent');
      await updateStreak(true);
      const totalMessages = result.newSent + (dbStats?.messages_received || 0);
      if ([10, 50, 100, 500, 1000].includes(totalMessages)) {
        await grantAchievement({ type: ACHIEVEMENT_TYPES.MESSAGE_MILESTONE, name: `${totalMessages} Mensagens`, description: `Você enviou/recebeu ${totalMessages} mensagens!`, xpReward: Math.min(100, totalMessages / 10) });
        showAchievement('fast_response', `Marco atingido: ${totalMessages} mensagens!`, Math.min(100, totalMessages / 10));
      }
    } catch (error) { log.error('Error tracking message sent:', error); }
  }, [incrementMessages, updateStreak, grantAchievement, showAchievement, dbStats]);

  const triggerMessageReceived = useCallback(async () => {
    try { await incrementMessages('received'); } catch (error) { log.error('Error tracking message received:', error); }
  }, [incrementMessages]);

  useEffect(() => {
    if (dbStats) {
      const currentLevel = dbStats.level;
      const calculatedLevel = calculateLevel(dbStats.xp);
      if (calculatedLevel > currentLevel) triggerLevelUp(calculatedLevel);
    }
  }, [dbStats?.xp]);

  return (
    <GamificationContext.Provider
      value={{
        showAchievement, triggerFastResponse, triggerStreak, triggerResolution,
        triggerPerfectRating, triggerLevelUp, triggerDailyGoal, triggerMessageSent,
        triggerMessageReceived, stats, isLoading,
      }}
    >
      {children}
      {currentAchievement && (
        <AchievementToast
          type={currentAchievement.type}
          message={currentAchievement.message}
          xpReward={currentAchievement.xpReward}
          isVisible={true}
          onClose={handleClose}
        />
      )}
    </GamificationContext.Provider>
  );
}

/**
 * Returns gamification context. Safe to call outside the provider — returns no-op stubs.
 */
export function useGamification() {
  return useContext(GamificationContext);
}
