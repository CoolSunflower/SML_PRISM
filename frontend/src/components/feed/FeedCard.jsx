import { KWatchCard } from './KWatchCard';
import { GoogleAlertsCard } from './GoogleAlertsCard';

export function FeedCard({ item, isProcessed, onRemediate }) {
  if (item._source === 'google-alerts') {
    return <GoogleAlertsCard item={item} isProcessed={isProcessed} onRemediate={onRemediate} />;
  }
  return <KWatchCard item={item} isProcessed={isProcessed} onRemediate={onRemediate} />;
}
