import { AutocompleteInput } from "@/components/admin/autocomplete-input";
import { ReferenceInput } from "@/components/admin/reference-input";
import { SelectInput } from "@/components/admin/select-input";
import { TextInput } from "@/components/admin/text-input";
import { required } from "ra-core";
import { DateTimeInput } from "@/components/admin";

import { contactOptionText } from "../misc/ContactOption";
import { useConfigurationContext } from "../root/ConfigurationContext";

const priorityChoices = [
  { id: "low", name: "Low" },
  { id: "medium", name: "Medium" },
  { id: "high", name: "High" },
  { id: "urgent", name: "Urgent" },
];

const statusChoices = [
  { id: "pending", name: "Pending" },
  { id: "in_progress", name: "In Progress" },
  { id: "completed", name: "Completed" },
  { id: "cancelled", name: "Cancelled" },
];

const recurringChoices = [
  { id: "", name: "None" },
  { id: "FREQ=DAILY;INTERVAL=1", name: "Daily" },
  { id: "FREQ=WEEKLY;INTERVAL=1", name: "Weekly" },
  { id: "FREQ=WEEKLY;INTERVAL=2", name: "Biweekly" },
  { id: "FREQ=MONTHLY;INTERVAL=1", name: "Monthly" },
];

export const TaskFormContent = ({
  selectContact,
  contactAutocompleteFilter,
}: {
  selectContact?: boolean;
  /** Extra filter for contact picker (e.g. tenant-scoped dashboard). */
  contactAutocompleteFilter?: Record<string, unknown>;
}) => {
  const { taskTypes } = useConfigurationContext();
  return (
    <div className="flex flex-col gap-4">
      <TextInput
        autoFocus
        source="text"
        validate={required()}
        multiline
        className="m-0"
        helperText={false}
      />
      {selectContact && (
        <ReferenceInput
          source="contact_id"
          reference="contacts_summary"
          filter={contactAutocompleteFilter}
        >
          <AutocompleteInput
            label="resources.tasks.fields.contact_id"
            optionText={contactOptionText}
            helperText={false}
            validate={required()}
            modal
          />
        </ReferenceInput>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <DateTimeInput
          source="due_date"
          helperText={false}
          validate={required()}
        />
        <SelectInput
          source="type"
          validate={required()}
          choices={taskTypes}
          optionText="label"
          optionValue="value"
          defaultValue="none"
          helperText={false}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <SelectInput
          source="priority"
          label="Priority"
          choices={priorityChoices}
          defaultValue="medium"
          helperText={false}
        />
        <SelectInput
          source="status"
          label="Status"
          choices={statusChoices}
          defaultValue="pending"
          helperText={false}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <ReferenceInput source="assigned_to" reference="sales">
          <AutocompleteInput
            label="Assign To"
            optionText={(record: { first_name?: string; last_name?: string; email?: string }) =>
              [record?.first_name, record?.last_name].filter(Boolean).join(" ") ||
              record?.email ||
              ""
            }
            helperText={false}
            modal
            filterToQuery={(search: string) => ({
              q: search,
            })}
          />
        </ReferenceInput>
        <SelectInput
          source="recurring_rule"
          label="Recurring"
          choices={recurringChoices}
          helperText={false}
        />
      </div>
    </div>
  );
};
