import React, { useState } from 'react';
import {
  ArrowLeftIcon,
  BookmarkSimpleIcon,
  CheckIcon,
  ClockCounterClockwiseIcon,
  ClockIcon,
  MinusIcon,
  PlusIcon,
  StarIcon,
  TrendUpIcon,
  TrophyIcon,
} from '@phosphor-icons/react';
import type { AuthUser, Game, Review, UserGame } from '../../shared/domain/game';
import { STATUS } from '../../shared/domain/status';
import { formatDateTime, formatRelativeTime } from '../../shared/lib/dates';
import { Button } from '../../shared/ui/Button';
import { ReviewsSection } from './ReviewsSection';

interface MediaHeroProps {
  game: Game;
  /** Returns to the library view */
  onBack: () => void;
  /** Opens the tracking modal for this game */
  onOpenTrack: () => void;
  /** The current user's row for this game, if any */
  userGame?: UserGame;
  /** Quick partial updates (e.g. +1 achievement, log play session) */
  onQuickUpdateUserGame?: (changes: Partial<UserGame>) => Promise<void>;
  /** Reviews for this game */
  reviews: Review[];
  reviewsLoading: boolean;
  reviewsError: string | null;
  currentUser: AuthUser | null;
  authRequired: boolean;
  onOpenAuth: (mode: 'login' | 'signup') => void;
  onSaveReview: (body: string) => Promise<void>;
  onDeleteReview: () => Promise<void>;
}

/**
 * Detail page for one game: banner, poster, quick stats, synopsis, achievements & activity, and reviews.
 * Replaces the library view while a game is selected; Escape or the back button closes it.
 */
