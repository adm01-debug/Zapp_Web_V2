import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Clock, Loader2, Save } from 'lucide-react';
import { motion } from '@/components/ui/motion';
import { cn } from '@/lib/utils';
import { useBusinessHours, type BusinessHour } from '@/hooks/business/useBusinessHours';
import { useConnectionsManager } from '@/hooks/inbox/useConnectionsManager';

// Item 273-A (R2-AUTH-049): a aba Horário é o editor do contrato versionado
// `business_hours` POR CONEXÃO — a tabela lida por `is_within_business_hours`
// (SECURITY DEFINER) e pelas telas que checam horário de atendimento. Ela não
// grava mais as preferências pessoais `user_settings.business_hours_*`.
const DAYS_OF_WEEK = [
  { value: 0, label: 'Domingo' },
  { value: 1, label: 'Segunda-feira' },
  { value: 2, label: 'Terça-feira' },
  { value: 3, label: 'Quarta-feira' },
  { value: 4, label: 'Quinta-feira' },
  { value: 5, label: 'Sexta-feira' },
  { value: 6, label: 'Sábado' },
];

const DEFAULT_OPEN_TIME = '09:00';
const DEFAULT_CLOSE_TIME = '18:00';
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

function normalizeTime(value: string | null | undefined, fallback: string) {
  return typeof value === 'string' && TIME_PATTERN.test(value) ? value : fallback;
}

/**
 * Semana completa (day_of_week 0-6) com o que voltou do banco. Dia sem linha
 * na tabela entra fechado, para o upsert nunca receber valor fora do contrato.
 */
function weekFromRows(rows: BusinessHour[], connectionId: string): BusinessHour[] {
  return DAYS_OF_WEEK.map(({ value }) => {
    const row = rows.find((hour) => hour.day_of_week === value);
    return {
      whatsapp_connection_id: connectionId,
      day_of_week: value,
      is_open: row?.is_open === true,
      open_time: normalizeTime(row?.open_time, DEFAULT_OPEN_TIME),
      close_time: normalizeTime(row?.close_time, DEFAULT_CLOSE_TIME),
    };
  });
}

