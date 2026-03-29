export default function ProductosLoading() {
  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="h-8 w-48 bg-gray-200 rounded-lg animate-pulse mb-6" />
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="rounded-2xl border border-gray-100 bg-white overflow-hidden animate-pulse">
            <div className="aspect-[4/3] bg-gray-100" />
            <div className="p-4 space-y-3">
              <div className="h-3 w-16 bg-gray-100 rounded-full" />
              <div className="space-y-1.5">
                <div className="h-3.5 bg-gray-100 rounded-full w-full" />
                <div className="h-3.5 bg-gray-100 rounded-full w-2/3" />
              </div>
              <div className="h-5 w-24 bg-gray-100 rounded-full" />
              <div className="h-10 bg-gray-100 rounded-xl" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
