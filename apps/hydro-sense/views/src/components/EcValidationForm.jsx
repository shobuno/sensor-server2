import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export default function EcValidationForm() {
  const [timestamp, setTimestamp] = useState("");
  const [measuredEc, setMeasuredEc] = useState("");
  const [calculatedEc, setCalculatedEc] = useState("");
  const [comment, setComment] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    const payload = {
      timestamp,
      measuredEc: parseFloat(measuredEc),
      calculatedEc: parseFloat(calculatedEc),
      comment,
    };

    const response = await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/ec-validations/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const result = await response.json();
    alert(result.message || "登録しました");
  };

  return (
    <div className="min-h-screen bg-gray-50 px-6 pt-4">
      <Card className="max-w-2xl mx-auto bg-white">
        <CardContent className="p-6 space-y-6">
          <h2 className="text-2xl font-bold text-center">EC実測値 登録フォーム</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label htmlFor="timestamp">測定日時</Label>
              <Input
                id="timestamp"
                type="datetime-local"
                value={timestamp}
                onChange={(e) => setTimestamp(e.target.value)}
              />
            </div>

            <div>
              <Label htmlFor="calculatedEc">計算EC値</Label>
              <Input
                id="calculatedEc"
                type="number"
                step="0.01"
                value={calculatedEc}
                onChange={(e) => setCalculatedEc(e.target.value)}
              />
            </div>

            <div>
              <Label htmlFor="measuredEc">実測EC値</Label>
              <Input
                id="measuredEc"
                type="number"
                step="0.01"
                value={measuredEc}
                onChange={(e) => setMeasuredEc(e.target.value)}
              />
            </div>

            <div>
              <Label htmlFor="comment">コメント（任意）</Label>
              <Textarea
                id="comment"
                rows={4}
                value={comment}
                onChange={(e) => setComment(e.target.value)}
              />
            </div>

            <Button type="submit" className="w-full">
              登録
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
