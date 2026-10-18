"use client";

import { useEffect, useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import gsap from "gsap";
import logo from "../../../assets/batasgo_logo.png";
import "./initial-loading-screen.css";

export default function HomePage() {
  const logoRef = useRef<HTMLImageElement>(null);
  const noticeRef = useRef<HTMLParagraphElement>(null);
  const proceedRef = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    const motion = gsap.matchMedia();

    motion.add("(prefers-reduced-motion: no-preference)", () => {
      const entrance = gsap.timeline();

      entrance
        .fromTo(
          logoRef.current,
          { clipPath: "inset(0 100% 0 0)", filter: "blur(5px)" },
          {
            clipPath: "inset(0 0% 0 0)",
            filter: "blur(0px)",
            duration: 0.72,
            ease: "power3.out",
          },
        )
        .fromTo(
          noticeRef.current,
          { opacity: 0, y: 8, filter: "blur(3px)" },
          {
            opacity: 1,
            y: 0,
            filter: "blur(0px)",
            duration: 0.38,
            ease: "power2.out",
          },
          "-=0.28",
        )
        .fromTo(
          proceedRef.current,
          { opacity: 0, y: 6 },
          { opacity: 1, y: 0, duration: 0.34, ease: "power2.out" },
          "-=0.2",
        );
    });

    return () => motion.revert();
  }, []);

  return (
    <main className="launch-screen">
      <div className="launch-screen-content">
        <Image
          ref={logoRef}
          className="launch-screen-logo"
          src={logo}
          alt="BatasGO"
          priority
          sizes="(max-width: 600px) 78vw, 420px"
        />
        <p ref={noticeRef} className="launch-screen-notice">
          Lawyer workspace preview. Features are not yet final.
        </p>
        <Link
          ref={proceedRef}
          className="launch-screen-proceed"
          href="/dashboard"
        >
          Sign in to workspace
        </Link>
      </div>
    </main>
  );
}
