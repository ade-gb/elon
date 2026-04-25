import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Landmark,
  Layers3,
  Percent,
  RefreshCw,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  TrendingUp,
  Wallet,
} from 'lucide-react';

const STORAGE_KEY = 'moyodev-usd-dev-app:v1';
const MS_PER_DAY = 1000 * 60 * 60 * 24;

type StrategyId = 'core' | 'credit' | 'liquidity' | 'growth';
type CapitalAction = 'fund' | 'deploy' | 'withdraw';
type NoticeTone = 'success' | 'error' | 'info';
type ActivityKind = 'fund' | 'deploy' | 'withdraw' | 'rebalance' | 'yield';

type StrategyDefinition = {
  id: StrategyId;
  name: string;
  label: string;
  description: string;
  apy: number;
  riskScore: number;
  lockup: string;
  themeClassName: string;
  accentColor: string;
};

type ActivityItem = {
  id: string;
  kind: ActivityKind;
  title: string;
  detail: string;
  amount: number;
  createdAt: string;
  strategyId?: StrategyId;
};

type AppState = {
  walletBalance: number;
  positions: Record<StrategyId, number>;
  targetWeights: Record<StrategyId, number>;
  monthlyContribution: number;
  goalTarget: number;
  goalMonths: number;
  reserveFloor: number;
  autoPilotEnabled: boolean;
  lastHarvestedAt: string;
  activity: ActivityItem[];
};

type Notice = {
  tone: NoticeTone;
  message: string;
} | null;

const STRATEGIES: StrategyDefinition[] = [
  {
    id: 'core',
    name: 'Core Reserve',
    label: 'Treasury-backed cash management',
    description: 'Low-volatility holdings routed into protected on-chain treasury ladders.',
    apy: 4.8,
    riskScore: 1,
    lockup: 'Instant access',
    themeClassName: 'bg-[#F1ECE2] text-black',
    accentColor: '#C9B99D',
  },
  {
    id: 'credit',
    name: 'Credit Yield',
    label: 'Private credit sleeve',
    description: 'Institutional-grade yield routed through diversified credit vaults.',
    apy: 8.6,
    riskScore: 2,
    lockup: '48 hour unwind',
    themeClassName: 'bg-[#DCE7E1] text-black',
    accentColor: '#8CB8A4',
  },
  {
    id: 'liquidity',
    name: 'Liquidity Relay',
    label: 'Stable DeFi routing',
    description: 'Automated routing into high-quality liquidity venues with active guardrails.',
    apy: 11.2,
    riskScore: 3,
    lockup: '24 hour unwind',
    themeClassName: 'bg-[#E8E3F2] text-black',
    accentColor: '#B4A5D9',
  },
  {
    id: 'growth',
    name: 'Growth Alpha',
    label: 'Market-neutral carry',
    description: 'Higher-return sleeve using market-neutral funding and carry strategies.',
    apy: 14.1,
    riskScore: 4,
    lockup: '72 hour unwind',
    themeClassName: 'bg-[#2B2644] text-white',
    accentColor: '#6B5ACD',
  },
];

const NAV_LINKS = [
  { label: 'Overview', href: '#overview' },
  { label: 'Treasury', href: '#portfolio' },
  { label: 'Planner', href: '#planner' },
  { label: 'Activity', href: '#activity' },
];

const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});

const preciseCurrencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function formatCurrency(value: number) {
  return currencyFormatter.format(value);
}

function formatPreciseCurrency(value: number) {
  return preciseCurrencyFormatter.format(value);
}

function roundCurrency(value: number) {
  return Math.round(value * 100) / 100;
}

function formatPercent(value: number) {
  return `${value.toFixed(1)}%`;
}

function makeId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function createActivity(
  kind: ActivityKind,
  title: string,
  detail: string,
  amount: number,
  strategyId?: StrategyId,
): ActivityItem {
  return {
    id: makeId(),
    kind,
    title,
    detail,
    amount,
    createdAt: new Date().toISOString(),
    strategyId,
  };
}

function seedActivity(): ActivityItem[] {
  const now = Date.now();

  return [
    {
      id: makeId(),
      kind: 'yield',
      title: 'Yield harvested',
      detail: 'Rewards swept from all active USD DEV mandates.',
      amount: 428.16,
      createdAt: new Date(now - MS_PER_DAY * 2).toISOString(),
    },
    {
      id: makeId(),
      kind: 'rebalance',
      title: 'Target rebalance executed',
      detail: 'Capital rotated into Credit Yield and Liquidity Relay.',
      amount: 15000,
      createdAt: new Date(now - MS_PER_DAY * 4).toISOString(),
    },
    {
      id: makeId(),
      kind: 'deploy',
      title: 'Capital deployed',
      detail: 'Deployed fresh wallet balance into Core Reserve.',
      amount: 12000,
      createdAt: new Date(now - MS_PER_DAY * 6).toISOString(),
      strategyId: 'core',
    },
    {
      id: makeId(),
      kind: 'fund',
      title: 'Wallet funded',
      detail: 'Treasury wallet received a fresh USD DEV top-up.',
      amount: 25000,
      createdAt: new Date(now - MS_PER_DAY * 8).toISOString(),
    },
  ];
}

function createInitialState(): AppState {
  return {
    walletBalance: 28400,
    positions: {
      core: 42800,
      credit: 17600,
      liquidity: 9100,
      growth: 5500,
    },
    targetWeights: {
      core: 40,
      credit: 28,
      liquidity: 18,
      growth: 14,
    },
    monthlyContribution: 6500,
    goalTarget: 180000,
    goalMonths: 18,
    reserveFloor: 12,
    autoPilotEnabled: true,
    lastHarvestedAt: new Date(Date.now() - MS_PER_DAY * 11).toISOString(),
    activity: seedActivity(),
  };
}

