"use client";

import { useAuth } from "@/lib/AuthContext";
import { createMatch } from "@/lib/matches";
import AuthGuard from "@/components/AuthGuard";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function NewMatchPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [location, setLocation] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;

    await createMatch({
      date,
      time,
      location,
      createdBy: user.uid,
    });

    router.push("/");
  }

  return (
    <AuthGuard>
      <form onSubmit={handleSubmit} style={{ padding: 20 }}>
        <h2>Nuevo partido</h2>

        <input type="date" value={date} onChange={e => setDate(e.target.value)} />
        <br /><br />

        <input type="time" value={time} onChange={e => setTime(e.target.value)} />
        <br /><br />

        <input
          placeholder="Cancha"
          value={location}
          onChange={e => setLocation(e.target.value)}
        />
        <br /><br />

        <button type="submit">Crear partido</button>
      </form>
    </AuthGuard>
  );
}
