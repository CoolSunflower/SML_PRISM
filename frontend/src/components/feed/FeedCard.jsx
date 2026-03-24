import { KWatchCard } from './KWatchCard';
import { GoogleAlertsCard } from './GoogleAlertsCard';

export function FeedCard({ item, isProcessed, onRemediate, onShowToast }) {
  if (item._source === 'google-alerts') {
    return <GoogleAlertsCard item={item} isProcessed={isProcessed} onRemediate={onRemediate} onShowToast={onShowToast} />;
  }
  return <KWatchCard item={item} isProcessed={isProcessed} onRemediate={onRemediate} onShowToast={onShowToast} />;
}