export function ScheduleSettings() {
  const { connections, loading: isLoadingConnections } = useConnectionsManager();
  const [chosenConnectionId, setChosenConnectionId] = useState<string | null>(null);
  const [draftHours, setDraftHours] = useState<BusinessHour[] | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Padrão: a conexão marcada como `is_default`; sem nenhuma, a primeira da lista.
  const defaultConnection = connections.find((connection) => connection.is_default) ?? connections[0];
  const selectedConnectionId = chosenConnectionId ?? defaultConnection?.id ?? '';

  const { businessHours, awayMessage, isLoading, isSaving, saveSettings } = useBusinessHours(selectedConnectionId);

  const loadedHours = useMemo(
    () => (selectedConnectionId ? weekFromRows(businessHours, selectedConnectionId) : []),
    [businessHours, selectedConnectionId]
  );
  // O que o usuário mexeu manda; sem rascunho, a tela reflete o que voltou do banco.
  const hours = draftHours ?? loadedHours;

  const handleConnectionChange = (connectionId: string) => {
    setDraftHours(null);
    setSaveError(null);
    setChosenConnectionId(connectionId);
  };

  const updateHour = (dayOfWeek: number, field: keyof BusinessHour, value: string | boolean) => {
    setSaveError(null);
    setDraftHours(hours.map((hour) => (hour.day_of_week === dayOfWeek ? { ...hour, [field]: value } : hour)));
  };

  /**
   * O upsert só aceita o contrato de `business_hours`: dia 0-6, `is_open`
   * booleano e horários `HH:MM`. Dia aberto com horário vazio ou fora do
   * padrão (o campo de hora deixa limpar o valor) é barrado aqui, antes de
   * qualquer chamada ao banco.
   */
  const invalidOpenDay = hours.find(
    (hour) => hour.is_open && (!TIME_PATTERN.test(hour.open_time) || !TIME_PATTERN.test(hour.close_time))
  );

  const handleSave = async () => {
    if (!selectedConnectionId) return;
    if (invalidOpenDay) {
      const dia = DAYS_OF_WEEK.find((item) => item.value === invalidOpenDay.day_of_week);
      setSaveError(
        `Informe abertura e fechamento de ${dia?.label ?? `dia ${invalidOpenDay.day_of_week}`} no formato HH:MM (ex.: 09:00).`
      );
      return; // Nada é enviado ao banco.
    }
    setSaveError(null);
    try {
      await saveSettings(hours, awayMessage);
      // `saveSettings` é `mutateAsync` (useBusinessHours): resolve no sucesso e
      // rejeita no erro. No sucesso o rascunho é zerado para a tela voltar a
      // refletir o que o banco devolveu; na falha ele fica como está.
      setDraftHours(null);
    } catch {
      // O hook já mostra a falha na tela (toast destrutivo); o rascunho permanece.
    }
  };

  const selectedConnection = connections.find((connection) => connection.id === selectedConnectionId);
  const showHours = !!selectedConnectionId && !isLoading && !isLoadingConnections;

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
      <Card className="border border-secondary/20 bg-card hover:border-secondary/30 transition-all">
        <CardHeader>
          <h2 className="text-2xl font-semibold leading-none tracking-tight flex items-center gap-2">
            <Clock className="w-5 h-5 text-whatsapp" />
            Horário de Atendimento
          </h2>
          <CardDescription>
            Defina em quais dias e horários cada conexão está aberta: é o que a checagem
            is_within_business_hours usa nas telas que dependem do horário de atendimento.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="schedule-connection">Conexão</Label>
            <Select value={selectedConnectionId} onValueChange={handleConnectionChange}>
              <SelectTrigger id="schedule-connection" className="w-full sm:w-72">
                <SelectValue placeholder="Selecione a conexão" />
              </SelectTrigger>
              <SelectContent>
                {connections.map((connection) => (
                  <SelectItem key={connection.id} value={connection.id}>
                    {connection.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedConnection?.is_default && (
              <p className="text-xs text-muted-foreground">Conexão padrão</p>
            )}
          </div>

          {!showHours ? (
            <div className="flex items-center justify-center py-8">
              {isLoading || isLoadingConnections ? (
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              ) : (
                <p className="text-sm text-muted-foreground">Nenhuma conexão cadastrada.</p>
              )}
            </div>
          ) : (
            <>
              <div className="space-y-3">
                {hours.map((hour) => {
                  const day = DAYS_OF_WEEK.find((item) => item.value === hour.day_of_week);
                  return (
                    <div
                      key={hour.day_of_week}
                      className={cn(
                        'flex flex-wrap items-center gap-4 p-3 rounded-lg border transition-colors',
                        hour.is_open ? 'border-secondary/30 bg-secondary/5' : 'border-border bg-muted/30'
                      )}
                    >
                      <div className="flex items-center gap-2 w-44">
                        <Switch
                          checked={hour.is_open}
                          onCheckedChange={(checked) => updateHour(hour.day_of_week, 'is_open', checked)}
                          aria-label={`${day?.label} aberto`}
                        />
                        <span className={cn('font-medium', !hour.is_open && 'text-muted-foreground')}>{day?.label}</span>
                      </div>

                      {hour.is_open ? (
                        <>
                          <div className="flex items-center gap-2">
                            <Label className="text-xs text-muted-foreground">De</Label>
                            <Input
                              type="time"
                              aria-label={`${day?.label} abertura`}
                              value={hour.open_time}
                              onChange={(e) => updateHour(hour.day_of_week, 'open_time', e.target.value)}
                              className="w-28"
                            />
                          </div>
                          <div className="flex items-center gap-2">
                            <Label className="text-xs text-muted-foreground">Até</Label>
                            <Input
                              type="time"
                              aria-label={`${day?.label} fechamento`}
                              value={hour.close_time}
                              onChange={(e) => updateHour(hour.day_of_week, 'close_time', e.target.value)}
                              className="w-28"
                            />
                          </div>
                        </>
                      ) : (
                        <span className="text-sm text-muted-foreground">Fechado</span>
                      )}
                    </div>
                  );
                })}
              </div>

              {saveError && (
                <p role="alert" className="text-sm text-destructive">
                  {saveError}
                </p>
              )}

              <Button
                onClick={handleSave}
                disabled={isSaving || isLoading}
                className="bg-whatsapp hover:bg-whatsapp-dark text-primary-foreground"
              >
                {isSaving ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Salvando...
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4 mr-2" />
                    Salvar Horários
                  </>
                )}
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}
