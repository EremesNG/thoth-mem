import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Activity, BrainCircuit, Gauge, Menu, Orbit, Terminal, X } from 'lucide-react';
import { Link, useRouter } from '../router.js';

const navigation = [
  { href: '/', label: 'Memory universe', icon: Orbit },
  { href: '/console/operations', label: 'Save a memory', icon: Terminal },
  { href: '/console/traces', label: 'Recent activity', icon: Activity },
  { href: '/console/indexing', label: 'Readiness', icon: Gauge },
];

export default function AppShell({ children }: { children: ReactNode }) {
  const { location } = useRouter();
  const atlasRoute = location.pathname === '/' || location.pathname === '/console/graph';
  const [open, setOpen] = useState(false);
  const [mobile, setMobile] = useState(() => window.matchMedia('(max-width: 720px)').matches);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const railRef = useRef<HTMLElement>(null);
  const mainRef = useRef<HTMLElement>(null);
  const wasOpenRef = useRef(false);
  useEffect(() => { const query = window.matchMedia('(max-width: 720px)'); const update = () => setMobile(query.matches); query.addEventListener('change', update); return () => query.removeEventListener('change', update); }, []);
  useEffect(() => { setOpen(false); }, [location.pathname]);
  useEffect(() => {
    if (!open) return;
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); setOpen(false); } };
    document.addEventListener('keydown', close, true);
    return () => document.removeEventListener('keydown', close, true);
  }, [open]);
  useEffect(() => {
    if (!mobile) return;
    if (mainRef.current) mainRef.current.inert = open;
    if (open) railRef.current?.focus(); else if (wasOpenRef.current) triggerRef.current?.focus();
    wasOpenRef.current = open;
    return () => { if (mainRef.current) mainRef.current.inert = false; };
  }, [mobile, open]);
  return <div className="app-shell">
    <button ref={triggerRef} className="mobile-nav-trigger" type="button" aria-expanded={open} aria-controls="command-rail" onClick={() => setOpen(true)}><Menu /><span>Open navigation</span></button>
    {open && <button type="button" className="drawer-backdrop" aria-label="Close navigation" onClick={() => setOpen(false)} />}
    <aside ref={railRef} tabIndex={-1} inert={mobile && !open ? true : undefined} aria-hidden={mobile && !open ? true : undefined} id="command-rail" className={`command-rail ${open ? 'open' : ''}`} aria-label="Primary command navigation">
      <header><BrainCircuit /><div><strong>THOTH / MEM</strong><span>Neural Observatory</span></div><button type="button" className="rail-close" onClick={() => setOpen(false)} aria-label="Close navigation"><X /></button></header>
      <nav>{navigation.map(({ href, label, icon: Icon }, index) => <Link key={href} to={href} className={(href === '/' ? location.pathname === '/' || location.pathname === '/console/graph' : location.pathname === href) ? 'active' : ''}><span className="rail-index">0{index + 1}</span><Icon /><span>{label}</span></Link>)}</nav>
      <footer><span className="health-beacon" /> Your local memory <small>Stays on this machine</small></footer>
    </aside>
    <main ref={mainRef} className={`app-main ${atlasRoute ? 'atlas-route' : ''}`}>{children}</main>
  </div>;
}
