/**
 * Utility functions for browser and device detection.
 */

export function isInAppBrowser(): boolean {
    if (typeof window === "undefined") return false;

    const ua = navigator.userAgent || navigator.vendor || (window as any).opera;

    // Common keywords in user agent strings for in-app browsers
    const rules = [
        "Instagram",
        "FBAV", // Facebook App Version
        "FBAN", // Facebook App Native
        "WhatsApp",
        "Line",
        "Twitter",
        "Snapchat",
        "LinkedInApp",
    ];

    const hasAppKeyword = rules.some((rule) => ua.includes(rule));

    // Android WebView specific check (often contains build version + 'wv')
    const isAndroidWebView = /Android/.test(ua) && /wv/.test(ua);

    // iOS Safari check - on iOS, standalone Safari has 'Safari/' at the end,
    // but in-app browsers often just have 'Mobile/' without 'Safari/'.
    // We exclude specialized browsers like Chrome (CriOS) and Firefox (FxiOS).
    const isIOSWebView =
        /(iPhone|iPod|iPad).*AppleWebKit(?!.*Safari)/i.test(ua) &&
        !/CriOS/.test(ua) &&
        !/FxiOS/.test(ua);

    return hasAppKeyword || isAndroidWebView || isIOSWebView;
}
