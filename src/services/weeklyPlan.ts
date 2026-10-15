// src/services/weeklyPlan.ts
// Port dari n8n: Summarize Weekly Plan Context v2.3.5

export interface WorkoutLog {
  Date: string;
  Duration_Min: number;
  jenis_latihan?: string;
  Distance_KM?: number;
}

export interface ReadinessContext {
  rhrDelta: number | null;
  sleepHours: number | null;
  readinessStatus: 'Red' | 'Yellow' | 'Green' | 'Unknown';
}

export interface WeeklyPlanTarget {
  weekStartDate: string;
  targetWeeklyMinutes: number;
  baselineWeeklyMinutes: number | null;
  actualWeeklyMinutes: number;
  actualSource: string;
  baselineVsActualPct: number | null;
  recommendationReason: string;
  readinessStatus: string;
  rhrDelta: number | null;
}

export type WorkoutType = 'easy' | 'interval' | 'tempo' | 'long run' | 'rest' | 'strength';

export interface DayPlan {
  type: WorkoutType;
  durationMin: number;
  description: string;
}

export interface WeeklyPlan {
  weekStartDate: string;
  monday: DayPlan;
  tuesday: DayPlan;
  wednesday: DayPlan;
  thursday: DayPlan;
  friday: DayPlan;
  saturday: DayPlan;
  sunday: DayPlan;
  targetWeeklyMinutes: number;
  baselineWeeklyMinutes: number | null;
  actualWeeklyMinutes: number;
  reasoning: string;
  createdAt: string;
}

// ============================================
// HELPERS
// ============================================

const shiftDate = (iso: string, days: number): string => {
  const dt = new Date(iso + 'T00:00:00Z');
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
};

const median = (values: number[]): number | null => {
  const a = values.filter(Number.isFinite).sort((x, y) => x - y);
  if (!a.length) return null;
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
};

const dateKey = (v: any): string | null => {
  if (!v) return null;
  const s = String(v).trim();
  const iso = s.match(/^(\d{4}-\d{2}-\d{2})/);
  if (iso) return iso[1];
  const dmy = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
  return null;
};

const isRunning = (type: string): boolean => {
  const t = (type || '').toLowerCase();
  return !/strength|gym|weight|angkat beban|mobility|yoga|cycling|sepeda|swim|renang|rest|istirahat/.test(t);
};

const isHard = (type: string): boolean => {
  return /interval|tempo|threshold|speed|hill|long run|race|hard|berat/i.test(type || '');
};

// ============================================
// CORE: Calculate weekly target
// ============================================

