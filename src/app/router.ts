import { useState, useEffect } from 'react';

export type RoutePath =
  | { route: 'start' }
  | { route: 'grill'; sessionId: string; followUp?: boolean }
  | { route: 'sessions' }
  | { route: 'handoff'; sessionId: string }
  | { route: 'settings-apis' }
  | { route: 'settings-prompts' };

export function parseHash(hash: string): RoutePath {
  const clean = hash.replace(/^#\/?/, '').trim();
  const parts = clean.split('/');

  if (!clean || parts[0] === '' || parts[0] === 'start') {
    return { route: 'start' };
  }
  if (parts[0] === 'grill' && parts[1]) {
    return {
      route: 'grill',
      sessionId: parts[1],
      followUp: parts[2] === 'follow-up' ? true : undefined,
    };
  }
  if (parts[0] === 'sessions') {
    return { route: 'sessions' };
  }
  if (parts[0] === 'handoff' && parts[1]) {
    return { route: 'handoff', sessionId: parts[1] };
  }
  if (parts[0] === 'settings' && parts[1] === 'apis') {
    return { route: 'settings-apis' };
  }
  if (parts[0] === 'settings' && parts[1] === 'prompts') {
    return { route: 'settings-prompts' };
  }

  return { route: 'start' };
}

export function toHash(path: RoutePath): string {
  switch (path.route) {
    case 'start':
      return '#/';
    case 'grill':
      return path.followUp
        ? `#/grill/${path.sessionId}/follow-up`
        : `#/grill/${path.sessionId}`;
    case 'sessions':
      return '#/sessions';
    case 'handoff':
      return `#/handoff/${path.sessionId}`;
    case 'settings-apis':
      return '#/settings/apis';
    case 'settings-prompts':
      return '#/settings/prompts';
  }
}

export function useRouter() {
  const [currentRoute, setCurrentRoute] = useState<RoutePath>(() =>
    parseHash(window.location.hash)
  );

  useEffect(() => {
    const handleHashChange = () => {
      setCurrentRoute(parseHash(window.location.hash));
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const navigate = (path: RoutePath) => {
    const newHash = toHash(path);
    if (window.location.hash === newHash) {
      setCurrentRoute(path);
    } else {
      window.location.hash = newHash;
    }
  };

  return { currentRoute, navigate };
}
