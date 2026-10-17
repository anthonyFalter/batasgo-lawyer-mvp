"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type TypingPhase = "idle" | "thinking" | "typing";

export function useTypingStream() {
  const [text, setText] = useState("");
  const [phase, setPhase] = useState<TypingPhase>("idle");
  const abortControllerRef = useRef<AbortController | null>(null);
  const activeRef = useRef(false);

  const clearStream = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    activeRef.current = false;
  }, []);

  /**
   * Start streaming from a real fetch Response (ReadableStream).
   * Appends each chunk to `text` as it arrives.
   */
  const startStream = useCallback(
    (response: Response, onComplete: (fullText: string) => void) => {
      clearStream();
      setText("");
      setPhase("thinking");

      const abort = new AbortController();
      abortControllerRef.current = abort;
      activeRef.current = true;

      (async () => {
        if (!response.body) {
          setPhase("idle");
          return;
        }
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let accumulated = "";

        setPhase("typing");
        try {
          while (true) {
            if (abort.signal.aborted) break;
            const { done, value } = await reader.read();
            if (done) break;
            const chunk = decoder.decode(value, { stream: true });
            accumulated += chunk;
            if (activeRef.current) setText(accumulated);
          }
        } catch {
          // stream cancelled or network error – stop silently
        } finally {
          reader.releaseLock();
          if (activeRef.current) {
            activeRef.current = false;
            setText("");
            setPhase("idle");
            onComplete(accumulated);
          }
        }
      })();
    },
    [clearStream],
  );

  /**
   * Legacy helper: animate a pre-loaded string the same way the old hook did.
   * Used for the triage handoff bootstrap messages (still static content).
   */
  const startTyping = useCallback(
    (fullText: string, onComplete: () => void) => {
      clearStream();
      setText("");
      setPhase("thinking");
      activeRef.current = true;

      const THINKING_DELAY_MS = 260;
      const TYPING_TICK_MS = 20;
      const CHARACTERS_PER_TICK = 4;

      const thinkingTimeout = setTimeout(() => {
        if (!activeRef.current) return;
        setPhase("typing");
        let visible = 0;
        const interval = setInterval(() => {
          if (!activeRef.current) {
            clearInterval(interval);
            return;
          }
          visible = Math.min(visible + CHARACTERS_PER_TICK, fullText.length);
          setText(fullText.slice(0, visible));
          if (visible === fullText.length) {
            clearInterval(interval);
            activeRef.current = false;
            setText("");
            setPhase("idle");
            onComplete();
          }
        }, TYPING_TICK_MS);

        // Store abort handle so cancelTyping can clear the interval too
        abortControllerRef.current = {
          abort: () => clearInterval(interval),
          signal: new AbortController().signal,
        } as unknown as AbortController;
      }, THINKING_DELAY_MS);

      abortControllerRef.current = {
        abort: () => clearTimeout(thinkingTimeout),
        signal: new AbortController().signal,
      } as unknown as AbortController;
    },
    [clearStream],
  );

  const cancelTyping = useCallback(() => {
    clearStream();
    setText("");
    setPhase("idle");
  }, [clearStream]);

  useEffect(() => () => clearStream(), [clearStream]);

  return { text, phase, startTyping, startStream, cancelTyping };
}