import { getCollection, type CollectionEntry } from 'astro:content';
export const categories = ['ALL', 'DEV', 'ENGLISH', 'BJJ', 'DIVE', 'DISTILL', 'LIFE'] as const;
export type Category = Exclude<(typeof categories)[number], 'ALL'>;
export async function getPosts() { return (await getCollection('posts', ({ data }) => !data.draft)).sort((a, b) => b.data.date.valueOf() - a.data.date.valueOf()); }
export function formatDate(date: Date) { return new Intl.DateTimeFormat('en', { month: 'short', day: '2-digit', year: 'numeric' }).format(date).toUpperCase(); }
export function categoryLabel(category: Category) { return category === 'DEV' ? 'DEVELOPMENT' : category; }
export function readingTime(post: CollectionEntry<'posts'>) { return Math.max(1, Math.ceil((post.body ?? '').split(/\s+/).length / 220)); }
