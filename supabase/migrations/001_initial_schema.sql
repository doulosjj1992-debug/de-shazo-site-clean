create extension if not exists pgcrypto;
-- Projects
create table if not exists projects (
  id uuid primary key default gen_random_uuid(),
  title varchar(255) not null,
  slug varchar(255) unique not null,
  category varchar(100),
  subcategory varchar(100),
  location varchar(255),
  client varchar(255),
  description text,
  challenge text,
  solution text,
  results text,
  featured_image varchar(500),
  gallery jsonb,
  completion_date date,
  project_value numeric(12,2),
  size varchar(100),
  is_featured boolean default false,
  status varchar(50) default 'published',
  seo_title varchar(255),
  seo_description text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Team
create table if not exists team_members (
  id uuid primary key default gen_random_uuid(),
  name varchar(255) not null,
  slug varchar(255) unique not null,
  title varchar(255),
  department varchar(100),
  email varchar(255),
  phone varchar(50),
  linkedin varchar(255),
  credentials varchar(255),
  bio text,
  expertise jsonb,
  education jsonb,
  years_experience int,
  headshot varchar(500),
  order_index int default 0,
  is_leadership boolean default false,
  is_active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Services
create table if not exists services (
  id uuid primary key default gen_random_uuid(),
  title varchar(255) not null,
  slug varchar(255) unique not null,
  category varchar(100),
  description text,
  features jsonb,
  benefits jsonb,
  process_steps jsonb,
  related_projects uuid[],
  icon varchar(100),
  featured_image varchar(500),
  order_index int default 0,
  is_active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- News
create table if not exists news (
  id uuid primary key default gen_random_uuid(),
  headline varchar(255) not null,
  slug varchar(255) unique not null,
  excerpt text,
  content text,
  author uuid references team_members(id),
  category varchar(100),
  tags jsonb,
  featured_image varchar(500),
  publish_date date default current_date,
  is_featured boolean default false,
  status varchar(50) default 'draft',
  views int default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Forms
create table if not exists form_submissions (
  id uuid primary key default gen_random_uuid(),
  form_type varchar(50) not null,
  name varchar(255),
  email varchar(255),
  phone varchar(50),
  company varchar(255),
  message text,
  data jsonb,
  source_page varchar(255),
  ip_address inet,
  user_agent text,
  is_processed boolean default false,
  created_at timestamptz default now()
);

alter table projects enable row level security;
alter table team_members enable row level security;
alter table services enable row level security;
alter table news enable row level security;
alter table form_submissions enable row level security;

create policy "public select projects" on projects for select using (status = 'published');
create policy "public select team" on team_members for select using (is_active = true);
create policy "public select services" on services for select using (is_active = true);
create policy "public select news" on news for select using (status = 'published');

create index if not exists idx_projects_slug on projects(slug);
create index if not exists idx_projects_category on projects(category);
create index if not exists idx_team_slug on team_members(slug);
create index if not exists idx_news_slug on news(slug);
create index if not exists idx_news_publish_date on news(publish_date desc);
