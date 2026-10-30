import { useState } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { BellRing, Mail, PlugZap, Unplug, type LucideIcon } from 'lucide-react';
import {
  useConnectionAlertPreferences,
  type ConnectionAlertPreferences as ConnectionAlertPreferencesValues,
} from '@/hooks/system/useConnectionAlertPreferences';

/**
 * PD-38/39 (paridade V3): secao de Configuracoes com as QUATRO preferencias, por
 * usuario, de como e quando avisar sobre a saude da conexao de WhatsApp.
 *
 * Os CANAIS (push do navegador / e-mail) escolhem POR ONDE o aviso sai; os TIPOS
 * (degradada / desconectada) ligam e desligam o aviso. Cada interruptor grava na
 * hora pelo hook `useConnectionAlertPreferences` (upsert otimista com rollback).
 */
type PreferenceKey = keyof ConnectionAlertPreferencesValues;

interface PreferenceRow {
  key: PreferenceKey;
  label: string;
  description: string;
  icon: LucideIcon;
}

const CANAIS: PreferenceRow[] = [
  {
    key: 'push_enabled',
    label: 'Notificação do navegador',
    description:
      'Mostra um aviso do navegador quando a conexão de WhatsApp oscilar ou cair.',
    icon: BellRing,
  },
  {
    key: 'email_enabled',
    label: 'E-mail',
    description:
      'Envia o aviso para o seu e-mail. Depende do envio de e-mail estar configurado na instalação (PK-15).',
    icon: Mail,
  },
];

const TIPOS: PreferenceRow[] = [
  {
    key: 'alert_on_degraded',
    label: 'Conexão instável',
    description:
      'Avisa quando a conexão de WhatsApp oscilar, mesmo sem ter caído de vez.',
    icon: PlugZap,
  },
  {
    key: 'alert_on_disconnected',
    label: 'Conexão desconectada',
    description: 'Avisa quando a conexão de WhatsApp cair.',
    icon: Unplug,
  },
];

export function ConnectionAlertPreferences() {
  const { preferences, isLoading, isError: isLoadError, isSaving, updatePreferenceAsync } =
    useConnectionAlertPreferences();
  const [error, setError] = useState<string | null>(null);

  const handleToggle = async (key: PreferenceKey, value: boolean) => {
    setError(null);
    try {
      await updatePreferenceAsync({ [key]: value });
    } catch {
      setError('Não foi possível salvar a preferência. Tente novamente.');
    }
  };

  const renderRow = (row: PreferenceRow) => {
    const Icon = row.icon;
    const id = `connection-alert-${row.key}`;
    const descId = `${id}-descricao`;
    return (
      <div key={row.key} className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <Icon className="mt-0.5 h-4 w-4 text-muted-foreground" aria-hidden="true" />
          <div className="space-y-0.5">
            <Label htmlFor={id} className="font-medium text-foreground">
              {row.label}
            </Label>
            <p id={descId} className="text-sm text-muted-foreground">
              {row.description}
            </p>
          </div>
        </div>
        <Switch
          id={id}
          checked={preferences[row.key]}
          disabled={isLoading}
          onCheckedChange={(value) => {
            void handleToggle(row.key, value);
          }}
          aria-label={`${row.label} — ${preferences[row.key] ? 'ativado' : 'desativado'}`}
          aria-describedby={descId}
        />
      </div>
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <BellRing className="h-5 w-5 text-primary" aria-hidden="true" />
          Alertas de conexão
        </CardTitle>
        <CardDescription>
          Escolha como e quando ser avisado quando a conexão de WhatsApp oscilar ou
          cair. As preferências são suas: valem só para a sua conta.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <section className="space-y-4" aria-labelledby="connection-alert-canais">
          <h3
            id="connection-alert-canais"
            className="text-sm font-medium text-foreground"
          >
            Como avisar
          </h3>
          {CANAIS.map(renderRow)}
        </section>

        <section
          className="space-y-4 border-t pt-4"
          aria-labelledby="connection-alert-tipos"
        >
          <h3
            id="connection-alert-tipos"
            className="text-sm font-medium text-foreground"
          >
            Quando avisar
          </h3>
          {TIPOS.map(renderRow)}
        </section>

        <p className="text-sm text-muted-foreground" aria-live="polite">
          {isSaving ? 'Salvando…' : 'As alterações são salvas automaticamente.'}
        </p>

        {isLoadError && (
          <p role="alert" className="text-sm text-destructive">
            Não foi possível carregar as preferências. Recarregue a página.
          </p>
        )}

        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
