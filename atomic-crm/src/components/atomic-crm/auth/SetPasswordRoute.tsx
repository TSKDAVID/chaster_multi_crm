import { SetPasswordPage } from "@/components/supabase/set-password-page";
import { SetPasswordSessionConflictGate } from "./SetPasswordSessionConflictGate";

export function SetPasswordRoute() {
  return (
    <SetPasswordSessionConflictGate>
      <SetPasswordPage />
    </SetPasswordSessionConflictGate>
  );
}
