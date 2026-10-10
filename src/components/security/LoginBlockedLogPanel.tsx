import { useEffect, useState } from 'react';
import { Ban, Globe, MapPin, ShieldAlert } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

/**
 * Painel "Bloqueios de login" — mostra quem o login barrou, de onde e por quê.
 *
 * Este painel SÓ LÊ: não bloqueia ninguém e não mexe na whitelist. A gravação é
 * do cartão que liga o bloqueio de IP/país ao login (auth-login). Contrato de
 * gravação, para os dois lados combinarem:
 *
 *   insert em public.audit_logs com
 *     action      = 'login_blocked'
 *     entity_type = 'login'
 *     ip_address  = IP resolvido do chamador
 *     user_agent  = user-agent do chamador
 *     details     = { email, country_code, reason }
 *   reason ∈ a lista de LOGIN_BLOCK_REASON_LABELS
 *     ('ip_blocked' | 'country_blocked' | 'ip_not_whitelisted' | 'country_not_allowed')
 *
 * Enquanto a gravação do outro cartão não existir, a lista fica vazia de
 * propósito — o estado vazio é honesto, não um erro.
 */
export const LOGIN_BLOCK_ACTION = 'login_blocked';
/** Colunas explícitas (nunca `*`): a lista de segurança não puxa a linha toda. */
export const LOGIN_BLOCKED_LOG_COLUMNS =
  'id, details, ip_address, user_agent, created_at';

/** Categorias de motivo reconhecidas. Fora daqui o painel mostra o valor cru. */
export const LOGIN_BLOCK_REASON_LABELS: Record<string, string> = {
  ip_blocked: 'IP bloqueado',
  country_blocked: 'País bloqueado',
  ip_not_whitelisted: 'IP fora da whitelist',
  country_not_allowed: 'País fora da whitelist',
};

const POLL_INTERVAL_MS = 15_000;
const LIMIT = 50;

interface LoginBlockRow {
  id: string;
  details: Record<string, unknown> | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
}

/** Valor textual não vazio, ou null (details é jsonb livre). */
function texto(valor: unknown): string | null {
  return typeof valor === 'string' && valor.trim() !== '' ? valor : null;
}

/** Rótulo pt-BR do motivo; valor desconhecido aparece cru, nunca escondido. */
export function motivoLabel(reason: unknown): string {
  const r = texto(reason);
  if (!r) return 'Motivo não informado';
  return LOGIN_BLOCK_REASON_LABELS[r] ?? r;
}

export function LoginBlockedLogPanel() {
  const [blocks, setBlocks] = useState<LoginBlockRow[]>([]);
  const [geoMode, setGeoMode] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState(false);

  useEffect(() => {
    let ativo = true;

    const carregar = () =>
      Promise.all([
        supabase
          .from('audit_logs')
          .select(LOGIN_BLOCKED_LOG_COLUMNS)
          .eq('action', LOGIN_BLOCK_ACTION)
          .order('created_at', { ascending: false })
          .limit(LIMIT),
        supabase.from('geo_blocking_settings').select('mode').limit(1).maybeSingle(),
      ]).then(([blocos, geo]) => {
        if (!ativo) return;
        if (blocos.error) {
          setErro(true);
        } else {
          setErro(false);
          setBlocks((blocos.data ?? []) as LoginBlockRow[]);
        }
        if (!geo.error) {
          const mode = (geo.data as { mode?: unknown } | null)?.mode;
          setGeoMode(texto(mode));
        }
        setLoading(false);
      });

    // setTimeout(0) tira o primeiro fetch do corpo síncrono do efeito (set-state-in-effect);
    // o polling faz um bloqueio novo aparecer em alguns segundos, sem recarregar a página.
    const timer = setTimeout(() => void carregar(), 0);
    const interval = setInterval(() => void carregar(), POLL_INTERVAL_MS);
    return () => {
      ativo = false;
      clearTimeout(timer);
      clearInterval(interval);
    };
  }, []);

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
              <div key={i} className="h-16 bg-muted/50 animate-pulse rounded-lg" />
            ))}
          </div>
        ) : erro ? (
          <div className="text-center py-8 text-muted-foreground" role="status">
            <ShieldAlert className="w-12 h-12 mx-auto mb-2 opacity-40" />
            <p>Não foi possível carregar os bloqueios de login</p>
          </div>
        ) : blocks.length === 0 ? (
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
            {blocks.map((bloco) => {
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
