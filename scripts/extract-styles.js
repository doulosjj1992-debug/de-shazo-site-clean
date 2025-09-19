import fs from 'fs/promises';
import postcss from 'postcss';
import autoprefixer from 'autoprefixer';

async function extractWebflowStyles() {
  const cssPath = './public/webflow-export/css/webflow.css';
  try {
    const webflowCSS = await fs.readFile(cssPath, 'utf-8');
    const result = await postcss([autoprefixer]).process(webflowCSS, { from: undefined });
    await fs.writeFile('./src/styles/webflow-import.css', result.css);
    console.log('✅ Webflow styles extracted and optimized → src/styles/webflow-import.css');
  } catch (e) {
    console.error('Could not find Webflow CSS at', cssPath);
  }
}
extractWebflowStyles();
