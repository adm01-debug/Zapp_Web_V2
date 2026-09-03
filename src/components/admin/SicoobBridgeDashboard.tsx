import { useState, useEffect, useCallback } from 'react';
import { getLogger } from '@/lib/logger';

const log = getLogger('SicoobBridgeDashboard');
import { Building2, RefreshCw, ArrowDownLeft, ArrowUpRight, Users, MessageSquare, CheckCircle, XCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';

interface SicoobMapping {
  id: string;
  contact_id: string;
  sicoob_user_id: string;
  sicoob_vendedor_id: string;
  sicoob_singular_id: string;
  zappweb_agent_id: string | null;
  created_at: string;
}

interface SicoobMessage {
  id: string;
  content: string;
  sender: string;
  created_at: string;
  contact_id: string;
  status: string;
}

export function SicoobBridgeDashboard() {
  const [mappings, setMappings] = useState<SicoobMapping[]>([]);
  const [recentMessages, setRecentMessages] = useState<SicoobMessage[]>([]);
  const [loading, setLoading] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      // Load Sicoob contact mappings
      const { data: mappingData } = await supabase
        .from('sicoob_contact_mapping')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);

      setMappings((mappingData || []) as SicoobMapping[]);

      // Load recent messages from Sicoob contacts
      const contactIds = (mappingData || []).map((m: SicoobMapping) => m.contact_id);
      if (contactIds.length > 0) {
        const { data: msgData } = await supabase
          .from('messages')
          .select('id, content, sender, created_at, contact_id, status')
          .in('contact_id', contactIds.slice(0, 20))
          .order('created_at', { ascending: false })
          .limit(30);

        setRecentMessages((msgData || []) as SicoobMessage[]);
      }
    } catch (err) {
      log.warn('Failed to load Sicoob data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const inbound = recentMessages.filter(m => m.sender === 'contact').length;
  const outbound = recentMessages.filter(m => m.sender === 'agent').length;
  const uniqueSingulars = new Set(mappings.map(m => m.sicoob_singular_id)).size;

  return (
    <div className="space-y-6 w-full min-w-0">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-xl bg-primary/10">
          <Building2 className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h2 className="text-xl font-bold">Sicoob Bridge</h2>
          <p className="text-sm text-muted-foreground">Status da integração Sicoob Gifts → ZappWeb</p>
        </div>
        <Button variant="outline" size="sm" className="ml-auto h-8 text-xs" onClick={loadData} disabled={loading}>
          <RefreshCw className={`w-3 h-3 mr-1 ${loading ? 'animate-spin' : ''}`} /> Atualizar
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4 pb-4 text-center">
            <p className="text-2xl font-bold text-primary">{mappings.length}</p>
            <p className="text-xs text-muted-foreground">Contatos Mapeados</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4 text-center">
            <p className="text-2xl font-bold text-foreground">{uniqueSingulars}</p>
            <p className="text-xs text-muted-foreground">Singulares</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4 text-center">
            <div className="flex items-center justify-center gap-1">
              <ArrowDownLeft className="w-4 h-4 text-success" />
              <p className="text-2xl font-bold text-success">{inbound}</p>
            </div>
            <p className="text-xs text-muted-foreground">Recebidas</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4 text-center">
            <div className="flex items-center justify-center gap-1">
              <ArrowUpRight className="w-4 h-4 text-info" />
              <p className="text-2xl font-bold text-info">{outbound}</p>
            </div>
            <p className="text-xs text-muted-foreground">Enviadas</p>
          </CardContent>
        </Card>
      </div>

      {/* Bridge Endpoints */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <CheckCircle className="w-5 h-5 text-success" /> Endpoints da Bridge
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="bg-muted/50 rounded-lg p-3 font-mono text-xs border space-y-1">
            <p><Badge variant="secondary" className="text-[9px] mr-2">POST</Badge> /functions/v1/sicoob-bridge</p>
            <p className="text-muted-foreground pl-16">→ Recebe mensagens do Sicoob (action: new_message, mark_read)</p>
          </div>
          <div className="bg-muted/50 rounded-lg p-3 font-mono text-xs border space-y-1">
            <p><Badge variant="secondary" className="text-[9px] mr-2">AUTO</Badge> /functions/v1/sicoob-bridge-reply</p>
            <p className="text-muted-foreground pl-16">→ Trigger automático ao responder contato Sicoob</p>
          </div>
          <p className="text-xs text-muted-foreground">
            Auth: Bearer token via secret <code className="bg-muted px-1 rounded">SICOOB_BRIDGE_SECRET</code>
          </p>
        </CardContent>
      </Card>

      {/* Recent Messages */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <MessageSquare className="w-5 h-5" /> Mensagens Recentes
            <Badge variant="secondary" className="text-[10px] ml-auto">{recentMessages.length}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {recentMessages.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              Nenhuma mensagem Sicoob ainda. A bridge registrará atividade aqui.
            </p>
          ) : (
            <div className="space-y-2 max-h-[400px] overflow-auto">
              {recentMessages.map(msg => (
                <div key={msg.id} className="flex items-start gap-3 p-3 rounded-lg border bg-card">
                  {msg.sender === 'contact' ? (
                    <ArrowDownLeft className="w-4 h-4 text-success mt-0.5 shrink-0" />
                  ) : (
                    <ArrowUpRight className="w-4 h-4 text-info mt-0.5 shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm truncate">{msg.content}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs text-muted-foreground">
                        {new Date(msg.created_at).toLocaleString('pt-BR')}
                      </span>
                      <Badge variant="outline" className="text-[9px]">
                        {msg.sender === 'contact' ? 'Sicoob → Zapp' : 'Zapp → Sicoob'}
                      </Badge>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Mappings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Users className="w-5 h-5" /> Mapeamento de Contatos
          </CardTitle>
        </CardHeader>
        <CardContent>
          {mappings.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">Nenhum mapeamento criado.</p>
          ) : (
            <div className="overflow-auto max-h-[300px]">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-background">
                  <tr className="border-b">
                    <th className="text-left p-2 font-medium text-muted-foreground">Singular ID</th>
                    <th className="text-left p-2 font-medium text-muted-foreground">Sicoob User</th>
                    <th className="text-left p-2 font-medium text-muted-foreground">Vendedor</th>
                    <th className="text-left p-2 font-medium text-muted-foreground">Data</th>
                  </tr>
                </thead>
                <tbody>
                  {mappings.map(m => (
                    <tr key={m.id} className="border-b hover:bg-muted/30">
                      <td className="p-2 font-mono">{m.sicoob_singular_id}</td>
                      <td className="p-2 truncate max-w-[150px]">{m.sicoob_user_id}</td>
                      <td className="p-2 truncate max-w-[150px]">{m.sicoob_vendedor_id}</td>
                      <td className="p-2 text-muted-foreground">
                        {new Date(m.created_at).toLocaleDateString('pt-BR')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