export const calculateWeeklyTarget = (
  allLogs: WorkoutLog[],
  readiness: ReadinessContext,
  goalTargetMinutes: number = 0
): WeeklyPlanTarget => {
  const today = new Date().toISOString().slice(0, 10);
  const dow = new Date(today + 'T00:00:00Z').getUTCDay();
  const daysSinceMonday = (dow + 6) % 7;
  const weekStart = shiftDate(today, -daysSinceMonday);
  const periodEnd = dow === 0 ? shiftDate(today, -1) : today;

  const normalized = allLogs
    .map(r => ({
      ...r,
      _date: dateKey(r.Date),
      _duration: Number(r.Duration_Min) || 0,
      _type: r.jenis_latihan || '',
    }))
    .filter(r => r._date);

  // Baseline = median rolling-7d duration, 28 hari sebelum weekStart
  const historicalDays: { date: string; rolling7: number }[] = [];
  const startHist = shiftDate(weekStart, -56);
  const endHist = shiftDate(weekStart, -1);

  for (let d = startHist; d <= endHist; d = shiftDate(d, 1)) {
    const windowStart = shiftDate(d, -6);
    const total = normalized
      .filter(r => r._date! >= windowStart && r._date! <= d && isRunning(r._type))
      .reduce((sum, r) => sum + r._duration, 0);
    historicalDays.push({ date: d, rolling7: total });
  }

  let baselineRows = historicalDays.filter(h => h.date >= shiftDate(weekStart, -28));
  let baselineValues = baselineRows.map(h => h.rolling7).filter(Number.isFinite);
  if (baselineValues.filter(v => v > 0).length < 7) {
    baselineValues = historicalDays
      .filter(h => h.date >= shiftDate(weekStart, -56))
      .map(h => h.rolling7)
      .filter(Number.isFinite);
  }
  const baselineWeeklyMinutes = median(baselineValues);

  // Aktual minggu berjalan
  const actualRows = normalized.filter(r => {
    if (!r._date || r._date < weekStart || r._date > periodEnd) return false;
    return isRunning(r._type);
  });
  const actualWeeklyMinutes = actualRows.reduce((s, r) => s + r._duration, 0);
  const actualSource = `Workout_Logs (${actualRows.length} entri, ${weekStart}–${periodEnd})`;

  // Rule target
  const { rhrDelta, readinessStatus } = readiness;
  const statusLower = readinessStatus.toLowerCase();
  let targetWeeklyMinutes: number;
  let recommendationReason: string;

  if (statusLower.includes('red') || (rhrDelta !== null && rhrDelta >= 5)) {
    targetWeeklyMinutes = Math.round(actualWeeklyMinutes);
    recommendationReason = 'Readiness Red atau Delta RHR ≥5 bpm: jangan mengejar baseline; pertahankan atau kurangi beban sampai pemulihan membaik.';
  } else if (
    statusLower.includes('yellow') ||
    (rhrDelta !== null && rhrDelta >= 3)
  ) {
    targetWeeklyMinutes = baselineWeeklyMinutes !== null
      ? Math.round(Math.max(actualWeeklyMinutes, Math.min(baselineWeeklyMinutes * 0.60, actualWeeklyMinutes + 20)))
      : Math.round(actualWeeklyMinutes * 1.10);
    recommendationReason = 'Mode hati-hati: sinyal pemulihan belum sepenuhnya meyakinkan; naikkan bertahap, bukan langsung ke baseline.';
  } else if (baselineWeeklyMinutes !== null && baselineWeeklyMinutes > actualWeeklyMinutes * 1.30) {
    targetWeeklyMinutes = Math.round(Math.max(actualWeeklyMinutes, Math.min(baselineWeeklyMinutes * 0.75, actualWeeklyMinutes + 45)));
    recommendationReason = 'Volume aktual minggu ini jauh di bawah baseline historis; lakukan return-to-volume bertahap.';
  } else if (baselineWeeklyMinutes !== null) {
    targetWeeklyMinutes = Math.round(Math.max(actualWeeklyMinutes, Math.min(baselineWeeklyMinutes * 1.05, actualWeeklyMinutes * 1.10)));
    recommendationReason = 'Volume disesuaikan dengan baseline historis dan progresi moderat dari volume aktual.';
  } else {
    targetWeeklyMinutes = Math.round(actualWeeklyMinutes * 1.10);
    recommendationReason = 'Baseline historis tidak cukup; gunakan progresi konservatif dari volume aktual.';
  }

  if (goalTargetMinutes > 0) targetWeeklyMinutes = Math.min(targetWeeklyMinutes, goalTargetMinutes);
  targetWeeklyMinutes = Math.max(0, Math.round(targetWeeklyMinutes));

  const baselineVsActualPct =
    baselineWeeklyMinutes && baselineWeeklyMinutes > 0
      ? (actualWeeklyMinutes / baselineWeeklyMinutes) * 100
      : null;

  return {
    weekStartDate: weekStart,
    targetWeeklyMinutes,
    baselineWeeklyMinutes,
    actualWeeklyMinutes,
    actualSource,
    baselineVsActualPct,
    recommendationReason,
    readinessStatus,
    rhrDelta,
  };
};

// ============================================
// Generator jadwal (rule-based)
// ============================================

const dist = (total: number, ratios: number[]): number[] =>
  ratios.map(r => Math.round(total * r));

