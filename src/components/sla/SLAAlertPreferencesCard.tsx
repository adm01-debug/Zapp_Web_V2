import { AlertTriangle, BellRing, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { useSlaAlertPreferences } from '@/hooks/sla/useSlaAlertPreferences';
import type { SlaAlertPreferences } from '@/hooks/sla/slaAlertPreferences';

interface LinhaPreferencia {
  campo: keyof SlaAlertPreferences;
  titulo: string;
  descricao: string;
  /** Depende do liga/desliga geral: com os avisos desligados, o filho não tem efeito. */
  dependeDoGeral?: boolean;
}

const GRUPOS: Array<{ titulo: string; descricao: string; linhas: LinhaPreferencia[] }> = [
  {
    titulo: 'Avisos',
    descricao: 'O histórico de alertas continua sendo registrado mesmo com os avisos desligados.',
    linhas: [
      {
        campo: 'enabled',
        titulo: 'Receber alertas de SLA',
        descricao: 'Chave geral: desligada, nenhum aviso de prazo aparece para você.',
      },
    ],
  },
  {
    titulo: 'Quais prazos',
    descricao: 'Escolha os prazos que merecem aviso na sua tela.',
    linhas: [
      {
        campo: 'alertFirstResponse',
        titulo: 'Primeira resposta',
        descricao: 'Contato esperando a primeira resposta dentro do prazo.',
        dependeDoGeral: true,
      },
      {
        campo: 'alertResolution',
        titulo: 'Resolução',
        descricao: 'Prazo de resolução — vale quando o servidor medir esse prazo (SLA-RES).',
        dependeDoGeral: true,
      },
    ],
  },
  {
    titulo: 'Severidade',
    descricao: 'Risco avisa antes do estouro; violado avisa depois que o prazo passou.',
    linhas: [
      {
        campo: 'severityWarning',
        titulo: 'Em risco',
        descricao: 'Aviso antecipado, a 70% do prazo.',
        dependeDoGeral: true,
      },
      {
        campo: 'severityBreached',
        titulo: 'Violado',
        descricao: 'O prazo já estourou.',
        dependeDoGeral: true,
      },
    ],
  },
];

/**
 * Preferências de alerta de SLA do usuário (`sla_alert_preferences`).
 *
 * Cada interruptor grava na hora (upsert da própria linha, RLS `user_id = auth.uid()`) e é lido pelo
 * monitor de alertas (`useSLANotifications`) antes de exibir qualquer aviso — inclusive som e
 * notificação do navegador. O otimismo mora no hook (cache do React Query com devolução em caso de
 * recusa), então a tela não guarda cópia própria do valor.
 */
export const SLAAlertPreferencesCard = () => {
  const { preferences, isLoading, isError, isSaving, save, refetch } = useSlaAlertPreferences();

  const alternar = (campo: keyof SlaAlertPreferences, valor: boolean): void => {
    save({ ...preferences, [campo]: valor });
  };

  if (isLoading) {
    return (
      <Card className="p-5" data-testid="sla-preferencias-carregando">
        <Skeleton className="h-6 w-40" />
        <div className="mt-4 space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-12" />
          ))}
        </div>
      </Card>
    );
  }

  if (isError) {
    return (
      <Card className="p-5 text-center" data-testid="sla-preferencias-erro">
        <AlertTriangle className="mx-auto mb-3 h-10 w-10 text-destructive" />
        <h3 className="text-sm font-semibold text-foreground">
          Não foi possível carregar suas preferências de alerta
        </h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Sem elas valem os padrões do sistema. A leitura falhou — não é ausência de preferência.
        </p>
        <Button variant="outline" className="mt-4 gap-2" onClick={() => refetch()}>
          <RefreshCw className="h-4 w-4" />
          Tentar de novo
        </Button>
      </Card>
    );
  }

  return (
    <Card className="p-5" data-testid="sla-preferencias-painel">
      <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
        <BellRing className="h-5 w-5 text-primary" />
        Como você quer ser avisado
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Vale só para a sua conta — o time continua recebendo os avisos dele.
      </p>

      {GRUPOS.map((grupo) => (
        <section key={grupo.titulo} className="mt-5">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {grupo.titulo}
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">{grupo.descricao}</p>
          <div className="mt-2 space-y-2">
            {grupo.linhas.map((linha) => {
              const desabilitado = Boolean(linha.dependeDoGeral) && !preferences.enabled;
              return (
                <div
                  key={linha.campo}
                  className="flex items-start justify-between gap-3 rounded-xl border border-border/60 p-3"
                >
                  <div className="min-w-0">
                    <Label htmlFor={`sla-alerta-pref-${linha.campo}`} className="text-sm">
                      {linha.titulo}
                    </Label>
                    <p className="mt-0.5 text-xs text-muted-foreground">{linha.descricao}</p>
                  </div>
                  <Switch
                    id={`sla-alerta-pref-${linha.campo}`}
                    data-testid={`sla-pref-${linha.campo}`}
                    checked={preferences[linha.campo]}
                    disabled={desabilitado || isSaving}
                    onCheckedChange={(valor) => alternar(linha.campo, valor)}
                  />
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </Card>
  );
};
