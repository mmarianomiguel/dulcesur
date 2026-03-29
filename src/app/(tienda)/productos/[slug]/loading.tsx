export default function ProductDetailLoading() {
  return (
    <div className="max-w-6xl mx-auto px-4 py-8 animate-pulse">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div className="aspect-square bg-gray-100 rounded-2xl" />
        <div className="space-y-4">
          <div className="h-4 w-24 bg-gray-100 rounded-full" />
          <div className="h-8 w-3/4 bg-gray-100 rounded-lg" />
          <div className="h-10 w-32 bg-gray-100 rounded-lg" />
          <div className="h-12 w-full bg-gray-100 rounded-xl" />
        </div>
      </div>
    </div>
  );
}
