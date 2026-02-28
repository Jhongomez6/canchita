export type FeedbackType = 'bug' | 'idea' | 'other';

export interface Feedback {
    id?: string;
    userId: string;
    userName: string;
    type: FeedbackType;
    message: string;
    urlContext: string;
    createdAt: string; // ISO string
    status: 'new' | 'reviewed' | 'resolved';
    resolvedAt?: string; // ISO string, set when feedback is resolved
}
