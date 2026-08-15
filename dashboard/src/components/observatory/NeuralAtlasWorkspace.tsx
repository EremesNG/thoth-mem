import { useEffect, useRef, type ReactNode } from 'react';

interface NeuralAtlasWorkspaceProps {
  children: ReactNode;
}

export default function NeuralAtlasWorkspace({ children }: NeuralAtlasWorkspaceProps) {
  const workspaceRef = useRef<HTMLElement | null>(null);
  const visualViewportSignatureRef = useRef<string | null>(null);
  const visualViewportGenerationRef = useRef(0);

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
      const scale = Math.round((viewport?.scale ?? 1) * 100) / 100;
      const signature = [width, height, left, top, bottomInset, scale].join(':');
      if (signature === visualViewportSignatureRef.current) return;
      const generation = visualViewportGenerationRef.current + 1;
      visualViewportGenerationRef.current = generation;
      window.dispatchEvent(new CustomEvent('thoth:visual-viewport-will-change', {
        detail: { generation },
      }));
      workspace.style.setProperty('--atlas-visual-left', `${left}px`);
      workspace.style.setProperty('--atlas-visual-top', `${top}px`);
      workspace.style.setProperty('--atlas-visual-width', `${width}px`);
      workspace.style.setProperty('--atlas-visual-height', `${height}px`);
      workspace.style.setProperty('--atlas-visual-bottom-inset', `${bottomInset}px`);
      workspace.style.setProperty('--atlas-sheet-height', `${sheetHeight}px`);
      workspace.dataset.visualScale = String(scale);
      workspace.dataset.visualWidth = String(Math.round(width));
      workspace.dataset.visualViewportGeneration = String(generation);
      visualViewportSignatureRef.current = signature;
      window.dispatchEvent(new CustomEvent('thoth:visual-viewport-change', {
        detail: { generation },
      }));
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
      data-visual-viewport-generation="0"
      aria-label="Neural Atlas memory explorer"
    >
      {children}
    </section>
  );
}
