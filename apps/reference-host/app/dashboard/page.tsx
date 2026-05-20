import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { CalendarMount } from './CalendarMount';

export default async function Dashboard() {
  // Middleware already gates this route — this is a belt-and-suspenders
  // check so the server component never renders without a user, and so the
  // email shows up in the header chrome below.
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect('/login');

  return <CalendarMount userEmail={data.user.email ?? null} />;
}
