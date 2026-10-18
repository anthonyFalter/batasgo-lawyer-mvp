"use client";

import { Check, ChevronDown, Plus, RotateCcw, Sparkles, Trash2, X } from "lucide-react";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import WorkspaceShell from "../workspace/workspace-shell";
import "./tasks-workspace.css";

type TaskPriority = "high" | "medium" | "low";
type TaskView = "all" | "open" | "overdue" | "completed";
type TaskSort = "due-date" | "priority";

type Task = {
  id: string;
  title: string;
  matter: string;
  priority: TaskPriority;
  dueDate: string | null;
  completed: boolean;
  source: "manual" | "ai";
  intakeId: string | null;
};

type IntakeForTaskAutomation = {
  id: string;
  reference: string;
  client: string;
  domain: string;
  risk: string;
  summary: string;
  deadlineAt: string | null;
  status: "pending" | "accepted" | "declined";
  isSample: boolean;
};

const priorityOrder: Record<TaskPriority, number> = {
  high: 0,
  medium: 1,
  low: 2,
};

const priorityLabels: Record<TaskPriority, string> = {
  high: "High",
  medium: "Medium",
  low: "Low",
};

const taskViews: { id: TaskView; label: string }[] = [
  { id: "all", label: "All tasks" },
  { id: "open", label: "Open" },
  { id: "overdue", label: "Overdue" },
  { id: "completed", label: "Completed" },
];

function isTaskPriority(value: string): value is TaskPriority {
  return value === "high" || value === "medium" || value === "low";
}

function isTaskSort(value: string): value is TaskSort {
  return value === "due-date" || value === "priority";
}

function dateToInputValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function localDate(dateString: string) {
  const [year, month, day] = dateString.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function getDayOffset(dateString: string, today: Date) {
  const dueDate = localDate(dateString);
  const dueUtc = Date.UTC(dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate());
  const todayUtc = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((dueUtc - todayUtc) / 86_400_000);
}

function formatDueDate(dateString: string | null, today: Date) {
  if (!dateString) return "No due date";
  const offset = getDayOffset(dateString, today);
  if (offset < 0) return `${Math.abs(offset)} ${Math.abs(offset) === 1 ? "day" : "days"} overdue`;
  if (offset === 0) return "Today";
  if (offset === 1) return "Tomorrow";

  return new Intl.DateTimeFormat("en-PH", { month: "short", day: "numeric" }).format(localDate(dateString));
}

async function getTaskApiError(response: Response, fallback: string) {
  const payload = await response.json().catch(() => null) as { error?: string } | null;
  return payload?.error || fallback;
}

function mergeTasks(current: Task[], incoming: Task[]) {
  const incomingIds = new Set(incoming.map((task) => task.id));
  return [...incoming, ...current.filter((task) => !incomingIds.has(task.id))];
}

export default function TasksWorkspace() {
  const [today] = useState(() => new Date());
  const [tasks, setTasks] = useState<Task[]>([]);
  const [intakeOptions, setIntakeOptions] = useState<IntakeForTaskAutomation[]>([]);
  const [selectedIntakeIds, setSelectedIntakeIds] = useState<Set<string>>(new Set());
  const [isLoadingTasks, setIsLoadingTasks] = useState(true);
  const [isLoadingIntakes, setIsLoadingIntakes] = useState(false);
  const [search, setSearch] = useState("");
  const [activeView, setActiveView] = useState<TaskView>("all");
  const [priorityFilter, setPriorityFilter] = useState<TaskPriority | "all">("all");
  const [sortBy, setSortBy] = useState<TaskSort>("due-date");
  const [isCreating, setIsCreating] = useState(false);
  const [isImportingIntakes, setIsImportingIntakes] = useState(false);
  const [isGeneratingTasks, setIsGeneratingTasks] = useState(false);
  const [aiConsent, setAiConsent] = useState(false);
  const [maskIdentifiers, setMaskIdentifiers] = useState(true);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftMatter, setDraftMatter] = useState("");
  const [draftPriority, setDraftPriority] = useState<TaskPriority>("medium");
  const [draftDueDate, setDraftDueDate] = useState(() => dateToInputValue(today));
  const [isSavingTask, setIsSavingTask] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const [toast, setToast] = useState("");
  const titleInputRef = useRef<HTMLInputElement>(null);
  const nextTaskId = useRef(0);
  const taskMutationVersion = useRef(0);

  useEffect(() => {
    if (isCreating) titleInputRef.current?.focus();
  }, [isCreating]);

  useEffect(() => {
    let isCurrent = true;

    const loadTasks = async () => {
      const requestVersion = taskMutationVersion.current;
      try {
        const response = await fetch("/api/tasks", { cache: "no-store" });
        if (!response.ok) throw new Error(await getTaskApiError(response, "Unable to load tasks."));
        const payload = await response.json() as { tasks?: Task[] };
        if (isCurrent && requestVersion === taskMutationVersion.current) {
          setTasks(Array.isArray(payload.tasks) ? payload.tasks : []);
        }
      } catch (error) {
        if (isCurrent && requestVersion === taskMutationVersion.current) {
          setToast(error instanceof Error ? error.message : "Unable to load tasks right now.");
        }
      } finally {
        if (isCurrent) setIsLoadingTasks(false);
      }
    };

    void loadTasks();
    return () => { isCurrent = false; };
  }, []);

  const counts = useMemo(() => {
    const openTasks = tasks.filter((task) => !task.completed);
    return {
      all: tasks.length,
      open: openTasks.length,
      overdue: openTasks.filter((task) => task.dueDate !== null && getDayOffset(task.dueDate, today) < 0).length,
      completed: tasks.length - openTasks.length,
    };
  }, [tasks, today]);

  const visibleTasks = useMemo(() => {
    const query = search.trim().toLowerCase();
    return tasks
      .filter((task) => {
        if (activeView === "open" && task.completed) return false;
        if (activeView === "overdue" && (task.completed || !task.dueDate || getDayOffset(task.dueDate, today) >= 0)) return false;
        if (activeView === "completed" && !task.completed) return false;
        if (priorityFilter !== "all" && task.priority !== priorityFilter) return false;
        return !query || `${task.title} ${task.matter} ${priorityLabels[task.priority]}`.toLowerCase().includes(query);
      })
      .sort((a, b) => {
        if (a.completed !== b.completed) return a.completed ? 1 : -1;
        if (sortBy === "priority" && priorityOrder[a.priority] !== priorityOrder[b.priority]) {
          return priorityOrder[a.priority] - priorityOrder[b.priority];
        }
        return (a.dueDate ?? "9999-12-31").localeCompare(b.dueDate ?? "9999-12-31")
          || priorityOrder[a.priority] - priorityOrder[b.priority];
      });
  }, [activeView, priorityFilter, search, sortBy, tasks, today]);

  const toggleTask = async (task: Task) => {
    const completed = !task.completed;
    try {
      const response = await fetch(`/api/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ completed }),
      });
      if (!response.ok) throw new Error(await getTaskApiError(response, "Unable to update this task."));
      const payload = await response.json() as { task?: Task };
      if (!payload.task) throw new Error("The task service did not return the updated task.");
      taskMutationVersion.current += 1;
      setTasks((current) => current.map((item) => item.id === payload.task?.id ? payload.task : item));
      setAnnouncement(`${task.title} marked ${completed ? "complete" : "open"}.`);
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Unable to update this task.");
    }
  };

  const deleteTask = async (task: Task) => {
    try {
      const response = await fetch(`/api/tasks/${task.id}`, { method: "DELETE" });
      if (!response.ok) throw new Error(await getTaskApiError(response, "Unable to delete this task."));
      taskMutationVersion.current += 1;
      setTasks((current) => current.filter((item) => item.id !== task.id));
      setAnnouncement(`${task.title} deleted.`);
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Unable to delete this task.");
    }
  };

  const resetDraft = () => {
    setDraftTitle("");
    setDraftMatter("");
    setDraftPriority("medium");
    setDraftDueDate(dateToInputValue(today));
  };

  const addTask = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const title = draftTitle.trim();
    if (!title || !draftDueDate) return;

    setIsSavingTask(true);
    try {
      const response = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          matter: draftMatter.trim(),
          priority: draftPriority,
          dueDate: draftDueDate,
        }),
      });
      if (!response.ok) throw new Error(await getTaskApiError(response, "Unable to add this task."));
      const payload = await response.json() as { task?: Task };
      if (!payload.task) throw new Error("The task service did not return the saved task.");
      taskMutationVersion.current += 1;
      setTasks((current) => mergeTasks(current, [payload.task!]));
      setActiveView("open");
      setPriorityFilter("all");
      setSearch("");
      setSortBy("due-date");
      setIsCreating(false);
      resetDraft();
      setAnnouncement(`${title} added to tasks.`);
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Unable to add this task.");
    } finally {
      setIsSavingTask(false);
    }
  };

  const toggleCreateForm = () => {
    if (isCreating) {
      setIsCreating(false);
      resetDraft();
      return;
    }
    setDraftDueDate(dateToInputValue(today));
    setIsCreating(true);
  };

  const openIntakeAutomation = async () => {
    setIsImportingIntakes(true);
    setAiConsent(false);
    setSelectedIntakeIds(new Set());
    setIsLoadingIntakes(true);
    try {
      const response = await fetch("/api/intakes", { cache: "no-store" });
      if (!response.ok) throw new Error(await getTaskApiError(response, "Unable to load active intakes."));
      const payload = await response.json() as { intakes?: IntakeForTaskAutomation[] };
      setIntakeOptions((payload.intakes ?? []).filter((intake) => intake.status === "pending" || intake.status === "accepted"));
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Unable to load active intakes.");
    } finally {
      setIsLoadingIntakes(false);
    }
  };

  const closeIntakeAutomation = () => {
    setIsImportingIntakes(false);
    setSelectedIntakeIds(new Set());
    setAiConsent(false);
  };

  const toggleSelectedIntake = (intakeId: string) => {
    setSelectedIntakeIds((current) => {
      const next = new Set(current);
      if (next.has(intakeId)) {
        next.delete(intakeId);
      } else if (next.size < 5) {
        next.add(intakeId);
      } else {
        setToast("Choose no more than five intakes at a time.");
      }
      return next;
    });
  };

  const generateTasksFromIntakes = async () => {
    if (!aiConsent || selectedIntakeIds.size === 0 || isGeneratingTasks) return;
    setIsGeneratingTasks(true);
    try {
      const response = await fetch("/api/tasks/automate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          intakeIds: [...selectedIntakeIds],
          aiConsent,
          maskIdentifiers,
        }),
      });
      if (!response.ok) throw new Error(await getTaskApiError(response, "Unable to generate tasks."));
      const payload = await response.json() as {
        tasks?: Task[];
        skippedIntakeReferences?: string[];
      };
      const generatedTasks = payload.tasks ?? [];
      taskMutationVersion.current += 1;
      setTasks((current) => mergeTasks(current, generatedTasks));
      setActiveView("all");
      setPriorityFilter("all");
      setSearch("");
      setSortBy("due-date");
      closeIntakeAutomation();
      setAnnouncement(`${generatedTasks.length} tasks generated from selected intakes.`);
      const skippedCount = payload.skippedIntakeReferences?.length ?? 0;
      setToast(skippedCount
        ? `${generatedTasks.length} tasks generated; ${skippedCount} intake already had AI tasks.`
        : `${generatedTasks.length} BatasBot tasks generated.`);
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Unable to generate tasks.");
    } finally {
      setIsGeneratingTasks(false);
    }
  };

  const clearFilters = () => {
    setActiveView("all");
    setPriorityFilter("all");
    setSearch("");
  };

  return (
    <WorkspaceShell
      activePage="Tasks"
      search={search}
      onSearchChange={setSearch}
      onUnavailable={(label) => setToast(label === "Document Assembly"
        ? "This feature is not currently part of the MVP."
        : `${label} is not available yet.`)}
      searchPlaceholder="Search tasks and matters..."
      searchLabel="Search tasks and matters"
    >
      <main className="dashboard tasks-page">
        <div className="dashboard-heading">
          <h1>Tasks</h1>
          <div className="tasks-page-actions">
            <button
              className="task-ai-trigger"
              type="button"
              onClick={() => void openIntakeAutomation()}
              aria-expanded={isImportingIntakes}
            >
              <Sparkles aria-hidden="true" size={10.72} />
              Generate from intakes
            </button>
            <button className="new-intake-button task-create-trigger" type="button" onClick={toggleCreateForm} aria-expanded={isCreating}>
              {isCreating ? <Check aria-hidden="true" size={10.05} /> : <Plus aria-hidden="true" size={10.72} />}
              {isCreating ? "Close form" : "New task"}
            </button>
          </div>
        </div>

        <section className="task-ledger" aria-label="Task ledger">
          <div className="task-ledger-toolbar">
            <div className="task-view-filters" role="group" aria-label="Filter tasks by status">
              {taskViews.map(({ id, label }) => (
                <button
                  className={`task-view-filter${activeView === id ? " task-view-filter--active" : ""}`}
                  type="button"
                  key={id}
                  aria-pressed={activeView === id}
                  onClick={() => setActiveView(id)}
                >
                  {label}<span>{counts[id]}</span>
                </button>
              ))}
            </div>
            <div className="task-ledger-controls">
              <label className="task-select-wrap">
                <span className="sr-only">Filter by priority</span>
                <select
                  value={priorityFilter}
                  onChange={(event) => {
                    const value = event.target.value;
                    setPriorityFilter(value === "all" || isTaskPriority(value) ? value : "all");
                  }}
                >
                  <option value="all">Any priority</option>
                  <option value="high">High priority</option>
                  <option value="medium">Medium priority</option>
                  <option value="low">Low priority</option>
                </select>
                <ChevronDown aria-hidden="true" size={9.38} />
              </label>
              <label className="task-select-wrap task-sort-select">
                <span className="sr-only">Sort tasks</span>
                <select value={sortBy} onChange={(event) => {
                  if (isTaskSort(event.target.value)) setSortBy(event.target.value);
                }}>
                  <option value="due-date">Due date</option>
                  <option value="priority">Priority</option>
                </select>
                <ChevronDown aria-hidden="true" size={9.38} />
              </label>
            </div>
          </div>

          {isImportingIntakes && (
            <section className="task-ai-import" aria-label="Generate tasks from active intakes">
              <div className="task-ai-import-heading">
                <div>
                  <h2>Generate tasks from intakes</h2>
                  <p>Select up to five pending or accepted intakes. Generated tasks are saved automatically.</p>
                </div>
                <button className="task-ai-close" type="button" aria-label="Close intake task generator" onClick={closeIntakeAutomation}>
                  <X aria-hidden="true" size={12.06} />
                </button>
              </div>

              {isLoadingIntakes ? (
                <p className="task-ai-loading" role="status">Loading active intakes…</p>
              ) : intakeOptions.length > 0 ? (
                <div className="task-ai-intake-list">
                  {intakeOptions.map((intake) => {
                    const alreadyGenerated = tasks.some((task) => task.source === "ai" && task.intakeId === intake.id);
                    return (
                      <label className={`task-ai-intake-option${alreadyGenerated ? " is-processed" : ""}`} key={intake.id}>
                        <input
                          type="checkbox"
                          checked={selectedIntakeIds.has(intake.id)}
                          disabled={alreadyGenerated}
                          onChange={() => toggleSelectedIntake(intake.id)}
                        />
                        <span className="task-ai-intake-copy">
                          <span className="task-ai-intake-title">
                            <strong>{intake.client}</strong>
                            <small>{intake.status === "accepted" ? "Accepted" : "Pending"}</small>
                            {intake.isSample && <small>Sample</small>}
                            {alreadyGenerated && <small>Tasks generated</small>}
                          </span>
                          <span className="task-ai-intake-meta">{intake.reference} · {intake.domain} · {intake.risk} risk</span>
                          <span className="task-ai-intake-summary">{intake.summary}</span>
                        </span>
                      </label>
                    );
                  })}
                </div>
              ) : (
                <p className="task-ai-loading">No pending or accepted intakes available.</p>
              )}

              <div className="task-ai-privacy-options">
                <label className="task-ai-consent">
                  <input type="checkbox" checked={aiConsent} onChange={(event) => setAiConsent(event.target.checked)} />
                  <span>I consent to sending selected intake details to BatasBot to generate tasks.</span>
                </label>
                <label className="task-ai-consent">
                  <input type="checkbox" checked={maskIdentifiers} onChange={(event) => setMaskIdentifiers(event.target.checked)} />
                  <span>Mask client identifiers before sending</span>
                </label>
                <button
                  className="task-ai-generate"
                  type="button"
                  disabled={!aiConsent || selectedIntakeIds.size === 0 || isGeneratingTasks || isLoadingIntakes}
                  onClick={() => void generateTasksFromIntakes()}
                >
                  <Sparkles aria-hidden="true" size={10.72} />
                  {isGeneratingTasks ? "Generating tasks…" : `Generate ${selectedIntakeIds.size || ""} tasks`}
                </button>
              </div>
            </section>
          )}

          {isCreating && (
            <form className="task-create-form" onSubmit={addTask}>
              <label className="task-create-title">
                <span>Task</span>
                <input
                  ref={titleInputRef}
                  type="text"
                  value={draftTitle}
                  onChange={(event) => setDraftTitle(event.target.value)}
                  placeholder="What needs to be done?"
                  maxLength={120}
                  required
                />
              </label>
              <label className="task-create-matter">
                <span>Matter <em>Optional</em></span>
                <input
                  type="text"
                  value={draftMatter}
                  onChange={(event) => setDraftMatter(event.target.value)}
                  placeholder="Link a case or client"
                  maxLength={100}
                />
              </label>
              <label>
                <span>Due date</span>
                <input type="date" value={draftDueDate} onChange={(event) => setDraftDueDate(event.target.value)} required />
              </label>
              <label>
                <span>Priority</span>
                <select value={draftPriority} onChange={(event) => {
                  if (isTaskPriority(event.target.value)) setDraftPriority(event.target.value);
                }}>
                  <option value="high">High</option>
                  <option value="medium">Medium</option>
                  <option value="low">Low</option>
                </select>
              </label>
              <div className="task-create-actions">
                <button className="task-cancel-button" type="button" onClick={toggleCreateForm}>Cancel</button>
                <button className="task-save-button" type="submit" disabled={!draftTitle.trim() || isSavingTask}>
                  {isSavingTask ? "Saving…" : "Add task"}
                </button>
              </div>
            </form>
          )}

          <div className="task-table-heading" aria-hidden="true">
            <span className="task-heading-action">Task and matter</span>
            <span>Priority</span>
            <span>Due date</span>
            <span>Status</span>
            <span>Actions</span>
          </div>

          {isLoadingTasks ? (
            <div className="task-empty-state" role="status">Loading tasks…</div>
          ) : visibleTasks.length > 0 ? (
            <ul className="task-list">
              {visibleTasks.map((task) => {
                const offset = task.dueDate ? getDayOffset(task.dueDate, today) : 0;
                  const overdue = !task.completed && task.dueDate !== null && offset < 0;
                return (
                  <li className={`task-row${task.completed ? " task-row--completed" : ""}`} key={task.id}>
                    <div className="task-main">
                      <input
                        className="task-completion"
                        type="checkbox"
                        checked={task.completed}
                        onChange={() => void toggleTask(task)}
                        aria-label={`${task.completed ? "Reopen" : "Mark"} task: ${task.title}`}
                      />
                      <div className="task-description">
                        <strong>{task.title}</strong>
                        <span>{task.matter || "No matter linked"}</span>
                      </div>
                    </div>
                    <span className={`task-priority task-priority--${task.priority}`}>{priorityLabels[task.priority]}</span>
                    <time className={`task-due-date${overdue ? " task-due-date--overdue" : ""}`} dateTime={task.dueDate ?? undefined}>
                      {formatDueDate(task.dueDate, today)}
                    </time>
                    <span className={`task-status${task.completed ? " task-status--completed" : ""}`}>
                      {task.completed ? <><Check aria-hidden="true" size={8.71} />Complete</> : "Open"}
                    </span>
                    <button
                      className="task-delete-button"
                      type="button"
                      aria-label={`Delete task: ${task.title}`}
                      onClick={() => void deleteTask(task)}
                    >
                      <Trash2 aria-hidden="true" size={10.05} />
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="task-empty-state" role="status">
              <span className="task-empty-mark"><RotateCcw aria-hidden="true" size={12.06} /></span>
              <h2>{search.trim() ? "No matching tasks" : "No tasks in this view"}</h2>
              <p>{search.trim()
                ? "Try a different search or clear the current filters."
                : tasks.length === 0
                  ? "Create a task to start tracking work in this workspace."
                  : "Change the status or priority filter to see other tasks."}</p>
              <button type="button" onClick={clearFilters}>Clear filters</button>
            </div>
          )}
        </section>
        <p className="sr-only" aria-live="polite">{announcement}</p>
      </main>
      {toast && (
        <div className="toast" role="status">
          <span className="toast-check"><Check size={10.72} /></span>
          <span>{toast}</span>
          <button className="toast-close" type="button" aria-label="Dismiss notification" onClick={() => setToast("")}>
            <X size={10.72} />
          </button>
        </div>
      )}
    </WorkspaceShell>
  );
}
