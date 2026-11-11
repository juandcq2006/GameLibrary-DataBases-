import React, { useState } from 'react';
import {
  ChatTextIcon,
  PaperPlaneRightIcon,
  StarIcon,
  TrashIcon,
} from '@phosphor-icons/react';
import type { AuthUser, Game, Review, UserGame } from '../../shared/domain/game';
import { formatDateTime, formatRelativeTime, formatShortDate } from '../../shared/lib/dates';
import { Button } from '../../shared/ui/Button';

interface ReviewsSectionProps {
  game: Game;
  reviews: Review[];
  isLoading: boolean;
  error: string | null;
  currentUser: AuthUser | null;
  authRequired: boolean;
  userGame?: UserGame;
  onOpenTrack: () => void;
  onOpenAuth: (mode: 'login' | 'signup') => void;
  onSaveReview: (body: string) => Promise<void>;
  onDeleteReview: () => Promise<void>;
}

const MAX_REVIEW_CHARS = 5000;

/**
 * Community reviews for one game, plus the form for the signed-in (or demo) user's review.
 * Mirrors the database rule: a review requires a `user_games` row and borrows its rating from `userGame.score`.
 */
export const ReviewsSection: React.FC<ReviewsSectionProps> = ({
  game,
  reviews,
  isLoading,
  error,
  currentUser,
  authRequired,
  userGame,
  onOpenTrack,
  onOpenAuth,
  onSaveReview,
  onDeleteReview,
}) => {
  const activeUserId = currentUser?.id ?? (authRequired ? null : 1);
  const myReview = activeUserId !== null ? reviews.find((r) => r.userId === activeUserId) : undefined;

  const [draftOverride, setDraftOverride] = useState<{ gameId: string; text: string } | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const draft =
    draftOverride && draftOverride.gameId === game.id ? draftOverride.text : (myReview?.body ?? '');
  const setDraft = (text: string) => setDraftOverride({ gameId: game.id, text });

  const charCount = [...draft.trim()].length;
  const inLibrary = Boolean(userGame);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = draft.trim();
    const len = [...trimmed].length;
    if (len < 1 || len > MAX_REVIEW_CHARS) {
      setFormError(`Review must be between 1 and ${MAX_REVIEW_CHARS} characters.`);
      return;
    }

    setIsSaving(true);
    setFormError(null);
    try {
      await onSaveReview(trimmed);
      setDraftOverride(null);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not save your review.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    setIsSaving(true);
    setFormError(null);
    try {
      await onDeleteReview();
      setDraftOverride(null);
      setConfirmDelete(false);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not delete your review.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <section className="p-6 rounded-2xl bg-surface border border-line space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-base font-semibold text-ink flex items-center gap-2">
          <ChatTextIcon className="w-5 h-5 text-accent" />
          Community Reviews
        </h3>
        <span className="text-xs font-mono text-muted">
          {reviews.length} {reviews.length === 1 ? 'review' : 'reviews'}
        </span>
      </div>

      {/* Write / Edit Your Review */}
      <div className="p-4 rounded-xl bg-canvas border border-line space-y-3">
        {authRequired && !currentUser ? (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <p className="text-sm text-muted">Log in or create an account to write a review for {game.title}.</p>
            <div className="flex items-center gap-2 shrink-0">
              <Button type="button" variant="secondary" size="sm" onClick={() => onOpenAuth('login')}>
                Log in
              </Button>
              <Button type="button" variant="primary" size="sm" onClick={() => onOpenAuth('signup')}>
                Sign up
              </Button>
            </div>
          </div>
        ) : !inLibrary ? (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-ink">Add this game to your library to review it</p>
              <p className="text-xs text-muted mt-0.5">
                Reviews automatically display your tracking rating from your library entry.
              </p>
            </div>
            <Button variant="primary" size="sm" onClick={onOpenTrack} className="shrink-0">
              Start Tracking
            </Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label htmlFor="review-body" className="text-sm font-semibold text-ink">
                {myReview ? 'Your Review' : 'Write a Review'}
              </label>
              <div className="flex items-center gap-2 text-xs">
                <span className="text-muted flex items-center gap-1 font-mono">
                  <StarIcon weight="fill" className="w-3.5 h-3.5 text-yellow-400" />
                  {userGame?.score !== null && userGame?.score !== undefined
                    ? `Your Rating: ${userGame.score}/100`
                    : 'Not rated yet'}
                </span>
                <button
                  type="button"
                  onClick={onOpenTrack}
                  className="text-accent hover:underline font-medium"
                >
                  Change rating
                </button>
              </div>
            </div>

            <textarea
              id="review-body"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={`What did you think of ${game.title}?`}
              rows={3}
              maxLength={MAX_REVIEW_CHARS}
              disabled={isSaving}
              className="w-full bg-surface text-ink text-sm p-3 rounded-xl border border-line outline-none focus:ring-2 focus:ring-accent placeholder-muted"
            />

            {formError && (
              <p role="alert" className="text-xs text-rose-400">
                {formError}
              </p>
            )}

            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className={`text-xs font-mono ${charCount > MAX_REVIEW_CHARS ? 'text-rose-400' : 'text-muted'}`}>
                {charCount} / {MAX_REVIEW_CHARS}
              </span>

              <div className="flex items-center gap-2">
                {myReview && !confirmDelete && (
                  <Button
                    type="button"
                    variant="danger"
                    size="sm"
                    disabled={isSaving}
                    leftIcon={<TrashIcon className="w-3.5 h-3.5" />}
                    onClick={() => setConfirmDelete(true)}
                  >
                    Delete
                  </Button>
                )}
                {myReview && confirmDelete && (
                  <div className="flex items-center gap-1.5">
                    <Button type="button" variant="danger" size="sm" disabled={isSaving} onClick={handleDelete}>
                      Confirm Delete
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={isSaving}
                      onClick={() => setConfirmDelete(false)}
                    >
                      Cancel
                    </Button>
                  </div>
                )}

                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  disabled={isSaving || charCount === 0}
                  leftIcon={<PaperPlaneRightIcon className="w-3.5 h-3.5" />}
                >
                  {isSaving ? 'Saving…' : myReview ? 'Update Review' : 'Publish Review'}
                </Button>
              </div>
            </div>
          </form>
        )}
      </div>

      {/* Public Reviews List */}
      {isLoading ? (
        <p role="status" className="text-sm text-muted py-4 text-center">
          Loading reviews…
        </p>
      ) : error ? (
        <p role="alert" className="text-sm text-rose-400 py-4 text-center">
          {error}
        </p>
      ) : reviews.length === 0 ? (
        <p className="text-sm text-muted py-4 text-center">
          No reviews yet for {game.title}. Be the first to share your thoughts!
        </p>
      ) : (
        <ul className="space-y-3">
          {reviews.map((review) => {
            const isOwn = activeUserId !== null && review.userId === activeUserId;
            const edited = review.updatedAt !== review.createdAt;
            return (
              <li
                key={`${review.gameId}-${review.userId}`}
                className={`p-4 rounded-xl border ${
                  isOwn ? 'bg-elevated/70 border-accent/40' : 'bg-canvas border-line'
                } space-y-2`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <span className="w-7 h-7 rounded-lg bg-elevated border border-line text-xs font-bold text-ink flex items-center justify-center uppercase">
                      {review.username.slice(0, 2)}
                    </span>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-ink">@{review.username}</span>
                        {isOwn && (
                          <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-accent/20 text-accent">
                            You
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted" title={formatDateTime(review.createdAt)}>
                        {formatShortDate(review.createdAt)} ({formatRelativeTime(review.createdAt)})
                        {edited ? ' · edited' : ''}
                      </p>
                    </div>
                  </div>

                  {review.score !== null && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-surface border border-line text-xs font-mono font-bold text-ink">
                      <StarIcon weight="fill" className="w-3.5 h-3.5 text-yellow-400" />
                      {review.score}%
                    </span>
                  )}
                </div>

                <p className="text-sm text-ink/90 leading-relaxed whitespace-pre-line">{review.body}</p>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
};
