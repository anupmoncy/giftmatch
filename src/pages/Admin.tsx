import { Fragment, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { formatDateTime } from '../lib/formatters.js';
import { supabase } from '../lib/supabase.js';
import { asArray, asOne } from '../lib/supabaseJoins.js';

const pageSize = 10;

type ProfileJoin = {
  email: string | null;
};

type RecommendationRun = {
  id: string;
  model: string | null;
  summary: string | null;
  ranked_output: unknown;
};

type QuizRunRow = {
  id: string;
  created_at: string;
  recipient: string | null;
  personality: string | null;
  budget: number | null;
  free_text: string | null;
  profiles: ProfileJoin | ProfileJoin[] | null;
  recommendation_runs: RecommendationRun[] | RecommendationRun | null;
};

type AdminRunsResponse = {
  quizRuns?: QuizRunRow[];
  total?: number;
  error?: string;
};

type AdminUser = {
  id: string;
  email: string | null;
  role: 'user' | 'admin';
  access: 'active' | 'revoked';
  created_at: string | null;
  last_sign_in_at: string | null;
};

type AdminUsersResponse = {
  users?: AdminUser[];
  error?: string;
};

type AdminTab = 'history' | 'users';

function truncate(value: string | null | undefined, maxLength: number) {
  if (!value) {
    return '—';
  }

  return value.length > maxLength ? `${value.slice(0, maxLength).trim()}...` : value;
}

export function AdminPage() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<AdminTab>('history');
  const [quizRuns, setQuizRuns] = useState<QuizRunRow[]>([]);
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null);
  const [historyPage, setHistoryPage] = useState(0);
  const [totalQuizRuns, setTotalQuizRuns] = useState(0);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [userSearch, setUserSearch] = useState('');
  const [isHistoryLoading, setIsHistoryLoading] = useState(true);
  const [isUsersLoading, setIsUsersLoading] = useState(false);
  const [updatingUserId, setUpdatingUserId] = useState<string | null>(null);
  const [historyError, setHistoryError] = useState('');
  const [usersError, setUsersError] = useState('');
  const totalHistoryPages = Math.max(1, Math.ceil(totalQuizRuns / pageSize));

  useEffect(() => {
    let isMounted = true;

    async function loadAdminData() {
      try {
        setIsHistoryLoading(true);
        setHistoryError('');
        const {
          data: { session },
          error: sessionError,
        } = await supabase.auth.getSession();

        if (sessionError) {
          throw sessionError;
        }

        if (!session?.access_token) {
          navigate('/login', { replace: true });
          return;
        }

        const params = new URLSearchParams({
          limit: String(pageSize),
          offset: String(historyPage * pageSize),
        });
        const response = await fetch(`/api/admin-runs?${params.toString()}`, {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        });
        const body = (await response.json().catch(() => ({}))) as AdminRunsResponse;

        if (response.status === 403) {
          navigate('/quiz', { replace: true });
          return;
        }

        if (!response.ok) {
          throw new Error(body.error ?? 'Could not load admin data.');
        }

        if (isMounted) {
          setQuizRuns(body.quizRuns ?? []);
          setTotalQuizRuns(body.total ?? body.quizRuns?.length ?? 0);
        }
      } catch (loadError) {
        if (isMounted) {
          setHistoryError(
            loadError instanceof Error ? loadError.message : 'Could not load admin data.',
          );
        }
      } finally {
        if (isMounted) {
          setIsHistoryLoading(false);
        }
      }
    }

    loadAdminData();

    return () => {
      isMounted = false;
    };
  }, [historyPage, navigate]);

  useEffect(() => {
    if (activeTab !== 'users') {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      void loadUsers();
    }, 200);

    return () => window.clearTimeout(timeoutId);
  }, [activeTab, userSearch]);

  async function getAccessToken() {
    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession();

    if (sessionError) {
      throw sessionError;
    }

    if (!session?.access_token) {
      navigate('/login', { replace: true });
      return null;
    }

    return session.access_token;
  }

  async function loadUsers() {
    setIsUsersLoading(true);
    setUsersError('');

    try {
      const accessToken = await getAccessToken();

      if (!accessToken) {
        return;
      }

      const params = new URLSearchParams();

      if (userSearch.trim()) {
        params.set('search', userSearch.trim());
      }

      const response = await fetch(`/api/admin-users?${params.toString()}`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });
      const body = (await response.json().catch(() => ({}))) as AdminUsersResponse;

      if (response.status === 403) {
        navigate('/quiz', { replace: true });
        return;
      }

      if (!response.ok) {
        throw new Error(body.error ?? 'Could not load users.');
      }

      setUsers(body.users ?? []);
    } catch (loadError) {
      setUsersError(loadError instanceof Error ? loadError.message : 'Could not load users.');
    } finally {
      setIsUsersLoading(false);
    }
  }

  async function updateUser(userId: string, updates: { role?: AdminUser['role']; access?: AdminUser['access'] }) {
    setUpdatingUserId(userId);
    setUsersError('');

    try {
      const accessToken = await getAccessToken();

      if (!accessToken) {
        return;
      }

      const response = await fetch('/api/admin-users', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ userId, ...updates }),
      });
      const body = (await response.json().catch(() => ({}))) as { error?: string };

      if (!response.ok) {
        throw new Error(body.error ?? 'Could not update user.');
      }

      await loadUsers();
    } catch (updateError) {
      setUsersError(updateError instanceof Error ? updateError.message : 'Could not update user.');
    } finally {
      setUpdatingUserId(null);
    }
  }

  return (
    <section className="min-h-[calc(100vh-7rem)] bg-white p-6">
      <div className="mb-8">
        <h1 className="text-3xl font-semibold text-gray-900">Admin</h1>
        <p className="mt-2 text-gray-500">
          Review recommendation history and manage user access.
        </p>
      </div>

      <div className="mb-6 flex flex-wrap gap-2 border-b border-gray-200">
        {[
          ['history', 'All history'],
          ['users', 'User management'],
        ].map(([tab, label]) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab as AdminTab)}
            className={[
              '-mb-px border-b-2 px-4 py-3 text-sm font-semibold transition',
              activeTab === tab
                ? 'border-gray-900 text-gray-900'
                : 'border-transparent text-gray-400 hover:text-gray-700',
            ].join(' ')}
          >
            {label}
          </button>
        ))}
      </div>

      {activeTab === 'history' && isHistoryLoading ? (
        <div className="flex min-h-64 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-200 border-t-gray-900" />
        </div>
      ) : activeTab === 'history' && historyError ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {historyError}
        </div>
      ) : activeTab === 'history' ? (
        <div className="overflow-x-auto">
          <table className="min-w-[1100px] w-full text-left text-sm">
            <thead className="border-b border-gray-200 text-xs uppercase tracking-wide text-gray-400">
              <tr>
                <th className="px-4 py-3 font-semibold">Date</th>
                <th className="px-4 py-3 font-semibold">Email</th>
                <th className="px-4 py-3 font-semibold">Recipient</th>
                <th className="px-4 py-3 font-semibold">Personality</th>
                <th className="px-4 py-3 font-semibold">Budget</th>
                <th className="px-4 py-3 font-semibold">Free text</th>
                <th className="px-4 py-3 font-semibold">Model</th>
                <th className="px-4 py-3 font-semibold">Summary</th>
              </tr>
            </thead>
            <tbody>
              {quizRuns.map((quizRun, index) => {
                const profile = asOne(quizRun.profiles);
                const recommendation = asArray(quizRun.recommendation_runs)[0] ?? null;
                const isExpanded = expandedRowId === quizRun.id;

                return (
                  <Fragment key={quizRun.id}>
                    <tr
                      onClick={() => setExpandedRowId(isExpanded ? null : quizRun.id)}
                      className={[
                        'cursor-pointer border-b border-gray-100 transition hover:bg-gray-50',
                        index % 2 === 0 ? 'bg-white' : 'bg-gray-50/50',
                      ].join(' ')}
                    >
                      <td className="px-4 py-4 text-gray-600">
                        {formatDateTime(quizRun.created_at)}
                      </td>
                      <td className="px-4 py-4 text-gray-700">{profile?.email ?? '—'}</td>
                      <td className="px-4 py-4 capitalize text-gray-700">
                        {quizRun.recipient ?? '—'}
                      </td>
                      <td className="px-4 py-4 capitalize text-gray-700">
                        {quizRun.personality ?? '—'}
                      </td>
                      <td className="px-4 py-4 text-gray-700">
                        {quizRun.budget === null ? 'Flexible' : `$${quizRun.budget}`}
                      </td>
                      <td className="max-w-64 px-4 py-4 text-gray-600">
                        {truncate(quizRun.free_text, 60)}
                      </td>
                      <td className="px-4 py-4 text-gray-700">{recommendation?.model ?? '—'}</td>
                      <td className="max-w-80 px-4 py-4 text-gray-600">
                        {truncate(recommendation?.summary, 80)}
                      </td>
                    </tr>
                    {isExpanded ? (
                      <tr className="border-b border-gray-100 bg-white">
                        <td colSpan={8} className="px-4 py-4">
                          <pre className="max-h-96 overflow-auto rounded-lg bg-gray-50 p-4 text-xs leading-5 text-gray-700">
                            {JSON.stringify(recommendation?.ranked_output ?? null, null, 2)}
                          </pre>
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })}
            </tbody>
          </table>

          {quizRuns.length === 0 ? (
            <div className="p-8 text-center text-gray-500">No quiz runs found yet.</div>
          ) : null}
          {quizRuns.length > 0 ? (
            <div className="mt-4 flex flex-col gap-3 border-t border-gray-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-gray-500">
                Showing {historyPage * pageSize + 1}-
                {Math.min((historyPage + 1) * pageSize, totalQuizRuns)} of {totalQuizRuns}
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setHistoryPage((currentPage) => Math.max(0, currentPage - 1))}
                  disabled={historyPage === 0}
                  className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-600 transition hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-600 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Previous
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setHistoryPage((currentPage) =>
                      Math.min(totalHistoryPages - 1, currentPage + 1),
                    )
                  }
                  disabled={historyPage >= totalHistoryPages - 1}
                  className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-600 transition hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-600 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            </div>
          ) : null}
        </div>
      ) : (
        <div>
          {usersError ? (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              {usersError}
            </div>
          ) : null}

          <div className="mb-4 max-w-md">
            <label htmlFor="admin-user-search" className="sr-only">
              Search users
            </label>
            <input
              id="admin-user-search"
              type="search"
              value={userSearch}
              onChange={(event) => setUserSearch(event.target.value)}
              placeholder="Search users by email"
              className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm text-gray-800 outline-none transition focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
            />
          </div>

          {isUsersLoading ? (
            <div className="flex min-h-64 items-center justify-center">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-200 border-t-gray-900" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-[850px] w-full text-left text-sm">
                <thead className="border-b border-gray-200 text-xs uppercase tracking-wide text-gray-400">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Email</th>
                    <th className="px-4 py-3 font-semibold">Role</th>
                    <th className="px-4 py-3 font-semibold">Access</th>
                    <th className="px-4 py-3 font-semibold">Created</th>
                    <th className="px-4 py-3 font-semibold">Last sign in</th>
                    <th className="px-4 py-3 font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((user, index) => {
                    const isUpdating = updatingUserId === user.id;

                    return (
                      <tr
                        key={user.id}
                        className={[
                          'border-b border-gray-100',
                          index % 2 === 0 ? 'bg-white' : 'bg-gray-50/50',
                        ].join(' ')}
                      >
                        <td className="px-4 py-4 text-gray-700">{user.email ?? '—'}</td>
                        <td className="px-4 py-4">
                          <select
                            value={user.role}
                            disabled={isUpdating}
                            onChange={(event) =>
                              updateUser(user.id, { role: event.target.value as AdminUser['role'] })
                            }
                            className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-700 disabled:opacity-50"
                          >
                            <option value="user">User</option>
                            <option value="admin">Admin</option>
                          </select>
                        </td>
                        <td className="px-4 py-4">
                          <span
                            className={[
                              'rounded-full px-3 py-1 text-xs font-semibold',
                              user.access === 'active'
                                ? 'bg-emerald-50 text-emerald-600'
                                : 'bg-red-50 text-red-600',
                            ].join(' ')}
                          >
                            {user.access}
                          </span>
                        </td>
                        <td className="px-4 py-4 text-gray-600">
                          {user.created_at ? formatDateTime(user.created_at) : '—'}
                        </td>
                        <td className="px-4 py-4 text-gray-600">
                          {user.last_sign_in_at ? formatDateTime(user.last_sign_in_at) : '—'}
                        </td>
                        <td className="px-4 py-4">
                          <button
                            type="button"
                            disabled={isUpdating}
                            onClick={() =>
                              updateUser(user.id, {
                                access: user.access === 'active' ? 'revoked' : 'active',
                              })
                            }
                            className={[
                              'rounded-lg border px-3 py-2 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-50',
                              user.access === 'active'
                                ? 'border-red-200 text-red-600 hover:bg-red-50'
                                : 'border-emerald-200 text-emerald-600 hover:bg-emerald-50',
                            ].join(' ')}
                          >
                            {user.access === 'active' ? 'Revoke access' : 'Restore access'}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {users.length === 0 ? (
                <div className="p-8 text-center text-gray-500">No users found.</div>
              ) : null}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
