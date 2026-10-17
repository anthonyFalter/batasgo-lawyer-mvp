"use client";

import { useEffect, useRef, useState } from "react";

export type TypingPhase = "idle" | "thinking" | "typing";

const THINKING_DELAY_MS = 260;
const TYPING_TICK_MS = 20;
const CHARACTERS_PER_TICK = 4;

export function useTypingStream() {
  const [text, setText] = useState("");
  const [phase, setPhase] = useState<TypingPhase>("idle");
  const thinkingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const typingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearTimers = () => {
    if (thinkingTimeoutRef.current) {
      clearTimeout(thinkingTimeoutRef.current);
      thinkingTimeoutRef.current = null;
    }
    if (typingIntervalRef.current) {
      clearInterval(typingIntervalRef.current);
      typingIntervalRef.current = null;
    }
  };

  const startTyping = (fullText: string, onComplete: () => void) => {
    clearTimers();
    setText("");
    setPhase("thinking");

    thinkingTimeoutRef.current = setTimeout(() => {
      thinkingTimeoutRef.current = null;
      setPhase("typing");
      let visibleCharacters = 0;

      typingIntervalRef.current = setInterval(() => {
        visibleCharacters = Math.min(visibleCharacters + CHARACTERS_PER_TICK, fullText.length);
        setText(fullText.slice(0, visibleCharacters));

        if (visibleCharacters === fullText.length) {
          clearTimers();
          setText("");
          setPhase("idle");
          onComplete();
        }
      }, TYPING_TICK_MS);
    }, THINKING_DELAY_MS);
  };

  const cancelTyping = () => {
    clearTimers();
    setText("");
    setPhase("idle");
  };

  useEffect(() => clearTimers, []);

  return { text, phase, startTyping, cancelTyping };
}