import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

export interface Crumb {
  label: string;
  to?: string;
}

interface Props {
  title: string;
  crumbs: Crumb[];
  actions?: ReactNode;
  subtitle?: string;
}

export function PageHeader({ title, crumbs, actions, subtitle }: Props) {
  return (
    <header className="page-header">
      <div>
        <nav aria-label="Breadcrumb" className="breadcrumb">
          <ol>
            {crumbs.map((crumb, i) => (
              <li key={crumb.label} aria-current={i === crumbs.length - 1 ? 'page' : undefined}>
                {crumb.to ? <Link to={crumb.to}>{crumb.label}</Link> : crumb.label}
              </li>
            ))}
          </ol>
        </nav>
        <h1>{title}</h1>
        {subtitle && <p className="subtitle">{subtitle}</p>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </header>
  );
}
