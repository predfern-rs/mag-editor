import { Link } from 'react-router-dom';

export function Header() {
  return (
    <header className="bg-gray-900 text-white px-6 py-3 flex items-center gap-4 shadow-sm">
      <Link to="/" className="text-lg font-semibold tracking-tight hover:text-gray-300 transition-colors">
        Mag Internal Link Editor
      </Link>
    </header>
  );
}
