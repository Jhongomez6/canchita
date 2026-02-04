"use client";

import { useAuth } from "@/lib/AuthContext";
import { useEffect, useState } from "react";
import { getMyMatches } from "@/lib/matches";
import AuthGuard from "@/components/AuthGuard";

export default function Home() {
  const { user } = useAuth();
  const [matches, setMatches] = useState<any[]>([]);

  useEffect(() => {
    if (user) {
      getMyMatches(user.uid).then(setMatches);
    }
  }, [user]);

  return (
    <AuthGuard>
      <main style={{ padding: 20 }}>
        <h1>Mis partidos ⚽</h1>

        <a href="/new-match">+ Nuevo partido</a>

        <ul>
          {matches.map(m => (
            <li key={m.id}>
              <a href={`/match/${m.id}`}>
                {m.date} – {m.time} – {m.location}
              </a>
            </li>
          ))}
        </ul>

      </main>
    </AuthGuard>
  );
}
