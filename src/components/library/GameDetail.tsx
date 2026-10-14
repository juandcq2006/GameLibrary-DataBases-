import React, { useState } from 'react';
import {
  ArrowLeft,
  Play,
  Download,
  Heart,
  Clock,
  HardDrive,
  Calendar,
  Award,
  CheckCircle2,
  Cloud,
  Trash2,
  Sparkles,
  ShieldCheck,
} from 'lucide-react';
import type { Game } from '../../types/game';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';

interface GameDetailProps {
  game: Game;
  onBack: () => void;
  onToggleFavorite: (e: React.MouseEvent, gameId: string) => void;
  onToggleInstall: (e: React.MouseEvent, gameId: string) => void;
}

export const GameDetail: React.FC<GameDetailProps> = ({
  game,
  onBack,
  onToggleFavorite,
  onToggleInstall,
}) => {
  const [isPlaying, setIsPlaying] = useState(false);

  const achievementPercentage = Math.round(
    (game.achievements.unlocked / Math.max(1, game.achievements.total)) * 100
  );

  const handleLaunch = (e: React.MouseEvent) => {
    if (game.isInstalled) {
      setIsPlaying(true);
      setTimeout(() => setIsPlaying(false), 3000);
    } else {
      onToggleInstall(e, game.id);
    }
  };

  return (
    <div className="w-full min-h-full pb-16 animate-in fade-in duration-300">
      {/* 16:9 Cinematic Hero Banner with Bottom-Gradient Fade */}
      <div className="relative w-full aspect-[16/9] max-h-[460px] overflow-hidden rounded-3xl border border-[#1E2B35] shadow-2xl bg-[#131A20]">
        <img
          src={game.bannerUrl}
          alt={game.title}
          className="w-full h-full object-cover object-center transform scale-100 transition-transform duration-700 hover:scale-105"
        />

        {/* Ambient Overlay Gradients */}
        <div className="absolute inset-0 bg-gradient-to-t from-[#0B0F12] via-[#0B0F12]/60 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-r from-[#0B0F12]/90 via-[#0B0F12]/40 to-transparent" />

        {/* Top Floating Navigation */}
        <div className="absolute top-5 inset-x-6 flex items-center justify-between z-20">
          <Button
            variant="secondary"
            size="sm"
            onClick={onBack}
            leftIcon={<ArrowLeft className="w-4 h-4 text-[#14F1D9]" />}
            className="backdrop-blur-md bg-[#131A20]/80 border-[#1E2B35] hover:border-[#14F1D9] text-[#F8FAFC]"
          >
            Back to Library
          </Button>

          <div className="flex items-center gap-2">
            <button
              onClick={(e) => onToggleFavorite(e, game.id)}
              className={`p-2.5 rounded-xl backdrop-blur-md transition-all duration-200 outline-none focus:ring-2 focus:ring-[#14F1D9] ${
                game.isFavorite
                  ? 'bg-rose-500/20 text-rose-400 border border-rose-500/40 shadow-[0_0_15px_rgba(244,63,94,0.3)]'
                  : 'bg-[#131A20]/80 text-[#8B9EAE] hover:text-[#F8FAFC] border border-[#1E2B35]'
              }`}
              title={game.isFavorite ? 'In Favorites' : 'Add to Favorites'}
            >
              <Heart className={`w-5 h-5 ${game.isFavorite ? 'fill-rose-500 text-rose-500' : ''}`} />
            </button>
          </div>
        </div>

        {/* Hero Bottom Content & Prominent Call-to-Action */}
        <div className="absolute bottom-6 inset-x-6 z-20 flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div className="max-w-2xl">
            {/* Status & Genre Badges */}
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <Badge variant={game.isInstalled ? 'installed' : 'cloud'} size="md">
                {game.isInstalled ? 'Installed & Ready' : 'Available in Cloud'}
              </Badge>
              {game.genres.slice(0, 3).map((genre) => (
                <Badge key={genre} variant="genre" size="md">
                  {genre}
                </Badge>
              ))}
              <Badge variant="outline" size="md">
                {game.releaseYear}
              </Badge>
            </div>

            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black text-[#F8FAFC] tracking-tight drop-shadow-md">
              {game.title}
            </h1>
            <p className="text-sm md:text-base text-[#8B9EAE] font-medium mt-1">
              Developed by <span className="text-[#F8FAFC] font-semibold">{game.developer}</span> • Published by {game.publisher}
            </p>
          </div>

          {/* Prominent CTA Button */}
          <div className="flex items-center gap-3 shrink-0">
            {game.isInstalled ? (
              <div className="flex items-center gap-2.5">
                <Button
                  size="lg"
                  variant="primary"
                  onClick={handleLaunch}
                  leftIcon={
                    isPlaying ? (
                      <Sparkles className="w-5 h-5 animate-spin" />
                    ) : (
                      <Play className="w-5 h-5 fill-[#0B0F12]" />
                    )
                  }
                  className="px-8 py-4 text-base shadow-[0_0_30px_rgba(20,241,217,0.4)] hover:shadow-[0_0_40px_rgba(20,241,217,0.6)]"
                >
                  {isPlaying ? 'LAUNCHING...' : 'PLAY NOW'}
                </Button>
                <Button
                  variant="secondary"
                  size="lg"
                  onClick={(e) => onToggleInstall(e, game.id)}
                  title="Uninstall Game"
                  className="px-3"
                >
                  <Trash2 className="w-4 h-4 text-rose-400" />
                </Button>
              </div>
            ) : (
              <Button
                size="lg"
                variant="primary"
                onClick={(e) => onToggleInstall(e, game.id)}
                leftIcon={<Download className="w-5 h-5" />}
                className="px-8 py-4 text-base shadow-[0_0_25px_rgba(20,241,217,0.35)]"
              >
                INSTALL ({game.storageGb.toFixed(1)} GB)
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Main Content Details Grid */}
      <div className="mt-8 grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Summary & Game Specs */}
        <div className="lg:col-span-2 space-y-6">
          {/* Summary Box */}
          <div className="p-6 rounded-2xl bg-[#131A20] border border-[#1E2B35]">
            <h2 className="text-lg font-bold text-[#F8FAFC] mb-3 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-[#14F1D9]" /> About the Game
            </h2>
            <p className="text-sm md:text-base text-[#8B9EAE] leading-relaxed">
              {game.summary}
            </p>

            <div className="mt-6 pt-5 border-t border-[#1E2B35] flex flex-wrap gap-2">
              {game.genres.map((g) => (
                <span
                  key={g}
                  className="px-3 py-1 rounded-lg bg-[#18232D] text-xs font-medium text-[#14F1D9] border border-[#1E2B35]"
                >
                  #{g}
                </span>
              ))}
            </div>
          </div>

          {/* Quick Metrics Bar */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="p-4 rounded-2xl bg-[#131A20] border border-[#1E2B35]">
              <div className="flex items-center gap-2 text-xs text-[#8B9EAE] mb-1">
                <Clock className="w-4 h-4 text-[#14F1D9]" /> Time Played
              </div>
              <div className="text-xl font-bold font-mono text-[#F8FAFC]">
                {game.hoursPlayed.toFixed(1)} <span className="text-xs text-[#8B9EAE]">hrs</span>
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-[#131A20] border border-[#1E2B35]">
              <div className="flex items-center gap-2 text-xs text-[#8B9EAE] mb-1">
                <Calendar className="w-4 h-4 text-[#14F1D9]" /> Last Played
              </div>
              <div className="text-sm font-semibold text-[#F8FAFC] truncate mt-1">
                {game.lastPlayed}
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-[#131A20] border border-[#1E2B35]">
              <div className="flex items-center gap-2 text-xs text-[#8B9EAE] mb-1">
                <HardDrive className="w-4 h-4 text-[#14F1D9]" /> Disk Size
              </div>
              <div className="text-xl font-bold font-mono text-[#F8FAFC]">
                {game.storageGb.toFixed(1)} <span className="text-xs text-[#8B9EAE]">GB</span>
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-[#131A20] border border-[#1E2B35]">
              <div className="flex items-center gap-2 text-xs text-[#8B9EAE] mb-1">
                <Cloud className="w-4 h-4 text-[#14F1D9]" /> Cloud Saves
              </div>
              <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-400 mt-1">
                <CheckCircle2 className="w-3.5 h-3.5" /> Synced
              </div>
            </div>
          </div>
        </div>

        {/* Right Col: Achievements & Launcher Hub */}
        <div className="space-y-6">
          {/* Achievements Card */}
          <div className="p-6 rounded-2xl bg-[#131A20] border border-[#1E2B35]">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-bold text-[#F8FAFC] flex items-center gap-2">
                <Award className="w-5 h-5 text-amber-400" /> Achievements
              </h2>
              <span className="text-xs font-mono font-bold text-[#14F1D9]">
                {achievementPercentage}%
              </span>
            </div>

            {/* Achievement Bar */}
            <div className="w-full bg-[#18232D] h-3 rounded-full overflow-hidden p-0.5 border border-[#1E2B35]">
              <div
                className="bg-gradient-to-r from-amber-400 to-[#14F1D9] h-full rounded-full transition-all duration-700 shadow-[0_0_10px_rgba(20,241,217,0.4)]"
                style={{ width: `${achievementPercentage}%` }}
              />
            </div>

            <div className="flex items-center justify-between mt-3 text-xs text-[#8B9EAE]">
              <span>Unlocked: <strong className="text-[#F8FAFC] font-mono">{game.achievements.unlocked}</strong></span>
              <span>Total: <strong className="text-[#F8FAFC] font-mono">{game.achievements.total}</strong></span>
            </div>

            <div className="mt-5 pt-4 border-t border-[#1E2B35] space-y-2">
              <div className="flex items-center justify-between p-2.5 rounded-xl bg-[#18232D]/70 text-xs">
                <span className="text-[#F8FAFC] font-medium">Master Explorer</span>
                <span className="text-emerald-400 font-mono text-[11px]">UNLOCKED</span>
              </div>
              <div className="flex items-center justify-between p-2.5 rounded-xl bg-[#18232D]/70 text-xs">
                <span className="text-[#F8FAFC] font-medium">Flawless Victory</span>
                <span className="text-emerald-400 font-mono text-[11px]">UNLOCKED</span>
              </div>
              <div className="flex items-center justify-between p-2.5 rounded-xl bg-[#18232D]/40 text-xs text-[#8B9EAE]">
                <span>Legendary Completionist</span>
                <span className="font-mono text-[11px]">LOCKED</span>
              </div>
            </div>
          </div>

          {/* Launcher Integrity Box */}
          <div className="p-5 rounded-2xl bg-[#18232D] border border-[#1E2B35]">
            <div className="flex items-center gap-3">
              <ShieldCheck className="w-6 h-6 text-[#14F1D9]" />
              <div>
                <h4 className="text-xs font-bold text-[#F8FAFC]">DirectX 12 & Anti-Cheat Ready</h4>
                <p className="text-[11px] text-[#8B9EAE]">Verified integrity for Geekbond Launcher</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
