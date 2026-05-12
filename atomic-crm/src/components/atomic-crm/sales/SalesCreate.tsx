import { useMutation } from "@tanstack/react-query";
import { useDataProvider, useNotify, useRedirect, useTranslate } from "ra-core";
import type { SubmitHandler } from "react-hook-form";
import { SimpleForm } from "@/components/admin/simple-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import type { CrmDataProvider } from "../providers/types";
import type { SalesFormData } from "../types";
import { SalesInputs } from "./SalesInputs";
import { SalesProvisioningInputs } from "./SalesProvisioningInputs";

function sanitizeSalesPayload(data: SalesFormData): SalesFormData {
  const tenantId = data.tenant_id?.trim() ? data.tenant_id.trim() : undefined;
  const hqRole = data.chaster_team_role?.trim()
    ? data.chaster_team_role.trim()
    : undefined;
  if (tenantId && hqRole) {
    throw new Error(
      "Choose either HQ team membership or a client company invite, not both.",
    );
  }
  return {
    ...data,
    tenant_id: tenantId,
    chaster_team_role: hqRole,
    tenant_member_role: tenantId ? data.tenant_member_role : undefined,
  };
}

export function SalesCreate() {
  const dataProvider = useDataProvider<CrmDataProvider>();
  const notify = useNotify();
  const translate = useTranslate();
  const redirect = useRedirect();

  const { mutate } = useMutation({
    mutationKey: ["signup"],
    mutationFn: async (data: SalesFormData) => {
      return dataProvider.salesCreate(sanitizeSalesPayload(data));
    },
    onSuccess: (result) => {
      const invited =
        result &&
        typeof result === "object" &&
        "invite_email_sent" in result &&
        (result as { invite_email_sent?: boolean }).invite_email_sent === true;

      if (invited) {
        notify("resources.sales.create.success_invite", {
          messageArgs: {
            _:
              "Invitation email sent. They can open the link to accept access and set a password.",
          },
        });
      } else {
        notify("resources.sales.create.success", {
          messageArgs: {
            _: "User created successfully.",
          },
        });
      }
      redirect("/sales");
    },
    onError: (error) => {
      notify(
        error.message ||
          translate("resources.sales.create.error", {
            _: "An error occurred while creating the user.",
          }),
        {
          type: "error",
        },
      );
    },
  });
  const onSubmit: SubmitHandler<SalesFormData> = async (data) => {
    mutate(data);
  };

  return (
    <div className="max-w-lg w-full mx-auto mt-8">
      <Card>
        <CardHeader>
          <CardTitle>
            {translate("resources.sales.create.title", {
              _: "Create a new user",
            })}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <SimpleForm
            onSubmit={onSubmit as SubmitHandler<any>}
            defaultValues={{
              email: "",
              password: "",
              first_name: "",
              last_name: "",
              administrator: false,
              disabled: false,
              tenant_id: "",
              tenant_member_role: "workspace_member",
              chaster_team_role: "",
            }}
          >
            <SalesInputs />
            <SalesProvisioningInputs />
          </SimpleForm>
        </CardContent>
      </Card>
    </div>
  );
}
