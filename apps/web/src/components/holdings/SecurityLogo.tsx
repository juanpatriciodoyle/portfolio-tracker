import { isCrypto } from '../../lib/assetClasses';

/** A coloured badge with the holding's first letter (or its coin sign), by kind of asset. */
export function SecurityLogo({ name, symbol, assetClass }: { name: string; symbol: string; assetClass: string }) {
  let initial = (symbol || name || 'S').charAt(0).toUpperCase();
  let kind = 'stock';

  if (isCrypto(assetClass) || symbol.includes('BTC') || symbol.includes('ETH')) {
    kind = 'crypto';
    if (symbol.includes('BTC')) initial = '₿';
    else if (symbol.includes('ETH')) initial = 'Ξ';
  } else if (assetClass === 'ETF' || symbol.includes('.DE') || symbol.includes('IE00')) {
    kind = 'etf';
  }

  return (
    <div className={`security-logo security-logo--${kind}`} aria-hidden="true">
      <span className="security-logo__text">{initial}</span>
    </div>
  );
}
