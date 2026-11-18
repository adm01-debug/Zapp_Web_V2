ALTER TABLE public.department_audit_logs
  DROP CONSTRAINT IF EXISTS department_audit_logs_action_check,
  ADD CONSTRAINT department_audit_logs_action_check CHECK (action IN (
    'accept_invite','create_invite','join_department','leave_department',
    'remove_member','update_settings','delete_department','create_department',
    'update_role','kick_member','create_group','delete_group',
    'whatsapp_updated','access_requested',
    'invite_created','invite_revoked','invite_accepted','member_added',
    'member_removed','department_transferred','add_member','delete_invite'
  )) NOT VALID
