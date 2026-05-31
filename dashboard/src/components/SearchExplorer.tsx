import { useEffect } from 'react';

import { useRouter } from '../router.js';
import { buildObservatoryUrlFromSearch } from './observatory/context-store.js';

export default function SearchExplorer() {
  const { navigate } = useRouter();

  useEffect(() => {
    navigate(buildObservatoryUrlFromSearch(window.location.search, 'recall'));
  }, [navigate]);

  return (
    <div className="loading-container">
      <div className="loading-spinner" />
    </div>
  );
}
