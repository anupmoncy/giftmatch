import { Navigate, Route, BrowserRouter as Router, Routes, useLocation } from 'react-router-dom';
import { NavBar } from './components/NavBar.js';
import { AdminPage } from './pages/Admin.js';
import { HistoryPage } from './pages/History.js';
import { LoginPage } from './pages/Login.js';
import { QuizPage } from './pages/Quiz.js';
import { SavedCatalogPage } from './pages/SavedCatalog.js';

function AppShell() {
  const location = useLocation();
  const isLoginPage = location.pathname === '/login';

  return (
    <div className="min-h-screen bg-gray-50 text-gray-950">
      {isLoginPage ? null : <NavBar />}
      <main className={isLoginPage ? '' : 'w-full px-4 py-8 sm:px-6'}>
        <Routes>
          <Route path="/" element={<Navigate to="/login" replace />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/quiz" element={<QuizPage />} />
          <Route path="/catalog" element={<SavedCatalogPage />} />
          <Route path="/history" element={<HistoryPage />} />
          <Route path="/admin" element={<AdminPage />} />
          <Route path="*" element={<Navigate to="/quiz" replace />} />
        </Routes>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <Router>
      <AppShell />
    </Router>
  );
}
