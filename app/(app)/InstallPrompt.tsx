"use client";

// Adding Sofar to a home screen (SPEC §6, M5).
//
// A daily question that lives behind a browser, three taps deep in a tab
// someone closed last week, does not get answered. Installed, it is one tap
// from the lock screen — and on iOS, being installed is also the only way a
// push notification can ever arrive.
//
// Shown once, quietly, and only where it can work: never when already
// installed, never after it has been dismissed. Chrome hands us a real
// prompt; Safari has no such API, so it gets the two steps instead.

import { useEffect, useState } from "react";

interface InstallEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const DISMISSED = "sofar.install.dismissed";

export default function InstallPrompt() {
  const [event, setEvent] = useState<InstallEvent | null>(null);
  const [iosHint, setIosHint] = useState(false);
  const [gone, setGone] = useState(true);

  useEffect(() => {
    // Already installed, or asked before.
    const standalone =
      window.matchMedia?.("(display-mode: standalone)").matches ||
      (window.navigator as { standalone?: boolean }).standalone === true;
    let dismissed = false;
    try {
      dismissed = localStorage.getItem(DISMISSED) === "1";
    } catch {
      // Private browsing can refuse storage; then it simply shows again.
    }
    if (standalone || dismissed) return;

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setEvent(e as InstallEvent);
      setGone(false);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);

    // iOS never fires that event, and it is the platform that most needs
    // installing, so it is detected rather than waited for.
    const ua = navigator.userAgent;
    const isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    const isSafari = /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua);
    if (isIOS && isSafari) {
      setIosHint(true);
      setGone(false);
    }

    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  function dismiss() {
    setGone(true);
    try {
      localStorage.setItem(DISMISSED, "1");
    } catch {
      // Nothing to do; it will offer again next time.
    }
  }

  async function install() {
    if (!event) return;
    await event.prompt();
    await event.userChoice;
    dismiss();
  }

  if (gone) return null;

  return (
    <aside className="install">
      <p className="install-text">
        {iosHint ? (
          <>
            Keep Sofar on your home screen: tap <strong>Share</strong>, then{" "}
            <strong>Add to Home Screen</strong>.
          </>
        ) : (
          <>One tap from your home screen, instead of a tab you have to find.</>
        )}
      </p>
      <span className="install-actions">
        {!iosHint && (
          <button type="button" className="button-quiet" onClick={() => void install()}>
            Add to home screen
          </button>
        )}
        <button type="button" className="install-dismiss" onClick={dismiss}>
          Not now
        </button>
      </span>
    </aside>
  );
}
