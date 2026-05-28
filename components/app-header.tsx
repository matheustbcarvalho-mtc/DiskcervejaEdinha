import Link from 'next/link';

export function AppHeader() {
  return (
    <header className="border-b border-amber-100 bg-white/80 backdrop-blur">
      <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
        <Link href="/" className="text-xl font-black tracking-tight text-amber-900">
          DiskCerveja <span className="text-amber-600">Budget Analyzer</span>
        </Link>
        <nav className="flex gap-3 text-sm font-medium text-amber-900">
          <Link className="hover:text-amber-600" href="/upload">Upload</Link>
          <Link className="hover:text-amber-600" href="/quotes/local">Base normalizada</Link>
          <Link className="hover:text-amber-600" href="/analysis/local">Analise</Link>
        </nav>
      </div>
    </header>
  );
}
