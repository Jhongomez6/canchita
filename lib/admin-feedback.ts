import { collection, query, orderBy, getDocs } from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";
import { db, app } from "./firebase";
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

/* =========================
   RESOLVER FEEDBACK (ADMIN)
========================= */
export async function resolveFeedback(feedbackId: string): Promise<{
    success: boolean;
    pushSent: boolean;
    message: string;
}> {
    const functions = getFunctions(app);
    const notify = httpsCallable<
        { feedbackId: string },
        { success: boolean; pushSent: boolean; message: string }
    >(functions, "notifyFeedbackResolved");

    const result = await notify({ feedbackId });
    return result.data;
}
