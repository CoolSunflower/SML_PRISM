import { KWatchCard } from './KWatchCard';
import { GoogleAlertsCard } from './GoogleAlertsCard';

export function FeedCard({ item, isProcessed }) {
  if (item._source === 'google-alerts') {
    return <GoogleAlertsCard item={item} isProcessed={isProcessed} />;
  }
  return <KWatchCard item={item} isProcessed={isProcessed} />;
}
