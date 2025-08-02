

// sensor-server/frontend/src/pages/AdminPage.jsx
import { useEffect, useState } from 'react';
import { getToken } from '../auth';

export default function AdminPage() {
  const [users, setUsers] = useState([]);
  const [newUser, setNewUser] = useState({ email: '', name: '', role: 'user', password: '' });
  const [editingUserId, setEditingUserId] = useState(null);
  const [editedUser, setEditedUser] = useState({});
  const [newPassword, setNewPassword] = useState('');
  const [registerMessage, setRegisterMessage] = useState('');


  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    const res = await fetch('/api/admin/users', {
      headers: { Authorization: `Bearer ${getToken()}` },
    });
    const data = await res.json();
    setUsers(data);
  };

  const handleInputChange = (e) => {
    setNewUser({ ...newUser, [e.target.name]: e.target.value });
  };

    const handleAddUser = async () => {
    const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify(newUser),
    });

    const result = await res.json();

    if (res.ok) {
        setNewUser({ email: '', name: '', role: 'user', password: '' });
        fetchUsers();
        setRegisterMessage(`✅ ${result.message}（開発用リンク: ${result.verificationLink}`);
    } else {
        setRegisterMessage(`❌ ${result.error || '登録に失敗しました'}`);
    }
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
    const res = await fetch(`/api/admin/users/${userId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${getToken()}`,
      },
      body: JSON.stringify({ ...editedUser, password: newPassword || undefined }),
    });
    if (res.ok) {
      setEditingUserId(null);
      setEditedUser({});
      setNewPassword('');
      fetchUsers();
    }
  };

  return (
    <div style={{ padding: 20 }}>
      <h2>管理者専用ページ</h2>
      <h3>会員一覧</h3>
      <table border="1" cellPadding="6">
        <thead>
          <tr>
            <th>ID</th>
            <th>メール</th>
            <th>名前</th>
            <th>権限</th>
            <th>登録日</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          {users.map((user) => (
            <tr key={user.id}>
              <td>{user.id}</td>
              <td>{user.email}</td>
              <td>
                {editingUserId === user.id ? (
                  <input
                    name="name"
                    value={editedUser.name || ''}
                    onChange={handleEditChange}
                  />
                ) : (
                  user.name
                )}
              </td>
              <td>
                {editingUserId === user.id ? (
                  <select name="role" value={editedUser.role} onChange={handleEditChange}>
                    <option value="user">user</option>
                    <option value="admin">admin</option>
                  </select>
                ) : (
                  user.role
                )}
              </td>
              <td>{new Date(user.created_at).toLocaleString()}</td>
              <td>
                {editingUserId === user.id ? (
                  <>
                    <input
                      type="password"
                      placeholder="新パスワード（空で変更なし）"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                    />
                    <br />
                    <button onClick={() => handleSaveEdit(user.id)}>保存</button>
                    <button onClick={() => setEditingUserId(null)}>キャンセル</button>
                  </>
                ) : (
                  <button onClick={() => startEdit(user)}>編集</button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <h3>新規ユーザー登録</h3>
      <div style={{ display: 'flex', flexDirection: 'column', width: 300 }}>
        <input type="text" name="email" placeholder="メール" value={newUser.email} onChange={handleInputChange} />
        <input type="text" name="name" placeholder="名前" value={newUser.name} onChange={handleInputChange} />
        <input type="password" name="password" placeholder="パスワード" value={newUser.password} onChange={handleInputChange} />
        <select name="role" value={newUser.role} onChange={handleInputChange}>
          <option value="user">user</option>
          <option value="admin">admin</option>
        </select>
        <button onClick={handleAddUser}>登録</button>
      </div>
        {registerMessage && (
        <div style={{ marginTop: '1em', color: registerMessage.startsWith('✅') ? 'green' : 'red' }}>
            {registerMessage.includes('http') ? (
            (() => {
                const urlMatch = registerMessage.match(/http:\/\/[^\s)]+/);
                const rawUrl = urlMatch ? urlMatch[0] : null;
                const url = rawUrl ? rawUrl.replace(/\)$/, '') : null; // ← 末尾の ) を削除
                return (
                <>
                    ✅ ユーザー登録完了（開発用リンク）：
                    {url ? (
                    <a href={url} target="_blank" rel="noopener noreferrer">
                        {url}
                    </a>
                    ) : (
                    'リンクが抽出できませんでした'
                    )}
                </>
                );
            })()
            ) : (
            registerMessage
            )}
        </div>
        )}

    </div>
  );
}
