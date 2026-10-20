import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Shield, Users, Check, X, Loader2, Search } from 'lucide-react';
import { usePermissions } from '@/hooks/system/usePermissions';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';

const ROLE_LABELS = {
  admin: { label: 'Administrador', color: 'bg-destructive/10 text-destructive dark:bg-destructive/20/30 dark:text-destructive' },
  supervisor: { label: 'Supervisor', color: 'bg-info/10 text-info dark:bg-info/20/30 dark:text-info' },
  agent: { label: 'Agente', color: 'bg-success/10 text-success dark:bg-success/20/30 dark:text-success' }
};

const CATEGORY_LABELS: Record<string, string> = {
  dashboard: 'Dashboard',
  inbox: 'Caixa de Entrada',
  contacts: 'Contatos',
  queues: 'Filas',
  reports: 'Relatórios',
  agents: 'Agentes',
  settings: 'Configurações',
  connections: 'Conexões',
  security: 'Segurança',
  general: 'Geral'
};

export function PermissionMatrix() {
  const { permissions, rolePermissions, addPermissionToRole, removePermissionFromRole, loading } = usePermissions();
  const [search, setSearch] = useState('');
  const [updating, setUpdating] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'admin' | 'supervisor' | 'agent'>('admin');

  const filteredPermissions = permissions.filter(p => 
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    p.description?.toLowerCase().includes(search.toLowerCase()) ||
    p.category.toLowerCase().includes(search.toLowerCase())
  );

  const groupedPermissions = filteredPermissions.reduce((acc, perm) => {
    const category = perm.category || 'general';
    if (!acc[category]) acc[category] = [];
    acc[category].push(perm);
    return acc;
  }, {} as Record<string, typeof permissions>);

  const hasPermission = (role: string, permissionId: string): boolean => {
    return rolePermissions.some(rp => rp.role === role && rp.permission_id === permissionId);
  };

  const handleToggle = async (role: 'admin' | 'supervisor' | 'agent', permissionId: string) => {
    const key = `${role}-${permissionId}`;
    setUpdating(key);

    try {
      const has = hasPermission(role, permissionId);
      if (has) {
        await removePermissionFromRole(role, permissionId);
        toast.success('Permissão removida');
      } else {
        await addPermissionToRole(role, permissionId);
        toast.success('Permissão adicionada');
      }
    } catch (err) {
      toast.error('Erro ao atualizar permissão');
    } finally {
      setUpdating(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center">
            <Shield className="w-5 h-5 text-primary" />
          </div>
          <div>
            <CardTitle>Matriz de Permissões</CardTitle>
            <CardDescription>
              Configure as permissões de cada role
            </CardDescription>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar permissões..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'admin' | 'supervisor' | 'agent')}>
          <TabsList className="w-full">
            {Object.entries(ROLE_LABELS).map(([role, { label }]) => (
              <TabsTrigger key={role} value={role} className="flex-1">
                {label}
              </TabsTrigger>
            ))}
          </TabsList>

          {Object.entries(ROLE_LABELS).map(([role]) => (
            <TabsContent key={role} value={role} className="space-y-4 mt-4">
              {Object.entries(groupedPermissions).map(([category, perms]) => (
                <motion.div
                  key={category}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="space-y-2"
                >
                  <h4 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">
                    {CATEGORY_LABELS[category] || category}
                  </h4>
                  <div className="grid gap-2">
                    {perms.map((perm) => {
                      const key = `${role}-${perm.id}`;
                      const isUpdating = updating === key;
                      const checked = hasPermission(role, perm.id);

                      return (
                        <div
                          key={perm.id}
                          className={`flex items-center justify-between p-3 rounded-lg border transition-colors ${
                            checked ? 'bg-primary/5 border-primary/20' : 'hover:bg-muted/50'
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <Checkbox
                              checked={checked}
                              onCheckedChange={() => handleToggle(role as 'admin' | 'supervisor' | 'agent', perm.id)}
                              disabled={isUpdating || role === 'admin'}
                              className="data-[state=checked]:bg-primary"
                            />
                            <div>
                              <p className="font-medium text-sm">{perm.description || perm.name}</p>
                              <code className="text-xs text-muted-foreground">{perm.name}</code>
                            </div>
                          </div>
                          {isUpdating && (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          )}
                        </div>
                      );
                    })}
                  </div>
                </motion.div>
              ))}

              {role === 'admin' && (
                <div className="p-3 bg-muted/50 rounded-lg text-sm text-muted-foreground">
                  <strong>Nota:</strong> Administradores têm todas as permissões por padrão e não podem ser alterados.
                </div>
              )}
            </TabsContent>
          ))}
        </Tabs>
      </CardContent>
    </Card>
  );
}
