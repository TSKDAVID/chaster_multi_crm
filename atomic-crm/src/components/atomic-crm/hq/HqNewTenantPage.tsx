import {
  FunctionsFetchError,
  FunctionsHttpError,
} from "@supabase/supabase-js";
import { ArrowLeft } from "lucide-react";
import { useNotify, useTranslate } from "ra-core";
import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getSupabaseClient } from "../providers/supabase/supabase";

async function formatEdgeFunctionError(error: unknown): Promise<string> {
  if (error instanceof FunctionsHttpError) {
    const res = error.context as Response;
    try {
      const j = (await res.json()) as { error?: string; message?: string };
      return j.error ?? j.message ?? error.message;
    } catch {
      try {
        const t = await res.text();
        return t || error.message;
      } catch {
        return error.message;
      }
    }
  }
  if (error instanceof FunctionsFetchError) {
    const c = error.context;
    const cause =
      c instanceof Error
        ? c.message
        : c && typeof c === "object" && "message" in c
          ? String((c as { message: string }).message)
          : "";
    return [
      error.message,
      cause,
      "Often this means the function is not deployed yet — run: npm run functions:deploy:hq (after supabase login & link).",
    ]
      .filter(Boolean)
      .join(" ");
  }
  if (error && typeof error === "object" && "message" in error) {
    return String((error as { message: string }).message);
  }
  return String(error);
}

export function HqNewTenantPage() {
  const translate = useTranslate();
  const notify = useNotify();
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);
  const [companyName, setCompanyName] = useState("");
  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [tier, setTier] = useState("starter");
  const [status, setStatus] = useState("trial");
  const [trialEnds, setTrialEnds] = useState("");
  const [createCrmCompany, setCreateCrmCompany] = useState(true);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!companyName.trim() || !email.trim()) {
      notify(translate("chaster.hq.new_required"), { type: "warning" });
      return;
    }
    setSubmitting(true);
    try {
      const body: Record<string, string> = {
        company_name: companyName.trim(),
        email: email.trim().toLowerCase(),
        subscription_tier: tier,
        status,
        first_name: firstName.trim() || "Pending",
        last_name: lastName.trim() || "Pending",
      };
      if (trialEnds) {
        body.trial_ends_at = new Date(trialEnds).toISOString();
      }
      if (createCrmCompany) {
        body.create_crm_company = "true";
      }

      const supabase = getSupabaseClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) {
        notify(translate("chaster.hq.new_need_sign_in"), { type: "warning" });
        return;
      }

      const { data, error } = await supabase.functions.invoke<{
        tenant?: { id: string };
        crm_company_created?: boolean;
        crm_company_error?: string;
      }>("hq_provision_tenant", {
        body,
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (error) {
        throw new Error(await formatEdgeFunctionError(error));
      }
      if (!data?.tenant?.id) {
        throw new Error("Unexpected response");
      }

      notify(translate("chaster.hq.new_success"), { type: "success" });
      if (createCrmCompany && data.crm_company_created === false) {
        notify(translate("chaster.hq.new_crm_company_failed"), {
          type: "warning",
        });
        if (import.meta.env.DEV && data.crm_company_error) {
          console.warn("hq_provision_tenant crm_company_error:", data.crm_company_error);
        }
      }
      navigate(`/hq/companies/${data.tenant.id}`);
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : await formatEdgeFunctionError(err);
      notify(msg, { type: "error" });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-lg mx-auto p-6 space-y-6">
      <Button asChild variant="ghost" size="sm" className="gap-1 -ml-2">
        <Link to="/hq">
          <ArrowLeft className="h-4 w-4" />
          {translate("chaster.hq.back_dashboard")}
        </Link>
      </Button>

      <Card>
        <CardHeader>
          <CardTitle>{translate("chaster.hq.new_title")}</CardTitle>
          <CardDescription>{translate("chaster.hq.new_desc")}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="hq-co">{translate("chaster.hq.new_company_name")}</Label>
              <Input
                id="hq-co"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                autoComplete="organization"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="hq-em">{translate("chaster.hq.new_admin_email")}</Label>
              <Input
                id="hq-em"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="hq-fn">{translate("chaster.hq.new_first_name")}</Label>
                <Input
                  id="hq-fn"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="hq-ln">{translate("chaster.hq.new_last_name")}</Label>
                <Input
                  id="hq-ln"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>{translate("chaster.hq.new_tier")}</Label>
              <Select value={tier} onValueChange={setTier}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="starter">starter</SelectItem>
                  <SelectItem value="pro">pro</SelectItem>
                  <SelectItem value="enterprise">enterprise</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{translate("chaster.hq.new_status")}</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="trial">trial</SelectItem>
                  <SelectItem value="active">active</SelectItem>
                  <SelectItem value="suspended">suspended</SelectItem>
                  <SelectItem value="churned">churned</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="hq-tr">{translate("chaster.hq.new_trial_end")}</Label>
              <Input
                id="hq-tr"
                type="datetime-local"
                value={trialEnds}
                onChange={(e) => setTrialEnds(e.target.value)}
              />
            </div>
            <div className="flex items-start gap-3 rounded-lg border border-border/80 p-3">
              <Checkbox
                id="hq-crm-co"
                checked={createCrmCompany}
                onCheckedChange={(v) => setCreateCrmCompany(v === true)}
                className="mt-0.5"
              />
              <div className="space-y-1 min-w-0">
                <Label htmlFor="hq-crm-co" className="font-medium cursor-pointer leading-snug">
                  {translate("chaster.hq.new_create_crm_company")}
                </Label>
                <p className="text-xs text-muted-foreground">
                  {translate("chaster.hq.new_create_crm_company_hint")}
                </p>
              </div>
            </div>
            <Button type="submit" disabled={submitting} className="w-full">
              {submitting
                ? translate("chaster.hq.new_submitting")
                : translate("chaster.hq.new_submit")}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
