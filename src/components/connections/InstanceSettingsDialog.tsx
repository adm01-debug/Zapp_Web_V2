import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useEvolutionApi } from '@/hooks/integrations/useEvolutionApi';
import { toast } from 'sonner';
import { Loader2, Settings, Shield, User, Tag } from 'lucide-react';
import { getLogger } from '@/lib/logger';
import { SettingsTabContent, PrivacyTabContent, LabelsTabContent } from './InstanceSettingsTabContent';

const log = getLogger('InstanceSettingsDialog');

interface InstanceSettingsDialogProps {
  open: boolean; onOpenChange: (open: boolean) => void; instanceName: string; connectionName: string;
}

const SETTINGS_ITEMS = [
  { key: 'rejectCall', label: 'Rejeitar chamadas', desc: 'Rejeita chamadas automaticamente' },
  { key: 'groupsIgnore', label: 'Ignorar grupos', desc: 'Não processar mensagens de grupos' },
  { key: 'alwaysOnline', label: 'Sempre online', desc: 'Mantém o status como online' },
  { key: 'readMessages', label: 'Leitura automática', desc: 'Marca mensagens como lidas automaticamente' },
  { key: 'readStatus', label: 'Ver status', desc: 'Marca status/stories como visualizados' },
  { key: 'syncFullHistory', label: 'Sincronizar histórico', desc: 'Baixa todo o histórico de mensagens' },
] as const;

const PRIVACY_ITEMS = [
  { key: 'readreceipts', label: 'Confirmação de leitura' }, { key: 'profile', label: 'Foto de perfil' },
  { key: 'status', label: 'Status/recado' }, { key: 'online', label: 'Online' },
  { key: 'last', label: 'Visto por último' }, { key: 'groupadd', label: 'Adicionar em grupos' },
] as const;

const PRIVACY_OPTIONS = [
  { value: 'all', label: 'Todos' }, { value: 'contacts', label: 'Contatos' },
  { value: 'contact_blacklist', label: 'Contatos exceto...' }, { value: 'none', label: 'Ninguém' },
];

