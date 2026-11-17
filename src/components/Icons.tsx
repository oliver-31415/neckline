import type { ComponentChildren } from 'preact';

function I({ children, size = 24, fill = 'none' }: { children: ComponentChildren; size?: number; fill?: string }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill={fill} stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      {children}
    </svg>
  );
}

export const IconToday = () => <I><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></I>;
export const IconTimeline = () => <I><path d="M4 6h10M4 12h16M4 18h7" /><circle cx="18" cy="6" r="2" /><circle cx="15" cy="18" r="2" /></I>;
export const IconPlus = () => <I><path d="M12 5v14M5 12h14" /></I>;
export const IconPatterns = () => <I><path d="M3 20h18" /><path d="M5 16l4-5 4 3 6-8" /><circle cx="19" cy="6" r="1.2" fill="currentColor" /></I>;
export const IconReport = () => <I><path d="M7 3h7l5 5v12a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" /><path d="M14 3v5h5M9 13h6M9 17h4" /></I>;
export const IconGear = () => <I><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></I>;
export const IconCheck = () => <I><path d="M5 12.5l4.5 4.5L19 7.5" /></I>;
export const IconClose = () => <I><path d="M6 6l12 12M18 6L6 18" /></I>;
export const IconChevron = () => <I><path d="M9 6l6 6-6 6" /></I>;
export const IconBack = () => <I><path d="M15 6l-6 6 6 6" /></I>;
export const IconClock = () => <I><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></I>;
export const IconMoon = () => <I><path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" /></I>;
export const IconPill = () => <I><rect x="3" y="8.5" width="18" height="7" rx="3.5" transform="rotate(-40 12 12)" /><path d="M9.3 9.3l5.4 5.4" transform="rotate(5 12 12)" /></I>;
export const IconMeal = () => <I><path d="M7 3v8M5 3v5a2 2 0 0 0 4 0V3M7 11v10M17 21V3c-2 1.5-3 4-3 7v3h3" /></I>;
export const IconPosture = () => <I><circle cx="13" cy="4.5" r="2.3" /><path d="M12.5 7.5l-1 6 3 3 1 5M11.5 13.5l-3 7.5M12 9.5l3.5 2.5M12 9.5l-3.5 1.5" /></I>;
export const IconActivity = () => <I><path d="M13 2L5 14h6l-1 8 8-12h-6l1-8z" /></I>;
export const IconBolt = () => <I><path d="M12 3v4M12 17v4M3 12h4M17 12h4" /><circle cx="12" cy="12" r="3.2" /></I>;
export const IconTrash = () => <I><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6" /></I>;
export const IconCamera = () => <I><path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z" /><circle cx="12" cy="13.5" r="3.5" /></I>;
export const IconShare = () => <I><path d="M12 15V3M8 7l4-4 4 4" /><path d="M5 12v8h14v-8" /></I>;
export const IconDownload = () => <I><path d="M12 3v12M8 11l4 4 4-4M5 20h14" /></I>;
export const IconUpload = () => <I><path d="M12 15V3M8 7l4-4 4 4M5 20h14" /></I>;
export const IconInfo = () => <I><circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 7.5v.5" /></I>;
export const IconBell = () => <I><path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4l2-2zM10 20a2 2 0 0 0 4 0" /></I>;
export const IconEdit = () => <I><path d="M4 20h4L19 9l-4-4L4 16v4zM13.5 6.5l4 4" /></I>;
export const IconSpark = () => <I><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3zM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8L19 16z" /></I>;
export const IconLock = () => <I><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></I>;
export const IconUp = () => <I><path d="M12 19V5M6 11l6-6 6 6" /></I>;
export const IconDown = () => <I><path d="M12 5v14M6 13l6 6 6-6" /></I>;
export const IconSame = () => <I><path d="M5 12h14" /></I>;
export const IconPin = () => <I><path d="M12 21s-6-5.5-6-11a6 6 0 0 1 12 0c0 5.5-6 11-6 11z" /><circle cx="12" cy="10" r="2" /></I>;
export const IconCalendar = () => <I><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></I>;
export const IconList = () => <I><path d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01" /></I>;

