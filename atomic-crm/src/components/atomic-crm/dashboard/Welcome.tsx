import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const Welcome = () => (
  <Card>
    <CardHeader className="px-4">
      <CardTitle>Welcome to Chaster CRM</CardTitle>
    </CardHeader>
    <CardContent className="px-4">
      <p className="text-sm mb-4">
        Chaster CRM is your workspace for contacts, deals, tasks, and team
        activity. This demo can run on mock data (it resets on reload) or on
        Supabase when configured.
      </p>
      <p className="text-sm">
        Built with{" "}
        <a
          href="https://marmelab.com/shadcn-admin-kit"
          className="underline hover:no-underline"
        >
          shadcn-admin-kit
        </a>
        .
      </p>
    </CardContent>
  </Card>
);
