"use client";

import { useEffect, useState } from "react";
import { auth, loginWithGoogle, logout } from "@/lib/auth";
import { onAuthStateChanged, User } from "firebase/auth";

export default function TestPage() {
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, currentUser => {
      setUser(currentUser);
    });

    return () => unsubscribe();
  }, []);

  return (
    <main style={{ padding: 20 }}>
      <h1>Login con Google</h1>

      {!user ? (
        <button onClick={loginWithGoogle}>
          Entrar con Google
        </button>
      ) : (
        <>
          <p>Hola, {user.displayName}</p>
          <p>{user.email}</p>

          <button onClick={logout}>
            Cerrar sesión
          </button>
        </>
      )}
    </main>
  );
}
