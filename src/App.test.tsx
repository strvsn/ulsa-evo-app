import { render, screen } from '@testing-library/react';
import { beforeEach, vi } from 'vitest';
import App from './App';

const appMocks = vi.hoisted(() => ({
  initialPath: '/',
}));

vi.mock('@ionic/react', async () => {
  const actual = await vi.importActual<typeof import('@ionic/react')>('@ionic/react');
  const React = await import('react');
  const Container = ({ children }: { children?: unknown }) =>
    React.createElement('div', null, children as React.ReactNode);

  return {
    ...actual,
    IonApp: Container,
    IonRouterOutlet: Container,
    setupIonicReact: vi.fn(),
  };
});

vi.mock('@ionic/react-router', async () => {
  const React = await import('react');
  const { MemoryRouter } = await import('react-router-dom');

  return {
    IonReactRouter: ({ children }: { children?: unknown }) =>
      React.createElement(
        MemoryRouter,
        { initialEntries: [appMocks.initialPath] },
        children as React.ReactNode,
      ),
  };
});

vi.mock('./pages/Dashboard', async () => {
  const { useLocation } = await import('react-router-dom');
  const DashboardRouteMock = () => {
    const location = useLocation();
    return (
      <main data-testid="dashboard-route" data-pathname={location.pathname}>
        Dashboard
      </main>
    );
  };

  return {
    default: DashboardRouteMock,
  };
});

beforeEach(() => {
  appMocks.initialPath = '/';
});

test.each([
  ['app root', '/'],
  ['dashboard route', '/dashboard'],
  ['unknown route', '/saved/deep-link'],
])('renders Dashboard for the %s', (_label, initialPath) => {
  appMocks.initialPath = initialPath;

  render(<App />);

  expect(screen.getByTestId('dashboard-route')).toHaveAttribute('data-pathname', '/dashboard');
});
