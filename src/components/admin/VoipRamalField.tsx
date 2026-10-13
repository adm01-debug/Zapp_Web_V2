import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { KeyRound, Loader2, Phone } from 'lucide-react';

// Limite do ramal no banco: `check (ramal ~ '^[0-9A-Za-z][0-9A-Za-z._@+-]{0,63}$')`
// (supabase/migrations/20261013230011_voip_profile_credentials.sql). O maxLength do
// input evita digitar além do que a RPC aceita.
const RAMAL_MAX_LENGTH = 64;

interface VoipRamalFieldProps {
  /**
   * Provisiona a credencial do atendente pela RPC `set_voip_profile_credentials`
   * (ramal + senha no Vault). Devolve `true` quando gravou.
   */
  onSave: (ramal: string, sipPassword: string) => Promise<boolean>;
}

/**
 * Bloco "Telefonia (ramal)" do formulário de usuário, visível só para admin.
 *
 * A senha SIP NUNCA é exibida: o campo nasce vazio, é `type="password"` e, depois de
 * salvo, é limpo — a credencial fica cifrada no Vault e não há leitura pelo PostgREST.
 */
export function VoipRamalField({ onSave }: VoipRamalFieldProps) {
  const [ramal, setRamal] = useState('');
  const [sipPassword, setSipPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null);

  const podeSalvar = ramal.trim().length > 0 && sipPassword.length > 0 && !saving;

  const handleSalvar = async () => {
    if (!podeSalvar) return;
    setSaving(true);
    setFeedback(null);
    const ok = await onSave(ramal.trim(), sipPassword);
    setSaving(false);
    if (ok) {
      // Limpa a senha depois de gravar: ela não volta para a tela.
      setSipPassword('');
      setFeedback({
        tipo: 'ok',
        texto: 'Ramal salvo. A senha fica guardada no cofre e não é exibida novamente.',
      });
    } else {
      setFeedback({ tipo: 'erro', texto: 'Não foi possível salvar o ramal.' });
    }
  };

  return (
    <div className="space-y-3 rounded-lg border border-secondary/30 p-4">
      <div className="space-y-0.5">
        <span className="text-sm font-medium">Telefonia (ramal)</span>
        <p id="edit_ramal_ajuda" className="text-xs text-muted-foreground">
          Define o ramal SIP deste atendente para as ligações. Cada ramal pertence a um único
          atendente.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="edit_ramal" className="flex items-center gap-1 text-xs">
            <Phone className="h-3 w-3" /> Ramal
          </Label>
          <Input
            id="edit_ramal"
            value={ramal}
            maxLength={RAMAL_MAX_LENGTH}
            placeholder="Ex: 2001"
            autoComplete="off"
            aria-describedby="edit_ramal_ajuda"
            onChange={(e) => setRamal(e.target.value)}
            disabled={saving}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="edit_sip_senha" className="flex items-center gap-1 text-xs">
            <KeyRound className="h-3 w-3" /> Senha SIP
          </Label>
          <Input
            id="edit_sip_senha"
            type="password"
            value={sipPassword}
            maxLength={256}
            placeholder="••••••••"
            autoComplete="new-password"
            aria-describedby="edit_sip_senha_ajuda"
            onChange={(e) => setSipPassword(e.target.value)}
            disabled={saving}
          />
          <p id="edit_sip_senha_ajuda" className="text-xs text-muted-foreground">
            A senha não é exibida depois de salva (fica cifrada no cofre).
          </p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          variant="outline"
          onClick={handleSalvar}
          disabled={!podeSalvar}
        >
          {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Salvar ramal
        </Button>
        <p
          role="status"
          aria-live="polite"
          className={
            feedback?.tipo === 'erro'
              ? 'text-xs text-destructive'
              : 'text-xs text-muted-foreground'
          }
        >
          {feedback?.texto ?? ''}
        </p>
      </div>
    </div>
  );
}
