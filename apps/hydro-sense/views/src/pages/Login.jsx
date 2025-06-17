
import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";

export default function Login({ onLogin }) {
  const [id, setId] = useState("");
  const [pw, setPw] = useState("");
  const navigate = useNavigate();

  const handleLogin = () => {
    if (id === "admin" && pw === "1234") {
      onLogin();
      navigate("/latest");
    } else {
      alert("ID またはパスワードが正しくありません");
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 px-4 md:px-8 pt-4">
      
      <div className="bg-white p-8 rounded-2xl shadow-md max-w-sm mx-auto">
        <div className="flex justify-center mb-4">
        <img src="/hydro-sense/icons/login.png" alt="ログイン" className=" w-20 h-20 " />
        </div>
        <h1 className="text-2xl font-bold mb-6 text-center">ログイン</h1>
        <input
          type="text"
          placeholder="ユーザーID"
          value={id}
          onChange={(e) => setId(e.target.value)}
          className="mb-4 p-2 border rounded w-full"
        />
        <input
          type="password"
          placeholder="パスワード"
          value={pw}
          onChange={(e) => setPw(e.target.value)}
          className="mb-6 p-2 border rounded w-full"
        />
        <button
          onClick={handleLogin}
          className="bg-blue-500 hover:bg-blue-600 text-white p-2 w-full rounded"
        >
          ログイン
        </button>
      </div>
    </div>
  );
}
