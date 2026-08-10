import AppShell from './components/AppShell.js';
import ControlRoomWorkspace from './components/control-room/ControlRoomWorkspace.js';
import ObservatoryWorkspace from './components/observatory/ObservatoryWorkspace.js';
import { resolveDashboardRoute } from './routes.js';
import { useRouter } from './router.js';

export default function App() {
  const { location } = useRouter();
  const route = resolveDashboardRoute(location.pathname);
  return <AppShell>
    {(route === 'observatory' || route === 'observatoryAlias') && <ObservatoryWorkspace />}
    {route === 'operations' && <ControlRoomWorkspace room="operations" />}
    {route === 'traces' && <ControlRoomWorkspace room="traces" />}
    {route === 'indexing' && <ControlRoomWorkspace room="indexing" />}
    {route === 'unknown' && <section className="route-missing"><span>Unknown coordinate</span><h1>This route is outside the observatory.</h1><a href="/">Return to the memory nebula</a></section>}
  </AppShell>;
}
