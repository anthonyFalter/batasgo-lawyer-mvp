"use client";

import Image from "next/image";
import Link from "next/link";
import logo from "../../../assets/batasgo_logo.png";
import "./initial-loading-screen.css";

export default function HomePage() {
  return (
    <main className="launch-screen">
      <div className="launch-screen-content">
        <Image
          className="launch-screen-logo"
          src={logo}
          alt="BatasGO"
          priority
          sizes="(max-width: 600px) 78vw, 420px"
        />
        <p className="launch-screen-notice">
          Lawyer workspace preview. Features are not yet final.
        </p>
        <Link className="launch-screen-proceed" href="/dashboard">
          Sign in to workspace
        </Link>
      </div>
    </main>
  );
}
