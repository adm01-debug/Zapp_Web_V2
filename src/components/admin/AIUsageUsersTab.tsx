import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

interface UserUsage { userId: string; calls: number; tokens: number; }

interface AIUsageUsersTabProps {
  userUsage: UserUsage[];
  profileMap: Map<string, { name?: string; email?: string }>;
}

export function AIUsageUsersTab({ userUsage, profileMap }: AIUsageUsersTabProps) {
  if (userUsage.length === 0) {
    return <Card><CardContent className="py-12 text-center text-muted-foreground">Nenhum dado de uso no período</CardContent></Card>;
  }

  const chartData = userUsage.slice(0, 10).map(u => {
    const profile = profileMap.get(u.userId);
    return { ...u, name: profile?.name || profile?.email || u.userId.slice(0, 8) };
  });

  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Ranking de Consumo por Usuário</CardTitle></CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={chartData} layout="vertical">
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
            <XAxis type="number" fontSize={11} className="fill-muted-foreground" />
            <YAxis type="category" dataKey="name" width={120} fontSize={11} className="fill-muted-foreground" />
            <Tooltip formatter={(v: any) => v.toLocaleString() + ' tokens'} contentStyle={{ backgroundColor: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: '8px', color: 'hsl(var(--popover-foreground))' }} />
            <Bar dataKey="tokens" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} name="Tokens" />
          </BarChart>
        </ResponsiveContainer>

        <div className="mt-4 border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">#</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">Usuário</th>
                <th className="text-right px-3 py-2 font-medium text-muted-foreground">Chamadas</th>
                <th className="text-right px-3 py-2 font-medium text-muted-foreground">Tokens</th>
                <th className="text-right px-3 py-2 font-medium text-muted-foreground">Média/Chamada</th>
              </tr>
            </thead>
            <tbody>
              {userUsage.map((u, i) => {
                const profile = profileMap.get(u.userId);
                return (
                  <tr key={u.userId} className="border-b last:border-0 hover:bg-muted/30">
                    <td className="px-3 py-2 text-muted-foreground">{i + 1}</td>
                    <td className="px-3 py-2">
                      <span className="font-medium text-foreground">{profile?.name || profile?.email || u.userId.slice(0, 8)}</span>
                      {profile?.email && profile?.name && <span className="text-xs text-muted-foreground ml-1">({profile.email})</span>}
                    </td>
                    <td className="px-3 py-2 text-right text-foreground">{u.calls.toLocaleString()}</td>
                    <td className="px-3 py-2 text-right font-medium text-foreground">{u.tokens.toLocaleString()}</td>
                    <td className="px-3 py-2 text-right text-muted-foreground">{u.calls > 0 ? Math.round(u.tokens / u.calls).toLocaleString() : 0}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
