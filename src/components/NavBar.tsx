import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { checkAdmin } from '../lib/auth.js';

export function NavBar() {
  const [isAdmin, setIsAdmin] = useState(false);

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

  return (
    <header className="sticky top-0 z-50 border-b border-gray-100 bg-white/90 backdrop-blur-sm">
      <nav className="flex h-14 items-center justify-between px-6">
        <Link to="/quiz" className="text-lg font-bold text-gray-900">
          <span aria-hidden="true">🎁</span> GiftMatch
        </Link>
        <div className="flex items-center gap-4">
          {isAdmin ? (
            <Link to="/admin" className="text-sm text-gray-400 transition hover:text-gray-900">
              Admin
            </Link>
          ) : null}
        </div>
      </nav>
    </header>
  );
}
