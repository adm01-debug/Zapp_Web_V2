import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { BadgeCheck, Briefcase, Globe, MapPin, Mail, Smartphone, Clock, AlertCircle, Building2 } from 'lucide-react';
import { useEvolutionContactProfile } from '@/hooks/integrations/useEvolutionContactProfile';
import { formatRelativeTime } from '@/lib/formatters';

interface EvolutionContactProfileSectionProps {
  phone: string;
  fallbackName?: string;
}

export function EvolutionContactProfileSection({ phone, fallbackName }: EvolutionContactProfileSectionProps) {
  const { profile, loading, error, notConfigured } = useEvolutionContactProfile(phone);

  if (notConfigured) {
    return (
      <p className="text-xs text-muted-foreground italic">
        Banco externo não configurado — perfil enriquecido indisponível.
      </p>
    );
  }

  if (loading) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <Skeleton className="w-14 h-14 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-24" />
          </div>
        </div>
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-3/4" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center gap-2 text-xs text-destructive">
        <AlertCircle className="w-3.5 h-3.5" /> {error}
      </div>
    );
  }

  if (!profile) {
    return (
      <p className="text-xs text-muted-foreground italic">
        Nenhum perfil enriquecido encontrado para este contato.
      </p>
    );
  }

  const displayName = profile.verified_name || profile.push_name || fallbackName || 'Sem nome';
  const avatarUrl = profile.profile_picture_hd || profile.profile_picture_url || undefined;
  const initials = displayName.split(' ').map((p) => p[0]).join('').slice(0, 2).toUpperCase();
  const business = profile.business_profile;
  const device = profile.device_info;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start gap-3">
        <Avatar className="w-14 h-14 ring-2 ring-primary/20">
          <AvatarImage src={avatarUrl} alt={displayName} />
          <AvatarFallback className="bg-primary/10 text-primary font-semibold">{initials}</AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="font-semibold text-sm truncate">{displayName}</span>
            {profile.verified && (
              <BadgeCheck className="w-4 h-4 text-primary fill-primary/20" aria-label="Conta verificada" />
            )}
            {profile.is_business && (
              <Badge variant="outline" className="h-5 text-[10px] bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30">
                <Briefcase className="w-3 h-3 mr-1" />Business
              </Badge>
            )}
            {profile.is_enterprise && (
              <Badge variant="outline" className="h-5 text-[10px] bg-primary/10 text-primary border-primary/30">
                <Building2 className="w-3 h-3 mr-1" />Enterprise
              </Badge>
            )}
          </div>
          {profile.about && (
            <p className="text-xs text-muted-foreground mt-1 line-clamp-2 italic">"{profile.about}"</p>
          )}
        </div>
      </div>

      {/* Business profile */}
      {business && (
        <div className="rounded-lg border border-border/40 bg-card/30 p-3 space-y-2">
          <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Perfil Comercial</p>
          {business.category && (
            <div className="flex items-center gap-2 text-xs">
              <Briefcase className="w-3.5 h-3.5 text-muted-foreground" />
              <span>{business.category}</span>
            </div>
          )}
          {business.description && (
            <p className="text-xs text-foreground/80">{business.description}</p>
          )}
          {business.email && (
            <div className="flex items-center gap-2 text-xs">
              <Mail className="w-3.5 h-3.5 text-muted-foreground" />
              <a href={`mailto:${business.email}`} className="text-primary hover:underline truncate">{business.email}</a>
            </div>
          )}
          {business.website && business.website.length > 0 && (
            <div className="flex items-start gap-2 text-xs">
              <Globe className="w-3.5 h-3.5 text-muted-foreground mt-0.5" />
              <div className="flex flex-col gap-1 min-w-0">
                {business.website.map((url) => (
                  <a key={url} href={url} target="_blank" rel="noreferrer noopener" className="text-primary hover:underline truncate">{url}</a>
                ))}
              </div>
            </div>
          )}
          {business.address && (
            <div className="flex items-start gap-2 text-xs">
              <MapPin className="w-3.5 h-3.5 text-muted-foreground mt-0.5" />
              <span className="text-foreground/80">{business.address}</span>
            </div>
          )}
        </div>
      )}

      {/* Device info */}
      {device && (device.platform || device.device_model) && (
        <div className="rounded-lg border border-border/40 bg-card/30 p-3 space-y-1.5">
          <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Dispositivo</p>
          <div className="flex items-center gap-2 text-xs">
            <Smartphone className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="truncate">
              {[device.device_manufacturer, device.device_model].filter(Boolean).join(' ') || device.platform}
            </span>
          </div>
          {(device.os_version || device.wa_version) && (
            <p className="text-[11px] text-muted-foreground ml-5">
              {device.platform && `${device.platform} `}{device.os_version && `${device.os_version} `}{device.wa_version && `· WA ${device.wa_version}`}
            </p>
          )}
        </div>
      )}

      {/* Labels */}
      {profile.labels && profile.labels.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {profile.labels.map((label) => (
            <Badge key={label} variant="secondary" className="text-[10px] h-5">{label}</Badge>
          ))}
        </div>
      )}

      {/* Last seen */}
      {profile.last_seen && (
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <Clock className="w-3 h-3" />
          Visto por último {formatRelativeTime(new Date(profile.last_seen))}
        </div>
      )}
    </div>
  );
}