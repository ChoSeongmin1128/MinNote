import { useEffect, useEffectEvent } from 'react';
import { APP_UPDATE_CHECK_INTERVAL_MS, runUpdateCheckFrom } from '../lib/appUpdater';

export function useAppUpdater(enabled: boolean) {
  const triggerInitialCheck = useEffectEvent(() => {
    void runUpdateCheckFrom('auto-initial');
  });

  const triggerIntervalCheck = useEffectEvent(() => {
    void runUpdateCheckFrom('auto-interval');
  });

  useEffect(() => {
    if (!enabled) {
      return undefined;
    }

    triggerInitialCheck();

    const timerId = window.setInterval(() => {
      triggerIntervalCheck();
    }, APP_UPDATE_CHECK_INTERVAL_MS);

    return () => {
      window.clearInterval(timerId);
    };
  }, [enabled, triggerInitialCheck, triggerIntervalCheck]);
}
