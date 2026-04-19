import { CalendarExternalForm } from '../../src/index.ts';
import { createMicrosoft365Adapter } from './microsoft365Adapter.ts';

const fields = [
  { name: 'title', label: 'Title', type: 'text', required: true },
  { name: 'start', label: 'Start', type: 'datetime-local', required: true },
  { name: 'end', label: 'End', type: 'datetime-local', required: true },
  { name: 'location', label: 'Location', type: 'text' },
  { name: 'description', label: 'Description', type: 'textarea' },
];

export default function Microsoft365ExternalFormExample({ tokenProvider }: { tokenProvider: () => Promise<string> }) {
  const adapter = createMicrosoft365Adapter({ tokenProvider });

  return (
    <CalendarExternalForm
      fields={fields}
      adapter={adapter}
      submitLabel="Create in Microsoft 365"
      onSuccess={(result) => {
        console.log('Microsoft 365 event created', result?.id);
      }}
    />
  );
}
