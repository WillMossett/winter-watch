import { getSettings } from '@/lib/db';
import { PublicPage } from '@/components/PublicPage';

export const dynamic = 'force-dynamic';

export default async function Home({ searchParams }: { searchParams: Promise<{ thanks?: string; error?: string }> }) {
  const sp = await searchParams;
  const settings = await getSettings();
  return <PublicPage code={null} known={false} settings={settings} thanks={Boolean(sp.thanks)} error={sp.error} />;
}