function loadInitialState(): AppState {
  const fallback = createInitialState();

  if (typeof window === 'undefined') {
    return fallback;
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return fallback;
    }

    const parsed = JSON.parse(raw) as Partial<AppState>;

    return {
      ...fallback,
      ...parsed,
      positions: {
        ...fallback.positions,
        ...(parsed.positions ?? {}),
      },
      targetWeights: {
        ...fallback.targetWeights,
        ...(parsed.targetWeights ?? {}),
      },
      activity: Array.isArray(parsed.activity) && parsed.activity.length > 0 ? parsed.activity : fallback.activity,
    };
  } catch {
    return fallback;
  }
}

function getTotalInvested(positions: Record<StrategyId, number>) {
  return STRATEGIES.reduce((sum, strategy) => sum + positions[strategy.id], 0);
}

function getWeightedApy(positions: Record<StrategyId, number>) {
  const totalInvested = getTotalInvested(positions);
  if (totalInvested === 0) {
    return 0;
  }

  return (
    STRATEGIES.reduce((sum, strategy) => sum + positions[strategy.id] * strategy.apy, 0) / totalInvested
  );
}

function getWeightedRisk(positions: Record<StrategyId, number>) {
  const totalInvested = getTotalInvested(positions);
  if (totalInvested === 0) {
    return 0;
  }

  return (
    STRATEGIES.reduce((sum, strategy) => sum + positions[strategy.id] * strategy.riskScore, 0) /
    totalInvested
  );
}

function normalizeWeights(weights: Record<StrategyId, number>) {
  const total = STRATEGIES.reduce((sum, strategy) => sum + weights[strategy.id], 0);

  if (total <= 0) {
    return {
      core: 25,
      credit: 25,
      liquidity: 25,
      growth: 25,
    };
  }

  const normalized: Record<StrategyId, number> = {
    core: 0,
    credit: 0,
    liquidity: 0,
    growth: 0,
  };

  let runningTotal = 0;

  STRATEGIES.forEach((strategy, index) => {
    if (index === STRATEGIES.length - 1) {
      normalized[strategy.id] = roundCurrency(100 - runningTotal);
      return;
    }

    const nextValue = roundCurrency((weights[strategy.id] / total) * 100);
    normalized[strategy.id] = nextValue;
    runningTotal += nextValue;
  });

  return normalized;
}

function getStrategyAllocation(
  strategyId: StrategyId,
  positions: Record<StrategyId, number>,
  totalInvested: number,
) {
  if (totalInvested === 0) {
    return 0;
  }

  return (positions[strategyId] / totalInvested) * 100;
}

function getClaimableRewards(totalInvested: number, weightedApy: number, lastHarvestedAt: string) {
  const elapsedDays = Math.max(0, (Date.now() - new Date(lastHarvestedAt).getTime()) / MS_PER_DAY);
  return totalInvested * (weightedApy / 100) * (elapsedDays / 365);
}

function getProjectedValue(
  currentValue: number,
  annualRate: number,
  monthlyContribution: number,
  months: number,
) {
  const monthlyRate = annualRate / 100 / 12;

  if (months <= 0) {
    return currentValue;
  }

  if (monthlyRate === 0) {
    return currentValue + monthlyContribution * months;
  }

  const growthFactor = Math.pow(1 + monthlyRate, months);
  return currentValue * growthFactor + monthlyContribution * ((growthFactor - 1) / monthlyRate);
}

function formatRelativeTime(createdAt: string) {
  const diff = new Date(createdAt).getTime() - Date.now();
  const minutes = Math.round(diff / (1000 * 60));
  const hours = Math.round(diff / (1000 * 60 * 60));
  const days = Math.round(diff / MS_PER_DAY);

  const formatter = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

  if (Math.abs(minutes) < 60) {
    return formatter.format(minutes, 'minute');
  }

  if (Math.abs(hours) < 24) {
    return formatter.format(hours, 'hour');
  }

  return formatter.format(days, 'day');
}

function getRiskLabel(weightedRisk: number) {
  if (weightedRisk <= 1.5) {
    return 'Conservative';
  }

  if (weightedRisk <= 2.6) {
    return 'Balanced';
  }

  if (weightedRisk <= 3.4) {
    return 'Active';
  }

  return 'Aggressive';
}

function getReserveGuidance(reserveRatio: number, reserveFloor: number) {
  if (reserveRatio < reserveFloor) {
    return 'Top up wallet liquidity to restore your reserve floor before deploying more capital.';
  }

  if (reserveRatio > reserveFloor + 10) {
    return 'You have excess idle cash. Deploy some dry powder into your highest-conviction sleeve.';
  }

  return 'Reserve coverage is healthy. Maintain autopilot and let USD DEV keep routing for you.';
}

function LogoIcon({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      viewBox="0 0 256 256"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        fill="currentColor"
        d="M128.005 191.173C128.448 156.208 156.93 128 192 128V64H128C128 99.346 99.346 128 64 128V192H128L128.005 191.173ZM192 256H64C28.654 256 0 227.346 0 192V64H64V0H192C227.346 0 256 28.654 256 64V192H192V256Z"
      />
    </svg>
  );
}

