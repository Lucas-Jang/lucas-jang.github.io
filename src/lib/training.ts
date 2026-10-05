import { z } from 'astro/zod';

const text = z.string().trim().min(1);
const positive = z.number().positive();
const sequence = z.array(text).optional();
export const bodyAreas = ['head', 'neck', 'shoulder', 'upperBack', 'lowerBack', 'chest', 'abdomen', 'elbow', 'wrist', 'hand', 'hip', 'thigh', 'knee', 'calf', 'shin', 'ankle', 'foot'] as const;
export const bodyIssueSchema = z.object({
  area: z.enum(bodyAreas), side: z.enum(['left', 'right', 'center']).optional(),
  severity: z.number().min(0).max(10).optional(), label: text.optional(), note: text.optional()
});
export const trainingSchema = z.object({
  classNotes: text.optional(), reflection: text.optional(),
  gym: text.optional(), bjj: z.object({ duration: positive.optional() }).optional(),
  condition: z.object({ score: z.number().min(0).max(10).optional(), issues: z.array(bodyIssueSchema).optional() }).optional(),
  techniques: z.array(z.object({ name: text, sequence, description: text.optional(), takeaway: text.optional() })).optional(),
  sparringRounds: positive.int().optional(),
  sparring: z.array(z.object({ partner: text.optional(), rounds: positive.int().optional(), start: text.optional(), sequence, submission: text.optional(), result: text.optional(), memo: text.optional() })).optional(),
  strength: z.object({ focus: text.optional(), exercises: z.array(z.object({ name: text, weight: z.number().nonnegative().optional(), unit: text.optional(), reps: positive.int().optional(), sets: positive.int().optional(), note: text.optional() })).optional() }).optional(),
  cardio: z.array(z.object({ name: text, duration: positive.optional(), distance: positive.optional(), averageHR: positive.optional(), note: text.optional() })).optional(),
  takeaway: text.optional()
});
export type TrainingEntry = z.infer<typeof trainingSchema>;
export type BodyIssue = z.infer<typeof bodyIssueSchema>;
export type BodyArea = BodyIssue['area'];
export const areaLabels: Record<BodyArea, string> = {
  head: '머리', neck: '목', shoulder: '어깨', upperBack: '등 위쪽', lowerBack: '허리', chest: '가슴', abdomen: '복부', elbow: '팔꿈치', wrist: '손목', hand: '손', hip: '골반', thigh: '허벅지', knee: '무릎', calf: '종아리', shin: '정강이', ankle: '발목', foot: '발'
};
export function issueLabel(issue: BodyIssue) {
  return issue.label ?? `${issue.side === 'left' ? '왼쪽 ' : issue.side === 'right' ? '오른쪽 ' : ''}${areaLabels[issue.area]}`;
}
export function roundsFor(entry: TrainingEntry) {
  if (entry.sparringRounds !== undefined) return entry.sparringRounds;
  const records = entry.sparring ?? [];
  return records.length && records.every(record => record.rounds !== undefined)
    ? records.reduce((sum, record) => sum + (record.rounds ?? 0), 0) : undefined;
}
