import { useState, useEffect } from 'react';
import { motion } from '@/components/ui/motion';
import { FloatingParticles } from '@/components/dashboard/FloatingParticles';
import { AuroraBorealis } from '@/components/effects/AuroraBorealis';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Card, CardContent } from '@/components/ui/card';
import { PasswordStrengthMeter } from '@/components/auth/PasswordStrengthMeter';
import {
  Shield, Users, Search, Crown, UserCog, User, History, RefreshCw,
  UserPlus, Building, Eye, Loader2, Brain, AlertTriangle, ChevronLeft, ChevronRight,
} from 'lucide-react';
import { useUserRole, AppRole } from '@/hooks/system/useUserRole';
import { AdminCRMDashboard } from './AdminCRMDashboard';
import { PlaybooksManager } from './PlaybooksManager';
import { SupervisorCopilot } from './SupervisorCopilot';
import { TrainingMode } from './TrainingMode';
import { CrisisRoom } from './CrisisRoom';
import { useAdminData, accessLevelConfig, MIN_PASSWORD_LENGTH, AUDIT_PAGE_SIZE, type UserWithRole } from './useAdminData';
import { AdminUsersTable } from './AdminUsersTable';
import { AdminAuditTable } from './AdminAuditTable';
import { SectionErrorBoundary } from '@/components/ui/section-error-boundary';

const roleIconMap = { admin: Crown, supervisor: UserCog, agent: User, special_agent: Eye } as const;
const roleLabelMap = { admin: 'Administrador', supervisor: 'Supervisor', agent: 'Atendente', special_agent: 'Agente Especial' } as const;
const roleColorMap = { admin: 'text-warning', supervisor: 'text-info', agent: 'text-muted-foreground', special_agent: 'text-accent-foreground' } as const;

type GoogleServiceKey = 'google_sheets' | 'google_docs' | 'google_calendar' | 'google_drive';

// SL-160/P2-3.4: a integração com Google Calendar não existe no produto (não há OAuth
// nem sincronização em src/ ou supabase/functions — só a tela de demonstração, fora dos
// grupos principais da navegação). A permissão `google_calendar` era oferecida aqui e
// gravada em `user_service_accounts` sem nenhum consumidor: fica visível, mas desligada,
// até a integração real existir.
const googleServiceOptions: ReadonlyArray<{ key: GoogleServiceKey; label: string; available: boolean }> = [
  { key: 'google_sheets', label: 'Google Sheets', available: true },
  { key: 'google_docs', label: 'Google Docs', available: true },
  { key: 'google_calendar', label: 'Google Calendar', available: false },
  { key: 'google_drive', label: 'Google Drive', available: true },
];

