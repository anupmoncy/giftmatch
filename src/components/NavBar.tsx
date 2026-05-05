import { Link, NavLink } from 'react-router-dom';

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  [
    'rounded-md px-3 py-2 text-sm font-medium transition',
    isActive ? 'bg-slate-700 text-white' : 'text-slate-200 hover:bg-slate-800 hover:text-white',
  ].join(' ');

export function NavBar() {
  return (
    <header className="bg-slate-950 text-white shadow-sm">
      <nav className="mx-auto flex h-16 w-full max-w-5xl items-center justify-between px-4 sm:px-6">
        <Link to="/quiz" className="text-lg font-semibold tracking-wide">
          Giftmatch
        </Link>
        <div className="flex items-center gap-2">
          <NavLink to="/saved" className={navLinkClass}>
            Saved
          </NavLink>
        </div>
      </nav>
    </header>
  );
}
