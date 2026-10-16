import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { ActiveDepartment } from '@/hooks/team-chat/useActiveDepartments';
import { DepartmentMembersView } from './department-management/DepartmentMembersView';
import { DepartmentInvitesView } from './department-management/DepartmentInvitesView';
import { DepartmentWhatsAppView } from './department-management/DepartmentWhatsAppView';
import { DepartmentAuditView } from './department-management/DepartmentAuditView';

type TabKey = 'members' | 'invites' | 'whatsapp' | 'audit';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'members', label: 'Membros' },
  { key: 'invites', label: 'Convites' },
  { key: 'whatsapp', label: 'WhatsApp' },
  { key: 'audit', label: 'Auditoria' },
];

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  department: ActiveDepartment;
  currentUserName: string;
  isAdmin: boolean;
}

export function DepartmentManagementDialog({ open, onOpenChange, department, currentUserName, isAdmin }: Props) {
  const [tab, setTab] = useState<TabKey>('members');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-border">
          <DialogTitle className="text-lg">{department.name}</DialogTitle>
          {department.description && (
            <p className="text-sm text-muted-foreground mt-0.5">{department.description}</p>
          )}
        </DialogHeader>

        <div className="flex gap-1 px-6 py-3 border-b border-border" role="tablist" aria-label="Seções do departamento">
          {TABS.map(t => (
            <button
              key={t.key}
              role="tab"
              aria-selected={tab === t.key}
              onClick={() => setTab(t.key)}
              className={cn(
                'px-3 py-1.5 rounded-md text-sm font-medium transition-colors',
                tab === t.key
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted',
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-auto">
          {tab === 'members' && (
            <DepartmentMembersView departmentId={department.id} currentUserName={currentUserName} isAdmin={isAdmin} />
          )}
          {tab === 'invites' && (
            <DepartmentInvitesView departmentId={department.id} currentUserName={currentUserName} isAdmin={isAdmin} />
          )}
          {tab === 'whatsapp' && (
            <DepartmentWhatsAppView departmentId={department.id} currentUserName={currentUserName} isAdmin={isAdmin} />
          )}
          {tab === 'audit' && (
            <DepartmentAuditView departmentId={department.id} />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
