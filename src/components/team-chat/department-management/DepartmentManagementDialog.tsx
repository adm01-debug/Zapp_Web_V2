import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Users, Link2, MessageSquare, ClipboardList } from 'lucide-react';
import { DepartmentMembersView } from './DepartmentMembersView';
import { DepartmentInvitesView } from './DepartmentInvitesView';
import { DepartmentWhatsAppView } from './DepartmentWhatsAppView';
import { DepartmentAuditView } from './DepartmentAuditView';

interface ActiveDepartment {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  department: ActiveDepartment;
  currentUserName: string;
  isAdmin: boolean;
}

export function DepartmentManagementDialog({ open, onOpenChange, department, currentUserName, isAdmin }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] flex flex-col gap-0 p-0">
        <DialogHeader className="px-4 pt-4 pb-3 border-b border-border shrink-0">
          <DialogTitle className="text-base">
            Gerenciar departamento — {department.name}
          </DialogTitle>
        </DialogHeader>
        <Tabs defaultValue="members" className="flex-1 flex flex-col min-h-0">
          <TabsList className="mx-4 mt-3 mb-0 h-9 shrink-0">
            <TabsTrigger value="members" className="flex-1 gap-1.5 text-xs">
              <Users className="w-3.5 h-3.5" />
              Membros
            </TabsTrigger>
            <TabsTrigger value="invites" className="flex-1 gap-1.5 text-xs">
              <Link2 className="w-3.5 h-3.5" />
              Convites
            </TabsTrigger>
            <TabsTrigger value="whatsapp" className="flex-1 gap-1.5 text-xs">
              <MessageSquare className="w-3.5 h-3.5" />
              WhatsApp
            </TabsTrigger>
            <TabsTrigger value="audit" className="flex-1 gap-1.5 text-xs">
              <ClipboardList className="w-3.5 h-3.5" />
              Auditoria
            </TabsTrigger>
          </TabsList>
          <div className="flex-1 overflow-y-auto">
            <TabsContent value="members" className="mt-0">
              <DepartmentMembersView departmentId={department.id} currentUserName={currentUserName} isAdmin={isAdmin} />
            </TabsContent>
            <TabsContent value="invites" className="mt-0">
              <DepartmentInvitesView departmentId={department.id} currentUserName={currentUserName} isAdmin={isAdmin} />
            </TabsContent>
            <TabsContent value="whatsapp" className="mt-0">
              <DepartmentWhatsAppView departmentId={department.id} currentUserName={currentUserName} isAdmin={isAdmin} />
            </TabsContent>
            <TabsContent value="audit" className="mt-0">
              <DepartmentAuditView departmentId={department.id} />
            </TabsContent>
          </div>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
