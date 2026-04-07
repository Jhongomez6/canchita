import Link from "next/link";

export default function NotFound() {
    return (
        <div className="min-h-screen bg-gradient-to-br from-[#1f7a4f] to-[#145c3a] flex flex-col items-center justify-center p-6 text-center font-sans">
            <div className="bg-white rounded-3xl p-10 max-w-md w-full shadow-2xl relative overflow-hidden">
                {/* Background Decorative Elements */}
                <div className="absolute top-0 right-0 -mt-10 -mr-10 w-32 h-32 bg-emerald-50 rounded-full blur-2xl"></div>
                <div className="absolute bottom-0 left-0 -mb-10 -ml-10 w-32 h-32 bg-emerald-50 rounded-full blur-2xl"></div>

                <div className="relative z-10 flex flex-col items-center">
                    {/* Logo */}
                    <div className="mb-6 bg-slate-50 p-4 rounded-2xl shadow-inner inline-block">
                        <div className="text-6xl mb-2 drop-shadow-md">🚩</div>
                    </div>

                    <h1 className="text-6xl font-black text-slate-800 mb-2 tracking-tight">
                        404
                    </h1>
                    <h2 className="text-xl font-bold text-[#1f7a4f] mb-4 uppercase tracking-widest">
                        ¡Fuera de lugar!
                    </h2>

                    <p className="text-slate-500 mb-8 leading-relaxed font-medium">
                        La página que buscas no existe, o el partido ya terminó y se llevaron el balón.
                    </p>

                    <Link
                        href="/"
                        className="w-full bg-[#1f7a4f] hover:bg-[#16603c] text-white rounded-2xl py-4 px-6 text-base font-bold shadow-lg shadow-emerald-900/20 hover:-translate-y-0.5 active:scale-[0.98] transition-all flex items-center justify-center gap-3"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z" clipRule="evenodd" />
                        </svg>
                        Volver a la Cancha (Inicio)
                    </Link>
                </div>
            </div>

            <div className="mt-8">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                    src="/logo/lacanchita-logo.png"
                    alt="La Canchita"
                    width={100}
                    height={80}
                    style={{ height: "auto", width: "100px" }}
                    className="opacity-50 drop-shadow-md grayscale brightness-200 hover:opacity-100 transition-opacity duration-300"
                />
            </div>
        </div>
    );
}
