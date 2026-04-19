import { CalendarExternalForm } from '../src/index.ts';

const fields = [
  { name: 'title', label: 'Title', type: 'text', required: true },
  { name: 'start', label: 'Start', type: 'datetime-local', required: true },
  { name: 'end', label: 'End', type: 'datetime-local', required: true },
  { name: 'description', label: 'Description', type: 'textarea' },
];

const adapter = {
  async submitEvent(payload) {
    await new Promise(resolve => setTimeout(resolve, 250));
    return { id: `ext-${Date.now()}`, payload };
  },
};

export function ExternalFormExample() {
  return (
    <CalendarExternalForm
      fields={fields}
      adapter={adapter}
      submitLabel="Submit Request"
      onSuccess={(result) => console.log('external-form success', result)}
    />
  );
}
