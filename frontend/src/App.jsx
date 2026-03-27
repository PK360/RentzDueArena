import React, { useEffect, useRef, useState } from 'react';
import {
  Check,
  Copy,
  Droplet,
  FileCode2,
  Home,
  Info,
  Library,
  LogIn,
  Settings,
  Sparkles,
  Swords,
  Trophy,
  UserRound,
  Users,
  Users2
} from 'lucide-react';
import clsx from 'clsx';
import { io } from 'socket.io-client';

const socket = io(import.meta.env.VITE_SOCKET_URL || window.location.origin, {
  autoConnect: false
});

const SUIT_SYMBOLS = {
  H: '♥',
  D: '♦',
  C: '♣',
  S: '♠'
};

const SUIT_NAMES = {
  H: 'Hearts',
  D: 'Diamonds',
  C: 'Clubs',
  S: 'Spades'
};

const VALUE_ORDER = ['A', 'K', 'Q', 'J', '10', '9', '8', '7', '6', '5', '4', '3', '2'];
const SUIT_ORDER = ['H', 'S', 'D', 'C'];
const STORAGE_KEYS = {
  theme: 'rentz-theme',
  fontScale: 'rentz-font-scale',
  pageZoom: 'rentz-page-zoom'
};
const FONT_SCALE_RANGE = { min: 70, max: 130, step: 5, defaultValue: 100 };
const PAGE_ZOOM_RANGE = { min: 100, max: 125, step: 5, defaultValue: 100 };
const OPPONENT_SEAT_ROLES = ['top', 'left', 'right', 'top-left', 'top-right'];

function createStepValues(min, max, step) {
  const values = [];

  for (let value = min; value <= max; value += step) {
    values.push(value);
  }

  return values;
}

function getStepAlignedMidpoint(min, max, step) {
  const midpoint = (min + max) / 2;
  const steppedMidpoint = Math.round((midpoint - min) / step) * step + min;
  return Math.min(max, Math.max(min, steppedMidpoint));
}

function readStoredPreference(key, fallback, allowedValues) {
  if (typeof window === 'undefined') {
    return fallback;
  }

  try {
    const storedValue = window.localStorage.getItem(key);
    if (storedValue == null) {
      return fallback;
    }

    if (typeof fallback === 'number') {
      const parsedValue = Number(storedValue);
      return allowedValues.includes(parsedValue) ? parsedValue : fallback;
    }

    return allowedValues.includes(storedValue) ? storedValue : fallback;
  } catch {
    return fallback;
  }
}

function parseCard(cardString) {
  const [value, suit] = cardString.split('-');
  return { value, suit };
}

function sortCards(cards) {
  return [...cards].sort((leftCard, rightCard) => {
    const left = parseCard(leftCard);
    const right = parseCard(rightCard);

    const suitDiff = SUIT_ORDER.indexOf(left.suit) - SUIT_ORDER.indexOf(right.suit);
    if (suitDiff !== 0) {
      return suitDiff;
    }

    return VALUE_ORDER.indexOf(left.value) - VALUE_ORDER.indexOf(right.value);
  });
}

function getPlayerName(player) {
  return player?.name || player?.displayName || 'Player';
}

function getPlayerInitials(player) {
  const name = getPlayerName(player).trim();
  if (!name) {
    return 'P';
  }

  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }

  return `${parts[0][0] || ''}${parts[1][0] || ''}`.toUpperCase();
}

function getPlayerAvatarSource(player) {
  return (
    player?.avatarUrl ||
    player?.avatar ||
    player?.profileImageUrl ||
    player?.profileImage ||
    player?.image ||
    null
  );
}

function getPlayerRating(player) {
  return player?.elo ?? player?.rating ?? player?.mmr ?? player?.rank ?? null;
}

function getPlayerPoints(player) {
  return player?.points ?? player?.score ?? player?.totalPoints ?? null;
}

function getPlayerPresence(player) {
  if (typeof player?.isConnected === 'boolean') {
    return player.isConnected;
  }

  if (typeof player?.connected === 'boolean') {
    return player.connected;
  }

  return Boolean(player?.socketId || player?.userId);
}

function formatMetaValue(value, fallback = '--') {
  if (value == null || value === '') {
    return fallback;
  }

  return `${value}`;
}

function formatMarkingSuit(trickSuit) {
  if (!trickSuit) {
    return 'Waiting...';
  }

  return `${SUIT_NAMES[trickSuit].toUpperCase()} ${SUIT_SYMBOLS[trickSuit]}`;
}

function canPlayCard({ card, hand, trickSuit, isMyTurn, trickPending }) {
  if (!isMyTurn || trickPending) {
    return false;
  }

  if (!trickSuit) {
    return true;
  }

  const { suit } = parseCard(card);
  if (suit === trickSuit) {
    return true;
  }

  return !hand.some((handCard) => parseCard(handCard).suit === trickSuit);
}

async function copyTextToClipboard(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textArea = document.createElement('textarea');
  textArea.value = text;
  textArea.setAttribute('readonly', '');
  textArea.style.position = 'absolute';
  textArea.style.left = '-9999px';
  document.body.appendChild(textArea);
  textArea.select();
  document.execCommand('copy');
  document.body.removeChild(textArea);
}

const CARD_PIP_LAYOUTS = {
  A: [{ x: 50, y: 50 }],
  '2': [{ x: 50, y: 22 }, { x: 50, y: 78, invert: true }],
  '3': [{ x: 50, y: 20 }, { x: 50, y: 50 }, { x: 50, y: 80, invert: true }],
  '4': [{ x: 33, y: 23 }, { x: 67, y: 23 }, { x: 33, y: 77, invert: true }, { x: 67, y: 77, invert: true }],
  '5': [{ x: 33, y: 23 }, { x: 67, y: 23 }, { x: 50, y: 50 }, { x: 33, y: 77, invert: true }, { x: 67, y: 77, invert: true }],
  '6': [{ x: 33, y: 21 }, { x: 67, y: 21 }, { x: 33, y: 50 }, { x: 67, y: 50 }, { x: 33, y: 79, invert: true }, { x: 67, y: 79, invert: true }],
  '7': [{ x: 33, y: 21 }, { x: 67, y: 21 }, { x: 50, y: 34 }, { x: 33, y: 50 }, { x: 67, y: 50 }, { x: 33, y: 79, invert: true }, { x: 67, y: 79, invert: true }],
  '8': [{ x: 33, y: 19 }, { x: 67, y: 19 }, { x: 50, y: 33 }, { x: 33, y: 50 }, { x: 67, y: 50 }, { x: 50, y: 67, invert: true }, { x: 33, y: 81, invert: true }, { x: 67, y: 81, invert: true }],
  '9': [{ x: 33, y: 18 }, { x: 67, y: 18 }, { x: 50, y: 30 }, { x: 33, y: 44 }, { x: 67, y: 44 }, { x: 50, y: 56, invert: true }, { x: 33, y: 70, invert: true }, { x: 67, y: 70, invert: true }, { x: 50, y: 82, invert: true }],
  '10': [{ x: 33, y: 18 }, { x: 67, y: 18 }, { x: 50, y: 30 }, { x: 33, y: 42 }, { x: 67, y: 42 }, { x: 33, y: 58, invert: true }, { x: 67, y: 58, invert: true }, { x: 50, y: 70, invert: true }, { x: 33, y: 82, invert: true }, { x: 67, y: 82, invert: true }]
};

function CardIndex({ value, suit, compact = false, bottom = false }) {
  return (
    <div
      className={clsx(
        'absolute flex flex-col items-center leading-none',
        compact ? 'gap-[1px]' : 'gap-[2px]',
        bottom ? 'bottom-[6%] right-[7%] rotate-180' : 'left-[7%] top-[6%]'
      )}
    >
      <span className={clsx('font-serif font-bold tracking-tight', compact ? 'text-[0.68rem]' : 'text-[0.98rem] sm:text-[1.08rem] md:text-[1.3rem]')}>
        {value}
      </span>
      <span className={clsx('font-serif', compact ? 'text-[0.7rem]' : 'text-[0.95rem] sm:text-[1rem] md:text-[1.18rem]')}>
        {SUIT_SYMBOLS[suit]}
      </span>
    </div>
  );
}

function CardCenterFace({ value, suit, compact = false }) {
  const pipLayout = CARD_PIP_LAYOUTS[value];

  if (pipLayout) {
    return (
      <div className="absolute inset-[16%_16%_14%]">
        {pipLayout.map((pip, index) => (
          <span
            key={`${value}-${suit}-${index}`}
            className={clsx(
              'absolute select-none font-serif leading-none',
              compact ? 'text-[1rem] sm:text-[1.05rem]' : 'text-[1.18rem] sm:text-[1.4rem] md:text-[1.7rem] lg:text-[1.85rem]'
            )}
            style={{
              left: `${pip.x}%`,
              top: `${pip.y}%`,
              transform: `translate(-50%, -50%)${pip.invert ? ' rotate(180deg)' : ''}`
            }}
            aria-hidden="true"
          >
            {SUIT_SYMBOLS[suit]}
          </span>
        ))}
      </div>
    );
  }

  return (
    <div className="absolute inset-[22%_16%_18%] flex items-center justify-center">
      <span className={clsx('font-serif leading-none', compact ? 'text-[1.5rem]' : 'text-[2.15rem] sm:text-[2.45rem] md:text-[3.3rem]')}>
        {SUIT_SYMBOLS[suit]}
      </span>
    </div>
  );
}

