import { Ban, Globe, MapPin, ShieldAlert } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useLoginBlockedLog } from '@/hooks/system/useLoginBlockedLog';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

/**
 * Painel "Bloqueios de login" — mostra quem o login barrou, de onde e por quê.
 *
 * Este painel SÓ LÊ: não bloqueia ninguém e não mexe na whitelist. A leitura dos
 * dados vive no hook useLoginBlockedLog (a camada de apresentação não fala com o
 * Supabase direto). Contrato de gravação, para os dois lados combinarem:
 *
 *   insert em public.audit_logs com
 *     action      = 'login_blocked'
 *     entity_type = 'login'
 *     ip_address  = IP resolvido do chamador
 *     user_agent  = user-agent do chamador
 *     details     = { email, country_code, reason }
 *   reason ∈ ('ip_blocked' | 'country_blocked' | 'ip_not_whitelisted' | 'country_not_allowed')
 *
 * Enquanto não houver nenhum bloqueio, a lista fica vazia de propósito — o
 * estado vazio é honesto, não um erro.
 */
const REASON_LABELS: Record<string, string> = {
  ip_blocked: 'IP bloqueado',
  country_blocked: 'País bloqueado',
  ip_not_whitelisted: 'IP fora da whitelist',
  country_not_allowed: 'País fora da whitelist',
};

/** Valor textual não vazio, ou null (details é jsonb livre). */
function texto(valor: unknown): string | null {
  return typeof valor === 'string' && valor.trim() !== '' ? valor : null;
}

/** Rótulo pt-BR do motivo; valor desconhecido aparece cru, nunca escondido. */
function motivoLabel(reason: unknown): string {
  const r = texto(reason);
  if (!r) return 'Motivo não informado';
  return REASON_LABELS[r] ?? r;
}

export function LoginBlockedLogPanel() {
  const { rows, geoMode, loading, erro } = useLoginBlockedLog();
  const geoDesativado = geoMode === null || geoMode === 'disabled';

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full flex items-center justify-center bg-destructive/10 dark:bg-destructive/20">
              <Ban className="w-5 h-5 text-destructive" />
            </div>
            <div>
              <CardTitle>Bloqueios de login</CardTitle>
              <CardDescription>
                Tentativas de login barradas por IP ou país, com o motivo de cada uma
              </CardDescription>
            </div>
          </div>
          <Badge variant={geoDesativado ? 'secondary' : 'destructive'} className="text-xs shrink-0">
            {geoDesativado ? 'Bloqueio por país: desativado' : `Bloqueio por país: ${geoMode}`}
          </Badge>
        </div>
      </CardHeader>

      <CardContent>
        {loading ? (
          <div className="space-y-2" aria-busy="true">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-16 bg-muted/50 motion-safe:animate-pulse rounded-lg" />
            ))}
          </div>
        ) : erro ? (
          <div className="text-center py-8 text-muted-foreground" role="status">
            <ShieldAlert className="w-12 h-12 mx-auto mb-2 opacity-40" />
            <p>Não foi possível carregar os bloqueios de login</p>
          </div>
        ) : rows.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground" role="status">
            <ShieldAlert className="w-12 h-12 mx-auto mb-2 opacity-20" />
            <p>Nenhum bloqueio de login registrado</p>
            <p className="text-xs mt-1">
              {geoDesativado
                ? 'Com as listas de IP/país desligadas, nenhuma tentativa é barrada.'
                : 'Com os bloqueios ligados, cada tentativa barrada aparece aqui.'}
            </p>
          </div>
        ) : (
          <ul className="space-y-2">
            {rows.map((bloco) => {
              const email = texto(bloco.details?.email);
              const country = texto(bloco.details?.country_code);
              const reason = bloco.details?.reason;
              return (
                <li
                  key={bloco.id}
                  className="flex items-start justify-between gap-3 p-3 rounded-lg border bg-muted/30"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm truncate">
                        {email ?? 'E-mail não informado'}
                      </span>
                      <Badge variant="outline" className="text-xs">
                        {motivoLabel(reason)}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
                      <span className="flex items-center gap-1">
                        <Globe className="w-3 h-3" />
                        <code className="font-mono">{texto(bloco.ip_address) ?? 'IP não informado'}</code>
                      </span>
                      {country && (
                        <span className="flex items-center gap-1">
                          <MapPin className="w-3 h-3" />
                          {country}
                        </span>
                      )}
                      <span>
                        {format(new Date(bloco.created_at), "dd/MM/yyyy HH:mm:ss", { locale: ptBR })}
                      </span>
                    </div>
                    {texto(bloco.user_agent) && (
                      <p className="text-xs text-muted-foreground mt-1 truncate">
                        {texto(bloco.user_agent)}
                      </p>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