export const generateLocalWeeklyPlan = (target: WeeklyPlanTarget): WeeklyPlan => {
  const T = target.targetWeeklyMinutes;
  const status = target.readinessStatus.toLowerCase();
  const isRed = status.includes('red') || (target.rhrDelta !== null && target.rhrDelta >= 5);
  const isYellow = status.includes('yellow') || (target.rhrDelta !== null && target.rhrDelta >= 3);

  const reasoning: string[] = [];
  reasoning.push(`Target total: ${T} menit.`);
  reasoning.push(target.recommendationReason);
  if (target.baselineWeeklyMinutes !== null) {
    reasoning.push(`Baseline historis: ${Math.round(target.baselineWeeklyMinutes)} menit/minggu.`);
  }

  let plan: Omit<WeeklyPlan, 'createdAt'>;

  if (isRed) {
    const [mon, , wed, , fri, sat] = dist(T, [0.18, 0.14, 0.16, 0.14, 0.16, 0.22]);
    plan = {
      weekStartDate: target.weekStartDate,
      monday: { type: 'easy', durationMin: mon, description: 'Easy run, Z2, tanpa target pace' },
      tuesday: { type: 'rest', durationMin: 0, description: 'Rest total / mobility ringan' },
      wednesday: { type: 'easy', durationMin: wed, description: 'Easy run, Z2' },
      thursday: { type: 'rest', durationMin: 0, description: 'Rest' },
      friday: { type: 'easy', durationMin: fri, description: 'Easy run, Z2' },
      saturday: { type: 'easy', durationMin: sat, description: 'Easy long-ish run, Z2, tanpa intensitas' },
      sunday: { type: 'rest', durationMin: 0, description: 'Rest total' },
      targetWeeklyMinutes: T,
      baselineWeeklyMinutes: target.baselineWeeklyMinutes,
      actualWeeklyMinutes: target.actualWeeklyMinutes,
      reasoning: reasoning.join(' ') + ' Mode Red: tidak ada sesi kualitas.',
    };
  } else if (isYellow || T < 150) {
    const [mon, , wed, thu, , sat] = dist(T, [0.16, 0.14, 0.18, 0.14, 0.16, 0.22]);
    plan = {
      weekStartDate: target.weekStartDate,
      monday: { type: 'easy', durationMin: mon, description: 'Easy run, Z2' },
      tuesday: { type: 'rest', durationMin: 0, description: 'Rest / mobility' },
      wednesday: { type: 'tempo', durationMin: wed, description: 'Tempo run ringan (1 sesi kualitas). 15-20 menit tempo di tengah.' },
      thursday: { type: 'easy', durationMin: thu, description: 'Easy recovery run, Z2' },
      friday: { type: 'rest', durationMin: 0, description: 'Rest' },
      saturday: { type: 'long run', durationMin: sat, description: 'Long run Z2, tanpa intensitas' },
      sunday: { type: 'rest', durationMin: 0, description: 'Rest total' },
      targetWeeklyMinutes: T,
      baselineWeeklyMinutes: target.baselineWeeklyMinutes,
      actualWeeklyMinutes: target.actualWeeklyMinutes,
      reasoning: reasoning.join(' ') + ' Mode hati-hati: maksimal 1 sesi kualitas.',
    };
  } else {
    const [mon, tue, , thu, , sat] = dist(T, [0.14, 0.16, 0.18, 0.14, 0.16, 0.22]);
    plan = {
      weekStartDate: target.weekStartDate,
      monday: { type: 'easy', durationMin: mon, description: 'Easy run, Z2' },
      tuesday: { type: 'interval', durationMin: tue, description: 'Interval / speed work (sesi kualitas 1)' },
      wednesday: { type: 'easy', durationMin: Math.round(T * 0.18), description: 'Easy recovery run, Z2' },
      thursday: { type: 'tempo', durationMin: thu, description: 'Tempo run (sesi kualitas 2)' },
      friday: { type: 'rest', durationMin: 0, description: 'Rest' },
      saturday: { type: 'long run', durationMin: sat, description: 'Long run Z2 (25-35% total mingguan)' },
      sunday: { type: 'rest', durationMin: 0, description: 'Rest total' },
      targetWeeklyMinutes: T,
      baselineWeeklyMinutes: target.baselineWeeklyMinutes,
      actualWeeklyMinutes: target.actualWeeklyMinutes,
      reasoning: reasoning.join(' '),
    };
  }

  return { ...plan, createdAt: new Date().toISOString() };
};

// ============================================
// Deteksi progress minggu berjalan
// ============================================

export interface WeeklyProgress {
  weekStartDate: string;
  daysElapsed: number;
  daysTotal: number;
  actualMinutes: number;
  targetMinutes: number;
  progressPct: number;
  expectedPct: number;
}

export const calculateWeeklyProgress = (
  plan: WeeklyPlan,
  logs: WorkoutLog[]
): WeeklyProgress => {
  const today = new Date().toISOString().slice(0, 10);
  const dow = new Date(today + 'T00:00:00Z').getUTCDay();
  const daysSinceMonday = (dow + 6) % 7;
  const daysElapsed = Math.min(daysSinceMonday + 1, 7);
  const expectedPct = (daysElapsed / 7) * 100;

  const weekEnd = shiftDate(plan.weekStartDate, 6);
  const actualMinutes = logs
    .map(r => ({ ...r, _date: dateKey(r.Date), _dur: Number(r.Duration_Min) || 0, _type: r.jenis_latihan || '' }))
    .filter(r => r._date && r._date >= plan.weekStartDate && r._date <= weekEnd && isRunning(r._type))
    .reduce((s, r) => s + r._dur, 0);

  const progressPct = plan.targetWeeklyMinutes > 0
    ? (actualMinutes / plan.targetWeeklyMinutes) * 100
    : 0;

  return {
    weekStartDate: plan.weekStartDate,
    daysElapsed,
    daysTotal: 7,
    actualMinutes,
    targetMinutes: plan.targetWeeklyMinutes,
    progressPct,
    expectedPct,
  };
};