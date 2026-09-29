import { createRootRoute, createRoute, createRouter, Link, Outlet } from '@tanstack/react-router';
import { PortfolioPage } from './routes/portfolio.tsx';
import { ResearchPage } from './routes/research.tsx';
import { SystemPage } from './routes/system.tsx';

const NAV = [
  { to: '/', label: 'Portfolio' },
  { to: '/research', label: 'Research' },
  { to: '/system', label: 'System' },
] as const;

function Layout() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <nav className="mb-8 flex items-center gap-6 text-sm">
        <span className="font-semibold tracking-tight">Talewinds</span>
        {NAV.map((item) => (
          <Link
            key={item.to}
            to={item.to}
            // Active/inactive colors must be mutually exclusive: two text-* classes on
            // one element resolve by stylesheet order, not by which was added last.
            activeProps={{ className: 'text-fg font-medium' }}
            inactiveProps={{ className: 'text-muted hover:text-fg' }}
            activeOptions={{ exact: true }}
          >
            {item.label}
          </Link>
        ))}
      </nav>
      <main>
        <Outlet />
      </main>
    </div>
  );
}

const rootRoute = createRootRoute({ component: Layout });

const routeTree = rootRoute.addChildren([
  createRoute({ getParentRoute: () => rootRoute, path: '/', component: PortfolioPage }),
  createRoute({ getParentRoute: () => rootRoute, path: '/research', component: ResearchPage }),
  createRoute({ getParentRoute: () => rootRoute, path: '/system', component: SystemPage }),
]);

export const router = createRouter({ routeTree });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
