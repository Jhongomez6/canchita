import { collection, query, orderBy, getDocs } from "firebase/firestore";
import { db } from "./firebase";
import type { Feedback } from "./domain/feedback";

export async function getAllFeedback(): Promise<Feedback[]> {
    const q = query(
        collection(db, "feedback"),
        orderBy("createdAt", "desc")
    );

    const snapshot = await getDocs(q);
    return snapshot.docs.map((doc) => {
        return {
            id: doc.id,
            ...doc.data()
        } as Feedback;
    });
}