/* ---- activity pictograms ---- */
const P = ({ children }: { children: ComponentChildren }) => (
  <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">{children}</svg>
);
export const ACTIVITY_ART: Record<string, () => preact.JSX.Element> = {
  Computer: () => <P><rect x="9" y="11" width="30" height="20" rx="2" /><path d="M5 37h38M18 31l-1 6M30 31l1 6" /></P>,
  Phone: () => <P><rect x="15" y="6" width="18" height="36" rx="4" /><path d="M21 36h6" /></P>,
  Driving: () => <P><circle cx="24" cy="24" r="16" /><circle cx="24" cy="24" r="4" /><path d="M8.5 21h11M28.5 21h11M24 28v12" /></P>,
  Lifting: () => <P><rect x="12" y="20" width="24" height="18" rx="2" /><path d="M12 26h24M20 20v-4a4 4 0 0 1 8 0v4" /></P>,
  Exercise: () => <P><path d="M8 18v12M13 14v20M35 14v20M40 18v12M13 24h22" /></P>,
  Walking: () => <P><circle cx="27" cy="8" r="3.5" /><path d="M25 14l-4 12 6 6 2 10M21 26l-5 14M24 16l7 6 5 1M24 16l-7 4-2 6" /></P>,
  Housework: () => <P><path d="M32 6L20 28M14 28h14l4 14H10l4-14zM17 36v6M23 36v6" /></P>,
  Reading: () => <P><path d="M24 12c-5-4-12-4-17-2v26c5-2 12-2 17 2 5-4 12-4 17-2V10c-5-2-12-2-17 2zM24 12v26" /></P>,
  Rest: () => <P><path d="M6 34V22a4 4 0 0 1 4-4h28a4 4 0 0 1 4 4v12M6 34h36M6 28h36M10 34v5M38 34v5" /><path d="M13 22h8" /></P>,
};
export const ActivityFallback = () => <P><circle cx="24" cy="24" r="15" /><path d="M24 16v16M16 24h16" /></P>;

/* ---- posture diagrams: side or front view of a head on a neck ---- */
export const POSTURE_ART: Record<string, () => preact.JSX.Element> = {
  neutral: () => (
    <P>
      <path d="M22 46V30M14 30h16" /><path d="M22 30v-6" />
      <circle cx="22" cy="16" r="7.5" /><path d="M29.3 15.5l2.6 1.8-2.6 1" />
      <path d="M33 17h9M39 14l3 3-3 3" stroke-width="2" opacity="0.6" />
    </P>
  ),
  down: () => (
    <P>
      <path d="M20 46V30M12 30h16" /><path d="M20 30l4.5-5" />
      <circle cx="28" cy="18" r="7.5" /><path d="M32.5 23.6l1 2.9-2.6-.6" />
      <path d="M33 28l6 9M35.5 37.5l3.5-.5.2-3.5" stroke-width="2" opacity="0.6" />
      <rect x="36" y="38" width="8" height="5" rx="1" stroke-width="2" />
    </P>
  ),
  up: () => (
    <P>
      <path d="M22 46V31M14 31h16" /><path d="M22 31l-1.5-6" />
      <circle cx="20" cy="18" r="7.5" /><path d="M26 13l2.8.2-1.6 2.5" />
      <path d="M30 11l8-7M34.5 3.5l3.5.5-.2 3.5" stroke-width="2" opacity="0.6" />
    </P>
  ),
  forward: () => (
    <P>
      <path d="M14 46l6-16M12 30h14" /><path d="M20 30l6-5" />
      <circle cx="31" cy="20" r="7.5" /><path d="M38.3 19.5l2.6 1.8-2.6 1" />
      <path d="M14 22c2-3 5-5 8-5" stroke-width="2" opacity="0.55" stroke-dasharray="2 3" />
    </P>
  ),
  turn: () => (
    <P>
      <path d="M8 40c4-6 9-8 16-8s12 2 16 8" /><path d="M24 32v-5" />
      <circle cx="24" cy="18" r="8" /><path d="M29 17l3.5 2-3.5 1.5" />
      <path d="M14 7c5-4 15-4 20 0M31.5 4.5L34 7l-3 1.5" stroke-width="2" opacity="0.6" />
    </P>
  ),
  tilt: () => (
    <P>
      <path d="M8 40c4-6 9-8 16-8s12 2 16 8" /><path d="M24 32l3-5" />
      <circle cx="30" cy="19" r="8" transform="rotate(25 30 19)" />
      <path d="M27 17.5h.01M33 20h.01" stroke-width="3" />
      <path d="M38 8c3 3 4 7 3 11M38.5 16.5l2.5 2.5 2.5-2.3" stroke-width="2" opacity="0.6" />
    </P>
  ),
  lying: () => (
    <P>
      <path d="M4 38h40M6 38v5M42 38v5" /><rect x="5" y="29" width="11" height="6" rx="3" stroke-width="2" />
      <circle cx="13" cy="23" r="6" /><path d="M19 27h22l2 4" />
    </P>
  ),
};
export const IconPulse = () => <I><path d="M3 12h4l2.5-6 4 12 2.5-6H21" /></I>;
