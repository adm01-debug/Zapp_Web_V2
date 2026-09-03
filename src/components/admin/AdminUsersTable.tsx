import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  Crown, UserCog, User, Eye, Briefcase, Building, Lock,
  UserCheck, UserX, Edit,
} from 'lucide-react';
import { ForceLogoutButton } from './ForceLogoutButton';
import { accessLevelConfig, type UserWithRole } from './useAdminData';
import type { AppRole } from '@/hooks/system/useUserRole';

const roleIconMap = { admin: Crown, supervisor: UserCog, agent: User, special_agent: Eye } as const;
const roleLabelMap = { admin: 'Administrador', supervisor: 'Supervisor', agent: 'Atendente', special_agent: 'Agente Especial' } as const;
const roleColorMap = { admin: 'text-warning', supervisor: 'text-info', agent: 'text-muted-foreground', special_agent: 'text-accent-foreground' } as const;

interface AdminUsersTableProps {
  users: UserWithRole[];
  isAdmin: boolean;
  onRoleChange: (userId: string, role: AppRole) => void;
  onToggleActive: (user: UserWithRole) => void;
  onEditUser: (user: UserWithRole) => void;
}

export function AdminUsersTable({ users, isAdmin, onRoleChange, onToggleActive, onEditUser }: AdminUsersTableProps) {
  return (
    <Card className="border border-secondary/20 bg-card">
      <CardHeader><CardTitle className="text-lg">Usuários</CardTitle></CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Usuário</TableHead>
              <TableHead>Cargo/Depto</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Acesso</TableHead>
              <TableHead>Status</TableHead>
              {isAdmin && <TableHead>Ações</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((user) => {
              const RoleIcon = roleIconMap[user.role];
              const accessInfo = accessLevelConfig[user.access_level || 'basic'];
              return (
                <TableRow key={user.id} className={!user.is_active ? 'opacity-50' : ''}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Avatar className="w-8 h-8">
                        <AvatarImage src={user.avatar_url || undefined} />
                        <AvatarFallback>{user.name?.[0] || 'U'}</AvatarFallback>
                      </Avatar>
                      <div>
                        <span className="font-medium block">{user.name}</span>
                        <span className="text-xs text-muted-foreground">{user.email}</span>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    {(user.job_title || user.department) ? (
                      <div className="space-y-0.5">
                        {user.job_title && <div className="flex items-center gap-1 text-sm"><Briefcase className="w-3 h-3" />{user.job_title}</div>}
                        {user.department && <div className="flex items-center gap-1 text-xs text-muted-foreground"><Building className="w-3 h-3" />{user.department}</div>}
                      </div>
                    ) : <span className="text-muted-foreground">-</span>}
                  </TableCell>
                  <TableCell>
                    {isAdmin ? (
                      <Select value={user.role} onValueChange={(v) => onRoleChange(user.user_id, v as AppRole)}>
                        <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="admin">Admin</SelectItem>
                          <SelectItem value="supervisor">Supervisor</SelectItem>
                          <SelectItem value="agent">Atendente</SelectItem>
                        </SelectContent>
                      </Select>
                    ) : (
                      <Badge variant="outline" className={roleColorMap[user.role]}>
                        <RoleIcon className="w-3 h-3 mr-1" />{roleLabelMap[user.role]}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="text-xs"><Lock className="w-3 h-3 mr-1" />{accessInfo?.label || 'Básico'}</Badge>
                  </TableCell>
                  <TableCell>
                    {user.is_active !== false ? (
                      <Badge className="bg-success/10 text-success border-success/20"><UserCheck className="w-3 h-3 mr-1" />Ativo</Badge>
                    ) : (
                      <Badge variant="destructive" className="bg-destructive/10 text-destructive border-destructive/20"><UserX className="w-3 h-3 mr-1" />Inativo</Badge>
                    )}
                  </TableCell>
                  {isAdmin && (
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Button variant="ghost" size="icon" className="w-8 h-8" onClick={() => onEditUser(user)}>
                          <Edit className="w-4 h-4" />
                        </Button>
                        <ForceLogoutButton userId={user.user_id} userName={user.name} />
                        <Switch checked={user.is_active !== false} onCheckedChange={() => onToggleActive(user)} />
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
