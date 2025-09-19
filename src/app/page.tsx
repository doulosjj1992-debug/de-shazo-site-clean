export default function HomePage() {
  return (
    <section className="container">
      <h1 className="text-4xl font-bold mb-4">DeShazo Group</h1>
      <p className="text-lg text-gray-600">Traffic Engineering & Transportation Planning</p>
      <div className="mt-10 grid grid-cols-1 md:grid-cols-3 gap-6">
        <a className="p-6 rounded-xl border hover:shadow" href="/projects">Projects →</a>
        <a className="p-6 rounded-xl border hover:shadow" href="/services">Services →</a>
        <a className="p-6 rounded-xl border hover:shadow" href="/team">Team →</a>
      </div>
    </section>
  );
}
