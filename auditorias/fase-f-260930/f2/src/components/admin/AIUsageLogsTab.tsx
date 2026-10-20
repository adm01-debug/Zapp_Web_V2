import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { FUNCTION_COLORS, FUNCTION_LABELS } from '@/hooks/analytics/useAIUsageDashboard';

const LOGS_PER_PAGE = 50;

interface LogEntry {
  id: string; created_at: string; user_id: string | null; function_name: string;
  model: string | null; total_tokens: number; duration_ms: number | null; status: string;
}

interface AIUsageLogsTabProps {
  logs: LogEntry[];
  logsPage: number;
  setLogsPage: (fn: (p: number) => number) => void;
  profileMap: Map<string, { name?: string; email?: string }>;
}

export function AIUsageLogsTab({ logs, logsPage, setLogsPage, profileMap }: AIUsageLogsTabProps) {
  return (
    <Card>
      <CardHeader className="pb-2 flex flex-row items-center justify-between">
        <CardTitle className="text-sm font-medium">Últimas Chamadas</CardTitle>
        <span className="text-xs text-muted-foreground">
          {logs.length} registros • Página {logsPage + 1} de {Math.max(1, Math.ceil(logs.length / LOGS_PER_PAGE))}
        </span>
      </CardHeader>
      <CardContent>
        <div className="border rounded-lg overflow-auto max-h-[500px]">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-background">
              <tr className="border-b bg-muted/50">
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">Data</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">Usuário</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">Função</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">Modelo</th>
                <th className="text-right px-3 py-2 font-medium text-muted-foreground">Tokens</th>
                <th className="text-right px-3 py-2 font-medium text-muted-foreground">Duração</th>
                <th className="text-center px-3 py-2 font-medium text-muted-foreground">Status</th>
              </tr>
            </thead>
            <tbody>
              {logs.slice(logsPage * LOGS_PER_PAGE, (logsPage + 1) * LOGS_PER_PAGE).map(l => {
                const profile = l.user_id ? profileMap.get(l.user_id) : null;
                return (
                  <tr key={l.id} className="border-b last:border-0 hover:bg-muted/30">
                    <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">{format(new Date(l.created_at), 'dd/MM HH:mm:ss', { locale: ptBR })}</td>
                    <td className="px-3 py-2 text-foreground">{profile?.name || profile?.email || l.user_id?.slice(0, 8) || '-'}</td>
                    <td className="px-3 py-2">
                      <Badge variant="secondary" className="text-3xs" style={{ backgroundColor: (FUNCTION_COLORS[l.function_name] || '#666') + '20', color: FUNCTION_COLORS[l.function_name] || '#666' }}>
                        {FUNCTION_LABELS[l.function_name] || l.function_name}
                      </Badge>
                    </td>
                    <td className="px-3 py-2 text-muted-foreground text-xs">{l.model?.replace('google/', '').replace('openai/', '') || '-'}</td>
                    <td className="px-3 py-2 text-right font-mono text-foreground">{l.total_tokens.toLocaleString()}</td>
                    <td className="px-3 py-2 text-right text-muted-foreground">{l.duration_ms ? `${l.duration_ms}ms` : '-'}</td>
                    <td className="px-3 py-2 text-center">
                      <Badge variant={l.status === 'success' ? 'default' : 'destructive'} className="text-3xs">{l.status === 'success' ? '✓' : '✗'}</Badge>
                    </td>
                  </tr>
                );
              })}
              {logs.length === 0 && <tr><td colSpan={7} className="px-3 py-12 text-center text-muted-foreground">Nenhum log encontrado</td></tr>}
            </tbody>
          </table>
        </div>
        {logs.length > LOGS_PER_PAGE && (
          <div className="flex items-center justify-between mt-3">
            <Button variant="outline" size="sm" disabled={logsPage === 0} onClick={() => setLogsPage(p => p - 1)}>← Anterior</Button>
            <span className="text-xs text-muted-foreground">{logsPage * LOGS_PER_PAGE + 1}–{Math.min((logsPage + 1) * LOGS_PER_PAGE, logs.length)} de {logs.length}</span>
            <Button variant="outline" size="sm" disabled={(logsPage + 1) * LOGS_PER_PAGE >= logs.length} onClick={() => setLogsPage(p => p + 1)}>Próximo →</Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
