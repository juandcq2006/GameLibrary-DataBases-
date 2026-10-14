import React, { useState } from 'react';
import { X, Star, Check, Trash2, Clock } from 'lucide-react';
import type { Game, UserTrackEntry, UserTrackingStatus } from '../../types/game';
import { Button } from '../ui/Button';

interface TrackingModalProps {
  game: Game;
  isOpen: boolean;
  onClose: () => void;
  currentEntry?: UserTrackEntry;
  onSave: (entry: UserTrackEntry) => void;
  onDelete?: (gameId: string) => void;
}

export const TrackingModal: React.FC<TrackingModalProps> = ({
  game,
  isOpen,
  onClose,
  currentEntry,
  onSave,
  onDelete,
}) => {
  const [status, setStatus] = useState<UserTrackingStatus>(
    currentEntry?.status || 'CURRENT'
  );
  const [score, setScore] = useState<number>(currentEntry?.score ?? game.averageScore ?? 90);
  const [progress, setProgress] = useState<number>(
    currentEntry?.progress ?? (game.hoursPlayed ? Math.round(game.hoursPlayed) : 5)
  );
  const [notes, setNotes] = useState<string>(currentEntry?.notes || '');

  if (!isOpen) return null;

  const handleSave = () => {
    onSave({
      gameId: game.id,
      status,
      score,
      progress,
      notes,
      updatedAt: new Date().toISOString(),
    });
    onClose();
  };

  const statusOptions: { value: UserTrackingStatus; label: string }[] = [
    { value: 'CURRENT', label: 'Currently Playing' },
    { value: 'PLANNING', label: 'Plan to Play' },
    { value: 'COMPLETED', label: 'Completed' },
    { value: 'PAUSED', label: 'On Hold' },
    { value: 'DROPPED', label: 'Dropped' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        className="relative w-full max-w-lg bg-[#131F2E] dark:bg-[#131F2E] light:bg-white border border-[#22354B] dark:border-[#22354B] light:border-[#CBD5E1] rounded-3xl p-6 shadow-2xl space-y-6"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between pb-4 border-b border-[#22354B] dark:border-[#22354B] light:border-[#CBD5E1]">
          <div className="flex items-center gap-3">
            <img
              src={game.coverUrl}
              alt={game.title}
              className="w-12 h-16 object-cover rounded-xl border border-[#22354B] dark:border-[#22354B] light:border-[#CBD5E1] shrink-0"
            />
            <div>
              <span className="text-[10px] uppercase font-bold text-[#00FFD1] dark:text-[#00FFD1] light:text-[#00897B] tracking-wider">
                Geekbond Game Tracker
              </span>
              <h3 className="font-bold text-base text-[#F1F5F9] dark:text-[#F1F5F9] light:text-[#0F172A] line-clamp-1">
                {game.title}
              </h3>
              <p className="text-xs text-[#8BA0B2] dark:text-[#8BA0B2] light:text-[#64748B]">
                {game.developer} • {game.format}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-[#8BA0B2] dark:text-[#8BA0B2] light:text-[#64748B] hover:text-[#00FFD1] hover:bg-[#1A2A3D] dark:hover:bg-[#1A2A3D] light:hover:bg-[#E2E8F0] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tracking Status Tabs */}
        <div>
          <label className="block text-xs font-bold uppercase text-[#8BA0B2] dark:text-[#8BA0B2] light:text-[#64748B] tracking-wider mb-2">
            Play Status
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {statusOptions.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setStatus(opt.value)}
                className={`py-2 px-3 rounded-xl text-xs font-semibold border transition-all ${
                  status === opt.value
                    ? 'bg-[#00FFD1] text-[#0B141E] border-[#00FFD1] shadow-[0_0_15px_rgba(0,255,209,0.35)] font-bold'
                    : 'bg-[#0B141E] dark:bg-[#0B141E] light:bg-[#F8FAFC] text-[#8BA0B2] dark:text-[#8BA0B2] light:text-[#64748B] border-[#22354B] dark:border-[#22354B] light:border-[#CBD5E1] hover:text-[#00FFD1]'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Score & Hours Progress */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Score Slider */}
          <div className="p-3.5 rounded-2xl bg-[#0B141E] dark:bg-[#0B141E] light:bg-[#F8FAFC] border border-[#22354B] dark:border-[#22354B] light:border-[#CBD5E1]">
            <div className="flex items-center justify-between text-xs mb-2">
              <span className="font-bold text-[#8BA0B2] dark:text-[#8BA0B2] light:text-[#64748B] uppercase tracking-wider flex items-center gap-1.5">
                <Star className="w-3.5 h-3.5 text-amber-400" /> Score Rating
              </span>
              <span className="font-mono font-bold text-sm text-[#00FFD1] dark:text-[#00FFD1] light:text-[#00897B]">
                {score} / 100
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="100"
              step="1"
              value={score}
              onChange={(e) => setScore(Number(e.target.value))}
              className="w-full accent-[#00FFD1] cursor-pointer"
            />
          </div>

          {/* Hours Counter */}
          <div className="p-3.5 rounded-2xl bg-[#0B141E] dark:bg-[#0B141E] light:bg-[#F8FAFC] border border-[#22354B] dark:border-[#22354B] light:border-[#CBD5E1]">
            <div className="flex items-center justify-between text-xs mb-2">
              <span className="font-bold text-[#8BA0B2] dark:text-[#8BA0B2] light:text-[#64748B] uppercase tracking-wider flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-[#00FFD1]" /> Hours Played
              </span>
              <span className="font-mono text-xs text-[#8BA0B2] dark:text-[#8BA0B2] light:text-[#64748B]">
                Logged
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setProgress((p) => Math.max(0, p - 1))}
                className="w-8 h-8 rounded-lg bg-[#1A2A3D] dark:bg-[#1A2A3D] light:bg-[#E2E8F0] text-[#F1F5F9] dark:text-[#F1F5F9] light:text-[#0F172A] font-bold hover:bg-[#00FFD1] hover:text-[#0B141E] transition-colors flex items-center justify-center"
              >
                -
              </button>
              <input
                type="number"
                min="0"
                max="9999"
                value={progress}
                onChange={(e) => setProgress(Number(e.target.value))}
                className="flex-1 text-center bg-[#131F2E] dark:bg-[#131F2E] light:bg-white text-[#F1F5F9] dark:text-[#F1F5F9] light:text-[#0F172A] font-mono font-bold text-sm py-1.5 rounded-lg border border-[#22354B] dark:border-[#22354B] light:border-[#CBD5E1] outline-none focus:ring-1 focus:ring-[#00FFD1]"
              />
              <button
                onClick={() => setProgress((p) => p + 1)}
                className="w-8 h-8 rounded-lg bg-[#1A2A3D] dark:bg-[#1A2A3D] light:bg-[#E2E8F0] text-[#F1F5F9] dark:text-[#F1F5F9] light:text-[#0F172A] font-bold hover:bg-[#00FFD1] hover:text-[#0B141E] transition-colors flex items-center justify-center"
              >
                +
              </button>
            </div>
          </div>
        </div>

        {/* Review Notes */}
        <div>
          <label className="block text-xs font-bold uppercase text-[#8BA0B2] dark:text-[#8BA0B2] light:text-[#64748B] tracking-wider mb-2">
            Game Notes & Review
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Write your game review, completion thoughts, or notes..."
            rows={2}
            className="w-full bg-[#0B141E] dark:bg-[#0B141E] light:bg-[#F8FAFC] text-[#F1F5F9] dark:text-[#F1F5F9] light:text-[#0F172A] text-xs p-3 rounded-xl border border-[#22354B] dark:border-[#22354B] light:border-[#CBD5E1] outline-none focus:ring-2 focus:ring-[#00FFD1] placeholder-[#8BA0B2] dark:placeholder-[#8BA0B2] light:placeholder-[#64748B]"
          />
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-between pt-2">
          {currentEntry && onDelete ? (
            <button
              onClick={() => {
                onDelete(game.id);
                onClose();
              }}
              className="text-xs text-rose-400 hover:text-rose-300 flex items-center gap-1.5 p-2"
            >
              <Trash2 className="w-3.5 h-3.5" /> Remove from List
            </button>
          ) : (
            <div />
          )}

          <div className="flex items-center gap-2.5">
            <Button variant="ghost" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button
              variant="primary"
              size="md"
              onClick={handleSave}
              leftIcon={<Check className="w-4 h-4 text-[#0B141E]" />}
              className="bg-[#00FFD1] text-[#0B141E] hover:bg-[#00E5BC] shadow-[0_0_20px_rgba(0,255,209,0.4)] font-bold"
            >
              Save Game Entry
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
