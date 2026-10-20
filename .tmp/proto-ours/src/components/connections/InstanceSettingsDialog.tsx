import { useState, useEffect, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useEvolutionApi } from '@/hooks/integrations/useEvolutionApi';
import { toast } from 'sonner';
import { AlertTriangle, Loader2, Settings, Shield, User } from 'lucide-react';
import { getLogger } from '@/lib/logger';
import { SettingsTabContent, PrivacyTabContent } from './InstanceSettingsTabContent';

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

/**
 * Campos conhecidos da configuração da instância — a MESMA lista que a Edge
 * devolve (`get-settings`). Campo que a Edge NÃO devolveu não é "desligado":
 * aparece como "Indisponível nesta versão" e fica fora do payload de gravação.
 */
const SETTINGS_FIELDS = [
  'rejectCall', 'msgCall', 'groupsIgnore', 'alwaysOnline', 'readMessages', 'readStatus', 'syncFullHistory',
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

const ERRO_CONFIG = 'Não foi possível ler as configurações desta conexão.';
const ERRO_PERFIL = 'Não foi possível ler o perfil desta conexão.';
const URL_FOTO_MAX = 2048;

/** Valida a URL da foto de perfil (http(s) e tamanho máximo). Devolve o problema em pt-BR, ou null. */
function validarUrlFoto(valor: string): string | null {
  const url = valor.trim();
  if (!url) return 'Informe a URL da foto de perfil.';
  if (url.length > URL_FOTO_MAX) return `A URL da foto não pode passar de ${URL_FOTO_MAX} caracteres.`;
  let parsed: URL;
  try { parsed = new URL(url); }
  catch { return 'URL inválida: use um endereço http:// ou https://.'; }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return 'A URL da foto precisa começar com http:// ou https://.';
  }
  return null;
}

