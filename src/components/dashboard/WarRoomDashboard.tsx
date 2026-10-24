import { useState, useEffect } from 'react';
import { Bell, BellOff, Pause, Play, Maximize, Minimize, RefreshCcw } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useWarRoomData } from './useWarRoomData';
import { useNotificationSettings } from '@/hooks/system/useNotificationSettings';
import { SentinelAlertPanel } from './SentinelAlertPanel';

interface Agent { id: string; name: string; status: string; avatar_url?: string | null }
interface Queue { id: string; name: string; pending: number }

interface WarRoomDashboardProps {
  agents?: Agent[];
  queues?: Queue[];
}

export function WarRoomDashboard({ agents: propsAgents, queues: propsQueues }: WarRoomDashboardProps = {}) {
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const realData = useWarRoomData();
  const { settings, updateSetting } = useNotificationSettings();

  useEffect(() => {
    const handleFSChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handleFSChange);
    return () => document.removeEventListener('fullscreenchange', handleFSChange);
  }, []);

  const hasCriticalAlerts = realData.alerts?.some(a => (a.severity === 'critical')) ?? false;

  if (!propsAgents && !propsQueues && realData.isLoading) {
    return (
      <div role="status" aria-label="Carregando dados do War Room" className="space-y-4 p-4">
        <div className="h-8 bg-muted motion-safe:animate-pulse rounded" />
      </div>
    );
  }

  if (!propsAgents && !propsQueues && realData.isError) {
    return (
      <div role="alert" className="p-4 space-y-2">
        <p>Não foi possível carregar o War Room</p>
        {realData.error?.message && <p>{realData.error.message}</p>}
        <button onClick={() => void realData.refetch()}>Tentar de novo</button>
      </div>
    );
  }

  const agents = propsAgents ?? realData.agents ?? [];
  const queues = propsQueues ?? realData.queues ?? [];

  return (
    <div className={`w-full space-y-4 ${isFullscreen ? 'fixed inset-0 z-50 bg-background overflow-y-auto p4' : ''}`}>
      <div className="flex items-center justify-between motion-safe:animate-pulse-subtle">
        <h1>War Room</h1>
        <div className="flex gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => updateSetting('soundEnabled', !settings.soundEnabled)}
            aria-label={settings.soundEnabled ? 'Desativar som de alertas' : 'Ativar som de alertas'}
          >
            {settings.soundEnabled ? <Bell className="h-4 w-4" /> : <BellOff className="h-4 w-4" />}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setAutoRefresh(prev => !prev)}
            aria-label={autoRefresh ? 'Pausar atualização automática' : 'Retomar atualização automática'}
          >
            {autoRefresh ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => void document.documentElement.requestFullscreen?.()}
            aria-label={isFullscreen ? 'Sair da tela cheia' : 'Tela cheia'}
          >
            {isFullscreen ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {agents.map((agent) => (
          <Card key={agent.id}>
            <CardContent>
              <p className="font-medium">{agent.name}</p>
              <Badge>{agent.status}</Badge>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-4">
        {queues.map((queue) => (
          <Card key={queue.id}>
            <CardContent>
              <p className="font-medium">{queue.name}</p>
              <span>{queue.pending} pendentes</span>
            </CardContent>
          </Card>
        ))}
      </div>

      {realData.alerts && realData.alerts.length > 0 && (
        <Card>
          <CardContent
            role="log"
            aria-label="Alertas do War Room"
            aria-live={hasCriticalAlerts ? "assertive" : "polite"}
          >
            <SentinelAlertPanel alerts={realData.alerts} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
