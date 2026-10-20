import React from 'react';
import { Building } from 'lucide-react';
import { cn } from '@/lib/utils';

// Generate a deterministic color from company name
function getCompanyColor(name: string): { bg: string; text: string } {
  const colors = [
    { bg: 'bg-primary/15', text: 'text-primary' },
    { bg: 'bg-success/15', text: 'text-success' },
    { bg: 'bg-secondary/15', text: 'text-secondary' },
    { bg: 'bg-warning/15', text: 'text-warning' },
    { bg: 'bg-destructive/15', text: 'text-destructive' },
    { bg: 'bg-info/15', text: 'text-info' },
    { bg: 'bg-accent/30', text: 'text-accent-foreground' },
    { bg: 'bg-muted', text: 'text-muted-foreground' },
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

function getCompanyInitials(name: string): string {
  return name
    .split(/[\s\-&]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(w => w[0])
    .join('')
    .toUpperCase();
}

interface CompanyLogoProps {
  logoUrl?: string | null;
  companyName?: string | null;
  fallbackCompanyName?: string | null;
  size?: 'xs' | 'sm' | 'md';
  className?: string;
}

const sizeMap = {
  xs: 'w-4 h-4 text-[7px]',
  sm: 'w-5 h-5 text-[8px]',
  md: 'w-7 h-7 text-3xs',
};

const iconSizeMap = {
  xs: 'w-2.5 h-2.5',
  sm: 'w-3 h-3',
  md: 'w-3.5 h-3.5',
};

export function CompanyLogo({ logoUrl, companyName, fallbackCompanyName, size = 'sm', className }: CompanyLogoProps) {
  const name = companyName || fallbackCompanyName;
  if (logoUrl) return <CompanyLogoImage key={logoUrl} logoUrl={logoUrl} name={name} size={size} className={className} />;
  return <CompanyLogoFallback name={name} size={size} className={className} />;
}

function CompanyLogoImage({ logoUrl, name, size, className }: Required<Pick<CompanyLogoProps, 'logoUrl' | 'size'>> & { name?: string | null; className?: string }) {
  const [imageFailed, setImageFailed] = React.useState(false);
  if (imageFailed) return <CompanyLogoFallback name={name} size={size} className={className} />;
  return (
    <img
      src={logoUrl || ''}
      alt={name || ''}
      className={cn(sizeMap[size], 'rounded object-contain bg-background border border-border/20 shrink-0', className)}
      onError={() => setImageFailed(true)}
    />
  );
}

function CompanyLogoFallback({ name, size, className }: { name?: string | null; size: NonNullable<CompanyLogoProps['size']>; className?: string }) {
  if (name) {
    const colors = getCompanyColor(name);
    return (
      <div
        className={cn(
          sizeMap[size],
          'rounded flex items-center justify-center font-bold shrink-0',
          colors.bg, colors.text,
          className
        )}
        title={name}
      >
        {getCompanyInitials(name)}
      </div>
    );
  }

  return <Building className={cn(iconSizeMap[size], 'text-muted-foreground shrink-0', className)} />;
}
