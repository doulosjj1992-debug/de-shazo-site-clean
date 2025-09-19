import { createClient } from '@supabase/supabase-js';
import fs from 'fs/promises';
import path from 'path';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

async function migrateProjects() {
  try {
    const raw = await fs.readFile('./data/projects.json', 'utf-8').catch(() => '[]');
    const projects = JSON.parse(raw);
    for (const project of projects) {
      const { error } = await supabase.from('projects').insert({
        title: project.name || project.title,
        slug: project.slug,
        category: project.category,
        description: project.summary || project.description,
        featured_image: project.mainImage?.url,
        completion_date: project.completionDate,
        client: project.client,
        location: project.location,
        status: 'published'
      });
      if (error) console.error('Insert error:', error.message);
      else console.log('Migrated:', project.name || project.title);
    }
  } catch (e) {
    console.error('Migration failed:', e);
    process.exit(1);
  }
}

migrateProjects();
