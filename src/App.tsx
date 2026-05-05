function App() {
  return (
    <main className="min-h-screen bg-slate-100 px-6 py-10 text-slate-800">
      <div className="mx-auto max-w-3xl rounded-2xl bg-white p-8 shadow-lg">
        <h1 className="text-3xl font-bold">FE React + Vite + Tailwind</h1>
        <p className="mt-3 text-slate-600">
          Boilerplate frontend da duoc tao thanh cong trong thu muc FE.
        </p>

        <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-sm text-slate-700">Lenh chay nhanh:</p>
          <pre className="mt-2 overflow-x-auto rounded bg-slate-900 p-3 text-sm text-green-300">
{`npm install
npm run dev`}
          </pre>
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          <span className="rounded-full bg-blue-100 px-3 py-1 text-sm font-medium text-blue-700">
            React
          </span>
          <span className="rounded-full bg-purple-100 px-3 py-1 text-sm font-medium text-purple-700">
            Vite
          </span>
          <span className="rounded-full bg-emerald-100 px-3 py-1 text-sm font-medium text-emerald-700">
            Tailwind CSS
          </span>
        </div>
      </div>
    </main>
  )
}

export default App
