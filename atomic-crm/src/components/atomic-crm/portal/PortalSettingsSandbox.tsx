import { useChasterAccess } from "../access/chasterAccessContext";
import { ChasterBrainSandboxChat } from "../brain/ChasterBrainSandboxChat";

export function PortalSettingsSandbox() {
  const { tenantId } = useChasterAccess();
  return <ChasterBrainSandboxChat tenantId={tenantId} storageScope="portal" compact />;
}
