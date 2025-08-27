export default function RolePlaceholder({ title }) {
  return (
    <div className="min-h-screen bg-sand p-6">
      <div className="mx-auto max-w-3xl rounded-2xl bg-sandLight shadow-xl ring-1 ring-sandRing p-6">
        <h1 className="text-2xl font-semibold text-brown mb-2">{title}</h1>
        <p className="text-brown/80">Šeit vēlāk pievienosim konkrētās lomas funkcijas.</p>
      </div>
    </div>
  );
}
