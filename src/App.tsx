import { Navigate, Route, BrowserRouter as Router, Routes } from 'react-router-dom';
import { NavBar } from './components/NavBar';
import { AdminPage } from './pages/Admin';
import { LoginPage } from './pages/Login';
import { QuizPage } from './pages/Quiz';
import { ResultsPage } from './pages/Results';
import { SavedPage } from './pages/Saved';

export default function App() {
  return (
    <Router>
      <div className="min-h-screen bg-slate-50 text-slate-950">
        <NavBar />
        <main className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6">
          <Routes>
            <Route path="/" element={<Navigate to="/login" replace />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/quiz" element={<QuizPage />} />
            <Route path="/results" element={<ResultsPage />} />
            <Route path="/saved" element={<SavedPage />} />
            <Route path="/admin" element={<AdminPage />} />
          </Routes>
        </main>
      </div>
    </Router>
  );
}
