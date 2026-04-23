import { type FormEvent, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { AlertCircle, CreditCard } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { provisionTenantForTestCheckout } from "./provisioningClient";
import { getSupabaseClient } from "../providers/supabase/supabase";

function parseBoolean(value: string | null, fallback = false): boolean {
  if (value === null) return fallback;
  return value.toLowerCase() === "true";
}

export function CheckoutTestPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [companyName, setCompanyName] = useState("");
  const [email, setEmail] = useState(params.get("email") ?? "");
  const [firstName, setFirstName] = useState(params.get("firstName") ?? "");
  const [lastName, setLastName] = useState(params.get("lastName") ?? "");
  const [notes, setNotes] = useState("");
  const [cardNumber, setCardNumber] = useState("4242 4242 4242 4242");
  const [expiry, setExpiry] = useState("12/30");
  const [cvc, setCvc] = useState("123");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const crmEnabled = parseBoolean(params.get("crm"), true);
  const widgetEnabled = parseBoolean(params.get("widget"), true);
  const selectedLabel = useMemo(() => {
    if (crmEnabled && widgetEnabled) return "CRM + Widget";
    if (crmEnabled) return "CRM only";
    if (widgetEnabled) return "Widget only";
    return "No module selected";
  }, [crmEnabled, widgetEnabled]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    if (!crmEnabled && !widgetEnabled) {
      setError("Select at least one module on landing page.");
      return;
    }
    if (!companyName.trim() || !email.trim()) {
      setError("Company name and owner email are required.");
      return;
    }
    if (!cardNumber.trim() || !expiry.trim() || !cvc.trim()) {
      setError("Enter simulated card details to continue.");
      return;
    }

    try {
      setSubmitting(true);
      const {
        data: { user },
      } = await getSupabaseClient().auth.getUser();
      if (!user?.id) {
        throw new Error("Please sign in first on landing page before checkout.");
      }
      const result = await provisionTenantForTestCheckout({
        authUserId: user.id,
        companyName: companyName.trim(),
        email: email.trim(),
        firstName: firstName.trim() || "Owner",
        lastName: lastName.trim() || "User",
        notes: notes.trim(),
        moduleSelection: { crmEnabled, widgetEnabled },
      });

      const successParams = new URLSearchParams({
        tenantSlug: result.tenant?.slug ?? "",
        tenantName: result.tenant?.company_name ?? companyName.trim(),
        crm: String(crmEnabled),
        widget: String(widgetEnabled),
        inviteSent: String(Boolean(result.invite_email_sent)),
      });
      navigate(`/checkout/test/success?${successParams.toString()}`);
    } catch (caught) {
      const message =
        caught instanceof Error
          ? caught.message
          : "Unexpected checkout simulation error.";
      setError(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-3xl px-4 py-12 space-y-6">
        <div className="space-y-1">
          <p className="text-xs uppercase tracking-widest text-slate-400">
            Simulated checkout
          </p>
          <h1 className="text-3xl font-semibold">Complete test subscription</h1>
          <p className="text-slate-300">
            Selected package: <span className="font-medium">{selectedLabel}</span>
          </p>
        </div>

        <Card className="bg-slate-900 border-slate-800 text-slate-100">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5" />
              Payment simulation
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-slate-300">
              No real payment is processed in this test. Card values are collected only to
              validate the onboarding flow UX.
            </p>
          </CardContent>
        </Card>

        {error ? (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Could not complete simulation</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        <form onSubmit={submit} className="space-y-6">
          <Card className="bg-slate-900 border-slate-800 text-slate-100">
            <CardHeader>
              <CardTitle>Account owner</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="companyName">Company name</Label>
                <Input
                  id="companyName"
                  value={companyName}
                  onChange={(event) => setCompanyName(event.target.value)}
                  placeholder="Acme Support Center"
                  required
                />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="email">Owner email</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="owner@acme.test"
                  required
                  readOnly
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="firstName">First name</Label>
                <Input
                  id="firstName"
                  value={firstName}
                  onChange={(event) => setFirstName(event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lastName">Last name</Label>
                <Input
                  id="lastName"
                  value={lastName}
                  onChange={(event) => setLastName(event.target.value)}
                />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="notes">Internal notes (optional)</Label>
                <Textarea
                  id="notes"
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  placeholder="Testing end-to-end CRM + widget onboarding."
                  rows={3}
                />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-slate-900 border-slate-800 text-slate-100">
            <CardHeader>
              <CardTitle>Card details (simulation only)</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2 md:col-span-3">
                <Label htmlFor="cardNumber">Card number</Label>
                <Input
                  id="cardNumber"
                  value={cardNumber}
                  onChange={(event) => setCardNumber(event.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="expiry">Expiry</Label>
                <Input
                  id="expiry"
                  value={expiry}
                  onChange={(event) => setExpiry(event.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cvc">CVC</Label>
                <Input
                  id="cvc"
                  value={cvc}
                  onChange={(event) => setCvc(event.target.value)}
                  required
                />
              </div>
            </CardContent>
          </Card>

          <div className="flex flex-wrap gap-3">
            <Button type="submit" disabled={submitting}>
              {submitting ? "Processing simulation..." : "Complete simulated purchase"}
            </Button>
            <Button type="button" variant="secondary" onClick={() => navigate("/landing-test")}>
              Back to landing
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
