/** Twin-node mark: two mirrored node pairs joined at a core. */
export function Logo({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden>
      <defs>
        <linearGradient id="ctlogo" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#22D3EE" />
          <stop offset="1" stopColor="#C084FC" />
        </linearGradient>
      </defs>
      <rect x="1" y="1" width="62" height="62" rx="14" fill="#07101E" stroke="url(#ctlogo)" strokeOpacity="0.6" />
      <path d="M20 22 L32 32 L20 42 M44 22 L32 32 L44 42" stroke="url(#ctlogo)" strokeWidth="3" fill="none" strokeLinecap="round" />
      <circle cx="20" cy="22" r="5" fill="#07101E" stroke="#22D3EE" strokeWidth="3" />
      <circle cx="20" cy="42" r="5" fill="#07101E" stroke="#22D3EE" strokeWidth="3" />
      <circle cx="44" cy="22" r="5" fill="#07101E" stroke="#C084FC" strokeWidth="3" />
      <circle cx="44" cy="42" r="5" fill="#07101E" stroke="#C084FC" strokeWidth="3" />
      <circle cx="32" cy="32" r="4" fill="#E879F9" style={{ filter: "drop-shadow(0 0 4px #E879F9)" }} />
    </svg>
  );
}
