 import { useMemo } from 'react';
 import { startOfDay, endOfDay } from 'date-fns';
 import { useDashboardStats, DashboardFilters } from '../dashboard/useDashboardStats';
 
 const getDefaultFilters = (): DashboardFilters => ({
   dateRange: { from: startOfDay(new Date()), to: endOfDay(new Date()) },
   queueId: null,
   agentId: null,
 });
 
 export const useDashboardData = (filters: DashboardFilters = getDefaultFilters()) => {
   const mergedFilters = { ...getDefaultFilters(), ...filters };
   const { agents, contacts, queues, sla, isLoading, error, refetch } = useDashboardStats(mergedFilters);
 
   const stats = useMemo(() => {
     if (!agents || !contacts) return null;
     
     const today = startOfDay(new Date());
     const openConversations = contacts.filter(c => c.assigned_to).length;
     const pendingConversations = contacts.filter(c => !c.assigned_to && c.queue_id).length;
     const resolvedToday = contacts.filter(c => {
       const updatedAt = new Date(c.updated_at);
       return updatedAt >= today && !c.assigned_to;
     }).length;
 
     const queuesStats = (queues || []).map(queue => {
       const members = (queue as any).queue_members || [];
       const onlineMembers = members.filter((m: any) => m.is_active && m.profiles?.is_active).length;
       return {
         id: queue.id,
         name: queue.name,
         color: (queue as any).color,
         waitingCount: 0,
         onlineAgents: onlineMembers,
         totalAgents: members.length,
       };
     });
 
     return {
       openConversations,
       pendingConversations,
       resolvedToday,
       totalConversations: contacts.length,
       onlineAgents: agents.onlineAgents,
       totalAgents: agents.totalAgents,
       avgResponseTime: sla?.avgResponseTime || null,
       queuesStats,
       recentActivity: [],
     };
   }, [agents, contacts, queues, sla]);
 
   return { stats, isLoading, error, refetch };
 };
 
 export const formatResponseTime = (seconds: number | null): string => {
   if (seconds === null) return 'N/A';
   if (seconds < 60) return `${seconds}s`;
   const minutes = Math.floor(seconds / 60);
   const remainingSeconds = seconds % 60;
   if (minutes < 60) return `${minutes}min ${remainingSeconds}s`;
   const hours = Math.floor(minutes / 60);
   const remainingMinutes = minutes % 60;
   return `${hours}h ${remainingMinutes}min`;
 };