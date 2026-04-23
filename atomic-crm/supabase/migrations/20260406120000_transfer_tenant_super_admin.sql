-- Atomic super-admin handoff (invoked from client with JWT so auth.uid() is set).
CREATE OR REPLACE FUNCTION public.transfer_tenant_super_admin(p_new_super_admin_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_tenant uuid;
  v_caller uuid := auth.uid();
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  v_tenant := public.get_my_tenant_id();
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'no tenant context';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.tenant_members tm
    WHERE tm.tenant_id = v_tenant AND tm.user_id = v_caller AND tm.role = 'super_admin'
  ) THEN
    RAISE EXCEPTION 'only tenant super admin can transfer';
  END IF;

  IF p_new_super_admin_user_id = v_caller THEN
    RAISE EXCEPTION 'choose another user';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.tenant_members tm
    WHERE tm.tenant_id = v_tenant AND tm.user_id = p_new_super_admin_user_id
  ) THEN
    RAISE EXCEPTION 'target is not a member of this tenant';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.tenant_members tm
    WHERE tm.tenant_id = v_tenant AND tm.user_id = p_new_super_admin_user_id AND tm.role = 'super_admin'
  ) THEN
    RAISE EXCEPTION 'target is already super admin';
  END IF;

  UPDATE public.tenant_members SET role = 'admin' WHERE tenant_id = v_tenant AND user_id = v_caller;
  UPDATE public.tenant_members SET role = 'super_admin' WHERE tenant_id = v_tenant AND user_id = p_new_super_admin_user_id;
  UPDATE public.tenants SET owner_user_id = p_new_super_admin_user_id WHERE id = v_tenant;

  -- Tenant admin/super_admin both use CRM administrator flag in handle_new_user; new super may have been member.
  UPDATE public.sales SET administrator = true WHERE user_id = p_new_super_admin_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.transfer_tenant_super_admin(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.transfer_tenant_super_admin(uuid) TO authenticated;
