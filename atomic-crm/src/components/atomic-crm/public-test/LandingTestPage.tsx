import { Link, useNavigate } from "react-router";
import { type FormEvent, useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getSupabaseClient } from "../providers/supabase/supabase";

export function LandingTestPage() {
  const navigate = useNavigate();
  const [crmEnabled, setCrmEnabled] = useState(true);
  const [widgetEnabled, setWidgetEnabled] = useState(true);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const goToCheckout = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    if (!crmEnabled && !widgetEnabled) {
      setError("Select at least one module to continue.");
      return;
    }
    if (!email.trim()) {
      setError("Email is required.");
      return;
    }
    if (!password || password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    setSubmitting(true);
    const supabase = getSupabaseClient();
    const normalizedEmail = email.trim().toLowerCase();
    const { error: signUpError } = await supabase.auth.signUp({
      email: normalizedEmail,
      password,
      options: {
        data: {
          first_name: firstName.trim() || "Owner",
          last_name: lastName.trim() || "User",
          defer_tenant_assignment: true,
        },
      },
    });
    if (signUpError) {
      setSubmitting(false);
      setError(signUpError.message);
      return;
    }
    const params = new URLSearchParams({
      crm: String(crmEnabled),
      widget: String(widgetEnabled),
      email: normalizedEmail,
      firstName: firstName.trim() || "Owner",
      lastName: lastName.trim() || "User",
    });
    navigate(`/checkout/test?${params.toString()}`);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-5xl px-4 py-14 space-y-8">
        <div className="space-y-3">
          <p className="text-xs uppercase tracking-widest text-slate-400">
            Chaster test acquisition flow
          </p>
          <h1 className="text-4xl font-semibold leading-tight">
            Landing Page + Simulated Subscription Checkout
          </h1>
          <p className="text-slate-300 max-w-3xl">
            Use this page to simulate how your client chooses modules, completes checkout,
            receives an invite email, and then accesses CRM and widget setup.
          </p>
        </div>

        <form onSubmit={goToCheckout}>
          <Card className="bg-slate-900 border-slate-800 text-slate-100">
            <CardHeader>
              <CardTitle>Create account + choose modules</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="landing-first-name">First name</Label>
                  <Input
                    id="landing-first-name"
                    value={firstName}
                    onChange={(event) => setFirstName(event.target.value)}
                    placeholder="John"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="landing-last-name">Last name</Label>
                  <Input
                    id="landing-last-name"
                    value={lastName}
                    onChange={(event) => setLastName(event.target.value)}
                    placeholder="Doe"
                  />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="landing-email">Email</Label>
                  <Input
                    id="landing-email"
                    type="email"
                    required
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="owner@company.com"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="landing-password">Password</Label>
                  <Input
                    id="landing-password"
                    type="password"
                    required
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="At least 8 characters"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="landing-password-confirm">Confirm password</Label>
                  <Input
                    id="landing-password-confirm"
                    type="password"
                    required
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    placeholder="Repeat password"
                  />
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-start gap-3 rounded-md border border-slate-700 p-3">
                  <Checkbox
                    id="landing-crm-module"
                    checked={crmEnabled}
                    onCheckedChange={(value) => setCrmEnabled(value === true)}
                  />
                  <div className="space-y-1">
                    <Label htmlFor="landing-crm-module" className="text-sm font-medium">
                      CRM access
                    </Label>
                    <p className="text-xs text-slate-400">
                      Enables tenant portal access, team management, support case views, and
                      subscription overview.
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3 rounded-md border border-slate-700 p-3">
                  <Checkbox
                    id="landing-widget-module"
                    checked={widgetEnabled}
                    onCheckedChange={(value) => setWidgetEnabled(value === true)}
                  />
                  <div className="space-y-1">
                    <Label htmlFor="landing-widget-module" className="text-sm font-medium">
                      Chat widget access
                    </Label>
                    <p className="text-xs text-slate-400">
                      Enables widget configuration and embed snippet visibility from the portal.
                    </p>
                  </div>
                </div>
              </div>

              {error ? <p className="text-sm text-red-300">{error}</p> : null}
              {!crmEnabled && !widgetEnabled ? (
                <p className="text-sm text-amber-300">
                  Select at least one module to continue.
                </p>
              ) : null}

              <div className="flex flex-wrap gap-3">
                <Button
                  type="submit"
                  disabled={submitting || (!crmEnabled && !widgetEnabled)}
                >
                  {submitting
                    ? "Creating account..."
                    : "Create account and continue to simulated checkout"}
                </Button>
                <Button asChild type="button" variant="secondary">
                  <Link to="/login">Already have account? Sign in</Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        </form>

        <Card className="bg-slate-900 border-slate-800 text-slate-100">
          <CardHeader>
            <CardTitle>What this test covers</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-slate-300">
            <p className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-400" />
              Simulated card entry (no payment gateway, no charges)
            </p>
            <p className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-400" />
              Tenant provisioning in Supabase + invite email dispatch
            </p>
            <p className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-400" />
              CRM and widget module visibility after onboarding
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
