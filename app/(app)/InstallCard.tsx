"use client";

// Adding Sofar to a home screen, offered at the one moment it makes sense:
// just after someone has answered, when "tomorrow's question" is a thing they
// have a reason to want one tap away. It used to be a strip on every screen
// from the first visit, asking for a place on the home screen before the app
// had given anyone a reason to keep it.
//
// Never when already installed, never after it has been dismissed. Chrome
// hands us a real prompt; Safari has no such API, so it gets the two steps.

import { useEffect, useState } from "react";

interface InstallEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const DISMISSED = "sofar.install.dismissed";

export default function InstallCard() {
  const [event, setEvent] = useState<InstallEvent | null>(null);
  const [ios, setIos] = useState(false);
  const [show, setShow] = useState(false);

  useEffect(() => {
    const standalone =
      window.matchMedia?.("(display-mode: standalone)").matches ||
      (window.navigator as { standalone?: boolean }).standalone === true;
    let dismissed = false;
    try {
      dismissed = localStorage.getItem(DISMISSED) === "1";
    } catch {
      // Private browsing can refuse storage; then it offers again next time.
    }
    if (standalone || dismissed) return;

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setEvent(e as InstallEvent);
      setShow(true);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);

    const ua = navigator.userAgent;
    const isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    const isSafari = /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua);
    if (isIOS && isSafari) {
      setIos(true);
      setShow(true);
    }
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  function dismiss() {
    setShow(false);
    try {
      localStorage.setItem(DISMISSED, "1");
    } catch {
      // Nothing to do.
    }
  }

  async function install() {
    if (!event) return;
    await event.prompt();
    await event.userChoice;
    dismiss();
  }

  if (!show) return null;
  return (
    <aside className="install unfold">
      <p className="install-text">
        {ios ? (
          <>
            So tomorrow&rsquo;s is one tap away: tap <strong>Share</strong>, then{" "}
            <strong>Add to Home Screen</strong>.
          </>
        ) : (
          <>Keep Sofar on your home screen, so tomorrow&rsquo;s question is one tap away.</>
        )}
      </p>
      <span className="install-actions">
        {!ios && (
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
