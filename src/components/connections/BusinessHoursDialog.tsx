/* eslint-disable react-refresh/only-export-components -- PL-06 (t_c5497c51): validação da janela e prévia da mensagem são contrato do cartão no próprio arquivo, junto do diálogo que as usa. */
import { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, Clock, MessageSquare, Save, Copy } from 'lucide-react';
import { toast } from '@/hooks/ui/use-toast';
import { cn } from '@/lib/utils';
import { useBusinessHours, BusinessHour, AwayMessage } from '@/hooks/business/useBusinessHours';
import { classificarJanela } from './BusinessHoursIndicator';

interface BusinessHoursDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  connectionId: string;
  connectionName: string;
}

const DAYS_OF_WEEK = [
  { value: 0, label: 'Domingo', short: 'Dom' },
  { value: 1, label: 'Segunda-feira', short: 'Seg' },
  { value: 2, label: 'Terça-feira', short: 'Ter' },
  { value: 3, label: 'Quarta-feira', short: 'Qua' },
  { value: 4, label: 'Quinta-feira', short: 'Qui' },
  { value: 5, label: 'Sexta-feira', short: 'Sex' },
  { value: 6, label: 'Sábado', short: 'Sáb' },
];

/**
 * Coluna do PL-04 (`away_messages.enabled`), a trava do envio automático.
 * Enquanto a migration do PL-04 não estiver integrada, a linha lida do banco
 * não traz a coluna: o interruptor aparece desabilitado, com "Disponível em
 * breve" — a tela não promete envio que ainda não existe.
 */
export const COLUNA_ENVIO_AUTOMATICO = 'enabled';

export function valorEnvioAutomatico(awayMessage: unknown): boolean | null {
  if (
    typeof awayMessage !== 'object' ||
    awayMessage === null ||
    !(COLUNA_ENVIO_AUTOMATICO in awayMessage)
  ) {
    return null;
  }
  const valor = (awayMessage as Record<string, unknown>)[COLUNA_ENVIO_AUTOMATICO];
  return typeof valor === 'boolean' ? valor : valor != null;
}

/** O PL-04 acrescenta `enabled` ao que o hook já salva. */
export type AwayMessageComEnvio = AwayMessage & { enabled?: boolean };

/** A mensagem como o cliente a recebe, com as variáveis preenchidas de exemplo. */
export function resolverVariaveisExemplo(
  texto: string,
  valores: { nome: string; abertura: string; fechamento: string },
): string {
  return texto
    .replace(/\{nome\}/g, valores.nome)
    .replace(/\{horario_abertura\}/g, valores.abertura)
    .replace(/\{horario_fechamento\}/g, valores.fechamento);
}

/** Erro de cadastro da janela do dia (`null` = janela válida). */
export function erroDaJanela(abre: string, fecha: string): string | null {
  const tipo = classificarJanela(abre, fecha);
  if (tipo === 'igual') return 'Início e fim não podem ser iguais — ajuste o horário deste dia.';
  if (tipo === 'incompleta') return 'Informe início e fim no formato HH:MM.';
  return null;
}

