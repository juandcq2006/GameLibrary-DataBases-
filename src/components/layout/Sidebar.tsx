import React from 'react';
import {
  Layers,
  Heart,
  FolderHeart,
  Sparkles,
  Sword,
  Compass,
  Cpu,
  Clock,
  HardDrive,
} from 'lucide-react';
import type { FilterCategory } from '../../types/game';

interface SidebarProps {
  currentCategory: FilterCategory;
  onSelectCategory: (cat: FilterCategory) => void;
  selectedGenre: string | null;
  onSelectGenre: (genre: string | null) => void;
  installedCount: number;
  favoritesCount: number;
  totalCount: number;
  installedStorageGb: number;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentCategory,
  onSelectCategory,
  selectedGenre,
  onSelectGenre,
  favoritesCount,
  totalCount,
  installedStorageGb,
}) => {
  const TOTAL_STORAGE_GB = 1024; // 1 TB SSD capacity
  const storagePercentage = Math.min(
    100,
    Math.round((installedStorageGb / TOTAL_STORAGE_GB) * 100)
  );

  const collections = [
    { id: 'RPG', name: 'RPGs & Adventures', icon: Sword },
    { id: 'Action', name: 'Action & Combat', icon: Sparkles },
    { id: 'Indie', name: 'Indie Highlights', icon: Compass },
    { id: 'Sci-Fi', name: 'Sci-Fi & Cyberpunk', icon: Cpu },
    { id: 'Backlog', name: 'Backlog (Unplayed)', icon: Clock },
  ];

  const handleCategoryClick = (cat: FilterCategory) => {
    onSelectCategory(cat);
    onSelectGenre(null);
  };

  const handleCollectionClick = (genreId: string) => {
    if (selectedGenre === genreId) {
      onSelectGenre(null);
    } else {
      onSelectGenre(genreId);
    }
  };

  return (
    <aside className="w-64 shrink-0 hidden md:flex flex-col justify-between h-[calc(100vh-4rem)] bg-[#131F2E] dark:bg-[#131F2E] light:bg-white border-r border-[#22354B] dark:border-[#22354B] light:border-[#CBD5E1] p-4 select-none transition-colors">
      <div className="space-y-6 overflow-y-auto pr-1">
        {/* Main Library Navigation */}
        <div>
          <div className="text-[11px] font-bold text-[#8BA0B2] dark:text-[#8BA0B2] light:text-[#64748B] uppercase tracking-wider px-3 mb-2">
            Library
          </div>
          <nav className="space-y-1">
            <button
              onClick={() => handleCategoryClick('all')}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                currentCategory === 'all' && selectedGenre === null
                  ? 'bg-[#1A2A3D] dark:bg-[#1A2A3D] light:bg-[#E2E8F0] text-[#00FFD1] dark:text-[#00FFD1] light:text-[#00897B] border border-[#00FFD1]/40 shadow-[0_0_15px_rgba(0,255,209,0.2)] font-bold'
                  : 'text-[#8BA0B2] dark:text-[#8BA0B2] light:text-[#64748B] hover:text-[#F1F5F9] dark:hover:text-[#F1F5F9] light:hover:text-[#0F172A] hover:bg-[#1A2A3D]/70 dark:hover:bg-[#1A2A3D]/70 light:hover:bg-[#F1F5F9] border border-transparent'
              }`}
            >
              <div className="flex items-center gap-3">
                <Layers className="w-4 h-4" />
                <span>All Games</span>
              </div>
              <span className="text-xs font-mono px-2 py-0.5 rounded-md bg-[#0B141E] dark:bg-[#0B141E] light:bg-[#E2E8F0] text-[#8BA0B2] dark:text-[#8BA0B2] light:text-[#475569]">
                {totalCount}
              </span>
            </button>

            {/* Note: "Installed" button has been completely eliminated as requested */}

            <button
              onClick={() => handleCategoryClick('favorites')}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                currentCategory === 'favorites' && selectedGenre === null
                  ? 'bg-[#1A2A3D] dark:bg-[#1A2A3D] light:bg-[#E2E8F0] text-[#00FFD1] dark:text-[#00FFD1] light:text-[#00897B] border border-[#00FFD1]/40 shadow-[0_0_15px_rgba(0,255,209,0.2)] font-bold'
                  : 'text-[#8BA0B2] dark:text-[#8BA0B2] light:text-[#64748B] hover:text-[#F1F5F9] dark:hover:text-[#F1F5F9] light:hover:text-[#0F172A] hover:bg-[#1A2A3D]/70 dark:hover:bg-[#1A2A3D]/70 light:hover:bg-[#F1F5F9] border border-transparent'
              }`}
            >
              <div className="flex items-center gap-3">
                <Heart className="w-4 h-4 text-rose-400" />
                <span>Favorites</span>
              </div>
              <span className="text-xs font-mono px-2 py-0.5 rounded-md bg-[#0B141E] dark:bg-[#0B141E] light:bg-[#E2E8F0] text-[#8BA0B2] dark:text-[#8BA0B2] light:text-[#475569]">
                {favoritesCount}
              </span>
            </button>
          </nav>
        </div>

        {/* Collections / Categories */}
        <div>
          <div className="flex items-center justify-between px-3 mb-2">
            <span className="text-[11px] font-bold text-[#8BA0B2] dark:text-[#8BA0B2] light:text-[#64748B] uppercase tracking-wider">
              Collections
            </span>
            <FolderHeart className="w-3.5 h-3.5 text-[#8BA0B2] dark:text-[#8BA0B2] light:text-[#64748B]" />
          </div>
          <nav className="space-y-1">
            {collections.map((col) => {
              const Icon = col.icon;
              const isActive = selectedGenre === col.id;
              return (
                <button
                  key={col.id}
                  onClick={() => handleCollectionClick(col.id)}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium transition-all ${
                    isActive
                      ? 'bg-[#1A2A3D] dark:bg-[#1A2A3D] light:bg-[#E2E8F0] text-[#00FFD1] dark:text-[#00FFD1] light:text-[#00897B] border border-[#00FFD1]/40 font-bold shadow-sm'
                      : 'text-[#8BA0B2] dark:text-[#8BA0B2] light:text-[#64748B] hover:text-[#F1F5F9] dark:hover:text-[#F1F5F9] light:hover:text-[#0F172A] hover:bg-[#1A2A3D]/50 dark:hover:bg-[#1A2A3D]/50 light:hover:bg-[#F1F5F9] border border-transparent'
                  }`}
                >
                  <div className="flex items-center gap-2.5 truncate">
                    <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-[#00FFD1]' : 'text-[#8BA0B2]'}`} />
                    <span className="truncate">{col.name}</span>
                  </div>
                  {isActive && (
                    <span className="w-1.5 h-1.5 rounded-full bg-[#00FFD1] shadow-[0_0_8px_#00FFD1]" />
                  )}
                </button>
              );
            })}
          </nav>
        </div>
      </div>

      {/* Storage Gauge */}
      <div className="pt-4 border-t border-[#22354B] dark:border-[#22354B] light:border-[#CBD5E1]">
        <div className="p-3.5 rounded-2xl bg-[#1A2A3D] dark:bg-[#1A2A3D] light:bg-[#F8FAFC] border border-[#22354B] dark:border-[#22354B] light:border-[#CBD5E1]">
          <div className="flex items-center justify-between text-xs mb-2">
            <div className="flex items-center gap-2 text-[#F1F5F9] dark:text-[#F1F5F9] light:text-[#0F172A] font-semibold">
              <HardDrive className="w-3.5 h-3.5 text-[#00FFD1]" />
              <span>NVMe Storage</span>
            </div>
            <span className="text-xs font-mono font-bold text-[#00FFD1] dark:text-[#00FFD1] light:text-[#00897B]">
              {storagePercentage}%
            </span>
          </div>

          {/* Storage Bar */}
          <div className="w-full bg-[#0B141E] dark:bg-[#0B141E] light:bg-[#E2E8F0] h-2 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-[#00FFD1] to-[#00E5BC] transition-all duration-500 shadow-[0_0_12px_rgba(0,255,209,0.5)]"
              style={{ width: `${storagePercentage}%` }}
            />
          </div>

          <div className="flex items-center justify-between mt-2 text-[11px] text-[#8BA0B2] dark:text-[#8BA0B2] light:text-[#64748B]">
            <span>
              <strong className="text-[#F1F5F9] dark:text-[#F1F5F9] light:text-[#0F172A] font-mono">{installedStorageGb.toFixed(1)} GB</strong>
            </span>
            <span>{TOTAL_STORAGE_GB} GB Total</span>
          </div>
        </div>
      </div>
    </aside>
  );
};
