"use client";

import { FilePenLine } from "lucide-react";
import { useState } from "react";
import WorkspaceShell from "../workspace/workspace-shell";
import "./document-assembly-workspace.css";

export default function DocumentAssemblyUnavailable() {
  const [search, setSearch] = useState("");

  return (
    <WorkspaceShell
      activePage="Document Assembly"
      search={search}
      onSearchChange={setSearch}
      onUnavailable={() => undefined}
      compactNavigation
    >
      <main className="document-assembly-unavailable" aria-labelledby="document-assembly-unavailable-title">
        <section className="document-assembly-unavailable-card">
          <span className="document-assembly-unavailable-icon" aria-hidden="true">
            <FilePenLine size={22} />
          </span>
          <h1 id="document-assembly-unavailable-title">Document Assembly is not currently part of the MVP</h1>
          <p>
            This feature is planned for a future release. Matter review, BatasBot, tasks, messages, and calendar workflows remain available.
          </p>
        </section>
      </main>
    </WorkspaceShell>
  );
}