export function InstanceSettingsDialog({ open, onOpenChange, instanceName, connectionName }: InstanceSettingsDialogProps) {
  const { getSettings, setSettings, fetchProfile, updateProfileName, updateProfileStatus, updateProfilePicture, removeProfilePicture, updatePrivacySettings, isLoading } = useEvolutionApi();

  const [settingsData, setSettingsData] = useState<Record<string, boolean | string>>({ rejectCall: false, msgCall: '', groupsIgnore: false, alwaysOnline: false, readMessages: false, readStatus: false, syncFullHistory: false });
  const [camposIndisponiveis, setCamposIndisponiveis] = useState<readonly string[]>([]);
  const [erroConfig, setErroConfig] = useState('');
  const [carregandoConfig, setCarregandoConfig] = useState(false);
  const [profile, setProfile] = useState({ name: '', status: '', pictureUrl: '' });
  // R2-API-040: o rascunho guarda SÓ os campos que o operador escolheu. Nada de
  // valor local servindo de "configuração atual" — campo intocado fica fora do
  // payload e o provedor mantém o que já estava lá (merge no backend).
  const [privacy, setPrivacy] = useState<Record<string, string>>({});
  const [labels, setLabels] = useState<{ id: string; name: string; color: string }[]>([]);
  const [loadingTab, setLoadingTab] = useState('');

  const loadSettings = useCallback(async () => {
    setErroConfig('');
    setCarregandoConfig(true);
    try {
      const data = await getSettings(instanceName);
      const recebido: Record<string, unknown> = (data && typeof data === 'object' && !Array.isArray(data)) ? data as Record<string, unknown> : {};
      // Leitura que falha NUNCA vira interruptor desligado: o que a Edge não
      // devolveu fica marcado como indisponível, e o erro tem "Tentar de novo".
      setCamposIndisponiveis(SETTINGS_FIELDS.filter((campo) => !(campo in recebido)));
      setSettingsData({
        rejectCall: recebido.rejectCall === true,
        msgCall: typeof recebido.msgCall === 'string' ? recebido.msgCall : '',
        groupsIgnore: recebido.groupsIgnore === true,
        alwaysOnline: recebido.alwaysOnline === true,
        readMessages: recebido.readMessages === true,
        readStatus: recebido.readStatus === true,
        syncFullHistory: recebido.syncFullHistory === true,
      });
    } catch (err) {
      log.error('Error loading settings:', err);
      setErroConfig(ERRO_CONFIG);
      setCamposIndisponiveis([]);
    }
    setCarregandoConfig(false);
  }, [getSettings, instanceName]);

  const loadProfile = useCallback(async () => {
    setErroPerfil('');
    setCarregandoPerfil(true);
    try {
      const data = await fetchProfile(instanceName);
      setProfile({ name: data?.name ?? '', status: data?.status ?? '', pictureUrl: data?.profilePictureUrl ?? '' });
    } catch (err) {
      log.error('Error loading profile:', err);
      setErroPerfil(ERRO_PERFIL);
    }
    setCarregandoPerfil(false);
  }, [fetchProfile, instanceName]);

  useEffect(() => {
    if (open && instanceName) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-open padrão, sem estado derivado de props para sincronizar.
      void loadSettings();
      void loadProfile();
    }
  }, [open, instanceName, loadSettings, loadProfile]);

  useEffect(() => {
    // O rascunho de privacidade pertence à conexão aberta: trocar de instância (ou
    // reabrir o diálogo) descarta o que foi escolhido antes, para não enviar valor
    // de uma conta para outra (R2-API-040).
    // eslint-disable-next-line react-hooks/set-state-in-effect -- limpeza de rascunho local na troca de instância, sem estado derivado de props para sincronizar.
    setPrivacy({});
  }, [open, instanceName]);

  /** Só entra no rascunho o campo que o operador escolheu; "Manter atual" (vazio) sai dele. */
  const handlePrivacyChange = (key: string, value: string) => {
    setPrivacy((prev) => {
      if (!value) { const resto = { ...prev }; delete resto[key]; return resto; }
      return { ...prev, [key]: value };
    });
  };

  const loadLabels = async () => {
    setLoadingTab('labels');
    try { const data = await findLabels(instanceName); if (Array.isArray(data)) setLabels(data); }
    catch (err) { log.error('Error loading labels:', err); }
    setLoadingTab('');
  };

  /** Grava só os campos que a Edge devolveu: valor que a tela não leu não é reescrito. */
  const salvarConfiguracoes = async () => {
    const dados = { ...settingsData };
    for (const campo of camposIndisponiveis) delete dados[campo];
    try { await setSettings({ instanceName, ...dados }); toast.success('Configurações salvas!'); }
    catch { toast.error('Erro ao salvar'); }
  };

  const salvarPerfil = async () => {
    try {
      if (profile.name) await updateProfileName(instanceName, profile.name);
      // O recado vai mesmo vazio: é assim que o operador APAGA o que estava lá.
      await updateProfileStatus(instanceName, profile.status);
      toast.success('Perfil atualizado!');
    } catch { toast.error('Erro ao atualizar perfil'); }
  };

  const aplicarFoto = async () => {
    const problema = validarUrlFoto(profile.pictureUrl);
    if (problema) { toast.error(problema); return; }
    try { await updateProfilePicture(instanceName, profile.pictureUrl.trim()); toast.success('Foto atualizada!'); }
    catch { toast.error('Erro ao atualizar foto'); }
  };

  const removerFoto = async () => {
    try { await removeProfilePicture(instanceName); setProfile(p => ({ ...p, pictureUrl: '' })); toast.success('Foto removida'); }
    catch { toast.error('Erro ao remover foto'); }
  };

  const erroLeitura = (mensagem: string, tentarDeNovo: () => void) => (
    <div role="alert" className="flex flex-col gap-3 mt-4 p-3 rounded-lg border border-destructive/40 bg-destructive/5">
      <p className="flex items-center gap-2 text-sm">
        <AlertTriangle className="w-4 h-4 text-destructive shrink-0" aria-hidden="true" />{mensagem}
      </p>
      <Button variant="outline" size="sm" className="self-start" onClick={tentarDeNovo}>Tentar de novo</Button>
    </div>
  );

  const carregando = (rotulo: string) => (
    <div role="status" className="flex justify-center py-8">
      <Loader2 className="w-6 h-6 motion-safe:animate-spin text-primary" aria-hidden="true" />
      <span className="sr-only">{rotulo}</span>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent aria-describedby={undefined} className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Settings className="w-5 h-5 text-primary" />Configurações — {connectionName}</DialogTitle>
          <DialogDescription>Gerencie configurações, perfil e privacidade da instância</DialogDescription>
        </DialogHeader>
        <Tabs defaultValue="settings">
          <TabsList className="flex w-full justify-start overflow-x-auto">
            <TabsTrigger value="settings" className="shrink-0"><Settings className="w-4 h-4 mr-1" /> Config</TabsTrigger>
            <TabsTrigger value="profile" className="shrink-0"><User className="w-4 h-4 mr-1" /> Perfil</TabsTrigger>
            <TabsTrigger value="privacy" className="shrink-0"><Shield className="w-4 h-4 mr-1" /> Privacidade</TabsTrigger>
          </TabsList>

          <TabsContent value="settings">
            {carregandoConfig ? carregando('Carregando configurações da instância')
              : erroConfig ? erroLeitura(erroConfig, () => { void loadSettings(); })
              : <SettingsTabContent settingsData={settingsData} settingsItems={SETTINGS_ITEMS} camposIndisponiveis={camposIndisponiveis}
                onChange={(k, v) => setSettingsData(p => ({ ...p, [k]: v }))} onSave={() => { void salvarConfiguracoes(); }} isLoading={isLoading} />}
          </TabsContent>

          <TabsContent value="profile" className="space-y-4 mt-4">
            {carregandoPerfil ? carregando('Carregando perfil da instância')
              : erroPerfil ? erroLeitura(erroPerfil, () => { void loadProfile(); })
              : <>
                {profile.pictureUrl && <div className="flex justify-center"><img src={profile.pictureUrl} alt="Profile" className="w-24 h-24 rounded-full object-cover border-2 border-primary/30" /></div>}
                <div><Label>Nome</Label><Input value={profile.name} onChange={(e) => setProfile(p => ({ ...p, name: e.target.value }))} placeholder="Nome do perfil" /></div>
                <div><Label>Recado (Status)</Label><Input value={profile.status} onChange={(e) => setProfile(p => ({ ...p, status: e.target.value }))} placeholder="Seu recado aqui..." /></div>
                <div><Label>Nova foto de perfil (URL)</Label>
                  <div className="flex gap-2">
                    <Input value={profile.pictureUrl} onChange={(e) => setProfile(p => ({ ...p, pictureUrl: e.target.value }))} placeholder="https://exemplo.com/foto.jpg" />
                    <Button variant="outline" size="sm" onClick={() => { void aplicarFoto(); }}>Aplicar</Button>
                    <Button variant="destructive" size="sm" onClick={() => { void removerFoto(); }}>Remover</Button>
                  </div>
                </div>
                <Button onClick={() => { void salvarPerfil(); }} disabled={isLoading} className="w-full">
                  {isLoading && <Loader2 className="w-4 h-4 mr-2 motion-safe:animate-spin" />}Salvar Perfil
                </Button>
              </>}
          </TabsContent>

          <TabsContent value="privacy">
            <PrivacyTabContent privacy={privacy} privacyItems={PRIVACY_ITEMS} privacyOptions={PRIVACY_OPTIONS} onChange={handlePrivacyChange}
              onSave={async () => {
                // Nada alterado → nada é enviado: sem padrão local sobrescrevendo a conta.
                if (Object.keys(privacy).length === 0) return;
                try { await updatePrivacySettings({ instanceName, ...privacy }); setPrivacy({}); toast.success('Privacidade atualizada!'); } catch { toast.error('Erro ao atualizar'); }
              }} isLoading={isLoading} />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
