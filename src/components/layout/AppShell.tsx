import { Outlet } from 'react-router-dom';
import { Header } from './Header';

export function AppShell() {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <Header />
      <main className="flex-1 w-full max-w-screen-2xl mx-auto px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
