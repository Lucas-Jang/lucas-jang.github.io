import rss from '@astrojs/rss'; import { getPosts } from '../lib/posts';
export async function GET(context) { const posts = await getPosts(); return rss({ title: 'WONJUN', description: 'A personal visual journal.', site: context.site, items: posts.map(post => ({ title: post.data.title, description: post.data.description, pubDate: post.data.date, link: `/posts/${post.id}/` })) }); }
