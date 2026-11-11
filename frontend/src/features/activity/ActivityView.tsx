import React, { useMemo, useState } from 'react';
import {
  ClockCounterClockwiseIcon,
  ClockIcon,
  GameControllerIcon,
  HeartIcon,
  StarIcon,
  TrophyIcon,
} from '@phosphor-icons/react';
import type { Game, Library, UserGame } from '../../shared/domain/game';
import { STATUS } from '../../shared/domain/status';
import { formatDateTime, formatRelativeTime } from '../../shared/lib/dates';
import { Button } from '../../shared/ui/Button';

interface ActivityViewProps {
  games: Game[];
  library: Library;
  onSelectGame: (game: Game) => void;
  onOpenTrack: (game: Game) => void;
}

type AchievementFilter = 'all' | 'in-progress' | 'mastered';

interface ActivityItem {
  game: Game;
  userGame: UserGame;
  timestamp: string;
  actionLabel: string;
}

/**
 * Achievements tracker and chronological activity history derived from the user's `library` rows.
 */
export const ActivityView: React.FC<ActivityViewProps> = ({
  games,
  library,
  onSelectGame,
  onOpenTrack,
}) => {
  const [achievementFilter, setAchievementFilter] = useState<AchievementFilter>('all');

  const stats = useMemo(() => {
    let totalUnlocked = 0;
    let totalAvailable = 0;
    let masteredCount = 0;
    let totalHours = 0;
    let activeGamesCount = 0;

    for (const game of games) {
      const ug = library[game.id];
      if (!ug) continue;
      const unlocked = Math.min(game.achievementsTotal, ug.achievementsUnlocked);
      totalHours += ug.hoursPlayed;
      if (ug.status || ug.hoursPlayed > 0 || unlocked > 0) {
        activeGamesCount++;
        totalUnlocked += unlocked;
        totalAvailable += game.achievementsTotal;
      }
      if (game.achievementsTotal > 0 && unlocked >= game.achievementsTotal) {
        masteredCount++;
      }
    }

    const completionPct = totalAvailable > 0 ? Math.round((totalUnlocked / totalAvailable) * 100) : 0;
    return {
      totalUnlocked,
      totalAvailable,
      completionPct,
      masteredCount,
      totalHours,
      activeGamesCount,
    };
  }, [games, library]);

  const achievementRows = useMemo(() => {
    const rows = games
      .filter((g) => g.achievementsTotal > 0)
      .map((game) => {
        const ug = library[game.id];
        const unlocked = Math.min(game.achievementsTotal, ug?.achievementsUnlocked ?? 0);
        const pct = Math.round((unlocked / game.achievementsTotal) * 100);
        return {
          game,
          userGame: ug,
          unlocked,
          pct,
          isMastered: unlocked >= game.achievementsTotal,
        };
      })
      .filter((row) => {
        if (achievementFilter === 'mastered') return row.isMastered;
        if (achievementFilter === 'in-progress') return row.unlocked > 0 && !row.isMastered;
        return Boolean(row.userGame && (row.unlocked > 0 || row.userGame.status || row.userGame.hoursPlayed > 0));
      })
      .sort((a, b) => b.pct - a.pct || b.unlocked - a.unlocked || a.game.title.localeCompare(b.game.title));
    return rows;
  }, [games, library, achievementFilter]);

  const activityFeed = useMemo<ActivityItem[]>(() => {
    const items: ActivityItem[] = [];
    for (const game of games) {
      const ug = library[game.id];
      if (!ug) continue;
      if (!ug.lastPlayedAt && !ug.status && !ug.isFavorite && ug.hoursPlayed === 0 && ug.achievementsUnlocked === 0) {
        continue;
      }
      const timestamp = ug.lastPlayedAt ?? ug.updatedAt;
      let actionLabel = 'Updated library';
      if (ug.lastPlayedAt) {
        actionLabel = 'Played session';
      } else if (ug.status) {
        actionLabel = `Marked ${STATUS[ug.status].label}`;
      } else if (ug.isFavorite) {
        actionLabel = 'Added to Favorites';
      }
      items.push({ game, userGame: ug, timestamp, actionLabel });
    }
    return items.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  }, [games, library]);

  return (
    <div className="space-y-8 pb-8">
      <div className="space-y-1">
        <h1 className="text-2xl font-black tracking-tight text-ink">Achievements &amp; Activity</h1>
        <p className="text-sm text-muted">
          Track achievement completion across your library and review recent play sessions.
        </p>
      </div>

      {/* Overview Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="p-4 rounded-2xl bg-surface border border-line">
          <span className="text-xs text-muted flex items-center gap-1.5">
            <TrophyIcon className="w-4 h-4 text-accent" />
            Achievements Unlocked
          </span>
          <p className="text-xl font-bold font-mono text-ink mt-1.5">
            {stats.totalUnlocked}{' '}
            <span className="text-xs text-muted font-normal">/ {stats.totalAvailable} ({stats.completionPct}%)</span>
          </p>
        </div>

        <div className="p-4 rounded-2xl bg-surface border border-line">
          <span className="text-xs text-muted flex items-center gap-1.5">
            <TrophyIcon weight="fill" className="w-4 h-4 text-yellow-400" />
            100% Mastered
          </span>
          <p className="text-xl font-bold font-mono text-ink mt-1.5">
            {stats.masteredCount}{' '}
            <span className="text-xs text-muted font-normal">
              {stats.masteredCount === 1 ? 'game' : 'games'}
            </span>
          </p>
        </div>

        <div className="p-4 rounded-2xl bg-surface border border-line">
          <span className="text-xs text-muted flex items-center gap-1.5">
            <ClockIcon className="w-4 h-4 text-accent" />
            Total Time Logged
          </span>
          <p className="text-xl font-bold font-mono text-ink mt-1.5">{stats.totalHours.toFixed(1)} hrs</p>
        </div>

        <div className="p-4 rounded-2xl bg-surface border border-line">
          <span className="text-xs text-muted flex items-center gap-1.5">
            <GameControllerIcon className="w-4 h-4 text-accent" />
            Active Titles
          </span>
          <p className="text-xl font-bold font-mono text-ink mt-1.5">{stats.activeGamesCount}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-start">
        {/* Achievements Panel */}
        <section className="p-5 rounded-2xl bg-surface border border-line space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-base font-semibold text-ink flex items-center gap-2">
              <TrophyIcon className="w-5 h-5 text-accent" />
              Achievement Progress
            </h2>

            <div className="flex items-center gap-1 p-1 rounded-xl bg-canvas border border-line">
              {(
                [
                  ['all', 'Library'],
                  ['in-progress', 'In Progress'],
                  ['mastered', 'Mastered'],
                ] as [AchievementFilter, string][]
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setAchievementFilter(id)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors ${
                    achievementFilter === id ? 'bg-elevated text-accent' : 'text-muted hover:text-ink'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {achievementRows.length === 0 ? (
            <p className="text-sm text-muted py-8 text-center">
              No games match this achievement filter yet.
            </p>
          ) : (
            <ul className="space-y-3">
              {achievementRows.map(({ game, userGame, unlocked, pct, isMastered }) => {
                const status = userGame?.status ? STATUS[userGame.status] : undefined;
                return (
                  <li
                    key={game.id}
                    className="p-3.5 rounded-xl bg-canvas border border-line flex items-center gap-3.5"
                  >
                    <button
                      type="button"
                      onClick={() => onSelectGame(game)}
                      className="shrink-0 rounded-lg overflow-hidden border border-line focus-visible:ring-2 focus-visible:ring-accent"
                      aria-label={`View ${game.title}`}
                    >
                      <img src={game.coverUrl} alt="" className="w-11 h-14 object-cover" loading="lazy" />
                    </button>

                    <div className="flex-1 min-w-0 space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <button
                          type="button"
                          onClick={() => onSelectGame(game)}
                          className="text-sm font-semibold text-ink hover:text-accent truncate text-left"
                        >
                          {game.title}
                        </button>
                        <span className="text-xs font-mono font-bold text-ink shrink-0">
                          {unlocked}/{game.achievementsTotal} ({pct}%)
                        </span>
                      </div>

                      <div
                        className="w-full h-2 rounded-full bg-surface border border-line overflow-hidden"
                        role="progressbar"
                        aria-valuenow={pct}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-label={`${game.title} achievements`}
                      >
                        <div
                          className={`h-full rounded-full transition-all duration-300 ${
                            isMastered ? 'bg-yellow-400' : 'bg-accent'
                          }`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>

                      <div className="flex items-center justify-between gap-2 text-xs text-muted">
                        <div className="flex items-center gap-2">
                          {status && (
                            <span className={`inline-flex items-center gap-1 font-medium ${status.text}`}>
                              <status.icon weight="fill" className="w-3 h-3" aria-hidden />
                              {status.label}
                            </span>
                          )}
                          {isMastered && <span className="text-yellow-400 font-semibold">Mastered</span>}
                        </div>
                        <Button variant="ghost" size="sm" onClick={() => onOpenTrack(game)}>
                          Update
                        </Button>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* Activity History Timeline */}
        <section className="p-5 rounded-2xl bg-surface border border-line space-y-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-base font-semibold text-ink flex items-center gap-2">
              <ClockCounterClockwiseIcon className="w-5 h-5 text-accent" />
              Recent Activity History
            </h2>
            <span className="text-xs font-mono text-muted">{activityFeed.length} events</span>
          </div>

          {activityFeed.length === 0 ? (
            <p className="text-sm text-muted py-8 text-center">
              No activity recorded yet. Track a game or log hours to build your timeline.
            </p>
          ) : (
            <ol className="relative border-l-2 border-line ml-2.5 pl-5 space-y-4">
              {activityFeed.map(({ game, userGame, timestamp, actionLabel }) => {
                const status = userGame.status ? STATUS[userGame.status] : undefined;
                return (
                  <li key={game.id} className="relative">
                    <span
                      className="absolute -left-[27px] top-4 w-3 h-3 rounded-full bg-accent ring-4 ring-surface"
                      aria-hidden
                    />
                    <div className="p-3.5 rounded-xl bg-canvas border border-line flex items-start gap-3">
                      <button
                        type="button"
                        onClick={() => onSelectGame(game)}
                        className="shrink-0 rounded-lg overflow-hidden border border-line focus-visible:ring-2 focus-visible:ring-accent"
                        aria-label={`Open ${game.title}`}
                      >
                        <img src={game.coverUrl} alt="" className="w-10 h-14 object-cover" loading="lazy" />
                      </button>

                      <div className="flex-1 min-w-0 space-y-1">
                        <div className="flex flex-wrap items-baseline justify-between gap-2">
                          <button
                            type="button"
                            onClick={() => onSelectGame(game)}
                            className="text-sm font-semibold text-ink hover:text-accent truncate text-left"
                          >
                            {game.title}
                          </button>
                          <time
                            dateTime={timestamp}
                            title={formatDateTime(timestamp)}
                            className="text-xs font-mono text-muted shrink-0"
                          >
                            {formatRelativeTime(timestamp)}
                          </time>
                        </div>

                        <p className="text-xs text-muted flex flex-wrap items-center gap-2">
                          <span className="text-ink/90 font-medium">{actionLabel}</span>
                          {status && (
                            <span className={`inline-flex items-center gap-1 ${status.text}`}>
                              • <status.icon weight="fill" className="w-3 h-3" aria-hidden /> {status.label}
                            </span>
                          )}
                          {userGame.isFavorite && (
                            <span className="inline-flex items-center gap-1 text-rose-400">
                              • <HeartIcon weight="fill" className="w-3 h-3" aria-hidden /> Favorite
                            </span>
                          )}
                        </p>

                        <div className="flex flex-wrap items-center gap-3 pt-1 text-xs font-mono text-muted">
                          {userGame.hoursPlayed > 0 && (
                            <span className="inline-flex items-center gap-1">
                              <ClockIcon className="w-3.5 h-3.5" /> {userGame.hoursPlayed.toFixed(1)}h
                            </span>
                          )}
                          {userGame.score !== null && (
                            <span className="inline-flex items-center gap-1 text-ink">
                              <StarIcon weight="fill" className="w-3.5 h-3.5 text-yellow-400" /> {userGame.score}%
                            </span>
                          )}
                          {game.achievementsTotal > 0 && (
                            <span className="inline-flex items-center gap-1">
                              <TrophyIcon className="w-3.5 h-3.5" /> {userGame.achievementsUnlocked}/
                              {game.achievementsTotal}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </section>
      </div>
    </div>
  );
};

