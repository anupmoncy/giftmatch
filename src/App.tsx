import { Navigate, Route, BrowserRouter as Router, Routes, useLocation } from 'react-router-dom';
import { NavBar } from './components/NavBar';
import { AdminPage } from './pages/Admin';
import { LoginPage } from './pages/Login';
import { QuizPage } from './pages/Quiz';

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
