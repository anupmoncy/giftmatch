import { useEffect, useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { checkAdmin } from '../lib/auth.js';
import { requestQuizReset } from '../lib/quizReset.js';
import { supabase } from '../lib/supabase.js';

export function NavBar() {
  const navigate = useNavigate();
  const [isAdmin, setIsAdmin] = useState(false);
  const [isLoggingOff, setIsLoggingOff] = useState(false);

  useEffect(() => {
    let isMounted = true;

    checkAdmin()
      .then((admin) => {
        if (isMounted) {
          setIsAdmin(admin);
        }
      })
      .catch(() => {
        if (isMounted) {
          setIsAdmin(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  async function logOff() {
    setIsLoggingOff(true);
    await supabase.auth.signOut();
    navigate('/login', { replace: true });
  }

  return (
    <header className="sticky top-0 z-50 border-b border-gray-100 bg-white/90 backdrop-blur-sm">
      <nav className="flex h-14 items-center justify-between px-6">
        <Link to="/quiz" onClick={requestQuizReset} className="text-lg font-bold text-gray-900">
          <span aria-hidden="true">🎁</span> GiftMatch
        </Link>
        <div className="flex items-center gap-4">
          <NavLink
            to="/quiz"
            className={({ isActive }) =>
              [
                'text-sm transition hover:text-gray-900',
                isActive ? 'font-semibold text-indigo-600' : 'text-gray-400',
              ].join(' ')
            }
          >
            Find gifts
          </NavLink>
          <NavLink
            to="/history"
            className={({ isActive }) =>
              [
                'text-sm transition hover:text-gray-900',
                isActive ? 'font-semibold text-indigo-600' : 'text-gray-400',
              ].join(' ')
            }
          >
            My history
          </NavLink>
          <NavLink
            to="/catalog"
            className={({ isActive }) =>
              [
                'text-sm transition hover:text-gray-900',
                isActive ? 'font-semibold text-indigo-600' : 'text-gray-400',
              ].join(' ')
            }
          >
            Saved gifts
          </NavLink>
          {isAdmin ? (
            <NavLink
              to="/admin"
              className={({ isActive }) =>
                [
                  'text-sm transition hover:text-gray-900',
                  isActive ? 'font-semibold text-indigo-600' : 'text-gray-400',
                ].join(' ')
              }
            >
              Admin
            </NavLink>
          ) : null}
          <button
            type="button"
            onClick={logOff}
            disabled={isLoggingOff}
            className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-500 transition hover:border-indigo-300 hover:text-indigo-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isLoggingOff ? 'Logging off...' : 'Log off'}
          </button>
        </div>
      </nav>
    </header>
  );
}
