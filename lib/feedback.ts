import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { db } from "./firebase";
import type { Feedback, FeedbackType } from "./domain/feedback";

export async function submitFeedback(
    userId: string,
    userName: string,
    type: FeedbackType,
    message: string,
    urlContext: string
): Promise<string> {
    const docRef = await addDoc(collection(db, "feedback"), {
        userId,
        userName,
        type,
        message,
        urlContext,
        status: 'new',
        createdAt: new Date().toISOString(),
        _serverCreatedAt: serverTimestamp()
    });

    return docRef.id;
}