function Card({ cardString, onClick, disabled, ghosted = false, compact = false, title = '', variant = 'default' }) {
  if (!cardString) {
    return null;
  }

  const { value, suit } = parseCard(cardString);
  const isRed = suit === 'H' || suit === 'D';
  const isCompactCard = compact || variant === 'trick';

  return (
    <button
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      title={title}
      className={clsx(
        'relative flex shrink-0 flex-col justify-between overflow-hidden border border-slate-500/55 bg-gradient-to-b from-white via-white to-slate-50 transition-all duration-200',
        variant === 'trick' ? 'rounded-none' : 'rounded-[0.38rem]',
        variant === 'trick'
          ? 'h-full w-full p-[0.26rem] sm:p-[0.28rem]'
          : compact
            ? 'h-[3.85rem] w-[2.6rem] p-1 sm:h-[4.3rem] sm:w-[2.9rem] md:h-[4.75rem] md:w-[3.2rem]'
            : 'h-[5.2rem] w-[3.45rem] p-1.5 sm:h-[5.95rem] sm:w-[3.95rem] sm:p-1.5 md:h-[8rem] md:w-[5.2rem] md:p-2 lg:h-[8.7rem] lg:w-[5.65rem]',
        'shadow-[0_8px_18px_rgba(0,0,0,0.14),inset_0_1px_0_rgba(255,255,255,0.96)]',
        isRed ? 'text-red-500' : 'text-slate-800',
        disabled && ghosted
          ? 'cursor-not-allowed opacity-35 saturate-0 blur-[0.2px]'
          : disabled
            ? 'cursor-default opacity-80'
            : 'cursor-pointer hover:-translate-y-3 hover:shadow-[0_18px_28px_-14px_rgba(0,0,0,0.38)]'
      )}
    >
      <CardIndex value={value} suit={suit} compact={isCompactCard} />
      <CardIndex value={value} suit={suit} compact={isCompactCard} bottom />
      <CardCenterFace value={value} suit={suit} compact={isCompactCard} />
    </button>
  );
}

function ThemeTray({ themes, theme, onThemeChange, mobile = false }) {
  return (
    <div
      className={clsx(
        'relative z-40',
        mobile ? 'flex gap-2 overflow-x-auto p-2' : 'grid grid-cols-1 gap-2.5 p-0 sm:grid-cols-2'
      )}
    >
      {themes.map((themeOption) => (
        <button
          type="button"
          key={themeOption.id}
          onClick={() => onThemeChange(themeOption.id)}
          className={clsx(
            'theme-chip relative z-10',
            theme === themeOption.id ? 'theme-chip-active scale-[1.02]' : 'text-[var(--text-secondary)]'
          )}
        >
          {themeOption.label}
        </button>
      ))}
    </div>
  );
}

function SettingsSlider({ title, description, min, max, step, value, defaultValue, onChange }) {
  const midpointValue = getStepAlignedMidpoint(min, max, step);

  return (
    <section className="glass-panel p-5 sm:p-6">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h4 className="text-xl font-display font-black text-[var(--text-primary)] sm:text-2xl">{title}</h4>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="status-pill w-fit px-4 py-2">{value}%</div>
          <button
            type="button"
            onClick={() => onChange(defaultValue)}
            className="rounded-full border border-[var(--glass-border)] bg-[var(--surface-medium)] px-4 py-2 text-xs font-black uppercase tracking-[0.16em] text-[var(--text-primary)] transition hover:bg-[var(--surface-hover)]"
          >
            Reset
          </button>
        </div>
      </div>

      <div className="rounded-[1.4rem] border border-[var(--glass-border)] bg-[var(--surface-soft)] px-4 py-4 sm:px-5">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(event) => onChange(Number(event.target.value))}
          className="settings-slider"
          aria-label={title}
        />
        <div className="mt-3 flex items-center justify-between gap-3 text-[11px] font-extrabold uppercase tracking-[0.14em] text-[var(--text-secondary)] sm:text-xs">
          <span>{min}%</span>
          <span>{midpointValue}%</span>
          <span>{max}%</span>
        </div>
        <p className="mt-3 text-xs font-semibold leading-6 text-[var(--text-secondary)]">
          {description}
        </p>
      </div>
    </section>
  );
}

function ChromePanelHeader({ title, accent = 'neutral' }) {
  return (
    <div className="rentz-panel-header">
      <div className="rentz-panel-dots" aria-hidden="true">
        <span className="is-red" />
        <span className="is-yellow" />
        <span className="is-green" />
      </div>
      <h4 className={clsx('rentz-panel-title', accent === 'light' && 'text-white')}>{title}</h4>
    </div>
  );
}

function RentzSeatCluster({
  player,
  seatRole = 'top',
  isCurrent = false,
  isWinner = false,
  cardCount = 0,
  tricksWon = 0,
  points = null,
  mobileHero = false,
  onEmojiClick
}) {
  const avatarSource = getPlayerAvatarSource(player);
  const rating = getPlayerRating(player);
  const isConnected = getPlayerPresence(player);

  return (
    <article
      className={clsx(
        'rentz-seat-cluster',
        `rentz-seat-cluster-${seatRole}`,
        mobileHero && 'rentz-seat-cluster-hero',
        isWinner && 'is-winner',
        isCurrent && !mobileHero && 'is-current'
      )}
    >
      {isCurrent && !mobileHero && (
        <div className="rentz-seat-turn-marker" aria-label={`${getPlayerName(player)} is the current player`} />
      )}

      <div className="rentz-seat-name">{getPlayerName(player)}</div>

      <div className="rentz-avatar-wrap">
        <button
          type="button"
          onClick={onEmojiClick}
          className="rentz-emoji-button"
          title="Emoji reactions are not wired yet"
          aria-label={`Open emoji reaction menu for ${getPlayerName(player)}`}
        >
          🙂
        </button>
        <span
          className={clsx('rentz-presence-dot', isConnected ? 'is-online' : 'is-offline')}
          title={isConnected ? 'Present in room' : 'Not currently connected'}
        />

        <div className="rentz-avatar-shell">
          {avatarSource ? (
            <img
              src={avatarSource}
              alt={`${getPlayerName(player)} avatar`}
              className="rentz-avatar-image"
            />
          ) : (
            <div className="rentz-avatar-fallback">{getPlayerInitials(player)}</div>
          )}

          <div className="rentz-elo-badge">
            <Trophy className="h-3 w-3" />
            <span>{rating == null ? 'ELO --' : `ELO ${rating}`}</span>
          </div>
        </div>
      </div>

      <div className="rentz-seat-stats">
        <div className="rentz-seat-stat">
          <span className="rentz-seat-stat-value">{tricksWon}</span>
          <span className="rentz-seat-stat-label">hands</span>
        </div>
        <div className="rentz-seat-stat">
          <span className="rentz-seat-stat-value">{formatMetaValue(points)}</span>
          <span className="rentz-seat-stat-label">points</span>
        </div>
        <div className="rentz-seat-stat">
          <span className="rentz-seat-stat-value">{cardCount}</span>
          <span className="rentz-seat-stat-label">cards</span>
        </div>
      </div>
    </article>
  );
}

function CompactPlayerRow({ player, isCurrent, isLocal, cardCount, tricksWon, points }) {
  const rating = getPlayerRating(player);
  const isConnected = getPlayerPresence(player);

  return (
    <div className={clsx('rentz-player-row', isCurrent && 'is-current')}>
      <div className="rentz-player-row-avatar">{getPlayerInitials(player)}</div>
      <div className="rentz-player-row-copy">
        <div className="rentz-player-row-name">
          {getPlayerName(player)} {isLocal ? '(You)' : ''}
        </div>
        <div className="rentz-player-row-meta">
          <span>{rating == null ? 'ELO --' : `ELO ${rating}`}</span>
          <span>{cardCount} cards</span>
          <span>{tricksWon} hands</span>
          <span>{formatMetaValue(points)} pts</span>
        </div>
      </div>
      <span
        className={clsx('rentz-player-row-presence', isConnected ? 'is-online' : 'is-offline')}
        title={isConnected ? 'Present in room' : 'Not currently connected'}
      />
    </div>
  );
}

function TrickBoard({ currentTrick, playerCount, trickSuit, trickPending }) {
  const slotCount = Math.max(4, Math.min(6, playerCount || 4));

  return (
    <section className={clsx('rentz-trick-board', trickPending && 'is-pending')}>
      <div className="rentz-trick-board-heading">
        <span>Central trick board</span>
        <span>{trickSuit ? `Lead ${SUIT_NAMES[trickSuit]}` : 'Waiting for lead card'}</span>
      </div>

      <div className={clsx('rentz-trick-grid', slotCount > 4 && 'has-six-slots')}>
        {Array.from({ length: slotCount }).map((_, index) => {
          const play = currentTrick[index];

          return (
            <div key={`trick-slot-${index}`} className={clsx('rentz-trick-slot', play && 'is-filled')}>
              <div className="rentz-trick-card-frame">
                {play ? (
                  <Card cardString={play.card} compact disabled variant="trick" />
                ) : (
                  <div className="rentz-trick-placeholder">
                    <span className="rentz-trick-placeholder-card" />
                  </div>
                )}
              </div>
              <span className={clsx('rentz-trick-slot-name', !play && 'is-placeholder')}>
                {play?.playerName || 'Waiting'}
              </span>
            </div>
          );
        })}

        <span className="rentz-trick-arrow arrow-one" aria-hidden="true">→</span>
        <span className="rentz-trick-arrow arrow-two" aria-hidden="true">↓</span>
        <span className="rentz-trick-arrow arrow-three" aria-hidden="true">←</span>
        <span className="rentz-trick-arrow arrow-four" aria-hidden="true">↑</span>
      </div>
    </section>
  );
}

