import { useState, useEffect } from 'react';
import type { AcfFields } from '../../types/wordpress';
import { useUpdateAcf } from '../../hooks/useAcf';

interface AcfPostData {
  id: number;
  acf: AcfFields;
}

interface AcfLeadPanelProps {
  postId: number;
  acfData: AcfPostData | undefined;
  onUpdate: () => void;
}

export function AcfLeadPanel({ postId, acfData, onUpdate }: AcfLeadPanelProps) {
  const updateAcf = useUpdateAcf(postId);

  const [lead, setLead] = useState('');

  useEffect(() => {
    if (acfData?.acf) {
      setLead((acfData.acf.lead as string) ?? '');
    }
  }, [acfData]);

  function handleSave() {
    updateAcf.mutate(
      { lead },
      { onSuccess: onUpdate },
    );
  }

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-gray-800">ACF Lead</h3>

      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Lead Text</label>
        <textarea
          value={lead}
          onChange={(e) => setLead(e.target.value)}
          rows={4}
          className="w-full rounded border border-gray-300 px-2.5 py-1.5 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 resize-y"
          placeholder="Article lead / intro paragraph..."
        />
      </div>

      <button
        onClick={handleSave}
        disabled={updateAcf.isPending}
        className="w-full px-3 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {updateAcf.isPending ? 'Saving...' : 'Save Lead'}
      </button>

      {updateAcf.isError && (
        <p className="text-xs text-red-600">
          Error: {updateAcf.error instanceof Error ? updateAcf.error.message : 'Save failed'}
        </p>
      )}
    </div>
  );
}
