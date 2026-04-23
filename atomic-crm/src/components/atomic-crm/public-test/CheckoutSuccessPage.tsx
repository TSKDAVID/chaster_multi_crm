import { Link, useSearchParams } from "react-router";
import { BadgeCheck, ExternalLink, MailCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

function parseBoolean(value: string | null, fallback = false): boolean {
  if (value === null) return fallback;
  return value.toLowerCase() === "true";
}

export function CheckoutSuccessPage() {
  const [params] = useSearchParams();
  const tenantName = params.get("tenantName") || "Your new workspace";
  const tenantSlug = params.get("tenantSlug") || "pending-slug";
  const crmEnabled = parseBoolean(params.get("crm"), true);
  const widgetEnabled = parseBoolean(params.get("widget"), true);
  const inviteSent = parseBoolean(params.get("inviteSent"), false);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-3xl px-4 py-12 space-y-6">
        <Card className="bg-slate-900 border-slate-800 text-slate-100">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-2xl">
              <BadgeCheck className="h-6 w-6 text-emerald-400" />
              Simulated purchase completed
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-slate-200">
            <p>
              Workspace <span className="font-medium">{tenantName}</span> is provisioned for
              testing with slug <span className="font-mono">{tenantSlug}</span>.
            </p>
            <p className="flex items-center gap-2">
              <MailCheck className="h-4 w-4 text-emerald-400" />
              Provisioning status: {inviteSent ? "completed" : "completed (no invite required)"}
            </p>
            <p>
              Use the same email/password created on landing page to sign in. CRM access is enabled
              only when CRM module was included in this purchase.
            </p>
          </CardContent>
        </Card>

        <Card className="bg-slate-900 border-slate-800 text-slate-100">
          <CardHeader>
            <CardTitle>Next testing steps</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-slate-200">
            <p>1. Sign in using the same landing-page credentials.</p>
            {crmEnabled ? <p>2. Validate CRM portal access under `/portal`.</p> : null}
            {widgetEnabled ? (
              <p>
                3. In portal settings, copy widget embed snippet and add it to a client test
                site.
              </p>
            ) : null}
            <p>4. Open chats in widget and validate support case visibility in CRM.</p>
          </CardContent>
        </Card>

        <div className="flex flex-wrap gap-3">
          <Button asChild>
            <Link to="/login">Go to sign in</Link>
          </Button>
          <Button asChild variant="secondary">
            <Link to="/portal/subscription">Open subscription page</Link>
          </Button>
          <Button asChild variant="secondary">
            <a href="/chaster-widget/widget.html" target="_blank" rel="noreferrer">
              Open widget demo <ExternalLink className="h-4 w-4" />
            </a>
          </Button>
        </div>
      </div>
    </div>
  );
}
