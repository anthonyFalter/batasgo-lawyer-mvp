"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import logo from "../../../assets/batasgo_logo.png";
import "./initial-loading-screen.css";

export default function HomePage() {
  const router = useRouter();

  useEffect(() => {
    router.prefetch("/dashboard");

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const redirectTimeout = window.setTimeout(
      () => router.replace("/dashboard"),
      reducedMotion ? 120 : 720,
    );

    return () => window.clearTimeout(redirectTimeout);
  }, [router]);

  return (
    <main className="launch-screen" aria-busy="true">
      <div className="launch-screen-content">
        <Image
          className="launch-screen-logo"
          src={logo}
          alt="BatasGO"
          priority
          sizes="(max-width: 600px) 78vw, 420px"
        />
        <p className="launch-screen-status" role="status">Opening your workspace</p>
        <div className="launch-screen-progress" aria-hidden="true">
          <span />
        </div>
        <Link className="launch-screen-skip" href="/dashboard">
          Continue to workspace
        </Link>
      </div>
    </main>
  );
}
