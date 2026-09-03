import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/layout/PageHeader';
import { motion } from '@/components/ui/motion';
import { FloatingParticles } from '@/components/dashboard/FloatingParticles';
import { AuroraBorealis } from '@/components/effects/AuroraBorealis';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Wallet, Plus, Trash2, Users, Phone, ArrowUpDown, UserCheck } from 'lucide-react';
import { useClientWallet } from '@/hooks/business/useClientWallet';

export function ClientWalletView() {
  const w = useClientWallet();

  return (
    <div className="p-6 space-y-6 overflow-y-auto h-full relative bg-background">
      <AuroraBorealis />
      <FloatingParticles />

      <PageHeader
        title="Carteira de Clientes"
        subtitle="Configure regras para atribuição automática de clientes aos vendedores"
        breadcrumbs={[{ label: 'Gestão' }, { label: 'Carteira' }]}
        actions={
          <Dialog open={w.isAddDialogOpen} onOpenChange={w.setIsAddDialogOpen}>
            <DialogTrigger asChild>
              <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                <Button className="bg-whatsapp hover:bg-whatsapp-dark text-primary-foreground"><Plus className="w-4 h-4 mr-2" />Nova Regra</Button>
              </motion.div>
            </DialogTrigger>
            <DialogContent aria-describedby={undefined} className="sm:max-w-md">
              <DialogHeader><DialogTitle>Criar Regra de Carteira</DialogTitle></DialogHeader>
              <div className="space-y-4 pt-4">
                <div className="space-y-2">
                  <Label>Nome da Regra</Label>
                  <Input placeholder="Ex: Vendas - Principal" value={w.newRule.name} onChange={(e) => w.setNewRule({ ...w.newRule, name: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Vendedor</Label>
                  <Select value={w.newRule.agent_id} onValueChange={(v) => w.setNewRule({ ...w.newRule, agent_id: v })}>
                    <SelectTrigger><SelectValue placeholder="Selecione um vendedor" /></SelectTrigger>
                    <SelectContent>{w.agents.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Conexão WhatsApp (opcional)</Label>
                  <Select value={w.newRule.whatsapp_connection_id} onValueChange={(v) => w.setNewRule({ ...w.newRule, whatsapp_connection_id: v })}>
                    <SelectTrigger><SelectValue placeholder="Todas as conexões" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">Todas as conexões</SelectItem>
                      {w.connections.map((c) => <SelectItem key={c.id} value={c.id}>{c.name} ({c.phone_number})</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">Se definido, apenas clientes dessa conexão serão atribuídos.</p>
                </div>
                <div className="space-y-2">
                  <Label>Prioridade</Label>
                  <Input type="number" placeholder="0" value={w.newRule.priority} onChange={(e) => w.setNewRule({ ...w.newRule, priority: parseInt(e.target.value) || 0 })} />
                  <p className="text-xs text-muted-foreground">Maior prioridade = processada primeiro</p>
                </div>
                <div className="flex justify-end gap-2 pt-4">
                  <Button variant="outline" onClick={() => w.setIsAddDialogOpen(false)}>Cancelar</Button>
                  <Button onClick={w.handleAddRule} className="bg-whatsapp hover:bg-whatsapp-dark">Criar Regra</Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          { label: 'Regras Ativas', value: w.rules.filter(r => r.is_active).length, icon: UserCheck, color: 'text-status-online' },
          { label: 'Total de Regras', value: w.rules.length, icon: ArrowUpDown, color: 'text-primary' },
          { label: 'Vendedores', value: w.agents.length, icon: Users, color: 'text-whatsapp' },
        ].map((stat, i) => (
          <motion.div key={stat.label} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1 }}>
            <Card className="border border-secondary/20 bg-card card-glow-purple">
              <CardContent className="p-4 flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center"><stat.icon className={`w-6 h-6 ${stat.color}`} /></div>
                <div><p className="text-sm text-muted-foreground">{stat.label}</p><p className="text-2xl font-bold">{stat.value}</p></div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      <Card className="border border-secondary/20 bg-card">
        <CardHeader><CardTitle className="text-lg">Regras de Atribuição</CardTitle></CardHeader>
        <CardContent>
          {w.loading ? (
            <div className="text-center py-8 text-muted-foreground">Carregando...</div>
          ) : w.rules.length === 0 ? (
            <EmptyState icon={Wallet} title="Nenhuma regra configurada" description="Configure regras para atribuir clientes automaticamente" illustration="wallet" size="sm" actionLabel="Criar Primeira Regra" onAction={() => w.setIsAddDialogOpen(true)} />
          ) : (
            <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead><TableHead>Vendedor</TableHead><TableHead>Conexão</TableHead><TableHead>Prioridade</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {w.rules.map((rule) => (
                  <TableRow key={rule.id}>
                    <TableCell className="font-medium">{rule.name}</TableCell>
                    <TableCell>{rule.agent?.name || '-'}</TableCell>
                    <TableCell>{rule.connection ? <div className="flex items-center gap-1"><Phone className="w-3 h-3" />{rule.connection.name}</div> : <span className="text-muted-foreground">Todas</span>}</TableCell>
                    <TableCell><Badge variant="outline">{rule.priority}</Badge></TableCell>
                    <TableCell><Switch checked={rule.is_active} onCheckedChange={(checked) => w.handleToggleActive(rule.id, checked)} /></TableCell>
                    <TableCell className="text-right"><Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" onClick={() => w.handleDeleteRule(rule.id)}><Trash2 className="w-4 h-4" /></Button></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-lg">Como funciona?</CardTitle></CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>• Quando um novo contato chega, o sistema verifica as regras na ordem de prioridade.</p>
          <p>• Se uma regra corresponde à conexão WhatsApp do contato, ele é atribuído ao vendedor.</p>
          <p>• Regras com "Todas as conexões" funcionam como fallback.</p>
          <p>• Contatos já atribuídos não são reatribuídos automaticamente.</p>
        </CardContent>
      </Card>
    </div>
  );
}
