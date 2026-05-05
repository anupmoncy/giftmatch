import { useEffect, useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { checkAdmin } from '../lib/auth.js';
import { requestQuizReset } from '../lib/quizReset.js';
import { supabase } from '../lib/supabase.js';

export function NavBar() {
  const navigate = useNavigate();
  const [isAdmin, setIsAdmin] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
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
    setIsMenuOpen(false);
    navigate('/login', { replace: true });
  }

  const navLinkClassName = ({ isActive }: { isActive: boolean }) =>
    [
      'rounded-lg px-3 py-2 text-sm font-medium transition hover:bg-gray-50 hover:text-gray-900 md:px-0 md:py-0 md:hover:bg-transparent',
      isActive ? 'bg-indigo-50 text-indigo-600 md:bg-transparent md:font-semibold' : 'text-gray-500 md:text-gray-400',
    ].join(' ');

  return (
    <header className="sticky top-0 z-50 border-b border-gray-100 bg-white/90 backdrop-blur-sm">
      <nav className="relative flex min-h-14 items-center justify-between px-4 py-3 sm:px-6 md:h-14 md:py-0">
        <Link
          to="/quiz"
          onClick={() => {
            requestQuizReset();
            setIsMenuOpen(false);
          }}
          className="text-lg font-bold text-gray-900"
        >
          <span aria-hidden="true">🎁</span> GiftMatch
        </Link>
        <button
          type="button"
          onClick={() => setIsMenuOpen((currentValue) => !currentValue)}
          className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-gray-200 text-gray-600 transition hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-600 md:hidden"
          aria-expanded={isMenuOpen}
          aria-controls="primary-navigation"
          aria-label="Toggle navigation menu"
        >
          <span className="sr-only">Menu</span>
          <span aria-hidden="true" className="flex flex-col gap-1">
            <span className="block h-0.5 w-4 rounded-full bg-current" />
            <span className="block h-0.5 w-4 rounded-full bg-current" />
            <span className="block h-0.5 w-4 rounded-full bg-current" />
          </span>
        </button>
        <div
          id="primary-navigation"
          className={[
            'absolute left-4 right-4 top-[calc(100%+0.5rem)] flex-col gap-1 rounded-2xl border border-gray-100 bg-white p-2 shadow-lg shadow-gray-900/10 md:static md:flex md:flex-row md:items-center md:gap-4 md:rounded-none md:border-0 md:bg-transparent md:p-0 md:shadow-none',
            isMenuOpen ? 'flex' : 'hidden',
          ].join(' ')}
        >
          <NavLink
            to="/quiz"
            onClick={() => setIsMenuOpen(false)}
            className={navLinkClassName}
          >
            Find gifts
          </NavLink>
          <NavLink
            to="/history"
            onClick={() => setIsMenuOpen(false)}
            className={navLinkClassName}
          >
            My history
          </NavLink>
          <NavLink
            to="/catalog"
            onClick={() => setIsMenuOpen(false)}
            className={navLinkClassName}
          >
            Saved gifts
          </NavLink>
          {isAdmin ? (
            <NavLink
              to="/admin"
              onClick={() => setIsMenuOpen(false)}
              className={navLinkClassName}
            >
              Admin
            </NavLink>
          ) : null}
          <button
            type="button"
            onClick={logOff}
            disabled={isLoggingOff}
            className="mt-1 rounded-lg border border-gray-200 px-3 py-2 text-left text-xs font-semibold text-gray-500 transition hover:border-indigo-300 hover:text-indigo-600 disabled:cursor-not-allowed disabled:opacity-50 md:mt-0 md:py-1.5"
          >
            {isLoggingOff ? 'Logging off...' : 'Log off'}
          </button>
        </div>
      </nav>
    </header>
  );
}
