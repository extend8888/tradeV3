export function formatNumber(num: number, decimals = 2): string {
  if (num === 0) return '0';

  const absNum = Math.abs(num);

  if (absNum >= 1e9) {
    return `${(num / 1e9).toFixed(decimals)}B`;
  } else if (absNum >= 1e6) {
    return `${(num / 1e6).toFixed(decimals)}M`;
  } else if (absNum >= 1e3) {
    return `${(num / 1e3).toFixed(decimals)}K`;
  } else if (absNum < 0.01) {
    return num.toExponential(2);
  }

  return num.toFixed(decimals);
}

export function formatSOL(lamports: number): string {
  const sol = lamports / 1e9;
  return formatNumber(sol, 4);
}

export function formatPercentage(value: number): string {
  return `${(value * 100).toFixed(2)}%`;
}

export function formatAddress(address: string, length = 4): string {
  if (!address || address.length < length * 2) return address;
  return `${address.slice(0, length)}...${address.slice(-length)}`;
}

export function formatTimestamp(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleString();
}

export function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}