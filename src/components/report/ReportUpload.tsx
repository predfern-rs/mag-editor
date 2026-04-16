import { useState, useRef, useCallback } from 'react';
import type { AuditReport } from '../../lib/report-parser';
import { parseAuditReport } from '../../lib/report-parser';

interface ReportUploadProps {
  onReportLoaded: (report: AuditReport) => void;
}

export function ReportUpload({ onReportLoaded }: ReportUploadProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const processFile = useCallback(
    async (file: File) => {
      if (!file.name.endsWith('.html') && !file.name.endsWith('.htm')) {
        setError('Please upload an HTML file (.html)');
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        const text = await file.text();
        const report = parseAuditReport(text);

        if (report.articles.length === 0) {
          setError('No articles found in the report. Is this a valid audit report?');
          setIsLoading(false);
          return;
        }

        onReportLoaded(report);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to parse report';
        setError(msg);
      } finally {
        setIsLoading(false);
      }
    },
    [onReportLoaded],
  );

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }

  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const file = e.dataTransfer.files[0];
    if (file) void processFile(file);
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) void processFile(file);
  }

  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="w-full max-w-lg">
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={`relative rounded-xl border-2 border-dashed p-12 text-center transition-colors ${
            isDragging
              ? 'border-blue-400 bg-blue-50'
              : 'border-gray-300 bg-white hover:border-gray-400'
          } ${isLoading ? 'pointer-events-none opacity-60' : ''}`}
        >
          {isLoading ? (
            <div className="flex flex-col items-center gap-3">
              <div className="w-10 h-10 rounded-full border-2 border-blue-200 border-t-blue-500 animate-spin" />
              <p className="text-sm text-gray-500">Parsing report...</p>
            </div>
          ) : (
            <>
              <div className="mx-auto mb-4 w-14 h-14 rounded-xl bg-blue-50 flex items-center justify-center">
                <svg
                  className="w-7 h-7 text-blue-500"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={1.5}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"
                  />
                </svg>
              </div>

              <p className="text-base font-semibold text-gray-700 mb-1">
                Drop your HTML report here
              </p>
              <p className="text-sm text-gray-400 mb-4">
                or click to browse for a file
              </p>

              <button
                onClick={() => fileInputRef.current?.click()}
                className="px-5 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
              >
                Browse files
              </button>

              <input
                ref={fileInputRef}
                type="file"
                accept=".html,.htm"
                onChange={handleFileSelect}
                className="hidden"
              />
            </>
          )}
        </div>

        {error && (
          <div className="mt-3 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-600">
            {error}
          </div>
        )}
      </div>
    </div>
  );
}
