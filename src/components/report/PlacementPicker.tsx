import type { PlacementOption } from '../../lib/smart-apply';

interface PlacementPickerProps {
  options: PlacementOption[];
  onSelect: (option: PlacementOption) => void;
  onCancel: () => void;
}

export function PlacementPicker({ options, onSelect, onCancel }: PlacementPickerProps) {
  if (options.length === 0) {
    return (
      <div className="mt-3 rounded-md bg-gray-50 border border-gray-200 px-3 py-3">
        <p className="text-xs text-gray-500">
          No suitable placement locations found in the article.
        </p>
        <button
          onClick={onCancel}
          className="mt-2 text-[11px] text-gray-400 hover:text-gray-600"
        >
          Close
        </button>
      </div>
    );
  }

  return (
    <div className="mt-3 rounded-md bg-indigo-50 border border-indigo-200 px-3 py-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-semibold text-indigo-600 uppercase tracking-wide">
          Choose placement ({options.length} options)
        </span>
        <button
          onClick={onCancel}
          className="text-indigo-400 hover:text-indigo-600"
        >
          <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
          </svg>
        </button>
      </div>

      <div className="space-y-1.5">
        {options.map((opt, i) => (
          <button
            key={i}
            onClick={() => onSelect(opt)}
            className="w-full text-left px-3 py-2 rounded-md bg-white border border-indigo-100 hover:border-indigo-300 hover:bg-indigo-50/50 transition-colors group"
          >
            <div className="flex items-start gap-2">
              <span className="text-[10px] font-bold text-indigo-400 mt-0.5 flex-shrink-0">
                {i + 1}
              </span>
              <div className="min-w-0">
                <p className="text-xs text-gray-700 leading-relaxed line-clamp-2">
                  {opt.label}
                </p>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-[10px] text-indigo-400">
                    {Math.round(opt.score * 100)}% match
                  </span>
                </div>
              </div>
              <span className="ml-auto text-[10px] text-indigo-500 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 mt-0.5">
                Insert here
              </span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
