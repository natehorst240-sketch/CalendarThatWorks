// @ts-nocheck — demo wrapper, follows App.tsx convention
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Check, ChevronDown, X as XIcon } from 'lucide-react';
import styles from './Landing.module.css';
import {
  USER_PROFILES,
  type DemoProfile,
} from './profiles';

const MOBILE_BREAKPOINT_PX = 1100;

function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth < MOBILE_BREAKPOINT_PX : false,
  );
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT_PX - 1}px)`);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    setIsMobile(mq.matches);
    // Safari < 14 / older iOS WebViews only expose addListener/removeListener
    // on MediaQueryList; calling addEventListener throws there. Feature-detect
    // and fall back so the demo still mounts on legacy clients.
    if (typeof mq.addEventListener === 'function') {
      mq.addEventListener('change', handler);
      return () => mq.removeEventListener('change', handler);
    }
    mq.addListener(handler);
    return () => mq.removeListener(handler);
  }, []);
  return isMobile;
}

interface LandingProps {
  children: ReactNode;
  activeProfile: DemoProfile;
  onProfileChange: (profileId: string) => void;
}

export default function Landing({ children, activeProfile, onProfileChange }: LandingProps) {
  const isMobile = useIsMobile();
  return (
    <div className={styles.root}>
      {isMobile ? (
        <MobileShowcase activeProfile={activeProfile} />
      ) : (
        <DesktopFrame activeProfile={activeProfile} onProfileChange={onProfileChange}>
          {children}
        </DesktopFrame>
      )}
    </div>
  );
}

function HeaderBar() {
  return (
    <header className={styles.header}>
      <div className={styles.brand}>
        <span className={styles.logo}>WC</span>
        <span>WorksCalendar</span>
      </div>
      <nav className={styles.nav}>
        <a href="#features">Features</a>
        <a
          href="https://github.com/workscalendar/calendarthatworks"
          target="_blank"
          rel="noreferrer"
        >
          GitHub
        </a>
      </nav>
    </header>
  );
}

function DesktopFrame({
  children,
  activeProfile,
  onProfileChange,
}: {
  children: ReactNode;
  activeProfile: DemoProfile;
  onProfileChange: (id: string) => void;
}) {
  return (
    <div className={styles.desktop}>
      <HeaderBar />
      <main className={styles.main}>
        <aside className={styles.chrome}>
          <section className={styles.hero}>
            <span className={styles.heroEyebrow}>Operations scheduling</span>
            <h1 className={styles.heroTitle}>Calendar that actually works.</h1>
            <p className={styles.heroSub}>
              Shifts, on-call rotations, multi-leg missions, approvals, and
              resource pools — across regions, bases, and crews. Try the live
              demo on the right.
            </p>
          </section>

          <ProfileCard
            activeProfile={activeProfile}
            onProfileChange={onProfileChange}
          />
          <FeaturesCard />
          <StatusCard />

          <p className={styles.footnote}>
            Owner password for settings: <code>demo1234</code>
          </p>
        </aside>

        <section className={styles.calendarFrame}>
          <div className={styles.calendarWindow}>{children}</div>
        </section>
      </main>
    </div>
  );
}

const APPROVAL_ROW_LABELS: Array<{ key: keyof DemoProfile['approval']; label: string }> = [
  { key: 'canRequest',  label: 'Submit requests' },
  { key: 'canApprove',  label: 'Approve' },
  { key: 'canFinalize', label: 'Finalize' },
  { key: 'canDeny',     label: 'Deny' },
  { key: 'canRevoke',   label: 'Revoke finalized' },
];

function ProfileCard({
  activeProfile,
  onProfileChange,
}: {
  activeProfile: DemoProfile;
  onProfileChange: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement | null>(null);

  // Click-outside + Escape close
  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (!popoverRef.current) return;
      if (!popoverRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className={styles.card}>
      <div className={styles.cardLabel}>Logged in as</div>
      <div className={styles.profileSwitchAnchor} ref={popoverRef}>
        <button
          type="button"
          className={styles.profileSwitchBtn}
          onClick={() => setOpen(v => !v)}
          aria-haspopup="listbox"
          aria-expanded={open}
        >
          <span
            className={styles.avatar}
            style={{
              background: `linear-gradient(135deg, ${activeProfile.avatarFrom}, ${activeProfile.avatarTo})`,
            }}
          >
            {activeProfile.initials}
          </span>
          <span className={styles.profileSwitchText}>
            <span className={styles.profileName}>{activeProfile.name}</span>
            <span className={styles.profileRole}>
              {activeProfile.role} · {activeProfile.base}
            </span>
          </span>
          <ChevronDown size={16} className={styles.profileSwitchChevron} aria-hidden="true" />
        </button>

        {open && (
          <div className={styles.profileMenu} role="listbox">
            {USER_PROFILES.map(p => {
              const selected = p.id === activeProfile.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  className={[
                    styles.profileMenuItem,
                    selected && styles.profileMenuItemActive,
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  onClick={() => {
                    onProfileChange(p.id);
                    setOpen(false);
                  }}
                >
                  <span
                    className={styles.profileMenuAvatar}
                    style={{ background: `linear-gradient(135deg, ${p.avatarFrom}, ${p.avatarTo})` }}
                  >
                    {p.initials}
                  </span>
                  <span className={styles.profileMenuText}>
                    <span className={styles.profileMenuName}>{p.name}</span>
                    <span className={styles.profileMenuRole}>{p.role}</span>
                    <span className={styles.profileMenuSummary}>{p.summary}</span>
                  </span>
                  {selected && <Check size={14} className={styles.profileMenuCheck} aria-hidden="true" />}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className={styles.permissionList}>
        {APPROVAL_ROW_LABELS.map(({ key, label }) => {
          const allowed = activeProfile.approval[key];
          return (
            <div
              key={key}
              className={[styles.permissionRow, allowed ? styles.permYes : styles.permNo]
                .filter(Boolean)
                .join(' ')}
            >
              {allowed ? (
                <Check size={12} aria-hidden="true" />
              ) : (
                <XIcon size={12} aria-hidden="true" />
              )}
              <span>{label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function FeaturesCard() {
  return (
    <div className={styles.card} id="features">
      <div className={styles.cardLabel}>What to try</div>
      <FeatureRow
        title="Conflict engine"
        desc="Drag a shift onto an already-booked resource — the calendar surfaces the overlap and resolution options."
      />
      <FeatureRow
        title="Resource pools"
        desc="Book against a pool (e.g. PNW Fleet) instead of a tail number. The resolver picks an available aircraft by strategy."
      />
      <FeatureRow
        title="Multi-leg missions"
        desc="Click the São Paulo → Munich pill to open the mission workflow: requirements, assignments, compliance."
      />
      <FeatureRow
        title="Approval workflow"
        desc="Aircraft requests, maintenance, and asset bookings flow through a request → approve → finalize state machine."
      />
    </div>
  );
}

function FeatureRow({ title, desc }: { title: string; desc: string }) {
  return (
    <div className={styles.featureRow}>
      <span className={styles.featureDot} aria-hidden="true" />
      <div>
        <div className={styles.featureTitle}>{title}</div>
        <div className={styles.featureDesc}>{desc}</div>
      </div>
    </div>
  );
}

function StatusCard() {
  return (
    <div className={styles.card}>
      <div className={styles.cardLabel}>Operations snapshot</div>
      <div className={styles.statusGrid}>
        <StatusItem value="5" label="Active bases" />
        <StatusItem value="6" label="Aircraft" />
        <StatusItem value="22" label="Personnel" />
        <StatusItem value="1" label="Live mission" />
      </div>
    </div>
  );
}

function StatusItem({ value, label }: { value: string; label: string }) {
  return (
    <div className={styles.statusItem}>
      <span className={styles.statusValue}>{value}</span>
      <span className={styles.statusLabel}>{label}</span>
    </div>
  );
}

function MobileShowcase({ activeProfile: _activeProfile }: { activeProfile: DemoProfile }) {
  return (
    <div className={styles.mobile}>
      <div className={styles.mobileHeader}>
        <div className={styles.brand}>
          <span className={styles.logo}>WC</span>
          <span>WorksCalendar</span>
        </div>
        <a
          href="https://github.com/workscalendar/calendarthatworks"
          target="_blank"
          rel="noreferrer"
          style={{ fontSize: 13, color: '#6b5a44', textDecoration: 'none' }}
        >
          GitHub
        </a>
      </div>

      <div className={styles.mobileHero}>
        <span className={styles.heroEyebrow}>Operations scheduling</span>
        <h1 className={styles.mobileHeroTitle}>Calendar that actually works.</h1>
        <p className={styles.mobileHeroSub}>
          Shifts, on-call, missions, approvals, and resource pools — built for
          teams that operate around the clock.
        </p>
      </div>

      <div className={styles.mobileNotice}>
        The interactive calendar demo is desktop-only — open this page on a
        larger screen to try it. Below is a tour of what's inside.
      </div>

      <div className={styles.featureCards}>
        <MobileFeatureCard
          eyebrow="Scheduling core"
          title="Conflict engine"
          desc="Detects double-bookings, cert mismatches, and pool unavailability the moment you drag a shift into place."
        />
        <MobileFeatureCard
          eyebrow="Allocation"
          title="Resource pools"
          desc="Book against a pool (any PNW aircraft, any 8-seat room) and let the resolver pick by round-robin, least-loaded, or proximity."
        />
        <MobileFeatureCard
          eyebrow="Workflow"
          title="Multi-leg missions"
          desc="Mission requirements, crew assignments, aircraft selection, and compliance checks — in one workflow card per mission."
        />
        <MobileFeatureCard
          eyebrow="Governance"
          title="Approval hierarchy"
          desc="Aircraft requests, maintenance, and asset bookings flow through request → approve → finalize, with role-aware permissions."
        />
        <MobileFeatureCard
          eyebrow="Visibility"
          title="Filter cascade"
          desc="Narrow by region → base → crew type → role. Save the result as a one-tap saved view chip."
        />
      </div>
    </div>
  );
}

function MobileFeatureCard({
  eyebrow,
  title,
  desc,
}: {
  eyebrow: string;
  title: string;
  desc: string;
}) {
  return (
    <div className={styles.featureCard}>
      <span className={styles.featureCardEyebrow}>{eyebrow}</span>
      <h3 className={styles.featureCardTitle}>{title}</h3>
      <p className={styles.featureCardDesc}>{desc}</p>
      <div className={styles.featureCardPlaceholder}>
        Visual to come — placeholder
      </div>
    </div>
  );
}
