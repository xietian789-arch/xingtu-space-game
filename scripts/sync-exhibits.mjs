import { readFile, writeFile } from 'node:fs/promises';

const sourceUrl = new URL('../data/exhibits.json', import.meta.url);
const targetUrl = new URL('../data/exhibits.js', import.meta.url);

const source = await readFile(sourceUrl, 'utf8');
const data = JSON.parse(source);
const output = `// ============================================================
// exhibits.js —— exhibits.json 的 file:// 协议回退镜像（自动生成）
// 请勿直接编辑本文件；修改 data/exhibits.json 后运行：
// node scripts/sync-exhibits.mjs
// ============================================================
window.EXHIBITS_DATA_FALLBACK =
${JSON.stringify(data, null, 2)}
;
`;

await writeFile(targetUrl, output, 'utf8');
console.log(`已同步 ${data.exhibits.length} 个航天代表物到 data/exhibits.js`);

