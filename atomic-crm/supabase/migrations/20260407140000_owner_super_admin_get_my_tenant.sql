-- 1) Tenant owner must be super_admin in tenant_members (fixes HQ pre-set owner_user_id + admin row mismatch).
UPDATE public.tenant_members tm
SET role = 'super_admin'
FROM public.tenants t
WHERE t.id = tm.tenant_id
  AND t.owner_user_id IS NOT NULL
  AND t.owner_user_id = tm.user_id
  AND tm.role IS DISTINCT FROM 'super_admin';

-- 2) Prefer super_admin / owner tenant when a user belongs to multiple orgs (e.g. default-chaster + client).
CREATE OR REPLACE FUNCTION public.get_my_tenant_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT tm.tenant_id
  FROM public.tenant_members tm
  LEFT JOIN public.tenants t ON t.id = tm.tenant_id
  WHERE tm.user_id = auth.uid()
  ORDER BY
    CASE tm.role
      WHEN 'super_admin' THEN 0
      WHEN 'admin' THEN 1
      ELSE 2
    END,
    CASE
      WHEN t.owner_user_id = auth.uid() THEN 0
      ELSE 1
    END,
    tm.joined_at
  LIMIT 1;
$$;

-- 3) Merge tenant role on conflict so invite metadata can upgrade admin → super_admin (do not only "do nothing").
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  sales_count int;
  default_tenant_id uuid;
  member_role text;
  prov_tenant uuid;
  prov_role text;
BEGIN
  SELECT count(*) INTO sales_count FROM public.sales;

  BEGIN
    prov_tenant := nullif(trim(new.raw_user_meta_data ->> 'provisioned_tenant_id'), '')::uuid;
  EXCEPTION
    WHEN invalid_text_representation THEN
      prov_tenant := NULL;
  END;

  prov_role := coalesce(
    nullif(trim(new.raw_user_meta_data ->> 'provisioned_tenant_role'), ''),
    'super_admin'
  );

  IF prov_role NOT IN ('super_admin', 'admin', 'member') THEN
    prov_role := 'member';
  END IF;

  INSERT INTO public.sales (first_name, last_name, email, user_id, administrator)
  VALUES (
    coalesce(
      new.raw_user_meta_data ->> 'first_name',
      new.raw_user_meta_data -> 'custom_claims' ->> 'first_name',
      'Pending'
    ),
    coalesce(
      new.raw_user_meta_data ->> 'last_name',
      new.raw_user_meta_data -> 'custom_claims' ->> 'last_name',
      'Pending'
    ),
    new.email,
    new.id,
    CASE
      WHEN prov_tenant IS NOT NULL AND prov_role IN ('super_admin', 'admin') THEN true
      WHEN prov_tenant IS NOT NULL THEN false
      WHEN sales_count > 0 THEN false
      ELSE true
    END
  );

  IF prov_tenant IS NOT NULL AND EXISTS (SELECT 1 FROM public.tenants t WHERE t.id = prov_tenant) THEN
    INSERT INTO public.tenant_members (tenant_id, user_id, role)
    VALUES (prov_tenant, new.id, prov_role)
    ON CONFLICT (tenant_id, user_id) DO UPDATE SET
      role = (
        CASE greatest(
          CASE excluded.role
            WHEN 'super_admin' THEN 3
            WHEN 'admin' THEN 2
            ELSE 1
          END,
          CASE tenant_members.role
            WHEN 'super_admin' THEN 3
            WHEN 'admin' THEN 2
            ELSE 1
          END
        )
          WHEN 3 THEN 'super_admin'
          WHEN 2 THEN 'admin'
          ELSE 'member'
        END
      );

    IF EXISTS (
      SELECT 1
      FROM public.tenant_members tm2
      WHERE tm2.tenant_id = prov_tenant
        AND tm2.user_id = new.id
        AND tm2.role = 'super_admin'
    ) THEN
      UPDATE public.tenants
      SET owner_user_id = new.id
      WHERE id = prov_tenant
        AND owner_user_id IS NULL;
    END IF;
  ELSIF EXISTS (SELECT 1 FROM public.tenants t WHERE t.slug = 'default-chaster') THEN
    SELECT t.id
    INTO default_tenant_id
    FROM public.tenants t
    WHERE t.slug = 'default-chaster'
    LIMIT 1;

    IF default_tenant_id IS NOT NULL THEN
      member_role := CASE WHEN sales_count = 0 THEN 'super_admin' ELSE 'member' END;
      INSERT INTO public.tenant_members (tenant_id, user_id, role)
      VALUES (default_tenant_id, new.id, member_role)
      ON CONFLICT (tenant_id, user_id) DO UPDATE SET
        role = (
          CASE greatest(
            CASE excluded.role
              WHEN 'super_admin' THEN 3
              WHEN 'admin' THEN 2
              ELSE 1
            END,
            CASE tenant_members.role
              WHEN 'super_admin' THEN 3
              WHEN 'admin' THEN 2
              ELSE 1
            END
          )
            WHEN 3 THEN 'super_admin'
            WHEN 2 THEN 'admin'
            ELSE 'member'
          END
        );
    END IF;
  END IF;

  RETURN new;
END;
$$;
