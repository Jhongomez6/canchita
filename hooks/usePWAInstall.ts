"use client";

import { useState, useEffect } from "react";

export interface PWAInstallHook {
    isInstallable: boolean;
    isStandalone: boolean;
    isIOS: boolean;
    promptToInstall: () => void;
    dismissPrompt: () => void;
    hasDismissed: boolean;
}

export function usePWAInstall(cooldownDays = 7): PWAInstallHook {
    const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
    const [isInstallable, setIsInstallable] = useState(false);
    const [isStandalone, setIsStandalone] = useState(false);
    const [isIOS, setIsIOS] = useState(false);
    const [hasDismissed, setHasDismissed] = useState(false);

    useEffect(() => {
        // Check if it's already installed (standalone mode)
        const checkStandalone = () => {
            if (typeof window === "undefined") return false;
            return (
                window.matchMedia("(display-mode: standalone)").matches ||
                (window.navigator as any).standalone === true
            );
        };

        setIsStandalone(checkStandalone());

        // Check if iOS
        const checkIOS = () => {
            if (typeof window === "undefined") return false;
            const userAgent = window.navigator.userAgent.toLowerCase();
            return /iphone|ipad|ipod/.test(userAgent);
        };

        setIsIOS(checkIOS());

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

        // Handle beforeinstallprompt
        const handleBeforeInstallPrompt = (e: Event) => {
            // Prevent the mini-infobar from appearing on mobile
            e.preventDefault();
            // Stash the event so it can be triggered later.
            setDeferredPrompt(e);
            // Update UI notify the user they can install the PWA
            setIsInstallable(true);
        };

        window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);

        return () => {
            window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
        };
    }, [cooldownDays]);

    const promptToInstall = () => {
        if (deferredPrompt) {
            // Show the install prompt
            deferredPrompt.prompt();
            // Wait for the user to respond to the prompt
            deferredPrompt.userChoice.then((choiceResult: { outcome: string }) => {
                if (choiceResult.outcome === "accepted") {
                    console.log("User accepted the install prompt");
                } else {
                    console.log("User dismissed the install prompt");
                }
                setDeferredPrompt(null);
                setIsInstallable(false);
            });
        } else if (isIOS) {
            // For iOS, the caller will handle showing the modal based on isIOS
            console.log("iOS detected, use manual instructions");
        }
    };

    const dismissPrompt = () => {
        setHasDismissed(true);
        localStorage.setItem("pwa_prompt_dismissed_at", Date.now().toString());
    };

    return {
        isInstallable,
        isStandalone,
        isIOS,
        promptToInstall,
        dismissPrompt,
        hasDismissed,
    };
}
