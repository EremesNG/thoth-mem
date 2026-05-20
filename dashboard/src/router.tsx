import React, { createContext, useContext, useState, useEffect } from 'react';

// Define the router context
interface RouterContextType {
  path: string;
  navigate: (to: string) => void;
}

const RouterContext = createContext<RouterContextType | undefined>(undefined);

export function useRouter() {
  const context = useContext(RouterContext);
  if (!context) {
    throw new Error('useRouter must be used within a RouterProvider');
  }
  return context;
}

interface RouterProviderProps {
  children: React.ReactNode;
}

export function RouterProvider({ children }: RouterProviderProps) {
  const normalizePath = (to: string) => new URL(to, window.location.origin).pathname || '/';

  // Get initial path from window.location.pathname
  const [path, setPath] = useState(() => {
    // Strip base path if any
    return window.location.pathname || '/';
  });

  useEffect(() => {
    const handlePopState = () => {
      setPath(window.location.pathname || '/');
    };

    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, []);

  const navigate = (to: string) => {
    window.history.pushState(null, '', to);
    setPath(normalizePath(to));
  };

  return (
    <RouterContext.Provider value={{ path, navigate }}>
      {children}
    </RouterContext.Provider>
  );
}

interface LinkProps extends React.AnchorHTMLAttributes<HTMLAnchorElement> {
  to: string;
}

export function Link({ to, children, onClick, ...props }: LinkProps) {
  const { navigate } = useRouter();

  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    // Let browser handle middle click, control click, etc.
    if (e.metaKey || e.altKey || e.ctrlKey || e.shiftKey) return;
    if (e.defaultPrevented) return;

    e.preventDefault();
    if (onClick) onClick(e);
    navigate(to);
  };

  return (
    <a href={to} onClick={handleClick} {...props}>
      {children}
    </a>
  );
}

interface RouteProps {
  path: string;
  component: React.ComponentType<any>;
}

/**
 * Simple route matcher supporting path parameters like :id or :project
 */
export function Route({ path: routePath, component: Component }: RouteProps) {
  const { path: currentPath } = useRouter();

  // Parse path parameters
  const match = matchPath(routePath, currentPath);
  if (!match) return null;

  return <Component params={match.params} />;
}

function matchPath(routePath: string, currentPath: string) {
  const routeParts = routePath.split('/').filter(Boolean);
  const currentParts = currentPath.split('/').filter(Boolean);

  if (routeParts.length !== currentParts.length) {
    return null;
  }

  const params: Record<string, string> = {};

  for (let i = 0; i < routeParts.length; i++) {
    const routePart = routeParts[i];
    const currentPart = currentParts[i];

    if (routePart.startsWith(':')) {
      const paramName = routePart.slice(1);
      params[paramName] = decodeURIComponent(currentPart);
    } else if (routePart !== currentPart) {
      return null;
    }
  }

  return { params };
}
