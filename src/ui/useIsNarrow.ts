import { useEffect, useState } from 'react';

const NARROW = '(max-width: 899px)';

/** True below 900 px wide: panels become drawers and the toolbar compacts. */
export function useIsNarrow(): boolean {
  const [narrow, setNarrow] = useState(() => window.matchMedia(NARROW).matches);
  useEffect(() => {
    const mq = window.matchMedia(NARROW);
    const onChange = () => setNarrow(mq.matches);
    mq.addEventListener('change', onChange);
    onChange();
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return narrow;
}
