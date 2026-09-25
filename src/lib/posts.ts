import { getCollection, type CollectionEntry } from 'astro:content';
export const categories = ['ALL', 'DEV', 'ENGLISH', 'BJJ', 'DIVE', 'DISTILL', 'LIFE'] as const;
export type Category = Exclude<(typeof categories)[number], 'ALL'>;
export const categoryLabels: Record<(typeof categories)[number], string> = { ALL: '전체', DEV: '개발', ENGLISH: '영어', BJJ: '주짓수', DIVE: '프리다이빙', DISTILL: '증류', LIFE: '일상' };
export async function getPosts() { return (await getCollection('posts', ({ data }) => !data.draft)).sort((a, b) => b.data.date.valueOf() - a.data.date.valueOf()); }
export function formatDate(date: Date) { return new Intl.DateTimeFormat('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' }).format(date); }
export function categoryLabel(category: Category) { return categoryLabels[category]; }
export function readingTime(post: CollectionEntry<'posts'>) { return Math.max(1, Math.ceil((post.body ?? '').split(/\s+/).length / 220)); }
