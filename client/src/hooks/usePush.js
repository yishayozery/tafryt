import { useEffect, useState } from 'react';
import api from '../api/client';

export function usePush() {
  const [permission, setPermission] = useState(Notification.permission);

  async function requestPermission() {
    const result = await Notification.requestPermission();
    setPermission(result);
    if (result === 'granted') await subscribe();
    return result;
  }

  async function subscribe() {
    try {
      const reg = await navigator.serviceWorker.ready;
      const { data } = await api.get('/vapid-public-key');
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(data.key),
      });
      await api.post('/users/push-subscription', { subscription: sub });
    } catch (err) {
      console.error('Push subscribe error:', err);
    }
  }

  return { permission, requestPermission };
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}
