import type { AuditReport } from '../../lib/report-parser';

interface ReportSummaryProps {
  report: AuditReport;
}

interface StatCardDef {
  label: string;
  value: number;
  color: string;
  bgColor: string;
}

export function ReportSummary({ report }: ReportSummaryProps) {
  const { stats, generatedDate } = report;

  const cards: StatCardDef[] = [
    {
      label: 'Articles Audited',
      value: stats.articlesAudited,
      color: 'text-blue-600',
      bgColor: 'bg-blue-50',
    },
    {
      label: 'Links to ADD',
      value: stats.linksToAdd,
      color: 'text-green-600',
      bgColor: 'bg-green-50',
    },
    {
      label: 'Links to KEEP',
      value: stats.linksToKeep,
      color: 'text-gray-600',
      bgColor: 'bg-gray-50',
    },
    {
      label: 'Links to REMOVE',
      value: stats.linksToRemove,
      color: 'text-red-600',
      bgColor: 'bg-red-50',
    },
    {
      label: 'Shop Links ADD',
      value: stats.shopLinksToAdd,
      color: 'text-green-600',
      bgColor: 'bg-green-50',
    },
    {
      label: 'Shop Links KEEP',
      value: stats.shopLinksToKeep,
      color: 'text-gray-600',
      bgColor: 'bg-gray-50',
    },
  ];

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        {cards.map((card) => (
          <div
            key={card.label}
            className={`rounded-lg ${card.bgColor} px-3 py-2`}
          >
            <div className={`text-lg font-bold ${card.color}`}>
              {card.value}
            </div>
            <div className="text-[10px] font-medium text-gray-500 leading-tight">
              {card.label}
            </div>
          </div>
        ))}
      </div>

      <div className="text-[10px] text-gray-400 text-center">
        Generated {formatDate(generatedDate)}
      </div>
    </div>
  );
}

function formatDate(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return dateStr;
  }
}