function OverviewSparkline({ values }: { values: number[] }) {
  const width = 320;
  const height = 128;
  const padding = 14;
  const maxValue = Math.max(...values);
  const minValue = Math.min(...values);
  const range = maxValue - minValue || 1;

  const points = values
    .map((value, index) => {
      const x = padding + (index / (values.length - 1)) * (width - padding * 2);
      const y = height - padding - ((value - minValue) / range) * (height - padding * 2);
      return `${x},${y}`;
    })
    .join(' ');

  const areaPoints = `${padding},${height - padding} ${points} ${width - padding},${height - padding}`;
  const pointSegments = points.split(' ');
  const lastPointSegment = pointSegments[pointSegments.length - 1] ?? '0,0';
  const lastPoint = lastPointSegment.split(',');

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-32 w-full">
      <defs>
        <linearGradient id="spark-fill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="rgba(255,255,255,0.55)" />
          <stop offset="100%" stopColor="rgba(255,255,255,0)" />
        </linearGradient>
      </defs>
      <path d={`M ${areaPoints}`} fill="url(#spark-fill)" />
      <polyline
        fill="none"
        stroke="rgba(255,255,255,0.92)"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points}
      />
      <circle cx={lastPoint[0]} cy={lastPoint[1]} r="5" fill="white" />
    </svg>
  );
}

function ActivityIcon({ kind }: { kind: ActivityKind }) {
  if (kind === 'fund') {
    return <ArrowDownLeft className="h-4 w-4" />;
  }

  if (kind === 'withdraw') {
    return <ArrowUpRight className="h-4 w-4" />;
  }

  if (kind === 'rebalance') {
    return <RefreshCw className="h-4 w-4" />;
  }

  if (kind === 'yield') {
    return <Sparkles className="h-4 w-4" />;
  }

  return <TrendingUp className="h-4 w-4" />;
}

