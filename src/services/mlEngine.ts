// src/services/mlEngine.ts

export interface ReadinessInput {
  rhrToday: number;
  rhr7dMedian: number;
  sleepHours: number;
  sleep7dMean: number;
  sleep7dSd: number;
  rhrSd: number;
  acwr: number;
}

export interface MLResult {
  risk: number;
  decision: 'KEEP' | 'DOWNGRADE' | 'REST';
  recommendedWorkout: string;
}

export const calculateReadinessRisk = (input: ReadinessInput): MLResult => {
  const deltaRhr = input.rhrToday - input.rhr7dMedian;
  const rhrZ = input.rhrSd > 0 ? deltaRhr / input.rhrSd : 0;
  const sleepZ = input.sleep7dSd > 0 ? (input.sleepHours - input.sleep7dMean) / input.sleep7dSd : 0;

  // Rule Score / Domain Knowledge Blend
  let ruleScore = 0;
  if (rhrZ > 0.5) ruleScore += (rhrZ - 0.5) * 0.35;
  if (sleepZ < -0.5) ruleScore += (-sleepZ - 0.5) * 0.25;
  if (input.acwr > 1.1) ruleScore += (input.acwr - 1.1) * 0.20;

  const risk = Math.max(0, Math.min(1, ruleScore));

  let decision: 'KEEP' | 'DOWNGRADE' | 'REST' = 'KEEP';
  let recommendedWorkout = 'Ikuti Today Plan (Zone 2 Easy Run)';

  if (risk >= 0.70 || rhrZ >= 2.0) {
    decision = 'REST';
    recommendedWorkout = 'Recovery total / Istirahat; hindari intensitas tinggi.';
  } else if (risk >= 0.40 || rhrZ >= 1.0) {
    decision = 'DOWNGRADE';
    recommendedWorkout = 'Turunkan stimulus: pertahankan durasi ringan/Z2, hindari interval.';
  }

  return {
    risk: Number(risk.toFixed(4)),
    decision,
    recommendedWorkout,
  };
};