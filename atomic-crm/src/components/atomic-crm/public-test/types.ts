export type ModuleSelection = {
  crmEnabled: boolean;
  widgetEnabled: boolean;
};

export type ProvisioningInput = {
  authUserId: string;
  companyName: string;
  email: string;
  firstName: string;
  lastName: string;
  notes?: string;
  moduleSelection: ModuleSelection;
};
