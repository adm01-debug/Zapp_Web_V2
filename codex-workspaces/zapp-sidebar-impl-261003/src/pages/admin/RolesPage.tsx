import { AnimatePresence, motion } from 'framer-motion';
import { Shield, Users, UserPlus, Trash2, Search, Loader2, Crown, Eye, Headphones, Star } from 'lucide-react';
import { useUserRole } from '@/hooks/system/useUserRole';
import { useRolesPageState, type UserWithRole } from './useRolesPageState';
import { PermissionMatrix } from '@/components/permissions/PermissionMatrix';
import { VisibilityGrantsManager } from '@/components/admin/VisibilityGrantsManager';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';

const ROLE_CONFIG = {
  admin: { label: 'Administrador', icon: Crown, color: 'bg-destructive/10 text-destructive dark:bg-destructive/20/30 dark:text-destructive', description: 'Acesso total ao sistema' },
  supervisor: { label: 'Supervisor', icon: Eye, color: 'bg-info/10 text-info dark:bg-info/20/30 dark:text-info', description: 'Gerencia equipes e relatórios' },
  special_agent: { label: 'Agente Especial', icon: Star, color: 'bg-warning/10 text-warning dark:bg-warning/20/30 dark:text-warning', description: 'Vê seus contatos + contatos de agentes designados' },
  agent: { label: 'Agente', icon: Headphones, color: 'bg-success/10 text-success dark:bg-success/20/30 dark:text-success', description: 'Atendimento ao cliente' },
};

export default function RolesPage() {
  const { isAdmin } = useUserRole();
  const {
    loading, search, setSearch, showAddDialog, setShowAddDialog,
    selectedUser, setSelectedUser, selectedRole, setSelectedRole,
    availableUsers, userToRemove, setUserToRemove, updating,
    handleAddRole, handleRemoveRole, groupedUsers,
  } = useRolesPageState();

  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center h-full">
        <Card className="max-w-md">
          <CardContent className="pt-6 text-center">
            <Shield className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
            <h2 className="text-lg font-semibold mb-2">Acesso Restrito</h2>
            <p className="text-muted-foreground">Você não tem permissão para acessar esta página.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Roles e Permissões</h1>
          <p className="text-muted-foreground">Gerencie os níveis de acesso do sistema</p>
        </div>
        <Button onClick={() => setShowAddDialog(true)}>
          <UserPlus className="w-4 h-4 mr-2" />
          Atribuir Role
        </Button>
      </div>

      <Tabs defaultValue="users">
        <TabsList>
          <TabsTrigger value="users"><Users className="w-4 h-4 mr-2" />Usuários</TabsTrigger>
          <TabsTrigger value="permissions"><Shield className="w-4 h-4 mr-2" />Permissões</TabsTrigger>
          <TabsTrigger value="visibility"><Star className="w-4 h-4 mr-2" />Visibilidade</TabsTrigger>
        </TabsList>

        <TabsContent value="users" className="space-y-4 mt-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Buscar usuários..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10 max-w-sm" />
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-3">
              {Object.entries(ROLE_CONFIG).map(([role, config]) => {
                const roleUsers = groupedUsers[role as keyof typeof groupedUsers];
                const Icon = config.icon;
                return (
                  <Card key={role}>
                    <CardHeader className="pb-3">
                      <div className="flex items-center gap-2">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center ${config.color}`}><Icon className="w-4 h-4" /></div>
                        <div>
                          <CardTitle className="text-base">{config.label}</CardTitle>
                          <CardDescription className="text-xs">{config.description}</CardDescription>
                        </div>
                      </div>
                      <Badge variant="secondary" className="w-fit">{roleUsers.length} usuário{roleUsers.length !== 1 ? 's' : ''}</Badge>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      <AnimatePresence mode="popLayout">
                        {roleUsers.map((user) => (
                          <motion.div key={user.id} initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="flex items-center justify-between p-2 rounded-lg hover:bg-muted/50">
                            <div className="flex items-center gap-2 min-w-0">
                              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                                <span className="text-xs font-medium">{user.profile?.name?.charAt(0).toUpperCase() || '?'}</span>
                              </div>
                              <div className="min-w-0">
                                <p className="font-medium text-sm truncate">{user.profile?.name || 'Sem nome'}</p>
                                <p className="text-xs text-muted-foreground truncate">{user.profile?.email}</p>
                              </div>
                            </div>
                            <Button variant="ghost" size="sm" onClick={() => setUserToRemove(user)} className="text-destructive hover:text-destructive hover:bg-destructive/10 flex-shrink-0">
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </motion.div>
                        ))}
                      </AnimatePresence>
                      {roleUsers.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">Nenhum usuário com esta role</p>}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        <TabsContent value="permissions" className="mt-4"><PermissionMatrix /></TabsContent>
        <TabsContent value="visibility" className="mt-4"><VisibilityGrantsManager /></TabsContent>
      </Tabs>

      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>Atribuir Role</DialogTitle>
            <DialogDescription>Selecione um usuário e a role que deseja atribuir</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Usuário</label>
              <Select value={selectedUser} onValueChange={setSelectedUser}>
                <SelectTrigger><SelectValue placeholder="Selecione um usuário" /></SelectTrigger>
                <SelectContent>
                  {availableUsers.map((user) => (
                    <SelectItem key={user.user_id} value={user.user_id}>{user.name} ({user.email})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Role</label>
              <Select value={selectedRole} onValueChange={(v) => setSelectedRole(v as 'admin' | 'supervisor' | 'agent' | 'special_agent')}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(ROLE_CONFIG).map(([role, config]) => (
                    <SelectItem key={role} value={role}>
                      <div className="flex items-center gap-2"><config.icon className="w-4 h-4" />{config.label}</div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDialog(false)}>Cancelar</Button>
            <Button onClick={handleAddRole} disabled={!selectedUser || updating}>
              {updating ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}Atribuir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!userToRemove} onOpenChange={() => setUserToRemove(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover Role?</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja remover a role de <strong>{userToRemove?.profile?.name}</strong>? O usuário perderá acesso às funcionalidades desta role.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={updating}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleRemoveRole} disabled={updating} className="bg-destructive hover:bg-destructive/90">
              {updating ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
