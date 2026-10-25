/** "under a minute", "12 min", "2 h 5 min", "3 days" — for estimates, so deliberately coarse. */
export function formatDuration(seconds: number): string {
  if (!(seconds >= 60)) return 'under a minute';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours >= 48) return `${Math.round(hours / 24)} days`;
  const rest = minutes % 60;
  return rest ? `${hours} h ${rest} min` : `${hours} h`;
}
