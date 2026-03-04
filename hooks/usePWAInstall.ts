"use client";

import { useState, useEffect } from "react";

// Evento global para capturarlo independientemente de cuándo se monte el hook
let globalDeferredPrompt: any = null;
let globalIsInstallable = false;
const listeners = new Set<() => void>();

function notifyListeners() {
    listeners.forEach((listener) => listener());
}

if (typeof window !== "undefined") {
    window.addEventListener("beforeinstallprompt", (e: Event) => {
        e.preventDefault();
        globalDeferredPrompt = e;
        globalIsInstallable = true;
        notifyListeners();
    });
}

export interface PWAInstallHook {
    isInstallable: boolean;
    isStandalone: boolean;
    isIOS: boolean;
    isAndroid: boolean;
    promptToInstall: () => Promise<{ success: boolean }>;
    dismissPrompt: () => void;
    hasDismissed: boolean;
}

export function usePWAInstall(cooldownDays = 7): PWAInstallHook {
    const [isInstallable, setIsInstallable] = useState(globalIsInstallable);
    const [isStandalone, setIsStandalone] = useState(false);
    const [isIOS, setIsIOS] = useState(false);
    const [isAndroid, setIsAndroid] = useState(false);
    const [hasDismissed, setHasDismissed] = useState(false);

    useEffect(() => {
        const listener = () => setIsInstallable(globalIsInstallable);
        listeners.add(listener);

        // Check if it's already installed (standalone mode)
        const checkStandalone = () => {
            if (typeof window === "undefined") return false;
            return (
                window.matchMedia("(display-mode: standalone)").matches ||
                (window.navigator as any).standalone === true
            );
        };
        setIsStandalone(checkStandalone());

        // Check OS
        const checkOS = () => {
            if (typeof window === "undefined") return { ios: false, android: false };
            const userAgent = window.navigator.userAgent.toLowerCase();
            return {
                ios: /iphone|ipad|ipod/.test(userAgent),
                android: /android/.test(userAgent),
            };
        };
        const os = checkOS();
        setIsIOS(os.ios);
        setIsAndroid(os.android);

        // Check dismiss status
        const dismissKey = "pwa_prompt_dismissed_at";
        const dismissedAt = localStorage.getItem(dismissKey);
        if (dismissedAt) {
            const dismissedDate = new Date(parseInt(dismissedAt, 10));
            const now = new Date();
            const daysSinceDismissed = (now.getTime() - dismissedDate.getTime()) / (1000 * 3600 * 24);

            if (daysSinceDismissed < cooldownDays) {
                setHasDismissed(true);
            } else {
                localStorage.removeItem(dismissKey);
            }
        }

        return () => {
            listeners.delete(listener);
        };
    }, [cooldownDays]);

    const promptToInstall = async () => {
        if (globalDeferredPrompt) {
            try {
                await globalDeferredPrompt.prompt();
                const choiceResult = await globalDeferredPrompt.userChoice;
                if (choiceResult.outcome === "accepted") {
                    console.log("User accepted the install prompt");
                } else {
                    console.log("User dismissed the install prompt");
                }
                // We only clear it after it's been consumed
                globalDeferredPrompt = null;
                globalIsInstallable = false;
                notifyListeners();
                return { success: true };
            } catch (err) {
                console.error("Install prompt error:", err);
                return { success: false };
            }
        }
        return { success: false };
    };

    const dismissPrompt = () => {
        setHasDismissed(true);
        localStorage.setItem("pwa_prompt_dismissed_at", Date.now().toString());
    };

    return {
        isInstallable,
        isStandalone,
        isIOS,
        isAndroid,
        promptToInstall,
        dismissPrompt,
        hasDismissed,
    };
}
