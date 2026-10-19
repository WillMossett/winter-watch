import { FieldApp } from '@/components/field/FieldApp';

// Served the same to everyone and cached on the phone, so it opens with no signal.
// Who is signed in, and their visits, come from /api/field/today.
export const dynamic = 'force-static';

export default function FieldPage() {
  return <FieldApp />;
}
