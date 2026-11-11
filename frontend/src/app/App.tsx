import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  GameControllerIcon,
  ListIcon,
  SquaresFourIcon,
  TrophyIcon,
} from '@phosphor-icons/react';
import type {
  AuthUser,
  FilterCategory,
  Game,
  Library,
  LoginInput,
  Review,
  SignUpInput,
  UserGame,
  UserTrackingStatus,
} from '../shared/domain/game';
import { STATUS, STATUSES } from '../shared/domain/status';
import {
  deleteMyReview,
  getCurrentUser,
  getGameReviews,
  getGames,
  getLibrary,
  isUsingMockData,
  logIn,
  logOut,
  newUserGame,
  saveMyReview,
  saveUserGame,
  signUp,
} from '../shared/api/api';
import { ActivityView } from '../features/activity';
import { AuthModal, type AuthMode } from '../features/auth';
import { MediaHero } from '../features/game-detail';
import {
  COLLECTION,
  DEFAULT_FILTERS,
  FilterBar,
  GameGrid,
  GameListView,
  Pagination,
  SORT,
  SORTS,
  Sidebar,
  applyFilters,
  countCategories,
  countCollections,
  countStatuses,
  genreOptions,
  paginate,
  type FilterBarState,
} from '../features/library';
import { TrackingModal } from '../features/tracking';
import { PixelWaves } from './PixelWaves';
import { TopBar } from './TopBar';

/** Page heading for the current sidebar selection. */
function pageTitle(
  category: FilterCategory,
  collection: string | null,
  status: UserTrackingStatus | null
): string {
  if (collection) return COLLECTION[collection]?.label ?? collection;
  const statusLabel = status ? STATUS[status].label : null;
  if (category === 'my-games') return statusLabel ? `My Games — ${statusLabel}` : 'My Games';
  if (category === 'favorites') return 'Favorites';
  return statusLabel ?? 'All Games';
}

/** Loads the full game catalog across API pages (up to 100 rows per request). */
async function loadAllCatalogGames(): Promise<Game[]> {
  const PAGE_LIMIT = 100;
  const first = await getGames({ page: 1, limit: PAGE_LIMIT });
  if (first.length < PAGE_LIMIT) return first;

  const all = [...first];
  let page = 2;
  while (true) {
    const batch = await getGames({ page, limit: PAGE_LIMIT });
    all.push(...batch);
    if (batch.length < PAGE_LIMIT) break;
    page += 1;
  }
  return all;
}

/**
 * Root component and the only stateful owner of the app's data.
 * - Loads catalog, auth session, library and game reviews through shared/api/api.ts.
 * - Owns view state (library vs activity, open game, modals, pagination, grid/list) and filters.
 * - Every write persists through api.ts so the API/mock store stays the single source of truth.
 */