export function AdminView() {
  const { isAdmin, isSupervisor, loading: roleLoading } = useUserRole();
  const [activeTab, setActiveTab] = useState<'users' | 'audit' | 'crm' | 'playbooks' | 'copilot' | 'training' | 'crisis'>('users');
  const [searchTerm, setSearchTerm] = useState('');
  const [editingUser, setEditingUser] = useState<UserWithRole | null>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [editAvatarFile, setEditAvatarFile] = useState<File | null>(null);
  const [savingUser, setSavingUser] = useState(false);
  const [newUser, setNewUser] = useState({ name: '', nickname: '', signature: '', jobTitle: '', email: '', password: '', role: 'agent' as AppRole, gmail: '', dropboxEmail: '' });
  const [newUserAvatarFile, setNewUserAvatarFile] = useState<File | null>(null);
  const [newUserGoogleServices, setNewUserGoogleServices] = useState({ google_sheets: false, google_docs: false, google_calendar: false, google_drive: false });
  const [creatingUser, setCreatingUser] = useState(false);
  // Filtro de data e paginação da auditoria: o estado vive aqui e o hook
  // `useAdminData` monta a consulta (ele não guarda estado de filtro).
  const [auditFrom, setAuditFrom] = useState('');
  const [auditTo, setAuditTo] = useState('');
  const [auditPage, setAuditPage] = useState(1);

  const { users, auditLogs, auditTotal, loading, error, fetchData, handleRoleChange, handleToggleActive, handleSaveUser, handleCreateUser } =
    useAdminData(activeTab as 'users' | 'audit' | 'crm', {
      from: auditFrom || undefined,
      to: auditTo || undefined,
      page: auditPage,
      pageSize: AUDIT_PAGE_SIZE,
    });

  useEffect(() => { if (isSupervisor) fetchData(); }, [isSupervisor, activeTab, fetchData]);

  // Trocar o período volta para a primeira página: sem isso a página 3 de um
  // período novo poderia cair fora do intervalo e mostrar tabela vazia.
  const onAuditFromChange = (value: string) => { setAuditFrom(value); setAuditPage(1); };
  const onAuditToChange = (value: string) => { setAuditTo(value); setAuditPage(1); };
  const limparFiltroAuditoria = () => { setAuditFrom(''); setAuditTo(''); setAuditPage(1); };

  const auditTotalPages = Math.max(1, Math.ceil((auditTotal ?? 0) / AUDIT_PAGE_SIZE));
  // A busca client-side só faz sentido nas abas que mostram lista filtrada.
  const abaTemBusca = activeTab === 'users' || activeTab === 'audit';

  const onSaveUser = async () => {
    if (!editingUser) return;
    setSavingUser(true);
    const ok = await handleSaveUser(editingUser, editAvatarFile);
    setSavingUser(false);
    if (ok) { setIsEditDialogOpen(false); setEditingUser(null); setEditAvatarFile(null); }
  };

  const onCreateUser = async () => {
    setCreatingUser(true);
    const ok = await handleCreateUser({
      name: newUser.name, nickname: newUser.nickname || undefined, signature: newUser.signature || undefined,
      job_title: newUser.jobTitle || undefined, avatarFile: newUserAvatarFile, email: newUser.email,
      password: newUser.password, role: newUser.role, gmail_email: newUser.gmail || undefined,
      google_services: Object.entries(newUserGoogleServices).filter(([, v]) => v).map(([k]) => k),
      dropbox_email: newUser.dropboxEmail || undefined,
    });
    setCreatingUser(false);
    if (ok) {
      setIsAddDialogOpen(false);
      setNewUser({ name: '', nickname: '', signature: '', jobTitle: '', email: '', password: '', role: 'agent', gmail: '', dropboxEmail: '' });
      setNewUserAvatarFile(null);
      setNewUserGoogleServices({ google_sheets: false, google_docs: false, google_calendar: false, google_drive: false });
    }
  };

  const filteredUsers = users.filter(u =>
    u.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    u.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    u.department?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredLogs = auditLogs.filter(l =>
    l.action.toLowerCase().includes(searchTerm.toLowerCase()) ||
    l.user?.name?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (roleLoading) {
    return <div className="flex items-center justify-center h-full w-full"><div className="w-8 h-8 rounded-full border-4 border-primary border-t-transparent animate-spin" /></div>;
  }

  if (!isSupervisor) {
    return (
      <div className="flex items-center justify-center h-full w-full">
        <div className="text-center">
          <Shield className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
          <h2 className="text-xl font-semibold mb-2">Acesso Restrito</h2>
          <p className="text-muted-foreground">Você não tem permissão para acessar esta área.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 relative bg-background w-full min-w-0">
      <AuroraBorealis />
      <FloatingParticles />

      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2"><Shield className="w-6 h-6 text-whatsapp" /> Administração</h1>
          <p className="text-muted-foreground">Gerencie usuários, permissões e visualize logs de auditoria</p>
        </div>
        <div className="flex gap-2">
          {isAdmin && <Button onClick={() => setIsAddDialogOpen(true)} className="bg-primary hover:bg-primary/90"><UserPlus className="w-4 h-4 mr-2" /> Adicionar Usuário</Button>}
          <Button variant="outline" onClick={fetchData}><RefreshCw className="w-4 h-4 mr-2" /> Atualizar</Button>
        </div>
      </motion.div>

      <div className="flex gap-2 flex-wrap">
        {([['users', Users, `Usuários (${users.length})`], ['audit', History, 'Auditoria'], ['crm', Building, 'CRM 360°'], ['playbooks', Shield, 'Playbooks'], ['copilot', Brain, 'Copilot IA'], ['training', Users, 'Treinamento'], ['crisis', Shield, 'Sala de Crise']] as const).map(([tab, Icon, label]) => (
          <Button key={tab} variant={activeTab === tab ? 'default' : 'outline'} onClick={() => setActiveTab(tab as typeof activeTab)}
            className={activeTab === tab ? 'bg-primary hover:bg-primary/90' : ''} size="sm">
            <Icon className="w-4 h-4 mr-2" /> {label}
          </Button>
        ))}
      </div>

      {/* Busca: só nas abas em que o termo de fato filtra a lista carregada. */}
      {abaTemBusca && (
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder={activeTab === 'users' ? 'Buscar usuários...' : 'Buscar logs...'} value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-10" />
        </div>
      )}

      {/* Filtro de data da auditoria: limites inclusivos no fuso local. */}
      {activeTab === 'audit' && (
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-2">
            <Label htmlFor="audit_de">Data inicial</Label>
            <Input id="audit_de" type="date" className="w-40" value={auditFrom} onChange={(e) => onAuditFromChange(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="audit_ate">Data final</Label>
            <Input id="audit_ate" type="date" className="w-40" value={auditTo} onChange={(e) => onAuditToChange(e.target.value)} />
          </div>
          {(auditFrom || auditTo) && (
            <Button variant="outline" size="sm" onClick={limparFiltroAuditoria}>Limpar filtro</Button>
          )}
        </div>
      )}

      {/* Edit User Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent aria-describedby={undefined} className="max-w-lg">
          <DialogHeader><DialogTitle>Editar Usuário</DialogTitle></DialogHeader>
          {editingUser && (
            <div className="space-y-4 pt-4">
              <div className="flex items-center gap-4 mb-6">
                <Avatar className="w-16 h-16">
                  <AvatarImage src={editAvatarFile ? URL.createObjectURL(editAvatarFile) : (editingUser.avatar_url || undefined)} alt={editingUser.name || 'Usuário'} />
                  <AvatarFallback className="text-lg">{editingUser.name?.[0] || 'U'}</AvatarFallback>
                </Avatar>
                <div>
                  <p className="font-semibold text-lg">{editingUser.name}</p>
                  <p className="text-muted-foreground">{editingUser.email}</p>
                  <Label htmlFor="edit_avatar" className="text-xs text-primary cursor-pointer hover:underline mt-1 inline-block">Alterar foto</Label>
                  <Input id="edit_avatar" type="file" accept="image/*" className="hidden" onChange={(e) => setEditAvatarFile(e.target.files?.[0] || null)} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2"><Label htmlFor="edit_nome">Nome</Label><Input id="edit_nome" value={editingUser.name} onChange={(e) => setEditingUser({ ...editingUser, name: e.target.value })} /></div>
                <div className="space-y-2"><Label htmlFor="edit_apelido">Apelido</Label><Input id="edit_apelido" placeholder="Ex: Joãozinho" value={editingUser.nickname || ''} onChange={(e) => setEditingUser({ ...editingUser, nickname: e.target.value })} /></div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2"><Label htmlFor="edit_cargo">Cargo</Label><Input id="edit_cargo" placeholder="Ex: Atendente Senior" value={editingUser.job_title || ''} onChange={(e) => setEditingUser({ ...editingUser, job_title: e.target.value })} /></div>
                <div className="space-y-2"><Label htmlFor="edit_dept">Departamento</Label><Input id="edit_dept" placeholder="Ex: Vendas" value={editingUser.department || ''} onChange={(e) => setEditingUser({ ...editingUser, department: e.target.value })} /></div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit_assinatura">Assinatura</Label>
                <Input id="edit_assinatura" placeholder="Ex: João Silva - Suporte Técnico" value={editingUser.signature || ''} onChange={(e) => setEditingUser({ ...editingUser, signature: e.target.value })} />
                <p className="text-xs text-muted-foreground">Texto usado como assinatura em mensagens</p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2"><Label htmlFor="edit_tel">Telefone</Label><Input id="edit_tel" value={editingUser.phone || ''} onChange={(e) => setEditingUser({ ...editingUser, phone: e.target.value })} /></div>
                <div className="space-y-2"><Label htmlFor="edit_maxchats">Limite de Chats</Label><Input id="edit_maxchats" type="number" min={1} max={50} value={editingUser.max_chats || 5} onChange={(e) => setEditingUser({ ...editingUser, max_chats: Number.parseInt(e.target.value) })} /></div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="access_level">Nível de Acesso</Label>
                  <Select value={editingUser.access_level || 'basic'} onValueChange={(v) => setEditingUser({ ...editingUser, access_level: v })}>
                    <SelectTrigger id="access_level"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(accessLevelConfig).map(([key, config]) => (
                        <SelectItem key={key} value={key}>
                          <div><span className="font-medium">{config.label}</span><p className="text-xs text-muted-foreground">{config.description}</p></div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex items-center justify-between rounded-lg border p-4">
                <div className="space-y-0.5">
                  <Label htmlFor="edit_download" className="text-sm font-medium">Permitir Download</Label>
                  <p className="text-xs text-muted-foreground">Habilita download de arquivos e imagens para este usuário</p>
                </div>
                <Switch id="edit_download" checked={editingUser.can_download ?? false} onCheckedChange={(checked) => setEditingUser({ ...editingUser, can_download: checked })} />
              </div>
              <div className="flex justify-end gap-2 pt-4">
                <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>Cancelar</Button>
                <Button onClick={onSaveUser} disabled={savingUser} className="bg-primary hover:bg-primary/90">
                  {savingUser && <Loader2 className="w-4 h-4 animate-spin mr-2" />} Salvar
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Add User Dialog */}
      <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
        <DialogContent aria-describedby={undefined} className="max-w-md">
          <DialogHeader><DialogTitle>Adicionar Novo Usuário</DialogTitle></DialogHeader>
          <div className="space-y-4 pt-4 max-h-[70vh] overflow-y-auto pr-1">
            <div className="space-y-2"><Label htmlFor="add_nome">Primeiro Nome *</Label><Input id="add_nome" placeholder="Ex: João" value={newUser.name} onChange={(e) => setNewUser(p => ({ ...p, name: e.target.value }))} /></div>
            <div className="space-y-2"><Label htmlFor="add_apelido">Apelido</Label><Input id="add_apelido" placeholder="Ex: Joãozinho" value={newUser.nickname} onChange={(e) => setNewUser(p => ({ ...p, nickname: e.target.value }))} /></div>
            <div className="space-y-2"><Label htmlFor="add_cargo">Cargo</Label><Input id="add_cargo" placeholder="Ex: Atendente Senior" value={newUser.jobTitle} onChange={(e) => setNewUser(p => ({ ...p, jobTitle: e.target.value }))} /></div>
            <div className="space-y-2">
              <Label htmlFor="add_assinatura">Assinatura</Label>
              <Input id="add_assinatura" placeholder="Ex: João Silva - Suporte" value={newUser.signature} onChange={(e) => setNewUser(p => ({ ...p, signature: e.target.value }))} />
              <p className="text-xs text-muted-foreground">Texto usado como assinatura em mensagens e e-mails.</p>
            </div>
            <div className="space-y-2">
              <Label>Foto (opcional)</Label>
              <Input type="file" accept="image/*" onChange={(e) => setNewUserAvatarFile(e.target.files?.[0] || null)} />
              {newUserAvatarFile && <p className="text-xs text-muted-foreground">{newUserAvatarFile.name}</p>}
            </div>
            <div className="space-y-2"><Label htmlFor="add_email">Email *</Label><Input id="add_email" type="email" placeholder="usuario@email.com" value={newUser.email} onChange={(e) => setNewUser(p => ({ ...p, email: e.target.value }))} /></div>
            <div className="space-y-2">
              <Label htmlFor="add_senha">Senha *</Label>
              <Input id="add_senha" type="password" placeholder={`Mínimo ${MIN_PASSWORD_LENGTH} caracteres`} value={newUser.password} onChange={(e) => setNewUser(p => ({ ...p, password: e.target.value }))} />
              <PasswordStrengthMeter password={newUser.password} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="role">Role</Label>
              <Select value={newUser.role} onValueChange={(v) => setNewUser(p => ({ ...p, role: v as AppRole }))}>
                <SelectTrigger id="role"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(roleIconMap) as AppRole[]).map((key) => {
                    const RIcon = roleIconMap[key];
                    return <SelectItem key={key} value={key}><div className="flex items-center gap-2"><RIcon className={`w-4 h-4 ${roleColorMap[key]}`} />{roleLabelMap[key]}</div></SelectItem>;
                  })}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Conta Google (opcional)</Label>
              <Input type="email" placeholder="usuario@gmail.com" value={newUser.gmail} onChange={(e) => setNewUser(p => ({ ...p, gmail: e.target.value }))} />
            </div>
            {newUser.gmail && (
              <div className="space-y-3 rounded-lg border border-secondary/30 p-3">
                <Label className="text-sm font-medium">Serviços Google vinculados</Label>
                <div className="grid grid-cols-2 gap-2">
                  {googleServiceOptions.map(({ key, label, available }) => (
                    <label key={key} className="flex items-center gap-2 text-sm cursor-pointer">
                      <Switch
                        checked={newUserGoogleServices[key]}
                        onCheckedChange={(checked) => setNewUserGoogleServices(prev => ({ ...prev, [key]: checked }))}
                        disabled={!available}
                        aria-describedby={available ? undefined : `${key}-indisponivel`}
                      />
                      {label}
                      {!available && (
                        <span id={`${key}-indisponivel`} className="text-xs text-muted-foreground">(em desenvolvimento)</span>
                      )}
                    </label>
                  ))}
                </div>
              </div>
            )}
            <div className="space-y-2">
              <Label>Conta Dropbox (opcional)</Label>
              <Input type="email" placeholder="usuario@email.com" value={newUser.dropboxEmail} onChange={(e) => setNewUser(p => ({ ...p, dropboxEmail: e.target.value }))} />
            </div>
            <div className="flex justify-end gap-2 pt-4">
              <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>Cancelar</Button>
              <Button onClick={onCreateUser} disabled={creatingUser || !newUser.name || !newUser.email || !newUser.password} className="bg-primary hover:bg-primary/90">
                {creatingUser && <Loader2 className="w-4 h-4 animate-spin mr-2" />} Criar Usuário
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Content */}
      {loading ? (
        <div className="flex justify-center py-12"><RefreshCw className="w-8 h-8 animate-spin text-muted-foreground" /></div>
      ) : error ? (
        <Card className="border-destructive/30">
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <AlertTriangle className="w-8 h-8 text-destructive" />
            <p role="alert" className="text-muted-foreground">{error}</p>
            <Button variant="outline" onClick={fetchData}><RefreshCw className="w-4 h-4 mr-2" /> Tentar novamente</Button>
          </CardContent>
        </Card>
      ) : activeTab === 'users' ? (
        <AdminUsersTable
          users={filteredUsers}
          emptyMessage={searchTerm ? `Nenhum usuário encontrado para "${searchTerm}".` : 'Nenhum usuário cadastrado.'}
          isAdmin={isAdmin}
          onRoleChange={handleRoleChange}
          onToggleActive={handleToggleActive}
          onEditUser={(user) => { setEditingUser(user); setIsEditDialogOpen(true); }}
        />
      ) : activeTab === 'audit' ? (
        <div className="space-y-4">
          <AdminAuditTable
            logs={filteredLogs}
            emptyMessage={searchTerm
              ? `Nenhum log de auditoria encontrado para "${searchTerm}".`
              : (auditFrom || auditTo
                ? 'Nenhum log de auditoria no período selecionado.'
                : 'Nenhum log de auditoria registrado.')}
          />
          {auditTotal > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm text-muted-foreground">
                {auditTotal} registro(s) — página {auditPage} de {auditTotalPages}
              </p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={auditPage <= 1} onClick={() => setAuditPage(p => Math.max(1, p - 1))}>
                  <ChevronLeft className="w-4 h-4 mr-1" /> Anterior
                </Button>
                <Button variant="outline" size="sm" disabled={auditPage >= auditTotalPages} onClick={() => setAuditPage(p => Math.min(auditTotalPages, p + 1))}>
                  Próxima <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
              </div>
            </div>
          )}
        </div>
      ) : activeTab === 'crm' ? (
        <SectionErrorBoundary key="crm" sectionName="CRM Admin">
          <AdminCRMDashboard />
        </SectionErrorBoundary>
      ) : activeTab === 'playbooks' ? (
        <SectionErrorBoundary key="playbooks" sectionName="Playbooks">
          <PlaybooksManager />
        </SectionErrorBoundary>
      ) : activeTab === 'copilot' ? (
        <SectionErrorBoundary key="copilot" sectionName="Copiloto">
          <SupervisorCopilot />
        </SectionErrorBoundary>
      ) : activeTab === 'training' ? (
        <SectionErrorBoundary key="training" sectionName="Modo Treinamento">
          <TrainingMode />
        </SectionErrorBoundary>
      ) : activeTab === 'crisis' ? (
        <SectionErrorBoundary key="crisis" sectionName="Sala de Crise">
          <CrisisRoom />
        </SectionErrorBoundary>
      ) : null}
    </div>
  );
}
