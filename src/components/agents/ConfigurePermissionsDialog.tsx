import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Shield, Users, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

interface ConfigurePermissionsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ConfigurePermissionsDialog({ open, onOpenChange }: ConfigurePermissionsDialogProps) {
  const { data: roles = [], isLoading } = useQuery({
    queryKey: ['user-roles-overview'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_roles')
        .select('id, user_id, role');
      if (error) throw error;
      return data || [];
    },
    enabled: open,
  });

  const { data: permissions = [] } = useQuery({
    queryKey: ['permissions-list'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('permissions')
        .select('id, name, description, category');
      if (error) throw error;
      return data || [];
    },
    enabled: open,
  });

  const { data: profiles = [] } = useQuery({
    queryKey: ['profiles-for-permissions'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, name, email, role')
        .order('name');
      if (error) throw error;
      return data || [];
    },
    enabled: open,
  });

  const getRoleBadge = (role: string) => {
    const colors: Record<string, string> = {
      admin: 'bg-destructive/10 text-destructive border-destructive/30',
      supervisor: 'bg-warning/10 text-warning border-warning/30',
      agent: 'bg-primary/10 text-primary border-primary/30',
    };
    const labels: Record<string, string> = {
      admin: 'Admin',
      supervisor: 'Supervisor',
      agent: 'Agente',
    };
    return (
      <Badge variant="outline" className={colors[role] || ''}>
        {labels[role] || role}
      </Badge>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent aria-describedby={undefined} className="max-w-2xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-primary" />
            Permissões da Equipe
          </DialogTitle>
          <DialogDescription>
            Visão geral dos cargos e permissões dos membros da equipe
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : (
          <ScrollArea className="max-h-[50vh]">
            <div className="space-y-3">
              {profiles.map((profile) => {
                const userRoles = roles.filter(r => r.user_id === profile.id);
                return (
                  <div
                    key={profile.id}
                    className="flex items-center justify-between p-3 rounded-lg border border-border/50 hover:bg-muted/30 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                        <Users className="w-4 h-4 text-primary" />
                      </div>
                      <div>
                        <p className="font-medium text-sm">{profile.name}</p>
                        <p className="text-xs text-muted-foreground">{profile.email}</p>
                      </div>
                    </div>
                    <div className="flex gap-1">
                      {userRoles.length > 0 ? (
                        userRoles.map(r => (
                          <span key={r.id}>{getRoleBadge(r.role)}</span>
                        ))
                      ) : (
                        getRoleBadge(profile.role || 'agent')
                      )}
                    </div>
                  </div>
                );
              })}

              {profiles.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  <Users className="w-12 h-12 mx-auto mb-3 opacity-50" />
                  <p>Nenhum membro encontrado</p>
                </div>
              )}
            </div>

            {permissions.length > 0 && (
              <div className="mt-6">
                <h4 className="font-medium text-sm mb-3">Permissões Disponíveis</h4>
                <div className="grid grid-cols-2 gap-2">
                  {permissions.map((perm) => (
                    <div key={perm.id} className="p-2 rounded border border-border/30 text-xs">
                      <p className="font-medium">{perm.name}</p>
                      {perm.description && (
                        <p className="text-muted-foreground mt-0.5">{perm.description}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </ScrollArea>
        )}
      </DialogContent>
    </Dialog>
  );
}
