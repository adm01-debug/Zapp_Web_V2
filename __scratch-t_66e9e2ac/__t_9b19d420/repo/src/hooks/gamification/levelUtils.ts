/** Calculate level from XP (mirrors the database function) */
export const calculateLevel = (xp: number): number => {
  return Math.max(1, Math.floor(Math.sqrt(xp / 50.0)) + 1);
};

/** Calculate XP needed for next level */
export const xpForNextLevel = (currentLevel: number): number => {
  return Math.pow(currentLevel, 2) * 50;
};

/** Calculate progress to next level (0-100) */
export const levelProgress = (xp: number, level: number): number => {
  const currentLevelXp = xpForNextLevel(level - 1);
  const nextLevelXp = xpForNextLevel(level);
  const progress = ((xp - currentLevelXp) / (nextLevelXp - currentLevelXp)) * 100;
  return Math.min(100, Math.max(0, progress));
};
