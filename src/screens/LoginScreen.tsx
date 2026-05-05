
export default function LoginScreen() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 p-4 text-slate-900">
      <section className="w-[380px] rounded-3xl bg-white p-6 shadow-lg ring-1 ring-slate-200">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-indigo-600">
            AI Content Extension
          </p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900">Đăng nhập</h1>
          <p className="mt-2 text-sm text-slate-500">
            Nhập thông tin để đăng nhập và sử dụng tính năng tạo nội dung AI.
          </p>
        </div>

        <form className="mt-8 space-y-6">
          <div className="space-y-5">
            <div>
              <label htmlFor="username" className="mb-2 block text-sm font-medium text-slate-700">
                Tên đăng nhập
              </label>
              <input
                id="username"
                type="text"
                placeholder="Nhập tên đăng nhập"
                className="w-full rounded-2xl border border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
              />
            </div>

            <div>
              <label htmlFor="password" className="mb-2 block text-sm font-medium text-slate-700">
                Mật khẩu
              </label>
              <input
                id="password"
                type="password"
                placeholder="Nhập mật khẩu"
                className="w-full rounded-2xl border border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
              />
            </div>
          </div>

          <button
            type="button"
            className="w-full rounded-2xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-indigo-700"
          >
            Đăng nhập
          </button>
        </form>
      </section>
    </main>
  );
}

