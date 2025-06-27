
# ✅ Hydro Sense EC補正機能 仕様書（2025年版）

---

## 1. 🎯 補正の目的
センサーの個体差や構成による誤差を排除し、**信頼できるEC値（電気伝導度）**を導出する。

---

## 2. ⚙️ 補正の基本構造（3段階補正）

| ステップ | 内容                       | 使用定数（`sensor_master`）            |
|----------|----------------------------|----------------------------------------|
| ① 電気的補正     | ADC値 → 抵抗値 → EC       | `const_k1`, `const_vin`, `const_ra`     |
| ② 温度補正       | EC → EC25（25℃換算）     | `const_temperature_coef`                |
| ③ 統計補正       | EC25 → 最終補正値         | `const_a`, `const_b`, `const_c`         |

補正値の計算には、PL/pgSQL関数 `calculate_ec_corrected(raw, temp, serial)` を使用し、**システム全体でこの関数に統一して参照**する。

---

## 3. 🧾 `sensor_master` テーブル仕様（確定）

```sql
CREATE TABLE sensor_master (
  serial_number text PRIMARY KEY,
  sensor_type text NOT NULL CHECK (sensor_type IN ('air', 'water')),
  label text,
  registered_at timestamp DEFAULT CURRENT_TIMESTAMP,
  const_k1 float4 DEFAULT 3.20,
  const_vin float4 DEFAULT 3.3,
  const_ra int4 DEFAULT 22,
  const_temperature_coef float4 DEFAULT 0.020,
  const_a float4 DEFAULT 1.0,
  const_b float4 DEFAULT 0.0,
  const_c float4 DEFAULT 0.0
);
```

---

## 4. 🧮 補正関数 `calculate_ec_corrected(...)`

- `sensor_master` に記録された定数を読み出し、raw/温度から補正EC値を算出
- 不正値（0除算、定数未定義など）は `NULL` を返す
- **すべてのビュー・APIはこの関数を使用**

---

## 5. 📥 EC補正点データベース `ec_correction_points`（新規）

| カラム名         | 内容                                       |
|------------------|--------------------------------------------|
| id               | 補正点ID（PK）                             |
| serial_number    | 対象センサー                               |
| timestamp        | 測定日時（rawデータと一致）               |
| temperature      | 測定時水温                                 |
| raw_value        | 測定時ADC値                                |
| ec_true_value    | 入力された「正しいEC値（mS/cm）」          |

---

## 6. 🧭 補正のワークフロー

### ✅ 初回補正時（種類①のK1決定）
- ユーザーが正しいEC値を画面から入力
- サーバーが `sensor_raw_data` の最新値（温度・raw）を取得
- `K1 = 1 / (EC × R)` を逆算し、`sensor_master` に保存

### ✅ 2回目以降（種類②の a, b, c 補正）
- EC補正点を蓄積（`ec_correction_points`）
- a, b, c を最小二乗法で算出
- `sensor_master` に上書き保存

---

## 7. 📊 可視化・精度評価（予定機能）

- グラフ：
  - X：EC25、Y：真のEC値 → y=x 直線との乖離を可視化
- 数値評価：
  - RMSE、平均誤差、最大誤差などを表示
- 再補正ボタン（a, b, c 再計算）

---

## 8. ✅ 基本方針のまとめ

- **rawデータは常に記録・保持し、補正値は保存しない**
- **「正しい式」があれば、全期間のデータが正しく補正できる**
- **関数・定数は一元管理し、ビュー/APIでも統一的に使用**
- **補正の根拠はすべてデータベースに記録・再現可能**

---
