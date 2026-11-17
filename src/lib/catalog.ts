import type { Sensation, Settings, StepId } from './types';

export const POSTURES: Record<string, { label: string; hint: string }> = {
  neutral: { label: 'Mostly neutral', hint: 'Head balanced, looking ahead' },
  down: { label: 'Looking down', hint: 'Phone, reading, cooking' },
  up: { label: 'Looking up', hint: 'Shelves, ceilings, screens up high' },
  turn: { label: 'Turning', hint: 'Over the shoulder, side screens' },
  tilt: { label: 'Tilting sideways', hint: 'Ear toward a shoulder' },
  forward: { label: 'Leaning forward', hint: 'Head ahead of shoulders, slouching' },
  lying: { label: 'Lying down', hint: 'Bed, sofa, pillows' },
};

export const POSTURE_DURATIONS: { label: string; minutes: number | null }[] = [
  { label: '< 15 min', minutes: 10 },
  { label: '15–30 min', minutes: 25 },
  { label: '30–60 min', minutes: 45 },
  { label: '1–2 h', minutes: 90 },
  { label: '2 h +', minutes: 150 },
  { label: 'Not sure', minutes: null },
];

export const DEFAULT_ACTIVITIES = [
  'Computer', 'Phone', 'Driving', 'Lifting', 'Exercise', 'Walking', 'Housework', 'Reading', 'Rest',
];

export const DEFAULT_EXERCISES = [
  'Chin tucks', 'Neck rotations', 'Shoulder rolls', 'Shoulder blade squeezes', 'Upper trap stretch',
  'Levator stretch', 'Nerve glides', 'Walking', 'Physio programme',
];

export const DEFAULT_QUALITIES = [
  'Aching', 'Burning', 'Sharp', 'Stabbing', 'Throbbing', 'Tingling', 'Numb', 'Stiff', 'Shooting', 'Pressure',
];

export const AREA_KINDS: { id: Sensation; label: string }[] = [
  { id: 'ache', label: 'Ache' },
  { id: 'nerve', label: 'Sharp nerve pain' },
  { id: 'tingling', label: 'Tingling' },
  { id: 'cramp', label: 'Cramping' },
  { id: 'stiff', label: 'Stiffness' },
];

export const DEFAULT_SYMPTOMS = [
  'Headache', 'Migraine', 'Dizziness', 'Weakness', 'Muscle spasm', 'Swallowing discomfort', 'Hoarse voice',
  'Clumsy hands', 'Fatigue', 'Nausea', 'Jaw pain',
];

export const DEFAULT_SIDE_EFFECTS = ['Drowsy', 'Nausea', 'Upset stomach', 'Dizzy', 'Constipation', 'Headache'];

export const DEFAULT_MEAL_TAGS = ['Breakfast', 'Lunch', 'Dinner', 'Snack', 'Coffee', 'Alcohol'];

export const DURATIONS = ['Moments', 'Minutes', 'Under an hour', 'Hours', 'Constant', 'Not sure'];

export const IMPACTS: { id: string; label: string }[] = [
  { id: 'sleep', label: 'Sleep' },
  { id: 'concentration', label: 'Concentration' },
  { id: 'work', label: 'Work' },
  { id: 'movement', label: 'Movement' },
  { id: 'daily', label: 'Everyday tasks' },
];

export const TREATMENT_KINDS: { id: string; label: string }[] = [
  { id: 'medication', label: 'Medication' },
  { id: 'ice', label: 'Ice' },
  { id: 'heat', label: 'Heat' },
  { id: 'exercises', label: 'Exercises' },
  { id: 'massage', label: 'Massage' },
  { id: 'collar', label: 'Collar' },
  { id: 'rest', label: 'Rest' },
  { id: 'other', label: 'Other' },
];

export const HELPED_LABELS: Record<string, string> = {
  notyet: 'Too soon to tell', no: 'Didn’t help', little: 'Helped a little', lot: 'Helped a lot', unsure: 'Not sure',
};

export const STEPS: { id: StepId; label: string; hint: string }[] = [
  { id: 'where', label: 'Body diagram', hint: '' },
  { id: 'duration', label: 'How long it lasts', hint: '' },
  { id: 'impact', label: 'What it’s affecting', hint: '' },
  { id: 'symptoms', label: 'Symptoms', hint: '' },
  { id: 'context', label: 'Activities', hint: '' },
  { id: 'note', label: 'Note', hint: '' },
];

export const DEFAULT_SETTINGS: Settings = {
  name: '',
  checkinTimes: ['09:00', '14:00', '20:00'],
  steps: { intensity: true, where: true, quality: true, duration: true, impact: true, symptoms: true, context: true, note: true },
  qualities: DEFAULT_QUALITIES,
  symptoms: DEFAULT_SYMPTOMS,
  activities: DEFAULT_ACTIVITIES,
  exercises: DEFAULT_EXERCISES,
  postures: Object.keys(POSTURES),
  mealTags: DEFAULT_MEAL_TAGS,
  sideEffects: DEFAULT_SIDE_EFFECTS,
  treatments: [],
  incision: null,
  surgeryDate: '',
  lastAppointment: '',
  nextAppointment: '',
  questions: [],
  theme: 'system',
  push: { serverUrl: '', token: '', enabled: false },
  onboarded: false,
};

export function painWord(n: number | null): string {
  if (n === null) return 'Not sure';
  if (n === 0) return 'No pain';
  if (n <= 3) return 'Mild';
  if (n <= 6) return 'Moderate';
  if (n <= 8) return 'Severe';
  return 'Worst';
}
