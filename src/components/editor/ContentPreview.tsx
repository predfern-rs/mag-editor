import { useMemo } from 'react';
import type { Match } from '../../lib/find-replace';

interface ContentPreviewProps {
  html: string;
  matches: Match[];
  findText: string;
}

/**
 * Highlight matched text in HTML string, being careful not to replace inside HTML tags.
 */
function highlightMatches(html: string, findText: string): string {
  if (!findText) return html;

  const escaped = findText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(escaped, 'gi');

  // Split the HTML into tags and text segments
  const parts = html.split(/(<[^>]*>)/);

  return parts
    .map((part) => {
      // If this part is an HTML tag, leave it alone
      if (part.startsWith('<')) return part;
      // Otherwise, highlight matches in the text
      return part.replace(regex, '<mark class="match-highlight">$&</mark>');
    })
    .join('');
}

export function ContentPreview({ html, findText }: ContentPreviewProps) {
  const highlightedHtml = useMemo(
    () => highlightMatches(html, findText),
    [html, findText],
  );

  return (
    <div
      className="content-preview prose prose-sm max-w-none"
      dangerouslySetInnerHTML={{ __html: highlightedHtml }}
    />
  );
}