function App() {
  const [appState, setAppState] = useState<AppState>(() => loadInitialState());
  const [capitalAction, setCapitalAction] = useState<CapitalAction>('deploy');
  const [selectedStrategyId, setSelectedStrategyId] = useState<StrategyId>('credit');
  const [capitalAmount, setCapitalAmount] = useState('2500');
  const [activityQuery, setActivityQuery] = useState('');
  const [notice, setNotice] = useState<Notice>({
    tone: 'info',
    message: 'Your workspace is running locally. All balances and actions here are safely simulated and saved on this device.',
  });

  const deferredActivityQuery = useDeferredValue(activityQuery);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(appState));
  }, [appState]);

  const totalInvested = useMemo(() => getTotalInvested(appState.positions), [appState.positions]);
  const weightedApy = useMemo(() => getWeightedApy(appState.positions), [appState.positions]);
  const weightedRisk = useMemo(() => getWeightedRisk(appState.positions), [appState.positions]);
  const claimableRewards = useMemo(
    () => getClaimableRewards(totalInvested, weightedApy, appState.lastHarvestedAt),
    [appState.lastHarvestedAt, totalInvested, weightedApy],
  );
  const netAssetValue = appState.walletBalance + totalInvested + claimableRewards;
  const monthlyYield = totalInvested * (weightedApy / 100 / 12);
  const annualYield = totalInvested * (weightedApy / 100);
  const reserveRatio = netAssetValue > 0 ? (appState.walletBalance / netAssetValue) * 100 : 0;
  const targetWeightSum = STRATEGIES.reduce((sum, strategy) => sum + appState.targetWeights[strategy.id], 0);
  const selectedStrategy = STRATEGIES.find((strategy) => strategy.id === selectedStrategyId) ?? STRATEGIES[0];
  const goalProjection = getProjectedValue(
    totalInvested + appState.walletBalance,
    weightedApy,
    appState.monthlyContribution,
    appState.goalMonths,
  );
  const goalGap = Math.max(0, appState.goalTarget - goalProjection);

  const chartValues = useMemo(() => {
    const seed = totalInvested + appState.walletBalance;

    return Array.from({ length: 8 }, (_, index) => {
      const slope = index * (monthlyYield * 0.7 + appState.monthlyContribution * 0.45);
      const seasonal = Math.sin(index * 0.85) * seed * 0.015;
      return seed * 0.82 + slope + seasonal;
    });
  }, [appState.monthlyContribution, appState.walletBalance, monthlyYield, totalInvested]);

  const filteredActivity = useMemo(() => {
    const normalizedQuery = deferredActivityQuery.trim().toLowerCase();

    if (!normalizedQuery) {
      return appState.activity;
    }

    return appState.activity.filter((item) => {
      const strategy = STRATEGIES.find((entry) => entry.id === item.strategyId);
      const haystack = `${item.title} ${item.detail} ${strategy?.name ?? ''}`.toLowerCase();
      return haystack.includes(normalizedQuery);
    });
  }, [appState.activity, deferredActivityQuery]);

  const quickAmounts = [1000, 5000, 10000, 25000];

  function setNoticeMessage(tone: NoticeTone, message: string) {
    setNotice({ tone, message });
  }

  function handleCapitalSubmit() {
    const amount = Number(capitalAmount);

    if (!Number.isFinite(amount) || amount <= 0) {
      setNoticeMessage('error', 'Enter a valid USD amount before submitting the action.');
      return;
    }

    setAppState((previousState) => {
      if (capitalAction === 'fund') {
        const nextWallet = roundCurrency(previousState.walletBalance + amount);
        setNoticeMessage('success', `${formatCurrency(amount)} added to the USD DEV wallet.`);

        return {
          ...previousState,
          walletBalance: nextWallet,
          activity: [
            createActivity('fund', 'Wallet funded', 'Fresh capital was added to your operating wallet.', amount),
            ...previousState.activity,
          ].slice(0, 20),
        };
      }

      if (capitalAction === 'deploy') {
        if (previousState.walletBalance < amount) {
          setNoticeMessage(
            'error',
            `Deploy failed. Wallet balance is only ${formatCurrency(previousState.walletBalance)}.`,
          );
          return previousState;
        }

        setNoticeMessage(
          'success',
          `${formatCurrency(amount)} deployed into ${selectedStrategy.name}.`,
        );

        return {
          ...previousState,
          walletBalance: roundCurrency(previousState.walletBalance - amount),
          positions: {
            ...previousState.positions,
            [selectedStrategyId]: roundCurrency(previousState.positions[selectedStrategyId] + amount),
          },
          activity: [
            createActivity(
              'deploy',
              'Capital deployed',
              `Capital routed into ${selectedStrategy.name}.`,
              amount,
              selectedStrategyId,
            ),
            ...previousState.activity,
          ].slice(0, 20),
        };
      }

      if (previousState.positions[selectedStrategyId] < amount) {
        setNoticeMessage(
          'error',
          `Withdraw failed. ${selectedStrategy.name} only holds ${formatCurrency(
            previousState.positions[selectedStrategyId],
          )}.`,
        );
        return previousState;
      }

      setNoticeMessage('success', `${formatCurrency(amount)} moved back into your operating wallet.`);

      return {
        ...previousState,
        walletBalance: roundCurrency(previousState.walletBalance + amount),
        positions: {
          ...previousState.positions,
          [selectedStrategyId]: roundCurrency(previousState.positions[selectedStrategyId] - amount),
        },
        activity: [
          createActivity(
            'withdraw',
            'Capital withdrawn',
            `Capital was pulled back out of ${selectedStrategy.name}.`,
            amount,
            selectedStrategyId,
          ),
          ...previousState.activity,
        ].slice(0, 20),
      };
    });
  }

  function handleHarvestRewards() {
    if (claimableRewards < 1) {
      setNoticeMessage('info', 'Rewards are still compounding. Come back after more yield accrues.');
      return;
    }

    setAppState((previousState) => ({
      ...previousState,
      walletBalance: roundCurrency(previousState.walletBalance + claimableRewards),
      lastHarvestedAt: new Date().toISOString(),
      activity: [
        createActivity(
          'yield',
          'Yield harvested',
          'Claimable protocol rewards were swept back to wallet cash.',
          claimableRewards,
        ),
        ...previousState.activity,
      ].slice(0, 20),
    }));

    setNoticeMessage('success', `${formatCurrency(claimableRewards)} harvested into wallet cash.`);
  }

  function handleTargetChange(strategyId: StrategyId, value: number) {
    setAppState((previousState) => ({
      ...previousState,
      targetWeights: {
        ...previousState.targetWeights,
        [strategyId]: value,
      },
    }));
  }

  function handleNormalizeTargets() {
    const normalized = normalizeWeights(appState.targetWeights);

    setAppState((previousState) => ({
      ...previousState,
      targetWeights: normalized,
    }));

    setNoticeMessage('info', 'Target weights were normalized to a clean 100%.');
  }

  function handleRebalancePortfolio() {
    const normalized = normalizeWeights(appState.targetWeights);

    setAppState((previousState) => {
      const investedCapital = getTotalInvested(previousState.positions);

      if (investedCapital === 0) {
        return previousState;
      }

      const nextPositions: Record<StrategyId, number> = {
        core: 0,
        credit: 0,
        liquidity: 0,
        growth: 0,
      };

      STRATEGIES.forEach((strategy) => {
        nextPositions[strategy.id] = roundCurrency(investedCapital * (normalized[strategy.id] / 100));
      });

      return {
        ...previousState,
        targetWeights: normalized,
        positions: nextPositions,
        activity: [
          createActivity(
            'rebalance',
            'Portfolio rebalanced',
            'Positions were redistributed to match the new mandate targets.',
            investedCapital,
          ),
          ...previousState.activity,
        ].slice(0, 20),
      };
    });

    setNoticeMessage('success', 'Rebalance complete. Positions now match your target mandate.');
  }

  function handleResetDemo() {
    setAppState(createInitialState());
    setNoticeMessage('info', 'The demo treasury was reset to the default MOYODEV workspace.');
  }

  const reserveGuidance = getReserveGuidance(reserveRatio, appState.reserveFloor);

  return (
    <div className="flex flex-col bg-[#F5F5F5]">
      <div className="mx-auto w-full max-w-[88rem] px-4 py-4 sm:px-6 lg:px-8 lg:py-6">
        <header className="surface sticky top-4 z-30 mb-6 px-5 py-4">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-black text-white">
                <LogoIcon className="h-6 w-6" />
              </div>

              <div>
                <p className="text-[11px] uppercase tracking-[0.18em] text-black/45">Investment Workspace</p>
                <h1 className="text-xl font-medium tracking-[-0.04em] text-black sm:text-2xl">
                  MOYODEV / USD DEV
                </h1>
                <p className="text-sm text-black/55">
                  Autonomous treasury, yield routing, and reserve management in one surface.
                </p>
              </div>
            </div>

            <nav className="flex flex-wrap items-center gap-2">
              {NAV_LINKS.map((link) => (
                <a
                  key={link.label}
                  href={link.href}
                  className="rounded-full border border-black/8 bg-white px-4 py-2 text-sm font-medium text-black/65 transition-colors duration-200 hover:bg-black hover:text-white"
                >
                  {link.label}
                </a>
              ))}
            </nav>

            <div className="flex flex-wrap items-center gap-2">
              <div className="rounded-full bg-black px-4 py-2 text-sm font-medium text-white">
                Wallet {formatCurrency(appState.walletBalance)}
              </div>
              <button type="button" onClick={handleHarvestRewards} className="dark-button">
                Harvest {formatCurrency(claimableRewards)}
              </button>
            </div>
          </div>
        </header>

        <main className="space-y-6">
          <section id="overview" className="grid gap-6 xl:grid-cols-[minmax(0,1.3fr)_minmax(360px,0.82fr)]">
            <div className="relative overflow-hidden rounded-[32px] bg-[#1B1726] px-7 py-7 text-white shadow-[0_32px_80px_rgba(17,17,17,0.12)] sm:px-8 sm:py-8">
              <video
                autoPlay
                muted
                loop
                playsInline
                className="absolute inset-0 h-full w-full object-cover opacity-40"
                src="https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260423_161253_c72b1869-400f-45ed-ac0c-52f68c2ed5bd.mp4"
              />
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.24),transparent_28%),linear-gradient(135deg,rgba(18,18,22,0.78),rgba(27,23,38,0.94))]" />

              <div className="relative z-10 flex h-full flex-col justify-between gap-10">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-medium uppercase tracking-[0.16em] text-white/75">
                    <ShieldCheck className="h-3.5 w-3.5" />
                    Live mandate controls
                  </div>
                  <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-white/60">
                    <Sparkles className="h-3.5 w-3.5" />
                    Autopilot {appState.autoPilotEnabled ? 'enabled' : 'paused'}
                  </div>
                </div>

                <div className="grid gap-10 lg:grid-cols-[minmax(0,1.1fr)_300px] lg:items-end">
                  <div>
                    <p className="mb-3 text-sm uppercase tracking-[0.16em] text-white/55">
                      Native dollar yield operating system
                    </p>
                    <h2 className="max-w-3xl text-4xl font-medium leading-[0.95] tracking-[-0.055em] sm:text-5xl lg:text-6xl">
                      A working investment desk for cash, treasury yield, and DeFi allocation.
                    </h2>
                    <p className="mt-5 max-w-xl text-base leading-relaxed text-white/70">
                      Route capital, maintain reserves, rebalance your mandate, and plan out your
                      yield runway from a single USD DEV workspace.
                    </p>

                    <div className="mt-7 flex flex-wrap items-center gap-3">
                      <a href="#portfolio" className="dark-button bg-white text-black hover:bg-white/85">
                        Review portfolio
                      </a>
                      <a
                        href="#activity"
                        className="inline-flex items-center gap-2 rounded-full border border-white/15 px-5 py-3 text-sm font-medium text-white transition-colors duration-200 hover:bg-white/10"
                      >
                        View activity
                        <ArrowRight className="h-4 w-4" />
                      </a>
                    </div>
                  </div>

                  <div className="rounded-[28px] border border-white/10 bg-white/10 p-4 backdrop-blur-sm">
                    <div className="mb-3 flex items-center justify-between text-sm text-white/65">
                      <span>Portfolio trajectory</span>
                      <span>12 month pulse</span>
                    </div>
                    <OverviewSparkline values={chartValues} />
                    <div className="mt-2 flex items-center justify-between text-xs uppercase tracking-[0.14em] text-white/40">
                      <span>Starting base</span>
                      <span>Projected now</span>
                    </div>
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <div className="rounded-[24px] border border-white/12 bg-white/8 p-4 backdrop-blur-sm">
                    <p className="text-sm text-white/60">Net asset value</p>
                    <p className="mt-2 text-2xl font-medium tracking-[-0.04em]">{formatCurrency(netAssetValue)}</p>
                  </div>
                  <div className="rounded-[24px] border border-white/12 bg-white/8 p-4 backdrop-blur-sm">
                    <p className="text-sm text-white/60">Blended APY</p>
                    <p className="mt-2 text-2xl font-medium tracking-[-0.04em]">{formatPercent(weightedApy)}</p>
                  </div>
                  <div className="rounded-[24px] border border-white/12 bg-white/8 p-4 backdrop-blur-sm">
                    <p className="text-sm text-white/60">Monthly yield</p>
                    <p className="mt-2 text-2xl font-medium tracking-[-0.04em]">{formatCurrency(monthlyYield)}</p>
                  </div>
                  <div className="rounded-[24px] border border-white/12 bg-white/8 p-4 backdrop-blur-sm">
                    <p className="text-sm text-white/60">Risk profile</p>
                    <p className="mt-2 text-2xl font-medium tracking-[-0.04em]">{getRiskLabel(weightedRisk)}</p>
                  </div>
                </div>
              </div>
            </div>

            <aside id="capital-desk" className="surface flex flex-col gap-5 px-5 py-5 sm:px-6 sm:py-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm uppercase tracking-[0.14em] text-black/45">Capital desk</p>
                  <h3 className="mt-2 text-3xl font-medium tracking-[-0.05em] text-black">
                    {formatCurrency(appState.walletBalance)}
                  </h3>
                  <p className="mt-1 text-sm leading-relaxed text-black/60">
                    Wallet cash available for routing, redeployment, or reserve coverage.
                  </p>
                </div>

                <div className="rounded-2xl bg-black px-3 py-2 text-right text-white">
                  <div className="text-[11px] uppercase tracking-[0.16em] text-white/60">Claimable</div>
                  <div className="text-sm font-medium">{formatPreciseCurrency(claimableRewards)}</div>
                </div>
              </div>

              {notice ? (
                <div
                  className={`rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                    notice.tone === 'success'
                      ? 'bg-[#E2F0E8] text-[#205436]'
                      : notice.tone === 'error'
                        ? 'bg-[#F7E3E0] text-[#7A2F23]'
                        : 'bg-black/5 text-black/70'
                  }`}
                >
                  {notice.message}
                </div>
              ) : null}

              <div className="grid gap-3">
                <label className="text-sm font-medium text-black/70">Action</label>
                <div className="grid grid-cols-3 gap-2">
                  {(['fund', 'deploy', 'withdraw'] as CapitalAction[]).map((action) => (
                    <button
                      key={action}
                      type="button"
                      onClick={() => setCapitalAction(action)}
                      className={`rounded-2xl px-4 py-3 text-sm font-medium capitalize transition-colors duration-200 ${
                        capitalAction === action ? 'bg-black text-white' : 'bg-black/5 text-black/65 hover:bg-black/10'
                      }`}
                    >
                      {action}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid gap-4">
                <div>
                  <label className="mb-2 block text-sm font-medium text-black/70">Amount</label>
                  <input
                    type="number"
                    min="0"
                    step="100"
                    value={capitalAmount}
                    onChange={(event) => setCapitalAmount(event.target.value)}
                    className="field"
                    placeholder="2500"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-black/70">Strategy</label>
                  <select
                    value={selectedStrategyId}
                    onChange={(event) => setSelectedStrategyId(event.target.value as StrategyId)}
                    className="field appearance-none"
                    disabled={capitalAction === 'fund'}
                  >
                    {STRATEGIES.map((strategy) => (
                      <option key={strategy.id} value={strategy.id}>
                        {strategy.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                {quickAmounts.map((amount) => (
                  <button
                    key={amount}
                    type="button"
                    onClick={() => setCapitalAmount(String(amount))}
                    className="rounded-full border border-black/10 bg-white px-3 py-1.5 text-xs font-medium text-black/65 transition-colors duration-200 hover:bg-black hover:text-white"
                  >
                    {formatCurrency(amount)}
                  </button>
                ))}
              </div>

              <button type="button" onClick={handleCapitalSubmit} className="dark-button w-full justify-center py-3.5 text-base">
                {capitalAction === 'fund'
                  ? 'Fund wallet'
                  : capitalAction === 'deploy'
                    ? `Deploy to ${selectedStrategy.name}`
                    : `Withdraw from ${selectedStrategy.name}`}
              </button>

              <div className="rounded-[28px] bg-[#F3F0EA] p-4">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-xs uppercase tracking-[0.15em] text-black/45">Selected mandate</p>
                    <p className="mt-2 text-xl font-medium tracking-[-0.04em] text-black">{selectedStrategy.name}</p>
                    <p className="mt-1 text-sm text-black/55">{selectedStrategy.label}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs uppercase tracking-[0.15em] text-black/45">Target yield</p>
                    <p className="mt-2 text-xl font-medium tracking-[-0.04em] text-black">
                      {formatPercent(selectedStrategy.apy)}
                    </p>
                  </div>
                </div>
                <p className="mt-4 text-sm leading-relaxed text-black/60">{selectedStrategy.description}</p>
              </div>
            </aside>
          </section>

          <section id="portfolio" className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.7fr)]">
            <div className="surface px-5 py-5 sm:px-6 sm:py-6">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                <div>
                  <p className="text-sm uppercase tracking-[0.15em] text-black/45">Treasury mandates</p>
                  <h3 className="mt-2 text-3xl font-medium tracking-[-0.05em] text-black">
                    Portfolio routing
                  </h3>
                  <p className="mt-2 max-w-2xl text-sm leading-relaxed text-black/60">
                    Adjust target allocations, keep a reserve buffer, and rebalance the USD DEV
                    treasury with one action.
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={handleNormalizeTargets} className="subtle-button">
                    Normalize targets
                  </button>
                  <button type="button" onClick={handleRebalancePortfolio} className="dark-button">
                    Rebalance to target
                  </button>
                </div>
              </div>

              <div className="mt-6 overflow-hidden rounded-full bg-black/6">
                <div className="flex h-3 w-full">
                  {STRATEGIES.map((strategy) => {
                    const allocation = getStrategyAllocation(strategy.id, appState.positions, totalInvested);
                    return (
                      <div
                        key={strategy.id}
                        className="h-full"
                        style={{ width: `${allocation}%`, backgroundColor: strategy.accentColor }}
                      />
                    );
                  })}
                </div>
              </div>

              <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-sm text-black/55">
                <span>{formatCurrency(totalInvested)} actively invested</span>
                <span>Target weights total {targetWeightSum.toFixed(1)}%</span>
              </div>

              <div className="mt-6 grid gap-4">
                {STRATEGIES.map((strategy) => {
                  const allocation = getStrategyAllocation(strategy.id, appState.positions, totalInvested);

                  return (
                    <article
                      key={strategy.id}
                      className={`rounded-[28px] p-5 ${strategy.themeClassName}`}
                    >
                      <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
                        <div>
                          <p className="text-xs uppercase tracking-[0.16em] opacity-55">{strategy.label}</p>
                          <h4 className="mt-2 text-2xl font-medium tracking-[-0.04em]">{strategy.name}</h4>
                          <p className="mt-2 max-w-xl text-sm leading-relaxed opacity-70">
                            {strategy.description}
                          </p>
                        </div>

                        <div className="grid min-w-[220px] grid-cols-2 gap-3 text-sm">
                          <div>
                            <p className="opacity-55">Position</p>
                            <p className="mt-1 text-lg font-medium tracking-[-0.03em]">
                              {formatCurrency(appState.positions[strategy.id])}
                            </p>
                          </div>
                          <div>
                            <p className="opacity-55">Live allocation</p>
                            <p className="mt-1 text-lg font-medium tracking-[-0.03em]">
                              {formatPercent(allocation)}
                            </p>
                          </div>
                          <div>
                            <p className="opacity-55">Target APY</p>
                            <p className="mt-1 text-lg font-medium tracking-[-0.03em]">
                              {formatPercent(strategy.apy)}
                            </p>
                          </div>
                          <div>
                            <p className="opacity-55">Liquidity</p>
                            <p className="mt-1 text-lg font-medium tracking-[-0.03em]">{strategy.lockup}</p>
                          </div>
                        </div>
                      </div>

                      <div className="mt-5">
                        <div className="mb-2 flex items-center justify-between text-sm">
                          <span className="opacity-60">Target weight</span>
                          <span className="font-medium">{appState.targetWeights[strategy.id].toFixed(1)}%</span>
                        </div>
                        <input
                          type="range"
                          min="0"
                          max="100"
                          step="1"
                          value={appState.targetWeights[strategy.id]}
                          onChange={(event) => handleTargetChange(strategy.id, Number(event.target.value))}
                          className="w-full accent-black"
                        />
                      </div>
                    </article>
                  );
                })}
              </div>
            </div>

            <div id="planner" className="space-y-6">
              <section className="surface px-5 py-5 sm:px-6 sm:py-6">
                <div className="flex items-center gap-2 text-sm uppercase tracking-[0.15em] text-black/45">
                  <Percent className="h-4 w-4" />
                  Goal planner
                </div>
                <h3 className="mt-3 text-3xl font-medium tracking-[-0.05em] text-black">Future runway</h3>
                <p className="mt-2 text-sm leading-relaxed text-black/60">
                  Tune a contribution plan and see what the current blended strategy can compound into.
                </p>

                <div className="mt-5 grid gap-4">
                  <div>
                    <label className="mb-2 block text-sm font-medium text-black/70">Monthly contribution</label>
                    <input
                      type="number"
                      min="0"
                      step="100"
                      value={appState.monthlyContribution}
                      onChange={(event) =>
                        setAppState((previousState) => ({
                          ...previousState,
                          monthlyContribution: Math.max(0, Number(event.target.value) || 0),
                        }))
                      }
                      className="field"
                    />
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label className="mb-2 block text-sm font-medium text-black/70">Target value</label>
                      <input
                        type="number"
                        min="0"
                        step="1000"
                        value={appState.goalTarget}
                        onChange={(event) =>
                          setAppState((previousState) => ({
                            ...previousState,
                            goalTarget: Math.max(0, Number(event.target.value) || 0),
                          }))
                        }
                        className="field"
                      />
                    </div>

                    <div>
                      <label className="mb-2 block text-sm font-medium text-black/70">Time horizon (months)</label>
                      <input
                        type="number"
                        min="1"
                        max="120"
                        step="1"
                        value={appState.goalMonths}
                        onChange={(event) =>
                          setAppState((previousState) => ({
                            ...previousState,
                            goalMonths: Math.max(1, Number(event.target.value) || 1),
                          }))
                        }
                        className="field"
                      />
                    </div>
                  </div>
                </div>

                <div className="mt-5 rounded-[28px] bg-[#111111] p-5 text-white">
                  <p className="text-xs uppercase tracking-[0.16em] text-white/55">Projected value</p>
                  <h4 className="mt-2 text-4xl font-medium tracking-[-0.05em]">{formatCurrency(goalProjection)}</h4>
                  <div className="mt-5 grid gap-3 sm:grid-cols-2">
                    <div className="rounded-2xl bg-white/8 p-4">
                      <p className="text-sm text-white/55">Target gap</p>
                      <p className="mt-1 text-xl font-medium tracking-[-0.04em]">
                        {goalGap > 0 ? formatCurrency(goalGap) : 'Target exceeded'}
                      </p>
                    </div>
                    <div className="rounded-2xl bg-white/8 p-4">
                      <p className="text-sm text-white/55">Projected annualized yield</p>
                      <p className="mt-1 text-xl font-medium tracking-[-0.04em]">
                        {formatCurrency(annualYield)}
                      </p>
                    </div>
                  </div>
                </div>
              </section>

              <section className="surface px-5 py-5 sm:px-6 sm:py-6">
                <div className="flex items-center gap-2 text-sm uppercase tracking-[0.15em] text-black/45">
                  <SlidersHorizontal className="h-4 w-4" />
                  Protocol controls
                </div>

                <div className="mt-4 space-y-5">
                  <div className="flex items-center justify-between gap-4 rounded-[24px] bg-black/4 px-4 py-4">
                    <div>
                      <p className="text-base font-medium text-black">Autopilot routing</p>
                      <p className="mt-1 text-sm text-black/55">
                        Automatically maintain target allocations and reserve posture.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        setAppState((previousState) => ({
                          ...previousState,
                          autoPilotEnabled: !previousState.autoPilotEnabled,
                        }))
                      }
                      className={`relative h-9 w-16 rounded-full transition-colors duration-200 ${
                        appState.autoPilotEnabled ? 'bg-black' : 'bg-black/10'
                      }`}
                    >
                      <span
                        className={`absolute top-1 h-7 w-7 rounded-full bg-white transition-transform duration-200 ${
                          appState.autoPilotEnabled ? 'translate-x-8' : 'translate-x-1'
                        }`}
                      />
                    </button>
                  </div>

                  <div>
                    <div className="mb-2 flex items-center justify-between text-sm text-black/65">
                      <span>Reserve floor</span>
                      <span>{appState.reserveFloor}%</span>
                    </div>
                    <input
                      type="range"
                      min="5"
                      max="35"
                      step="1"
                      value={appState.reserveFloor}
                      onChange={(event) =>
                        setAppState((previousState) => ({
                          ...previousState,
                          reserveFloor: Number(event.target.value),
                        }))
                      }
                      className="w-full accent-black"
                    />
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-[24px] bg-[#F3F0EA] p-4">
                      <p className="text-sm text-black/55">Reserve ratio</p>
                      <p className="mt-1 text-xl font-medium tracking-[-0.04em] text-black">
                        {formatPercent(reserveRatio)}
                      </p>
                    </div>
                    <div className="rounded-[24px] bg-[#F3F0EA] p-4">
                      <p className="text-sm text-black/55">Liquidity posture</p>
                      <p className="mt-1 text-xl font-medium tracking-[-0.04em] text-black">
                        {reserveRatio >= appState.reserveFloor ? 'Protected' : 'Needs capital'}
                      </p>
                    </div>
                  </div>

                  <div className="rounded-[24px] bg-[#111111] p-4 text-white">
                    <div className="flex items-center gap-2 text-sm text-white/55">
                      <CheckCircle2 className="h-4 w-4" />
                      Recommendation
                    </div>
                    <p className="mt-3 text-base leading-relaxed text-white/78">{reserveGuidance}</p>
                  </div>

                  <button type="button" onClick={handleResetDemo} className="subtle-button w-full justify-center py-3">
                    Reset demo workspace
                  </button>
                </div>
              </section>
            </div>
          </section>

          <section className="grid gap-6 xl:grid-cols-[minmax(300px,0.62fr)_minmax(0,1fr)]">
            <section className="surface px-5 py-5 sm:px-6 sm:py-6">
              <div className="flex items-center gap-2 text-sm uppercase tracking-[0.15em] text-black/45">
                <Landmark className="h-4 w-4" />
                Treasury health
              </div>
              <h3 className="mt-3 text-3xl font-medium tracking-[-0.05em] text-black">
                Operating posture
              </h3>

              <div className="mt-5 space-y-3">
                <div className="rounded-[24px] bg-[#F3F0EA] p-4">
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-black/55">Wallet dry powder</p>
                    <Wallet className="h-4 w-4 text-black/45" />
                  </div>
                  <p className="mt-2 text-2xl font-medium tracking-[-0.04em] text-black">
                    {formatCurrency(appState.walletBalance)}
                  </p>
                </div>

                <div className="rounded-[24px] bg-[#F3F0EA] p-4">
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-black/55">Blended risk score</p>
                    <ShieldCheck className="h-4 w-4 text-black/45" />
                  </div>
                  <p className="mt-2 text-2xl font-medium tracking-[-0.04em] text-black">
                    {weightedRisk.toFixed(2)} / 4.0
                  </p>
                </div>

                <div className="rounded-[24px] bg-[#111111] p-4 text-white">
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-white/55">Compounding status</p>
                    <Clock3 className="h-4 w-4 text-white/45" />
                  </div>
                  <p className="mt-2 text-2xl font-medium tracking-[-0.04em]">
                    {appState.autoPilotEnabled ? 'Continuously routing' : 'Manual mode'}
                  </p>
                </div>
              </div>

              <div className="mt-5 rounded-[28px] border border-black/6 p-4">
                <div className="mb-3 flex items-center gap-2 text-sm font-medium text-black">
                  <Layers3 className="h-4 w-4" />
                  Strategy pulse
                </div>
                <div className="space-y-3">
                  {STRATEGIES.map((strategy) => (
                    <button
                      key={strategy.id}
                      type="button"
                      onClick={() => {
                        setSelectedStrategyId(strategy.id);
                        setCapitalAction('deploy');
                        setNoticeMessage('info', `${strategy.name} is now selected in the capital desk.`);
                      }}
                      className="flex w-full items-center justify-between rounded-2xl bg-black/4 px-4 py-3 text-left transition-colors duration-200 hover:bg-black/8"
                    >
                      <div>
                        <p className="text-sm font-medium text-black">{strategy.name}</p>
                        <p className="text-xs text-black/50">{strategy.label}</p>
                      </div>
                      <div className="flex items-center gap-2 text-sm font-medium text-black">
                        {formatPercent(strategy.apy)}
                        <ChevronRight className="h-4 w-4 text-black/40" />
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </section>

            <section id="activity" className="surface px-5 py-5 sm:px-6 sm:py-6">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                <div>
                  <div className="flex items-center gap-2 text-sm uppercase tracking-[0.15em] text-black/45">
                    <Activity className="h-4 w-4" />
                    Activity
                  </div>
                  <h3 className="mt-3 text-3xl font-medium tracking-[-0.05em] text-black">
                    Investment ledger
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-black/60">
                    Search recent treasury actions, harvests, withdrawals, and mandate changes.
                  </p>
                </div>

                <input
                  type="search"
                  value={activityQuery}
                  onChange={(event) => setActivityQuery(event.target.value)}
                  placeholder="Search activity"
                  className="field max-w-sm"
                />
              </div>

              <div className="mt-6 space-y-3">
                {filteredActivity.length > 0 ? (
                  filteredActivity.map((item) => (
                    <article
                      key={item.id}
                      className="flex flex-col gap-4 rounded-[24px] border border-black/6 bg-white px-4 py-4 shadow-[0_10px_24px_rgba(17,17,17,0.03)] md:flex-row md:items-center md:justify-between"
                    >
                      <div className="flex items-start gap-3">
                        <div className="mt-0.5 flex h-10 w-10 items-center justify-center rounded-2xl bg-black text-white">
                          <ActivityIcon kind={item.kind} />
                        </div>

                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <h4 className="text-base font-medium text-black">{item.title}</h4>
                            {item.strategyId ? (
                              <span className="rounded-full bg-black/5 px-2 py-1 text-[11px] font-medium uppercase tracking-[0.14em] text-black/55">
                                {STRATEGIES.find((strategy) => strategy.id === item.strategyId)?.name}
                              </span>
                            ) : null}
                          </div>
                          <p className="mt-1 text-sm leading-relaxed text-black/55">{item.detail}</p>
                        </div>
                      </div>

                      <div className="flex items-center justify-between gap-5 md:min-w-[180px] md:justify-end">
                        <div className="text-sm text-black/45">{formatRelativeTime(item.createdAt)}</div>
                        <div className="text-right">
                          <div className="text-base font-medium tracking-[-0.03em] text-black">
                            {formatPreciseCurrency(item.amount)}
                          </div>
                          <div className="text-xs uppercase tracking-[0.12em] text-black/40">
                            {item.kind}
                          </div>
                        </div>
                      </div>
                    </article>
                  ))
                ) : (
                  <div className="rounded-[24px] bg-black/4 px-4 py-10 text-center text-sm text-black/55">
                    No activity matched “{activityQuery}”.
                  </div>
                )}
              </div>
            </section>
          </section>
        </main>
      </div>
    </div>
  );
}

export default App;
