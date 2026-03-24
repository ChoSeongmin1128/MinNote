import { useEffect, useState } from 'react';

const MOBILE_VIEWPORT_QUERY = '(max-width: 980px)';

export function useIsMobileViewport() {
  const [isMobileViewport, setIsMobileViewport] = useState(() => {
    if (typeof window === 'undefined') {
      return false;
    }

    return window.matchMedia(MOBILE_VIEWPORT_QUERY).matches;
  });

  useEffect(() => {
    const mediaQuery = window.matchMedia(MOBILE_VIEWPORT_QUERY);
    const handleChange = (event: MediaQueryListEvent) => {
      setIsMobileViewport(event.matches);
    };

    setIsMobileViewport(mediaQuery.matches);
    mediaQuery.addEventListener('change', handleChange);
    return () => {
      mediaQuery.removeEventListener('change', handleChange);
    };
  }, []);

  return isMobileViewport;
}
