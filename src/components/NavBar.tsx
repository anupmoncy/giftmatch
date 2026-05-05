import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { checkAdmin } from '../lib/auth';

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
    <header className="border-b border-gray-200 bg-white">
      <nav className="flex h-14 items-center justify-between px-6">
        <Link to="/quiz" className="text-lg font-bold text-gray-900">
          GiftMatch
        </Link>
        <div className="flex items-center gap-4">
          {isAdmin ? (
            <Link to="/admin" className="text-sm font-medium text-gray-500 transition hover:text-gray-900">
            Admin
            </Link>
          ) : null}
        </div>
      </nav>
    </header>
  );
}
