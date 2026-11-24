import React, { useId, useMemo, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { dataLabel } from '../i18n/dataLabels';
import { useTranslation } from '../i18n/useTranslation';
import type { Translate } from '../i18n/translate';
import { concentrationFindings, sectorShares, type ConcentrationFinding, type ConcentrationHolding, type SectorShare } from '../lib/concentration';
import { formatFixed } from '../lib/money';
import AllocationExplorer, { type BreakdownItem } from './allocation/AllocationExplorer';
import { COLOR_PALETTE } from './allocation/palette';
import { type PositionItem } from './HoldingsTable';

export type { BreakdownItem };

interface AllocationBreakdownProps {
  breakdowns: {
    sectors: BreakdownItem[];
    regions: BreakdownItem[];
    assetClasses: BreakdownItem[];
  };
  positions: PositionItem[];
  cashBalance?: number;
  netWorth: number;
  currency?: string;
}

/** One sentence says the most telling thing; a second may follow. More would be a lecture. */
const MAX_SENTENCES = 2;
/** The bar names this many sectors; the rest fold into "Other". */
const MAX_BAR_SECTORS = 5;

const toHolding = (position: PositionItem): ConcentrationHolding => ({
  symbol: position.symbol,
  name: position.name || position.symbol,
  assetClass: position.assetClass,
  sector: position.sector,
  value: position.currentValue ?? position.investedAmount ?? 0,
});

function sentenceFor(finding: ConcentrationFinding, t: Translate): string {
  switch (finding.kind) {
    case 'company':
      return t('allocation.finding.company', { name: finding.name, percent: finding.percent });
    case 'sector':
      return t('allocation.finding.sector', { sector: dataLabel(t, 'sector', finding.sector), percent: finding.percent });
    case 'crypto':
      return t('allocation.finding.crypto', { percent: finding.percent });
    case 'topHoldings':
      return t('allocation.finding.topHoldings', { count: finding.count, percent: finding.percent });
  }
}

/**
 * What you own (cash included, so every share matches the table and the hero), in one plain sentence and one bar. The four views (sectors, regions, asset classes, holdings)
 * are still there, one tap away under "Explore".
 */
export const AllocationBreakdown: React.FC<AllocationBreakdownProps> = ({ breakdowns, positions, cashBalance = 0, netWorth, currency = 'EUR' }) => {
  const { t } = useTranslation();
  const [exploring, setExploring] = useState(false);
  const exploreId = useId();

  const holdings = useMemo(() => positions.map(toHolding), [positions]);
  const findings = useMemo(() => concentrationFindings(holdings, cashBalance).slice(0, MAX_SENTENCES), [holdings, cashBalance]);
  const shares = useMemo(() => sectorShares(holdings, MAX_BAR_SECTORS, cashBalance), [holdings, cashBalance]);
  const hasAnything = shares.length > 0 || Object.values(breakdowns).some((items) => items.length > 0);

  const nameOf = (share: SectorShare) => (share.kind === 'cash' ? t('cash.title') : share.kind === 'other' ? t('allocation.otherSector') : dataLabel(t, 'sector', share.sector));

  return (
    <section className="portfolio-dashboard__section dashboard-section dashboard-section--flush" id="allocation-breakdown" data-dashboard-section="">
      <div className="dashboard-allocation-panel">
        <div className="dashboard-allocation__header">
          <h2 className="dashboard-panel-title">{t('allocation.title')}</h2>
        </div>

        {!hasAnything ? (
          <div className="dashboard-allocation__empty">
            {t('allocation.emptyBefore')}
            <strong>{t('header.logTransaction')}</strong>
            {t('allocation.emptyAfter')}
          </div>
        ) : (
          <div className="allocation-summary">
            {findings.length > 0 && (
              <>
                <ul className="allocation-findings">
                  {findings.map((finding) => (
                    <li key={finding.kind}>{sentenceFor(finding, t)}</li>
                  ))}
                </ul>
                <p className="allocation-note">{t('allocation.worthKnowing')}</p>
              </>
            )}

            {shares.length > 0 && (
              <>
                <div className="allocation-bar" role="img" aria-label={t('allocation.barLabel')}>
                  {shares.map((share, index) => (
                    <span
                      key={share.kind === 'sector' ? share.sector : share.kind}
                      className="allocation-bar__segment"
                      style={{ flexGrow: share.percent, flexBasis: 0, backgroundColor: COLOR_PALETTE[index % COLOR_PALETTE.length] }}
                    />
                  ))}
                </div>
                <ul className="allocation-legend">
                  {shares.map((share, index) => (
                    <li key={share.kind === 'sector' ? share.sector : share.kind}>
                      <span className="allocation-legend__dot" style={{ backgroundColor: COLOR_PALETTE[index % COLOR_PALETTE.length] }} aria-hidden="true" />
                      {nameOf(share)} {formatFixed(share.percent, 0)}%
                    </li>
                  ))}
                </ul>
              </>
            )}

            <button type="button" className="allocation-explore" aria-expanded={exploring} aria-controls={exploring ? exploreId : undefined} onClick={() => setExploring(!exploring)}>
              {exploring ? t('allocation.hideExplore') : t('allocation.explore')}
              <ChevronDown size={14} aria-hidden="true" />
            </button>
          </div>
        )}

        {exploring && hasAnything && (
          <div id={exploreId}>
            <AllocationExplorer breakdowns={breakdowns} positions={positions} cashBalance={cashBalance} netWorth={netWorth} currency={currency} />
          </div>
        )}
      </div>
    </section>
  );
};

export default AllocationBreakdown;
