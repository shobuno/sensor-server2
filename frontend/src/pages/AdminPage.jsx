// sensor-server/frontend/src/pages/AdminPage.jsx

import { useEffect, useState } from 'react';
import TopBar from '@/components/TopBar';
import { fetchJson } from '@/auth';

export default function AdminPage() {
  const [users, setUsers] = useState([]);
  const [newUser, setNewUser] = useState({ email: '', name: '', role: 'user', password: '' });
  const [editingUserId, setEditingUserId] = useState(null);
  const [editedUser, setEditedUser] = useState({});
  const [newPassword, setNewPassword] = useState('');

  useEffect(() => { fetchUsers(); }, []);

  const fetchUsers = async () => {
    const data = await fetchJson('/api/admin/users');
    setUsers(data);
  };

  const handleInputChange = (e) => {
    setNewUser({ ...newUser, [e.target.name]: e.target.value });
  };

  const handleAddUser = async () => {
    await fetchJson('/api/admin/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newUser),
    });
    setNewUser({ email: '', name: '', role: 'user', password: '' });
    await fetchUsers();
  };

  const startEdit = (user) => {
    setEditingUserId(user.id);
    setEditedUser({ email: user.email, name: user.name, role: user.role });
    setNewPassword('');
  };

  const handleEditChange = (e) => {
    setEditedUser({ ...editedUser, [e.target.name]: e.target.value });
  };

  const handleSaveEdit = async (userId) => {
    await fetchJson(`/api/admin/users/${userId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...editedUser, password: newPassword || undefined }),
    });
    setEditingUserId(null);
    setEditedUser({});
    setNewPassword('');
    fetchUsers();
  };

  return (
    <>
      <TopBar title="管理者メニュー" />

      <div className="mx-auto max-w-5xl p-4">
        <h2 className="text-2xl font-bold mb-4">管理者専用ページ</h2>
        <h3 className="text-lg font-semibold mb-2">会員一覧</h3>

        <div className="overflow-x-auto rounded-lg border">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50">
              <tr className="text-left">
                <th className="px-3 py-2">ID</th>
                <th className="px-3 py-2">メール</th>
                <th className="px-3 py-2">名前</th>
                <th className="px-3 py-2">権限</th>
                <th className="px-3 py-2">登録日</th>
                <th className="px-3 py-2">操作</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id} className="border-t">
                  <td className="px-3 py-2">{user.id}</td>
                  <td className="px-3 py-2 break-all">{user.email}</td>
                  <td className="px-3 py-2">
                    {editingUserId === user.id ? (
                      <input
                        name="name"
                        className="border rounded px-2 py-1"
                        value={editedUser.name || ''}
                        onChange={handleEditChange}
                      />
                    ) : (
                      user.name
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {editingUserId === user.id ? (
                      <select
                        name="role"
                        className="border rounded px-2 py-1"
                        value={editedUser.role}
                        onChange={handleEditChange}
                      >
                        <option value="user">user</option>
                        <option value="admin">admin</option>
                      </select>
                    ) : (
                      user.role
                    )}
                  </td>
                  <td className="px-3 py-2">{new Date(user.created_at).toLocaleString()}</td>
                  <td className="px-3 py-2">
                    {editingUserId === user.id ? (
                      <div className="space-x-2">
                        <input
                          type="password"
                          placeholder="新パスワード（空で変更なし）"
                          className="border rounded px-2 py-1"
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                        />
                        <button className="px-2 py-1 rounded bg-blue-600 text-white" onClick={() => handleSaveEdit(user.id)}>保存</button>
                        <button className="px-2 py-1 rounded bg-gray-200" onClick={() => setEditingUserId(null)}>キャンセル</button>
                      </div>
                    ) : (
                      <button className="px-2 py-1 rounded bg-gray-100" onClick={() => startEdit(user)}>編集</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <h3 className="text-lg font-semibold mt-6 mb-2">新規ユーザー登録</h3>
        <div className="flex flex-col gap-2 w-full max-w-sm">
          <input type="text" name="email" placeholder="メール" className="border rounded px-3 py-2" value={newUser.email} onChange={handleInputChange} />
          <input type="text" name="name" placeholder="名前" className="border rounded px-3 py-2" value={newUser.name} onChange={handleInputChange} />
          <input type="password" name="password" placeholder="パスワード" className="border rounded px-3 py-2" value={newUser.password} onChange={handleInputChange} />
          <select name="role" className="border rounded px-3 py-2" value={newUser.role} onChange={handleInputChange}>
            <option value="user">user</option>
            <option value="admin">admin</option>
          </select>
          <button className="px-3 py-2 rounded bg-blue-600 text-white" onClick={handleAddUser}>登録</button>
        </div>
      </div>
    </>
  );
}
