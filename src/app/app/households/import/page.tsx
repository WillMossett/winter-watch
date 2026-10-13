import Link from 'next/link';
import { Importer } from './Importer';

export const metadata = { title: 'Import list' };

export default function ImportPage() {
  return (
    <section className="panel">
      <div className="panel-head"><h2>Import a list</h2><Link className="btn quiet" href="/app/households">Back to households</Link></div>
      <Importer />
    </section>
  );
}
