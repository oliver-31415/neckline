export type Sensation = 'pain' | 'tingling' | 'numb';
export type Level = 0 | 1 | 2; // none / some / a lot
export type Helped = 'notyet' | 'no' | 'little' | 'lot' | 'unsure';

export type EntryType = 'pain' | 'posture' | 'activity' | 'meal' | 'treatment' | 'day';

interface Base {
  id: string;
  time: number; // epoch ms the entry refers to
  createdAt: number;
  updatedAt: number;
  note?: string;
}

export interface PainEntry extends Base {
  type: 'pain';
  mode: 'checkin' | 'change';
  intensity: number | null; // null = "not sure"
  trend?: 'better' | 'worse' | 'same' | 'new' | null;
  regions: Record<string, Sensation>;
  qualities: string[];
  duration?: string | null;
  impacts: Record<string, Level | null>;
  symptoms: string[];
  postures: string[]; // what I was mostly doing, reported alongside
  activities: string[];
  slot?: string | null; // "09:00" when answering a scheduled check-in
}

export interface PostureEntry extends Base {
  type: 'posture';
  posture: string;
  minutes: number | null;
  breaks: 'yes' | 'some' | 'no' | null;
}

export interface ActivityEntry extends Base {
  type: 'activity';
  activity: string;
  minutes: number | null;
  effort: 'light' | 'moderate' | 'hard' | null;
}

export interface MealEntry extends Base {
  type: 'meal';
  tags: string[];
  photoId?: string | null;
}

export interface TreatmentEntry extends Base {
  type: 'treatment';
  kind: string; // medication | ice | heat | ...
  name: string;
  dose?: string;
  helped: Helped | null;
  sideEffects: string[];
}

export interface DayEntry extends Base {
  type: 'day';
  date: string; // YYYY-MM-DD this entry describes
  sleepHours: number | null;
  sleepQuality: 'poor' | 'ok' | 'good' | null;
  stress: number | null; // 0-10
  exertion: boolean | null;
}

export type Entry = PainEntry | PostureEntry | ActivityEntry | MealEntry | TreatmentEntry | DayEntry;

export interface SavedTreatment {
  name: string;
  kind: string;
  dose?: string;
}

export interface Incision {
  view: 'front' | 'back';
  x: number;
  y: number;
  orient: 'h' | 'v';
}

export type StepId =
  | 'intensity' | 'where' | 'quality' | 'duration' | 'impact' | 'symptoms' | 'context' | 'note';

export interface Question {
  id: string;
  text: string;
  done: boolean;
}

export interface Settings {
  name: string;
  checkinTimes: string[];
  steps: Record<StepId, boolean>;
  qualities: string[];
  symptoms: string[];
  activities: string[];
  postures: string[];
  mealTags: string[];
  sideEffects: string[];
  treatments: SavedTreatment[];
  incision: Incision | null;
  surgeryDate: string;
  lastAppointment: string;
  nextAppointment: string;
  questions: Question[];
  theme: 'system' | 'light' | 'dark';
  push: { serverUrl: string; token: string; enabled: boolean };
  onboarded: boolean;
}
