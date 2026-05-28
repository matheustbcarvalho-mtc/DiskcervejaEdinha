import { QuoteDetails } from '@/components/quote-details';

export default function QuotePage({ params }: { params: { id: string } }) {
  return <QuoteDetails id={params.id} />;
}
