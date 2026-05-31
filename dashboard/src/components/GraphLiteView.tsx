import { useEffect } from 'react';

import { useRouter } from '../router.js';
import { buildObservatoryUrlFromSearch } from './observatory/context-store.js';

export default function GraphLiteView() {
  const { navigate } = useRouter();

  useEffect(() => {
    navigate(buildObservatoryUrlFromSearch(window.location.search, 'map'));
  }, [navigate]);

  return (
    <div className="loading-container">
      <div className="loading-spinner" />
    </div>
  );
}
