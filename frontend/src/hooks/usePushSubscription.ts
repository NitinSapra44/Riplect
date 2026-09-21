import { useEffect, useRef, useCallback } from "react";
import { supabase } from "@/lib/supabase";

// Convert a URL-safe base64 string to a Uint8Array (required by PushManager)
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

async function getAuthToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

async function sendSubscriptionToServer(
  subscription: PushSubscription,
  token: string,
): Promise<void> {
  const json = subscription.toJSON();
  await fetch("/api/push/subscribe", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      endpoint: subscription.endpoint,
      keys: {
        p256dh: json.keys?.p256dh,
        auth: json.keys?.auth,
      },
    }),
  });
}

interface UsePushSubscriptionOptions {
  isAuthenticated: boolean;
}

export function usePushSubscription({ isAuthenticated }: UsePushSubscriptionOptions) {
  const swRegistrationRef = useRef<ServiceWorkerRegistration | null>(null);

  // Register service worker once on mount
  useEffect(() => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;

    navigator.serviceWorker
      .register("/sw.js")
      .then((reg) => {
        swRegistrationRef.current = reg;
      })
      .catch((err) => {
        console.error("[Push] Service worker registration failed:", err);
      });
  }, []);

  // Auto-subscribe if permission was already granted (e.g. page reload after allowing)
  useEffect(() => {
    if (!isAuthenticated) return;
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
    if (Notification.permission !== "granted") return;

    const tryAutoSubscribe = async () => {
      try {
        const reg =
          swRegistrationRef.current ??
          (await navigator.serviceWorker.ready);

        const existing = await reg.pushManager.getSubscription();
        if (existing) {
          // Subscription already exists — ensure server has it
          const token = await getAuthToken();
          if (token) await sendSubscriptionToServer(existing, token);
          return;
        }

        // No subscription yet — create one
        const vapidRes = await fetch("/api/push/vapid-key");
        if (!vapidRes.ok) return;
        const { publicKey } = await vapidRes.json();

        const sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey),
        });

        const token = await getAuthToken();
        if (token) await sendSubscriptionToServer(sub, token);
      } catch (err) {
        console.error("[Push] Auto-subscribe failed:", err);
      }
    };

    tryAutoSubscribe();
  }, [isAuthenticated]);

  // Exposed function: request permission then subscribe (called on user gesture)
  const requestAndSubscribe = useCallback(async (): Promise<NotificationPermission> => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      return Notification.requestPermission();
    }

    const permission = await Notification.requestPermission();
    if (permission !== "granted") return permission;

    try {
      const reg =
        swRegistrationRef.current ??
        (await navigator.serviceWorker.ready);

      const vapidRes = await fetch("/api/push/vapid-key");
      if (!vapidRes.ok) return permission;
      const { publicKey } = await vapidRes.json();

      const existing = await reg.pushManager.getSubscription();
      const sub =
        existing ??
        (await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey),
        }));

      const token = await getAuthToken();
      if (token) await sendSubscriptionToServer(sub, token);
    } catch (err) {
      console.error("[Push] requestAndSubscribe error:", err);
    }

    return permission;
  }, []);

  return { requestAndSubscribe };
}
