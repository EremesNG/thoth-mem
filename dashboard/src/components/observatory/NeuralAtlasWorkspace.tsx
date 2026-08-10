import { useEffect, useRef, type ReactNode } from 'react';

interface NeuralAtlasWorkspaceProps {
  children: ReactNode;
}

export default function NeuralAtlasWorkspace({ children }: NeuralAtlasWorkspaceProps) {
  const workspaceRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const workspace = workspaceRef.current;
    if (!workspace) return;
    const viewport = window.visualViewport;
    const syncVisualViewport = () => {
      const width = viewport?.width ?? window.innerWidth;
      const height = viewport?.height ?? window.innerHeight;
      const left = viewport?.offsetLeft ?? 0;
      const top = viewport?.offsetTop ?? 0;
      const bottomInset = Math.max(0, window.innerHeight - top - height);
      const sheetHeight = Math.min(620, height * 0.7, Math.max(150, height - 230));
      workspace.style.setProperty('--atlas-visual-left', `${left}px`);
      workspace.style.setProperty('--atlas-visual-top', `${top}px`);
      workspace.style.setProperty('--atlas-visual-width', `${width}px`);
      workspace.style.setProperty('--atlas-visual-height', `${height}px`);
      workspace.style.setProperty('--atlas-visual-bottom-inset', `${bottomInset}px`);
      workspace.style.setProperty('--atlas-sheet-height', `${sheetHeight}px`);
      workspace.dataset.visualScale = String(Math.round((viewport?.scale ?? 1) * 100) / 100);
      workspace.dataset.visualWidth = String(Math.round(width));
    };
    syncVisualViewport();
    window.addEventListener('resize', syncVisualViewport);
    viewport?.addEventListener('resize', syncVisualViewport);
    viewport?.addEventListener('scroll', syncVisualViewport);
    return () => {
      window.removeEventListener('resize', syncVisualViewport);
      viewport?.removeEventListener('resize', syncVisualViewport);
      viewport?.removeEventListener('scroll', syncVisualViewport);
    };
  }, []);

  return (
    <section
      ref={workspaceRef}
      className="observatory-workspace neural-atlas-workspace"
      data-testid="neural-atlas-workspace"
      data-visual-scale="1"
      aria-label="Neural Atlas memory explorer"
    >
      {children}
    </section>
  );
}
