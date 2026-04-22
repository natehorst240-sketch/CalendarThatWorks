/**
 * ScreenReaderAnnouncer — hidden live region for announcing dynamic
 * changes to assistive technology.
 *
 * Usage:
 *   const announcerRef = useRef(null);
 *   <ScreenReaderAnnouncer ref={announcerRef} />
 *
 *   // From any event handler:
 *   announcerRef.current?.announce('Event moved to Monday');
 *   announcerRef.current?.announce('Error: end must be after start', 'assertive');
 *
 * Implementation detail:
 *   Two independent live regions — one polite, one assertive — each with
 *   two alternating hidden spans.  Toggling between slots forces screen
 *   readers to re-read identical messages (some ignore textContent changes
 *   when the text is the same as before).
 */

import { useEffect, useImperativeHandle, useRef, useState, forwardRef } from 'react';

const srOnly: React.CSSProperties = {
  position:   'absolute',
  width:      '1px',
  height:     '1px',
  padding:    0,
  margin:     '-1px',
  overflow:   'hidden',
  clip:       'rect(0,0,0,0)',
  whiteSpace: 'nowrap',
  border:     0,
};

/**
 * A single live region with two alternating slots.
 * `politeness` must be 'polite' or 'assertive'.
 */
function LiveRegion({ politeness, slots }: { politeness: 'polite' | 'assertive'; slots: readonly string[] }) {
  return (
    <div aria-live={politeness} aria-atomic="true" style={srOnly}>
      <span>{slots[0]}</span>
      <span>{slots[1]}</span>
    </div>
  );
}

type AnnouncePoliteness = 'polite' | 'assertive';
type AnnouncerRef = { announce: (message: string, politeness?: AnnouncePoliteness) => void };

const ScreenReaderAnnouncer = forwardRef<AnnouncerRef, object>(function ScreenReaderAnnouncer(_, ref) {
  // Separate state for polite and assertive regions.
  const [politeSlot,    setPoliteSlot]    = useState(0);
  const [politeMsgs,    setPoliteMsgs]    = useState(['', '']);
  const [assertiveSlot, setAssertiveSlot] = useState(0);
  const [assertiveMsgs, setAssertiveMsgs] = useState(['', '']);

  const politeTimer    = useRef<ReturnType<typeof setTimeout> | null>(null);
  const assertiveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => () => {
    mountedRef.current = false;
    if (politeTimer.current) clearTimeout(politeTimer.current);
    if (assertiveTimer.current) clearTimeout(assertiveTimer.current);
  }, []);

  useImperativeHandle(ref, () => ({
    /**
     * @param {string}  message    The text to announce.
     * @param {'polite'|'assertive'} [politeness='polite']
     */
    announce(message: string, politeness: AnnouncePoliteness = 'polite') {
      if (politeness === 'assertive') {
        if (assertiveTimer.current) clearTimeout(assertiveTimer.current);
        assertiveTimer.current = setTimeout(() => {
          if (!mountedRef.current) return;
          setAssertiveSlot(prev => {
            const next = 1 - prev;
            setAssertiveMsgs(m => {
              const copy = [...m];
              copy[next] = message;
              copy[prev] = '';
              return copy;
            });
            return next;
          });
        }, 50);
      } else {
        if (politeTimer.current) clearTimeout(politeTimer.current);
        politeTimer.current = setTimeout(() => {
          if (!mountedRef.current) return;
          setPoliteSlot(prev => {
            const next = 1 - prev;
            setPoliteMsgs(m => {
              const copy = [...m];
              copy[next] = message;
              copy[prev] = '';
              return copy;
            });
            return next;
          });
        }, 50);
      }
    },
  }), []);

  return (
    <>
      <LiveRegion politeness="polite"    slots={politeMsgs}    />
      <LiveRegion politeness="assertive" slots={assertiveMsgs} />
    </>
  );
});

export default ScreenReaderAnnouncer;
