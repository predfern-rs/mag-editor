import { useState, useRef, useEffect } from 'react';
import { requestAiEdit } from '../../api/ai-chat';

interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  text: string;
  timestamp: Date;
}

interface AiChatEditorProps {
  content: string;
  postTitle: string;
  onContentChange: (newContent: string) => void;
  onShowReview?: () => void;
  onShowDiff: () => void;
  onRevert?: () => Promise<void>;
}

export function AiChatEditor({
  content,
  postTitle,
  onContentChange,
  onShowReview,
  onShowDiff,
  onRevert,
}: AiChatEditorProps) {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: 'system',
      text: 'Tell me what to change. For example:\n\n"Add an internal link from \'waterproof jackets\' to /magazine/waterproof-guide"\n\n"Change the link /old-path to /new-path"\n\n"Remove the link around \'ski gear\'"',
      timestamp: new Date(),
    },
  ]);
  const [isLoading, setIsLoading] = useState(false);
  const [pendingContent, setPendingContent] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function handleSend() {
    const instruction = input.trim();
    if (!instruction || isLoading) return;

    setInput('');
    setMessages((prev) => [
      ...prev,
      { role: 'user', text: instruction, timestamp: new Date() },
    ]);
    setIsLoading(true);

    try {
      const result = await requestAiEdit(instruction, content, postTitle);

      setPendingContent(result.modifiedContent);
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          text: `${result.explanation}\n\nClick **Apply Changes** to update the content, or **Review Diff** to see what changed.`,
          timestamp: new Date(),
        },
      ]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          text: `Error: ${msg}`,
          timestamp: new Date(),
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  }

  function handleApply() {
    if (!pendingContent) return;
    onContentChange(pendingContent);
    setPendingContent(null);
    setMessages((prev) => [
      ...prev,
      {
        role: 'system',
        text: 'Changes applied. You can review them with "Review Changes" at the bottom, or tell me more edits to make.',
        timestamp: new Date(),
      },
    ]);
  }

  function handleReject() {
    setPendingContent(null);
    setMessages((prev) => [
      ...prev,
      {
        role: 'system',
        text: 'Changes discarded. Tell me what you\'d like to do differently.',
        timestamp: new Date(),
      },
    ]);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <div className="flex flex-col h-full border border-gray-200 rounded-lg bg-white">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3 min-h-[300px] max-h-[500px]">
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                msg.role === 'user'
                  ? 'bg-blue-600 text-white'
                  : msg.role === 'system'
                    ? 'bg-gray-100 text-gray-600 text-xs'
                    : 'bg-gray-50 border border-gray-200 text-gray-800'
              }`}
            >
              <div className="whitespace-pre-wrap">{msg.text}</div>
            </div>
          </div>
        ))}

        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-500">
              <LoadingTimer />
            </div>
          </div>
        )}

        {/* Action buttons when there's pending content */}
        {pendingContent && (
          <div className="flex gap-2 justify-center py-2 flex-wrap">
            <button
              onClick={handleApply}
              className="px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 transition-colors"
            >
              Apply Changes
            </button>
            {onShowReview && (
              <button
                onClick={() => {
                  onContentChange(pendingContent);
                  setPendingContent(null);
                  onShowReview();
                }}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                👁️ Review
              </button>
            )}
            <button
              onClick={() => {
                onContentChange(pendingContent);
                setPendingContent(null);
                onShowDiff();
              }}
              className="px-3 py-2 text-xs font-medium text-gray-500 bg-gray-50 border border-gray-200 rounded-lg hover:bg-gray-100 transition-colors"
            >
              Review Diff
            </button>
            <button
              onClick={handleReject}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
            >
              Discard
            </button>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="border-t border-gray-200 p-3">
        <div className="flex gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Tell me what to change..."
            rows={4}
            disabled={isLoading}
            className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 resize-y min-h-[80px] disabled:bg-gray-50 disabled:text-gray-400"
          />
          <button
            onClick={handleSend}
            disabled={isLoading || !input.trim()}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed self-end"
          >
            Send
          </button>
        </div>
        <div className="flex items-center justify-between mt-1">
          <p className="text-[10px] text-gray-400">
            Enter to send, Shift+Enter for newline. Powered by Claude via OpenRouter.
          </p>
          {onRevert && messages.length > 1 && (
            <RevertButton onRevert={onRevert} />
          )}
        </div>
      </div>
    </div>
  );
}

function LoadingTimer() {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <span className="inline-flex items-center gap-2">
      <span className="w-4 h-4 border-2 border-blue-200 border-t-blue-500 rounded-full animate-spin" />
      <span>Processing with Claude... {elapsed}s</span>
    </span>
  );
}

function RevertButton({ onRevert }: { onRevert: () => Promise<void> }) {
  const [isReverting, setIsReverting] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function handleRevert() {
    if (!confirm('Revert to the previous WordPress revision?')) return;
    setIsReverting(true);
    setMsg(null);
    try {
      await onRevert();
      setMsg('Reverted!');
      setTimeout(() => setMsg(null), 3000);
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Failed');
      setTimeout(() => setMsg(null), 5000);
    } finally {
      setIsReverting(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      {msg && (
        <span className={`text-[10px] font-medium ${msg === 'Reverted!' ? 'text-green-600' : 'text-red-500'}`}>
          {msg}
        </span>
      )}
      <button
        onClick={handleRevert}
        disabled={isReverting}
        className="text-[10px] font-medium text-amber-600 hover:text-amber-700 disabled:opacity-50 transition-colors"
      >
        {isReverting ? '⏳ Reverting...' : '↩️ Revert Last Change'}
      </button>
    </div>
  );
}
