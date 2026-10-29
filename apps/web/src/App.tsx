import { Link, Route, Routes } from 'react-router-dom';
import { AppShell } from './components/AppShell';
import { PageHeader } from './components/PageHeader';
import { DashboardPage } from './pages/DashboardPage';
import { GeneratePage } from './pages/GeneratePage';
import { ImportPage } from './pages/ImportPage';
import { TestCaseDetailPage } from './pages/TestCaseDetailPage';
import { TestCaseFormPage } from './pages/TestCaseFormPage';
import { TestCaseListPage } from './pages/TestCaseListPage';

function NotFoundPage() {
  return (
    <>
      <PageHeader
        title="Page not found"
        crumbs={[{ label: 'Dashboard', to: '/' }, { label: 'Not found' }]}
      />
      <div className="state card">
        <p>The page you are looking for does not exist.</p>
        <Link className="btn" to="/">
          Go to dashboard
        </Link>
      </div>
    </>
  );
}

export function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<DashboardPage />} />
        <Route path="test-cases" element={<TestCaseListPage />} />
        <Route path="test-cases/new" element={<TestCaseFormPage mode="create" />} />
        <Route path="test-cases/import" element={<ImportPage />} />
        <Route path="test-cases/generate" element={<GeneratePage />} />
        <Route path="test-cases/:code" element={<TestCaseDetailPage />} />
        <Route path="test-cases/:code/edit" element={<TestCaseFormPage mode="edit" />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
