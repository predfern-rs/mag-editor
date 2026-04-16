import type { Match } from '../../lib/find-replace';

interface FindReplaceMatchProps {
  match: Match;
  matchIndex: number;
  replaceText: string;
  onReplace: () => void;
  onSkip: () => void;
}

export function FindReplaceMatch({
  match,
  matchIndex,
  replaceText,
  onReplace,
  onSkip,
}: FindReplaceMatchProps) {
  return (
    <div className="border border-gray-200 rounded-md p-3 text-xs">
      <div className="flex items-center justify-between mb-2">
        <span className="text-gray-500 font-medium">
          Match #{matchIndex + 1}
          {match.blockType !== 'unknown' && (
            <span className="ml-1.5 text-gray-400">in {match.blockType}</span>
          )}
        </span>
        <div className="flex gap-1.5">
          <button
            onClick={onSkip}
            className="px-2 py-0.5 text-gray-600 bg-gray-100 rounded hover:bg-gray-200 transition-colors"
          >
            Skip
          </button>
          <button
            onClick={onReplace}
            className="px-2 py-0.5 text-white bg-blue-600 rounded hover:bg-blue-700 transition-colors"
          >
            Replace
          </button>
        </div>
      </div>

      {/* Current text with context */}
      <div className="font-mono bg-gray-50 rounded p-2 mb-1.5 break-all">
        <span className="text-gray-400">{match.context.before}</span>
        <mark className="match-highlight font-semibold">{match.text}</mark>
        <span className="text-gray-400">{match.context.after}</span>
      </div>

      {/* Replacement preview */}
      {replaceText && (
        <div className="font-mono bg-green-50 rounded p-2 break-all">
          <span className="text-gray-400">{match.context.before}</span>
          <span className="text-green-700 font-semibold bg-green-100 px-0.5 rounded">
            {replaceText}
          </span>
          <span className="text-gray-400">{match.context.after}</span>
        </div>
      )}
    </div>
  );
}
