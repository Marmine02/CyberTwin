/** CyberTwin mark: a shield holding two linked twin nodes. Also the source of the app icon. */
export function LogoMark({ size = 34 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" style={{ filter: 'drop-shadow(0 0 8px rgb(34 211 238 / 0.55))' }}>
      <defs>
        <linearGradient id="lg-shield" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#22d3ee" />
          <stop offset="100%" stopColor="#c084fc" />
        </linearGradient>
      </defs>
      <path d="M32 4 L54 12 V30 C54 44 44 54 32 60 C20 54 10 44 10 30 V12 Z" fill="rgb(7 12 24 / 0.9)" stroke="url(#lg-shield)" strokeWidth="3.2" strokeLinejoin="round" />
      <path d="M22 36 L42 26" stroke="url(#lg-shield)" strokeWidth="2.6" strokeLinecap="round" />
      <circle cx="22" cy="36" r="6" fill="#0a1122" stroke="#22d3ee" strokeWidth="2.6" />
      <circle cx="42" cy="26" r="6" fill="#0a1122" stroke="#e879f9" strokeWidth="2.6" />
      <circle cx="22" cy="36" r="2" fill="#67e8f9" />
      <circle cx="42" cy="26" r="2" fill="#f0abfc" />
    </svg>
  )
}
