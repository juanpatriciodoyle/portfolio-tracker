interface PortfolioShipProps {
  roi30d: number;
  cashRatio: number;
}

export default function PortfolioShip({ roi30d, cashRatio }: PortfolioShipProps) {
  let state: 'smooth' | 'fast' | 'choppy' | 'sunk' | 'overload' = 'smooth';

  if (roi30d <= -15) {
    state = 'sunk';
  } else if (roi30d < 0) {
    state = 'choppy';
  } else if (cashRatio > 30) {
    state = 'overload';
  } else if (roi30d > 5) {
    state = 'fast';
  }

  let rotation = 0;
  let translateY = 0;
  let isOverloaded = state === 'overload';
  let hasGlow = state === 'smooth' || state === 'fast';
  let isFast = state === 'fast';

  if (state === 'sunk') {
    rotation = -18;
    translateY = 18;
  } else if (state === 'choppy') {
    rotation = -4;
    translateY = 3;
  } else if (state === 'overload') {
    rotation = 0;
    translateY = 6;
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
        backgroundColor: 'var(--bg-card)',
        border: '1px solid #1F1F23',
        borderRadius: '16px',
        width: '100%',
        maxWidth: '360px',
        height: '280px',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: '16px',
          left: '16px',
          fontSize: '11px',
          fontWeight: 600,
          color: 'var(--text-secondary)',
          textTransform: 'uppercase',
          letterSpacing: '1.2px',
        }}
      >
        Vessel Status
      </div>

      <div
        style={{
          position: 'absolute',
          top: '16px',
          right: '16px',
          fontSize: '12px',
          fontWeight: 700,
          color:
            state === 'fast'
              ? '#0066FF'
              : state === 'smooth'
              ? 'var(--color-success)'
              : state === 'overload'
              ? 'var(--accent-primary)'
              : '#E2E2E2',
          textTransform: 'uppercase',
          letterSpacing: '0.5px',
        }}
      >
        {state === 'fast' && 'Fast Sailing'}
        {state === 'smooth' && 'Smooth Sailing'}
        {state === 'overload' && 'Cargo Overload'}
        {state === 'choppy' && 'Choppy Waters'}
        {state === 'sunk' && 'Sinking / Alert'}
      </div>

      <svg
        width="100%"
        height="140"
        viewBox="0 0 200 140"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        style={{ overflow: 'visible' }}
      >
        <defs>
          <filter id="neon-glow" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {isFast && (
          <g>
            <path
              d="M 180 20 L 220 20"
              stroke="#FFFFFF"
              strokeWidth="1.2"
              strokeDasharray="4 4"
              style={{
                opacity: 0.15,
                animation: 'rushWind 0.7s infinite linear',
              }}
            />
            <path
              d="M 160 32 L 210 32"
              stroke="#0066FF"
              strokeWidth="1.5"
              strokeDasharray="6 4"
              style={{
                opacity: 0.15,
                animation: 'rushWind 0.5s infinite linear',
                animationDelay: '0.2s',
              }}
            />
            <path
              d="M 175 44 L 205 44"
              stroke="#FFFFFF"
              strokeWidth="1.2"
              strokeDasharray="3 3"
              style={{
                opacity: 0.15,
                animation: 'rushWind 0.6s infinite linear',
                animationDelay: '0.1s',
              }}
            />
          </g>
        )}

        <g
          style={{
            transform: `translate(0px, ${translateY}px) rotate(${rotation}deg)`,
            transformOrigin: '100px 80px',
            transition: 'transform 0.8s cubic-bezier(0.16, 1, 0.3, 1)',
          }}
        >
          <g>
            <rect x="75" y="44" width="14" height="10" fill="#0066FF" stroke="#FFFFFF" strokeWidth="1" rx="1" />
            <rect x="91" y="44" width="14" height="10" fill="#FFFFFF" stroke="#0066FF" strokeWidth="1" rx="1" />
            <rect x="107" y="44" width="14" height="10" fill="#0066FF" stroke="#FFFFFF" strokeWidth="1" rx="1" />

            <rect x="83" y="34" width="14" height="10" fill="#FFFFFF" stroke="#0066FF" strokeWidth="1" rx="1" />
            <rect x="99" y="34" width="14" height="10" fill="#0066FF" stroke="#FFFFFF" strokeWidth="1" rx="1" />
          </g>

          {isOverloaded && (
            <g style={{ transition: 'opacity 0.5s' }}>
              <rect x="70" y="24" width="14" height="10" fill="#0066FF" stroke="#FFFFFF" strokeWidth="1" rx="1" />
              <rect x="112" y="24" width="14" height="10" fill="#FFFFFF" stroke="#0066FF" strokeWidth="1" rx="1" />

              <rect x="91" y="24" width="14" height="10" fill="#0066FF" stroke="#FFFFFF" strokeWidth="1" rx="1" />
              <rect x="83" y="14" width="14" height="10" fill="#FFFFFF" stroke="#0066FF" strokeWidth="1" rx="1" />
              <rect x="99" y="14" width="14" height="10" fill="#0066FF" stroke="#FFFFFF" strokeWidth="1" rx="1" />
            </g>
          )}

          <path
            d="M 42 54 L 158 54 L 144 80 L 56 80 Z"
            fill="#121214"
            stroke="#FFFFFF"
            strokeWidth="2"
            strokeLinejoin="round"
          />

          <path
            d="M 52 54 L 148 54"
            stroke="#0066FF"
            strokeWidth="2"
          />

          <path
            d="M 134 32 L 144 32 L 144 54 M 138 32 L 138 54 M 141 32 L 141 54"
            stroke="#FFFFFF"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />

          <path
            d="M 144 40 H 152 V 54 H 144 Z"
            fill="#0066FF"
            stroke="#FFFFFF"
            strokeWidth="1"
          />
        </g>

        <path
          d={
            state === 'choppy' || state === 'sunk'
              ? 'M 20 86 Q 45 78 70 86 T 120 86 T 170 86 T 180 86'
              : state === 'fast'
              ? 'M 5 84 Q 45 79 85 84 T 145 84 T 195 84'
              : 'M 20 84 Q 50 81 80 84 T 140 84 T 180 84'
          }
          fill="none"
          stroke="#0066FF"
          strokeWidth={isFast ? '4.5' : '3.5'}
          strokeLinecap="round"
          style={{
            filter: hasGlow ? 'url(#neon-glow)' : 'none',
            transition: 'd 0.8s cubic-bezier(0.16, 1, 0.3, 1), filter 0.5s',
            animation: isFast
              ? 'pulseWake 0.7s infinite ease-in-out'
              : hasGlow
              ? 'pulseWake 2s infinite ease-in-out'
              : 'none',
          }}
        />
      </svg>

      <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: '16px', fontSize: '13px', color: 'var(--text-secondary)' }}>
          <span>
            ROI: <strong style={{ color: roi30d >= 0 ? 'var(--color-success)' : 'var(--color-danger)' }}>{roi30d >= 0 ? '+' : ''}{roi30d.toFixed(1)}%</strong>
          </span>
          <span>
            Cash: <strong style={{ color: 'var(--text-primary)' }}>{cashRatio.toFixed(0)}%</strong>
          </span>
        </div>
      </div>

      <style>{`
        @keyframes pulseWake {
          0%, 100% {
            opacity: 0.85;
            stroke-width: 3.5;
          }
          50% {
            opacity: 1;
            stroke-width: 5;
          }
        }
        @keyframes rushWind {
          0% {
            transform: translateX(0);
          }
          100% {
            transform: translateX(-160px);
          }
        }
      `}</style>
    </div>
  );
}
