export interface AgentStats {
  id: string;
  profile_id: string;
  xp: number;
  level: number;
  current_streak: number;
  best_streak: number;
  messages_sent: number;
  messages_received: number;
  conversations_resolved: number;
  achievements_count: number;
  avg_response_time_seconds: number | null;
  customer_satisfaction_score: number | null;
}

export interface Achievement {
  id: string;
  profile_id: string;
  achievement_type: string;
  achievement_name: string;
  achievement_description: string | null;
  xp_earned: number;
  earned_at: string;
}

export const ACHIEVEMENT_TYPES = {
  FAST_RESPONSE: 'fast_response',
  SPEED_DEMON: 'speed_demon',
  STREAK: 'streak',
  STREAK_MASTER: 'streak_master',
  RESOLUTION: 'resolution',
  PERFECT_RATING: 'perfect_rating',
  LEVEL_UP: 'level_up',
  DAILY_GOAL: 'daily_goal',
  FIRST_MESSAGE: 'first_message',
  FIRST_RESOLUTION: 'first_resolution',
  MESSAGE_MILESTONE: 'message_milestone',
  TEAM_PLAYER: 'team_player',
} as const;