export const App: React.FC = () => {
  // Catalog & user data
  const [games, setGames] = useState<Game[]>([]);
  const [library, setLibrary] = useState<Library>({});
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [authRequired, setAuthRequired] = useState(false);
  const [usingMocks, setUsingMocks] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Reviews for the currently selected game
  const [selectedGame, setSelectedGame] = useState<Game | null>(null);
  const [reviewsState, setReviewsState] = useState<{
    gameId: string | null;
    items: Review[];
    error: string | null;
  }>({ gameId: null, items: [], error: null });

  // View & modal state
  const [activeView, setActiveView] = useState<'library' | 'activity'>('library');
  const [trackingTarget, setTrackingTarget] = useState<Game | null>(null);
  const [authMode, setAuthMode] = useState<AuthMode | null>(null);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  // Library query + pagination
  const [filterState, setFilterState] = useState<FilterBarState>(DEFAULT_FILTERS);
  const [sidebarCategory, setSidebarCategory] = useState<FilterCategory>('all');
  const [selectedGenre, setSelectedGenre] = useState<string | null>(null);
  const [activeTrackingFilter, setActiveTrackingFilter] = useState<UserTrackingStatus | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const PAGE_SIZE = 12;

  const loadLibrarySafe = useCallback(async () => {
    try {
      const nextLibrary = await getLibrary();
      setLibrary(nextLibrary);
      setAuthRequired(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      if (/authentication required/i.test(msg)) {
        setLibrary({});
        setAuthRequired(true);
      } else {
        throw err;
      }
    }
  }, []);

  useEffect(() => {
    let active = true;
    Promise.all([loadAllCatalogGames(), getCurrentUser()])
      .then(async ([loadedGames, user]) => {
        if (!active) return;
        setGames(loadedGames);
        setCurrentUser(user);
        setUsingMocks(isUsingMockData());
        await loadLibrarySafe();
        if (!active) return;
        setUsingMocks(isUsingMockData());
      })
      .catch(() => active && setLoadError('Could not load your library.'))
      .finally(() => active && setIsLoading(false));
    return () => {
      active = false;
    };
  }, [loadLibrarySafe]);

  // Fetch reviews whenever a game detail page is open
  const refreshReviews = useCallback(async (gameId: string) => {
    try {
      const list = await getGameReviews(gameId);
      setReviewsState({ gameId, items: list, error: null });
    } catch (err) {
      setReviewsState({
        gameId,
        items: [],
        error: err instanceof Error ? err.message : 'Could not load reviews.',
      });
    }
  }, []);

  useEffect(() => {
    if (!selectedGame) return;
    let active = true;
    const targetId = selectedGame.id;
    getGameReviews(targetId)
      .then((list) => {
        if (active) setReviewsState({ gameId: targetId, items: list, error: null });
      })
      .catch((err) => {
        if (active) {
          setReviewsState({
            gameId: targetId,
            items: [],
            error: err instanceof Error ? err.message : 'Could not load reviews.',
          });
        }
      });
    return () => {
      active = false;
    };
  }, [selectedGame]);

  // Navigation helpers (reset page to 1 when narrowing filters)
  const showCategory = (cat: FilterCategory) => {
    setActiveView('library');
    setSelectedGame(null);
    setSidebarCategory(cat);
    setSelectedGenre(null);
    setActiveTrackingFilter(null);
    setCurrentPage(1);
  };

  const handleSelectGenre = (genre: string | null) => {
    setActiveView('library');
    setSelectedGame(null);
    setSelectedGenre(genre);
    setActiveTrackingFilter(null);
    setCurrentPage(1);
  };

  const handleSelectTrackingFilter = (status: UserTrackingStatus | null) => {
    setActiveView('library');
    setSelectedGame(null);
    setActiveTrackingFilter(status);
    setCurrentPage(1);
  };

  const handleFilterBarChange = (next: FilterBarState) => {
    setActiveView('library');
    setFilterState(next);
    setCurrentPage(1);
  };

  const handleOpenActivity = () => {
    setSelectedGame(null);
    setActiveView('activity');
  };

  // Global Keyboard Shortcuts (Ctrl+K and Escape)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        const searchInput = document.getElementById('global-search-input');
        searchInput?.focus();
      }
      // Native <dialog> modals handle their own Escape.
      if (e.key === 'Escape' && !trackingTarget && !authMode) setSelectedGame(null);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [trackingTarget, authMode]);

  // Library mutations
  const persist = async (gameId: string, changes: Partial<UserGame>) => {
    const saved = await saveUserGame(gameId, changes);
    setLibrary((prev) => ({ ...prev, [gameId]: saved }));
    if (selectedGame?.id === gameId) {
      void refreshReviews(gameId);
    }
  };

  const handleToggleFavorite = (e: React.MouseEvent, gameId: string) => {
    e.stopPropagation();
    const isFavorite = !library[gameId]?.isFavorite;
    const setFavorite = (value: boolean) =>
      setLibrary((prev) => ({
        ...prev,
        [gameId]: { ...(prev[gameId] ?? newUserGame(gameId)), isFavorite: value },
      }));
    setFavorite(isFavorite);
    persist(gameId, { isFavorite }).catch(() => {
      setFavorite(!isFavorite);
      setNotice('Could not update favorites. Please try again.');
    });
  };

  // Auth handlers
  const handleLogIn = async (input: LoginInput) => {
    const user = await logIn(input);
    setCurrentUser(user);
    setUsingMocks(isUsingMockData());
    await loadLibrarySafe();
    setNotice(null);
    if (selectedGame) await refreshReviews(selectedGame.id);
  };

  const handleSignUp = async (input: SignUpInput) => {
    const user = await signUp(input);
    setCurrentUser(user);
    setUsingMocks(isUsingMockData());
    await loadLibrarySafe();
    setNotice(null);
    if (selectedGame) await refreshReviews(selectedGame.id);
  };

  const handleLogOut = async () => {
    try {
      await logOut();
      setCurrentUser(null);
      setUsingMocks(isUsingMockData());
      await loadLibrarySafe();
      if (selectedGame) await refreshReviews(selectedGame.id);
    } catch {
      setNotice('Could not log out right now. Please try again.');
    }
  };

  // Review handlers
  const handleSaveReview = async (body: string) => {
    if (!selectedGame) return;
    await saveMyReview(selectedGame.id, body);
    await refreshReviews(selectedGame.id);
  };

  const handleDeleteReview = async () => {
    if (!selectedGame) return;
    await deleteMyReview(selectedGame.id);
    await refreshReviews(selectedGame.id);
  };

  // Derived data & pagination
  const filteredAndSortedGames = useMemo(
    () =>
      applyFilters(games, library, {
        category: sidebarCategory,
        collection: selectedGenre,
        trackingStatus: activeTrackingFilter,
        filters: filterState,
      }),
    [games, library, sidebarCategory, selectedGenre, activeTrackingFilter, filterState]
  );

  const paged = useMemo(
    () => paginate(filteredAndSortedGames, currentPage, PAGE_SIZE),
    [filteredAndSortedGames, currentPage]
  );

  const availableGenres = useMemo(() => genreOptions(games), [games]);
  const genreCounts = useMemo(() => countCollections(games, library), [games, library]);
  const trackingStatusCounts = useMemo(() => countStatuses(games, library), [games, library]);
  const categoryCounts = useMemo(() => countCategories(games, library), [games, library]);
  const activeSort = SORT[filterState.sort];

  const handlePageChange = (nextPage: number) => {
    setCurrentPage(nextPage);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const reviewsLoading = selectedGame !== null && reviewsState.gameId !== selectedGame.id;
  const activeReviews =
    selectedGame && reviewsState.gameId === selectedGame.id ? reviewsState.items : [];
  const activeReviewsError =
    selectedGame && reviewsState.gameId === selectedGame.id ? reviewsState.error : null;

  return (
    <div className="min-h-screen text-ink flex flex-col font-sans selection:bg-accent selection:text-canvas">
      {/* Decorative pixel ripples. No bg on this wrapper so the canvas shows through. */}
      <PixelWaves />

      {/* TopBar with Geekbond Branding, Search & Real Account Auth */}
      <TopBar
        searchQuery={filterState.search}
        setSearchQuery={(q) => handleFilterBarChange({ ...filterState, search: q })}
        currentUser={currentUser}
        onOpenAuth={setAuthMode}
        onLogOut={handleLogOut}
        onOpenActivity={handleOpenActivity}
      />

      <div className="flex-1 flex">
        {/* Left Sidebar */}
        <Sidebar
          currentCategory={sidebarCategory}
          onSelectCategory={showCategory}
          selectedGenre={selectedGenre}
          onSelectGenre={handleSelectGenre}
          myGamesCount={categoryCounts['my-games']}
          favoritesCount={categoryCounts.favorites}
          totalCount={categoryCounts.all}
          genreCounts={genreCounts}
          activeTrackingFilter={activeTrackingFilter}
          onSelectTrackingFilter={handleSelectTrackingFilter}
          trackingStatusCounts={trackingStatusCounts}
          activeView={activeView}
          onSelectActivity={handleOpenActivity}
        />

        {/* Dynamic Viewport */}
        <main className="flex-1 min-w-0 px-4 sm:px-6 lg:px-8 py-6">
          {notice && (
            <div
              role="alert"
              className="mb-4 flex items-center justify-between gap-4 rounded-xl border border-rose-400/40 bg-surface px-4 py-3 text-sm text-ink"
            >
              {notice}
              <button type="button" onClick={() => setNotice(null)} className="text-muted hover:text-ink">
                Dismiss
              </button>
            </div>
          )}

          {authRequired && !currentUser && !isLoading && (
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-accent/40 bg-surface px-4 py-3 text-sm">
              <span className="text-muted">
                Log in or sign up to load and save your personal game library, achievements, and reviews.
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setAuthMode('login')}
                  className="px-3 py-1 rounded-lg bg-elevated text-ink text-xs font-semibold hover:text-accent"
                >
                  Log in
                </button>
                <button
                  type="button"
                  onClick={() => setAuthMode('signup')}
                  className="px-3 py-1 rounded-lg bg-accent text-canvas text-xs font-semibold hover:bg-accent-hover"
                >
                  Sign up
                </button>
              </div>
            </div>
          )}

          {isLoading || loadError ? (
            <p role={loadError ? 'alert' : 'status'} className="py-20 text-center text-sm text-muted">
              {loadError ?? 'Loading your library…'}
            </p>
          ) : selectedGame ? (
            /* Comprehensive Media Hub with Reviews, Achievements & Activity */
            <MediaHero
              game={selectedGame}
              onBack={() => setSelectedGame(null)}
              onOpenTrack={() => setTrackingTarget(selectedGame)}
              userGame={library[selectedGame.id]}
              onQuickUpdateUserGame={(changes) => persist(selectedGame.id, changes)}
              reviews={activeReviews}
              reviewsLoading={reviewsLoading}
              reviewsError={activeReviewsError}
              currentUser={currentUser}
              authRequired={authRequired}
              onOpenAuth={setAuthMode}
              onSaveReview={handleSaveReview}
              onDeleteReview={handleDeleteReview}
            />
          ) : activeView === 'activity' ? (
            /* Achievements & Activity History Dashboard */
            <ActivityView
              games={games}
              library={library}
              onSelectGame={setSelectedGame}
              onOpenTrack={setTrackingTarget}
            />
          ) : (
            <>
              {/* Page header: title + count, view toggle, then one compact filter row */}
              <div className="mb-6 space-y-4">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-baseline gap-3 min-w-0">
                    <h1 className="text-2xl font-black tracking-tight text-ink truncate">
                      {pageTitle(sidebarCategory, selectedGenre, activeTrackingFilter)}
                    </h1>
                    <span className="shrink-0 text-sm font-mono text-muted">
                      {filteredAndSortedGames.length} games
                    </span>
                  </div>

                  {/* Grid / List View Toggle */}
                  <div className="flex items-center bg-surface p-1 rounded-xl border border-line shrink-0">
                    <button
                      onClick={() => setViewMode('grid')}
                      aria-label="Grid view"
                      aria-pressed={viewMode === 'grid'}
                      className={`p-1.5 rounded-lg transition-colors ${
                        viewMode === 'grid' ? 'bg-accent text-canvas' : 'text-muted hover:text-ink'
                      }`}
                    >
                      <SquaresFourIcon className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setViewMode('list')}
                      aria-label="List view"
                      aria-pressed={viewMode === 'list'}
                      className={`p-1.5 rounded-lg transition-colors ${
                        viewMode === 'list' ? 'bg-accent text-canvas' : 'text-muted hover:text-ink'
                      }`}
                    >
                      <ListIcon className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Mobile navigation pills (sidebar is hidden below md) */}
                <div className="md:hidden flex gap-2 overflow-x-auto">
                  {(
                    [
                      ['all', 'All Games'],
                      ['my-games', 'My Games'],
                      ['favorites', 'Favorites'],
                    ] as [FilterCategory, string][]
                  ).map(([cat, label]) => (
                    <button
                      key={cat}
                      aria-pressed={sidebarCategory === cat}
                      onClick={() => showCategory(cat)}
                      className={`shrink-0 text-sm px-3 py-1.5 rounded-xl ${
                        sidebarCategory === cat
                          ? 'bg-elevated text-accent font-semibold'
                          : 'text-muted'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                  <button
                    onClick={handleOpenActivity}
                    className="shrink-0 inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-xl text-muted hover:text-ink"
                  >
                    <TrophyIcon className="w-4 h-4 text-yellow-400" />
                    Activity
                  </button>
                </div>

                <FilterBar
                  filters={filterState}
                  onChange={handleFilterBarChange}
                  availableGenres={availableGenres}
                  status={activeTrackingFilter}
                  onStatusChange={handleSelectTrackingFilter}
                />
              </div>

              {/* Empty State */}
              {filteredAndSortedGames.length === 0 ? (
                <div className="py-20 text-center flex flex-col items-center justify-center rounded-2xl bg-surface border border-line p-8">
                  <GameControllerIcon className="w-12 h-12 text-accent mb-3" />
                  <h3 className="text-base font-bold text-ink">
                    {sidebarCategory === 'my-games'
                      ? 'No games tracked under this status'
                      : 'No games match your filters'}
                  </h3>
                  <p className="text-sm text-muted mt-1 max-w-sm">
                    {sidebarCategory === 'my-games'
                      ? 'Use the + button on any game to start tracking it.'
                      : 'Nothing matches the current search and filters.'}
                  </p>
                  <button
                    onClick={() => {
                      setFilterState(DEFAULT_FILTERS);
                      showCategory('all');
                    }}
                    className="mt-4 text-sm px-4 py-2 rounded-xl font-semibold bg-accent text-canvas hover:bg-accent-hover"
                  >
                    Show All Games
                  </button>
                </div>
              ) : (
                <>
                  {viewMode === 'list' ? (
                    /* Management Table View */
                    <GameListView
                      games={paged.items}
                      library={library}
                      onSelectGame={setSelectedGame}
                      onToggleFavorite={handleToggleFavorite}
                      sortField={activeSort.field}
                      sortDirection={activeSort.dir}
                      onSortChange={(field) => {
                        const sort = SORTS.find((s) => s.field === field);
                        if (sort) handleFilterBarChange({ ...filterState, sort: sort.id });
                      }}
                    />
                  ) : sidebarCategory === 'my-games' && activeTrackingFilter === null ? (
                    /* Divided Sub-lists by Status in My Games */
                    <div className="space-y-10">
                      {STATUSES.map((sec) => {
                        const secGames = paged.items.filter((g) => library[g.id]?.status === sec.id);
                        if (secGames.length === 0) return null;
                        return (
                          <section key={sec.id} className="space-y-4">
                            <div className="flex items-center gap-2.5">
                              <sec.icon weight="fill" className={`w-5 h-5 ${sec.text}`} aria-hidden />
                              <h2 className="text-lg font-semibold text-ink">{sec.label}</h2>
                              <span className="text-sm font-mono text-muted">{secGames.length}</span>
                            </div>
                            <GameGrid
                              games={secGames}
                              library={library}
                              onSelect={setSelectedGame}
                              onOpenTrack={setTrackingTarget}
                            />
                          </section>
                        );
                      })}
                    </div>
                  ) : (
                    <GameGrid
                      games={paged.items}
                      library={library}
                      onSelect={setSelectedGame}
                      onOpenTrack={setTrackingTarget}
                    />
                  )}

                  {/* Library Bottom Pagination */}
                  <Pagination
                    currentPage={paged.page}
                    totalItems={filteredAndSortedGames.length}
                    pageSize={PAGE_SIZE}
                    onPageChange={handlePageChange}
                  />
                </>
              )}
            </>
          )}

          {/* User Tracking Drawer Modal */}
          {trackingTarget && (
            <TrackingModal
              key={trackingTarget.id}
              game={trackingTarget}
              onClose={() => setTrackingTarget(null)}
              userGame={library[trackingTarget.id]}
              onSave={(changes) => persist(trackingTarget.id, changes)}
            />
          )}

          {/* Sign-up & Log-in Modal */}
          {authMode && (
            <AuthModal
              key={authMode}
              initialMode={authMode}
              onClose={() => setAuthMode(null)}
              onLogIn={handleLogIn}
              onSignUp={handleSignUp}
              isDemoMode={usingMocks}
            />
          )}
        </main>
      </div>

      {/* Footer with required RAWG attribution */}
      <footer className="border-t border-line bg-surface/80 backdrop-blur-sm px-4 sm:px-6 lg:px-8 py-4 text-xs text-muted flex flex-col sm:flex-row items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <span>Geekbond — Video Game Library &amp; Play Tracker</span>
          {usingMocks && (
            <span className="px-2 py-0.5 rounded-md bg-elevated border border-line font-mono text-[11px] text-muted">
              Demo Data
            </span>
          )}
        </div>
        <a
          href="https://rawg.io"
          target="_blank"
          rel="noopener noreferrer"
          className="text-muted hover:text-accent underline underline-offset-4 transition-colors"
        >
          Data from RAWG
        </a>
      </footer>
    </div>
  );
};

export default App;
