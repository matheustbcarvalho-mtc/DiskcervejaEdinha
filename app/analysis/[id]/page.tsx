import { AnalysisDashboard } from '@/components/analysis-dashboard';

export default function AnalysisPage({ params }: { params: { id: string } }) {
  return <AnalysisDashboard id={params.id} />;
}
