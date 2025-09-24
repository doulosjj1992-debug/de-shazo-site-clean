// src/components/ProjectCard.tsx
import Image from "next/image";

export type Project = {
  title: string;
  description: string;
  imageSrc: string;     // public/… or remote allowed by next.config
  href?: string;
  tags?: string[];
};

type Props = { project: Project };

export default function ProjectCard({ project }: Props) {
  const { title, description, imageSrc, href, tags } = project;

  const content = (
    <article className="rounded-xl border p-4 transition hover:shadow-md">
      <div className="relative h-48 w-full overflow-hidden rounded-lg">
        <Image
          src={imageSrc}
          alt={title}
          fill
          sizes="(max-width: 768px) 100vw, 400px"
          className="object-cover"
          priority={false}
        />
      </div>

      <h3 className="mt-3 text-lg font-semibold">{title}</h3>
      <p className="mt-1 text-sm text-gray-600">{description}</p>

      {tags?.length ? (
        <ul className="mt-2 flex flex-wrap gap-2">
          {tags.map((t) => (
            <li key={t} className="text-xs bg-gray-100 px-2 py-1 rounded">
              {t}
            </li>
          ))}
        </ul>
      ) : null}
    </article>
  );

  return href ? <a href={href}>{content}</a> : content;
}
