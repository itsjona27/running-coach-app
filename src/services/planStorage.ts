// src/services/planStorage.ts
import AsyncStorage from '@react-native-async-storage/async-storage';
import { WeeklyPlan } from './weeklyPlan';

const PLAN_KEY = '@running_coach/weekly_plans_v1';
const GOAL_KEY = '@running_coach/goal_target_minutes';

// ============================================
// CRUD Plans
// ============================================

export const savePlan = async (plan: WeeklyPlan): Promise<void> => {
  const existing = await getAllPlans();
  const filtered = existing.filter(p => p.weekStartDate !== plan.weekStartDate);
  const updated = [plan, ...filtered]
    .sort((a, b) => b.weekStartDate.localeCompare(a.weekStartDate))
    .slice(0, 104); // max 2 tahun
  await AsyncStorage.setItem(PLAN_KEY, JSON.stringify(updated));
};

export const getAllPlans = async (): Promise<WeeklyPlan[]> => {
  try {
    const raw = await AsyncStorage.getItem(PLAN_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as WeeklyPlan[];
  } catch {
    return [];
  }
};

export const getLatestPlan = async (): Promise<WeeklyPlan | null> => {
  const all = await getAllPlans();
  return all.length > 0 ? all[0] : null;
};

export const getPlanByWeek = async (weekStartDate: string): Promise<WeeklyPlan | null> => {
  const all = await getAllPlans();
  return all.find(p => p.weekStartDate === weekStartDate) || null;
};

export const deletePlan = async (weekStartDate: string): Promise<void> => {
  const existing = await getAllPlans();
  const filtered = existing.filter(p => p.weekStartDate !== weekStartDate);
  await AsyncStorage.setItem(PLAN_KEY, JSON.stringify(filtered));
};

export const clearAllPlans = async (): Promise<void> => {
  await AsyncStorage.removeItem(PLAN_KEY);
};

// ============================================
// Goal setting
// ============================================

export const setGoalTargetMinutes = async (minutes: number): Promise<void> => {
  await AsyncStorage.setItem(GOAL_KEY, String(minutes));
};

export const getGoalTargetMinutes = async (): Promise<number> => {
  const raw = await AsyncStorage.getItem(GOAL_KEY);
  return raw ? Number(raw) || 0 : 0;
};