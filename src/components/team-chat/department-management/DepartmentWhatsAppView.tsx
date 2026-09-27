import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { Save } from 'lucide-react';
import { useDepartmentWhatsAppCredentials, useSaveDepartmentWhatsApp } from '@/hooks/team-chat/useDepartmentManagement';

type Mode = 'none' | 'evolution' | 'official';

interface Props {
  departmentId: string;
  currentUserName: string;
  isAdmin: boolean;
}

const MODE_CARDS: { mode: Mode; label: string; description: string }[] = [
  { mode: 'none', label: 'Nenhum', description: 'Sem integração WhatsApp' },
  { mode: 'evolution', label: 'Evolution', description: 'Evolution API auto-hospedada' },
  { mode: 'official', label: 'Oficial', description: 'API Oficial Meta' },
];

export function DepartmentWhatsAppView({ departmentId, currentUserName, isAdmin }: Props) {
  const [mode, setMode] = useState<Mode>('none');
  const [evolutionUrl, setEvolutionUrl] = useState('');
  const [evolutionApiKey, setEvolutionApiKey] = useState('');
  const [officialToken, setOfficialToken] = useState('');

  const { data: credentials } = useDepartmentWhatsAppCredentials(departmentId);
  const saveMutation = useSaveDepartmentWhatsApp(departmentId);

  useEffect(() => {
    if (!credentials) return;
    setMode(credentials.mode);
    setEvolutionUrl(credentials.evolution_url ?? '');
    // NEVER prefill API keys or tokens — blank = keep existing
  }, [credentials]);

  const handleSave = () => {
    saveMutation.mutate({
      mode,
      config: {
        evolution_url: evolutionUrl || undefined,
        evolution_api_key: evolutionApiKey || undefined,
        official_token: officialToken || undefined,
      },
      actorName: currentUserName,
    });
  };

  return (
    <div className="p-4 space-y-5">
      <div>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
          Modo de integração
        </p>
        <div className="grid grid-cols-3 gap-2">
          {MODE_CARDS.map(card => (
            <button
              key={card.mode}
              aria-pressed={mode === card.mode}
              onClick={() => isAdmin && setMode(card.mode)}
              disabled={!isAdmin}
              className={cn(
                'p-3 rounded-lg border text-left transition-colors',
                mode === card.mode
                  ? 'border-primary bg-primary/5 ring-1 ring-primary/30'
                  : 'border-border hover:border-muted-foreground/40',
                !isAdmin && 'opacity-60 cursor-not-allowed',
              )}
            >
              <p className="text-sm font-medium">{card.label}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{card.description}</p>
            </button>
          ))}
        </div>
      </div>

      {mode === 'evolution' && (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="evo-url">URL da Evolution API</Label>
            <Input
              id="evo-url"
              placeholder="https://evolution.exemplo.com"
              value={evolutionUrl}
              onChange={e => setEvolutionUrl(e.target.value)}
              disabled={!isAdmin}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="evo-key">API Key <span className="text-muted-foreground text-xs">(em branco = manter atual)</span></Label>
            <Input
              id="evo-key"
              type="password"
              placeholder="••••••••"
              value={evolutionApiKey}
              onChange={e => setEvolutionApiKey(e.target.value)}
              disabled={!isAdmin}
              autoComplete="new-password"
            />
          </div>
        </div>
      )}

      {mode === 'official' && (
        <div className="space-y-1.5">
          <Label htmlFor="official-token">Token <span className="text-muted-foreground text-xs">(em branco = manter atual)</span></Label>
          <Input
            id="official-token"
            type="password"
            placeholder="••••••••"
            value={officialToken}
            onChange={e => setOfficialToken(e.target.value)}
            disabled={!isAdmin}
            autoComplete="new-password"
          />
        </div>
      )}

      {isAdmin && (
        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={saveMutation.isPending} size="sm">
            <Save className="w-4 h-4 mr-1.5" />
            Salvar
          </Button>
        </div>
      )}
    </div>
  );
}
