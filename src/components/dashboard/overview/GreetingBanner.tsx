import { Zap, Star, Flame } from 'lucide-react';
import { motion, useReducedMotion } from 'framer-motion';
import { useAuth } from '@/hooks/auth/useAuth';
import { getInitials, getAvatarColor } from '@/lib/avatar-colors';
import { useAgentGamification, levelProgress, xpForNextLevel } from '@/hooks/gamification/useAgentGamification';
import { cn } from '@/lib/utils';

const MOTIVATION_PHRASES = [
  'Disciplina hoje, resultados amanhã.',
  'Cada conversa é uma oportunidade.',
  'Constância vence intensidade.',
  'Um passo de cada vez, sempre em frente.',
  'Excelência é hábito, não acidente.',
  'Foco no cliente, resultado garantido.',
  'Hoje é um bom dia para superar ontem.',
] as const;

function dayOfYear(date: Date): number {
  const start = new Date(date.getFullYear(), 0, 0);
  const diff = date.getTime() - start.getTime();
  return Math.floor(diff / 86400000);
}

export function GreetingBanner() {
  const { profile } = useAuth();
  const { stats } = useAgentGamification();
  const reducedMotion = useReducedMotion();

  const now = new Date();
  const hour = now.getHours();
  const greetingText = hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite';
  const userName = profile?.name?.split(' ')[0] || '';
  const greeting = userName ? `${greetingText}, ${userName}! 👋` : `${greetingText}! 👋`;
  const phrase = MOTIVATION_PHRASES[dayOfYear(now) % MOTIVATION_PHRASES.length];

  const name = profile?.name ?? 'Usuário';
  const { bg, text } = getAvatarColor(name);
  const progress = stats ? levelProgress(stats.xp, stats.level) : 0;
  const nextLevelXp = stats ? xpForNextLevel(stats.level) : 0;

  return (
    <div className="min-h-[73px] h-auto md:h-[73px] rounded-xl bg-card-elevated border border-border/70 px-4 py-3 md:py-0 flex flex-col md:flex-row md:items-center gap-3 md:gap-4">
      <div className="flex items-center gap-3 shrink-0">
        {profile?.avatar_url ? (
          <img src={profile.avatar_url} alt={name} className="w-11 h-11 rounded-full object-cover shrink-0" data-testid="banner-avatar" />
        ) : (
          <span
            data-testid="banner-avatar"
            className={cn('w-11 h-11 rounded-full flex items-center justify-center text-[14px] font-semibold shrink-0', bg, text)}
          >
            {getInitials(name)}
          </span>
        )}
        <div className="min-w-0">
          <p className="text-xl font-bold text-foreground leading-tight truncate">{greeting}</p>
          <p className="text-[12px] text-foreground-secondary">Aqui está o resumo da sua operação hoje.</p>
        </div>
      </div>

      {stats && (
        <>
          <div className="hidden md:block w-px h-9 bg-border shrink-0" />
          <div className="flex items-center gap-2.5 shrink-0">
            <div data-testid="level-tile" className="w-[34px] h-[34px] rounded-lg bg-primary flex items-center justify-center shrink-0">
              <span className="text-[14px] font-bold text-white">{stats.level}</span>
            </div>
            <div className="min-w-0">
              <p className="text-[13px] font-semibold text-foreground">Nível {stats.level}</p>
              <div className="h-1.5 w-[180px] rounded-full bg-muted/60 overflow-hidden mt-1">
                <motion.div
                  className="h-full rounded-full bg-primary"
                  initial={{ width: 0 }}
                  animate={{ width: `${progress}%` }}
                  transition={reducedMotion ? { duration: 0 } : { duration: 0.5 }}
                />
              </div>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {stats.xp.toLocaleString('pt-BR')} / {nextLevelXp.toLocaleString('pt-BR')} XP
                <span className="text-[11px] font-semibold text-foreground ml-1">{Math.round(progress)}%</span>
              </p>
            </div>
          </div>

          <div className="hidden lg:block w-px h-9 bg-border shrink-0" />
          <div className="flex flex-wrap items-center gap-1.5 shrink-0">
            <span data-testid="gami-chip" className="h-[30px] px-3 rounded-lg text-[12px] font-semibold flex items-center gap-1.5 bg-[hsl(224_85%_29%)] text-[hsl(217_100%_80%)]">
              <Zap className="w-3.5 h-3.5" />
              {stats.xp.toLocaleString('pt-BR')} XP
            </span>
            <span data-testid="gami-chip" title="Conquistas" className="h-[30px] px-3 rounded-lg text-[12px] font-semibold flex items-center gap-1.5 bg-dash-tile-amber text-dash-amber">
              <Star className="w-3.5 h-3.5" />
              {stats.achievements_count}
            </span>
            <span data-testid="gami-chip" title="Dias seguidos" className="h-[30px] px-3 rounded-lg text-[12px] font-semibold flex items-center gap-1.5 bg-[hsl(354_48%_23%)] text-dash-red">
              <Flame className="w-3.5 h-3.5" />
              {stats.current_streak}
            </span>
          </div>
        </>
      )}

      <div className="hidden xl:block w-px h-9 bg-border shrink-0" />
      <p className="hidden xl:block text-[12px] text-foreground-secondary max-w-[220px] leading-snug">{phrase}</p>
    </div>
  );
}
