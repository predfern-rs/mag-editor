import { useState } from 'react';

interface RawContentEditorProps {
  content: string;
  onChange: (newContent: string) => void;
  readOnly: boolean;
}

export function RawContentEditor({ content, onChange, readOnly: initialReadOnly }: RawContentEditorProps) {
  const [isReadOnly, setIsReadOnly] = useState(initialReadOnly);

  return (
    <div className="relative">
      <div className="flex items-center justify-between px-3 py-2 bg-gray-50 border-b border-gray-200">
        <span className="text-xs text-gray-500 font-medium">
          {isReadOnly ? 'Read-only' : 'Editing'}
        </span>
        <button
          onClick={() => setIsReadOnly(!isReadOnly)}
          className={`text-xs px-2.5 py-1 rounded font-medium transition-colors ${
            isReadOnly
              ? 'bg-blue-100 text-blue-700 hover:bg-blue-200'
              : 'bg-yellow-100 text-yellow-700 hover:bg-yellow-200'
          }`}
        >
          {isReadOnly ? 'Enable Editing' : 'Lock'}
        </button>
      </div>
      <textarea
        value={content}
        onChange={(e) => onChange(e.target.value)}
        readOnly={isReadOnly}
        className={`w-full min-h-[400px] p-4 font-mono text-xs leading-relaxed resize-y border-0 outline-none ${
          isReadOnly ? 'bg-gray-50 text-gray-600 cursor-default' : 'bg-white text-gray-900'
        }`}
        spellCheck={false}
      />
    </div>
  );
}
