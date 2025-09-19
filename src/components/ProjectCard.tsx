type Props = { project: any };
export default function ProjectCard({ project }: Props) {
  return (
    <article className="border rounded-xl overflow-hidden">
      <img src={project.featured_image || '/images/placeholder.png'} alt={project.title} className="w-full h-56 object-cover" />
      <div className="p-4">
        <h3 className="font-semibold text-lg">{project.title}</h3>
        <p className="text-sm text-gray-600 line-clamp-3">{project.description}</p>
      </div>
    </article>
  );
}
