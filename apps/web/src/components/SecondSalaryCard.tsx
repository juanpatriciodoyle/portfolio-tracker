import { useId } from 'react';
import type { SecondSalaryResponse } from '../contracts';
import { describeSecondSalary } from './describeSecondSalary';

interface SecondSalaryCardProps {
  secondSalary: SecondSalaryResponse;
}

const asPercent = (fraction: number) => `${fraction * 100}%`;

/** What the portfolio could pay each month, and how close that is to covering the life being lived. */
export default function SecondSalaryCard({ secondSalary }: SecondSalaryCardProps) {
  const titleId = useId();
  const { badge, subtext, bar } = describeSecondSalary(secondSalary);

  return (
    <section className="second-salary" aria-labelledby={titleId}>
      <h2 className="second-salary__badge" id={titleId}>
        {badge}
      </h2>
      <p className="second-salary__subtext">{subtext}</p>

      <div className="second-salary__bar" role="img" aria-label={bar.summary}>
        <div className="second-salary__track">
          <div className="second-salary__target" style={{ left: asPercent(bar.targetStart) }} />
          <div className="second-salary__fill" style={{ width: asPercent(bar.fill) }} />
          {bar.ticks.map((tick) => (
            <span
              key={tick.id}
              className={`second-salary__tick${tick.reached ? ' is-reached' : ''}`}
              style={{ left: asPercent(tick.position) }}
              title={tick.label}
              data-milestone={tick.id}
            />
          ))}
        </div>
      </div>

      <ol className="second-salary__legend">
        {bar.ticks.map((tick) => (
          <li key={tick.id} className={tick.reached ? 'is-reached' : undefined}>
            {tick.label}
          </li>
        ))}
        <li className="second-salary__legend-target">
          {bar.targetLabel}
          <span className="second-salary__note"> · {bar.targetNote}</span>
        </li>
      </ol>
    </section>
  );
}