export function InstanceSettingsDialog({ open, onOpenChange, instanceName, connectionName }: InstanceSettingsDialogProps) {
  const { getSettings, setSettings, fetchProfile, updateProfileName, updateProfileStatus, updateProfilePicture, removeProfilePicture, updatePrivacySettings, findLabels, isLoading } = useEvolutionApi();

  const [settingsData, setSettingsData] = useState<Record<string, boolean | string>>({ rejectCall: false, msgCall: '', groupsIgnore: false, alwaysOnline: false, readMessages: false, readStatus: false, syncFullHistory: false });
  const [profile, setProfile] = useState({ name: '', status: '', pictureUrl: '' });
  const [privacy, setPrivacy] = useState<Record<string, string>>({ readreceipts: 'all', profile: 'all', status: 'contacts', online: 'all', last: 'contacts', groupadd: 'contacts' });
  const [labels, setLabels] = useState<{ id: string; name: string; color: string }[]>([]);
  const [loadingTab, setLoadingTab] = useState('');

  useEffect(() => { if (open && instanceName) { loadSettings(); loadProfile(); } }, [open, instanceName]);

  const loadSettings = async () => {
    setLoadingTab('settings');
    try { const data = await getSettings(instanceName); if (data) setSettingsData({ rejectCall: data.rejectCall ?? false, msgCall: data.msgCall ?? '', groupsIgnore: data.groupsIgnore ?? false, alwaysOnline: data.alwaysOnline ?? false, readMessages: data.readMessages ?? false, readStatus: data.readStatus ?? false, syncFullHistory: data.syncFullHistory ?? false }); }
    catch (err) { log.error('Error loading settings:', err); }
    setLoadingTab('');
  };

  const loadProfile = async () => {
    try { const data = await fetchProfile(instanceName); if (data) setProfile({ name: data.name ?? '', status: data.status ?? '', pictureUrl: data.profilePictureUrl ?? '' }); }
    catch (err) { log.error('Error loading profile:', err); }
  };

  const loadLabels = async () => {
    setLoadingTab('labels');
    try { const data = await findLabels(instanceName); if (Array.isArray(data)) setLabels(data); }
    catch (err) { log.error('Error loading labels:', err); }
    setLoadingTab('');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Settings className="w-5 h-5 text-primary" />Configurações — {connectionName}</DialogTitle>
          <DialogDescription>Gerencie configurações, perfil, privacidade e etiquetas da instância</DialogDescription>
        </DialogHeader>
        <Tabs defaultValue="settings" onValueChange={(v) => { if (v === 'labels') loadLabels(); }}>
          <TabsList className="grid grid-cols-4 w-full">
            <TabsTrigger value="settings"><Settings className="w-4 h-4 mr-1" /> Config</TabsTrigger>
            <TabsTrigger value="profile"><User className="w-4 h-4 mr-1" /> Perfil</TabsTrigger>
            <TabsTrigger value="privacy"><Shield className="w-4 h-4 mr-1" /> Privacidade</TabsTrigger>
            <TabsTrigger value="labels"><Tag className="w-4 h-4 mr-1" /> Etiquetas</TabsTrigger>
          </TabsList>

          <TabsContent value="settings">
            <SettingsTabContent settingsData={settingsData} settingsItems={SETTINGS_ITEMS} onChange={(k, v) => setSettingsData(p => ({ ...p, [k]: v }))}
              onSave={async () => { try { await setSettings({ instanceName, ...settingsData }); toast.success('Configurações salvas!'); } catch { toast.error('Erro ao salvar'); } }} isLoading={isLoading} />
          </TabsContent>

          <TabsContent value="profile" className="space-y-4 mt-4">
            {profile.pictureUrl && <div className="flex justify-center"><img src={profile.pictureUrl} alt="Profile" className="w-24 h-24 rounded-full object-cover border-2 border-primary/30" /></div>}
            <div><Label>Nome</Label><Input value={profile.name} onChange={(e) => setProfile(p => ({ ...p, name: e.target.value }))} placeholder="Nome do perfil" /></div>
            <div><Label>Recado (Status)</Label><Input value={profile.status} onChange={(e) => setProfile(p => ({ ...p, status: e.target.value }))} placeholder="Seu recado aqui..." /></div>
            <div><Label>Nova foto de perfil (URL)</Label>
              <div className="flex gap-2">
                <Input value={profile.pictureUrl} onChange={(e) => setProfile(p => ({ ...p, pictureUrl: e.target.value }))} placeholder="https://exemplo.com/foto.jpg" />
                <Button variant="outline" size="sm" onClick={async () => { try { if (profile.pictureUrl) { await updateProfilePicture(instanceName, profile.pictureUrl); toast.success('Foto atualizada!'); } } catch { toast.error('Erro ao atualizar foto'); } }}>Aplicar</Button>
                <Button variant="destructive" size="sm" onClick={async () => { try { await removeProfilePicture(instanceName); setProfile(p => ({ ...p, pictureUrl: '' })); toast.success('Foto removida'); } catch { toast.error('Erro ao remover foto'); } }}>Remover</Button>
              </div>
            </div>
            <Button onClick={async () => { try { if (profile.name) await updateProfileName(instanceName, profile.name); if (profile.status) await updateProfileStatus(instanceName, profile.status); toast.success('Perfil atualizado!'); } catch { toast.error('Erro ao atualizar perfil'); } }} disabled={isLoading} className="w-full">
              {isLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Salvar Perfil
            </Button>
          </TabsContent>

          <TabsContent value="privacy">
            <PrivacyTabContent privacy={privacy} privacyItems={PRIVACY_ITEMS} privacyOptions={PRIVACY_OPTIONS} onChange={(k, v) => setPrivacy(p => ({ ...p, [k]: v }))}
              onSave={async () => { try { await updatePrivacySettings({ instanceName, ...privacy }); toast.success('Privacidade atualizada!'); } catch { toast.error('Erro ao atualizar'); } }} isLoading={isLoading} />
          </TabsContent>

          <TabsContent value="labels"><LabelsTabContent labels={labels} loading={loadingTab === 'labels'} /></TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
