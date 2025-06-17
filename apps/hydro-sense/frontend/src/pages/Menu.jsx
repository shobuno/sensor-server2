import { useNavigate } from "react-router-dom";

export default function Menu() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gray-100 px-4 md:px-8 pt-16">
      <div className="max-w-sm mx-auto bg-white p-6 rounded-2xl shadow-md">
        <h1 className="text-2xl font-bold mb-6 text-center">メニュー</h1>
        <div className="space-y-4">
          <button
            onClick={() => navigate("/ec-validation")}
            className="w-full bg-blue-500 hover:bg-blue-600 text-white py-3 rounded-xl shadow"
          >
            ECフォーム
          </button>
          <button
            onClick={() => navigate("/latest")}
            className="w-full bg-cyan-500 hover:bg-cyan-600 text-white py-3 rounded-xl shadow"
            >
            最新データ表示
          </button>
          <button
            onClick={() => navigate("/graph-view")}
            className="w-full bg-purple-500 hover:bg-purple-600 text-white py-3 rounded-xl shadow"
          >
            グラフ表示
          </button>
        </div>
      </div>
    </div>
  );
}
