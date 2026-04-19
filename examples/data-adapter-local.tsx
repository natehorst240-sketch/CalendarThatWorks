import { CalendarExternalForm, createLocalStorageDataAdapter } from '../src/index.ts';

const fields = [
  { name: 'title', label: 'Title', type: 'text', required: true },
  { name: 'start', label: 'Start', type: 'datetime-local', required: true },
  { name: 'end', label: 'End', type: 'datetime-local', required: true },
  { name: 'category', label: 'Category', type: 'text' },
];

const adapter = createLocalStorageDataAdapter({ key: 'works-calendar:example:external-form' });

export function LocalDataAdapterExample() {
  return <CalendarExternalForm fields={fields} adapter={adapter} submitLabel="Save Event" />;
}
