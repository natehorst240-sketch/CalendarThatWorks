/**
 * MissionHoverCard — full-screen mission workflow modal (Sprint 5, issue #307).
 *
 * Replaces the standard HoverCard when a mission-assignment or aircraft-request
 * event is clicked. Shows a Lucidchart-style requirements map with assignment
 * slots for pilots, medical crew, and aircraft. Clicking an empty slot opens a
 * role-filtered candidate list with certification validation.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { X, Plane, AlertCircle, CheckCircle, Circle } from 'lucide-react';
import type { DemoMissionRequest, DemoEmployee, DemoAircraft } from './types';
import type { MissionAssignments, AssignedResource } from '../src/types/mission';
import styles from './MissionHoverCard.module.css';

// ── Types ─────────────────────────────────────────────────────────────────────

type SlotKind = 'pilot' | 'medical' | 'aircraft';

interface ActiveSlot {
  kind: SlotKind;
  index: number;
  anchorRect: DOMRect;
}

export interface MissionHoverCardProps {
  mission: DemoMissionRequest;
  assignments: MissionAssignments;
  employees: DemoEmployee[];
  aircraft: DemoAircraft[];
  onAssignmentChange: (next: MissionAssignments) => void;
  onClose: () => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function pilotById(id: string, employees: DemoEmployee[]): DemoEmployee | undefined {
  return employees.find(e => e.id === id && e.role === 'pilot');
}

function medicalById(id: string, employees: DemoEmployee[]): DemoEmployee | undefined {
  return employees.find(e => e.id === id && (e.role === 'rn' || e.role === 'rt' || e.role === 'medic'));
}

function aircraftById(id: string, fleet: DemoAircraft[]): DemoAircraft | undefined {
  return fleet.find(a => a.id === id);
}

function meetsAircraftReqs(ac: DemoAircraft, mission: DemoMissionRequest): boolean {
  if (ac.hoursRemaining < mission.requirements.aircraft.minHoursRemaining) return false;
  const caps = mission.requirements.aircraft.requiredCapabilities ?? [];
  return caps.every(c => ac.capabilities.includes(c));
}

// ── Slot component ────────────────────────────────────────────────────────────

interface SlotProps {
  label: string;
  subtitle: string;
  filledId: string | null;
  employees: DemoEmployee[];
  fleet: DemoAircraft[];
  onOpen: (rect: DOMRect) => void;
  onRemove: () => void;
}

function Slot({ label, subtitle, filledId, employees, fleet, onOpen, onRemove }: SlotProps) {
  const btnRef = useRef<HTMLButtonElement>(null);
  const pilot  = filledId ? pilotById(filledId, employees) : null;
  const med    = filledId ? medicalById(filledId, employees) : null;
  const ac     = filledId ? aircraftById(filledId, fleet) : null;
  const filled = pilot ?? med ?? (ac ? { name: ac.name, role: ac.type } : null);

  const handleClick = () => {
    if (filled) return;
    if (btnRef.current) onOpen(btnRef.current.getBoundingClientRect());
  };

  return (
    <button
      ref={btnRef}
      type="button"
      className={[styles.slot, filled ? styles.slotFilled : styles.slotEmpty].filter(Boolean).join(' ')}
      onClick={handleClick}
      aria-label={filled ? `${filled.name} assigned` : `Assign ${label}`}
    >
      <span className={[styles.slotDot, filled ? styles.slotFilledDot : ''].filter(Boolean).join(' ')}>
        {filled ? <CheckCircle size={14} /> : <Circle size={14} />}
      </span>
      <span className={styles.slotText}>
        <span className={styles.slotName}>{filled ? filled.name : label}</span>
        <span className={styles.slotRole}>{filled ? (pilot?.certifications.slice(0,2).join(' · ') ?? med?.certifications.slice(0,1).join('') ?? ac?.tail ?? '') : subtitle}</span>
      </span>
      {filled && (
        <button
          type="button"
          className={styles.removeBtn}
          onClick={e => { e.stopPropagation(); onRemove(); }}
          aria-label="Remove assignment"
        >
          <X size={12} />
        </button>
      )}
    </button>
  );
}

// ── Candidate popover ─────────────────────────────────────────────────────────

interface CandidatePopoverProps {
  slot: ActiveSlot;
  employees: DemoEmployee[];
  fleet: DemoAircraft[];
  mission: DemoMissionRequest;
  onSelect: (id: string, valid: boolean, reason: string) => void;
  onDismiss: () => void;
}

function CandidatePopover({ slot, employees, fleet, mission, onSelect, onDismiss }: CandidatePopoverProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onDismiss();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onDismiss]);

  const rect = slot.anchorRect;
  const top  = Math.min(rect.bottom + 6, window.innerHeight - 300);
  const left = Math.max(8, Math.min(rect.left, window.innerWidth - 256));

  let candidates: { id: string; name: string; sub: string; valid: boolean; reason: string }[] = [];

  if (slot.kind === 'pilot') {
    const req = mission.requirements.crew.pilots;
    candidates = employees
      .filter(e => e.role === 'pilot')
      .map(e => {
        const hasAll = req.certifications.every(c => e.certifications.includes(c));
        return {
          id: e.id, name: e.name,
          sub: e.certifications.slice(0, 3).join(' · '),
          valid: hasAll,
          reason: hasAll ? '' : `Missing: ${req.certifications.filter(c => !e.certifications.includes(c)).join(', ')}`,
        };
      });
  } else if (slot.kind === 'medical') {
    const medSlot = mission.requirements.crew.medical[slot.index];
    const roleMap: Record<string, DemoEmployee['role'][]> = {
      RN: ['rn'], RT: ['rt'], Medic: ['medic'],
    };
    const allowedRoles = roleMap[medSlot?.role ?? 'RN'] ?? ['rn'];
    candidates = employees
      .filter(e => allowedRoles.includes(e.role))
      .map(e => {
        const hasAll = medSlot.certifications.every(c => e.certifications.some(ec => ec.includes(c)));
        return {
          id: e.id, name: e.name,
          sub: e.certifications.slice(0, 2).join(' · '),
          valid: hasAll,
          reason: hasAll ? '' : `Missing certification for this slot`,
        };
      });
  } else {
    candidates = fleet.map(a => {
      const ok = meetsAircraftReqs(a, mission);
      return {
        id: a.id, name: a.name,
        sub: `${a.hoursRemaining}hr remaining · ${a.capabilities.slice(0,2).join(', ')}`,
        valid: ok && a.status !== 'maintenance',
        reason: !ok
          ? `Insufficient hours (need ${mission.requirements.aircraft.minHoursRemaining}hr)`
          : a.status === 'maintenance' ? 'In maintenance' : '',
      };
    });
  }

  return (
    <div
      ref={ref}
      className={styles.candidatePopover}
      style={{ top, left }}
      role="listbox"
      aria-label="Select candidate"
    >
      <div className={styles.candidateHeader}>
        {slot.kind === 'pilot' ? 'Select Pilot' : slot.kind === 'medical' ? 'Select Medical Crew' : 'Select Aircraft'}
      </div>
      {candidates.map(c => (
        <div
          key={c.id}
          role="option"
          aria-selected="false"
          className={[styles.candidateItem, !c.valid ? styles.candidateItemDisabled : ''].filter(Boolean).join(' ')}
          onClick={() => onSelect(c.id, c.valid, c.reason)}
        >
          <div>
            <div className={styles.candidateName}>{c.name}</div>
            <div className={styles.candidateSub}>{c.sub}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function MissionHoverCard({
  mission,
  assignments,
  employees,
  aircraft,
  onAssignmentChange,
  onClose,
}: MissionHoverCardProps) {
  const [activeSlot, setActiveSlot] = useState<ActiveSlot | null>(null);
  const [error, setError] = useState<string | null>(null);

  // ESC to close
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  const openSlot = useCallback((kind: SlotKind, index: number, rect: DOMRect) => {
    setError(null);
    setActiveSlot({ kind, index, anchorRect: rect });
  }, []);

  const handleSelect = useCallback((id: string, valid: boolean, reason: string) => {
    if (!activeSlot) return;
    if (!valid) {
      setError(reason || 'Employee missing requirements for this task');
      setActiveSlot(null);
      return;
    }
    setError(null);
    const resource: AssignedResource = {
      resourceId: id,
      resourceType: activeSlot.kind === 'aircraft' ? 'aircraft'
        : activeSlot.kind === 'pilot' ? 'pilot' : 'medical',
    };
    if (activeSlot.kind === 'pilot') {
      const next = [...assignments.pilots];
      next[activeSlot.index] = resource;
      onAssignmentChange({ ...assignments, pilots: next });
    } else if (activeSlot.kind === 'medical') {
      const next = [...assignments.medical];
      next[activeSlot.index] = resource;
      onAssignmentChange({ ...assignments, medical: next });
    } else {
      onAssignmentChange({ ...assignments, aircraft: resource });
    }
    setActiveSlot(null);
  }, [activeSlot, assignments, onAssignmentChange]);

  const removePilot = useCallback((i: number) => {
    const next = [...assignments.pilots];
    next.splice(i, 1);
    onAssignmentChange({ ...assignments, pilots: next });
  }, [assignments, onAssignmentChange]);

  const removeMedical = useCallback((i: number) => {
    const next = [...assignments.medical];
    next.splice(i, 1);
    onAssignmentChange({ ...assignments, medical: next });
  }, [assignments, onAssignmentChange]);

  const removeAircraft = useCallback(() => {
    onAssignmentChange({ ...assignments, aircraft: null });
  }, [assignments, onAssignmentChange]);

  const pilotCount  = mission.requirements.crew.pilots.count;
  const medSlots    = mission.requirements.crew.medical;
  const assignedAc  = assignments.aircraft ? aircraftById(assignments.aircraft.resourceId, aircraft) : null;
  const acMeetsReqs = assignedAc ? meetsAircraftReqs(assignedAc, mission) : false;

  const metaText = `${mission.legs.length} legs · ${mission.requirements.durationDays} days`;

  return (
    <div className={styles.backdrop} role="dialog" aria-modal="true" aria-label={`Mission: ${mission.title}`}>
      <div className={styles.card}>

        {/* Header */}
        <div className={styles.header}>
          <div className={styles.missionIcon}><Plane size={18} /></div>
          <div className={styles.headerText}>
            <h2 className={styles.missionTitle}>{mission.title}</h2>
            <div className={styles.missionMeta}>
              <span>{mission.start.slice(0,10)} – {mission.end.slice(0,10)}</span>
              <span>{metaText}</span>
            </div>
          </div>
          <button className={styles.closeBtn} onClick={onClose} aria-label="Close"><X size={16} /></button>
        </div>

        {/* Validation error */}
        {error && (
          <div className={styles.errorBanner}>
            <AlertCircle size={14} />
            {error}
          </div>
        )}

        {/* Requirements diagram */}
        <div className={styles.mapArea}>
          <div className={styles.diagram}>

            {/* Left: Pilots */}
            <div className={styles.leftCol}>
              <div className={styles.slotGroup}>
                <div className={styles.groupLabel}>Pilots ({pilotCount} required)</div>
                {Array.from({ length: pilotCount }).map((_, i) => (
                  <Slot
                    key={i}
                    label={`Pilot ${i + 1}`}
                    subtitle={mission.requirements.crew.pilots.certifications.join(' · ')}
                    filledId={assignments.pilots[i]?.resourceId ?? null}
                    employees={employees}
                    fleet={aircraft}
                    onOpen={rect => openSlot('pilot', i, rect)}
                    onRemove={() => removePilot(i)}
                  />
                ))}
              </div>
            </div>

            {/* Center: mission node */}
            <div className={styles.centerNode}>
              <div className={styles.centerTitle}>{mission.title.split('→')[0].trim()}</div>
              <div className={styles.centerSub}>→ {mission.title.split('→')[1]?.trim()}</div>
            </div>

            {/* Right: Medical + Aircraft */}
            <div className={styles.rightCol}>
              <div className={styles.slotGroup}>
                <div className={styles.groupLabel}>Medical Crew</div>
                {medSlots.map((slot, i) => (
                  <Slot
                    key={i}
                    label={`${slot.role}: ${slot.certifications.join(' · ')}`}
                    subtitle={slot.certifications.join(' · ')}
                    filledId={assignments.medical[i]?.resourceId ?? null}
                    employees={employees}
                    fleet={aircraft}
                    onOpen={rect => openSlot('medical', i, rect)}
                    onRemove={() => removeMedical(i)}
                  />
                ))}
              </div>

              <div className={styles.slotGroup}>
                <div className={styles.groupLabel}>Aircraft</div>
                <Slot
                  label="Assign Aircraft"
                  subtitle={`min ${mission.requirements.aircraft.minHoursRemaining}hr · ${(mission.requirements.aircraft.requiredCapabilities ?? []).join(', ')}`}
                  filledId={assignments.aircraft?.resourceId ?? null}
                  employees={employees}
                  fleet={aircraft}
                  onOpen={rect => openSlot('aircraft', 0, rect)}
                  onRemove={removeAircraft}
                />
                {assignedAc && !acMeetsReqs && (
                  <div style={{ fontSize: 11, color: '#f87171', marginTop: 4 }}>
                    ⚠ Aircraft does not meet all requirements
                  </div>
                )}
                {assignedAc && (
                  <div style={{ fontSize: 10, color: '#64748b', marginTop: 4 }}>
                    {assignedAc.hoursRemaining}hr remaining · {assignedAc.capabilities.join(' · ')}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Compliance strip */}
        <div className={styles.complianceStrip}>
          <div className={styles.complianceTitle}>Country clearances &amp; compliance</div>
          <div className={styles.complianceList}>
            {mission.compliance.map(c => (
              <span
                key={c.id}
                className={[styles.complianceItem, c.status === 'approved' ? styles.complianceApproved : styles.compliancePending].join(' ')}
              >
                {c.status === 'approved' ? <CheckCircle size={11} /> : <AlertCircle size={11} />}
                {c.label}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Candidate popover (renders outside card to avoid clipping) */}
      {activeSlot && (
        <CandidatePopover
          slot={activeSlot}
          employees={employees}
          fleet={aircraft}
          mission={mission}
          onSelect={handleSelect}
          onDismiss={() => setActiveSlot(null)}
        />
      )}
    </div>
  );
}

// ── Standalone helper: are all requirements met? ──────────────────────────────

export function allRequirementsMet(
  assignments: MissionAssignments,
  mission: DemoMissionRequest,
  fleet: DemoAircraft[],
): boolean {
  if (assignments.pilots.length < mission.requirements.crew.pilots.count) return false;
  if (assignments.medical.length < mission.requirements.crew.medical.length) return false;
  if (!assignments.aircraft) return false;
  const ac = fleet.find(a => a.id === assignments.aircraft?.resourceId);
  if (!ac) return false;
  return meetsAircraftReqs(ac, mission);
}
