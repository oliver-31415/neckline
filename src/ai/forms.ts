import { signal } from '@preact/signals';
import type { AiTool } from './tools';
import type { Schema } from './schema';

/*
 * Framework for the assistant filling in forms (a pre-appointment questionnaire, a pain
 * scale such as the Neck Disability Index, an insurer's or employer's form). NOT ACTIVE YET:
 * FORMS is empty, so formTools() adds nothing and the assistant can't see any of this.
 *
 * To add a form later:
 *   1. Describe it as a FormDefinition below: its fields, their types and allowed answers,
 *      and for each field a `source` hint saying which diary data can answer it.
 *   2. Add a review screen that shows a FormDraft field by field, lets the person change any
 *      answer, and marks it reviewed. Nothing is exported until it is reviewed.
 *   3. Add an export for `output` (fill a PDF template, or plain text to copy).
 *
 * The assistant reads the form (get_form), gathers answers with its read tools, then proposes
 * them with fill_form. That is an action: the person sees every answer and taps Allow, and the
 * result is only a draft in formDrafts, never sent anywhere.
 */

export type FieldType = 'text' | 'longtext' | 'number' | 'date' | 'choice' | 'multi' | 'scale' | 'yesno';

export interface FormField {
  id: string;
  label: string;
  type: FieldType;
  options?: string[]; // for choice / multi
  min?: number; max?: number; // for number / scale
  required?: boolean;
  /** Which diary data answers it, for the assistant: e.g. "average pain, last 7 days". */
  source?: string;
  /** Answers the assistant must leave to the person (consent, signature, personal details). */
  personOnly?: boolean;
}

export interface FormDefinition {
  id: string;
  title: string;
  description: string;
  fields: FormField[];
  output: 'pdf' | 'text';
}

export interface FormDraft {
  formId: string;
  values: Record<string, unknown>;
  /** Field id → why the assistant chose that answer, shown on the review screen. */
  reasons: Record<string, string>;
  filledAt: number;
  reviewed: boolean;
}

/** Forms the assistant may help with. Empty until the first one is built. */
export const FORMS: FormDefinition[] = [];

/** Drafts waiting for the person to review (in memory only for now). */
export const formDrafts = signal<FormDraft[]>([]);

/** The JSON Schema a field's answer must match. */
function fieldSchema(f: FormField): Schema {
  switch (f.type) {
    case 'number': case 'scale': return { type: 'number', minimum: f.min, maximum: f.max };
    case 'yesno': return { type: 'boolean' };
    case 'choice': return { type: 'string', enum: f.options ?? [] };
    case 'multi': return { type: 'array', items: { type: 'string', enum: f.options ?? [] }, maxItems: f.options?.length ?? 20 };
    case 'date': return { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' };
    default: return { type: 'string', maxLength: f.type === 'longtext' ? 4000 : 300 };
  }
}

export function formTools(): AiTool[] {
  if (!FORMS.length) return [];
  const byId = (id: string) => FORMS.find((f) => f.id === id);
  return [
    {
      name: 'list_forms',
      description: 'Forms the person can ask you to help fill in.',
      input: { type: 'object', properties: {} },
      label: () => 'Forms',
      run: async () => ({ forms: FORMS.map((f) => ({ id: f.id, title: f.title, description: f.description })) }),
    },
    {
      name: 'get_form',
      description: 'A form’s fields: type, allowed answers, and which diary data answers each one. Fields marked person_only are for the person to answer; leave them out.',
      input: { type: 'object', required: ['form'], properties: { form: { type: 'string', maxLength: 100 } } },
      label: (i) => byId(i.form)?.title ?? 'Form',
      async run(i) {
        const f = byId(i.form);
        if (!f) return { error: `No form "${i.form}".` };
        return { ...f, fields: f.fields.map((x) => ({ ...x, answer_schema: fieldSchema(x), person_only: x.personOnly || undefined })) };
      },
    },
    {
      name: 'fill_form',
      description: 'Proposes answers for a form, each with a short reason. The person reviews every answer and taps Allow; the result is a draft they check before anything is exported.',
      action: true,
      input: {
        type: 'object',
        required: ['form', 'answers'],
        properties: {
          form: { type: 'string', maxLength: 100 },
          answers: { type: 'array', maxItems: 200, items: { type: 'object', required: ['field', 'value_json', 'reason'], properties: { field: { type: 'string', maxLength: 100 }, value_json: { type: 'string', maxLength: 4000, description: 'The answer as JSON, matching the field’s answer_schema.' }, reason: { type: 'string', maxLength: 500 } } } },
        },
      },
      label: (i) => `Fill in: ${byId(i.form)?.title ?? i.form}`,
      async run() {
        // Validation against each field's schema, the approval card and saving to formDrafts
        // go here once the review screen exists.
        throw new Error('Filling in forms isn’t available yet.');
      },
    },
  ];
}