export const MediaHero: React.FC<MediaHeroProps> = ({
  game,
  onBack,
  onOpenTrack,
  userGame,
  onQuickUpdateUserGame,
  reviews,
  reviewsLoading,
  reviewsError,
  currentUser,
  authRequired,
  onOpenAuth,
  onSaveReview,
  onDeleteReview,
}) => {
  const [quickBusy, setQuickBusy] = useState(false);
  const [quickError, setQuickError] = useState<string | null>(null);

  const status = userGame?.status;
  const unlocked = Math.min(game.achievementsTotal, userGame?.achievementsUnlocked ?? 0);
  const achievementPercentage =
    game.achievementsTotal > 0 ? Math.round((unlocked / game.achievementsTotal) * 100) : 0;
  const isMastered = game.achievementsTotal > 0 && unlocked >= game.achievementsTotal;

  const runQuickUpdate = async (changes: Partial<UserGame>) => {
    if (!onQuickUpdateUserGame || quickBusy) return;
    setQuickBusy(true);
    setQuickError(null);
    try {
      await onQuickUpdateUserGame(changes);
    } catch (err) {
      setQuickError(err instanceof Error ? err.message : 'Could not update your progress.');
    } finally {
      setQuickBusy(false);
    }
  };

  return (
    <div className="w-full min-h-full pb-12">
      {/* Back button */}
      <div className="mb-4">
        <Button
          variant="secondary"
          size="sm"
          onClick={onBack}
          leftIcon={<ArrowLeftIcon className="w-4 h-4" />}
          className="bg-surface border-line text-ink hover:border-accent"
        >
          Back to Game Library
        </Button>
      </div>

      {/* Panoramic Header Banner */}
      <div className="relative w-full h-64 md:h-80 lg:h-96 rounded-2xl overflow-hidden bg-surface border border-line shadow-2xl">
        <img
          src={game.bannerUrl}
          alt={game.title}
          className="w-full h-full object-cover object-center"
        />
        {/* Gradients */}
        <div className="absolute inset-0 bg-gradient-to-t from-canvas via-transparent to-black/30" />
        <div className="absolute inset-0 bg-gradient-to-r from-canvas/90 via-transparent to-transparent" />
      </div>

      {/* Overlapping Content Hub */}
      <div className="relative -mt-20 sm:-mt-28 md:-mt-36 px-4 md:px-8 z-10">
        <div className="flex flex-col md:flex-row gap-6 md:gap-8 items-start">
          {/* Overlapping 2:3 Poster Card */}
          <div className="w-48 sm:w-56 md:w-64 shrink-0 mx-auto md:mx-0">
            <div className="aspect-[2/3] w-full rounded-2xl overflow-hidden border-2 border-line shadow-2xl bg-surface relative">
              <img
                src={game.coverUrl}
                alt={game.title}
                className="w-full h-full object-cover"
              />
              <div className="absolute top-3 right-3 bg-canvas/90 backdrop-blur-md px-2 py-1 rounded-xl font-bold font-mono text-xs text-ink border border-line">
                ★ {game.averageScore}%
              </div>
            </div>

            {/* Quick Actions Under Poster */}
            <div className="mt-4 space-y-2.5">
              <Button
                variant="primary"
                size="md"
                onClick={onOpenTrack}
                leftIcon={
                  status ? (
                    <CheckIcon className="w-4 h-4 text-canvas" />
                  ) : (
                    <BookmarkSimpleIcon className="w-4 h-4 text-canvas" />
                  )
                }
                className="w-full"
              >
                {status ? `${STATUS[status].label} · Edit` : 'Start Tracking'}
              </Button>
            </div>
          </div>

          {/* Right Column: Title, Quick Stats, Synopsis, Achievements/Activity & Reviews */}
          <div className="flex-1 min-w-0 pt-2 md:pt-14 space-y-6">
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-surface text-ink border border-line">
                  {game.format}
                </span>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-mono text-muted bg-surface border border-line">
                  {game.releaseYear}
                </span>
              </div>

              <h1 className="text-2xl sm:text-3xl md:text-4xl font-black text-ink tracking-tight">
                {game.title}
              </h1>
              <p className="text-sm text-muted font-medium">
                Developed by <span className="text-ink font-semibold">{game.developer}</span> • Published by{' '}
                {game.publisher}
              </p>
            </div>

            {/* Quick Stats Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-3.5 rounded-2xl bg-surface border border-line">
                <span className="text-xs text-muted flex items-center gap-1">
                  <StarIcon className="w-3.5 h-3.5 text-muted" /> Score Rating
                </span>
                <span className="text-lg font-bold font-mono text-ink mt-1 block">{game.averageScore}%</span>
              </div>

              <div className="p-3.5 rounded-2xl bg-surface border border-line">
                <span className="text-xs text-muted flex items-center gap-1">
                  <ClockIcon className="w-3.5 h-3.5" /> Hours Played
                </span>
                <span className="text-lg font-bold font-mono text-ink mt-1 block">
                  {(userGame?.hoursPlayed ?? 0).toFixed(1)} hrs
                </span>
              </div>

              <div className="p-3.5 rounded-2xl bg-surface border border-line">
                <span className="text-xs text-muted flex items-center gap-1">
                  <TrendUpIcon className="w-3.5 h-3.5" /> Popularity
                </span>
                <span className="text-lg font-bold font-mono text-ink mt-1 block">
                  #{game.popularity.toLocaleString()}
                </span>
              </div>

              <div className="p-3.5 rounded-2xl bg-surface border border-line">
                <span className="text-xs text-muted flex items-center gap-1">
                  <TrophyIcon className="w-3.5 h-3.5 text-muted" /> Achievements
                </span>
                <span className="text-lg font-bold font-mono text-ink mt-1 block">
                  {unlocked}/{game.achievementsTotal} ({achievementPercentage}%)
                </span>
              </div>
            </div>

            {/* Synopsis & Genre Pills */}
            <div className="p-6 rounded-2xl bg-surface border border-line space-y-3">
              <h3 className="text-base font-semibold text-ink flex items-center gap-2">About the Game</h3>
              <p className="text-sm text-muted leading-relaxed whitespace-pre-line">{game.summary}</p>

              <div className="pt-3 border-t border-line/60 flex flex-wrap gap-2">
                {game.genres.map((g) => (
                  <span
                    key={g}
                    className="px-3 py-1 rounded-xl bg-canvas text-xs font-semibold text-muted border border-line"
                  >
                    {g}
                  </span>
                ))}
              </div>
            </div>

            {/* Achievements & Activity History Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Achievements Progress Card */}
              <div className="p-5 rounded-2xl bg-surface border border-line flex flex-col justify-between gap-4">
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-base font-semibold text-ink flex items-center gap-2">
                      <TrophyIcon
                        weight={isMastered ? 'fill' : 'regular'}
                        className={`w-5 h-5 ${isMastered ? 'text-yellow-400' : 'text-accent'}`}
                      />
                      Achievements
                    </h3>
                    {isMastered ? (
                      <span className="text-xs font-bold uppercase px-2.5 py-0.5 rounded-lg bg-yellow-400/20 text-yellow-300 border border-yellow-400/40">
                        100% Mastered
                      </span>
                    ) : (
                      <span className="text-xs font-mono text-muted">
                        {unlocked} / {game.achievementsTotal} unlocked
                      </span>
                    )}
                  </div>

                  {/* Progress Bar */}
                  <div className="space-y-1.5">
                    <div
                      className="w-full h-2.5 rounded-full bg-canvas border border-line overflow-hidden"
                      role="progressbar"
                      aria-valuenow={achievementPercentage}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-label="Achievement completion"
                    >
                      <div
                        className={`h-full rounded-full transition-all duration-300 ${
                          isMastered ? 'bg-yellow-400' : 'bg-accent'
                        }`}
                        style={{ width: `${achievementPercentage}%` }}
                      />
                    </div>
                    <div className="flex items-center justify-between text-xs text-muted font-mono">
                      <span>{achievementPercentage}% complete</span>
                      <span>
                        {Math.max(0, game.achievementsTotal - unlocked)} remaining
                      </span>
                    </div>
                  </div>
                </div>

                {onQuickUpdateUserGame && game.achievementsTotal > 0 && (
                  <div className="flex items-center justify-between gap-2 pt-3 border-t border-line/60">
                    <span className="text-xs text-muted">Quick adjust</span>
                    <div className="flex items-center gap-1.5">
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        disabled={quickBusy || unlocked <= 0}
                        aria-label="Decrease unlocked achievements"
                        onClick={() => runQuickUpdate({ achievementsUnlocked: Math.max(0, unlocked - 1) })}
                        leftIcon={<MinusIcon className="w-3.5 h-3.5" />}
                      >
                        1
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        disabled={quickBusy || unlocked >= game.achievementsTotal}
                        aria-label="Increase unlocked achievements"
                        onClick={() =>
                          runQuickUpdate({
                            achievementsUnlocked: Math.min(game.achievementsTotal, unlocked + 1),
                          })
                        }
                        leftIcon={<PlusIcon className="w-3.5 h-3.5" />}
                      >
                        1
                      </Button>
                    </div>
                  </div>
                )}
              </div>

              {/* Activity History Card */}
              <div className="p-5 rounded-2xl bg-surface border border-line flex flex-col justify-between gap-4">
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-base font-semibold text-ink flex items-center gap-2">
                      <ClockCounterClockwiseIcon className="w-5 h-5 text-accent" />
                      Activity History
                    </h3>
                    {status && (
                      <span
                        className={`inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-lg ${STATUS[status].pill}`}
                      >
                        {STATUS[status].label}
                      </span>
                    )}
                  </div>

                  <dl className="space-y-2 text-xs">
                    <div className="flex items-center justify-between gap-2 py-1.5 border-b border-line/50">
                      <dt className="text-muted">Last played</dt>
                      <dd
                        className="font-mono font-semibold text-ink"
                        title={userGame?.lastPlayedAt ? formatDateTime(userGame.lastPlayedAt) : undefined}
                      >
                        {formatRelativeTime(userGame?.lastPlayedAt ?? null)}
                      </dd>
                    </div>
                    <div className="flex items-center justify-between gap-2 py-1.5 border-b border-line/50">
                      <dt className="text-muted">Library updated</dt>
                      <dd
                        className="font-mono text-ink"
                        title={userGame?.updatedAt ? formatDateTime(userGame.updatedAt) : undefined}
                      >
                        {userGame?.updatedAt ? formatRelativeTime(userGame.updatedAt) : 'Not in library'}
                      </dd>
                    </div>
                    {userGame?.notes && (
                      <div className="pt-1">
                        <dt className="text-muted mb-1">Latest note</dt>
                        <dd className="text-ink/90 bg-canvas border border-line rounded-xl p-2.5 line-clamp-2">
                          {userGame.notes}
                        </dd>
                      </div>
                    )}
                  </dl>
                </div>

                {onQuickUpdateUserGame && (
                  <div className="flex items-center justify-between gap-2 pt-3 border-t border-line/60">
                    <span className="text-xs text-muted">Record a play session</span>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      disabled={quickBusy}
                      leftIcon={<PlusIcon className="w-3.5 h-3.5" />}
                      onClick={() =>
                        runQuickUpdate({
                          hoursPlayed: Math.round(((userGame?.hoursPlayed ?? 0) + 1) * 10) / 10,
                          lastPlayedAt: new Date().toISOString(),
                          ...(userGame?.status ? {} : { status: 'CURRENT' }),
                        })
                      }
                    >
                      Log +1h Played
                    </Button>
                  </div>
                )}
              </div>
            </div>

            {quickError && (
              <p role="alert" className="text-sm text-rose-400">
                {quickError}
              </p>
            )}

            {/* Community Reviews Section */}
            <ReviewsSection
              game={game}
              reviews={reviews}
              isLoading={reviewsLoading}
              error={reviewsError}
              currentUser={currentUser}
              authRequired={authRequired}
              userGame={userGame}
              onOpenTrack={onOpenTrack}
              onOpenAuth={onOpenAuth}
              onSaveReview={onSaveReview}
              onDeleteReview={onDeleteReview}
            />
          </div>
        </div>
      </div>
    </div>
  );
};
