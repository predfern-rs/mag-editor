import { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PostSidebar } from './components/layout/PostSidebar';
import { PostEditorPage } from './pages/PostEditorPage';
import { ReportModePage } from './pages/ReportModePage';
import { SITES, getActiveSite, setActiveSite } from './config';
import type { WpSite } from './config';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
    },
  },
});

type AppMode = 'editor' | 'report';

function AppContent() {
  const [mode, setMode] = useState<AppMode>('report');
  const [selectedPostId, setSelectedPostId] = useState<number | null>(null);
  const [currentSite, setCurrentSite] = useState<WpSite>(getActiveSite());

  function handleSiteChange(siteId: string) {
    setActiveSite(siteId);
    setCurrentSite(getActiveSite());
    setSelectedPostId(null);
    queryClient.clear();
  }

  function handleSwitchToEditor(_postSlug: string) {
    // Switch to editor mode and find the post by slug
    setMode('editor');
    // The PostSidebar will handle finding it
  }

  return (
    <div className="h-screen flex flex-col bg-[#f0f2f8]">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-5 py-2.5 flex items-center justify-between flex-shrink-0 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center">
            <span className="text-white text-xs font-bold">M</span>
          </div>
          <div>
            <h1 className="text-sm font-bold text-gray-800 tracking-wide">Mag Internal Link Editor</h1>
          </div>
        </div>

        {/* Mode link */}
        <button
          onClick={() => setMode(mode === 'report' ? 'editor' : 'report')}
          className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
        >
          {mode === 'report' ? 'Editor' : '\u2190 Back to Report'}
        </button>

        {/* Site selector */}
        <div className="flex items-center gap-2">
          {SITES.length > 1 && (
            <select
              value={currentSite.id}
              onChange={(e) => handleSiteChange(e.target.value)}
              className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 text-xs font-medium text-gray-700 outline-none focus:border-blue-400"
            >
              {SITES.map((site) => (
                <option key={site.id} value={site.id}>{site.name}</option>
              ))}
            </select>
          )}
          <span className="text-[10px] text-gray-400 bg-gray-50 px-2 py-1 rounded-md">
            {currentSite.name}
          </span>
        </div>
      </header>

      {/* Main content */}
      {mode === 'editor' ? (
        <div className="flex flex-1 overflow-hidden">
          <div className="w-72 flex-shrink-0 overflow-hidden bg-white border-r border-gray-200 shadow-sm">
            <PostSidebar
              selectedPostId={selectedPostId}
              onSelectPost={setSelectedPostId}
            />
          </div>
          <main className="flex-1 overflow-y-auto">
            {selectedPostId ? (
              <div className="p-5">
                <PostEditorPage key={selectedPostId} postIdOverride={selectedPostId} />
              </div>
            ) : (
              <div className="flex items-center justify-center h-full">
                <div className="text-center">
                  <div className="w-20 h-20 mx-auto mb-4 rounded-2xl bg-white shadow-md flex items-center justify-center">
                    <span className="text-3xl">📝</span>
                  </div>
                  <p className="text-lg font-semibold text-gray-700">Select a post to edit</p>
                  <p className="text-sm text-gray-400 mt-1">Choose a language and click on an article</p>
                </div>
              </div>
            )}
          </main>
        </div>
      ) : (
        <ReportModePage onSwitchToEditor={handleSwitchToEditor} />
      )}
    </div>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AppContent />
    </QueryClientProvider>
  );
}
