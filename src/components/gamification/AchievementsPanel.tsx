import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Trophy, Filter, Search, Calendar, ChevronDown } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useAgentGamification } from '@/hooks/gamification/useAgentGamification';
import { AchievementBadge } from './AchievementBadge';
import { AchievementsStatsHeader, AchievementsHeaderBadges, isNewAchievement } from './AchievementsStats';

type SortOption = 'recent' | 'xp' | 'type';
type FilterOption = 'all' | 'today' | 'week' | 'month';

export function AchievementsPanel() {
  const { achievements, stats, isLoading } = useAgentGamification();
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('recent');
  const [filterBy, setFilterBy] = useState<FilterOption>('all');
  const [selectedTab, setSelectedTab] = useState('all');

  const filteredAchievements = useMemo(() => {
    let result = [...achievements];
    if (searchQuery) { const q = searchQuery.toLowerCase(); result = result.filter(a => a.achievement_name.toLowerCase().includes(q) || a.achievement_description?.toLowerCase().includes(q) || a.achievement_type.toLowerCase().includes(q)); }
    const now = new Date();
    if (filterBy === 'today') { const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()); result = result.filter(a => new Date(a.earned_at) >= today); }
    else if (filterBy === 'week') result = result.filter(a => new Date(a.earned_at) >= new Date(now.getTime() - 7 * 86400000));
    else if (filterBy === 'month') result = result.filter(a => new Date(a.earned_at) >= new Date(now.getTime() - 30 * 86400000));
    if (selectedTab !== 'all') result = result.filter(a => a.achievement_type === selectedTab);
    if (sortBy === 'recent') result.sort((a, b) => new Date(b.earned_at).getTime() - new Date(a.earned_at).getTime());
    else if (sortBy === 'xp') result.sort((a, b) => b.xp_earned - a.xp_earned);
    else if (sortBy === 'type') result.sort((a, b) => a.achievement_type.localeCompare(b.achievement_type));
    return result;
  }, [achievements, searchQuery, sortBy, filterBy, selectedTab]);

  const achievementsByType = useMemo(() => {
    const g: Record<string, typeof achievements> = {};
    achievements.forEach(a => { (g[a.achievement_type] ??= []).push(a); });
    return g;
  }, [achievements]);

  const uniqueTypes = useMemo(() => Array.from(new Set(achievements.map(a => a.achievement_type))), [achievements]);

  if (isLoading) return (
    <Card className="border-border"><CardHeader><Skeleton className="h-8 w-48" /></CardHeader>
      <CardContent><div className="space-y-4"><Skeleton className="h-24 w-full" /><div className="grid grid-cols-3 gap-4">{[1,2,3].map(i => <Skeleton key={i} className="h-20" />)}</div><div className="space-y-3">{[1,2,3,4].map(i => <Skeleton key={i} className="h-16" />)}</div></div></CardContent></Card>
  );

  return (
    <Card className="border-border">
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-warning to-warning flex items-center justify-center shadow-lg shadow-warning/30"><Trophy className="w-5 h-5 text-primary-foreground" /></div>
            <div><CardTitle className="text-xl">Minhas Conquistas</CardTitle><p className="text-sm text-muted-foreground">{achievements.length} conquistas desbloqueadas</p></div>
          </div>
          {stats && <AchievementsHeaderBadges stats={stats} />}
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {stats && <AchievementsStatsHeader achievements={achievements} stats={stats} />}

        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" /><Input placeholder="Buscar conquistas..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-9" /></div>
          <DropdownMenu><DropdownMenuTrigger asChild><Button variant="outline" className="gap-2"><Filter className="w-4 h-4" />{filterBy === 'all' ? 'Todas' : filterBy === 'today' ? 'Hoje' : filterBy === 'week' ? 'Última Semana' : 'Último Mês'}<ChevronDown className="w-3 h-3" /></Button></DropdownMenuTrigger>
            <DropdownMenuContent><DropdownMenuItem onClick={() => setFilterBy('all')}>Todas</DropdownMenuItem><DropdownMenuItem onClick={() => setFilterBy('today')}>Hoje</DropdownMenuItem><DropdownMenuItem onClick={() => setFilterBy('week')}>Última Semana</DropdownMenuItem><DropdownMenuItem onClick={() => setFilterBy('month')}>Último Mês</DropdownMenuItem></DropdownMenuContent></DropdownMenu>
          <DropdownMenu><DropdownMenuTrigger asChild><Button variant="outline" className="gap-2"><Calendar className="w-4 h-4" />{sortBy === 'recent' ? 'Mais Recentes' : sortBy === 'xp' ? 'Maior XP' : 'Por Tipo'}<ChevronDown className="w-3 h-3" /></Button></DropdownMenuTrigger>
            <DropdownMenuContent><DropdownMenuItem onClick={() => setSortBy('recent')}>Mais Recentes</DropdownMenuItem><DropdownMenuItem onClick={() => setSortBy('xp')}>Maior XP</DropdownMenuItem><DropdownMenuItem onClick={() => setSortBy('type')}>Por Tipo</DropdownMenuItem></DropdownMenuContent></DropdownMenu>
        </div>

        <Tabs value={selectedTab} onValueChange={setSelectedTab}>
          <TabsList className="w-full flex-wrap h-auto p-1">
            <TabsTrigger value="all" className="flex-1">Todas ({achievements.length})</TabsTrigger>
            {uniqueTypes.slice(0, 5).map(type => <TabsTrigger key={type} value={type} className="flex-1">{type.replace(/_/g, ' ')} ({achievementsByType[type]?.length || 0})</TabsTrigger>)}
          </TabsList>
          <TabsContent value={selectedTab} className="mt-4">
            <ScrollArea className="h-[400px] pr-4">
              <AnimatePresence mode="popLayout">
                {filteredAchievements.length === 0 ? (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                    <Trophy className="w-12 h-12 mb-3 opacity-30" /><p className="font-medium">Nenhuma conquista encontrada</p><p className="text-sm">Continue jogando para desbloquear conquistas!</p>
                  </motion.div>
                ) : (
                  <div className="space-y-3">
                    {filteredAchievements.map((achievement, index) => (
                      <motion.div key={achievement.id} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} transition={{ delay: index * 0.03 }}>
                        <AchievementBadge type={achievement.achievement_type} name={achievement.achievement_name} description={achievement.achievement_description} xpEarned={achievement.xp_earned} earnedAt={achievement.earned_at} isNew={isNewAchievement(achievement.earned_at)} />
                      </motion.div>
                    ))}
                  </div>
                )}
              </AnimatePresence>
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
