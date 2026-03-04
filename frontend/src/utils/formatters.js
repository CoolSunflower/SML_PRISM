import { formatDistanceToNow, format } from 'date-fns';

export function timeAgo(isoString) {
  if (!isoString) return '';
  try {
    return formatDistanceToNow(new Date(isoString), { addSuffix: true });
  } catch {
    return isoString;
  }
}

export function formatDate(isoString) {
  if (!isoString) return '';
  try {
    return format(new Date(isoString), 'MMM d, yyyy');
  } catch {
    return isoString;
  }
}

export function formatNumber(n) {
  if (n == null) return '0';
  return n.toLocaleString();
}