function CollectedHandsView({ players, collectedHandsByPlayer, myPlayerId }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {players.map((player) => {
        const tricks = collectedHandsByPlayer[player.userId] || [];
        const isMe = player.userId === myPlayerId;

        return (
          <section key={player.userId} className="glass-panel p-4 sm:p-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h4 className="text-xl font-display font-black text-[var(--text-primary)]">
                  {getPlayerName(player)} {isMe ? '(You)' : ''}
                </h4>
                <p className="text-sm font-semibold text-[var(--text-secondary)]">
                  {tricks.length} collected hand{tricks.length === 1 ? '' : 's'}
                </p>
              </div>
              <div className="status-pill px-3 py-2">{tricks.length}</div>
            </div>

            {tricks.length === 0 ? (
              <div className="rounded-[1.3rem] border border-dashed border-[var(--glass-border)] bg-[var(--surface-subtle)] p-5 text-sm font-semibold text-[var(--text-secondary)]">
                No hands collected yet.
              </div>
            ) : (
              <div className="space-y-3">
                {tricks.map((trick, trickIndex) => (
                  <div key={`${player.userId}-${trickIndex}`} className="rounded-[1.3rem] border border-[var(--glass-border)] bg-[var(--surface-subtle)] p-4">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <span className="text-sm font-extrabold uppercase tracking-[0.18em] text-[var(--text-secondary)]">
                        Hand {trickIndex + 1}
                      </span>
                      <span className="text-xs font-bold text-[var(--text-secondary)]">
                        Won by {getPlayerName(player)}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {trick.map((play, playIndex) => (
                        <div key={`${player.userId}-${trickIndex}-${playIndex}`} className="flex flex-col items-center gap-1">
                          <Card cardString={play.card} compact disabled />
                          <span className="max-w-[4.5rem] truncate text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--text-secondary)]">
                            {play.playerName}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}

function App() {
  const [theme, setTheme] = useState(() =>
    readStoredPreference(
      STORAGE_KEYS.theme,
      'theme-frutiger-lime',
      ['theme-frutiger-lime', 'theme-dark-glass', 'theme-light-gloss', 'theme-colorful-aero']
    )
  );
  const [fontScale, setFontScale] = useState(() =>
    readStoredPreference(
      STORAGE_KEYS.fontScale,
      FONT_SCALE_RANGE.defaultValue / 100,
      createStepValues(FONT_SCALE_RANGE.min, FONT_SCALE_RANGE.max, FONT_SCALE_RANGE.step).map((value) => value / 100)
    )
  );
  const [pageZoom, setPageZoom] = useState(() =>
    readStoredPreference(
      STORAGE_KEYS.pageZoom,
      PAGE_ZOOM_RANGE.defaultValue / 100,
      createStepValues(PAGE_ZOOM_RANGE.min, PAGE_ZOOM_RANGE.max, PAGE_ZOOM_RANGE.step).map((value) => value / 100)
    )
  );
  const [activeTab, setActiveTab] = useState('play');
  const [playView, setPlayView] = useState('table');

  const [inLobby, setInLobby] = useState(false);
  const [roomId, setRoomId] = useState('');
  const [joinInput, setJoinInput] = useState('');
  const [players, setPlayers] = useState([]);
  const [guestNameInput, setGuestNameInput] = useState('');
  const [guestProfile, setGuestProfile] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [userProfile, setUserProfile] = useState(null);

  const [gameStarted, setGameStarted] = useState(false);
  const [gameFinished, setGameFinished] = useState(false);
  const [trickPending, setTrickPending] = useState(false);
  const [hand, setHand] = useState([]);
  const [cardCounts, setCardCounts] = useState({});
  const [currentTrick, setCurrentTrick] = useState([]);
  const [trickSuit, setTrickSuit] = useState(null);
  const [turnIndex, setTurnIndex] = useState(0);
  const [myIndex, setMyIndex] = useState(-1);
  const [animatingWinner, setAnimatingWinner] = useState(null);
  const [trickWinnerId, setTrickWinnerId] = useState(null);
  const [roundWinnerName, setRoundWinnerName] = useState('');
  const [collectedHandsByPlayer, setCollectedHandsByPlayer] = useState({});
  const [activityFeed, setActivityFeed] = useState([]);
  const [errorMsg, setErrorMsg] = useState('');
  const [finalStandings, setFinalStandings] = useState([]);
  const [topPrompts, setTopPrompts] = useState([]);
  const topPromptTimeoutsRef = useRef(new Map());

  const [editorTitle, setEditorTitle] = useState('My House Rules');
  const [editorType, setEditorType] = useState('per_round');
  const [editorCode, setEditorCode] = useState(
    'if(HEART_KING)\n  add(-100)\n  game_end()\nendif'
  );
  const [editorStatus, setEditorStatus] = useState('');
  const [editorAst, setEditorAst] = useState(null);
  const [ruleDrafts, setRuleDrafts] = useState(() => {
    try {
      return JSON.parse(window.localStorage.getItem('rentz-rule-drafts') || '[]');
    } catch {
      return [];
    }
  });

  useEffect(() => {
    document.body.className = theme;
    document.documentElement.classList.remove(
      'theme-frutiger-lime',
      'theme-dark-glass',
      'theme-light-gloss',
      'theme-colorful-aero'
    );
    document.documentElement.classList.add(theme);

    try {
      window.localStorage.setItem(STORAGE_KEYS.theme, theme);
    } catch {
      // Ignore storage failures in restricted environments.
    }
  }, [theme]);

  useEffect(() => {
    document.documentElement.style.setProperty('--app-font-scale', `${fontScale}`);

    try {
      window.localStorage.setItem(STORAGE_KEYS.fontScale, `${fontScale}`);
    } catch {
      // Ignore storage failures in restricted environments.
    }
  }, [fontScale]);

  useEffect(() => {
    document.documentElement.style.setProperty('--page-zoom', `${pageZoom}`);

    try {
      window.localStorage.setItem(STORAGE_KEYS.pageZoom, `${pageZoom}`);
    } catch {
      // Ignore storage failures in restricted environments.
    }
  }, [pageZoom]);

  useEffect(() => {
    try {
      window.localStorage.setItem('rentz-rule-drafts', JSON.stringify(ruleDrafts));
    } catch {
      // Ignore storage failures in restricted environments.
    }
  }, [ruleDrafts]);

  useEffect(() => {
    const promptTimeouts = topPromptTimeoutsRef.current;

    socket.connect();

    socket.on('lobby_update', ({ players: lobbyPlayers }) => {
      setPlayers(lobbyPlayers);
    });

    socket.on('game_started', ({ hand: nextHand, playerIndex, turnIndex: nextTurnIndex, cardCounts: nextCardCounts, trickSuit: nextTrickSuit, collectedHandsByPlayer: nextCollectedHands }) => {
      setGameStarted(true);
      setGameFinished(false);
      setPlayView('table');
      setHand(nextHand);
      setMyIndex(playerIndex);
      setTurnIndex(nextTurnIndex);
      setTrickSuit(nextTrickSuit || null);
      setCardCounts(nextCardCounts || {});
      setCollectedHandsByPlayer(nextCollectedHands || {});
      setCurrentTrick([]);
      setTrickWinnerId(null);
      setRoundWinnerName('');
      setActivityFeed([]);
      setFinalStandings([]);
    });

    socket.on('game_update', ({ currentTrick: nextTrick, turnIndex: nextTurnIndex, trickSuit: nextTrickSuit, cardCounts: nextCardCounts }) => {
      setCurrentTrick(nextTrick);
      setTurnIndex(nextTurnIndex);
      setTrickSuit(nextTrickSuit || null);
      if (nextCardCounts) {
        setCardCounts(nextCardCounts);
      }
    });

    socket.on('hand_update', (nextHand) => {
      setHand(nextHand);
    });

    socket.on('trick_won', ({ winnerName, winnerId, collectedHandsByPlayer: nextCollectedHands, cardCounts: nextCardCounts }) => {
      setAnimatingWinner(winnerName);
      setTrickWinnerId(winnerId);
      setRoundWinnerName(winnerName);
      setTrickPending(true);
      if (nextCollectedHands) {
        setCollectedHandsByPlayer(nextCollectedHands);
      }
      if (nextCardCounts) {
        setCardCounts(nextCardCounts);
      }
      setActivityFeed((current) => [`${winnerName} took the hand.`, ...current].slice(0, 6));
    });

    socket.on('trick_end', ({ nextTurnIndex, trickSuit: nextTrickSuit, collectedHandsByPlayer: nextCollectedHands, cardCounts: nextCardCounts, gameFinished: finished }) => {
      setTurnIndex(nextTurnIndex);
      setCurrentTrick([]);
      setAnimatingWinner(null);
      if (!finished) {
        setTrickWinnerId(null);
      }
      setTrickSuit(nextTrickSuit || null);
      setTrickPending(Boolean(finished));
      if (nextCollectedHands) {
        setCollectedHandsByPlayer(nextCollectedHands);
      }
      if (nextCardCounts) {
        setCardCounts(nextCardCounts);
      }
    });

    socket.on('game_finished', ({ winnerId, winnerName, standings, collectedHandsByPlayer: nextCollectedHands, cardCounts: nextCardCounts }) => {
      setGameFinished(true);
      setTrickPending(false);
      setTrickWinnerId(winnerId);
      setAnimatingWinner(null);
      setRoundWinnerName(winnerName);
      setFinalStandings(standings || []);
      if (nextCollectedHands) {
        setCollectedHandsByPlayer(nextCollectedHands);
      }
      if (nextCardCounts) {
        setCardCounts(nextCardCounts);
      }
      setActivityFeed((current) => [`Game finished. ${winnerName} won the final hand.`, ...current].slice(0, 8));
    });

    socket.on('game_error', (message) => {
      setErrorMsg(message);
      window.setTimeout(() => setErrorMsg(''), 3000);
    });

    return () => {
      promptTimeouts.forEach((timeoutId) => {
        window.clearTimeout(timeoutId);
      });
      promptTimeouts.clear();

      socket.off('lobby_update');
      socket.off('game_started');
      socket.off('game_update');
      socket.off('hand_update');
      socket.off('trick_won');
      socket.off('trick_end');
      socket.off('game_finished');
      socket.off('game_error');
    };
  }, []);

  const showTopPrompt = (message, tone = 'info') => {
    const promptId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setTopPrompts((current) => [...current, { id: promptId, message, tone }]);

    const timeoutId = window.setTimeout(() => {
      setTopPrompts((current) => current.filter((prompt) => prompt.id !== promptId));
      topPromptTimeoutsRef.current.delete(promptId);
    }, 1200);

    topPromptTimeoutsRef.current.set(promptId, timeoutId);
  };

  const createSessionProfile = (name, guest = false) => ({
    userId: Math.random().toString(36).slice(2, 10),
    name,
    guest
  });

  const handleGuestContinue = () => {
    const trimmedName = guestNameInput.trim();
    if (!trimmedName) {
      return;
    }

    const profile = createSessionProfile(trimmedName, true);
    socket.emit('authenticate', profile);
    setGuestProfile(profile);
    setActiveTab('play');
  };

  const handleLogout = () => {
    if (inLobby || gameStarted) {
      setErrorMsg('Leave the current room before switching players.');
      window.setTimeout(() => setErrorMsg(''), 3000);
      return;
    }

    setIsAuthenticated(false);
    setUserProfile(null);
    setActiveTab('login');
  };

  const handleGuestReset = () => {
    if (inLobby || gameStarted) {
      setErrorMsg('Leave the current room before changing your guest name.');
      window.setTimeout(() => setErrorMsg(''), 3000);
      return;
    }

    setGuestNameInput(guestProfile?.name || '');
    setGuestProfile(null);
    setActiveTab('play');
  };

  const handleCreateLobby = () => {
    if (!activeProfile) {
      setErrorMsg('Choose a guest name or sign in before creating a room.');
      setActiveTab('play');
      return;
    }

    socket.emit('authenticate', activeProfile);
    socket.emit('create_lobby', {}, (response) => {
      if (response.success) {
        setRoomId(response.roomId);
        setInLobby(true);
        setGameStarted(false);
        setGameFinished(false);
        setFinalStandings([]);
        setPlayers([{ socketId: socket.id, name: activeProfile.name, isReady: true, userId: activeProfile.userId }]);
      } else if (response.error) {
        setErrorMsg(response.error);
      }
    });
  };

  const handleJoinLobby = () => {
    if (!activeProfile) {
      setErrorMsg('Choose a guest name or sign in before joining a room.');
      setActiveTab('play');
      return;
    }

    if (!joinInput.trim()) {
      return;
    }

    socket.emit('authenticate', activeProfile);
    socket.emit('join_lobby', { roomId: joinInput.toUpperCase() }, (response) => {
      if (response.success) {
        setRoomId(response.roomId);
        setInLobby(true);
        setGameStarted(false);
        setGameFinished(false);
        setFinalStandings([]);
        setPlayers(response.lobby.players);
      } else if (response.error) {
        setErrorMsg(response.error);
      }
    });
  };

  const handleParseRules = async () => {
    try {
      setEditorStatus('Parsing ruleset...');
      const response = await fetch('/api/rulesets/parse', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          code: editorCode,
          type: editorType
        })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to parse ruleset');
      }

      setEditorAst(data.ast);
      setEditorStatus('Ruleset parsed successfully.');
    } catch (error) {
      setEditorStatus(error.message);
      setEditorAst(null);
    }
  };

  const handleSaveDraft = () => {
    const nextDraft = {
      id: `${Date.now()}`,
      title: editorTitle || 'Untitled Ruleset',
      type: editorType,
      code: editorCode,
      updatedAt: new Date().toISOString()
    };

    setRuleDrafts((current) => [nextDraft, ...current.filter((draft) => draft.title !== nextDraft.title)].slice(0, 10));
    setEditorStatus('Draft saved locally.');
  };

  const handleCopyRoomCode = async () => {
    if (!roomId) {
      return;
    }

    try {
      await copyTextToClipboard(roomId);
      showTopPrompt(`Room code ${roomId} copied to clipboard.`, 'success');
    } catch {
      showTopPrompt('Could not copy the room code right now.', 'error');
    }
  };

  const toggleReady = () => socket.emit('toggle_ready', { roomId });
  const startGame = () => socket.emit('start_game', { roomId }, (response) => {
    if (response.error) {
      setErrorMsg(response.error);
    }
  });

  const applyTheme = (nextTheme) => {
    setTheme(nextTheme);
  };

  const navItems = [
    { id: 'play', label: 'Play', icon: Home },
    { id: 'friends', label: 'Friends', icon: Users },
    { id: 'library', label: 'Library', icon: Library },
    { id: 'ruleset-rater', label: 'Ruleset Rater', icon: Users2 },
    { id: 'editor', label: 'Editor', icon: FileCode2 },
    ...(!isAuthenticated ? [{ id: 'login', label: 'Login', icon: LogIn }] : [])
  ];

  const themes = [
    { id: 'theme-frutiger-lime', label: 'Frutiger Lime' },
    { id: 'theme-dark-glass', label: 'Dark Glass' },
    { id: 'theme-light-gloss', label: 'Light Gloss' },
    { id: 'theme-colorful-aero', label: 'Colorful Aero' }
  ];

  const activeProfile = isAuthenticated ? userProfile : guestProfile;
  const myPlayerId = players[myIndex]?.userId || activeProfile?.userId;
  const myPlayer = players[myIndex];
  const opponents = players.filter((_, index) => index !== myIndex);
  const amIHost = inLobby && players.length > 0 && players[0]?.socketId === socket.id;
  const amIReady = inLobby && !!players.find((player) => player.socketId === socket.id)?.isReady;
  const isMyTurn = gameStarted && !gameFinished && myIndex === turnIndex;
  const nextTurnPlayer = players[turnIndex];
  const fontScalePercent = Math.round(fontScale * 100);
  const pageZoomPercent = Math.round(pageZoom * 100);
  const playableCards = hand.reduce((acc, card) => {
    acc[card] = canPlayCard({
      card,
      hand,
      trickSuit,
      isMyTurn,
      trickPending
    });
    return acc;
  }, {});

  const inlineStatusText = errorMsg
    ? errorMsg
    : roundWinnerName
      ? `${roundWinnerName} took the last hand.`
      : null;
  const localTablePlayer = myPlayer || players.find((player) => player.userId === myPlayerId) || activeProfile;
  const totalHandsTaken = Object.values(collectedHandsByPlayer).reduce((sum, tricks) => sum + tricks.length, 0);
  const sortedHand = sortCards(hand);
  const playersForMobilePanel = [...players].sort((left, right) => {
    if (left.userId === nextTurnPlayer?.userId) {
      return -1;
    }

    if (right.userId === nextTurnPlayer?.userId) {
      return 1;
    }

    if (left.userId === myPlayerId) {
      return -1;
    }

    if (right.userId === myPlayerId) {
      return 1;
    }

    return getPlayerName(left).localeCompare(getPlayerName(right));
  });

  const handleEmojiPrompt = (player) => {
    showTopPrompt(`Emoji reactions are not wired yet for ${getPlayerName(player)}.`, 'info');
  };
  const isCompactGameHeader = activeTab === 'play' && inLobby && gameStarted;
  const compactHeaderTurnText = gameFinished && playView === 'stats'
    ? 'Final standings'
    : isMyTurn
      ? 'Your turn'
      : nextTurnPlayer
        ? `${getPlayerName(nextTurnPlayer)}'s turn`
        : 'Waiting';
  const compactHeaderLeadText = trickSuit ? `Lead ${SUIT_NAMES[trickSuit]}` : 'Waiting for lead';

  const renderLobbyView = () => (
    <div className="relative z-10 w-full max-w-4xl">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <h3 className="text-2xl font-display font-extrabold text-[var(--text-primary)] sm:text-3xl">
            Room
          </h3>
          <div className="flex items-center gap-2 rounded-[1.35rem] border border-[var(--glass-border)] bg-[var(--surface-medium)] px-3 py-2 shadow-sm">
            <span className="text-base font-black tracking-[0.22em] text-[var(--text-secondary)] sm:text-lg sm:tracking-[0.26em]">
              {roomId}
            </span>
            <button
              type="button"
              onClick={handleCopyRoomCode}
              className="rounded-full border border-[var(--glass-border)] bg-[var(--surface-hover)] p-2 text-[var(--text-primary)] transition hover:-translate-y-0.5 hover:bg-[var(--surface-solid)]"
              title="Copy room code"
            >
              <Copy className="h-4 w-4" />
            </button>
          </div>
        </div>
        <div className="status-pill px-4 py-2">
          {players.length} player{players.length === 1 ? '' : 's'}
        </div>
      </div>

      <div className="grid gap-4">
        {players.map((player, index) => (
          <div key={`${player.socketId}-${index}`} className="glass-panel flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
            <div className="flex min-w-0 items-center gap-4">
              <div className="seat-avatar h-12 w-12 text-sm">
                {getPlayerName(player).charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0">
                <div className="truncate text-lg font-black text-[var(--text-primary)] sm:text-xl">
                  {getPlayerName(player)} {player.socketId === socket.id ? '(You)' : ''}
                </div>
                <div className="text-xs font-extrabold uppercase tracking-[0.2em] text-[var(--text-secondary)]">
                  {index === 0 ? 'Host' : 'Guest'}
                </div>
              </div>
            </div>
            <div className={clsx('status-pill px-4 py-2', player.isReady && 'bg-emerald-200/80 text-emerald-900')}>
              {player.isReady ? (
                <span className="flex items-center gap-2">
                  <Check className="h-4 w-4" />
                  Ready
                </span>
              ) : (
                'Waiting'
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
        <button
          onClick={toggleReady}
          className={clsx(
            'flex-1 rounded-[1.6rem] px-6 py-4 text-base font-black uppercase tracking-[0.16em] transition-all duration-300 sm:px-8 sm:text-lg sm:tracking-[0.18em]',
            amIReady ? 'ready-button-active' : 'ready-button'
          )}
        >
          {amIReady ? 'Ready to Deal' : 'Ready Up'}
        </button>
        {amIHost && (
          <button onClick={startGame} className="frutiger-button flex-1 px-6 py-4 text-base sm:px-8 sm:text-lg">
            Start Match
          </button>
        )}
        {gameFinished && (
          <button onClick={() => setPlayView('stats')} className="flex-1 rounded-[1.6rem] border border-[var(--glass-border)] bg-[var(--surface-medium)] px-6 py-4 text-base font-black uppercase tracking-[0.16em] transition hover:bg-[var(--surface-hover)] sm:px-8 sm:text-lg sm:tracking-[0.18em]">
            View Last Game Stats
          </button>
        )}
      </div>
    </div>
  );

  const renderMatchmaking = () => (
    <div className="relative z-10 m-auto w-full max-w-3xl space-y-6">
      {!isAuthenticated && guestProfile && (
        <div className="glass-panel flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
          <div>
            <div className="text-[10px] font-extrabold uppercase tracking-[0.22em] text-[var(--text-secondary)]">
              Guest profile
            </div>
            <div className="mt-1 text-2xl font-black text-[var(--text-primary)]">
              {guestProfile.name}
            </div>
          </div>
          <button
            onClick={handleGuestReset}
            className="rounded-full border border-[var(--glass-border)] bg-[var(--surface-medium)] px-5 py-3 text-sm font-black uppercase tracking-[0.18em] text-[var(--text-primary)] transition hover:bg-[var(--surface-hover)]"
          >
            Change Guest Name
          </button>
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        <div className="glass-panel p-5 sm:p-8">
          <h3 className="mb-3 text-2xl font-display font-black text-[var(--text-primary)] sm:text-3xl">Host Private Table</h3>
          <p className="mb-6 text-base font-semibold text-[var(--text-secondary)] sm:text-sm">
            Spin up a private room, copy the code, and invite your friends.
          </p>
          <button onClick={handleCreateLobby} className="frutiger-button w-full py-4 text-base sm:text-lg">
            Create Private Room
          </button>
        </div>
        <div className="glass-panel p-5 sm:p-8">
          <h3 className="mb-3 text-2xl font-display font-black text-[var(--text-primary)] sm:text-3xl">Join Friends</h3>
          <p className="mb-6 text-base font-semibold text-[var(--text-secondary)] sm:text-sm">
            Paste a room code to hop straight into someone else&apos;s room.
          </p>
          <div className="flex flex-col gap-3 sm:grid sm:grid-cols-[minmax(0,1fr)_auto]">
            <input
              value={joinInput}
              onChange={(event) => setJoinInput(event.target.value)}
              autoCapitalize="characters"
              placeholder="Room code"
              spellCheck={false}
              className="min-w-0 rounded-[1.3rem] border border-[var(--glass-border)] bg-[var(--surface-input)] px-5 py-4 font-mono text-[0.95rem] font-black uppercase tracking-[0.06em] text-[var(--text-primary)] shadow-inner placeholder:font-sans placeholder:text-[0.9rem] placeholder:font-bold placeholder:normal-case placeholder:tracking-normal focus:outline-none focus:ring-4 focus:ring-[var(--accent-glow)] sm:text-[1rem] sm:tracking-[0.12em]"
            />
            <button onClick={handleJoinLobby} className="frutiger-button w-full px-6 py-4 text-base sm:min-w-[9rem] sm:px-8 sm:text-lg">
              Join
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  const renderGameTable = () => {
    if (gameFinished && playView === 'stats') {
      return (
        <div className="relative z-10 flex min-h-0 flex-1 flex-col gap-4">
          <section className="glass-panel p-4 sm:p-5">
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <Trophy className="h-5 w-5 text-[var(--text-secondary)]" />
                <div>
                  <h4 className="text-xl font-display font-black text-[var(--text-primary)] sm:text-2xl">Game Finished</h4>
                  <p className="text-sm font-semibold text-[var(--text-secondary)]">
                    Final standings for room {roomId}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setPlayView('table')}
                className="rounded-full border border-[var(--glass-border)] bg-[var(--surface-medium)] px-4 py-2 text-xs font-black uppercase tracking-[0.18em] transition hover:bg-[var(--surface-hover)]"
              >
                Back to Lobby
              </button>
            </div>

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {finalStandings.map((standing, index) => (
                <div
                  key={standing.userId}
                  className={clsx(
                    'rounded-[1.5rem] border px-4 py-4 text-sm font-bold',
                    index === 0
                      ? 'border-lime-200/80 bg-lime-100/20 text-[var(--text-primary)]'
                      : 'border-[var(--glass-border)] bg-[var(--surface-subtle)] text-[var(--text-primary)]'
                  )}
                >
                  <div className="text-[10px] font-extrabold uppercase tracking-[0.18em]">
                    {index === 0 ? 'Winner' : `Place ${index + 1}`}
                  </div>
                  <div className="mt-1 text-lg font-black">{standing.name}</div>
                  <div className="mt-2 text-sm text-[var(--text-secondary)]">{standing.tricksWon} hands collected</div>
                  <div className="mt-1 text-sm text-[var(--text-secondary)]">{standing.cardsLeft} cards left</div>
                </div>
              ))}
            </div>
          </section>
        </div>
      );
    }

    if (playView === 'collected') {
      return (
        <div className="relative z-10 flex min-h-0 flex-1 flex-col gap-4">
          <section className="glass-panel p-4 sm:p-5">
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h4 className="text-xl font-display font-black text-[var(--text-primary)] sm:text-2xl">Taken Hands</h4>
                <p className="text-sm font-semibold text-[var(--text-secondary)]">
                  This is the existing taken-hands view, remapped from the new table action area.
                </p>
              </div>
              <button
                onClick={() => setPlayView('table')}
                className="frutiger-button px-5 py-3 text-sm font-black uppercase tracking-[0.16em]"
              >
                Back to table
              </button>
            </div>

            <CollectedHandsView
              players={players}
              collectedHandsByPlayer={collectedHandsByPlayer}
              myPlayerId={myPlayerId}
            />
          </section>
        </div>
      );
    }

    return (
      <div className="relative z-10 flex min-h-0 flex-1 flex-col">
        <section className="rentz-game-frame flex-1 min-h-0">
          <div className="rentz-table-stage table-felt">
            <div className="rentz-marking-box">
              <span className="rentz-marking-label">Marking suit:</span>
              <span
                className={clsx(
                  'rentz-marking-value',
                  trickSuit && (trickSuit === 'H' || trickSuit === 'D') ? 'is-red' : 'is-neutral'
                )}
              >
                {formatMarkingSuit(trickSuit)}
              </span>
            </div>

            <div className="rentz-table-corner-pills">
              <div className="status-pill px-3 py-2">{totalHandsTaken} hands taken</div>
            </div>

            <div className="rentz-table-brand">Rentz</div>

            <div className="rentz-mobile-hero">
              <div className="rentz-current-player-label">Current player:</div>
              {nextTurnPlayer ? (
                <RentzSeatCluster
                  player={nextTurnPlayer}
                  seatRole="hero"
                  mobileHero
                  isCurrent
                  isWinner={trickWinnerId === nextTurnPlayer.userId}
                  cardCount={nextTurnPlayer.userId === myPlayerId ? hand.length : (cardCounts[nextTurnPlayer.userId] || 0)}
                  tricksWon={(collectedHandsByPlayer[nextTurnPlayer.userId] || []).length}
                  points={getPlayerPoints(nextTurnPlayer)}
                  onEmojiClick={() => handleEmojiPrompt(nextTurnPlayer)}
                />
              ) : null}
            </div>

            <div className="rentz-desktop-seats">
              {opponents.map((player, index) => {
                const seatRole = OPPONENT_SEAT_ROLES[index] || 'top';

                return (
                  <div
                    key={player.userId || player.socketId || index}
                    className={clsx('rentz-seat-slot', `rentz-seat-slot-${seatRole}`)}
                  >
                    <RentzSeatCluster
                      player={player}
                      seatRole={seatRole}
                      isCurrent={nextTurnPlayer?.userId === player.userId}
                      isWinner={trickWinnerId === player.userId}
                      cardCount={cardCounts[player.userId] || 0}
                      tricksWon={(collectedHandsByPlayer[player.userId] || []).length}
                      points={getPlayerPoints(player)}
                      onEmojiClick={() => handleEmojiPrompt(player)}
                    />
                  </div>
                );
              })}

              {localTablePlayer ? (
                <div className="rentz-seat-slot rentz-seat-slot-bottom">
                  <RentzSeatCluster
                    player={localTablePlayer}
                    seatRole="bottom"
                    isCurrent={nextTurnPlayer?.userId === myPlayerId}
                    isWinner={trickWinnerId === myPlayerId}
                    cardCount={hand.length}
                    tricksWon={(collectedHandsByPlayer[myPlayerId] || []).length}
                    points={getPlayerPoints(localTablePlayer)}
                    onEmojiClick={() => handleEmojiPrompt(localTablePlayer)}
                  />
                </div>
              ) : null}
            </div>

            <div className="rentz-board-area">
              <TrickBoard
                currentTrick={currentTrick}
                playerCount={players.length}
                trickSuit={trickSuit}
                trickPending={trickPending || Boolean(animatingWinner)}
              />
            </div>
          </div>

          <div className="rentz-bottom-strip">
            <section className="rentz-hand-panel">
              <div className="rentz-hand-header">
                <div>
                  <div className="rentz-hand-title">Your hand</div>
                  <div className="rentz-hand-subtitle">
                    {localTablePlayer ? `${getPlayerName(localTablePlayer)} (You)` : 'Local player'}
                  </div>
                </div>
                <div className="rentz-hand-count">{hand.length} cards</div>
              </div>

              <div className="rentz-hand-scroll">
                <div className="rentz-hand-row">
                  {sortedHand.map((card, index) => {
                    const playable = playableCards[card];
                    const disabled = !playable;
                    const mustFollowSuit = isMyTurn && trickSuit && !playable && hand.some((handCard) => parseCard(handCard).suit === trickSuit);

                    return (
                      <div
                        key={`${card}-${index}`}
                        className={clsx(
                          'rentz-hand-card-wrap',
                          playable && 'is-playable'
                        )}
                        style={{ zIndex: index + 1 }}
                      >
                        <Card
                          cardString={card}
                          onClick={() => socket.emit('play_card', { roomId, card })}
                          disabled={disabled}
                          ghosted={mustFollowSuit}
                          title={mustFollowSuit ? `You must follow ${SUIT_NAMES[trickSuit]}.` : ''}
                        />
                      </div>
                    );
                  })}

                  {hand.length === 0 && (
                    <div className="rentz-empty-hand">Waiting for the next hand...</div>
                  )}
                </div>
              </div>
            </section>

            <button
              type="button"
              onClick={() => setPlayView('collected')}
              className="rentz-verify-button"
            >
              <span>Review taken hands</span>
            </button>

            <section className="rentz-log-panel rentz-log-panel-desktop">
              <ChromePanelHeader title="Log" />
              <div className="rentz-log-list">
                {activityFeed.length === 0 ? (
                  <div className="rentz-log-entry is-empty">Hand winners appear here.</div>
                ) : (
                  activityFeed.map((item, index) => (
                    <div key={`${item}-${index}`} className="rentz-log-entry">
                      {item}
                    </div>
                  ))
                )}
              </div>
            </section>
          </div>

          <div className="rentz-mobile-panels">
            <section className="rentz-players-panel">
              <ChromePanelHeader title="Players" />
              <div className="rentz-player-list">
                {playersForMobilePanel.map((player, index) => (
                  <CompactPlayerRow
                    key={player.userId || player.socketId || index}
                    player={player}
                    isCurrent={nextTurnPlayer?.userId === player.userId}
                    isLocal={player.userId === myPlayerId}
                    cardCount={player.userId === myPlayerId ? hand.length : (cardCounts[player.userId] || 0)}
                    tricksWon={(collectedHandsByPlayer[player.userId] || []).length}
                    points={getPlayerPoints(player)}
                  />
                ))}
              </div>
            </section>

            <section className="rentz-log-panel rentz-log-panel-mobile">
              <ChromePanelHeader title="Log" />
              <div className="rentz-log-list">
                {activityFeed.length === 0 ? (
                  <div className="rentz-log-entry is-empty">Hand winners appear here.</div>
                ) : (
                  activityFeed.map((item, index) => (
                    <div key={`${item}-${index}`} className="rentz-log-entry">
                      {item}
                    </div>
                  ))
                )}
              </div>
            </section>
          </div>
        </section>
      </div>
    );
  };

  const renderPlayContent = () => {
    if (!activeProfile) {
      return (
        <div className="relative z-10 m-auto flex w-full max-w-md flex-col gap-4 px-1 text-center">
          <h3 className="text-2xl font-display font-black text-[var(--text-primary)] sm:text-3xl">Play as Guest</h3>
          <p className="text-base font-semibold text-[var(--text-secondary)] sm:text-sm">
            Pick a guest display name for this device. Account login lives separately from guest play.
          </p>
          <input
            value={guestNameInput}
            onChange={(event) => setGuestNameInput(event.target.value)}
            placeholder="Enter a guest display name..."
            className="w-full rounded-[1.4rem] border border-[var(--glass-border)] bg-[var(--surface-input)] px-5 py-4 font-black tracking-wide text-[var(--text-primary)] shadow-inner focus:outline-none focus:ring-4 focus:ring-[var(--accent-glow)]"
          />
          <button onClick={handleGuestContinue} className="frutiger-button py-4 text-base sm:text-lg">
            Continue as Guest
          </button>
        </div>
      );
    }

    if (!inLobby) {
      return renderMatchmaking();
    }

    if (!gameStarted || (gameFinished && playView !== 'stats')) {
      return renderLobbyView();
    }

    return renderGameTable();
  };

  const renderEditorContent = () => (
    <div className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
      <section className="glass-panel p-5 sm:p-6">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-2xl font-display font-black text-[var(--text-primary)] sm:text-3xl">Ruleset Editor</h3>
            <p className="text-base font-semibold text-[var(--text-secondary)] sm:text-sm">
              Create, edit, and validate custom Rentz rules before you bring them into a match.
            </p>
          </div>
          <div className="status-pill px-4 py-2">{editorType.replace('_', ' ')}</div>
        </div>

        <div className="grid gap-4 md:grid-cols-[1fr_auto]">
          <input
            value={editorTitle}
            onChange={(event) => setEditorTitle(event.target.value)}
            className="rounded-[1.3rem] border border-[var(--glass-border)] bg-[var(--surface-input)] px-5 py-4 font-black text-[var(--text-primary)] shadow-inner focus:outline-none focus:ring-4 focus:ring-[var(--accent-glow)]"
            placeholder="Ruleset title"
          />
          <select
            value={editorType}
            onChange={(event) => setEditorType(event.target.value)}
            className="rounded-[1.3rem] border border-[var(--glass-border)] bg-[var(--surface-input)] px-4 py-4 font-black text-[var(--text-primary)] shadow-inner focus:outline-none"
          >
            <option value="per_round">per_round</option>
            <option value="end_game">end_game</option>
          </select>
        </div>

        <textarea
          value={editorCode}
          onChange={(event) => setEditorCode(event.target.value)}
          className="mt-4 min-h-[24rem] w-full rounded-[1.8rem] border border-[var(--glass-border)] bg-[#f8fff1]/75 px-5 py-4 font-mono text-sm leading-7 text-[#1f4023] shadow-inner focus:outline-none focus:ring-4 focus:ring-[var(--accent-glow)]"
          spellCheck={false}
        />

        <div className="mt-4 flex flex-col gap-3 sm:flex-row">
          <button onClick={handleParseRules} className="frutiger-button flex-1 py-4 text-lg">
            Parse Ruleset
          </button>
          <button onClick={handleSaveDraft} className="ready-button flex-1 py-4 text-lg">
            Save Draft
          </button>
          <button onClick={() => setActiveTab('guide')} className="flex-1 rounded-[1.6rem] border border-[var(--glass-border)] bg-[var(--surface-medium)] py-4 text-lg font-black uppercase tracking-[0.18em] text-[var(--text-primary)] transition hover:bg-[var(--surface-hover)]">
            View Guide
          </button>
        </div>

        <div className="mt-4 rounded-[1.3rem] border border-[var(--glass-border)] bg-[var(--surface-soft)] px-4 py-3 text-sm font-semibold text-[var(--text-secondary)]">
          {editorStatus || 'Use Parse Ruleset to validate the current script against the backend parser.'}
        </div>
      </section>

      <section className="space-y-5">
        <div className="glass-panel p-5 sm:p-6">
          <h4 className="mb-3 text-2xl font-display font-black text-[var(--text-primary)]">Parser Preview</h4>
          {editorAst ? (
            <pre className="max-h-[24rem] overflow-auto rounded-[1.3rem] bg-slate-950/80 p-4 text-xs text-lime-100">
              {JSON.stringify(editorAst, null, 2)}
            </pre>
          ) : (
            <p className="rounded-[1.3rem] border border-dashed border-[var(--glass-border)] bg-[var(--surface-subtle)] p-5 text-sm font-semibold text-[var(--text-secondary)]">
              No AST preview yet. Parse the current code to inspect the backend output.
            </p>
          )}
        </div>

        <div className="glass-panel p-5 sm:p-6">
          <h4 className="mb-3 text-2xl font-display font-black text-[var(--text-primary)]">My Drafts</h4>
          <div className="space-y-3">
            {ruleDrafts.length === 0 ? (
              <p className="text-sm font-semibold text-[var(--text-secondary)]">
                Drafts you save here stay on this device for quick iteration.
              </p>
            ) : (
              ruleDrafts.map((draft) => (
                <button
                  key={draft.id}
                  onClick={() => {
                    setEditorTitle(draft.title);
                    setEditorType(draft.type);
                    setEditorCode(draft.code);
                    setActiveTab('editor');
                  }}
                  className="w-full rounded-[1.3rem] border border-[var(--glass-border)] bg-[var(--surface-subtle)] px-4 py-3 text-left transition hover:bg-[var(--surface-soft)]"
                >
                  <div className="text-base font-black text-[var(--text-primary)]">{draft.title}</div>
                  <div className="mt-1 text-xs font-extrabold uppercase tracking-[0.18em] text-[var(--text-secondary)]">
                    {draft.type} • {new Date(draft.updatedAt).toLocaleString()}
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      </section>
    </div>
  );

  const renderLoginContent = () => (
    <div className="grid gap-5 lg:grid-cols-[1fr_0.9fr]">
      <section className="glass-panel p-5 sm:p-8">
        <h3 className="mb-2 text-2xl font-display font-black text-[var(--text-primary)] sm:text-3xl">Account Login</h3>
        <p className="mb-6 text-base font-semibold text-[var(--text-secondary)] sm:text-sm">
          Guest display names now live on the Play screen. This area is reserved for registered account access instead of minting pseudo-accounts from a display name field.
        </p>

        {!isAuthenticated ? (
          <div className="rounded-[1.7rem] border border-dashed border-[var(--glass-border)] bg-[var(--surface-subtle)] p-5 sm:p-6">
            <div className="text-lg font-black text-[var(--text-primary)]">Registered accounts are not wired in yet.</div>
            <p className="mt-3 text-sm font-semibold leading-7 text-[var(--text-secondary)]">
              Use the Play tab to choose a guest display name and jump into rooms. Once real account auth is connected, this page can host the proper sign-in flow without confusing guest names for accounts.
            </p>
            <button onClick={() => setActiveTab('play')} className="frutiger-button mt-5 w-full py-4 text-lg">
              Back to Play
            </button>
          </div>
        ) : (
          <div className="rounded-[1.7rem] border border-[var(--glass-border)] bg-[var(--surface-subtle)] p-5 sm:p-6">
            <div className="flex items-center gap-4">
              <div className="seat-avatar h-14 w-14 text-lg">
                {userProfile?.name?.charAt(0)?.toUpperCase() || 'P'}
              </div>
              <div>
                <div className="text-2xl font-black text-[var(--text-primary)]">{userProfile?.name}</div>
                <div className="text-sm font-semibold text-[var(--text-secondary)]">Signed in for local multiplayer</div>
              </div>
            </div>
            <button onClick={handleLogout} className="ready-button mt-6 w-full py-4 text-lg">
              Switch Player
            </button>
          </div>
        )}
      </section>

      <section className="glass-panel p-5 sm:p-8">
        <h4 className="mb-3 text-2xl font-display font-black text-[var(--text-primary)]">Session Status</h4>
        <div className="space-y-3 text-sm font-semibold text-[var(--text-secondary)]">
          <div className="status-pill flex items-center justify-between px-4 py-3">
            <span>Authenticated</span>
            <span>{isAuthenticated ? 'Yes' : 'No'}</span>
          </div>
          <div className="status-pill flex items-center justify-between px-4 py-3">
            <span>Current room</span>
            <span>{roomId || 'None'}</span>
          </div>
          <div className="status-pill flex items-center justify-between px-4 py-3">
            <span>Game active</span>
            <span>{gameStarted ? 'Yes' : 'No'}</span>
          </div>
        </div>
      </section>
    </div>
  );

  const renderPlaceholderModule = (title, body) => (
    <div className="glass-panel min-h-[60vh] p-5 sm:p-8">
      <h3 className="mb-3 text-2xl font-display font-black text-[var(--text-primary)] sm:text-3xl">{title}</h3>
      <p className="max-w-2xl text-base font-semibold leading-7 text-[var(--text-secondary)] sm:text-sm">{body}</p>
    </div>
  );

  const renderGuideContent = () => (
    <div className="flex max-h-[85vh] flex-col gap-4">
      <div className="flex shrink-0 items-center justify-between px-2">
        <h3 className="text-2xl font-display font-black text-[var(--text-primary)] sm:text-3xl">Ruleset Definition Guide</h3>
        <button onClick={() => setActiveTab('editor')} className="rounded-full border border-[var(--glass-border)] bg-[var(--surface-medium)] px-5 py-2 text-sm font-black uppercase tracking-[0.18em] text-[var(--text-primary)] shadow-sm transition hover:bg-[var(--surface-hover)]">
          Back to Editor
        </button>
      </div>
      
      <div className="glass-panel flex-1 overflow-y-auto p-5 sm:p-8">
        <div className="space-y-8 text-sm font-medium leading-7 text-[var(--text-secondary)]">
        <section>
          <h4 className="mb-3 text-xl font-bold text-[var(--text-primary)]">Overview</h4>
          <p>The rules engine supports custom Rentz rules executed either <code>per_round</code> or <code>end_game</code>. Special variables are made available to your scripts at runtime.</p>
        </section>

        <section>
          <h4 className="mb-3 text-xl font-bold text-[var(--text-primary)]">Variables</h4>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-[1.3rem] border border-[var(--glass-border)] bg-[var(--surface-soft)] p-4">
              <strong className="text-base text-[var(--text-primary)]">POINTS</strong>
              <p className="mt-1 text-xs">The current score of the player.</p>
            </div>
            <div className="rounded-[1.3rem] border border-[var(--glass-border)] bg-[var(--surface-soft)] p-4">
              <strong className="text-base text-[var(--text-primary)]">TRICKS_WON</strong>
              <p className="mt-1 text-xs">The number of tricks currently won by the player.</p>
            </div>
            <div className="rounded-[1.3rem] border border-[var(--glass-border)] bg-[var(--surface-soft)] p-4">
              <strong className="text-base text-[var(--text-primary)]">[SUIT]_COUNT</strong>
              <p className="mt-1 text-xs">Number of specific suits captured (e.g. <code>HEART_COUNT</code>, <code>SPADE_COUNT</code>).</p>
            </div>
            <div className="rounded-[1.3rem] border border-[var(--glass-border)] bg-[var(--surface-soft)] p-4">
              <strong className="text-base text-[var(--text-primary)]">[SUIT]_[VALUE]</strong>
              <p className="mt-1 text-xs">Boolean if the specific card was captured (e.g. <code>HEART_KING</code>, <code>DIAMOND_JACK</code>).</p>
            </div>
            <div className="rounded-[1.3rem] border border-[var(--glass-border)] bg-[var(--surface-soft)] p-4">
              <strong className="text-base text-[var(--text-primary)]">CARD_NR</strong>
              <p className="mt-1 text-xs">The total number of cards currently collected by the player.</p>
            </div>
            <div className="rounded-[1.3rem] border border-[var(--glass-border)] bg-[var(--surface-soft)] p-4">
              <strong className="text-base text-[var(--text-primary)]">PLAYER_COUNT</strong>
              <p className="mt-1 text-xs">The total number of players in the game.</p>
            </div>
          </div>
        </section>

        <section>
          <h4 className="mb-3 text-xl font-bold text-[var(--text-primary)]">Functions & Commands</h4>
          <ul className="space-y-4">
            <li className="rounded-[1.3rem] border border-[var(--glass-border)] bg-[var(--surface-soft)] p-4">
              <code className="rounded bg-[var(--surface-code-inline)] px-1 font-mono text-base font-bold text-[var(--text-primary)]">add(value)</code>
              <p className="mt-1">Adds the specified integer expression to the player's score.</p>
            </li>
            <li className="rounded-[1.3rem] border border-[var(--glass-border)] bg-[var(--surface-soft)] p-4">
              <code className="rounded bg-[var(--surface-code-inline)] px-1 font-mono text-base font-bold text-[var(--text-primary)]">set_to(value)</code>
              <p className="mt-1">Hardcodes the player's score directly to the specified expression.</p>
            </li>
            <li className="rounded-[1.3rem] border border-[var(--glass-border)] bg-[var(--surface-soft)] p-4">
              <code className="rounded bg-[var(--surface-code-inline)] px-1 font-mono text-base font-bold text-[var(--text-primary)]">reset_to(value)</code>
              <p className="mt-1">Resets the score back to a default value, optionally taking an expression.</p>
            </li>
            <li className="rounded-[1.3rem] border border-[var(--glass-border)] bg-[var(--surface-soft)] p-4">
              <code className="rounded bg-[var(--surface-code-inline)] px-1 font-mono text-base font-bold text-[var(--text-primary)]">end()</code>
              <p className="mt-1">Instantly ends the current round context execution.</p>
            </li>
            <li className="rounded-[1.3rem] border border-[var(--glass-border)] bg-[var(--surface-soft)] p-4">
              <code className="rounded bg-[var(--surface-code-inline)] px-1 font-mono text-base font-bold text-[var(--text-primary)]">game_end()</code>
              <p className="mt-1">Forces the game to conclude and proceeds to final standings.</p>
            </li>
          </ul>
        </section>

        <section>
          <h4 className="mb-3 text-xl font-bold text-[var(--text-primary)]">Control Flow & Logic</h4>
          <p className="mb-3">Standard logical branches are fully supported. Conditions must be wrapped in parentheses.</p>
          <ul className="list-inside list-disc space-y-2 pl-4">
            <li><strong>Statements:</strong> <code>if</code>, <code>elif</code>, <code>else</code>, <code>endif</code></li>
            <li><strong>Comparisons:</strong> <code>==</code>, <code>!=</code>, <code>&gt;</code>, <code>&lt;</code>, <code>&gt;=</code>, <code>&lt;=</code></li>
            <li><strong>Logical Operators:</strong> <code>and</code>, <code>or</code>, <code>not</code></li>
            <li><strong>Math Operators:</strong> <code>+</code>, <code>-</code>, <code>*</code>, <code>/</code></li>
          </ul>
        </section>

        <section>
          <h4 className="mb-3 text-xl font-bold text-[var(--text-primary)]">Comprehensive Example</h4>
          <pre className="overflow-x-auto rounded-[1.3rem] bg-slate-950/85 p-6 font-mono text-sm leading-relaxed text-lime-100 shadow-inner">
{`if (HEART_KING)
  add(-100)
elif (HEART_COUNT > 0)
  add(HEART_COUNT * -20)
endif

if (TRICKS_WON == 0 and POINTS < -50)
  set_to(0)
  end()
endif

if (not DIAMOND_JACK)
  add(10)
else
  add(150)
endif

if (POINTS < -500)
  game_end()
endif`}
          </pre>
        </section>
        </div>
      </div>
    </div>
  );

  const renderMainContent = () => {
    if (activeTab === 'play') {
      return renderPlayContent();
    }

    if (activeTab === 'editor') {
      return renderEditorContent();
    }

    if (activeTab === 'guide') {
      return renderGuideContent();
    }

    if (activeTab === 'login') {
      return renderLoginContent();
    }

    if (activeTab === 'settings') {
      return (
        <div className="space-y-5">
          <div className="glass-panel p-5 sm:p-6 lg:p-8">
            <h3 className="mb-3 text-2xl font-display font-black text-[var(--text-primary)] sm:text-3xl">Settings</h3>
            <p className="mb-6 text-base font-semibold leading-7 text-[var(--text-secondary)] sm:text-sm">
              Theme, font size, and content zoom save locally on this device. Page zoom only affects the active subpage area, so the browser window and OS UI stay untouched.
            </p>

            <div className="rounded-[1.6rem] border border-[var(--glass-border)] bg-[var(--surface-soft)] p-4 sm:p-5">
              <div className="mb-4">
                <h4 className="text-xl font-display font-black text-[var(--text-primary)] sm:text-2xl">Theme Palette</h4>
                <p className="mt-2 text-sm font-semibold leading-6 text-[var(--text-secondary)] sm:text-base">
                  Each palette now uses stronger surface contrast so cards, chips, and secondary panels stay readable.
                </p>
              </div>
              <ThemeTray themes={themes} theme={theme} onThemeChange={applyTheme} />
            </div>
          </div>

          <SettingsSlider
            title="Font Size"
            description="Scale the app typography in fixed 5% steps for easier reading across the interface."
            min={FONT_SCALE_RANGE.min}
            max={FONT_SCALE_RANGE.max}
            step={FONT_SCALE_RANGE.step}
            value={fontScalePercent}
            defaultValue={FONT_SCALE_RANGE.defaultValue}
            onChange={(nextValue) => setFontScale(nextValue / 100)}
          />

          <SettingsSlider
            title="Subpage Zoom"
            description="Scale the current page content in fixed 5% steps without zooming the entire browser tab."
            min={PAGE_ZOOM_RANGE.min}
            max={PAGE_ZOOM_RANGE.max}
            step={PAGE_ZOOM_RANGE.step}
            value={pageZoomPercent}
            defaultValue={PAGE_ZOOM_RANGE.defaultValue}
            onChange={(nextValue) => setPageZoom(nextValue / 100)}
          />
        </div>
      );
    }

    if (activeTab === 'friends') {
      return renderPlaceholderModule(
        'Friends',
        'Friend codes, presence, and private invites can live here. The navbar entry is now in place so we can wire the real friend graph into this space next.'
      );
    }

    if (activeTab === 'library') {
      return renderPlaceholderModule(
        'Library',
        'Saved rulesets, picks from the Ruleset Rater, and your own authored presets will be surfaced here. The editor tab now gives us the creation flow to pair with this library view.'
      );
    }

    if (activeTab === 'ruleset-rater') {
      return renderPlaceholderModule(
        'Ruleset Rater',
        'Shared community rulesets will appear here with ratings, downloads, and quick-save actions once the Ruleset Rater endpoints are fully hooked up.'
      );
    }

    return null;
  };

  return (
    <div className="app-shell relative min-h-screen w-full overflow-hidden p-0 pt-2 font-sans transition-colors duration-700 sm:pt-4 md:p-3 md:pt-3 lg:p-4">
      <div className="app-window macos-window relative z-20 mx-auto flex h-[calc(100dvh-0.5rem)] w-full max-w-[1680px] flex-col border border-[var(--glass-border)] shadow-2xl transition-all duration-700 ease-in-out sm:h-[calc(100dvh-1rem)] md:h-[96vh]">
        <div className="relative z-30 flex h-14 shrink-0 items-center border-b border-[var(--glass-border)] px-3 shadow-sm transition-colors duration-500 sm:px-4 md:px-5" style={{ background: 'var(--glass-bg)' }}>
          <div className="flex w-20 gap-2.5 md:w-24">
            <div className="h-3.5 w-3.5 rounded-full border border-[#e0443e] bg-[#ff5f56] shadow-[inset_0_1px_4px_rgba(0,0,0,0.2)]" />
            <div className="h-3.5 w-3.5 rounded-full border border-[#dea123] bg-[#ffbd2e] shadow-[inset_0_1px_4px_rgba(0,0,0,0.2)]" />
            <div className="h-3.5 w-3.5 rounded-full border border-[#1aab29] bg-[#27c93f] shadow-[inset_0_1px_4px_rgba(0,0,0,0.2)]" />
          </div>

          <div className="flex flex-1 items-center justify-center gap-2">
            <Droplet fill="currentColor" className="h-4 w-4 text-[var(--text-primary)] opacity-40 drop-shadow-md" />
            <span className="font-display text-[10px] font-semibold uppercase tracking-widest text-[var(--text-primary)] opacity-60 sm:text-xs">
              Rentz Arena
            </span>
          </div>

          <div className="flex w-20 justify-end md:w-24">
            <button
              onClick={() => setActiveTab('settings')}
              className="rounded-full border border-[var(--glass-border)] bg-[var(--surface-medium)] p-2 text-[var(--text-primary)] shadow-sm transition hover:bg-[var(--surface-hover)]"
              title="Open settings"
            >
              <Settings className="h-4 w-4" />
            </button>
          </div>
        </div>

        {topPrompts.length > 0 && (
          <div className="pointer-events-none absolute inset-x-0 top-16 z-40 px-4">
            <div className="relative mx-auto h-14 w-full">
              {topPrompts.map((topPrompt) => (
                <div
                  key={topPrompt.id}
                  className="absolute left-1/2 top-0 w-fit max-w-[calc(100vw-2rem)] -translate-x-1/2"
                >
                  <div
                    className={clsx(
                      'copy-toast glass-panel inline-flex w-max max-w-[calc(100vw-2rem)] items-center gap-2.5 rounded-[1.35rem] px-3 py-2.5 shadow-[0_18px_36px_rgba(0,0,0,0.16)] backdrop-blur-2xl sm:gap-3 sm:rounded-[1.6rem] sm:px-4 sm:py-3 sm:max-w-[30rem]',
                      topPrompt.tone === 'success' && 'border-lime-100/90 bg-[linear-gradient(180deg,rgba(248,255,245,0.92)_0%,rgba(214,247,177,0.78)_100%)]',
                      topPrompt.tone === 'error' && 'border-rose-100/90 bg-[linear-gradient(180deg,rgba(255,246,248,0.94)_0%,rgba(255,205,218,0.82)_100%)]',
                      topPrompt.tone === 'info' && 'border-sky-100/90 bg-[linear-gradient(180deg,rgba(245,252,255,0.94)_0%,rgba(198,234,255,0.8)_100%)]'
                    )}
                  >
                    <div
                      className={clsx(
                        'flex h-7 w-7 shrink-0 items-center justify-center rounded-full border shadow-[inset_0_1px_2px_rgba(255,255,255,0.92),0_6px_12px_rgba(0,0,0,0.08)] sm:h-8 sm:w-8',
                        topPrompt.tone === 'success' && 'border-lime-100/95 bg-white/80 text-emerald-700',
                        topPrompt.tone === 'error' && 'border-rose-100/95 bg-white/80 text-rose-700',
                        topPrompt.tone === 'info' && 'border-sky-100/95 bg-white/80 text-sky-700'
                      )}
                    >
                      <Check className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                    </div>
                    <div className="min-w-0 whitespace-normal break-words text-xs font-black leading-5 text-[var(--text-primary)] sm:text-sm md:text-base">
                      {topPrompt.message}
                    </div>
                  </div>
                </div>
              ))}
              <div className="h-14" aria-hidden="true" />
            </div>
          </div>
        )}

        <div className="relative flex min-h-0 flex-1 overflow-hidden">
          <aside className="hidden w-56 shrink-0 flex-col border-r border-[var(--glass-border)] p-4 transition-colors duration-500 md:flex" style={{ background: 'var(--glass-bg)' }}>
            <div className="mb-8 mt-2 flex items-center gap-3 px-3">
              <Sparkles fill="currentColor" className="h-8 w-8 text-[var(--text-primary)] opacity-80 drop-shadow-lg" />
              <h1 className="font-display text-[2.1rem] font-black tracking-tighter text-[var(--text-primary)]">Rentz</h1>
            </div>

            <nav className="flex flex-1 flex-col gap-1.5">
              {navItems.map((item) => {
                const isActive = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => setActiveTab(item.id)}
                    className={clsx(
                      'flex items-center gap-4 rounded-2xl px-4 py-3.5 text-left font-medium transition-all duration-300',
                      isActive
                        ? 'translate-x-2 font-bold text-[var(--nav-active-text)]'
                        : 'text-[var(--text-secondary)] hover:bg-black/5 hover:text-[var(--text-primary)]'
                    )}
                    style={isActive ? { background: 'var(--nav-active-bg)', boxShadow: 'var(--nav-active-shadow)' } : {}}
                  >
                    <item.icon className={clsx('relative z-10 h-5 w-5 drop-shadow-[0_2px_4px_rgba(0,0,0,0.1)] transition-transform duration-300', isActive && 'scale-110')} />
                    <span className="relative z-10 text-[14px] tracking-wide">{item.label}</span>
                  </button>
                );
              })}
            </nav>

            <div className="mt-auto border-t border-[var(--glass-border)] pt-6" />
          </aside>

          <main className="relative z-10 flex h-full flex-1 flex-col overflow-y-auto overflow-x-auto p-3 pb-28 sm:p-4 sm:pb-32 md:pb-4 lg:p-5">
            <div className="subpage-viewport">
              <div className="subpage-content">
                <header className={clsx(
                  'flex shrink-0',
                  isCompactGameHeader ? 'mb-2 flex-col gap-2 lg:mb-2.5 lg:flex-row lg:items-center lg:justify-between lg:gap-4' : 'mb-6 flex-col gap-3'
                )}>
                  <div className="min-w-0 flex flex-col gap-1.5 pt-1">
                    <h2 className={clsx(
                      'flex items-center gap-3 font-display font-black capitalize leading-[1.08] tracking-tight text-[var(--text-primary)] drop-shadow-sm',
                      isCompactGameHeader ? 'text-[1.5rem] sm:text-[1.75rem] lg:text-[2.1rem]' : 'text-[2rem] sm:text-3xl md:text-[4rem]'
                    )}>
                      {activeTab === 'play' && !inLobby && <Swords className="h-8 w-8 opacity-70 sm:h-10 sm:w-10" />}
                      {activeTab}
                    </h2>
                    <div
                      className={clsx('rounded-full', isCompactGameHeader ? 'h-1 w-16' : 'h-1.5 w-24')}
                      style={{ background: 'var(--button-bg)', boxShadow: 'var(--nav-active-shadow)' }}
                    />
                  </div>

                  {isCompactGameHeader && (
                    <div className="flex min-w-0 flex-1 lg:justify-end">
                      <div className="flex flex-wrap items-center gap-1.5 lg:flex-nowrap lg:justify-end">
                        <div className="status-pill px-2.5 py-1.5 text-[0.66rem] sm:text-[0.7rem]">Room {roomId}</div>
                        <div className={clsx('status-pill px-2.5 py-1.5 text-[0.66rem] sm:text-[0.7rem]', isMyTurn && 'bg-[var(--accent-glow)] text-white')}>
                          Turn: {compactHeaderTurnText}
                        </div>
                        <div className="status-pill px-2.5 py-1.5 text-[0.66rem] sm:text-[0.7rem]">{players.length} players</div>
                        <div className="status-pill px-2.5 py-1.5 text-[0.66rem] sm:text-[0.7rem]">{compactHeaderLeadText}</div>
                        <div className="status-pill px-2.5 py-1.5 text-[0.66rem] sm:text-[0.7rem]">{totalHandsTaken} hands</div>
                        {inlineStatusText ? (
                          <div className={clsx('rentz-inline-status rentz-inline-status-header', errorMsg && 'is-error')}>
                            {inlineStatusText}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  )}
                </header>

                {errorMsg && activeTab !== 'play' && (
                  <div className="mb-4 flex items-center gap-2 rounded-[1.5rem] bg-red-500/90 px-4 py-3 text-sm font-bold text-white shadow-lg sm:rounded-full sm:px-6">
                    <Info className="h-5 w-5" />
                    {errorMsg}
                  </div>
                )}

                {renderMainContent()}
              </div>
            </div>
          </main>
        </div>
      </div>

      <nav className="mobile-tab-bar fixed bottom-3 left-2 right-2 z-50 sm:bottom-4 sm:left-3 sm:right-3 md:hidden">
        <div className="glass-panel overflow-x-auto rounded-[1.9rem] border border-[var(--glass-border)] p-2 shadow-[0_20px_40px_rgba(0,0,0,0.2)]">
          <div className="flex min-w-max gap-2">
            {navItems.map((item) => {
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  className={clsx(
                    'relative flex h-[4.5rem] min-w-[5rem] flex-col items-center justify-center gap-1 rounded-[1.45rem] px-3 transition-all duration-500',
                    isActive ? '-translate-y-2 scale-105 text-[var(--nav-active-text)]' : 'text-[var(--text-secondary)]'
                  )}
                >
                  {isActive && <div className="absolute inset-0 rounded-[1.45rem] shadow-[var(--nav-active-shadow)]" style={{ background: 'var(--nav-active-bg)' }} />}
                  <item.icon className="relative z-10 h-5 w-5 drop-shadow-md" />
                  <span className="relative z-10 text-[11px] font-black uppercase tracking-[0.14em]">
                    {item.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </nav>
    </div>
  );
}

export default App;
