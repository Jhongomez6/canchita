"use client";

import { useState } from "react";
import { useAuth } from "@/lib/AuthContext";
import { getFunctions, httpsCallable } from "firebase/functions";
import { app } from "@/lib/firebase";
import { enablePushNotifications } from "@/lib/push";
import AuthGuard from "@/components/AuthGuard";

export default function PushTestPage() {
    const { user, profile } = useAuth();
    const [result, setResult] = useState<any>(null);
    const [loading, setLoading] = useState(false);
    const [tokenResult, setTokenResult] = useState<string | null>(null);

    // SW diagnostics
    const [swInfo, setSwInfo] = useState<string | null>(null);

    async function checkServiceWorker() {
        if (!("serviceWorker" in navigator)) {
            setSwInfo("❌ Service Workers not supported in this browser");
            return;
        }

        const registrations = await navigator.serviceWorker.getRegistrations();
        const info = registrations.map((reg) => ({
            scope: reg.scope,
            active: reg.active?.state || "none",
            scriptURL: reg.active?.scriptURL || "none",
        }));
        setSwInfo(JSON.stringify(info, null, 2));
    }

    async function reRegisterToken() {
        if (!user) return;
        setLoading(true);
        setTokenResult(null);
        try {
            const token = await enablePushNotifications(user.uid);
            setTokenResult(token ? `✅ Token: ${token.substring(0, 30)}...` : "❌ No token returned (check console)");
        } catch (err: any) {
            setTokenResult(`❌ Error: ${err.message}`);
        } finally {
            setLoading(false);
        }
    }

    async function sendTestPush() {
        setLoading(true);
        setResult(null);
        try {
            const functions = getFunctions(app);
            const testPush = httpsCallable(functions, "testPushNotification");
            const res = await testPush({});
            setResult(res.data);
        } catch (err: any) {
            setResult({ success: false, error: err.message });
        } finally {
            setLoading(false);
        }
    }

    return (
        <AuthGuard>
            <main className="min-h-screen bg-slate-50 p-6">
                <div className="max-w-lg mx-auto space-y-6">
                    <h1 className="text-2xl font-bold text-slate-800">🧪 Push Notification Diagnostics</h1>
                    <p className="text-sm text-slate-500">Herramienta para diagnosticar por qué las push notifications no llegan.</p>

                    {/* Step 1: Check SW */}
                    <div className="bg-white rounded-xl p-5 shadow-sm border border-slate-100">
                        <h2 className="font-bold text-slate-700 mb-2">1. Check Service Worker</h2>
                        <button onClick={checkServiceWorker} className="px-4 py-2 bg-slate-800 text-white rounded-lg text-sm font-bold">
                            Check SW Status
                        </button>
                        {swInfo && <pre className="mt-3 text-xs bg-slate-50 p-3 rounded-lg overflow-auto whitespace-pre-wrap">{swInfo}</pre>}
                    </div>

                    {/* Step 2: Re-register token */}
                    <div className="bg-white rounded-xl p-5 shadow-sm border border-slate-100">
                        <h2 className="font-bold text-slate-700 mb-2">2. Register/Refresh FCM Token</h2>
                        <p className="text-xs text-slate-500 mb-3">Solicita permisos y genera un nuevo token FCM.</p>
                        <button onClick={reRegisterToken} disabled={loading} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-bold disabled:opacity-50">
                            {loading ? "..." : "Register Token"}
                        </button>
                        {tokenResult && <pre className="mt-3 text-xs bg-slate-50 p-3 rounded-lg overflow-auto whitespace-pre-wrap">{tokenResult}</pre>}
                    </div>

                    {/* Step 3: Send test push */}
                    <div className="bg-white rounded-xl p-5 shadow-sm border border-slate-100">
                        <h2 className="font-bold text-slate-700 mb-2">3. Send Test Push via Cloud Function</h2>
                        <p className="text-xs text-slate-500 mb-3">Llama a testPushNotification en el servidor. Muestra los resultados de FCM.</p>
                        <button onClick={sendTestPush} disabled={loading} className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-bold disabled:opacity-50">
                            {loading ? "Sending..." : "Send Test Push"}
                        </button>
                        {result && (
                            <pre className={`mt-3 text-xs p-3 rounded-lg overflow-auto whitespace-pre-wrap ${result.success ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-800"}`}>
                                {JSON.stringify(result, null, 2)}
                            </pre>
                        )}
                    </div>

                    {/* Profile info */}
                    <div className="bg-white rounded-xl p-5 shadow-sm border border-slate-100">
                        <h2 className="font-bold text-slate-700 mb-2">Profile Info</h2>
                        <pre className="text-xs bg-slate-50 p-3 rounded-lg overflow-auto whitespace-pre-wrap">
                            {JSON.stringify({
                                uid: user?.uid,
                                notificationsEnabled: profile?.notificationsEnabled,
                                fcmTokens: profile?.fcmTokens?.map((t: string) => t.substring(0, 25) + "...") || [],
                                browserPermission: typeof Notification !== "undefined" ? Notification.permission : "N/A",
                                vapidKeySet: !!process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY,
                            }, null, 2)}
                        </pre>
                    </div>
                </div>
            </main>
        </AuthGuard>
    );
}
