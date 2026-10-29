import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';

const PLANNED = ['Requirements', 'Bug Management', 'Test Execution', 'Reports', 'Settings'];

function Logo() {
  return (
    <svg width="28" height="28" viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="7" fill="currentColor" />
      <path
        d="M9 16.5l4.5 4.5L23 11"
        fill="none"
        stroke="#fff"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function AppShell() {
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();

  useEffect(() => setMenuOpen(false), [location.pathname]);

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMenuOpen(false);
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [menuOpen]);

  return (
    <div className="shell">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="mobile-bar">
        <button
          type="button"
          className="btn btn-sm"
          aria-expanded={menuOpen}
          aria-controls="sidebar"
          onClick={() => setMenuOpen((o) => !o)}
        >
          Menu
        </button>
        <span className="brand-name">QALynks</span>
      </header>
      <aside id="sidebar" className={`sidebar${menuOpen ? ' open' : ''}`}>
        <div className="brand">
          <Logo />
          <span className="brand-name">QALynks</span>
        </div>
        <nav aria-label="Primary">
          <ul className="nav-list">
            <li>
              <NavLink to="/" end>
                Dashboard
              </NavLink>
            </li>
            <li>
              <NavLink to="/test-cases">Test Cases</NavLink>
            </li>
          </ul>
          <p className="nav-heading">Planned</p>
          <ul className="nav-list">
            {PLANNED.map((name) => (
              <li key={name}>
                <span className="nav-planned" aria-disabled="true">
                  {name}
                  <span className="soon">Soon</span>
                </span>
              </li>
            ))}
          </ul>
        </nav>
      </aside>
      {menuOpen && <div className="scrim" onClick={() => setMenuOpen(false)} aria-hidden="true" />}
      <main id="main" className="content" tabIndex={-1}>
        <Outlet />
      </main>
    </div>
  );
}
