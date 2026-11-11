import React, { useEffect, useRef, useState } from 'react';
import {
  CaretDownIcon,
  GameControllerIcon,
  MagnifyingGlassIcon,
  SignInIcon,
  SignOutIcon,
  TrophyIcon,
  UserPlusIcon,
  XIcon,
} from '@phosphor-icons/react';

import type { AuthUser } from '../shared/domain/game';
import { Button } from '../shared/ui/Button';
import { GeekbondLogo } from '../shared/ui/GeekbondLogo';

// Picks the shortcut hint shown in the search box (⌘K vs Ctrl+K); App handles both keys.
const IS_MAC = /Mac|iPhone|iPad/.test(navigator.platform);

interface TopBarProps {
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  currentUser: AuthUser | null;
  onOpenAuth: (mode: 'login' | 'signup') => void;
  onLogOut: () => void;
  onOpenActivity: () => void;
}

/**
 * Sticky header: logo, global search (focus with Ctrl/⌘+K) and real account controls.
 */
export const TopBar: React.FC<TopBarProps> = ({
  searchQuery,
  setSearchQuery,
  currentUser,
  onOpenAuth,
  onLogOut,
  onOpenActivity,
}) => {
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const profileMenuRef = useRef<HTMLDivElement>(null);

  // Escape or outside click closes the account menu
  useEffect(() => {
    if (!showProfileMenu) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowProfileMenu(false);
    };
    const onPointerDown = (e: PointerEvent) => {
      if (profileMenuRef.current && !profileMenuRef.current.contains(e.target as Node)) {
        setShowProfileMenu(false);
      }
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onPointerDown);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onPointerDown);
    };
  }, [showProfileMenu]);

  return (
    <header className="sticky top-0 z-40 w-full h-16 bg-surface/95 backdrop-blur-md border-b border-line px-3 md:px-6 flex items-center justify-between gap-2 transition-colors">
      {/* Left: Branding */}
      <div className="flex items-center gap-3 shrink-0">
        <div className="w-9 h-9 rounded-xl bg-accent flex items-center justify-center">
          <GameControllerIcon className="w-5 h-5 text-canvas" />
        </div>
        <GeekbondLogo size="sm" showSubtitle={false} className="hidden sm:flex" />
      </div>

      {/* Center: Search & Shortcut */}
      <div className="flex-1 min-w-0 max-w-xl mx-2 md:mx-8">
        <div className="relative flex items-center">
          <MagnifyingGlassIcon className="absolute left-3.5 w-4 h-4 text-muted pointer-events-none" />
          <input
            id="global-search-input"
            type="search"
            aria-label="Search games"
            placeholder="Search games…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-elevated text-ink placeholder-muted text-sm rounded-xl pl-10 pr-24 py-2 [&::-webkit-search-cancel-button]:hidden border border-line transition-all outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
          />
          <div className="absolute right-2.5 flex items-center gap-1.5">
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="p-1 rounded-lg text-muted hover:text-accent transition-colors"
                aria-label="Clear search"
              >
                <XIcon className="w-3.5 h-3.5" />
              </button>
            )}
            <kbd className="hidden sm:inline-flex items-center gap-0.5 px-2 py-0.5 text-xs font-semibold text-muted bg-surface border border-line rounded-lg shadow-sm select-none">
              {IS_MAC ? '⌘K' : 'Ctrl K'}
            </kbd>
          </div>
        </div>
      </div>

      {/* Right: Account Auth / Signed-in Menu */}
      <div className="flex items-center gap-2 shrink-0">
        {currentUser ? (
          <div ref={profileMenuRef} className="relative">
            <button
              type="button"
              onClick={() => setShowProfileMenu((open) => !open)}
              className="flex items-center gap-2.5 p-1 pl-1.5 pr-2.5 rounded-xl bg-elevated border border-line hover:border-accent/50 transition-all outline-none focus-visible:ring-2 focus-visible:ring-accent"
              id="user-profile-btn"
              aria-label="Account"
              aria-expanded={showProfileMenu}
            >
              <span className="w-7 h-7 rounded-lg bg-accent text-canvas font-bold text-xs flex items-center justify-center uppercase">
                {currentUser.username.slice(0, 2)}
              </span>
              <span className="hidden sm:inline text-sm font-semibold text-ink max-w-[140px] truncate">
                {currentUser.username}
              </span>
              <CaretDownIcon className="hidden sm:block w-3.5 h-3.5 text-muted" />
            </button>

            {showProfileMenu && (
              <div className="absolute right-0 mt-3 w-56 bg-surface border border-line rounded-2xl shadow-2xl p-2 z-50">
                <div className="px-3 py-2 border-b border-line mb-1">
                  <p className="text-sm font-semibold text-ink truncate">{currentUser.username}</p>
                  <p className="text-xs text-muted truncate">{currentUser.email}</p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setShowProfileMenu(false);
                    onOpenActivity();
                  }}
                  className="w-full text-left px-3 py-2 text-xs text-muted hover:text-ink hover:bg-elevated rounded-lg transition-colors flex items-center gap-2"
                >
                  <TrophyIcon className="w-4 h-4 text-accent" />
                  Achievements &amp; Activity
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowProfileMenu(false);
                    onLogOut();
                  }}
                  className="w-full text-left px-3 py-2 text-xs text-rose-400 hover:bg-elevated rounded-lg transition-colors flex items-center gap-2"
                >
                  <SignOutIcon className="w-4 h-4" />
                  Log out
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onOpenAuth('login')}
              leftIcon={<SignInIcon className="w-4 h-4" />}
            >
              Log in
            </Button>
            <Button
              type="button"
              variant="primary"
              size="sm"
              onClick={() => onOpenAuth('signup')}
              leftIcon={<UserPlusIcon className="w-4 h-4" />}
            >
              <span className="hidden sm:inline">Sign up</span>
              <span className="sm:hidden">Join</span>
            </Button>
          </div>
        )}
      </div>
    </header>
  );
};
