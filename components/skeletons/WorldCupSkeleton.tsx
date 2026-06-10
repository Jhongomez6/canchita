export default function WorldCupSkeleton() {
    return (
        <div className="max-w-2xl mx-auto px-4 pt-6 pb-24 md:pb-8 animate-pulse">
            <div className="h-7 w-40 bg-gray-200 rounded mb-6" />
            <div className="flex gap-2 mb-4">
                {[0, 1, 2, 3].map((i) => (
                    <div key={i} className="h-8 w-16 bg-gray-100 rounded-full" />
                ))}
            </div>
            <div className="space-y-3">
                {[0, 1, 2, 3].map((i) => (
                    <div key={i} className="rounded-2xl border border-gray-100 bg-white p-4">
                        <div className="h-3 w-20 bg-gray-100 rounded mb-3" />
                        <div className="h-5 w-3/4 bg-gray-200 rounded mb-2" />
                        <div className="h-5 w-2/3 bg-gray-200 rounded mb-3" />
                        <div className="h-4 w-24 bg-gray-100 rounded" />
                    </div>
                ))}
            </div>
        </div>
    );
}