export function BusinessHoursDialog({
  open,
  onOpenChange,
  connectionId,
  connectionName,
}: BusinessHoursDialogProps) {
  const { 
    businessHours: fetchedHours, 
    awayMessage: fetchedAway, 
    isLoading, 
    isSaving, 
    saveSettings 
  } = useBusinessHours(connectionId);

  const [localHours, setLocalHours] = useState<BusinessHour[]>([]);
  const [localAway, setLocalAway] = useState<AwayMessage>({ 
    whatsapp_connection_id: connectionId, 
    content: '', 
    is_enabled: true 
  });

  // Envio automático: só existe quando a coluna do PL-04 está na linha lida.
  const envioSalvoNoBanco = valorEnvioAutomatico(fetchedAway);
  const envioDisponivel = envioSalvoNoBanco !== null;
  const [envioRascunho, setEnvioRascunho] = useState<boolean | null>(null);
  const envioAutomatico = envioDisponivel
    ? envioRascunho ?? Boolean(envioSalvoNoBanco)
    : false;

  // Jornada inválida (início igual ao fim) não pode ser salva: o selo ao lado da
  // conexão mostraria "Fechado" com um horário que o usuário acha que cadastrou.
  const errosPorDia = useMemo(
    () =>
      localHours
        .filter((h) => h.is_open)
        .map((h) => ({ day: h.day_of_week, erro: erroDaJanela(h.open_time, h.close_time) }))
        .filter((item): item is { day: number; erro: string } => item.erro !== null),
    [localHours],
  );
  const temJornadaInvalida = errosPorDia.length > 0;

  // Prévia: a mensagem como o cliente a recebe, com as variáveis preenchidas
  // pelo horário do primeiro dia aberto (valores de exemplo).
  const diaExemplo =
    localHours.find((h) => h.is_open && classificarJanela(h.open_time, h.close_time) === 'normal') ??
    localHours.find((h) => h.is_open && classificarJanela(h.open_time, h.close_time) === 'noturna');
  const previa = resolverVariaveisExemplo(localAway.content, {
    nome: 'Ana',
    abertura: diaExemplo?.open_time ?? '--:--',
    fechamento: diaExemplo?.close_time ?? '--:--',
  });

  // Sync local state when data is fetched
  useEffect(() => {
    if (fetchedHours.length > 0) {
      setLocalHours(fetchedHours);
    }
  }, [fetchedHours]);

  useEffect(() => {
    if (fetchedAway) {
      setLocalAway(fetchedAway);
    }
  }, [fetchedAway]);

  const handleSave = async () => {
    // O `enabled` (coluna do PL-04) entra no que já é salvo; enquanto a coluna
    // não existir, o interruptor fica desabilitado e nada extra é enviado.
    const away: AwayMessageComEnvio = envioDisponivel
      ? { ...localAway, enabled: envioAutomatico }
      : localAway;
    await saveSettings(localHours, away);
    onOpenChange(false);
  };

  const updateHour = (dayOfWeek: number, field: keyof BusinessHour, value: string | boolean) => {
    setLocalHours((prev) =>
      prev.map((h) => (h.day_of_week === dayOfWeek ? { ...h, [field]: value } : h))
    );
  };

  const copyToAllDays = (sourceDayOfWeek: number) => {
    const source = localHours.find((h) => h.day_of_week === sourceDayOfWeek);
    if (!source) return;

    setLocalHours((prev) =>
      prev.map((h) => ({
        ...h,
        is_open: source.is_open,
        open_time: source.open_time,
        close_time: source.close_time,
      }))
    );
    toast({ title: 'Horário copiado para todos os dias' });
  };

  const applyWeekdayTemplate = () => {
    setLocalHours((prev) =>
      prev.map((h) => ({
        ...h,
        is_open: h.day_of_week >= 1 && h.day_of_week <= 5,
        open_time: '08:00',
        close_time: '18:00',
      }))
    );
    toast({ title: 'Template de dias úteis aplicado' });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent aria-describedby={undefined} className="sm:max-w-2xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Clock className="w-5 h-5 text-primary" />
            Horário de Atendimento - {connectionName}
          </DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : (
          <Tabs defaultValue="hours" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="hours" className="flex items-center gap-2">
                <Clock className="w-4 h-4" />
                Horários
              </TabsTrigger>
              <TabsTrigger value="message" className="flex items-center gap-2">
                <MessageSquare className="w-4 h-4" />
                Mensagem Ausente
              </TabsTrigger>
            </TabsList>

            <TabsContent value="hours" className="space-y-4 mt-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  Configure o horário de funcionamento para cada dia da semana.
                </p>
                <Button variant="outline" size="sm" onClick={applyWeekdayTemplate}>
                  Dias úteis (8h-18h)
                </Button>
              </div>

              <ScrollArea className="h-[400px] pr-4">
                <div className="space-y-3">
                  {localHours.map((hour) => {
                    const day = DAYS_OF_WEEK.find((d) => d.value === hour.day_of_week);
                    return (
                      <motion.div
                        key={hour.day_of_week}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: hour.day_of_week * 0.05 }}
                        className={cn(
                          'flex items-center gap-4 p-3 rounded-lg border transition-colors',
                          hour.is_open
                            ? 'border-primary/30 bg-primary/5'
                            : 'border-border bg-muted/30'
                        )}
                      >
                        <div className="w-32">
                          <div className="flex items-center gap-2">
                            <Switch
                              checked={hour.is_open}
                              onCheckedChange={(checked) =>
                                updateHour(hour.day_of_week, 'is_open', checked)
                              }
                              aria-label={day ? `Aberto ${day.label}` : `Aberto dia ${hour.day_of_week}`}
                            />
                            <span className={cn('font-medium', !hour.is_open && 'text-muted-foreground')}>
                              {day?.label}
                            </span>
                          </div>
                        </div>

                        {hour.is_open ? (
                          <>
                            <div className="flex items-center gap-2">
                              <Label className="text-xs text-muted-foreground">De</Label>
                              <Input
                                type="time"
                                value={hour.open_time}
                                onChange={(e) => updateHour(hour.day_of_week, 'open_time', e.target.value)}
                                className="w-28"
                              />
                            </div>
                            <div className="flex items-center gap-2">
                              <Label className="text-xs text-muted-foreground">Até</Label>
                              <Input
                                type="time"
                                value={hour.close_time}
                                onChange={(e) => updateHour(hour.day_of_week, 'close_time', e.target.value)}
                                className="w-28"
                              />
                            </div>
                            {errosPorDia.find((e) => e.day === hour.day_of_week)?.erro ? (
                              <p role="alert" className="text-xs text-destructive ml-auto">
                                {errosPorDia.find((e) => e.day === hour.day_of_week)?.erro}
                              </p>
                            ) : classificarJanela(hour.open_time, hour.close_time) === 'noturna' ? (
                              <span className="text-xs text-muted-foreground ml-auto">vira o dia</span>
                            ) : null}
                            <Button variant="ghost" size="icon" className="ml-auto" onClick={() => copyToAllDays(hour.day_of_week)} title="Copiar para todos os dias">
                              <Copy className="w-4 h-4" />
                            </Button>
                          </>
                        ) : (
                          <span className="text-sm text-muted-foreground">Fechado</span>
                        )}
                      </motion.div>
                    );
                  })}
                </div>
              </ScrollArea>
            </TabsContent>

            <TabsContent value="message" className="space-y-4 mt-4">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <Label htmlFor="envio-automatico-ausencia">Enviar mensagem de ausência</Label>
                  <p id="regra-envio-ausencia" className="text-xs text-muted-foreground">
                    No máximo 1 mensagem por contato a cada 24 h, somente quando a conversa estiver
                    fora do horário de atendimento.
                  </p>
                  {!envioDisponivel && (
                    <p className="text-xs text-muted-foreground">
                      Disponível em breve: o envio automático ainda não está ligado nesta versão.
                    </p>
                  )}
                </div>
                <Switch
                  id="envio-automatico-ausencia"
                  checked={envioAutomatico}
                  disabled={!envioDisponivel}
                  onCheckedChange={(checked) => setEnvioRascunho(checked)}
                  aria-label="Enviar mensagem de ausência"
                  aria-describedby="regra-envio-ausencia"
                />
              </div>

              <Textarea
                placeholder="Digite a mensagem de ausência..."
                value={localAway.content}
                onChange={(e) => setLocalAway((prev) => ({ ...prev, content: e.target.value }))}
                className="min-h-[150px]"
              />

              <div className="p-4 rounded-lg bg-muted/50 border border-border">
                <p className="text-xs text-muted-foreground mb-2">Variáveis disponíveis:</p>
                <div className="flex flex-wrap gap-2">
                  {['{nome}', '{horario_abertura}', '{horario_fechamento}'].map((v) => (
                    <Button key={v} variant="outline" size="sm" className="text-xs h-7" onClick={() => setLocalAway((prev) => ({ ...prev, content: prev.content + ' ' + v }))}>
                      {v}
                    </Button>
                  ))}
                </div>
              </div>

              <div className="p-4 rounded-lg border border-border">
                <p className="text-xs text-muted-foreground mb-2">
                  Prévia com valores de exemplo (nome "Ana" e o horário cadastrado):
                </p>
                {localAway.content.trim().length > 0 ? (
                  <p className="text-sm whitespace-pre-wrap">{previa}</p>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Digite a mensagem para ver como o cliente vai recebê-la.
                  </p>
                )}
              </div>
            </TabsContent>
          </Tabs>
        )}

        <div className="flex justify-end gap-2 pt-4 border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSave} disabled={isSaving || isLoading || temJornadaInvalida}>
            {isSaving ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Salvando...</>
            ) : (
              <><Save className="w-4 h-4 mr-2" />Salvar Configurações</>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
