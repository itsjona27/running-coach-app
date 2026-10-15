import AppleHealthKit, { HealthKitPermissions } from 'react-native-health';
import { WorkoutLog } from './weeklyPlan';

const permissions: HealthKitPermissions = {
  permissions: {
    read: [
      AppleHealthKit.Constants?.Permissions?.RestingHeartRate || 'RestingHeartRate',
      AppleHealthKit.Constants?.Permissions?.SleepAnalysis || 'SleepAnalysis',
      AppleHealthKit.Constants?.Permissions?.Workout || 'Workout',
    ],
    write: [],
  },
};

export const initializeHealthKit = (): Promise<boolean> => {
  return new Promise((resolve) => {
    if (!AppleHealthKit || !AppleHealthKit.initHealthKit) {
      resolve(true);
      return;
    }

    AppleHealthKit.initHealthKit(permissions, (error: string) => {
      if (error) {
        console.error('Error initializing HealthKit: ', error);
        resolve(false);
        return;
      }
      resolve(true);
    });
  });
};

export interface HealthDataMetrics {
  rhrToday: number;
  rhr7dMedian: number;
  rhrSd: number;
  sleepHours: number;
  sleep7dMean: number;
  sleep7dSd: number;
  acwr: number;
}

// Menghitung standar deviasi
const calculateSD = (numbers: number[], mean: number): number => {
  if (numbers.length <= 1) return 0.5;
  const variance = numbers.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / numbers.length;
  return Math.sqrt(variance) || 0.5;
};

// Menghitung median
const calculateMedian = (numbers: number[]): number => {
  if (numbers.length === 0) return 60;
  const sorted = [...numbers].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};

export const fetchAllHealthMetrics = (): Promise<HealthDataMetrics> => {
  return new Promise((resolve) => {
    // Jika berjalan di Expo Go tanpa modul native, kembalikan simulasi realistis
    if (!AppleHealthKit || !AppleHealthKit.getRestingHeartRate) {
      resolve({
        rhrToday: 66,
        rhr7dMedian: 64,
        rhrSd: 1.5,
        sleepHours: 7.2,
        sleep7dMean: 7.0,
        sleep7dSd: 0.6,
        acwr: 1.05,
      });
      return;
    }

    const now = new Date();
    const startDate28d = new Date(now.getTime() - 28 * 24 * 60 * 60 * 1000).toISOString();
    const startDate7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

    // 1. Fetch RHR Data 7 hari terakhir
    AppleHealthKit.getRestingHeartRate({ startDate: startDate7d }, (errRhr: string, rhrResults: any) => {
      const rhrValues = (rhrResults || []).map((item: any) => item.value);
      const rhrToday = rhrValues.length > 0 ? rhrValues[rhrValues.length - 1] : 65;
      const rhr7dMedian = calculateMedian(rhrValues.length > 0 ? rhrValues : [65]);
      const rhrSd = calculateSD(rhrValues, rhr7dMedian);

      // 2. Fetch Sleep Data 7 hari terakhir
      AppleHealthKit.getSleepSamples({ startDate: startDate7d }, (errSleep: string, sleepResults: any[]) => {
        let dailySleep: { [date: string]: number } = {};
        (sleepResults || []).forEach((sample) => {
          const duration = (new Date(sample.endDate).getTime() - new Date(sample.startDate).getTime()) / (1000 * 60 * 60);
          const dateStr = sample.startDate.split('T')[0];
          dailySleep[dateStr] = (dailySleep[dateStr] || 0) + duration;
        });

        const sleepArray = Object.values(dailySleep);
        const sleepHours = sleepArray.length > 0 ? sleepArray[sleepArray.length - 1] : 7.0;
        const sleep7dMean = sleepArray.length > 0 ? sleepArray.reduce((a, b) => a + b, 0) / sleepArray.length : 7.0;
        const sleep7dSd = calculateSD(sleepArray, sleep7dMean);

        // 3. Fetch Workout Data 28 hari terakhir untuk kalkulasi ACWR berbasis menit
        AppleHealthKit.getSamples({ startDate: startDate28d, type: 'Workout' as any }, (errWorkout: string, workoutResults: any[]) => {
          let acuteLoadMinutes = 0;   // Total durasi 7 hari terakhir (menit)
          let total28dLoadMinutes = 0; // Total durasi 28 hari terakhir (menit)

          const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

          (workoutResults || []).forEach((workout) => {
            const workoutDate = new Date(workout.startDate);
            const durationMinutes = (new Date(workout.endDate).getTime() - workoutDate.getTime()) / (1000 * 60);

            total28dLoadMinutes += durationMinutes;
            if (workoutDate >= sevenDaysAgo) {
              acuteLoadMinutes += durationMinutes;
            }
          });

          // Chronic Load: Rata-rata durasi latihan mingguan (28 hari dibagi 4 minggu)
          const chronicWeeklyMinutes = total28dLoadMinutes / 4;

          let acwr = 1.0;
          if (chronicWeeklyMinutes > 0) {
            acwr = acuteLoadMinutes / chronicWeeklyMinutes;
          } else if (acuteLoadMinutes > 0) {
            acwr = 1.5;
          }

          resolve({
            rhrToday,
            rhr7dMedian,
            rhrSd,
            sleepHours,
            sleep7dMean,
            sleep7dSd,
            acwr: Number(acwr.toFixed(2)),
          });
        });
      });
    });
  });
};
// Tambahkan di src/services/healthKit.ts


export const fetchWorkoutHistory = (days: number = 56): Promise<WorkoutLog[]> => {
  return new Promise((resolve) => {
    if (!AppleHealthKit || !AppleHealthKit.getSamples) {
      resolve([]);
      return;
    }

    const startDate = new Date(Date.now() - days * 86400000).toISOString();

    AppleHealthKit.getSamples(
      { startDate, type: 'Workout' } as any,
      (err: string, results: any[]) => {
        if (err || !results) {
          resolve([]);
          return;
        }

        const logs: WorkoutLog[] = results
          .map((w: any) => {
            const startMs = new Date(w.startDate).getTime();
            const endMs = new Date(w.endDate).getTime();
            const durationMin = (endMs - startMs) / 60000;

            return {
              Date: w.startDate.slice(0, 10),
              Duration_Min: Math.round(durationMin),
              jenis_latihan: w.activityName || w.type || 'running',
              Distance_KM: w.distance ? w.distance / 1000 : 0,
            };
          })
          .filter((l: WorkoutLog) => l.Duration_Min > 0)
          .sort((a: WorkoutLog, b: WorkoutLog) => a.Date.localeCompare(b.Date));

        resolve(logs);
      }
    );
  });
};