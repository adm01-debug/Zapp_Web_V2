import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Plus, Trophy, BarChart3, Trash2, FlaskConical } from 'lucide-react';
import { toast } from 'sonner';
import { motion } from 'framer-motion';

interface ABVariant {
  id: string;
  campaign_id: string;
  variant_name: string;
  message_content: string;
  media_url: string | null;
  send_count: number;
  delivered_count: number;
  read_count: number;
  response_count: number;
  is_winner: boolean;
}

interface CampaignABTestingProps {
  campaignId: string;
}

export function CampaignABTesting({ campaignId }: CampaignABTestingProps) {
  const [variants, setVariants] = useState<ABVariant[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newContent, setNewContent] = useState('');

  useEffect(() => { loadVariants(); }, [campaignId]);

  const loadVariants = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('campaign_ab_variants')
      .select('*')
      .eq('campaign_id', campaignId)
      .order('created_at');
    if (data) setVariants(data);
    setLoading(false);
  };

  const addVariant = async () => {
    if (!newContent.trim()) return;
    const name = newName || String.fromCharCode(65 + variants.length);
    const { error } = await supabase.from('campaign_ab_variants').insert({
      campaign_id: campaignId,
      variant_name: name,
      message_content: newContent.trim(),
    });
    if (!error) {
      toast.success(`Variante ${name} criada`);
      setDialogOpen(false);
      setNewName('');
      setNewContent('');
      loadVariants();
    }
  };

  const deleteVariant = async (id: string) => {
    await supabase.from('campaign_ab_variants').delete().eq('id', id);
    toast.success('Variante removida');
    loadVariants();
  };

  const declareWinner = async (id: string) => {
    await supabase.from('campaign_ab_variants').update({ is_winner: false }).eq('campaign_id', campaignId);
    await supabase.from('campaign_ab_variants').update({ is_winner: true }).eq('id', id);
    toast.success('Vencedor declarado!');
    loadVariants();
  };

  const getConversionRate = (v: ABVariant) => {
    if (v.send_count === 0) return 0;
    return Math.round((v.response_count / v.send_count) * 100);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FlaskConical className="w-4 h-4 text-primary" />
          <span className="text-sm font-medium">Teste A/B</span>
          <Badge variant="outline" className="text-[10px]">{variants.length} variantes</Badge>
        </div>
        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setDialogOpen(true)}>
          <Plus className="w-3 h-3 mr-1" /> Variante
        </Button>
      </div>

      {loading ? (
        <div className="space-y-2">{[1,2].map(i => <div key={i} className="h-24 bg-muted/20 rounded-xl animate-pulse" />)}</div>
      ) : variants.length === 0 ? (
        <Card><CardContent className="p-6 text-center text-sm text-muted-foreground">Nenhuma variante. Crie pelo menos 2 para testar.</CardContent></Card>
      ) : (
        <div className="grid gap-3">
          {variants.map((v, idx) => (
            <motion.div key={v.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.1 }}>
              <Card className={`${v.is_winner ? 'border-success/50 bg-success/5' : ''}`}>
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Badge variant={v.is_winner ? 'default' : 'outline'} className="text-xs">
                        {v.is_winner && <Trophy className="w-3 h-3 mr-1" />}
                        Variante {v.variant_name}
                      </Badge>
                    </div>
                    <div className="flex gap-1">
                      {!v.is_winner && variants.length >= 2 && (
                        <Button variant="ghost" size="sm" className="h-6 text-[10px]" onClick={() => declareWinner(v.id)}>
                          <Trophy className="w-3 h-3 mr-1" /> Vencedor
                        </Button>
                      )}
                      <Button variant="ghost" size="icon" className="w-6 h-6" onClick={() => deleteVariant(v.id)}>
                        <Trash2 className="w-3 h-3 text-destructive" />
                      </Button>
                    </div>
                  </div>
                  <p className="text-xs bg-muted/20 p-2 rounded-lg line-clamp-3">{v.message_content}</p>
                  <div className="grid grid-cols-4 gap-2 text-center">
                    <div>
                      <p className="text-sm font-bold">{v.send_count}</p>
                      <p className="text-[9px] text-muted-foreground">Enviadas</p>
                    </div>
                    <div>
                      <p className="text-sm font-bold">{v.delivered_count}</p>
                      <p className="text-[9px] text-muted-foreground">Entregues</p>
                    </div>
                    <div>
                      <p className="text-sm font-bold">{v.read_count}</p>
                      <p className="text-[9px] text-muted-foreground">Lidas</p>
                    </div>
                    <div>
                      <p className="text-sm font-bold text-primary">{getConversionRate(v)}%</p>
                      <p className="text-[9px] text-muted-foreground">Conversão</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Nova Variante A/B</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Input value={newName} onChange={e => setNewName(e.target.value)} placeholder={`Nome (ex: ${String.fromCharCode(65 + variants.length)})`} className="h-8 text-sm" />
            <Textarea value={newContent} onChange={e => setNewContent(e.target.value)} placeholder="Conteúdo da mensagem..." rows={4} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={addVariant} disabled={!newContent.trim()}>Criar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
