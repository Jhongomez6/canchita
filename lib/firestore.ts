import { collection, addDoc, getDocs } from "firebase/firestore";
import { db } from "./firebase";

export async function getNotes() {
  const snapshot = await getDocs(collection(db, "notes"));
  return snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data(),
  }));
}

export async function createNote(title: string, content: string) {
  await addDoc(collection(db, "notes"), {
    title,
    content,
    createdAt: new Date(),
  });
}
