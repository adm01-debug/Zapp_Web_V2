/**
 * EvolutionContactProfileSection — perfil do WhatsApp do contato (foto HD,
 * recado, conta comercial, dispositivo, etiquetas da instância e visto por
 * último), lido de `evolution_contacts` na VPS da Evolution.
 *
 * Restaurado (2026-11-12) do componente que saiu como órfão na #1886.
 * A edge `external-db-proxy` só libera a leitura para admin/supervisor; para
 * os demais papéis a seção diz isso em vez de mostrar um erro 403.
 */
import { AlertCircle, BadgeCheck, Briefcase, Building2, Clock, Globe, Mail, MapPin, Smartphone } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useUserRole } from '@/hooks/system/useUserRole';
import { useEvolutionContactProfile } from '@/hooks/integrations/useEvolutionContactProfile';
import { formatRelativeTime } from '@/lib/formatters';
import { isSafeHttpUrl } from '@/lib/urlSafety';

interface EvolutionContactProfileSectionProps {
  phone: string;
  fallbackName?: string;
}

function Muted({ testId, children }: { testId: string; children: string }) {
  return <p data-testid={testId} className="bg-muted/10 rounded-md p-2 text-xs text-muted-foreground">{children}</p>;
}

function ProfileBody({ phone, fallbackName }: EvolutionContactProfileSectionProps) {
  const { data, isLoading, isError } = useEvolutionContactProfile(phone);

  if (isLoading) {
    return (
      <div className="flex items-center gap-3" data-testid="evolution-profile-loading">
        <Skeleton className="w-12 h-12 rounded-full" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-3 w-24" />
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <p role="alert" data-testid="evolution-profile-error" className="flex items-center gap-1.5 text-xs text-destructive">
        <AlertCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
        Não foi possível ler o perfil do WhatsApp.
      </p>
    );
  }

  if (data?.notConfigured) {
    return <Muted testId="evolution-profile-not-configured">Banco da Evolution não configurado neste ambiente.</Muted>;
  }

  const profile = data?.profile;
  if (!profile) {
    return <Muted testId="evolution-profile-empty">Nenhum perfil do WhatsApp encontrado para este contato.</Muted>;
  }

  const displayName = profile.verified_name || profile.push_name || fallbackName || 'Sem nome';
  const avatarUrl = profile.profile_picture_hd || profile.profile_picture_url || undefined;
  const initials = displayName.split(' ').filter(Boolean).map((p) => p[0]).join('').slice(0, 2).toUpperCase();
  const business = profile.business_profile;
  const device = profile.device_info;
  const websites = (business?.website ?? []).filter(isSafeHttpUrl);
  const lastSeen = profile.last_seen ? new Date(profile.last_seen) : null;

  return (
    <div className="space-y-3" data-testid="evolution-profile">
      <div className="flex items-start gap-3">
        <Avatar className="w-12 h-12 ring-2 ring-primary/20">
          <AvatarImage src={avatarUrl} alt={displayName} />
          <AvatarFallback className="bg-primary/10 text-primary font-semibold">{initials}</AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="font-semibold text-sm truncate">{displayName}</span>
            {profile.verified && (
              <BadgeCheck className="w-4 h-4 text-primary" role="img" aria-label="Conta verificada" />
            )}
            {profile.is_business && (
              <Badge variant="outline" className="h-5 text-3xs bg-success/10 text-success border-success/30">
                <Briefcase className="w-3 h-3 mr-1" aria-hidden="true" />Business
              </Badge>
            )}
            {profile.is_enterprise && (
              <Badge variant="outline" className="h-5 text-3xs bg-primary/10 text-primary border-primary/30">
                <Building2 className="w-3 h-3 mr-1" aria-hidden="true" />Enterprise
              </Badge>
            )}
          </div>
          {profile.about && (
            <p className="text-xs text-muted-foreground mt-1 line-clamp-2 italic">"{profile.about}"</p>
          )}
        </div>
      </div>

      {business && (business.category || business.description || business.email || websites.length > 0 || business.address) && (
        <div className="rounded-lg border border-border/40 bg-card/30 p-2.5 space-y-1.5">
          <p className="text-2xs font-medium uppercase tracking-wider text-muted-foreground">Perfil comercial</p>
          {business.category && (
            <div className="flex items-center gap-2 text-xs">
              <Briefcase className="w-3.5 h-3.5 text-muted-foreground" aria-hidden="true" />
              <span>{business.category}</span>
            </div>
          )}
          {business.description && <p className="text-xs text-foreground/80">{business.description}</p>}
          {business.email && (
            <div className="flex items-center gap-2 text-xs">
              <Mail className="w-3.5 h-3.5 text-muted-foreground" aria-hidden="true" />
              <a href={`mailto:${business.email}`} className="text-primary hover:underline truncate">{business.email}</a>
            </div>
          )}
          {websites.length > 0 && (
            <div className="flex items-start gap-2 text-xs">
              <Globe className="w-3.5 h-3.5 text-muted-foreground mt-0.5" aria-hidden="true" />
              <div className="flex flex-col gap-1 min-w-0">
                {websites.map((url) => (
                  <a key={url} href={url} target="_blank" rel="noreferrer noopener" className="text-primary hover:underline truncate">{url}</a>
                ))}
              </div>
            </div>
          )}
          {business.address && (
            <div className="flex items-start gap-2 text-xs">
              <MapPin className="w-3.5 h-3.5 text-muted-foreground mt-0.5" aria-hidden="true" />
              <span className="text-foreground/80">{business.address}</span>
            </div>
          )}
        </div>
      )}

      {device && (device.platform || device.device_model) && (
        <div className="flex items-center gap-2 text-xs" data-testid="evolution-profile-device">
          <Smartphone className="w-3.5 h-3.5 text-muted-foreground" aria-hidden="true" />
          <span className="truncate">
            {[device.device_manufacturer, device.device_model].filter(Boolean).join(' ') || device.platform}
            {device.wa_version ? ` · WA ${device.wa_version}` : ''}
          </span>
        </div>
      )}

      {profile.labels && profile.labels.length > 0 && (
        <div className="flex flex-wrap gap-1" aria-label="Etiquetas da instância do WhatsApp">
          {profile.labels.map((label) => (
            <Badge key={label} variant="secondary" className="text-3xs h-5">{label}</Badge>
          ))}
        </div>
      )}

      {lastSeen && !Number.isNaN(lastSeen.getTime()) && (
        <div className="flex items-center gap-1.5 text-2xs text-muted-foreground">
          <Clock className="w-3 h-3" aria-hidden="true" />
          Visto por último {formatRelativeTime(lastSeen)}
        </div>
      )}
    </div>
  );
}

export function EvolutionContactProfileSection({ phone, fallbackName }: EvolutionContactProfileSectionProps) {
  const { isSupervisor, loading } = useUserRole();

  if (loading) return <Skeleton className="h-12 w-full" data-testid="evolution-profile-loading" />;
  if (!isSupervisor) {
    return <Muted testId="evolution-profile-forbidden">O perfil do WhatsApp é visível para supervisores e administradores.</Muted>;
  }
  return <ProfileBody phone={phone} fallbackName={fallbackName} />;
}
