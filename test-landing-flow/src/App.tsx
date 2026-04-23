import { Link, Navigate, Route, Routes, useNavigate, useSearchParams } from "react-router-dom";
import { type FormEvent, useMemo, useState } from "react";
import { provisionTenant } from "./api";
import "./App.css";

function parseBool(input: string | null, fallback: boolean): boolean {
  if (input === null) return fallback;
  return input.toLowerCase() === "true";
}

function LandingPage() {
  const navigate = useNavigate();
  const [crmEnabled, setCrmEnabled] = useState(true);
  const [widgetEnabled, setWidgetEnabled] = useState(true);

  const continueCheckout = () => {
    const params = new URLSearchParams({
      crm: String(crmEnabled),
      widget: String(widgetEnabled),
    });
    navigate(`/checkout?${params.toString()}`);
  };

  return (
    <main className="page">
      <section className="panel">
        <p className="eyebrow">Chaster test landing</p>
        <h1>Simulated Subscription Flow</h1>
        <p className="lead">
          Test the full journey: choose modules, simulate card checkout, provision tenant, and
          validate invite onboarding.
        </p>
        <div className="options">
          <label>
            <input
              type="checkbox"
              checked={crmEnabled}
              onChange={(event) => setCrmEnabled(event.target.checked)}
            />
            CRM module
          </label>
          <label>
            <input
              type="checkbox"
              checked={widgetEnabled}
              onChange={(event) => setWidgetEnabled(event.target.checked)}
            />
            Widget module
          </label>
        </div>
        <div className="row">
          <button onClick={continueCheckout} disabled={!crmEnabled && !widgetEnabled}>
            Continue to checkout
          </button>
        </div>
      </section>
    </main>
  );
}

function CheckoutPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const crmEnabled = parseBool(params.get("crm"), true);
  const widgetEnabled = parseBool(params.get("widget"), true);
  const packageLabel = useMemo(() => {
    if (crmEnabled && widgetEnabled) return "CRM + Widget";
    if (crmEnabled) return "CRM only";
    if (widgetEnabled) return "Widget only";
    return "None";
  }, [crmEnabled, widgetEnabled]);

  const [companyName, setCompanyName] = useState("");
  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [notes, setNotes] = useState("");
  const [cardNumber, setCardNumber] = useState("4242 4242 4242 4242");
  const [expiry, setExpiry] = useState("12/30");
  const [cvc, setCvc] = useState("123");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    if (!crmEnabled && !widgetEnabled) {
      setError("Select at least one module.");
      return;
    }
    try {
      setLoading(true);
      const result = await provisionTenant({
        companyName,
        email,
        firstName,
        lastName,
        notes,
        selection: { crmEnabled, widgetEnabled },
      });
      const nextParams = new URLSearchParams({
        tenantName: result.tenant?.company_name || companyName,
        tenantSlug: result.tenant?.slug || "",
        inviteSent: String(Boolean(result.invite_email_sent)),
        crm: String(crmEnabled),
        widget: String(widgetEnabled),
      });
      navigate(`/success?${nextParams.toString()}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Checkout simulation failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="page">
      <section className="panel">
        <p className="eyebrow">Simulation checkout</p>
        <h1>Package: {packageLabel}</h1>
        <p className="lead">Card details are fake only. No charge is made.</p>
        {error ? <p className="error">{error}</p> : null}
        <form onSubmit={onSubmit} className="form">
          <input
            placeholder="Company name"
            value={companyName}
            onChange={(event) => setCompanyName(event.target.value)}
            required
          />
          <input
            type="email"
            placeholder="Owner email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
          <div className="split">
            <input
              placeholder="First name"
              value={firstName}
              onChange={(event) => setFirstName(event.target.value)}
            />
            <input
              placeholder="Last name"
              value={lastName}
              onChange={(event) => setLastName(event.target.value)}
            />
          </div>
          <textarea
            placeholder="Notes (optional)"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
          />
          <input
            placeholder="Card number"
            value={cardNumber}
            onChange={(event) => setCardNumber(event.target.value)}
            required
          />
          <div className="split">
            <input value={expiry} onChange={(event) => setExpiry(event.target.value)} required />
            <input value={cvc} onChange={(event) => setCvc(event.target.value)} required />
          </div>
          <div className="row">
            <button type="submit" disabled={loading}>
              {loading ? "Processing..." : "Complete simulated purchase"}
            </button>
            <Link to="/">Back</Link>
          </div>
        </form>
      </section>
    </main>
  );
}

function SuccessPage() {
  const [params] = useSearchParams();
  const tenantName = params.get("tenantName") || "Workspace";
  const tenantSlug = params.get("tenantSlug") || "pending";
  const inviteSent = parseBool(params.get("inviteSent"), false);

  return (
    <main className="page">
      <section className="panel">
        <p className="eyebrow">Success</p>
        <h1>{tenantName} provisioned</h1>
        <p className="lead">
          Slug: <code>{tenantSlug}</code>
        </p>
        <p className="lead">Invite email status: {inviteSent ? "sent" : "check logs"}.</p>
        <ul>
          <li>Open invite email and set password.</li>
          <li>Log into CRM portal and verify subscription module visibility.</li>
          <li>If widget enabled, copy embed snippet from portal settings.</li>
        </ul>
        <div className="row">
          <a href="http://localhost:5173/landing-test" target="_blank" rel="noreferrer">
            Open CRM test route
          </a>
          <Link to="/">Run another simulation</Link>
        </div>
      </section>
    </main>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/checkout" element={<CheckoutPage />} />
      <Route path="/success" element={<SuccessPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
