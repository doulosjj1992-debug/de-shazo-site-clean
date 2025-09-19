import fs from 'fs/promises';

const pages = ['index', 'projects', 'team', 'services', 'contact'];

async function convertPages() {
  for (const page of pages) {
    const htmlPath = `./public/webflow-export/${page}.html`;
    try {
      const html = await fs.readFile(htmlPath, 'utf-8');
      const match = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
      if (!match) continue;
      const code = `export default function ${page[0].toUpperCase()+page.slice(1)}Page() {
  return (<>
${match[1]}
  </>);
}`;
      await fs.writeFile(`./src/app/${page}/page.tsx`, code);
      console.log('Converted', page);
    } catch (e) {
      console.warn('Skip (not found):', htmlPath);
    }
  }
}
convertPages();
