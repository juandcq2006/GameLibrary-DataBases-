import React, { useState } from 'react';
import { Play, Download, Heart, Clock, Award } from 'lucide-react';
import type { Game } from '../../types/game';
import { Badge } from '../ui/Badge';

interface GameCardProps {
  game: Game;
  onSelectGame: (game: Game) => void;
  onToggleFavorite: (e: React.MouseEvent, gameId: string) => void;
  onToggleInstall: (e: React.MouseEvent, gameId: string) => void;
}

export const GameCard: React.FC<GameCardProps> = ({
  game,
  onSelectGame,
  onToggleFavorite,
  onToggleInstall,
}) => {
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);

  return (
    <div
      onClick={() => onSelectGame(game)}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelectGame(game);
        }
      }}
      className="group relative flex flex-col rounded-2xl bg-[#131A20] border border-[#1E2B35] overflow-hidden cursor-pointer transition-all duration-300 ease-out hover:-translate-y-1 hover:border-[#14F1D9] hover:shadow-[0_10px_25px_-5px_rgba(20,241,217,0.2)] outline-none focus:ring-2 focus:ring-[#14F1D9] focus:border-[#14F1D9]"
    >
      {/* 2:3 Poster Container */}
      <div className="relative w-full aspect-[2/3] overflow-hidden bg-[#18232D]">
        {/* Placeholder / skeleton before load */}
        {!imageLoaded && !imageError && (
          <div className="absolute inset-0 bg-[#18232D] animate-pulse" />
        )}

        <img
          src={
            imageError
              ? 'https://images.unsplash.com/photo-1550745165-9bc0b252726f?auto=format&fit=crop&w=600&q=80'
              : game.coverUrl
          }
          alt={game.title}
          loading="lazy"
          onLoad={() => setImageLoaded(true)}
          onError={() => setImageError(true)}
          className={`w-full h-full object-cover transition-transform duration-500 ease-out group-hover:scale-105 ${
            imageLoaded ? 'opacity-100' : 'opacity-0'
          }`}
        />

        {/* Gradient Overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-[#131A20] via-transparent to-black/40 opacity-80 group-hover:opacity-60 transition-opacity" />

        {/* Top Floating Badges & Action Buttons */}
        <div className="absolute top-2.5 inset-x-2.5 flex items-center justify-between z-10">
          <Badge variant={game.isInstalled ? 'installed' : 'cloud'}>
            {game.isInstalled ? 'Installed' : 'Cloud'}
          </Badge>

          <button
            onClick={(e) => onToggleFavorite(e, game.id)}
            title={game.isFavorite ? 'Remove from favorites' : 'Add to favorites'}
            className={`p-1.5 rounded-full backdrop-blur-md transition-transform duration-200 hover:scale-110 outline-none focus:ring-2 focus:ring-[#14F1D9] ${
              game.isFavorite
                ? 'bg-rose-500/20 text-rose-400 border border-rose-500/40 shadow-[0_0_10px_rgba(244,63,94,0.3)]'
                : 'bg-black/50 text-[#8B9EAE] hover:text-[#F8FAFC] border border-white/10'
            }`}
          >
            <Heart className={`w-3.5 h-3.5 ${game.isFavorite ? 'fill-rose-500 text-rose-500' : ''}`} />
          </button>
        </div>

        {/* Center Hover Action Button (Play / Install) */}
        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200 z-20 pointer-events-none group-hover:pointer-events-auto">
          <button
            onClick={(e) => onToggleInstall(e, game.id)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider bg-[#14F1D9] text-[#0B0F12] shadow-[0_0_20px_rgba(20,241,217,0.5)] hover:bg-[#00DCBE] transform hover:scale-105 transition-all outline-none focus:ring-2 focus:ring-[#14F1D9]"
          >
            {game.isInstalled ? (
              <>
                <Play className="w-3.5 h-3.5 fill-[#0B0F12]" /> Play Now
              </>
            ) : (
              <>
                <Download className="w-3.5 h-3.5" /> Install
              </>
            )}
          </button>
        </div>

        {/* Bottom Poster Info (Release year, hours) */}
        <div className="absolute bottom-2.5 inset-x-2.5 flex items-center justify-between z-10 text-[11px] text-[#8B9EAE]">
          <span className="font-mono bg-black/60 backdrop-blur-sm px-1.5 py-0.5 rounded border border-white/5">
            {game.releaseYear}
          </span>
          {game.hoursPlayed > 0 && (
            <span className="flex items-center gap-1 font-mono bg-black/60 backdrop-blur-sm px-1.5 py-0.5 rounded border border-white/5 text-[#14F1D9]">
              <Clock className="w-3 h-3" />
              {game.hoursPlayed.toFixed(1)}h
            </span>
          )}
        </div>
      </div>

      {/* Card Footer / Details */}
      <div className="p-3 flex flex-col justify-between flex-1 bg-[#131A20]">
        <div>
          <h3 className="font-bold text-sm text-[#F8FAFC] group-hover:text-[#14F1D9] transition-colors line-clamp-1">
            {game.title}
          </h3>
          <p className="text-xs text-[#8B9EAE] line-clamp-1 mt-0.5">{game.developer}</p>
        </div>

        {/* Genres & Achievements summary */}
        <div className="mt-2.5 pt-2 border-t border-[#1E2B35] flex items-center justify-between text-[11px] text-[#8B9EAE]">
          <span className="truncate max-w-[120px]">{game.genres[0]}</span>
          <span className="flex items-center gap-1 text-xs">
            <Award className="w-3 h-3 text-amber-400" />
            <span className="font-mono text-[#F8FAFC]">
              {game.achievements.unlocked}/{game.achievements.total}
            </span>
          </span>
        </div>
      </div>
    </div>
  );
};
