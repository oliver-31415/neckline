/** What an area feels like. 'pain' and 'numb' come from older entries. */
export type Sensation = 'ache' | 'nerve' | 'tingling' | 'cramp' | 'stiff' | 'pain' | 'numb';
export type Level = 0 | 1 | 2; // none / some / a lot
export type Helped = 'notyet' | 'no' | 'little' | 'lot' | 'unsure';

export type EntryType = 'pain' | 'posture' | 'activity' | 'meal' | 'treatment' | 'day';

interface Base {
  id: string;
  time: number; // epoch ms the entry refers to
  createdAt: number;
  updatedAt: number;
  note?: string;
  group?: string; // entries saved together from one log
}

export interface PainEntry extends Base {
  type: 'pain';
  mode: 'checkin' | 'change';
  intensity: number | null; // null = "not sure"
  trend?: 'better' | 'worse' | 'same' | 'new' | null;
  regions: Record<string, Sensation>;
  levels?: Record<string, number>; // 0-10 per marked area
  kinds?: Record<string, Sensation[]>; // every type chosen per area (regions holds the first)
  qualities: string[];
  duration?: string | null;
  impacts: Record<string, Level | null>;
  symptoms: string[];
  symptomLevels?: Record<string, number>; // 0-10 strength, for headache and migraine
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
  minutes?: number | null; // exercises: how long
  holdSeconds?: number | null; // exercises: how long each hold/stretch
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
  exercises: string[];
  postures: string[];
  mealTags: string[];
  sideEffects: string[];
  treatments: SavedTreatment[];
  surgeryDate: string;
  lastAppointment: string;
  nextAppointment: string;
  questions: Question[];
  theme: 'system' | 'light' | 'dark';
  push: { enabled: boolean };
  /** Your Neckline server (backups and reminders). auth signs in; key encrypts backups and never leaves the phone. */
  backup: { serverUrl: string; user: string; auth: string; key: string; auto: boolean; lastAt: number | null; lastHash: string };
  /** The assistant: which AI service, and per service the key, model and address. Keys stay on this phone. */
  ai: { provider: 'claude' | 'openai' | 'openrouter' | 'other'; keys: Record<string, string>; models: Record<string, string>; endpoints: Record<string, string>; notes: boolean };
  onboarded: boolean;
  /** Bumped when default lists change, so stored settings can be upgraded once. */
  version?: number;
}
