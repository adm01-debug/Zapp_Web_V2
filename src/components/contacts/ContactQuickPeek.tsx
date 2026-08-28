import React from 'react';
import {
  HoverCard, HoverCardContent, HoverCardTrigger,
} from '@/components/ui/hover-card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Phone, Mail, Building, Briefcase, Calendar } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { getAvatarColor, getInitials } from '@/lib/avatar-colors';
import { CONTACT_TYPE_CONFIG } from './contactTypeConfig';
import { CompanyLogo } from './CompanyLogo';
import type { Contact } from './types';

interface ContactQuickPeekProps {
  contact: Contact;
  companyLogo?: string | null;
  companyName?: string | null;
  children: React.ReactNode;
}

export function ContactQuickPeek({ contact, companyLogo, companyName, children }: ContactQuickPeekProps) {
  const typeConfig = CONTACT_TYPE_CONFIG[contact.contact_type || 'cliente'] || CONTACT_TYPE_CONFIG.cliente;
  const avatarColors = getAvatarColor(contact.name);

  return (
    <HoverCard openDelay={400} closeDelay={100}>
      <HoverCardTrigger asChild>
        {children}
      </HoverCardTrigger>
      <HoverCardContent
        side="right"
        align="start"
        className="w-72 p-0 overflow-hidden"
        sideOffset={8}
      >
        {/* Header gradient */}
        <div className={cn("h-2 w-full", typeConfig.gradient)} />
        
        <div className="p-4 space-y-3">
          {/* Profile */}
          <div className="flex items-start gap-3">
            <Avatar className="w-12 h-12 ring-2 ring-border/30">
              <AvatarImage src={contact.avatar_url || undefined} />
              <AvatarFallback className={cn('font-bold text-sm', avatarColors.bg, avatarColors.text)}>
                {getInitials(contact.name)}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <h4 className="font-semibold text-sm truncate">
                {contact.name} {contact.surname || ''}
              </h4>
              {contact.nickname && (
                <p className="text-xs text-muted-foreground">({contact.nickname})</p>
              )}
              <Badge
                variant="outline"
                className={cn("mt-1 text-[10px] h-5 px-1.5 font-medium gap-1", typeConfig.badgeClass)}
              >
                {typeConfig.iconNode}
                {typeConfig.label}
              </Badge>
            </div>
          </div>

          {/* Details */}
          <div className="space-y-2 text-xs">
            {(contact.company || companyName) && (
              <div className="flex items-center gap-2 text-foreground">
                <CompanyLogo
                  logoUrl={companyLogo}
                  companyName={companyName}
                  fallbackCompanyName={contact.company}
                  size="xs"
                />
                <span className="truncate font-medium">{companyName || contact.company}</span>
              </div>
            )}
            {contact.job_title && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Briefcase className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">{contact.job_title}</span>
              </div>
            )}
            <div className="flex items-center gap-2 text-muted-foreground">
              <Phone className="w-3.5 h-3.5 shrink-0" />
              <span className="font-mono text-[11px]">{contact.phone}</span>
            </div>
            {contact.email && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Mail className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">{contact.email}</span>
              </div>
            )}
          </div>

          {/* Tags */}
          {contact.tags && contact.tags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {contact.tags.slice(0, 4).map(tag => (
                <Badge key={tag} variant="secondary" className="text-[10px] h-5 px-1.5">
                  {tag}
                </Badge>
              ))}
              {contact.tags.length > 4 && (
                <Badge variant="secondary" className="text-[10px] h-5 px-1.5">
                  +{contact.tags.length - 4}
                </Badge>
              )}
            </div>
          )}

          {/* Footer */}
          <div className="flex items-center gap-1.5 pt-1 border-t border-border/30 text-[10px] text-muted-foreground">
            <Calendar className="w-3 h-3" />
            Desde {format(new Date(contact.created_at), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
          </div>
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}
