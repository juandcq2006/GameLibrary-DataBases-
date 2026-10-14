import React, { useState, useEffect, useMemo } from 'react';
import {
  LayoutGrid,
  List as ListIcon,
  Gamepad2,
} from 'lucide-react';
import type { Game, FilterCategory, UserTrackEntry, UserTrackingStatus } from './types/game';
import { mockGames } from './data/mockGames';
import { TopBar } from './components/layout/TopBar';
import { Sidebar } from './components/layout/Sidebar';
import { FilterBar } from './components/discover/FilterBar';
import type { FilterBarState } from './components/discover/FilterBar';
import { MediaCard } from './components/discover/MediaCard';
import { MediaHero } from './components/media-detail/MediaHero';
import { TrackingModal } from './components/tracker/TrackingModal';
import { GameListView } from './components/library/GameListView';

export const App: React.FC = () => {
  // Main Games State
  const [games, setGames] = useState<Game[]>(mockGames);
  const [selectedGame, setSelectedGame] = useState<Game | null>(null);
  const [trackingTarget, setTrackingTarget] = useState<Game | null>(null);
  const [userTracks, setUserTracks] = useState<Record<string, UserTrackEntry>>({
    'cyberpunk-2077': {
      gameId: 'cyberpunk-2077',
      status: 'CURRENT',
      score: 95,
      progress: 142,
      notes: 'Playing through the Phantom Liberty espionage expansion.',
      updatedAt: new Date().toISOString(),
    },
    'elden-ring': {
      gameId: 'elden-ring',
      status: 'COMPLETED',
      score: 98,
      progress: 218,
      notes: 'Completed Shadow of the Erdtree DLC 100%.',
      updatedAt: new Date().toISOString(),
    },
  });

  // Filter Bar State (Pure Video Games)
  const [filterState, setFilterState] = useState<FilterBarState>({
    search: '',
    genre: '',
    year: '',
    platform: '',
    status: '',
    sort: 'SCORE_DESC',
  });

  // View & Category State
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [sidebarCategory, setSidebarCategory] = useState<FilterCategory>('all');
  const [selectedGenre, setSelectedGenre] = useState<string | null>(null);
  const [activeTrackingFilter, setActiveTrackingFilter] = useState<UserTrackingStatus | null>(null);

  // Light / Dark Theme State
  const [isDarkMode, setIsDarkMode] = useState<boolean>(() => {
    const saved = localStorage.getItem('geekbond-theme');
    return saved ? saved === 'dark' : true;
  });

  // Apply theme class to <html>
  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
      document.documentElement.classList.remove('light');
      localStorage.setItem('geekbond-theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      document.documentElement.classList.add('light');
      localStorage.setItem('geekbond-theme', 'light');
    }
  }, [isDarkMode]);

  // Global Keyboard Shortcuts (Ctrl+K and Escape)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        const searchInput = document.getElementById('global-search-input');
        searchInput?.focus();
      }
      if (e.key === 'Escape') {
        if (trackingTarget) {
          setTrackingTarget(null);
        } else if (selectedGame) {
          setSelectedGame(null);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedGame, trackingTarget]);

  // Actions
  const handleToggleFavorite = (e: React.MouseEvent, gameId: string) => {
    e.stopPropagation();
    setGames((prev) =>
      prev.map((g) => (g.id === gameId ? { ...g, isFavorite: !g.isFavorite } : g))
    );
  };

  const handleToggleInstall = (e: React.MouseEvent, gameId: string) => {
    e.stopPropagation();
    setGames((prev) =>
      prev.map((g) => {
        if (g.id === gameId) {
          const next = !g.isInstalled;
          return {
            ...g,
            isInstalled: next,
            lastPlayed: next ? 'Just now' : g.lastPlayed,
          };
        }
        return g;
      })
    );

    if (selectedGame && selectedGame.id === gameId) {
      setSelectedGame((prev) =>
        prev
          ? {
              ...prev,
              isInstalled: !prev.isInstalled,
              lastPlayed: !prev.isInstalled ? 'Just now' : prev.lastPlayed,
            }
          : null
      );
    }
  };

  // Tracking Entry Handlers
  const handleSaveTrack = (entry: UserTrackEntry) => {
    setUserTracks((prev) => ({
      ...prev,
      [entry.gameId]: entry,
    }));
  };

  const handleDeleteTrack = (gameId: string) => {
    setUserTracks((prev) => {
      const copy = { ...prev };
      delete copy[gameId];
      return copy;
    });
  };

  // Filtered & Sorted Games List
  const filteredAndSortedGames = useMemo(() => {
    let result = [...games];

    // Sidebar Category (All vs Favorites)
    if (sidebarCategory === 'favorites') {
      result = result.filter((g) => g.isFavorite);
    }

    // Sidebar Collections / Genres
    if (selectedGenre) {
      if (selectedGenre === 'Backlog') {
        result = result.filter((g) => g.hoursPlayed === 0 || g.lastPlayed === 'Never');
      } else {
        result = result.filter((g) =>
          g.genres.some((genre) => genre.toLowerCase().includes(selectedGenre.toLowerCase()))
        );
      }
    }

    // Tracking Status quick filter
    if (activeTrackingFilter) {
      result = result.filter((g) => userTracks[g.id]?.status === activeTrackingFilter);
    }

    // FilterBar: Genre
    if (filterState.genre) {
      result = result.filter((g) =>
        g.genres.some((genre) => genre.toLowerCase().includes(filterState.genre.toLowerCase()))
      );
    }

    // FilterBar: Release Year
    if (filterState.year) {
      if (filterState.year === '2020s') {
        result = result.filter((g) => g.releaseYear >= 2020);
      } else if (filterState.year === '2010s') {
        result = result.filter((g) => g.releaseYear < 2020);
      } else {
        const yr = parseInt(filterState.year, 10);
        result = result.filter((g) => g.releaseYear === yr);
      }
    }

    // FilterBar: Platform
    if (filterState.platform) {
      result = result.filter((g) => g.format === filterState.platform);
    }

    // FilterBar: Install Status
    if (filterState.status) {
      if (filterState.status === 'INSTALLED') {
        result = result.filter((g) => g.isInstalled);
      } else if (filterState.status === 'CLOUD') {
        result = result.filter((g) => !g.isInstalled);
      }
    }

    // Search query
    if (filterState.search.trim()) {
      const q = filterState.search.toLowerCase().trim();
      result = result.filter(
        (g) =>
          g.title.toLowerCase().includes(q) ||
          g.developer.toLowerCase().includes(q) ||
          g.publisher.toLowerCase().includes(q) ||
          g.genres.some((genre) => genre.toLowerCase().includes(q))
      );
    }

    // Sorting
    result.sort((a, b) => {
      if (filterState.sort === 'SCORE_DESC') {
        return b.averageScore - a.averageScore;
      }
      if (filterState.sort === 'HOURS_DESC') {
        return b.hoursPlayed - a.hoursPlayed;
      }
      if (filterState.sort === 'POPULARITY_DESC') {
        return b.popularity - a.popularity;
      }
      if (filterState.sort === 'STORAGE_DESC') {
        return b.storageGb - a.storageGb;
      }
      if (filterState.sort === 'TITLE_ASC') {
        return a.title.localeCompare(b.title);
      }
      if (filterState.sort === 'YEAR_DESC') {
        return b.releaseYear - a.releaseYear;
      }
      return b.averageScore - a.averageScore;
    });

    return result;
  }, [
    games,
    sidebarCategory,
    selectedGenre,
    activeTrackingFilter,
    filterState,
    userTracks,
  ]);

  // Available Genres
  const availableGenres = useMemo(() => {
    const set = new Set<string>();
    games.forEach((g) => g.genres.forEach((genre) => set.add(genre)));
    return Array.from(set).sort();
  }, [games]);

  // Metrics
  const installedGames = useMemo(() => games.filter((g) => g.isInstalled), [games]);
  const favoriteGames = useMemo(() => games.filter((g) => g.isFavorite), [games]);
  const totalInstalledStorage = useMemo(
    () => installedGames.reduce((acc, curr) => acc + curr.storageGb, 0),
    [installedGames]
  );

  return (
    <div className="min-h-screen bg-[#0B141E] dark:bg-[#0B141E] light:bg-[#F1F5F9] text-[#F1F5F9] dark:text-[#F1F5F9] light:text-[#0F172A] flex flex-col font-sans transition-colors selection:bg-[#00FFD1] selection:text-[#0B141E]">
      {/* TopBar with Geekbond Branding and Search */}
      <TopBar
        searchQuery={filterState.search}
        setSearchQuery={(q) => setFilterState((prev) => ({ ...prev, search: q }))}
        isDarkMode={isDarkMode}
        toggleDarkMode={() => setIsDarkMode((prev) => !prev)}
        totalGamesCount={games.length}
      />

      <div className="flex-1 flex overflow-hidden">
        {/* Left Sidebar (Installed button eliminated) */}
        <Sidebar
          currentCategory={sidebarCategory}
          onSelectCategory={(cat) => {
            setSidebarCategory(cat);
            setSelectedGenre(null);
            setActiveTrackingFilter(null);
          }}
          selectedGenre={selectedGenre}
          onSelectGenre={(genre) => {
            setSelectedGenre(genre);
            setActiveTrackingFilter(null);
          }}
          installedCount={installedGames.length}
          favoritesCount={favoriteGames.length}
          totalCount={games.length}
          installedStorageGb={totalInstalledStorage}
        />

        {/* Dynamic Viewport */}
        <main className="flex-1 overflow-y-auto px-4 sm:px-6 lg:px-8 py-6">
          {selectedGame ? (
            /* Comprehensive Media Hub */
            <MediaHero
              game={selectedGame}
              onBack={() => setSelectedGame(null)}
              onOpenTrack={() => setTrackingTarget(selectedGame)}
              currentTrack={userTracks[selectedGame.id]}
              onToggleInstall={() => {
                handleToggleInstall({} as React.MouseEvent, selectedGame.id);
              }}
            />
          ) : (
            <>
              {/* Multi-faceted Filter Bar */}
              <FilterBar
                filters={filterState}
                onChange={setFilterState}
                availableGenres={availableGenres}
              />

              {/* Viewport Header */}
              <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#22354B] dark:border-[#22354B] light:border-[#CBD5E1]">
                <div>
                  <div className="flex items-center gap-3">
                    <h1 className="text-2xl font-black tracking-tight text-[#F1F5F9] dark:text-[#F1F5F9] light:text-[#0F172A]">
                      {selectedGenre
                        ? `${selectedGenre} Titles`
                        : sidebarCategory === 'favorites'
                        ? 'Favorite Titles'
                        : 'Game Library & Catalog'}
                    </h1>
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-[#131F2E] dark:bg-[#131F2E] light:bg-white text-[#00FFD1] dark:text-[#00FFD1] light:text-[#00897B] border border-[#22354B] dark:border-[#22354B] light:border-[#CBD5E1] shadow-sm">
                      {filteredAndSortedGames.length} games
                    </span>
                  </div>

                  {/* Play Tracking Status Quick Filters */}
                  <div className="flex items-center gap-2 mt-2.5 flex-wrap">
                    <button
                      onClick={() => setActiveTrackingFilter(null)}
                      className={`text-xs px-3 py-1 rounded-xl font-bold transition-all ${
                        activeTrackingFilter === null
                          ? 'bg-[#00FFD1] text-[#0B141E] shadow-[0_0_15px_rgba(0,255,209,0.35)]'
                          : 'bg-[#131F2E] dark:bg-[#131F2E] light:bg-white text-[#8BA0B2] dark:text-[#8BA0B2] light:text-[#64748B] hover:text-[#00FFD1] border border-[#22354B] dark:border-[#22354B] light:border-[#CBD5E1]'
                      }`}
                    >
                      All Games
                    </button>
                    {(['CURRENT', 'PLANNING', 'COMPLETED', 'PAUSED', 'DROPPED'] as UserTrackingStatus[]).map(
                      (st) => {
                        const count = Object.values(userTracks).filter((t) => t.status === st).length;
                        const labelMap: Record<UserTrackingStatus, string> = {
                          CURRENT: 'Playing',
                          PLANNING: 'Plan to Play',
                          COMPLETED: 'Completed',
                          PAUSED: 'On Hold',
                          DROPPED: 'Dropped',
                        };
                        return (
                          <button
                            key={st}
                            onClick={() =>
                              setActiveTrackingFilter((prev) => (prev === st ? null : st))
                            }
                            className={`text-xs px-3 py-1 rounded-xl font-semibold flex items-center gap-1.5 transition-all ${
                              activeTrackingFilter === st
                                ? 'bg-[#00FFD1] text-[#0B141E] font-bold shadow-[0_0_15px_rgba(0,255,209,0.35)]'
                                : 'bg-[#131F2E] dark:bg-[#131F2E] light:bg-white text-[#8BA0B2] dark:text-[#8BA0B2] light:text-[#64748B] hover:text-[#00FFD1] border border-[#22354B] dark:border-[#22354B] light:border-[#CBD5E1]'
                            }`}
                          >
                            <span>{labelMap[st]}</span>
                            <span className="font-mono text-[10px] opacity-75">({count})</span>
                          </button>
                        );
                      }
                    )}
                  </div>
                </div>

                {/* Grid / List View Toggle */}
                <div className="flex items-center bg-[#131F2E] dark:bg-[#131F2E] light:bg-white p-1 rounded-xl border border-[#22354B] dark:border-[#22354B] light:border-[#CBD5E1] self-start sm:self-auto shadow-sm">
                  <button
                    onClick={() => setViewMode('grid')}
                    className={`p-1.5 rounded-lg transition-all ${
                      viewMode === 'grid'
                        ? 'bg-[#00FFD1] text-[#0B141E] shadow-[0_0_12px_rgba(0,255,209,0.4)]'
                        : 'text-[#8BA0B2] dark:text-[#8BA0B2] light:text-[#64748B] hover:text-[#00FFD1]'
                    }`}
                    title="Grid View (Poster Wall)"
                  >
                    <LayoutGrid className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setViewMode('list')}
                    className={`p-1.5 rounded-lg transition-all ${
                      viewMode === 'list'
                        ? 'bg-[#00FFD1] text-[#0B141E] shadow-[0_0_12px_rgba(0,255,209,0.4)]'
                        : 'text-[#8BA0B2] dark:text-[#8BA0B2] light:text-[#64748B] hover:text-[#00FFD1]'
                    }`}
                    title="List View (Management Table)"
                  >
                    <ListIcon className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Empty State */}
              {filteredAndSortedGames.length === 0 ? (
                <div className="py-20 text-center flex flex-col items-center justify-center rounded-2xl bg-[#131F2E] dark:bg-[#131F2E] light:bg-white border border-[#22354B] dark:border-[#22354B] light:border-[#CBD5E1] p-8 shadow-sm">
                  <Gamepad2 className="w-12 h-12 text-[#00FFD1] mb-3" />
                  <h3 className="text-base font-bold text-[#F1F5F9] dark:text-[#F1F5F9] light:text-[#0F172A]">No games match your filters</h3>
                  <p className="text-xs text-[#8BA0B2] dark:text-[#8BA0B2] light:text-[#64748B] mt-1 max-w-sm">
                    Try clearing search criteria, selecting &apos;All Genres&apos;, or resetting active filter chips.
                  </p>
                </div>
              ) : viewMode === 'list' ? (
                /* Management Table View */
                <GameListView
                  games={filteredAndSortedGames}
                  onSelectGame={setSelectedGame}
                  onToggleFavorite={handleToggleFavorite}
                  onToggleInstall={handleToggleInstall}
                  sortField="title"
                  sortDirection="asc"
                  onSortChange={() => {}}
                />
              ) : (
                /* Standardized 2:3 Card Wall */
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-4 md:gap-5">
                  {filteredAndSortedGames.map((game) => (
                    <MediaCard
                      key={game.id}
                      game={game}
                      onSelect={setSelectedGame}
                      onOpenTrack={() => setTrackingTarget(game)}
                      trackingStatus={userTracks[game.id]?.status}
                    />
                  ))}
                </div>
              )}
            </>
          )}

          {/* User Tracking Drawer Modal */}
          {trackingTarget && (
            <TrackingModal
              game={trackingTarget}
              isOpen={Boolean(trackingTarget)}
              onClose={() => setTrackingTarget(null)}
              currentEntry={userTracks[trackingTarget.id]}
              onSave={handleSaveTrack}
              onDelete={handleDeleteTrack}
            />
          )}
        </main>
      </div>
    </div>
  );
};

export default App;
